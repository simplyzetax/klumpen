import { useKeyboard, useRenderer } from "@opentui/react"
import { useState, useEffect } from "react"
import { C } from "./ui/theme.ts"
import { TargetSelect } from "./ui/target-select.tsx"
import { BuildProgress, type BuildState } from "./ui/build-progress.tsx"
import { Summary } from "./ui/summary.tsx"
import { PackageTable } from "./ui/package-table.tsx"
import { ModuleList } from "./ui/module-list.tsx"
import { ImportChain } from "./ui/import-chain.tsx"
import type { DetectedTarget, BundleResult } from "./types.ts"
import type { BundlerPlugin } from "./plugins/plugin.ts"

type Phase = "select" | "building" | "results"
type Tab = "summary" | "packages" | "modules" | "chains"

const TABS: { key: Tab; label: string }[] = [
  { key: "summary", label: "Summary" },
  { key: "packages", label: "Packages" },
  { key: "modules", label: "Modules" },
  { key: "chains", label: "Import Chains" },
]

interface AppProps {
  targets: DetectedTarget[]
  plugins: BundlerPlugin[]
}

export function App({ targets, plugins }: AppProps) {
  const renderer = useRenderer()
  const [phase, setPhase] = useState<Phase>("select")
  const [builds, setBuilds] = useState<BuildState[]>([])
  const [results, setResults] = useState<BundleResult[]>([])
  const [activeTab, setActiveTab] = useState<Tab>("summary")
  const [activeResult, setActiveResult] = useState(0)

  useEffect(() => {
    if (phase !== "building") return

    const run = async () => {
      const selectedTargets = builds.map((b) => b.target)

      for (let i = 0; i < selectedTargets.length; i++) {
        const target = selectedTargets[i]!

        setBuilds((prev) =>
          prev.map((b, j) => (j === i ? { ...b, status: "running" as const } : b)),
        )

        const plugin = plugins.find((p) => p.name === target.bundler)
        if (!plugin) {
          setBuilds((prev) =>
            prev.map((b, j) =>
              j === i ? { ...b, status: "failed" as const, error: "No plugin found" } : b,
            ),
          )
          continue
        }

        try {
          const result = await plugin.analyze(target)
          setResults((prev) => [...prev, result])
          setBuilds((prev) =>
            prev.map((b, j) =>
              j === i ? { ...b, status: "done" as const, result } : b,
            ),
          )
        } catch (e) {
          setBuilds((prev) =>
            prev.map((b, j) =>
              j === i
                ? {
                    ...b,
                    status: "failed" as const,
                    error: e instanceof Error ? e.message : String(e),
                  }
                : b,
            ),
          )
        }
      }

      setPhase("results")
    }

    run()
  }, [phase])

  useKeyboard((key) => {
    if (phase === "building") {
      if (key.name === "q" || key.name === "escape") {
        renderer.destroy()
      }
    }

    if (phase === "results") {
      switch (key.name) {
        case "tab": {
          const idx = TABS.findIndex((t) => t.key === activeTab)
          setActiveTab(TABS[(idx + 1) % TABS.length]!.key)
          break
        }
        case "[":
          setActiveResult((r) => Math.max(0, r - 1))
          break
        case "]":
          setActiveResult((r) => Math.min(results.length - 1, r + 1))
          break
        case "q":
        case "escape":
          renderer.destroy()
          break
      }
    }
  })

  const handleSubmit = (selected: DetectedTarget[]) => {
    setBuilds(selected.map((t) => ({ target: t, status: "pending" as const })))
    setPhase("building")
  }

  const handleQuit = () => {
    renderer.destroy()
  }

  const currentResult = results[activeResult]

  return (
    <box flexDirection="column" paddingX={2} paddingY={1} width="100%">
      <ascii-font text="klumpen" font="tiny" color={C.accent} />

      {phase === "select" && (
        <TargetSelect
          targets={targets}
          onSubmit={handleSubmit}
          onQuit={handleQuit}
        />
      )}

      {phase === "building" && <BuildProgress builds={builds} />}

      {phase === "results" && currentResult && (
        <box flexDirection="column">
          <box flexDirection="row" marginBottom={1}>
            <text fg={C.accent}>{currentResult.target}</text>
            <text fg={C.dim}>{` (${currentResult.bundler})`}</text>
            {results.length > 1 && (
              <text fg={C.dim}>
                {`  [${activeResult + 1}/${results.length}]`}
              </text>
            )}
          </box>

          <box flexDirection="row" marginBottom={1}>
            {TABS.map((tab, i) => (
              <box key={tab.key} flexDirection="row">
                {i > 0 && <text fg={C.dim}>{"  "}</text>}
                <text
                  fg={activeTab === tab.key ? C.accent : C.dim}
                >
                  {activeTab === tab.key ? `[${tab.label}]` : ` ${tab.label} `}
                </text>
              </box>
            ))}
          </box>

          {activeTab === "summary" && <Summary result={currentResult} />}
          {activeTab === "packages" && <PackageTable result={currentResult} />}
          {activeTab === "modules" && <ModuleList result={currentResult} />}
          {activeTab === "chains" && (
            <ImportChain result={currentResult} entryFile={currentResult.modules[0]?.path} />
          )}

          <box marginTop={1}>
            <text>
              <span fg={C.accent}>tab</span>
              <span fg={C.dim}> switch view </span>
              {results.length > 1 && (
                <>
                  <span fg={C.dim}> · </span>
                  <span fg={C.accent}>[ ]</span>
                  <span fg={C.dim}> switch target </span>
                </>
              )}
              <span fg={C.dim}> · </span>
              <span fg={C.accent}>↑↓</span>
              <span fg={C.dim}> navigate </span>
              <span fg={C.dim}> · </span>
              <span fg={C.accent}>q</span>
              <span fg={C.dim}> quit</span>
            </text>
          </box>
        </box>
      )}
    </box>
  )
}
