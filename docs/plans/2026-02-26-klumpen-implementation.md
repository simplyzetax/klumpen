# klumpen Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a universal bundle analyzer TUI that auto-detects bundlers (esbuild, Vite, Webpack) and presents analysis in a beautiful OpenTUI React interface.

**Architecture:** Plugin-based — each bundler implements a `BundlerPlugin` interface with `detect()` and `analyze()` methods. The UI renders a normalized `BundleResult` from any plugin. Phase-based TUI flow: target selection → build progress → results with tab navigation.

**Tech Stack:** Bun runtime, @opentui/react for TUI, TypeScript, esbuild/vite/webpack CLIs for analysis.

**Design doc:** `docs/plans/2026-02-26-klumpen-design.md`

**Reference projects:**
- `~/Developer/personal/dotfiles/scripts/install.tsx` — OpenTUI React patterns (phase-based UI, useKeyboard, ascii-font, Tokyo Night theme)
- `~/Developer/personal/flareutil/index.ts` — OpenTUI core patterns (SelectRenderable, color scheme)

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `bin.ts`
- Create: `src/index.tsx`

**Step 1: Initialize project with bun**

Run: `cd /Users/finnernzerhoff/Developer/personal/klumpen && bun init`

Accept defaults. This creates `package.json`, `tsconfig.json`, etc.

**Step 2: Install dependencies**

Run: `bun add @opentui/core @opentui/react react`
Run: `bun add -d @types/bun @types/react`

**Step 3: Configure tsconfig.json**

Overwrite `tsconfig.json` with OpenTUI React configuration (matching dotfiles pattern):

```json
{
  "compilerOptions": {
    "lib": ["ESNext"],
    "target": "ESNext",
    "module": "Preserve",
    "moduleDetection": "force",
    "jsx": "react-jsx",
    "jsxImportSource": "@opentui/react",
    "allowJs": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "strict": true,
    "skipLibCheck": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noPropertyAccessFromIndexSignature": false
  }
}
```

**Step 4: Update package.json**

Set up bin entry and scripts:

```json
{
  "name": "klumpen",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "klumpen": "./bin.ts"
  },
  "scripts": {
    "dev": "bun run src/index.tsx",
    "start": "bun run src/index.tsx"
  },
  "dependencies": {
    "@opentui/core": "^0.1.83",
    "@opentui/react": "^0.1.83",
    "react": "^19.2.4"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "@types/react": "^19.2.14"
  }
}
```

**Step 5: Create bin.ts**

```typescript
#!/usr/bin/env bun
import "./src/index.tsx"
```

**Step 6: Create minimal src/index.tsx**

```tsx
import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"

function App() {
  return (
    <box flexDirection="column" paddingX={2} paddingY={1}>
      <text fg="#ffffff">klumpen</text>
      <text fg="#666666">Universal Bundle Analyzer</text>
    </box>
  )
}

const renderer = await createCliRenderer({ exitOnCtrlC: true })
createRoot(renderer).render(<App />)
```

**Step 7: Verify it runs**

Run: `bun run dev`
Expected: See "klumpen" and "Universal Bundle Analyzer" in terminal. Press Ctrl+C to exit.

**Step 8: Initialize git and commit**

Run: `git init && git add -A && git commit -m "chore: scaffold klumpen project with OpenTUI React"`

---

## Task 2: Types & Theme

**Files:**
- Create: `src/types.ts`
- Create: `src/ui/theme.ts`
- Create: `src/plugins/plugin.ts`

**Step 1: Create src/types.ts**

```typescript
export interface DetectedTarget {
  name: string
  bundler: string
  entry?: string
  configPath: string
}

export interface ModuleInfo {
  path: string
  bytes: number
  isNodeModule: boolean
}

export interface PackageGroup {
  name: string
  bytes: number
  files: ModuleInfo[]
}

export interface ImportGraph {
  edges: Record<string, string[]>
}

export interface BundleResult {
  target: string
  bundler: string
  outputBytes: number
  inputBytes: number
  modules: ModuleInfo[]
  packages: PackageGroup[]
  importGraph: ImportGraph
}
```

**Step 2: Create src/ui/theme.ts**

Clean minimal palette — just enough color to convey meaning:

```typescript
export const C = {
  text: "#e0e0e0",
  dim: "#666666",
  accent: "#ffffff",
  success: "#73c936",
  error: "#ff5f56",
} as const
```

**Step 3: Create src/plugins/plugin.ts**

```typescript
import type { DetectedTarget, BundleResult } from "../types.ts"

export interface BundlerPlugin {
  name: string
  detect(cwd: string): DetectedTarget[]
  analyze(target: DetectedTarget): Promise<BundleResult>
}
```

**Step 4: Verify types compile**

Run: `bun run --bun tsc --noEmit`
Expected: No errors.

**Step 5: Commit**

Run: `git add src/types.ts src/ui/theme.ts src/plugins/plugin.ts && git commit -m "feat: add types, theme, and plugin interface"`

---

## Task 3: Auto-Detection Orchestrator

**Files:**
- Create: `src/detect.ts`

**Step 1: Create src/detect.ts**

This file scans the current working directory for bundler config files and returns `DetectedTarget[]`.

