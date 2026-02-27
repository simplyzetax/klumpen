import { C } from "./theme.ts"
import type { BundleResult } from "../types.ts"
import { formatBytes } from "../analysis/analyze.ts"

interface SummaryProps {
  result: BundleResult
}

export function Summary({ result }: SummaryProps) {
  const nodeModuleCount = result.modules.filter((m) => m.isNodeModule).length
  const localCount = result.modules.length - nodeModuleCount

  return (
    <box flexDirection="column">
      <box flexDirection="row" marginBottom={1}>
        <text fg={C.dim}>{"Output size:  "}</text>
        <text fg={C.text}>{formatBytes(result.outputBytes)}</text>
      </box>
      <box flexDirection="row">
        <text fg={C.dim}>{"Source size:  "}</text>
        <text fg={C.text}>{formatBytes(result.inputBytes)}</text>
      </box>
      <box flexDirection="row">
        <text fg={C.dim}>{"Packages:     "}</text>
        <text fg={C.text}>{String(result.packages.length)}</text>
      </box>
      <box flexDirection="row">
        <text fg={C.dim}>{"Modules:      "}</text>
        <text fg={C.text}>
          {`${result.modules.length} (${nodeModuleCount} npm, ${localCount} local)`}
        </text>
      </box>
    </box>
  )
}
