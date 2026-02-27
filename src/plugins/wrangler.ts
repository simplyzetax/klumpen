import { existsSync, readFileSync, readdirSync, unlinkSync, statSync } from "fs"
import { join, resolve, basename } from "path"
import { execFile } from "child_process"
import { promisify } from "util"
import type { BundlerPlugin } from "./plugin.ts"
import type { DetectedTarget, BundleResult, ModuleInfo } from "../types.ts"
import { groupModulesByPackage, buildImportGraph } from "../analysis/analyze.ts"

const execFileAsync = promisify(execFile)
const BUILD_TIMEOUT = 60_000

const WRANGLER_CONFIGS = ["wrangler.jsonc", "wrangler.json", "wrangler.toml"]

export const wranglerPlugin: BundlerPlugin = {
  name: "wrangler",

  detect(cwd: string): DetectedTarget[] {
    const targets: DetectedTarget[] = []

    for (const configName of WRANGLER_CONFIGS) {
      const configPath = join(cwd, configName)
      if (!existsSync(configPath)) continue

      const entry = parseWranglerEntry(configPath, configName)
      const name = parseWranglerName(configPath, configName) ?? basename(cwd)

      targets.push({
        name,
        bundler: "wrangler",
        entry: entry ?? undefined,
        configPath,
      })
      break // only one wrangler config per directory
    }

    // Check monorepo subdirectories
    for (const dir of ["apps", "packages", "services", "workers"]) {
      const dirPath = join(cwd, dir)
      if (!existsSync(dirPath)) continue
      try {
        const subdirs = readdirSync(dirPath)
        for (const sub of subdirs) {
          const subPath = join(dirPath, sub)
          try {
            if (!statSync(subPath).isDirectory()) continue
          } catch { continue }
          const subTargets = wranglerPlugin.detect(subPath)
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
      throw new Error(`No entry point found for ${target.name}. Set "main" in your wrangler config.`)
    }

    const tsconfig = findTsconfig(cwd)

    // Collect extra loaders for non-JS file types commonly used in workers
    const extraLoaders = collectUnknownLoaders(cwd, entry)

    const args = [
      entry,
      "--bundle",
      `--metafile=${metafile}`,
      `--outfile=${outfile}`,
      "--format=esm",
      "--platform=node",
      "--external:cloudflare:*",
      "--external:node:*",
      ...extraLoaders,
      ...(tsconfig ? [`--tsconfig=${tsconfig}`] : []),
    ]

    try {
      // Use execFile (not exec) so args are passed directly — no shell glob expansion
      await execFileAsync(esbuildBin, args, { cwd, timeout: BUILD_TIMEOUT, maxBuffer: 50 * 1024 * 1024 })
    } catch {
      // Retry without tsconfig
      const fallbackArgs = args.filter((a) => !a.startsWith("--tsconfig"))
      await execFileAsync(esbuildBin, fallbackArgs, { cwd, timeout: BUILD_TIMEOUT, maxBuffer: 50 * 1024 * 1024 })
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
      bundler: "wrangler",
      outputBytes,
      inputBytes,
      modules: modules.sort((a, b) => b.bytes - a.bytes),
      packages,
      importGraph,
    }
  },
}

function parseWranglerEntry(configPath: string, configName: string): string | null {
  const content = readFileSync(configPath, "utf-8")

  if (configName.endsWith(".toml")) {
    // Simple TOML parsing for the main field
    const match = content.match(/^\s*main\s*=\s*"([^"]+)"/m)
    return match?.[1] ?? null
  }

  // JSON/JSONC — strip comments then parse
  try {
    const stripped = content.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")
    const parsed = JSON.parse(stripped)
    return parsed.main ?? null
  } catch {
    return null
  }
}

function parseWranglerName(configPath: string, configName: string): string | null {
  const content = readFileSync(configPath, "utf-8")

  if (configName.endsWith(".toml")) {
    const match = content.match(/^\s*name\s*=\s*"([^"]+)"/m)
    return match?.[1] ?? null
  }

  try {
    const stripped = content.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")
    const parsed = JSON.parse(stripped)
    return parsed.name ?? null
  } catch {
    return null
  }
}

function findEsbuildBin(cwd: string): string {
  const candidates = [
    // Direct project install
    join(cwd, "node_modules/.bin/esbuild"),
    // Wrangler bundles esbuild internally — this is common for CF Workers projects
    join(cwd, "node_modules/wrangler/node_modules/.bin/esbuild"),
    join(cwd, "node_modules/wrangler/node_modules/esbuild/bin/esbuild"),
    // pnpm virtual store
    join(cwd, "node_modules/.pnpm/node_modules/.bin/esbuild"),
    // Monorepo roots
    join(cwd, "../../node_modules/.bin/esbuild"),
    join(cwd, "../../node_modules/wrangler/node_modules/.bin/esbuild"),
    join(cwd, "../../../node_modules/.bin/esbuild"),
    join(cwd, "../../../node_modules/wrangler/node_modules/.bin/esbuild"),
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) return resolve(candidate)
  }

  // Last resort: hope it's in PATH
  return "esbuild"
}

/**
 * Scan the entry file's directory for non-JS file extensions that esbuild won't
 * know how to handle. Map known types (sql, graphql, txt, html) to text loader
 * so the build succeeds.
 */
function collectUnknownLoaders(cwd: string, entry: string): string[] {
  const known = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".css"])
  const loaderMap: Record<string, string> = {
    ".sql": "text",
    ".graphql": "text",
    ".gql": "text",
    ".txt": "text",
    ".html": "text",
    ".svg": "text",
  }

  const loaders = new Set<string>()
  const entryDir = join(cwd, entry.replace(/[^/\\]+$/, ""))

  const walkForExts = (dir: string, depth: number) => {
    if (depth > 4) return
    try {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name)
        try {
          const stat = statSync(full)
          if (stat.isDirectory() && !name.startsWith(".") && name !== "node_modules") {
            walkForExts(full, depth + 1)
          } else {
            const ext = name.slice(name.lastIndexOf("."))
            if (!known.has(ext) && loaderMap[ext]) {
              loaders.add(`--loader:${ext}=${loaderMap[ext]}`)
            }
          }
        } catch {}
      }
    } catch {}
  }

  walkForExts(cwd, 0)

  return Array.from(loaders)
}

function findDefaultEntry(cwd: string): string | undefined {
  const candidates = [
    "src/index.ts",
    "src/index.tsx",
    "src/main.ts",
    "src/main.tsx",
    "src/worker.ts",
    "index.ts",
    "worker.ts",
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
