import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./App.tsx"
import "./index.css"

import type { BundleResult } from "@klumpen/shared"

declare global {
  interface Window {
    __KLUMPEN_DATA__?: BundleResult
  }
}

const data = window.__KLUMPEN_DATA__

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {data ? (
      <App result={data} />
    ) : (
      <div className="flex items-center justify-center h-full text-gray-500">
        No data. Open this from the klumpen CLI.
      </div>
    )}
  </StrictMode>,
)
