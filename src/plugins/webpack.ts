import { existsSync, readFileSync, readdirSync, statSync } from "fs"
import { join, resolve, basename } from "path"
import { execSync } from "child_process"
import type { BundlerPlugin } from "./plugin.ts"
import type { DetectedTarget, BundleResult, ModuleInfo } from "../types.ts"
import { groupModulesByPackage } from "../analysis/analyze.ts"

export const webpackPlugin: BundlerPlugin = {
  name: "webpack",

  detect(cwd: string): DetectedTarget[] {
    const targets: DetectedTarget[] = []

    // Check for webpack.config.* files
    try {
      const files = readdirSync(cwd)
      for (const file of files) {
        if (file.match(/^webpack\.config\.(ts|js|mjs|cjs)$/)) {
          targets.push({
            name: basename(cwd),
            bundler: "webpack",
            configPath: join(cwd, file),
          })
        }
      }
    } catch {}

    // Check package.json for webpack dependency
    const pkgPath = join(cwd, "package.json")
    if (existsSync(pkgPath) && targets.length === 0) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"))
        const hasWebpack =
          pkg.dependencies?.webpack ||
          pkg.devDependencies?.webpack
        const scripts = pkg.scripts ?? {}
        const hasWebpackScript = Object.values(scripts).some(
          (s: any) => typeof s === "string" && s.includes("webpack"),
        )

        if (hasWebpack || hasWebpackScript) {
          targets.push({
            name: basename(cwd),
            bundler: "webpack",
            configPath: pkgPath,
          })
        }
      } catch {}
    }

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
          const subTargets = webpackPlugin.detect(subPath)
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
    const webpackBin = findWebpackBin(cwd)

    let statsJson: any
    try {
      const output = execSync(`${webpackBin} --json`, {
        stdio: "pipe",
        cwd,
        env: { ...process.env, NODE_ENV: "production" },
      }).toString()

      statsJson = JSON.parse(output)
    } catch (e: any) {
      const output = e.stdout?.toString() ?? ""
      try {
        statsJson = JSON.parse(output)
      } catch {
        throw new Error(`Failed to get webpack stats for ${target.name}`)
      }
    }

    return parseWebpackStats(statsJson, target.name)
  },
}

function findWebpackBin(cwd: string): string {
  const candidates = [
    join(cwd, "node_modules/.bin/webpack"),
    join(cwd, "../../node_modules/.bin/webpack"),
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) return resolve(candidate)
  }

  return "webpack"
}

function parseWebpackStats(stats: any, targetName: string): BundleResult {
  const modules: ModuleInfo[] = []

  const webpackModules = stats.modules ?? []
  for (const mod of webpackModules) {
    if (!mod.name || mod.name.startsWith("webpack/")) continue
    modules.push({
      path: mod.name.replace(/^\.\//, ""),
      bytes: mod.size ?? 0,
      isNodeModule: (mod.name ?? "").includes("node_modules/"),
    })
  }

  const inputBytes = modules.reduce((sum, m) => sum + m.bytes, 0)

  const assets = stats.assets ?? []
  const outputBytes = assets.reduce((sum: number, a: any) => sum + (a.size ?? 0), 0)

  // Build import graph from webpack reasons
  const edges: Record<string, string[]> = {}
  for (const mod of webpackModules) {
    const reasons = mod.reasons ?? []
    for (const reason of reasons) {
      if (!reason.moduleName) continue
      const targetPath = mod.name?.replace(/^\.\//, "") ?? ""
      const source = reason.moduleName.replace(/^\.\//, "")
      if (!edges[targetPath]) edges[targetPath] = []
      edges[targetPath]!.push(source)
    }
  }

  return {
    target: targetName,
    bundler: "webpack",
    outputBytes: outputBytes || inputBytes,
    inputBytes,
    modules: modules.sort((a, b) => b.bytes - a.bytes),
    packages: groupModulesByPackage(modules),
    importGraph: { edges },
  }
}
