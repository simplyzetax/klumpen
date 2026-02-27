# klumpen

A universal bundle analyzer for JavaScript projects. Auto-detects your bundler, runs the build, and shows an interactive breakdown in your terminal.

## Supported Bundlers

esbuild &middot; Vite &middot; webpack &middot; Wrangler

## Install

```bash
bun add -g klumpen
```

## Usage

```bash
cd your-project
klumpen
```

Klumpen scans for bundler configs, builds your project, and opens an interactive TUI with four views:

- **Summary** — output size, source size, package & module counts
- **Packages** — npm packages sorted by contribution to bundle size
- **Modules** — individual files sorted by size
- **Import Chains** — how each package is reached from the entry point

Press `o` to open a treemap visualization in your browser.

### Flags

```
klumpen [target]   Analyze a specific target by name
klumpen --no-tui   Plain text output
klumpen --json     JSON output for scripting
```

### Keys

| Key | Action |
|-----|--------|
| `tab` | Switch views |
| `j` / `k` | Navigate |
| `[` / `]` | Switch targets |
| `o` | Open treemap |
| `q` | Quit |

## How It Works

Klumpen auto-detects bundler targets in your project (including monorepo subdirectories like `apps/`, `packages/`, `services/`), invokes each bundler's native build, parses the output metadata, and renders the results.

## License

MIT
