# Insights Engine Design

An analysis layer that detects actionable bundle optimization opportunities and surfaces them in both the TUI and browser treemap.

## Insight Types

Five detectors, each producing structured `Insight` objects sorted by estimated savings:

```ts
type InsightSeverity = "high" | "medium" | "low"

interface Insight {
  type: "deep-import" | "tree-shaking" | "duplicate" | "heavy-alternative" | "unused-dep"
  severity: InsightSeverity
  package: string
  currentBytes: number
  estimatedSavings: number
  message: string
  suggestion: string
}
```

| Type | Detects | Method |
|------|---------|--------|
| **deep-import** | `@fuser/core` when only `FuserError` is needed | Compares bundled files vs total files on disk. If <30% used and package has `exports` sub-paths, suggests the narrowest sub-path. |
| **tree-shaking** | Full lodash shipped for 1 function | Ratio analysis: package >50KB, few files bundled relative to total on disk. |
| **duplicate** | Same package at multiple versions | Groups by package name, flags >1 version in module list. |
| **heavy-alternative** | moment.js (289KB) when dayjs (2KB) exists | Curated map (~15-20 entries) checked against bundled packages. |
| **unused-dep** | axios in package.json but not in bundle | Diffs package.json dependencies against bundled packages. |

## Architecture

```
apps/cli/src/analysis/
  analyze.ts              # existing
  insights/
    index.ts              # orchestrator: runs all detectors, deduplicates, sorts by savings
    deep-import.ts        # sub-path export opportunities
    tree-shaking.ts       # ratio analysis
    duplicate.ts          # multi-version detection
    heavy-alternative.ts  # curated swap suggestions
    unused-dep.ts         # package.json diff
    alternatives.ts       # curated heavyweight-to-lightweight map
```

Each detector is a pure function: `(result: BundleResult, cwd: string) => Insight[]`.

`runInsights()` calls all detectors, deduplicates (a package may trigger multiple), and sorts by `estimatedSavings` descending.

### Data flow

```
plugin.analyze(target)
  -> BundleResult (modules, packages, importGraph)
    -> runInsights(result, cwd)
      -> Insight[]
```

### Shared types

`Insight` and `InsightSeverity` go in `@klumpen/shared` so both TUI and treemap can consume them.

`BundleResult` gets an optional field:

```ts
interface BundleResult {
  // ...existing fields
  insights?: Insight[]
}
```

Populated after analysis, before rendering. `--json` mode gets insights for free.

## Deep-Import Detection

The most valuable and trickiest detector.

### Algorithm

1. From `BundleResult.modules`, collect files belonging to each package.
2. For each package where bundled file count is low relative to total on disk:
   - Read `node_modules/<pkg>/package.json` for the `exports` field
   - Check which sub-paths would cover the files actually bundled
   - Suggest the narrowest sub-path import
3. Flag when:
   - Package total size on disk >100KB
   - Bundled files represent <30% of total files on disk
   - A sub-path export exists that covers the needed modules

### Filesystem reads

- `node_modules/<pkg>/package.json` for the `exports` map
- `node_modules/<pkg>/` directory listing for total file count

### Estimated savings

`currentBytes - (bytes of files covered by suggested sub-path)` — an estimate since actual tree-shaken output depends on bundler.

### Skipped cases

- Packages without an `exports` field (no sub-paths to suggest)
- Workspace packages (marked with `(workspace)` suffix)
- Packages where sub-paths still pull most of the code

### What it does NOT do

- Parse source code for named export usage
- Resolve re-exports across package internals

## UI Design

### Theme addition

```ts
export const C = {
  text: "#e0e0e0",
  dim: "#666666",
  accent: "#ffffff",
  success: "#73c936",
  warning: "#e5c07b",  // new — amber for medium severity
  error: "#ff5f56",
} as const
```

### TUI: Insights tab

Fifth tab: `Summary | Packages | Modules | Import Chains | Insights`

```
  3 issues · -2.2 MB potential savings

  ▸ ‼  -1.9 MB   @fuser/core                              2.1 MB bundled
                  1 of 47 exports used — full package pulled in
                  → import { FuserError } from '@fuser/core/FuserError'

    ⚠  -289 KB   moment                                    289 KB bundled
                  Heavyweight package with lighter alternative
                  → dayjs (2 KB) — API-compatible replacement

    ⚠   -72 KB   lodash                                     72 KB bundled
                  Poor tree-shaking — 1 function used
                  → import get from 'lodash/get'

    ℹ     —      axios
                  In dependencies but absent from bundle (server-only?)
```

Each insight is a 3-line card:
- Line 1: severity icon + savings (green) + package name + current cost (dim, right-aligned)
- Line 2: what's wrong (dim)
- Line 3: `→` + what to do (accent/green)

Severity icons: `‼` high (C.error), `⚠` medium (C.warning), `ℹ` low (C.dim).

Vim navigation (j/k), same scroll pattern as PackageTable.

Empty state: `No issues detected.` in dim.

### TUI: Summary tab enhancement

One new line:

```
  Insights:     3 issues · -2.2 MB potential savings
```

C.warning for issue count, C.success for savings. No issues: `No issues detected` in dim.

### Browser treemap: Insights panel

Slide-out panel from the right edge, toggled by a pill in the header: `3 insights · -2.2 MB`.

- Panel: 320px fixed width, `#111111` background, `border-left: border-white/[0.06]`
- Treemap flexes to fill remaining space
- Same monospace font, same severity colors
- Each insight card mirrors the TUI layout

Interactions:
- Hovering an insight highlights the corresponding treemap tile (white outline pulse)
- Clicking a flagged tile scrolls the panel to that insight
- Panel open/close: `transition: width 200ms`

Tile badges:
- Packages with insights get a 4px colored dot in the top-right corner
- `#ff5f56` for high, `#e5c07b` for medium severity

### --json and --no-tui modes

Both get insights for free via `BundleResult.insights`.

`--no-tui` prints after existing output:

```
--- Insights ---
  ‼  -1.9 MB  @fuser/core — Try: import { FuserError } from '@fuser/core/FuserError'
  ⚠  -289 KB  moment — Try: dayjs (2 KB drop-in replacement)
```
