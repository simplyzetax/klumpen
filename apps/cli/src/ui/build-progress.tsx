import { C } from "./theme.ts"
import type { DetectedTarget, BundleResult } from "../types.ts"
import { formatBytes } from "../analysis/analyze.ts"

type BuildStatus = "pending" | "running" | "done" | "failed"

export interface BuildState {
  target: DetectedTarget
  status: BuildStatus
  result?: BundleResult
  error?: string
}

interface BuildProgressProps {
  builds: BuildState[]
}

export function BuildProgress({ builds }: BuildProgressProps) {
  return (
    <box flexDirection="column">
      <box marginBottom={1}>
        <text fg={C.dim}>Analyzing...</text>
      </box>

      <box flexDirection="column">
        {builds.map((build, i) => {
          const icon =
            build.status === "done"
              ? "✓"
              : build.status === "failed"
                ? "✗"
                : build.status === "running"
                  ? "●"
                  : "○"
          const color =
            build.status === "done"
              ? C.success
              : build.status === "failed"
                ? C.error
                : build.status === "running"
                  ? C.dim
                  : C.dim

          return (
            <box key={`build-${i}`} flexDirection="row">
              <text fg={color}>{icon + " "}</text>
              <text fg={color}>{build.target.name.padEnd(20)}</text>
              <text fg={C.dim}>{build.target.bundler.padEnd(12)}</text>
              {build.status === "done" && build.result && (
                <text fg={C.success}>
                  {formatBytes(build.result.outputBytes)}
                </text>
              )}
              {build.status === "running" && (
                <text fg={C.dim}>building...</text>
              )}
              {build.status === "failed" && (
                <text fg={C.error}>{build.error ?? "failed"}</text>
              )}
            </box>
          )
        })}
      </box>
    </box>
  )
}
