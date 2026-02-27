import { useKeyboard } from "@opentui/react"
import { useState, useMemo } from "react"
import { C } from "./theme.ts"
import type { BundleResult, PackageGroup } from "../types.ts"
import { squarify, type Tile } from "./treemap-layout.ts"
import { formatBytes, formatPct } from "../analysis/analyze.ts"

interface TreemapProps {
  result: BundleResult
  onTabSwitch: () => void
}

function getCategory(name: string): "npm" | "workspace" | "local" {
  if (name.includes("(workspace)")) return "workspace"
  if (name.includes("(local)")) return "local"
  return "npm"
}

function nearestInDirection(
  tiles: Tile[],
  from: number,
  dir: "up" | "down" | "left" | "right",
): number {
  const cur = tiles[from]
  if (!cur) return from
  const cx = cur.x + cur.w / 2
  const cy = cur.y + cur.h / 2
  let best = from
  let bestDist = Infinity
  for (let i = 0; i < tiles.length; i++) {
    if (i === from) continue
    const t = tiles[i]!
    const tx = t.x + t.w / 2
    const ty = t.y + t.h / 2
    const dx = tx - cx
    const dy = ty - cy
    const inDir =
      dir === "left"
        ? dx < 0
        : dir === "right"
          ? dx > 0
          : dir === "up"
            ? dy < 0
            : dy > 0
    if (!inDir) continue
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < bestDist) {
      bestDist = dist
      best = i
    }
  }
  return best
}

interface GridCell {
  char: string
  color: string
}

function fillColor(category: "npm" | "workspace" | "local"): string {
  if (category === "workspace") return C.accent   // #ffffff
  if (category === "local") return C.success       // #73c936
  return "#888888"                                  // lighter grey — readable on black bg
}

function labelColor(_category: "npm" | "workspace" | "local"): string {
  // Labels replace the █ fill chars — they render on the terminal's dark background,
  // NOT on the tile color. So all labels must be bright to stay readable.
  return C.text // #e0e0e0
}

function renderCanvas(
  tiles: Tile[],
  selected: number,
  w: number,
  h: number,
): GridCell[][] {
  // Default background: dark char so it's clearly a gap between tiles
  const grid: GridCell[][] = Array.from({ length: h }, () =>
    Array.from({ length: w }, () => ({ char: " ", color: C.dim })),
  )

  const totalBytes = tiles.reduce((s, t) => s + t.bytes, 0)

  for (let ti = 0; ti < tiles.length; ti++) {
    const tile = tiles[ti]!
    const isSelected = ti === selected

    const fc = fillColor(tile.category)
    // Leave 1-char gap on right and bottom — creates visible tile separation
    const fillW = Math.max(1, tile.w - 1)
    const fillH = Math.max(1, tile.h - 1)

    // Fill tile body
    // Selected tiles use ▓ (75% shade) — visually lighter than the solid █ of
    // unselected tiles, giving a clear "active" look regardless of category color.
    const fillChar = isSelected ? "\u2593" : "\u2588" // ▓ vs █

    for (let row = tile.y; row < tile.y + fillH && row < h; row++) {
      for (let col = tile.x; col < tile.x + fillW && col < w; col++) {
        grid[row]![col] = { char: fillChar, color: fc }
      }
    }

    // Label — only when tile has enough room
    if (fillW >= 6 && fillH >= 2) {
      const lc = labelColor(tile.category)
      const prefix = isSelected ? "▶ " : ""
      const maxNameLen = Math.max(1, fillW - 2 - prefix.length)
      let name = tile.name
      if (name.length > maxNameLen) name = name.slice(0, maxNameLen - 1) + "\u2026"
      const displayName = prefix + name

      const size = formatBytes(tile.bytes)
      const pct = formatPct(tile.bytes, totalBytes)
      const line2 = `${size} ${pct}`

      // Vertically center — if 3+ rows, put name one row above center
      const midRow =
        Math.floor(tile.y + fillH / 2) - (fillH >= 3 ? 1 : 0)
      const nameCol =
        tile.x + Math.max(1, Math.floor((fillW - displayName.length) / 2))

      const midRowArr = grid[midRow]
      if (midRowArr) {
        for (
          let ci = 0;
          ci < displayName.length && nameCol + ci < tile.x + fillW - 1;
          ci++
        ) {
          midRowArr[nameCol + ci] = { char: displayName[ci]!, color: lc }
        }
      }

      if (fillH >= 3) {
        const sizeRow = midRow + 1
        const sizeCol =
          tile.x + Math.max(1, Math.floor((fillW - line2.length) / 2))
        const sizeRowArr = grid[sizeRow]
        if (sizeRowArr) {
          for (
            let ci = 0;
            ci < line2.length && sizeCol + ci < tile.x + fillW - 1;
            ci++
          ) {
            sizeRowArr[sizeCol + ci] = { char: line2[ci]!, color: lc }
          }
        }
      }
    }
  }

  return grid
}

