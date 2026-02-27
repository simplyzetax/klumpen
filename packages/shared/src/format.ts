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
