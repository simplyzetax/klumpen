import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"

function App() {
  return (
    <box flexDirection="column" paddingX={2} paddingY={1}>
      <text fg="#ffffff">klumpen</text>
      <text fg="#666666">Universal Bundle Analyzer</text>
    </box>
  )
}

const renderer = await createCliRenderer({ exitOnCtrlC: true })
createRoot(renderer).render(<App />)
