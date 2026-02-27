# Treemap View — Design

**Date:** 2026-02-26
**Status:** Approved

## Summary

Add a 5th tab called **Treemap** (between Packages and Modules) that renders a 2D squarify treemap of the bundle, colored by package category, with zoom-in drill-down to individual files.

## Architecture

### Component tree

```
App
└── Treemap (new tab)
    ├── package view  — all packages as tiles (default)
    └── file view     — files of one selected package (after zoom)
```

### State

| Field | Type | Description |
|---|---|---|
| `selectedTile` | `number` | Index of currently focused tile |
| `zoomedPackage` | `PackageGroup \| null` | Non-null when zoomed into a package |

## Tile Algorithm

**Squarify** — standard recursive treemap algorithm.
Input: array of `{name, bytes}` items, canvas bounds `{x, y, w, h}` in character coordinates.
Output: array of `Tile` objects with `{x, y, w, h, name, bytes, pct, category}`.

Canvas dimensions are read from `process.stdout.columns` and `process.stdout.rows`, minus rows consumed by the header, tab bar, and footer hint line.

## Rendering

The treemap is rendered **row-by-row** using OpenTUI `<text>` + `<span>` elements. For each character row, we scan all tiles and emit colored spans. This avoids needing absolute positioning.

### Colors (minimal palette)

| Category | Color | Hex |
|---|---|---|
| npm package | dim | `#666666` |
| workspace package | accent | `#ffffff` |
| local source | success | `#73c936` |
| selected tile | text (highlighted) | `#e0e0e0` |

### Labels

Centered inside each tile. Shown only when tile is ≥ 8 chars wide and ≥ 2 rows tall.
Format: `name` on line 1, `size · pct%` on line 2 (if height ≥ 3).
Long names are truncated with `…`.

## Navigation & Interaction

| Key | Action |
|---|---|
| `←↑→↓` | Move cursor to nearest tile in that direction (center-distance heuristic) |
| `enter` | Zoom into selected package — re-run squarify on its files |
| `esc` | Zoom back out to package level |
| `tab` | Switch to next tab (handled by parent App) |
| `q` | Quit |

## Drill-down (File View)

When zoomed in, the same squarify layout runs on `PackageGroup.files`. File tiles use a single uniform color (accent). Labels show the relative file path (truncated). `esc` returns to the package view.

## Keyboard Hints

Footer line:
`enter zoom in · esc zoom out · ↑↓←→ navigate · tab switch view · q quit`

When in file view, `esc` hint becomes `esc zoom out`.