```typescript
import { existsSync, readFileSync, readdirSync, statSync } from "fs"
import { join, basename, resolve } from "path"
import type { DetectedTarget } from "./types.ts"
import type { BundlerPlugin } from "./plugins/plugin.ts"

export function detectTargets(cwd: string, plugins: BundlerPlugin[]): DetectedTarget[] {
  const targets: DetectedTarget[] = []

  for (const plugin of plugins) {
    targets.push(...plugin.detect(cwd))
  }

  return targets
}
```

**Step 2: Verify it compiles**

Run: `bun run --bun tsc --noEmit`
Expected: No errors.

**Step 3: Commit**

Run: `git add src/detect.ts && git commit -m "feat: add detection orchestrator"`

---

## Task 4: Analysis Utilities

**Files:**
- Create: `src/analysis/analyze.ts`

**Step 1: Create src/analysis/analyze.ts**

Common analysis utilities used by all plugins to normalize raw bundler output into `BundleResult`:

```typescript
import type { ModuleInfo, PackageGroup, ImportGraph } from "../types.ts"

export function groupModulesByPackage(modules: ModuleInfo[]): PackageGroup[] {
  const groups: Record<string, ModuleInfo[]> = {}

  for (const mod of modules) {
    const group = getPackageName(mod.path)
    if (!groups[group]) groups[group] = []
    groups[group]!.push(mod)
  }

  return Object.entries(groups)
    .map(([name, files]) => ({
      name,
      bytes: files.reduce((sum, f) => sum + f.bytes, 0),
      files: files.sort((a, b) => b.bytes - a.bytes),
    }))
    .sort((a, b) => b.bytes - a.bytes)
}

export function getPackageName(filePath: string): string {
  if (filePath.includes("node_modules/")) {
    const parts = filePath.split("node_modules/").pop()!.split("/")
    return parts[0]!.startsWith("@") ? `${parts[0]}/${parts[1]}` : parts[0]!
  }
  // Local files — group by top-level directory
  const parts = filePath.split("/")
  if (parts.length >= 2) {
    return `${parts[0]}/${parts[1]}` + " (local)"
  }
  return "local"
}

export function buildImportGraph(
  inputs: Record<string, { imports?: { path: string }[] }>,
): ImportGraph {
  const edges: Record<string, string[]> = {}

  for (const [file, info] of Object.entries(inputs)) {
    for (const imp of info.imports ?? []) {
      if (!edges[imp.path]) edges[imp.path] = []
      edges[imp.path]!.push(file)
    }
  }

  return { edges }
}

export function findImportChain(
  graph: ImportGraph,
  targetFile: string,
  entryFile: string,
): string[] | null {
  const visited = new Set<string>()
  const queue: string[][] = [[targetFile]]

  while (queue.length > 0) {
    const chain = queue.shift()!
    const current = chain[chain.length - 1]!

    if (current === entryFile) return chain.reverse()
    if (visited.has(current)) continue
    visited.add(current)

    for (const parent of graph.edges[current] ?? []) {
      queue.push([...chain, parent])
    }
  }

  return null
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  const mb = kb / 1024
  return `${mb.toFixed(2)} MB`
}

export function formatPct(bytes: number, total: number): string {
  if (total === 0) return "0.0%"
  return `${((bytes / total) * 100).toFixed(1)}%`
}
```

**Step 2: Verify it compiles**

Run: `bun run --bun tsc --noEmit`
Expected: No errors.

**Step 3: Commit**

Run: `git add src/analysis/analyze.ts && git commit -m "feat: add analysis utilities (grouping, import chains, formatters)"`

---

## Task 5: esbuild Plugin

**Files:**
- Create: `src/plugins/esbuild.ts`

**Step 1: Create src/plugins/esbuild.ts**

The esbuild plugin detects esbuild projects and analyzes them using `--metafile`:

```typescript
import { existsSync, readFileSync, readdirSync, unlinkSync } from "fs"
import { join, resolve, basename } from "path"
import { execSync } from "child_process"
import type { BundlerPlugin } from "./plugin.ts"
import type { DetectedTarget, BundleResult, ModuleInfo } from "../types.ts"
import { groupModulesByPackage, buildImportGraph } from "../analysis/analyze.ts"

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
          // Try to find entry points from scripts
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
            const stat = require("fs").statSync(subPath)
            if (!stat.isDirectory()) continue
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

    // Find esbuild binary
    const esbuildBin = findEsbuildBin(cwd)
    const entry = target.entry ?? findDefaultEntry(cwd)

    if (!entry) {
      throw new Error(`No entry point found for ${target.name}`)
    }

    // Find tsconfig
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
      execSync(cmdParts.join(" "), { stdio: "pipe", cwd })
    } catch (e: any) {
      // Try without tsconfig if it fails
      const fallbackParts = cmdParts.filter((p) => !p.startsWith("--tsconfig"))
      execSync(fallbackParts.join(" "), { stdio: "pipe", cwd })
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

    // Cleanup temp files
    try { unlinkSync(metafile) } catch {}
    try { unlinkSync(outfile) } catch {}

    return {
      target: target.name,
      bundler: "esbuild",
      outputBytes,
      inputBytes,
      modules: modules.sort((a, b) => b.bytes - a.bytes),
      packages,
      importGraph,
    }
  },
}

function findEsbuildBin(cwd: string): string {
  // Check common locations
  const candidates = [
    join(cwd, "node_modules/.bin/esbuild"),
    join(cwd, "node_modules/.pnpm/node_modules/.bin/esbuild"),
    // Walk up to find monorepo root
    join(cwd, "../../node_modules/.bin/esbuild"),
    join(cwd, "../../../node_modules/.bin/esbuild"),
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) return resolve(candidate)
  }

  // Fallback to global
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
    // Try to extract entry from: esbuild src/index.ts --bundle ...
    const match = script.match(/esbuild\s+(\S+\.tsx?)\s/)
    if (match?.[1] && existsSync(join(cwd, match[1]))) {
      return match[1]
    }
  }
  return findDefaultEntry(cwd)
}
```

