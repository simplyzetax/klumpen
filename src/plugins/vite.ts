import { existsSync, readFileSync, readdirSync, unlinkSync, statSync } from "fs"
import { join, resolve, basename } from "path"
import { execSync } from "child_process"
import type { BundlerPlugin } from "./plugin.ts"
import type { DetectedTarget, BundleResult, ModuleInfo } from "../types.ts"
import { groupModulesByPackage } from "../analysis/analyze.ts"

export const vitePlugin: BundlerPlugin = {
  name: "vite",

  detect(cwd: string): DetectedTarget[] {
    const targets: DetectedTarget[] = []

    try {
      const files = readdirSync(cwd)
      for (const file of files) {
        if (file.match(/^vite\.config\.(ts|js|mjs|cjs)$/)) {
          targets.push({
            name: basename(cwd),
            bundler: "vite",
            configPath: join(cwd, file),
          })
        }
      }
    } catch {}

    // Check monorepo
    for (const dir of ["apps", "packages"]) {
      const dirPath = join(cwd, dir)
      if (!existsSync(dirPath)) continue
      try {
        const subdirs = readdirSync(dirPath)
        for (const sub of subdirs) {
          const subPath = join(dirPath, sub)
          try {
            if (!statSync(subPath).isDirectory()) continue
          } catch { continue }
          const subTargets = vitePlugin.detect(subPath)
          for (const t of subTargets) {
            t.name = `${dir}/${sub}`
          }
          targets.push(...subTargets)
        }
      } catch {}
    }

    return targets
  },

  async analyze(target: DetectedTarget): Promise<BundleResult> {
    const cwd = resolve(target.configPath, "..")
    const statsFile = join(cwd, `.klumpen-stats-${Date.now()}.json`)

    const viteBin = findViteBin(cwd)

    try {
      execSync(
        `${viteBin} build --mode production 2>&1`,
        {
          stdio: "pipe",
          cwd,
          env: {
            ...process.env,
            KLUMPEN_STATS_FILE: statsFile,
          },
        },
      )
    } catch {}

    const result = parseViteBuildOutput(cwd, target.name)

    try { unlinkSync(statsFile) } catch {}

    return result
  },
}

function findViteBin(cwd: string): string {
  const candidates = [
    join(cwd, "node_modules/.bin/vite"),
    join(cwd, "../../node_modules/.bin/vite"),
    join(cwd, "../../../node_modules/.bin/vite"),
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) return resolve(candidate)
  }

  return "vite"
}

function parseViteBuildOutput(cwd: string, targetName: string): BundleResult {
  const distDir = join(cwd, "dist")
  const modules: ModuleInfo[] = []
  let outputBytes = 0

  if (existsSync(distDir)) {
    walkDir(distDir, (filePath, relativePath) => {
      try {
        const stat = statSync(filePath)
        outputBytes += stat.size
        modules.push({
          path: relativePath,
          bytes: stat.size,
          isNodeModule: false,
        })
      } catch {}
    })
  }

  // Try to read Rollup stats if available
  const statsPath = join(cwd, "stats.json")
  if (existsSync(statsPath)) {
    try {
      const stats = JSON.parse(readFileSync(statsPath, "utf-8"))
      return parseRollupStats(stats, targetName)
    } catch {}
  }

  return {
    target: targetName,
    bundler: "vite",
    outputBytes,
    inputBytes: outputBytes,
    modules: modules.sort((a, b) => b.bytes - a.bytes),
    packages: groupModulesByPackage(modules),
    importGraph: { edges: {} },
  }
}

function parseRollupStats(stats: any, targetName: string): BundleResult {
  const modules: ModuleInfo[] = []

  if (stats.modules) {
    for (const mod of stats.modules) {
      modules.push({
        path: mod.id ?? mod.name ?? "unknown",
        bytes: mod.renderedLength ?? mod.size ?? 0,
        isNodeModule: (mod.id ?? "").includes("node_modules/"),
      })
    }
  }

  const inputBytes = modules.reduce((sum, m) => sum + m.bytes, 0)

  return {
    target: targetName,
    bundler: "vite",
    outputBytes: inputBytes,
    inputBytes,
    modules: modules.sort((a, b) => b.bytes - a.bytes),
    packages: groupModulesByPackage(modules),
    importGraph: { edges: {} },
  }
}

function walkDir(dir: string, callback: (filePath: string, relativePath: string) => void, prefix = "") {
  try {
    const entries = readdirSync(dir)
    for (const entry of entries) {
      const fullPath = join(dir, entry)
      const relPath = prefix ? `${prefix}/${entry}` : entry
      try {
        const stat = statSync(fullPath)
        if (stat.isDirectory()) {
          walkDir(fullPath, callback, relPath)
        } else {
          callback(fullPath, relPath)
        }
      } catch {}
    }
  } catch {}
}