export function Treemap({ result, onTabSwitch }: TreemapProps) {
  const [selected, setSelected] = useState(0)
  const [zoomedPkg, setZoomedPkg] = useState<PackageGroup | null>(null)

  // Read terminal dimensions at render time
  const COLS = process.stdout.columns ?? 80
  const ROWS = process.stdout.rows ?? 24
  // Reserve: ~3 rows for App header+tabs above, 1 title row, 1 gap, 1 hint row
  const canvasH = Math.max(4, ROWS - 7)
  const canvasW = Math.max(20, COLS - 4)

  const tiles = useMemo(() => {
    if (zoomedPkg) {
      const items = zoomedPkg.files.map((f) => ({
        name: f.path.split("/").pop() ?? f.path,
        bytes: f.bytes,
        category: "local" as const,
      }))
      return squarify(items, 0, 0, canvasW, canvasH)
    }
    const items = result.packages.map((p) => ({
      name: p.name,
      bytes: p.bytes,
      category: getCategory(p.name),
    }))
    return squarify(items, 0, 0, canvasW, canvasH)
  }, [result, zoomedPkg, canvasW, canvasH])

  useKeyboard((key) => {
    switch (key.name) {
      case "up":
        setSelected((s) => nearestInDirection(tiles, s, "up"))
        break
      case "down":
        setSelected((s) => nearestInDirection(tiles, s, "down"))
        break
      case "left":
        setSelected((s) => nearestInDirection(tiles, s, "left"))
        break
      case "right":
        setSelected((s) => nearestInDirection(tiles, s, "right"))
        break
      case "enter":
      case "return":
        if (!zoomedPkg) {
          // Find package by name — tiles are sorted differently than result.packages
          const tile = tiles[selected]
          if (tile) {
            const pkg = result.packages.find((p) => p.name === tile.name)
            if (pkg) {
              setZoomedPkg(pkg)
              setSelected(0)
            }
          }
        }
        break
      case "escape":
        if (zoomedPkg) {
          setZoomedPkg(null)
          setSelected(0)
        }
        break
      case "tab":
        onTabSwitch()
        break
    }
  })

  const grid = useMemo(
    () => renderCanvas(tiles, selected, canvasW, canvasH),
    [tiles, selected, canvasW, canvasH],
  )

  const selTile = tiles[selected]

  return (
    <box flexDirection="column">
      {/* Status line: selected tile info + zoom context */}
      <box marginBottom={1} flexDirection="row">
        {zoomedPkg && (
          <>
            <text fg={C.dim}>{zoomedPkg.name}</text>
            <text fg={C.dim}>{" › "}</text>
          </>
        )}
        {selTile ? (
          <>
            <text fg={C.text}>{selTile.name}</text>
            <text fg={C.dim}>
              {"  "}
              {formatBytes(selTile.bytes)}
              {"  "}
              {formatPct(selTile.bytes, result.inputBytes)}
            </text>
          </>
        ) : (
          <text fg={C.dim}>—</text>
        )}
        {zoomedPkg && (
          <text fg={C.dim}>{"  esc to zoom out"}</text>
        )}
      </box>

      {/* Canvas */}
      {grid.map((row, rowIdx) => {
        const segments: { chars: string; color: string }[] = []
        for (const cell of row) {
          const last = segments[segments.length - 1]
          if (last && last.color === cell.color) {
            last.chars += cell.char
          } else {
            segments.push({ chars: cell.char, color: cell.color })
          }
        }
        return (
          <text key={`row-${rowIdx}`}>
            {segments.map((seg, si) => (
              <span key={si} fg={seg.color}>
                {seg.chars}
              </span>
            ))}
          </text>
        )
      })}
    </box>
  )
}