**Step 2: Verify it compiles**

Run: `bun run --bun tsc --noEmit`
Expected: No errors.

**Step 3: Commit**

Run: `git add src/plugins/esbuild.ts && git commit -m "feat: add esbuild plugin (detect + analyze)"`

---

## Task 6: Vite Plugin

**Files:**
- Create: `src/plugins/vite.ts`

**Step 1: Create src/plugins/vite.ts**

The Vite plugin detects Vite projects and runs `vite build` to collect stats:

```typescript
import { existsSync, readFileSync, readdirSync, writeFileSync, unlinkSync } from "fs"
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
            const stat = require("fs").statSync(subPath)
            if (!stat.isDirectory()) continue
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

    // Find vite binary
    const viteBin = findViteBin(cwd)

    // Run vite build with rollup-plugin-visualizer outputting JSON
    // We use the Rollup stats output format
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

    // Parse Vite's build output to extract chunk information
    // If no stats plugin is configured, parse the build output manually
    const result = parseViteBuildOutput(cwd, target.name)

    // Cleanup
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
  // Look for Vite's dist output and parse chunk sizes
  const distDir = join(cwd, "dist")
  const modules: ModuleInfo[] = []
  let outputBytes = 0

  if (existsSync(distDir)) {
    walkDir(distDir, (filePath, relativePath) => {
      try {
        const stat = require("fs").statSync(filePath)
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
        const stat = require("fs").statSync(fullPath)
        if (stat.isDirectory()) {
          walkDir(fullPath, callback, relPath)
        } else {
          callback(fullPath, relPath)
        }
      } catch {}
    }
  } catch {}
}
```

**Step 2: Verify it compiles**

Run: `bun run --bun tsc --noEmit`
Expected: No errors.

**Step 3: Commit**

Run: `git add src/plugins/vite.ts && git commit -m "feat: add vite plugin (detect + analyze)"`

---

## Task 7: Webpack Plugin

**Files:**
- Create: `src/plugins/webpack.ts`

**Step 1: Create src/plugins/webpack.ts**

```typescript
import { existsSync, readFileSync, readdirSync } from "fs"
import { join, resolve, basename } from "path"
import { execSync } from "child_process"
import type { BundlerPlugin } from "./plugin.ts"
import type { DetectedTarget, BundleResult, ModuleInfo } from "../types.ts"
import { groupModulesByPackage, buildImportGraph } from "../analysis/analyze.ts"

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
            const stat = require("fs").statSync(subPath)
            if (!stat.isDirectory()) continue
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

    // Run webpack with --json to get stats
    let statsJson: any
    try {
      const output = execSync(`${webpackBin} --json`, {
        stdio: "pipe",
        cwd,
        env: { ...process.env, NODE_ENV: "production" },
      }).toString()

      statsJson = JSON.parse(output)
    } catch (e: any) {
      // Try to parse partial output
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

  // Webpack stats format
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

  // Calculate output size from assets
  const assets = stats.assets ?? []
  const outputBytes = assets.reduce((sum: number, a: any) => sum + (a.size ?? 0), 0)

  // Build import graph from webpack reasons
  const edges: Record<string, string[]> = {}
  for (const mod of webpackModules) {
    const reasons = mod.reasons ?? []
    for (const reason of reasons) {
      if (!reason.moduleName) continue
      const target = mod.name?.replace(/^\.\//, "") ?? ""
      const source = reason.moduleName.replace(/^\.\//, "")
      if (!edges[target]) edges[target] = []
      edges[target]!.push(source)
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
```

**Step 2: Verify it compiles**

Run: `bun run --bun tsc --noEmit`
Expected: No errors.

**Step 3: Commit**

Run: `git add src/plugins/webpack.ts && git commit -m "feat: add webpack plugin (detect + analyze)"`

---

## Task 8: Target Selection Screen

**Files:**
- Create: `src/ui/target-select.tsx`

**Step 1: Create src/ui/target-select.tsx**

This is the first phase of the TUI — select which targets to analyze:

