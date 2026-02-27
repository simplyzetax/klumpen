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

function renderCanvas(
  tiles: Tile[],
  selected: number,
  w: number,
  h: number,
): GridCell[][] {
  const grid: GridCell[][] = Array.from({ length: h }, () =>
    Array.from({ length: w }, () => ({ char: " ", color: C.dim })),
  )

  const totalBytes = tiles.reduce((s, t) => s + t.bytes, 0)

  for (let ti = 0; ti < tiles.length; ti++) {
    const tile = tiles[ti]!
    const isSelected = ti === selected
    const baseColor = isSelected
      ? C.text
      : tile.category === "workspace"
        ? C.accent
        : tile.category === "local"
          ? C.success
          : C.dim

    // Fill tile with block chars
    for (let row = tile.y; row < tile.y + tile.h && row < h; row++) {
      for (let col = tile.x; col < tile.x + tile.w && col < w; col++) {
        const gridRow = grid[row]
        if (gridRow) {
          gridRow[col] = { char: "\u2588", color: baseColor }
        }
      }
    }

    // Draw label if tile is large enough
    if (tile.w >= 8 && tile.h >= 2) {
      const labelColor =
        isSelected
          ? "#000000"
          : tile.category === "npm"
            ? C.text
            : "#000000"
      const name =
        tile.name.length > tile.w - 2
          ? tile.name.slice(0, tile.w - 3) + "\u2026"
          : tile.name
      const size = formatBytes(tile.bytes)
      const pct = formatPct(tile.bytes, totalBytes)
      const line2 = `${size} ${pct}`

      // Center name on middle row
      const midRow =
        Math.floor(tile.y + tile.h / 2) - (tile.h >= 3 ? 1 : 0)
      const nameStart = Math.max(
        tile.x,
        tile.x + Math.floor((tile.w - name.length) / 2),
      )
      const midRowArr = grid[midRow]
      if (midRowArr) {
        for (
          let ci = 0;
          ci < name.length && nameStart + ci < tile.x + tile.w;
          ci++
        ) {
          const cell = midRowArr[nameStart + ci]
          if (cell) {
            midRowArr[nameStart + ci] = { char: name[ci]!, color: labelColor }
          }
        }
      }

      // Size on next row if tall enough
      if (tile.h >= 3) {
        const sizeRow = midRow + 1
        const sizeStart = Math.max(
          tile.x,
          tile.x + Math.floor((tile.w - line2.length) / 2),
        )
        const sizeRowArr = grid[sizeRow]
        if (sizeRowArr) {
          for (
            let ci = 0;
            ci < line2.length && sizeStart + ci < tile.x + tile.w;
            ci++
          ) {
            const cell = sizeRowArr[sizeStart + ci]
            if (cell) {
              sizeRowArr[sizeStart + ci] = {
                char: line2[ci]!,
                color: labelColor,
              }
            }
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

  const COLS = process.stdout.columns ?? 80
  const ROWS = process.stdout.rows ?? 24
  // Reserve rows: 4 for header+tabs above, 2 for hints below
  const canvasH = Math.max(4, ROWS - 6)
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
          const pkg = result.packages[selected]
          if (pkg) {
            setZoomedPkg(pkg)
            setSelected(0)
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
      {/* Title line */}
      <box marginBottom={1}>
        {zoomedPkg ? (
          <text fg={C.text}>
            {zoomedPkg.name} <span fg={C.dim}>— files</span>
          </text>
        ) : (
          <text fg={C.dim}>{result.packages.length} packages</text>
        )}
        {selTile && (
          <text fg={C.dim}>{`  ${selTile.name}  ${formatBytes(selTile.bytes)}`}</text>
        )}
      </box>

      {/* Canvas rows */}
      {grid.map((row, rowIdx) => {
        // Compress consecutive same-color chars into segments
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

      {/* Hints */}
      <box marginTop={1}>
        <text>
          <span fg={C.accent}>{"↑↓←→"}</span>
          <span fg={C.dim}>{" navigate "}</span>
          <span fg={C.dim}>{" · "}</span>
          <span fg={C.accent}>{"enter"}</span>
          <span fg={C.dim}>{" zoom in "}</span>
          {zoomedPkg && (
            <>
              <span fg={C.dim}>{" · "}</span>
              <span fg={C.accent}>{"esc"}</span>
              <span fg={C.dim}>{" zoom out "}</span>
            </>
          )}
          <span fg={C.dim}>{" · "}</span>
          <span fg={C.accent}>{"tab"}</span>
          <span fg={C.dim}>{" switch view "}</span>
          <span fg={C.dim}>{" · "}</span>
          <span fg={C.accent}>{"q"}</span>
          <span fg={C.dim}>{" quit"}</span>
        </text>
      </box>
    </box>
  )
}
