import type { BundleResult, PackageGroup } from "@klumpen/shared"
import { formatBytes, formatPct } from "@klumpen/shared"

interface HeaderProps {
  result: BundleResult
  zoomedPkg: PackageGroup | null
}

export function Header({ result, zoomedPkg }: HeaderProps) {
  const totalBytes = result.inputBytes || result.outputBytes
  const label = zoomedPkg
    ? `${formatBytes(zoomedPkg.bytes)} · ${formatPct(zoomedPkg.bytes, totalBytes)} of bundle`
    : `${formatBytes(totalBytes)} total input`

  return (
    <div className="shrink-0 px-4 py-2.5 border-b border-white/[0.06] flex items-center gap-3">
      <span className="text-white text-sm">{result.target}</span>
      <span className="text-gray-600 text-xs">{result.bundler}</span>
      <span className="text-gray-500 text-xs ml-auto">{label}</span>
    </div>
  )
}