```tsx
import { useKeyboard } from "@opentui/react"
import { useState } from "react"
import { C } from "./theme.ts"
import type { DetectedTarget } from "../types.ts"

interface TargetSelectProps {
  targets: DetectedTarget[]
  onSubmit: (selected: DetectedTarget[]) => void
  onQuit: () => void
}

export function TargetSelect({ targets, onSubmit, onQuit }: TargetSelectProps) {
  const [cursor, setCursor] = useState(0)
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(targets.map((_, i) => i)),
  )

  useKeyboard((key) => {
    switch (key.name) {
      case "up":
      case "k":
        setCursor((c) => Math.max(0, c - 1))
        break
      case "down":
      case "j":
        setCursor((c) => Math.min(targets.length - 1, c + 1))
        break
      case "space":
        setSelected((prev) => {
          const next = new Set(prev)
          if (next.has(cursor)) next.delete(cursor)
          else next.add(cursor)
          return next
        })
        break
      case "a":
        setSelected(new Set(targets.map((_, i) => i)))
        break
      case "n":
        setSelected(new Set())
        break
      case "enter":
      case "return":
        if (selected.size > 0) {
          const selectedTargets = targets.filter((_, i) => selected.has(i))
          onSubmit(selectedTargets)
        }
        break
      case "q":
      case "escape":
        onQuit()
        break
    }
  })

  return (
    <box flexDirection="column">
      <box marginBottom={1}>
        <text fg={C.dim}>
          {targets.length === 0
            ? "No targets detected in this directory"
            : "Detected targets:"}
        </text>
      </box>

      <box flexDirection="column">
        {targets.map((target, i) => {
          const on = selected.has(i)
          const active = i === cursor
          return (
            <box key={`${target.name}-${i}`} flexDirection="row">
              <text fg={active ? C.accent : "transparent"}>
                {active ? "▸ " : "  "}
              </text>
              <text fg={on ? C.accent : C.dim}>{on ? "◆ " : "◇ "}</text>
              <text fg={active ? C.text : on ? C.text : C.dim}>
                {target.name.padEnd(20)}
              </text>
              <text fg={C.dim}>{target.bundler}</text>
              {target.entry && (
                <text fg={C.dim}>{" · " + target.entry}</text>
              )}
            </box>
          )
        })}
      </box>

      <box marginTop={1}>
        <text>
          <span fg={C.accent}>space</span>
          <span fg={C.dim}> toggle </span>
          <span fg={C.dim}> · </span>
          <span fg={C.accent}>a</span>
          <span fg={C.dim}> all </span>
          <span fg={C.dim}> · </span>
          <span fg={C.accent}>n</span>
          <span fg={C.dim}> none </span>
          <span fg={C.dim}> · </span>
          <span fg={C.accent}>enter</span>
          <span fg={C.dim}> analyze </span>
          <span fg={C.dim}> · </span>
          <span fg={C.accent}>q</span>
          <span fg={C.dim}> quit</span>
        </text>
      </box>
    </box>
  )
}
```

**Step 2: Verify it compiles**

Run: `bun run --bun tsc --noEmit`
Expected: No errors.

**Step 3: Commit**

Run: `git add src/ui/target-select.tsx && git commit -m "feat: add target selection UI component"`

---

## Task 9: Build Progress Screen

**Files:**
- Create: `src/ui/build-progress.tsx`

**Step 1: Create src/ui/build-progress.tsx**

```tsx
import { C } from "./theme.ts"
import type { DetectedTarget, BundleResult } from "../types.ts"
import { formatBytes } from "../analysis/analyze.ts"

type BuildStatus = "pending" | "running" | "done" | "failed"

export interface BuildState {
  target: DetectedTarget
  status: BuildStatus
  result?: BundleResult
  error?: string
}

interface BuildProgressProps {
  builds: BuildState[]
}

export function BuildProgress({ builds }: BuildProgressProps) {
  return (
    <box flexDirection="column">
      <box marginBottom={1}>
        <text fg={C.dim}>Analyzing...</text>
      </box>

      <box flexDirection="column">
        {builds.map((build, i) => {
          const icon =
            build.status === "done"
              ? "✓"
              : build.status === "failed"
                ? "✗"
                : build.status === "running"
                  ? "●"
                  : "○"
          const color =
            build.status === "done"
              ? C.success
              : build.status === "failed"
                ? C.error
                : build.status === "running"
                  ? C.dim
                  : C.dim

          return (
            <box key={`build-${i}`} flexDirection="row">
              <text fg={color}>{icon + " "}</text>
              <text fg={color}>{build.target.name.padEnd(20)}</text>
              <text fg={C.dim}>{build.target.bundler.padEnd(12)}</text>
              {build.status === "done" && build.result && (
                <text fg={C.success}>
                  {formatBytes(build.result.outputBytes)}
                </text>
              )}
              {build.status === "running" && (
                <text fg={C.dim}>building...</text>
              )}
              {build.status === "failed" && (
                <text fg={C.error}>{build.error ?? "failed"}</text>
              )}
            </box>
          )
        })}
      </box>
    </box>
  )
}
```

**Step 2: Verify it compiles**

Run: `bun run --bun tsc --noEmit`
Expected: No errors.

**Step 3: Commit**

Run: `git add src/ui/build-progress.tsx && git commit -m "feat: add build progress UI component"`

---

## Task 10: Results Views (Summary, Packages, Modules, Import Chains)

**Files:**
- Create: `src/ui/summary.tsx`
- Create: `src/ui/package-table.tsx`
- Create: `src/ui/module-list.tsx`
- Create: `src/ui/import-chain.tsx`

**Step 1: Create src/ui/summary.tsx**

