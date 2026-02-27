export interface Tile {
  name: string
  path?: string
  bytes: number
  x: number
  y: number
  w: number
  h: number
}

interface Item {
  name: string
  path?: string
  bytes: number
}

export function squarify(items: Item[], x: number, y: number, w: number, h: number): Tile[] {
  const sorted = items.filter((i) => i.bytes > 0).sort((a, b) => b.bytes - a.bytes)
  if (!sorted.length || w <= 0 || h <= 0) return []
  const total = sorted.reduce((s, i) => s + i.bytes, 0)
  return layout(sorted, total, x, y, w, h)
}

function layout(items: Item[], total: number, x: number, y: number, w: number, h: number): Tile[] {
  if (!items.length || w <= 0 || h <= 0) return []

  if (items.length === 1) {
    return [{ ...items[0]!, x, y, w, h }]
  }

  const half = total / 2
  let cum = 0
  let split = 1
  for (let i = 0; i < items.length - 1; i++) {
    cum += items[i]!.bytes
    if (cum >= half) {
      split = i + 1
      break
    }
    split = i + 2
  }

  const a = items.slice(0, split)
  const b = items.slice(split)
  const aBytes = a.reduce((s, i) => s + i.bytes, 0)
  const bBytes = b.reduce((s, i) => s + i.bytes, 0)
  const ratio = total > 0 ? aBytes / total : 0.5

  if (w >= h) {
    const lw = Math.max(1, Math.round(w * ratio))
    const rw = Math.max(1, w - lw)
    return [...layout(a, aBytes, x, y, lw, h), ...layout(b, bBytes, x + lw, y, rw, h)]
  } else {
    const th = Math.max(1, Math.round(h * ratio))
    const bh = Math.max(1, h - th)
    return [...layout(a, aBytes, x, y, w, th), ...layout(b, bBytes, x, y + th, w, bh)]
  }
}
