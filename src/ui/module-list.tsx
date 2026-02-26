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
