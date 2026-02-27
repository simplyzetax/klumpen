import { useKeyboard } from "@opentui/react"
import { useState } from "react"
import { C } from "./theme.ts"
import type { BundleResult } from "@klumpen/shared"
import { formatBytes } from "@klumpen/shared"
import { findImportChain } from "../analysis/analyze.ts"

interface ImportChainProps {
  result: BundleResult
  entryFile?: string
}

export function ImportChain({ result, entryFile }: ImportChainProps) {
  const [cursor, setCursor] = useState(0)
  const [scrollOffset, setScrollOffset] = useState(0)
  const visibleRows = 15

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
                {active ? "\u25B8 " : "  "}
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
                  {"  ".repeat(j + 1) + (j === 0 ? "  " : "\u2192 ")}
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
