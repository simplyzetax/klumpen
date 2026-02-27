import { writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { exec } from "node:child_process"
import type { BundleResult } from "./types.ts"

export function openAnalyzer(result: BundleResult): void {
  const html = buildHtml(result)
  const name = result.target.replace(/[^a-z0-9]/gi, "-").toLowerCase()
  const path = join(tmpdir(), `klumpen-${name}-${Date.now()}.html`)
  writeFileSync(path, html, "utf-8")

  const cmd = process.platform === "darwin" ? "open" : "xdg-open"
  exec(`${cmd} "${path}"`)
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function buildHtml(result: BundleResult): string {
  const packages = result.packages.map((p) => ({
    name: p.name,
    bytes: p.bytes,
    files: p.files.map((f) => ({
      name: f.path.split("/").pop() ?? f.path,
      path: f.path,
      bytes: f.bytes,
    })),
  }))

  const totalBytes = result.inputBytes || result.outputBytes

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>klumpen · ${esc(result.target)}</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 100%; height: 100%; overflow: hidden; }
body { background: #0d0d0d; color: #e0e0e0; font-family: monospace; display: flex; flex-direction: column; }
#header { flex: 0 0 auto; padding: 10px 16px; border-bottom: 1px solid #1e1e1e; display: flex; align-items: center; gap: 12px; }
#header .title { color: #fff; font-size: 14px; }
#header .meta { color: #555; font-size: 12px; }
#header .total { color: #888; font-size: 12px; margin-left: auto; }
#breadcrumb { flex: 0 0 auto; height: 32px; padding: 0 16px; display: none; align-items: center; gap: 8px; border-bottom: 1px solid #1e1e1e; font-size: 12px; color: #555; cursor: pointer; }
#breadcrumb:hover { color: #e0e0e0; }
#breadcrumb .arrow { color: #888; }
#chart { flex: 1 1 auto; position: relative; overflow: hidden; }
#chart svg { display: block; }
#hint { flex: 0 0 auto; height: 28px; padding: 0 16px; display: flex; align-items: center; gap: 16px; border-top: 1px solid #1e1e1e; font-size: 11px; color: #333; }
#hint span { color: #555; }
#tooltip { position: fixed; background: #1a1a1a; border: 1px solid #333; padding: 8px 12px; font-size: 12px; pointer-events: none; display: none; z-index: 10; max-width: 300px; line-height: 1.6; }
#tooltip .tip-name { color: #e0e0e0; font-weight: bold; word-break: break-all; }
#tooltip .tip-size { color: #73c936; }
#tooltip .tip-pct { color: #888; }
rect.tile { stroke: #0d0d0d; stroke-width: 1.5; cursor: pointer; transition: opacity 0.1s; }
rect.tile:hover { opacity: 0.8; }
text.label { pointer-events: none; dominant-baseline: middle; text-anchor: middle; font-family: monospace; fill: rgba(255,255,255,0.85); }
</style>
</head>
<body>
<div id="header">
  <div class="title">${esc(result.target)}</div>
  <div class="meta">${esc(result.bundler)}</div>
  <div class="total" id="total-label"></div>
</div>
<div id="breadcrumb" onclick="zoomOut()">
  <span class="arrow">←</span>
  <span id="breadcrumb-name"></span>
</div>
<div id="chart"></div>
<div id="hint">
  <span>click</span> drill into package &nbsp;·&nbsp; <span>breadcrumb</span> zoom out
</div>
<div id="tooltip"></div>
<script>
const packages = ${JSON.stringify(packages)};
const totalBytes = ${totalBytes};

function squarify(items, x, y, w, h) {
  const sorted = [...items].filter(i => i.bytes > 0).sort((a, b) => b.bytes - a.bytes);
  if (!sorted.length || w <= 0 || h <= 0) return [];
  const total = sorted.reduce((s, i) => s + i.bytes, 0);
  return _sq(sorted, total, x, y, w, h);
}

function _sq(items, total, x, y, w, h) {
  if (!items.length || w <= 0 || h <= 0) return [];
  if (items.length === 1) {
    return [{ ...items[0], x, y, w, h, pct: total > 0 ? items[0].bytes / total : 0 }];
  }
  const half = total / 2;
  let cum = 0, split = 1;
  for (let i = 0; i < items.length - 1; i++) {
    cum += items[i].bytes;
    if (cum >= half) { split = i + 1; break; }
    split = i + 2;
  }
  const a = items.slice(0, split), b = items.slice(split);
  const aBytes = a.reduce((s, i) => s + i.bytes, 0);
  const bBytes = b.reduce((s, i) => s + i.bytes, 0);
  const ratio = total > 0 ? aBytes / total : 0.5;
  if (w >= h) {
    const lw = Math.max(1, Math.round(w * ratio)), rw = Math.max(1, w - lw);
    return [..._sq(a, aBytes, x, y, lw, h), ..._sq(b, bBytes, x + lw, y, rw, h)];
  } else {
    const th = Math.max(1, Math.round(h * ratio)), bh = Math.max(1, h - th);
    return [..._sq(a, aBytes, x, y, w, th), ..._sq(b, bBytes, x, y + th, w, bh)];
  }
}

function fmt(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(2) + ' MB';
}

function fmtPct(b, total) {
  if (!total) return '0.0%';
  return ((b / total) * 100).toFixed(1) + '%';
}

function getColor(name) {
  if (name.includes('(workspace)')) return '#5a6e8a';
  if (name.includes('(local)'))    return '#3d6b2e';
  return '#3a3a3a';
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

let zoomedPkg = null;
const chart = document.getElementById('chart');
const breadcrumb = document.getElementById('breadcrumb');
const breadcrumbName = document.getElementById('breadcrumb-name');
const totalLabel = document.getElementById('total-label');
const tooltip = document.getElementById('tooltip');

function render() {
  const W = chart.clientWidth;
  const H = chart.clientHeight;

  const items = zoomedPkg ? zoomedPkg.files : packages;
  const tileTotal = items.reduce((s, i) => s + i.bytes, 0);

  if (zoomedPkg) {
    totalLabel.textContent = fmt(zoomedPkg.bytes) + ' · ' + fmtPct(zoomedPkg.bytes, totalBytes) + ' of bundle';
  } else {
    totalLabel.textContent = fmt(tileTotal) + ' total input';
  }

  const tiles = squarify(items, 0, 0, W, H);
  const GAP = 2;

  let svgParts = ['<svg width="' + W + '" height="' + H + '" xmlns="http://www.w3.org/2000/svg">'];

  for (let idx = 0; idx < tiles.length; idx++) {
    const t = tiles[idx];
    const tw = Math.max(0, t.w - GAP);
    const th = Math.max(0, t.h - GAP);
    if (tw <= 0 || th <= 0) continue;

    const color = getColor(zoomedPkg ? '(local)' : t.name);
    const name = t.name || t.path || '';
    const pct = fmtPct(t.bytes, tileTotal);
    const size = fmt(t.bytes);

    svgParts.push('<rect class="tile" x="' + t.x + '" y="' + t.y + '" width="' + tw + '" height="' + th + '" fill="' + color + '" data-idx="' + idx + '" data-name="' + escHtml(name) + '" data-size="' + escHtml(size) + '" data-pct="' + escHtml(pct) + '"/>');

    const hasLabel = tw >= 50 && th >= 20;
    if (hasLabel) {
      const maxChars = Math.floor(tw / 7);
      const label = name.length > maxChars ? name.slice(0, maxChars - 1) + '\u2026' : name;
      const hasSize = th >= 40;
      const labelY = hasSize ? t.y + th / 2 - 7 : t.y + th / 2;
      const fontSize = Math.min(12, Math.max(9, tw / Math.max(label.length, 1) * 1.3));
      svgParts.push('<text class="label" x="' + (t.x + tw / 2) + '" y="' + labelY + '" font-size="' + fontSize.toFixed(1) + '">' + escHtml(label) + '</text>');
      if (hasSize) {
        svgParts.push('<text class="label" x="' + (t.x + tw / 2) + '" y="' + (labelY + 15) + '" font-size="10" fill="#999">' + escHtml(size + ' · ' + pct) + '</text>');
      }
    }
  }

  svgParts.push('</svg>');
  chart.innerHTML = svgParts.join('');

  chart.querySelectorAll('rect.tile').forEach((r) => {
    r.addEventListener('click', () => {
      const idx = parseInt(r.getAttribute('data-idx'));
      if (!zoomedPkg) {
        const tileName = tiles[idx] && tiles[idx].name;
        const found = packages.find(p => p.name === tileName);
        if (found && found.files && found.files.length > 1) {
          zoomedPkg = found;
          breadcrumbName.textContent = found.name;
          breadcrumb.style.display = 'flex';
          render();
        }
      }
    });

    r.addEventListener('mousemove', (e) => {
      tooltip.style.display = 'block';
      tooltip.style.left = (e.clientX + 14) + 'px';
      tooltip.style.top = (e.clientY + 14) + 'px';
      const name = r.getAttribute('data-name');
      const size = r.getAttribute('data-size');
      const pct = r.getAttribute('data-pct');
      tooltip.innerHTML = '<div class="tip-name">' + escHtml(name) + '</div>' +
        '<div><span class="tip-size">' + escHtml(size) + '</span>  <span class="tip-pct">' + escHtml(pct) + '</span></div>';
    });

    r.addEventListener('mouseleave', () => {
      tooltip.style.display = 'none';
    });
  });
}

function zoomOut() {
  if (zoomedPkg) {
    zoomedPkg = null;
    breadcrumb.style.display = 'none';
    render();
  }
}

window.addEventListener('resize', render);
render();
</script>
</body>
</html>`
}
