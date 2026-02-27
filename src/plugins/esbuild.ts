import { existsSync, readFileSync, readdirSync, unlinkSync, statSync } from "fs"
import { join, resolve, basename } from "path"
import { exec } from "child_process"
import { promisify } from "util"
import type { BundlerPlugin } from "./plugin.ts"
import type { DetectedTarget, BundleResult, ModuleInfo } from "../types.ts"
import { groupModulesByPackage, buildImportGraph } from "../analysis/analyze.ts"

const execAsync = promisify(exec)
const BUILD_TIMEOUT = 60_000

export const esbuildPlugin: BundlerPlugin = {
  name: "esbuild",

  detect(cwd: string): DetectedTarget[] {
    const targets: DetectedTarget[] = []

    // Check for esbuild.config.* files
    try {
      const files = readdirSync(cwd)
      for (const file of files) {
        if (file.match(/^esbuild\.config\.(ts|js|mjs|cjs)$/)) {
          targets.push({
            name: basename(cwd),
            bundler: "esbuild",
            configPath: join(cwd, file),
          })
        }
      }
    } catch {}

    // Check package.json for esbuild in scripts or dependencies
    const pkgPath = join(cwd, "package.json")
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"))
        const scripts = pkg.scripts ?? {}
        const hasEsbuildScript = Object.values(scripts).some(
          (s: any) => typeof s === "string" && s.includes("esbuild"),
        )
        const hasEsbuildDep =
          pkg.dependencies?.esbuild ||
          pkg.devDependencies?.esbuild

        if ((hasEsbuildScript || hasEsbuildDep) && targets.length === 0) {
          const entry = findEntryFromScripts(scripts, cwd)
          targets.push({
            name: basename(cwd),
            bundler: "esbuild",
            entry,
            configPath: pkgPath,
          })
        }
      } catch {}
    }

    // Check monorepo: scan apps/ and packages/ directories
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
          const subTargets = esbuildPlugin.detect(subPath)
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
    const metafile = join(cwd, `.klumpen-meta-${Date.now()}.json`)
    const outfile = join(cwd, `.klumpen-out-${Date.now()}.js`)

    const esbuildBin = findEsbuildBin(cwd)
    const entry = target.entry ?? findDefaultEntry(cwd)

    if (!entry) {
      throw new Error(`No entry point found for ${target.name}`)
    }

    const tsconfig = findTsconfig(cwd)

    const cmdParts = [
      esbuildBin,
      entry,
      "--bundle",
      `--metafile=${metafile}`,
      `--outfile=${outfile}`,
      "--format=esm",
      "--platform=node",
      ...(tsconfig ? [`--tsconfig=${tsconfig}`] : []),
    ]

    try {
      await execAsync(cmdParts.join(" "), { cwd, timeout: BUILD_TIMEOUT, maxBuffer: 50 * 1024 * 1024 })
    } catch {
      const fallbackParts = cmdParts.filter((p) => !p.startsWith("--tsconfig"))
      await execAsync(fallbackParts.join(" "), { cwd, timeout: BUILD_TIMEOUT })
    }

    const meta = JSON.parse(readFileSync(metafile, "utf-8"))

    const modules: ModuleInfo[] = Object.entries(meta.inputs).map(
      ([p, info]: [string, any]) => ({
        path: p,
        bytes: info.bytes,
        isNodeModule: p.includes("node_modules/"),
      }),
    )

    const outputBytes = Object.values(meta.outputs).reduce(
      (sum: number, o: any) => sum + o.bytes,
      0,
    )

    const inputBytes = modules.reduce((sum, m) => sum + m.bytes, 0)
    const packages = groupModulesByPackage(modules)
    const importGraph = buildImportGraph(meta.inputs)

    try { unlinkSync(metafile) } catch {}
    try { unlinkSync(outfile) } catch {}

    return {
      target: target.name,
      bundler: "esbuild",
      entry: target.entry,
      outputBytes,
      inputBytes,
      modules: modules.sort((a, b) => b.bytes - a.bytes),
      packages,
      importGraph,
    }
  },
}

function findEsbuildBin(cwd: string): string {
  const candidates = [
    join(cwd, "node_modules/.bin/esbuild"),
    join(cwd, "node_modules/.pnpm/node_modules/.bin/esbuild"),
    join(cwd, "../../node_modules/.bin/esbuild"),
    join(cwd, "../../../node_modules/.bin/esbuild"),
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) return resolve(candidate)
  }

  return "esbuild"
}

function findDefaultEntry(cwd: string): string | undefined {
  const candidates = [
    "src/index.ts",
    "src/index.tsx",
    "src/main.ts",
    "src/main.tsx",
    "index.ts",
    "index.tsx",
  ]

  for (const candidate of candidates) {
    if (existsSync(join(cwd, candidate))) return candidate
  }

  return undefined
}

function findTsconfig(cwd: string): string | undefined {
  const candidates = ["tsconfig.json", "tsconfig.build.json"]
  for (const candidate of candidates) {
    if (existsSync(join(cwd, candidate))) return candidate
  }
  return undefined
}

function findEntryFromScripts(
  scripts: Record<string, string>,
  cwd: string,
): string | undefined {
  for (const script of Object.values(scripts)) {
    if (typeof script !== "string" || !script.includes("esbuild")) continue
    const match = script.match(/esbuild\s+(\S+\.tsx?)\s/)
    if (match?.[1] && existsSync(join(cwd, match[1]))) {
      return match[1]
    }
  }
  return findDefaultEntry(cwd)
}
