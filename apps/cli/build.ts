import { writeFileSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

const analyzerHtml = readFileSync(
  resolve(import.meta.dirname, "../../packages/analyzer/dist/index.html"),
  "utf-8",
)

writeFileSync(
  resolve(import.meta.dirname, "src/_analyzer-html.ts"),
  `export default ${JSON.stringify(analyzerHtml)};\n`,
)

const result = await Bun.build({
  entrypoints: ["./bin.ts"],
  outdir: "./dist",
  target: "bun",
  format: "esm",
  external: ["@opentui/core", "@opentui/react", "react"],
})

if (!result.success) {
  for (const log of result.logs) {
    console.error(log)
  }
  process.exit(1)
}

console.log("Built dist/bin.js")