```tsx
import { C } from "./theme.ts"
import type { BundleResult } from "../types.ts"
import { formatBytes } from "../analysis/analyze.ts"

interface SummaryProps {
  result: BundleResult
}

export function Summary({ result }: SummaryProps) {
  const nodeModuleCount = result.modules.filter((m) => m.isNodeModule).length
  const localCount = result.modules.length - nodeModuleCount

  return (
    <box flexDirection="column">
      <box flexDirection="row" marginBottom={1}>
        <text fg={C.dim}>{"Output size:  "}</text>
        <text fg={C.text}>{formatBytes(result.outputBytes)}</text>
      </box>
      <box flexDirection="row">
        <text fg={C.dim}>{"Source size:  "}</text>
        <text fg={C.text}>{formatBytes(result.inputBytes)}</text>
      </box>
      <box flexDirection="row">
        <text fg={C.dim}>{"Packages:     "}</text>
        <text fg={C.text}>{String(result.packages.length)}</text>
      </box>
      <box flexDirection="row">
        <text fg={C.dim}>{"Modules:      "}</text>
        <text fg={C.text}>
          {`${result.modules.length} (${nodeModuleCount} npm, ${localCount} local)`}
        </text>
      </box>
    </box>
  )
}
```

**Step 2: Create src/ui/package-table.tsx**

```tsx
import { useKeyboard } from "@opentui/react"
import { useState } from "react"
import { C } from "./theme.ts"
import type { BundleResult, PackageGroup } from "../types.ts"
import { formatBytes, formatPct } from "../analysis/analyze.ts"

interface PackageTableProps {
  result: BundleResult
  onDrillDown?: (pkg: PackageGroup) => void
}

export function PackageTable({ result, onDrillDown }: PackageTableProps) {
  const [cursor, setCursor] = useState(0)
  const [scrollOffset, setScrollOffset] = useState(0)
  const visibleRows = 20

  useKeyboard((key) => {
    switch (key.name) {
      case "up":
      case "k":
        setCursor((c) => {
          const next = Math.max(0, c - 1)
          if (next < scrollOffset) setScrollOffset(next)
          return next
        })
        break
      case "down":
      case "j":
        setCursor((c) => {
          const next = Math.min(result.packages.length - 1, c + 1)
          if (next >= scrollOffset + visibleRows) setScrollOffset(next - visibleRows + 1)
          return next
        })
        break
      case "enter":
      case "return":
        if (onDrillDown && result.packages[cursor]) {
          onDrillDown(result.packages[cursor]!)
        }
        break
    }
  })

  const visible = result.packages.slice(scrollOffset, scrollOffset + visibleRows)
  const barWidth = 30

  return (
    <box flexDirection="column">
      {visible.map((pkg, i) => {
        const idx = scrollOffset + i
        const active = idx === cursor
        const pct = result.inputBytes > 0 ? pkg.bytes / result.inputBytes : 0
        const filled = Math.round(pct * barWidth)
        const bar = "█".repeat(filled) + "░".repeat(barWidth - filled)

        return (
          <box key={`pkg-${idx}`} flexDirection="row">
            <text fg={active ? C.accent : "transparent"}>
              {active ? "▸ " : "  "}
            </text>
            <text fg={active ? C.text : C.dim}>
              {formatBytes(pkg.bytes).padStart(10)}
            </text>
            <text fg={C.dim}>{"  "}</text>
            <text fg={active ? C.text : C.dim}>
              {formatPct(pkg.bytes, result.inputBytes).padStart(6)}
            </text>
            <text fg={C.dim}>{"  "}</text>
            <text fg={active ? C.accent : C.dim}>{bar}</text>
            <text fg={C.dim}>{"  "}</text>
            <text fg={active ? C.text : C.dim}>{pkg.name}</text>
          </box>
        )
      })}

      {result.packages.length > visibleRows && (
        <box marginTop={1}>
          <text fg={C.dim}>
            {`Showing ${scrollOffset + 1}-${Math.min(scrollOffset + visibleRows, result.packages.length)} of ${result.packages.length}`}
          </text>
        </box>
      )}
    </box>
  )
}
```

**Step 3: Create src/ui/module-list.tsx**

```tsx
import { useKeyboard } from "@opentui/react"
import { useState } from "react"
import { C } from "./theme.ts"
import type { BundleResult } from "../types.ts"
import { formatBytes, formatPct } from "../analysis/analyze.ts"

interface ModuleListProps {
  result: BundleResult
}

export function ModuleList({ result }: ModuleListProps) {
  const [scrollOffset, setScrollOffset] = useState(0)
  const visibleRows = 20
  const modules = result.modules

  useKeyboard((key) => {
    switch (key.name) {
      case "up":
      case "k":
        setScrollOffset((o) => Math.max(0, o - 1))
        break
      case "down":
      case "j":
        setScrollOffset((o) => Math.min(Math.max(0, modules.length - visibleRows), o + 1))
        break
    }
  })

  const visible = modules.slice(scrollOffset, scrollOffset + visibleRows)

  return (
    <box flexDirection="column">
      {visible.map((mod, i) => {
        const idx = scrollOffset + i
        const shortPath = mod.path.includes("node_modules/")
          ? mod.path.split("node_modules/").pop()!
          : mod.path

        return (
          <box key={`mod-${idx}`} flexDirection="row">
            <text fg={C.dim}>
              {formatBytes(mod.bytes).padStart(10)}
            </text>
            <text fg={C.dim}>{"  "}</text>
            <text fg={C.dim}>
              {formatPct(mod.bytes, result.inputBytes).padStart(6)}
            </text>
            <text fg={C.dim}>{"  "}</text>
            <text fg={mod.isNodeModule ? C.text : C.text}>{shortPath}</text>
          </box>
        )
      })}

      {modules.length > visibleRows && (
        <box marginTop={1}>
          <text fg={C.dim}>
            {`Showing ${scrollOffset + 1}-${Math.min(scrollOffset + visibleRows, modules.length)} of ${modules.length}`}
          </text>
        </box>
      )}
    </box>
  )
}
```

