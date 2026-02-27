import { writeFileSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { exec } from "node:child_process"
import type { BundleResult } from "@klumpen/shared"

const ANALYZER_HTML_PATH = resolve(
  import.meta.dirname,
  "../../node_modules/@klumpen/analyzer/dist/index.html",
)

export function openAnalyzer(result: BundleResult): void {
  let html: string
  try {
    html = readFileSync(ANALYZER_HTML_PATH, "utf-8")
  } catch {
    throw new Error(
      "Analyzer HTML not found. Run `turbo build` in the repo root first.",
    )
  }

  const dataScript = `<script>window.__KLUMPEN_DATA__=${JSON.stringify(result)}</script>`
  html = html.replace("</head>", `${dataScript}\n</head>`)

  const name = result.target.replace(/[^a-z0-9]/gi, "-").toLowerCase()
  const path = join(tmpdir(), `klumpen-${name}-${Date.now()}.html`)
  writeFileSync(path, html, "utf-8")

  const cmd = process.platform === "darwin" ? "open" : "xdg-open"
  exec(`${cmd} "${path}"`)
}
