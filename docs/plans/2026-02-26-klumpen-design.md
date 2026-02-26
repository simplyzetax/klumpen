# klumpen — Universal Bundle Analyzer TUI

## Overview

A beautiful terminal UI for analyzing JavaScript/TypeScript bundles across multiple bundlers. Auto-detects project targets, runs analysis, and presents results in an interactive TUI built with OpenTUI + React.

**CLI name:** `klumpen`
**Runtime:** Bun
**TUI framework:** @opentui/react
**Theme:** Clean minimal (few colors, high contrast)

## Supported Bundlers

- **esbuild** — via `--metafile` output
- **Vite** — via Rollup stats JSON (rollup-plugin-visualizer)
- **Webpack** — via `--json` stats output

## Architecture: Plugin-Based

Each bundler is a plugin implementing a common interface. The core UI is bundler-agnostic — it renders a normalized `BundleResult` from any plugin.

### Plugin Interface

```typescript
interface BundlerPlugin {
  name: string
  detect(cwd: string): DetectedTarget[]
  analyze(target: DetectedTarget): Promise<BundleResult>
}
```

### Data Model

```typescript
interface DetectedTarget {
  name: string           // Display name (e.g., "app", "api")
  bundler: string        // Which bundler
  entry?: string         // Entry point if known
  configPath: string     // Path to detected config file
}

interface BundleResult {
  target: string
  bundler: string
  outputBytes: number
  inputBytes: number
  modules: ModuleInfo[]
  packages: PackageGroup[]
  importGraph: ImportGraph
}

interface ModuleInfo {
  path: string
  bytes: number
  isNodeModule: boolean
}

interface PackageGroup {
  name: string
  bytes: number
  files: ModuleInfo[]
}

interface ImportGraph {
  edges: Record<string, string[]>  // file -> imported by
}
```

### Detection Strategy

- **esbuild:** Scripts in `package.json` referencing `esbuild`, or `esbuild.config.*` files
- **Vite:** `vite.config.*` files
- **Webpack:** `webpack.config.*` files or webpack in `package.json` scripts/dependencies

## Project Structure

```
klumpen/
├── src/
│   ├── index.tsx              # Entry point, CLI arg parsing
│   ├── app.tsx                # Root React component, phase management
│   ├── types.ts               # Shared types
│   ├── detect.ts              # Auto-detection orchestrator
│   ├── plugins/
│   │   ├── plugin.ts          # BundlerPlugin interface
│   │   ├── esbuild.ts         # esbuild adapter
│   │   ├── vite.ts            # Vite adapter
│   │   └── webpack.ts         # Webpack adapter
│   ├── analysis/
│   │   └── analyze.ts         # Common analysis (grouping, import chains)
│   └── ui/
│       ├── theme.ts           # Tokyo Night color palette
│       ├── target-select.tsx   # Target selection screen
│       ├── build-progress.tsx  # Live build progress
│       ├── summary.tsx         # Bundle summary view
│       ├── package-table.tsx   # Package breakdown (sortable)
│       ├── module-list.tsx     # Top modules view
│       └── import-chain.tsx    # Import chain drill-down
├── package.json
├── tsconfig.json
└── bin.ts                     # Shebang entry for global CLI
```

## TUI Flow

### Phase 1: Target Selection
- ASCII art "klumpen" header
- Auto-detected targets with bundler type labels
- Multi-select support (space toggle, a=all, n=none)
- vim keys (j/k) + arrow navigation
- Enter to start analysis

### Phase 2: Build Progress
- Sequential builds with live status indicators
- ✓ done (green), ● running (yellow), ○ pending (dim)
- Shows output size as each target completes

### Phase 3: Results (Tab Navigation)
Four tab views: Summary, Packages, Modules, Import Chains

- **Summary:** Output size, source size, package count, module count
- **Packages:** Sorted by size with percentage, drill-down on enter
- **Modules:** Top N individual files sorted by size
- **Import Chains:** BFS path from entry to each package's largest file

Multi-target support: `[`/`]` to switch between analyzed targets.

## Theme

Clean minimal palette — just enough color to convey meaning:
```typescript
const C = {
  text: "#e0e0e0",      // primary text
  dim: "#666666",        // secondary/inactive
  accent: "#ffffff",     // highlighted/selected (bright white)
  success: "#73c936",    // done/success
  error: "#ff5f56",      // failed/error
}
```

## CLI Interface

```
klumpen [target] [--json] [--no-tui] [--trace]

Options:
  target       Specific target name (skip selection screen)
  --json       Output raw JSON (for CI/scripting)
  --no-tui     Plain text table output
  --trace      Include import chain analysis
```

## Distribution

Published to npm with bin entry. Runnable via:
- `bunx klumpen` (in any project directory)
- `npx klumpen`
- `bun add -g klumpen` then `klumpen`
