export interface DetectedTarget {
  name: string
  bundler: string
  entry?: string
  configPath: string
}

export interface ModuleInfo {
  path: string
  bytes: number
  isNodeModule: boolean
}

export interface PackageGroup {
  name: string
  bytes: number
  files: ModuleInfo[]
}

export interface ImportGraph {
  edges: Record<string, string[]>
}

export interface BundleResult {
  target: string
  bundler: string
  entry?: string
  outputBytes: number
  inputBytes: number
  modules: ModuleInfo[]
  packages: PackageGroup[]
  importGraph: ImportGraph
}
