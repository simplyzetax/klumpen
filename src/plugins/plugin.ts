import type { DetectedTarget, BundleResult } from "../types.ts"

export interface BundlerPlugin {
  name: string
  detect(cwd: string): DetectedTarget[]
  analyze(target: DetectedTarget): Promise<BundleResult>
}
