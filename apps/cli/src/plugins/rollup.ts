import { existsSync, readFileSync, readdirSync, unlinkSync, statSync, writeFileSync } from "fs"
import { join, resolve, basename } from "path"
import { exec } from "child_process"
import { promisify } from "util"
import type { BundlerPlugin } from "./plugin.ts"
import type { DetectedTarget, BundleResult, ModuleInfo } from "@klumpen/shared"
import { groupModulesByPackage } from "../analysis/analyze.ts"

const execAsync = promisify(exec)
const BUILD_TIMEOUT = 120_000

export const rollupPlugin = {
  name: "rollup",

  detect(cwd: string): DetectedTarget[] {
    const targets: DetectedTarget[] = []

    try {
      const files = readdirSync(cwd)
      for (const file of files) {
        if (file.match(/^rollup\.config\.(ts|js|mjs|cjs)$/)) {
          targets.push({
            name: basename(cwd),
            bundler: "rollup",
            configPath: join(cwd, file),
          })
        }
      }
    } catch {}

    const pkgPath = join(cwd, "package.json")
    if (existsSync(pkgPath) && targets.length === 0) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"))
        const hasRollup =
          pkg.dependencies?.rollup ||
          pkg.devDependencies?.rollup
        const scripts = pkg.scripts ?? {}
        const hasRollupScript = Object.values(scripts).some(
          (s: any) => typeof s === "string" && s.includes("rollup"),
        )

        if (hasRollup || hasRollupScript) {
          targets.push({
            name: basename(cwd),
            bundler: "rollup",
            configPath: pkgPath,
          })
        }
      } catch {}
    }

    for (const dir of ["apps", "packages", "services"]) {
      const dirPath = join(cwd, dir)
      if (!existsSync(dirPath)) continue
      try {
        const subdirs = readdirSync(dirPath)
        for (const sub of subdirs) {
          const subPath = join(dirPath, sub)
          try {
            if (!statSync(subPath).isDirectory()) continue
          } catch { continue }
          const subTargets = rollupPlugin.detect(subPath)
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
    const statsFile = join(cwd, `.klumpen-rollup-stats-${timestamp}.json`)
    const wrapperConfig = join(cwd, `.klumpen-rollup-config-${timestamp}.mjs`)
    const originalConfig = target.configPath

    writeFileSync(wrapperConfig, `
import { writeFileSync } from "fs";
import baseConfigModule from "./${basename(originalConfig)}";

const baseConfig = baseConfigModule.default ?? baseConfigModule;

const allStats = { chunks: [] };

const klumpenPlugin = {
  name: "klumpen-stats",
  generateBundle(_options, bundle) {
    for (const [fileName, chunk] of Object.entries(bundle)) {
      if (chunk.type !== "chunk") continue;

      const modules = [];
      for (const [modId, modInfo] of Object.entries(chunk.modules)) {
        if (modId.startsWith("\\0")) continue;
        modules.push({
          id: modId,
          renderedLength: modInfo.renderedLength,
          originalLength: modInfo.originalLength,
        });
      }

      allStats.chunks.push({
        fileName,
        code: chunk.code?.length ?? 0,
        modules,
        imports: chunk.imports ?? [],
        dynamicImports: chunk.dynamicImports ?? [],
      });
    }
  },
  closeBundle() {
    writeFileSync(${JSON.stringify(statsFile)}, JSON.stringify(allStats));
  },
};

function injectPlugin(config) {
  const plugins = Array.isArray(config.plugins) ? config.plugins : [];
  return { ...config, plugins: [...plugins, klumpenPlugin] };
}

const configs = Array.isArray(baseConfig) ? baseConfig : [baseConfig];
export default configs.map(c => injectPlugin(typeof c === "function" ? c({ mode: "production" }) : c));
`)

    const rollupBin = findRollupBin(cwd)

    try {
      await execAsync(
        `${rollupBin} -c ${basename(wrapperConfig)}`,
        { cwd, timeout: BUILD_TIMEOUT, maxBuffer: 50 * 1024 * 1024 },
      )
    } catch {
      // Build may fail but stats might still have been written
    }

    try { unlinkSync(wrapperConfig) } catch {}

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

    throw new Error(`Failed to collect bundle stats for ${target.name}`)
  },
} satisfies BundlerPlugin

function findRollupBin(cwd: string): string {
  const candidates = [
    join(cwd, "node_modules/.bin/rollup"),
    join(cwd, "../../node_modules/.bin/rollup"),
    join(cwd, "../../../node_modules/.bin/rollup"),
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) return resolve(candidate)
  }

  return "rollup"
}

function parseChunkStats(stats: any, targetName: string, cwd: string): BundleResult {
  const modules: ModuleInfo[] = []
  const edges: Record<string, string[]> = {}
  let outputBytes = 0

  for (const chunk of stats.chunks ?? []) {
    outputBytes += chunk.code ?? 0

    for (const mod of chunk.modules ?? []) {
      let modPath = mod.id ?? "unknown"

      modPath = modPath.replace(/\?.*$/, "")

      if (modPath.startsWith(cwd)) {
        modPath = modPath.slice(cwd.length + 1)
      }
      if (modPath.startsWith("/") && modPath.includes("node_modules/")) {
        modPath = modPath.slice(modPath.indexOf("node_modules/"))
      }

      modules.push({
        path: modPath,
        bytes: mod.renderedLength ?? mod.originalLength ?? 0,
        isNodeModule: modPath.includes("node_modules/"),
      })
    }

    for (const imp of chunk.imports ?? []) {
      if (!edges[imp]) edges[imp] = []
      edges[imp]!.push(chunk.fileName)
    }
  }

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
    bundler: "rollup",
    outputBytes,
    inputBytes,
    modules: uniqueModules,
    packages: groupModulesByPackage(uniqueModules),
    importGraph: { edges },
  }
}