**Step 4: Create src/ui/import-chain.tsx**

```tsx
import { useKeyboard } from "@opentui/react"
import { useState } from "react"
import { C } from "./theme.ts"
import type { BundleResult } from "../types.ts"
import { findImportChain, formatBytes } from "../analysis/analyze.ts"

interface ImportChainProps {
  result: BundleResult
  entryFile?: string
}

export function ImportChain({ result, entryFile }: ImportChainProps) {
  const [cursor, setCursor] = useState(0)
  const [scrollOffset, setScrollOffset] = useState(0)
  const visibleRows = 15

  // For each package, find the chain to its largest file
  const chains = result.packages
    .filter((pkg) => pkg.files.length > 0)
    .slice(0, 30)
    .map((pkg) => {
      const largest = pkg.files[0]!
      const chain = entryFile
        ? findImportChain(result.importGraph, largest.path, entryFile)
        : null
      return { pkg, chain, largest }
    })

  useKeyboard((key) => {
    switch (key.name) {
      case "up":
      case "k":
        setCursor((c) => {
          const next = Math.max(0, c - 1)
          if (next < scrollOffset) setScrollOffset(next)
          return next
        })
        break
      case "down":
      case "j":
        setCursor((c) => {
          const next = Math.min(chains.length - 1, c + 1)
          if (next >= scrollOffset + visibleRows) setScrollOffset(next - visibleRows + 1)
          return next
        })
        break
    }
  })

  const visible = chains.slice(scrollOffset, scrollOffset + visibleRows)

  function shorten(p: string): string {
    return p.includes("node_modules/") ? p.split("node_modules/").pop()! : p
  }

  return (
    <box flexDirection="column">
      {visible.map((item, i) => {
        const idx = scrollOffset + i
        const active = idx === cursor
        const expanded = active && item.chain

        return (
          <box key={`chain-${idx}`} flexDirection="column" marginBottom={expanded ? 1 : 0}>
            <box flexDirection="row">
              <text fg={active ? C.accent : "transparent"}>
                {active ? "▸ " : "  "}
              </text>
              <text fg={active ? C.text : C.dim}>
                {item.pkg.name}
              </text>
              <text fg={C.dim}>
                {"  " + formatBytes(item.pkg.bytes)}
              </text>
            </box>

            {expanded && item.chain && item.chain.map((step, j) => (
              <box key={`step-${j}`} flexDirection="row">
                <text fg={C.dim}>
                  {"  ".repeat(j + 1) + (j === 0 ? "  " : "→ ")}
                </text>
                <text fg={C.text}>{shorten(step)}</text>
              </box>
            ))}

            {expanded && !item.chain && (
              <box>
                <text fg={C.dim}>{"    (no chain found)"}</text>
              </box>
            )}
          </box>
        )
      })}
    </box>
  )
}
```

**Step 5: Verify all compile**

Run: `bun run --bun tsc --noEmit`
Expected: No errors.

**Step 6: Commit**

Run: `git add src/ui/summary.tsx src/ui/package-table.tsx src/ui/module-list.tsx src/ui/import-chain.tsx && git commit -m "feat: add results view components (summary, packages, modules, import chains)"`

---

## Task 11: Main App Component

**Files:**
- Create: `src/app.tsx`

**Step 1: Create src/app.tsx**

The root component managing phase transitions and tab navigation:

