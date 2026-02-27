import type { DetectedTarget, BundleResult } from "@klumpen/shared"

export interface BundlerPlugin {
  name: string
  detect(cwd: string): DetectedTarget[]
  analyze(target: DetectedTarget): Promise<BundleResult>
}
