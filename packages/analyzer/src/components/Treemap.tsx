import { useRef, useState, useEffect, useCallback } from "react"
import type { BundleResult, PackageGroup } from "@klumpen/shared"
import { formatBytes, formatPct } from "@klumpen/shared"
import { squarify, type Tile } from "../lib/squarify.ts"
import { Tooltip } from "./Tooltip.tsx"

const GAP = 2

interface TreemapProps {
  result: BundleResult
  zoomedPkg: PackageGroup | null
  onDrillDown: (pkg: PackageGroup) => void
}

interface HoverInfo {
  name: string
  size: string
  pct: string
  x: number
  y: number
}

function getTileColor(name: string, isZoomed: boolean): string {
  if (isZoomed) return "#3d6b2e"
  if (name.includes("(workspace)")) return "#5a6e8a"
  if (name.includes("(local)")) return "#3d6b2e"
  return "#3a3a3a"
}

export function Treemap({ result, zoomedPkg, onDrillDown }: TreemapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [hover, setHover] = useState<HoverInfo | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      const { width, height } = entry.contentRect
      setSize({ w: Math.floor(width), h: Math.floor(height) })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const items = zoomedPkg
    ? zoomedPkg.files.map((f) => ({
        name: f.path.split("/").pop() ?? f.path,
        path: f.path,
        bytes: f.bytes,
      }))
    : result.packages.map((p) => ({
        name: p.name,
        bytes: p.bytes,
      }))

  const tileTotal = items.reduce((s, i) => s + i.bytes, 0)
  const tiles = size.w > 0 && size.h > 0 ? squarify(items, 0, 0, size.w, size.h) : []

  const handleClick = useCallback(
    (tile: Tile) => {
      if (zoomedPkg) return
      const pkg = result.packages.find((p) => p.name === tile.name)
      if (pkg) onDrillDown(pkg)
    },
    [zoomedPkg, result.packages, onDrillDown],
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent, tile: Tile) => {
      setHover({
        name: tile.name,
        size: formatBytes(tile.bytes),
        pct: formatPct(tile.bytes, tileTotal),
        x: e.clientX,
        y: e.clientY,
      })
    },
    [tileTotal],
  )

  const handleMouseLeave = useCallback(() => setHover(null), [])

  return (
    <div ref={containerRef} className="grow relative overflow-hidden">
      <svg width={size.w} height={size.h} className="block">
        {tiles.map((tile, i) => {
          const tw = Math.max(0, tile.w - GAP)
          const th = Math.max(0, tile.h - GAP)
          if (tw <= 0 || th <= 0) return null

          const color = getTileColor(tile.name, !!zoomedPkg)
          const hasLabel = tw >= 50 && th >= 20
          const maxChars = Math.floor(tw / 7)
          const label =
            tile.name.length > maxChars
              ? tile.name.slice(0, maxChars - 1) + "\u2026"
              : tile.name
          const hasSize = th >= 40
          const labelY = hasSize ? tile.y + th / 2 - 7 : tile.y + th / 2
          const fontSize = Math.min(12, Math.max(9, (tw / Math.max(label.length, 1)) * 1.3))

          return (
            <g key={i}>
              <rect
                x={tile.x}
                y={tile.y}
                width={tw}
                height={th}
                fill={color}
                className="stroke-[#0d0d0d] stroke-[1.5] cursor-pointer hover:opacity-80 transition-opacity duration-100"
                onClick={() => handleClick(tile)}
                onMouseMove={(e) => handleMouseMove(e, tile)}
                onMouseLeave={handleMouseLeave}
              />
              {hasLabel && (
                <text
                  x={tile.x + tw / 2}
                  y={labelY}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={fontSize}
                  className="pointer-events-none font-mono fill-white/85"
                >
                  {label}
                </text>
              )}
              {hasLabel && hasSize && (
                <text
                  x={tile.x + tw / 2}
                  y={labelY + 15}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={10}
                  className="pointer-events-none font-mono fill-gray-500"
                >
                  {formatBytes(tile.bytes)} · {formatPct(tile.bytes, tileTotal)}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      {hover && <Tooltip {...hover} />}
    </div>
  )
}
