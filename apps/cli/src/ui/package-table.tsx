import { useKeyboard } from "@opentui/react"
import { useState } from "react"
import { C } from "./theme.ts"
import type { BundleResult, PackageGroup } from "@klumpen/shared"
import { formatBytes, formatPct } from "@klumpen/shared"

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
        const bar = "\u2588".repeat(filled) + "\u2591".repeat(barWidth - filled)

        return (
          <box key={`pkg-${idx}`} flexDirection="row">
            <text fg={active ? C.accent : "transparent"}>
              {active ? "\u25B8 " : "  "}
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
