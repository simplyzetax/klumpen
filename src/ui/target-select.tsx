import { useKeyboard } from "@opentui/react"
import { useState } from "react"
import { existsSync } from "node:fs"
import { resolve, dirname } from "node:path"
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
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [editValue, setEditValue] = useState("")
  const [customEntries, setCustomEntries] = useState<Record<number, string>>({})
  const [entryErrors, setEntryErrors] = useState<Record<number, boolean>>({})

  useKeyboard((key) => {
    // Edit mode — consume all keys
    if (editingIdx !== null) {
      if (key.name === "escape") {
        setEditingIdx(null)
      } else if (key.name === "return" || key.name === "enter") {
        const trimmed = editValue.trim()
        setCustomEntries((prev) => {
          const next = { ...prev }
          if (trimmed) next[editingIdx] = trimmed
          else delete next[editingIdx]
          return next
        })
        if (trimmed) {
          const target = targets[editingIdx]
          const base = target ? dirname(target.configPath) : process.cwd()
          const exists = existsSync(resolve(base, trimmed))
          setEntryErrors((prev) => ({ ...prev, [editingIdx]: !exists }))
        } else {
          setEntryErrors((prev) => { const next = { ...prev }; delete next[editingIdx]; return next })
        }
        setEditingIdx(null)
      } else if (key.name === "backspace") {
        setEditValue((v) => v.slice(0, -1))
      } else {
        const ch = (key as unknown as { sequence?: string }).sequence
        if (ch && ch.length === 1 && ch.charCodeAt(0) >= 32) {
          setEditValue((v) => v + ch)
        }
      }
      return
    }

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
      case "e": {
        const current = targets[cursor]
        setEditValue(customEntries[cursor] ?? current?.entry ?? "")
        setEditingIdx(cursor)
        break
      }
      case "enter":
      case "return":
        if (selected.size > 0) {
          const selectedTargets = targets.reduce<DetectedTarget[]>((acc, t, i) => {
            if (selected.has(i)) {
              acc.push(customEntries[i] !== undefined ? { ...t, entry: customEntries[i] } : t)
            }
            return acc
          }, [])
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
          const isEditing = editingIdx === i
          const customEntry = customEntries[i]
          const hasError = !isEditing && entryErrors[i]
          const displayEntry = isEditing
            ? editValue + "_"
            : customEntry ?? target.entry
          const entryColor = isEditing ? C.accent : hasError ? C.error : customEntry ? C.success : C.dim
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
              {displayEntry && (
                <text fg={entryColor}>{" · " + displayEntry}</text>
              )}
              {hasError && (
                <text fg={C.error}>{" ✗ not found"}</text>
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
          <span fg={C.accent}>e</span>
          <span fg={C.dim}> edit entry </span>
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
