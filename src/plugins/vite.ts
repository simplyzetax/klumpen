import { existsSync, readFileSync, readdirSync, unlinkSync, statSync, writeFileSync, mkdirSync } from "fs"
import { join, resolve, basename } from "path"
import { exec } from "child_process"
import { promisify } from "util"
import type { BundlerPlugin } from "./plugin.ts"
import type { DetectedTarget, BundleResult, ModuleInfo } from "../types.ts"
import { groupModulesByPackage } from "../analysis/analyze.ts"

const execAsync = promisify(exec)
const BUILD_TIMEOUT = 120_000 // vite builds can be slower

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
    const timestamp = Date.now()
    const statsFile = join(cwd, `.klumpen-stats-${timestamp}.json`)

    // Inject a Rollup plugin via a wrapper vite config that captures module info
    const wrapperConfig = join(cwd, `.klumpen-vite-config-${timestamp}.ts`)
    const originalConfig = target.configPath

    writeFileSync(wrapperConfig, `
import { defineConfig, mergeConfig } from "vite"
import baseConfigModule from "./${basename(originalConfig)}"
import { writeFileSync } from "fs"

// Handle both default exports and named exports
const baseConfig = baseConfigModule.default ?? baseConfigModule

const klumpenPlugin = {
  name: "klumpen-stats",
  generateBundle(_options: any, bundle: any) {
    const stats: any = { chunks: [] }

    for (const [fileName, chunk] of Object.entries(bundle) as any) {
      if (chunk.type !== "chunk") continue

      const modules: any[] = []
      for (const [modId, modInfo] of Object.entries(chunk.modules) as any) {
        if (modId.startsWith("\\0")) continue
        modules.push({
          id: modId,
          renderedLength: modInfo.renderedLength,
          originalLength: modInfo.originalLength,
        })
      }

      stats.chunks.push({
        fileName,
        code: chunk.code?.length ?? 0,
        modules,
        imports: chunk.imports ?? [],
        dynamicImports: chunk.dynamicImports ?? [],
      })
    }

    writeFileSync(${JSON.stringify(statsFile)}, JSON.stringify(stats))
  },
}

export default mergeConfig(typeof baseConfig === "function" ? baseConfig({ mode: "production", command: "build" }) : (baseConfig ?? {}), defineConfig({
  plugins: [klumpenPlugin],
}))
`)

    const viteBin = findViteBin(cwd)

    try {
      await execAsync(
        `${viteBin} build --config ${basename(wrapperConfig)} --mode production`,
        { cwd, timeout: BUILD_TIMEOUT },
      )
    } catch {
      // Build may fail but stats might still have been written
    }

    // Cleanup wrapper config
    try { unlinkSync(wrapperConfig) } catch {}

    // Parse the stats
    if (existsSync(statsFile)) {
      try {
        const stats = JSON.parse(readFileSync(statsFile, "utf-8"))
        const result = parseChunkStats(stats, target.name, cwd)
        unlinkSync(statsFile)
        return { ...result, entry: target.entry }
      } catch {
        try { unlinkSync(statsFile) } catch {}
      }
    }

    // Fallback: scan dist/ output files (less useful but better than nothing)
    return { ...fallbackDistScan(cwd, target.name), entry: target.entry }
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

function parseChunkStats(stats: any, targetName: string, cwd: string): BundleResult {
  const modules: ModuleInfo[] = []
  const edges: Record<string, string[]> = {}
  let outputBytes = 0

  for (const chunk of stats.chunks ?? []) {
    outputBytes += chunk.code ?? 0

    for (const mod of chunk.modules ?? []) {
      // Normalize the module path relative to cwd
      let modPath = mod.id ?? "unknown"

      // Strip Vite's query params (?v=xxx, ?used, etc.)
      modPath = modPath.replace(/\?.*$/, "")

      // Make path relative
      if (modPath.startsWith(cwd)) {
        modPath = modPath.slice(cwd.length + 1)
      }
      // Handle /absolute/path/to/node_modules/...
      if (modPath.startsWith("/") && modPath.includes("node_modules/")) {
        modPath = modPath.slice(modPath.indexOf("node_modules/"))
      }

      modules.push({
        path: modPath,
        bytes: mod.renderedLength ?? mod.originalLength ?? 0,
        isNodeModule: modPath.includes("node_modules/"),
      })
    }

    // Build import graph from chunk imports
    for (const imp of chunk.imports ?? []) {
      if (!edges[imp]) edges[imp] = []
      edges[imp]!.push(chunk.fileName)
    }
  }

  // Deduplicate modules (same module can appear in multiple chunks)
  const deduped = new Map<string, ModuleInfo>()
  for (const mod of modules) {
    const existing = deduped.get(mod.path)
    if (!existing || mod.bytes > existing.bytes) {
      deduped.set(mod.path, mod)
    }
  }
  const uniqueModules = Array.from(deduped.values()).sort((a, b) => b.bytes - a.bytes)

  const inputBytes = uniqueModules.reduce((sum, m) => sum + m.bytes, 0)

  return {
    target: targetName,
    bundler: "vite",
    outputBytes,
    inputBytes,
    modules: uniqueModules,
    packages: groupModulesByPackage(uniqueModules),
    importGraph: { edges },
  }
}

function fallbackDistScan(cwd: string, targetName: string): BundleResult {
  const distDir = join(cwd, "dist")
  const modules: ModuleInfo[] = []
  let outputBytes = 0

  if (existsSync(distDir)) {
    walkDir(distDir, (filePath, relativePath) => {
      // Skip non-code files for cleaner results
      if (!/\.(js|mjs|css)$/.test(relativePath)) return
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