```tsx
import { useKeyboard, useRenderer } from "@opentui/react"
import { useState, useEffect } from "react"
import { C } from "./ui/theme.ts"
import { TargetSelect } from "./ui/target-select.tsx"
import { BuildProgress, type BuildState } from "./ui/build-progress.tsx"
import { Summary } from "./ui/summary.tsx"
import { PackageTable } from "./ui/package-table.tsx"
import { ModuleList } from "./ui/module-list.tsx"
import { ImportChain } from "./ui/import-chain.tsx"
import type { DetectedTarget, BundleResult } from "./types.ts"
import type { BundlerPlugin } from "./plugins/plugin.ts"

type Phase = "select" | "building" | "results"
type Tab = "summary" | "packages" | "modules" | "chains"

const TABS: { key: Tab; label: string }[] = [
  { key: "summary", label: "Summary" },
  { key: "packages", label: "Packages" },
  { key: "modules", label: "Modules" },
  { key: "chains", label: "Import Chains" },
]

interface AppProps {
  targets: DetectedTarget[]
  plugins: BundlerPlugin[]
}

export function App({ targets, plugins }: AppProps) {
  const renderer = useRenderer()
  const [phase, setPhase] = useState<Phase>("select")
  const [builds, setBuilds] = useState<BuildState[]>([])
  const [results, setResults] = useState<BundleResult[]>([])
  const [activeTab, setActiveTab] = useState<Tab>("summary")
  const [activeResult, setActiveResult] = useState(0)

  // Run builds when phase transitions to "building"
  useEffect(() => {
    if (phase !== "building") return

    const run = async () => {
      const selectedTargets = builds.map((b) => b.target)

      for (let i = 0; i < selectedTargets.length; i++) {
        const target = selectedTargets[i]!

        setBuilds((prev) =>
          prev.map((b, j) => (j === i ? { ...b, status: "running" as const } : b)),
        )

        const plugin = plugins.find((p) => p.name === target.bundler)
        if (!plugin) {
          setBuilds((prev) =>
            prev.map((b, j) =>
              j === i ? { ...b, status: "failed" as const, error: "No plugin found" } : b,
            ),
          )
          continue
        }

        try {
          const result = await plugin.analyze(target)
          setResults((prev) => [...prev, result])
          setBuilds((prev) =>
            prev.map((b, j) =>
              j === i ? { ...b, status: "done" as const, result } : b,
            ),
          )
        } catch (e) {
          setBuilds((prev) =>
            prev.map((b, j) =>
              j === i
                ? {
                    ...b,
                    status: "failed" as const,
                    error: e instanceof Error ? e.message : String(e),
                  }
                : b,
            ),
          )
        }
      }

      setPhase("results")
    }

    run()
  }, [phase])

  // Keyboard handling for results phase
  useKeyboard((key) => {
    if (phase === "results") {
      switch (key.name) {
        case "tab": {
          const idx = TABS.findIndex((t) => t.key === activeTab)
          setActiveTab(TABS[(idx + 1) % TABS.length]!.key)
          break
        }
        case "[":
          setActiveResult((r) => Math.max(0, r - 1))
          break
        case "]":
          setActiveResult((r) => Math.min(results.length - 1, r + 1))
          break
        case "q":
        case "escape":
          renderer.destroy()
          break
      }
    }
  })

  const handleSubmit = (selected: DetectedTarget[]) => {
    setBuilds(selected.map((t) => ({ target: t, status: "pending" as const })))
    setPhase("building")
  }

  const handleQuit = () => {
    renderer.destroy()
  }

  const currentResult = results[activeResult]

  return (
    <box flexDirection="column" paddingX={2} paddingY={1} width="100%">
      {/* Header */}
      <ascii-font text="klumpen" font="tiny" color={C.accent} />

      {phase === "select" && (
        <TargetSelect
          targets={targets}
          onSubmit={handleSubmit}
          onQuit={handleQuit}
        />
      )}

      {phase === "building" && <BuildProgress builds={builds} />}

      {phase === "results" && currentResult && (
        <box flexDirection="column">
          {/* Target + tab header */}
          <box flexDirection="row" marginBottom={1}>
            <text fg={C.accent}>{currentResult.target}</text>
            <text fg={C.dim}>{` (${currentResult.bundler})`}</text>
            {results.length > 1 && (
              <text fg={C.dim}>
                {`  [${activeResult + 1}/${results.length}]`}
              </text>
            )}
          </box>

          {/* Tab bar */}
          <box flexDirection="row" marginBottom={1}>
            {TABS.map((tab, i) => (
              <box key={tab.key} flexDirection="row">
                {i > 0 && <text fg={C.dim}>{"  "}</text>}
                <text
                  fg={activeTab === tab.key ? C.accent : C.dim}
                >
                  {activeTab === tab.key ? `[${tab.label}]` : ` ${tab.label} `}
                </text>
              </box>
            ))}
          </box>

          {/* Active tab content */}
          {activeTab === "summary" && <Summary result={currentResult} />}
          {activeTab === "packages" && <PackageTable result={currentResult} />}
          {activeTab === "modules" && <ModuleList result={currentResult} />}
          {activeTab === "chains" && (
            <ImportChain result={currentResult} entryFile={currentResult.modules[0]?.path} />
          )}

          {/* Footer */}
          <box marginTop={1}>
            <text>
              <span fg={C.accent}>tab</span>
              <span fg={C.dim}> switch view </span>
              {results.length > 1 && (
                <>
                  <span fg={C.dim}> · </span>
                  <span fg={C.accent}>[ ]</span>
                  <span fg={C.dim}> switch target </span>
                </>
              )}
              <span fg={C.dim}> · </span>
              <span fg={C.accent}>↑↓</span>
              <span fg={C.dim}> navigate </span>
              <span fg={C.dim}> · </span>
              <span fg={C.accent}>q</span>
              <span fg={C.dim}> quit</span>
            </text>
          </box>
        </box>
      )}
    </box>
  )
}
```

**Step 2: Verify it compiles**

Run: `bun run --bun tsc --noEmit`
Expected: No errors.

**Step 3: Commit**

Run: `git add src/app.tsx && git commit -m "feat: add main App component with phase management and tab navigation"`

---

## Task 12: Wire Up Entry Point (index.tsx)

**Files:**
- Modify: `src/index.tsx`

**Step 1: Update src/index.tsx**

Wire together detection, plugins, CLI args, and the TUI:

