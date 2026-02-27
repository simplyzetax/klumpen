import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import { App } from "./app.tsx"
import { detectTargets } from "./detect.ts"
import { esbuildPlugin } from "./plugins/esbuild.ts"
import { vitePlugin } from "./plugins/vite.ts"
import { webpackPlugin } from "./plugins/webpack.ts"
import { wranglerPlugin } from "./plugins/wrangler.ts"
import { rollupPlugin } from "./plugins/rollup.ts"
import type { BundlerPlugin } from "./plugins/plugin.ts"
import { formatBytes, formatPct } from "@klumpen/shared"

const plugins: BundlerPlugin[] = [wranglerPlugin, esbuildPlugin, vitePlugin, rollupPlugin, webpackPlugin]

// CLI args
const args = process.argv.slice(2)
const targetArg = args.find((a) => !a.startsWith("--"))
const jsonMode = args.includes("--json")
const noTui = args.includes("--no-tui")

const cwd = process.cwd()
const targets = detectTargets(cwd, plugins)

// Non-TUI modes
if (jsonMode || noTui) {
  if (targets.length === 0) {
    console.error("No bundler targets detected in this directory.")
    process.exit(1)
  }

  const selectedTargets = targetArg
    ? targets.filter((t) => t.name === targetArg)
    : targets

  if (selectedTargets.length === 0) {
    console.error(`Target "${targetArg}" not found. Available: ${targets.map((t) => t.name).join(", ")}`)
    process.exit(1)
  }

  for (const target of selectedTargets) {
    const plugin = plugins.find((p) => p.name === target.bundler)
    if (!plugin) {
      console.error(`No plugin for bundler: ${target.bundler}`)
      continue
    }

    try {
      const result = await plugin.analyze(target)

      if (jsonMode) {
        console.log(JSON.stringify(result, null, 2))
      } else {
        console.log(`\n=== ${result.target} (${result.bundler}) ===`)
        console.log(`Output:  ${formatBytes(result.outputBytes)}`)
        console.log(`Sources: ${formatBytes(result.inputBytes)}`)
        console.log("")
        console.log("--- By package ---")
        for (const pkg of result.packages) {
          console.log(
            `${formatBytes(pkg.bytes).padStart(10)}  ${formatPct(pkg.bytes, result.inputBytes).padStart(6)}  ${pkg.name}`,
          )
        }
        console.log("")
        console.log("--- Top 20 modules ---")
        for (const mod of result.modules.slice(0, 20)) {
          console.log(
            `${formatBytes(mod.bytes).padStart(10)}  ${formatPct(mod.bytes, result.inputBytes).padStart(6)}  ${mod.path}`,
          )
        }
      }
    } catch (e) {
      console.error(`Failed to analyze ${target.name}:`, e instanceof Error ? e.message : e)
    }
  }

  process.exit(0)
}

// TUI mode
const renderer = await createCliRenderer({ exitOnCtrlC: true })
createRoot(renderer).render(<App targets={targets} plugins={plugins} />)
