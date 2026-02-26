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