```tsx
import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import { App } from "./app.tsx"
import { detectTargets } from "./detect.ts"
import { esbuildPlugin } from "./plugins/esbuild.ts"
import { vitePlugin } from "./plugins/vite.ts"
import { webpackPlugin } from "./plugins/webpack.ts"
import type { BundlerPlugin } from "./plugins/plugin.ts"
import { formatBytes, formatPct } from "./analysis/analyze.ts"

const plugins: BundlerPlugin[] = [esbuildPlugin, vitePlugin, webpackPlugin]

// CLI args
const args = process.argv.slice(2)
const targetArg = args.find((a) => !a.startsWith("--"))
const jsonMode = args.includes("--json")
const noTui = args.includes("--no-tui")
const trace = args.includes("--trace")

const cwd = process.cwd()
const targets = detectTargets(cwd, plugins)

// Non-TUI modes
if (jsonMode || noTui) {
  if (targets.length === 0) {
    console.error("No bundler targets detected in this directory.")
    process.exit(1)
  }

  const selectedTargets = targetArg
    ? targets.filter((t) => t.name === targetArg)
    : targets

  if (selectedTargets.length === 0) {
    console.error(`Target "${targetArg}" not found. Available: ${targets.map((t) => t.name).join(", ")}`)
    process.exit(1)
  }

  for (const target of selectedTargets) {
    const plugin = plugins.find((p) => p.name === target.bundler)
    if (!plugin) {
      console.error(`No plugin for bundler: ${target.bundler}`)
      continue
    }

    try {
      const result = await plugin.analyze(target)

      if (jsonMode) {
        console.log(JSON.stringify(result, null, 2))
      } else {
        console.log(`\n=== ${result.target} (${result.bundler}) ===`)
        console.log(`Output:  ${formatBytes(result.outputBytes)}`)
        console.log(`Sources: ${formatBytes(result.inputBytes)}`)
        console.log("")
        console.log("--- By package ---")
        for (const pkg of result.packages) {
          console.log(
            `${formatBytes(pkg.bytes).padStart(10)}  ${formatPct(pkg.bytes, result.inputBytes).padStart(6)}  ${pkg.name}`,
          )
        }
        console.log("")
        console.log("--- Top 20 modules ---")
        for (const mod of result.modules.slice(0, 20)) {
          console.log(
            `${formatBytes(mod.bytes).padStart(10)}  ${formatPct(mod.bytes, result.inputBytes).padStart(6)}  ${mod.path}`,
          )
        }
      }
    } catch (e) {
      console.error(`Failed to analyze ${target.name}:`, e instanceof Error ? e.message : e)
    }
  }

  process.exit(0)
}

// TUI mode
const renderer = await createCliRenderer({ exitOnCtrlC: true })
createRoot(renderer).render(<App targets={targets} plugins={plugins} />)
```

**Step 2: Verify it compiles**

Run: `bun run --bun tsc --noEmit`
Expected: No errors.

**Step 3: Test the TUI launches**

Run: `bun run dev`
Expected: See the klumpen ASCII art header and target selection (may show "No targets detected" if not in a project with bundlers). Press q to exit.

**Step 4: Commit**

Run: `git add src/index.tsx && git commit -m "feat: wire up entry point with CLI args and TUI/non-TUI modes"`

---

## Task 13: Make bin.ts Executable & Test CLI

**Files:**
- Modify: `bin.ts`

**Step 1: Make bin.ts executable**

Run: `chmod +x bin.ts`

**Step 2: Test local link**

Run: `bun link`

This makes `klumpen` available globally from this project.

**Step 3: Test in a project with esbuild/vite/webpack**

Run: `cd ~/Developer/personal/some-project && klumpen`

Test that it detects targets correctly.

**Step 4: Test non-TUI mode**

Run: `klumpen --no-tui`

Expected: Text output of bundle analysis.

**Step 5: Commit**

Run: `cd /Users/finnernzerhoff/Developer/personal/klumpen && git add bin.ts && git commit -m "chore: make bin.ts executable"`

---

## Task 14: Polish & Edge Cases

**Files:**
- Modify: `src/app.tsx`
- Modify: `src/ui/target-select.tsx`

**Step 1: Handle "no targets detected" gracefully**

In `src/app.tsx`, if `targets.length === 0`, show a helpful message instead of an empty selection screen:

In the select phase, TargetSelect already shows "No targets detected in this directory" — verify this works by running `klumpen` in a directory with no bundler configs.

**Step 2: Handle keyboard input during building phase**

Add to the `useKeyboard` handler in `app.tsx`:

```typescript
if (phase === "building") {
  if (key.name === "q" || key.name === "escape") {
    renderer.destroy()
  }
}
```

**Step 3: Test the full flow**

Run klumpen in a real project and verify:
1. Targets are detected
2. Selection works (j/k, space, a, n, enter)
3. Build runs and shows progress
4. Results display with tab navigation
5. q exits from any phase

**Step 4: Commit**

Run: `git add -A && git commit -m "fix: handle edge cases (no targets, quit during build)"`

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Project scaffolding | package.json, tsconfig.json, bin.ts, src/index.tsx |
| 2 | Types & theme | src/types.ts, src/ui/theme.ts, src/plugins/plugin.ts |
| 3 | Detection orchestrator | src/detect.ts |
| 4 | Analysis utilities | src/analysis/analyze.ts |
| 5 | esbuild plugin | src/plugins/esbuild.ts |
| 6 | Vite plugin | src/plugins/vite.ts |
| 7 | Webpack plugin | src/plugins/webpack.ts |
| 8 | Target selection UI | src/ui/target-select.tsx |
| 9 | Build progress UI | src/ui/build-progress.tsx |
| 10 | Results views | src/ui/summary.tsx, package-table.tsx, module-list.tsx, import-chain.tsx |
| 11 | Main App component | src/app.tsx |
| 12 | Wire up entry point | src/index.tsx |
| 13 | CLI executable & test | bin.ts |
| 14 | Polish & edge cases | src/app.tsx, src/ui/target-select.tsx |
