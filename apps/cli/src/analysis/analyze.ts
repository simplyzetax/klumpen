import type { ModuleInfo, PackageGroup, ImportGraph } from "../types.ts"

export function groupModulesByPackage(modules: ModuleInfo[]): PackageGroup[] {
  const groups: Record<string, ModuleInfo[]> = {}

  for (const mod of modules) {
    const group = getPackageName(mod.path)
    if (!groups[group]) groups[group] = []
    groups[group]!.push(mod)
  }

  return Object.entries(groups)
    .map(([name, files]) => ({
      name,
      bytes: files.reduce((sum, f) => sum + f.bytes, 0),
      files: files.sort((a, b) => b.bytes - a.bytes),
    }))
    .sort((a, b) => b.bytes - a.bytes)
}

export function getPackageName(filePath: string): string {
  // node_modules anywhere in path (handles pnpm/yarn symlinks, nested installs)
  if (filePath.includes("node_modules/")) {
    const parts = filePath.split("node_modules/").pop()!.split("/")
    return parts[0]!.startsWith("@") ? `${parts[0]}/${parts[1]}` : parts[0]!
  }

  // Strip leading ./
  const path = filePath.startsWith("./") ? filePath.slice(2) : filePath

  // Paths going up from cwd — esbuild followed symlinks to workspace packages
  if (path.startsWith("../")) {
    const parts = path.split("/")
    // Skip all leading ".." segments
    let i = 0
    while (i < parts.length && parts[i] === "..") i++
    const real = parts.slice(i)
    if (real.length === 0) return "(local)"

    // ../../packages/name/... or ../../apps/name/... → workspace package name
    const monorepoTopDirs = ["packages", "apps", "libs", "services", "workers", "modules"]
    if (monorepoTopDirs.includes(real[0]!) && real.length >= 2) {
      return `${real[1]} (workspace)`
    }
    // Anything else going up — use first real segment
    return `${real[0]} (local)`
  }

  // Local source files — group by first path segment (e.g. "src")
  const firstSegment = path.split("/")[0]!
  return firstSegment ? `${firstSegment} (local)` : "(local)"
}

export function buildImportGraph(
  inputs: Record<string, { imports?: { path: string }[] }>,
): ImportGraph {
  const edges: Record<string, string[]> = {}

  for (const [file, info] of Object.entries(inputs)) {
    for (const imp of info.imports ?? []) {
      if (!edges[imp.path]) edges[imp.path] = []
      edges[imp.path]!.push(file)
    }
  }

  return { edges }
}

export function findImportChain(
  graph: ImportGraph,
  targetFile: string,
  entryFile: string,
): string[] | null {
  const visited = new Set<string>()
  const queue: string[][] = [[targetFile]]

  while (queue.length > 0) {
    const chain = queue.shift()!
    const current = chain[chain.length - 1]!

    if (current === entryFile) return chain.reverse()
    if (visited.has(current)) continue
    visited.add(current)

    for (const parent of graph.edges[current] ?? []) {
      queue.push([...chain, parent])
    }
  }

  return null
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  const mb = kb / 1024
  return `${mb.toFixed(2)} MB`
}

export function formatPct(bytes: number, total: number): string {
  if (total === 0) return "0.0%"
  return `${((bytes / total) * 100).toFixed(1)}%`
}
