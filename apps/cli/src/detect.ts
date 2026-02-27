import type { DetectedTarget } from "@klumpen/shared"
import type { BundlerPlugin } from "./plugins/plugin.ts"

export function detectTargets(cwd: string, plugins: BundlerPlugin[]): DetectedTarget[] {
  const targets: DetectedTarget[] = []

  for (const plugin of plugins) {
    targets.push(...plugin.detect(cwd))
  }

  return targets
}
