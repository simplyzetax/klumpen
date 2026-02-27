import { writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { exec } from "node:child_process"
import type { BundleResult } from "@klumpen/shared"
import analyzerHtml from "./_analyzer-html.ts"

export function openAnalyzer(result: BundleResult): void {
  const dataScript = `<script>window.__KLUMPEN_DATA__=${JSON.stringify(result)}</script>`
  const html = (analyzerHtml as string).replace("</head>", `${dataScript}\n</head>`)

  const name = result.target.replace(/[^a-z0-9]/gi, "-").toLowerCase()
  const path = join(tmpdir(), `klumpen-${name}-${Date.now()}.html`)
  writeFileSync(path, html, "utf-8")

  const cmd = process.platform === "darwin" ? "open" : "xdg-open"
  exec(`${cmd} "${path}"`)
}
