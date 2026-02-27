import { useState } from "react"
import type { BundleResult, PackageGroup } from "@klumpen/shared"
import { Header } from "./components/Header.tsx"
import { Breadcrumb } from "./components/Breadcrumb.tsx"
import { Treemap } from "./components/Treemap.tsx"

interface AppProps {
  result: BundleResult
}

export function App({ result }: AppProps) {
  const [zoomedPkg, setZoomedPkg] = useState<PackageGroup | null>(null)

  const handleDrillDown = (pkg: PackageGroup) => {
    if (pkg.files.length > 1) {
      setZoomedPkg(pkg)
    }
  }

  const handleZoomOut = () => setZoomedPkg(null)

  return (
    <>
      <Header result={result} zoomedPkg={zoomedPkg} />
      {zoomedPkg && (
        <Breadcrumb name={zoomedPkg.name} onZoomOut={handleZoomOut} />
      )}
      <Treemap
        result={result}
        zoomedPkg={zoomedPkg}
        onDrillDown={handleDrillDown}
      />
      <div className="shrink-0 h-7 px-4 flex items-center gap-4 border-t border-white/[0.06] text-[11px] text-gray-700">
        <span className="text-gray-500">click</span> drill into package
        <span className="mx-1">·</span>
        <span className="text-gray-500">breadcrumb</span> zoom out
      </div>
    </>
  )
}
