export interface Tile {
  name: string
  bytes: number
  pct: number
  x: number // character column
  y: number // character row
  w: number // width in chars
  h: number // height in chars
  category: "npm" | "workspace" | "local"
}

interface Item {
  name: string
  bytes: number
  category: "npm" | "workspace" | "local"
}

export function squarify(
  items: Item[],
  x: number,
  y: number,
  w: number,
  h: number,
): Tile[] {
  // Filter out zero-byte items
  const filtered = items.filter((item) => item.bytes > 0)
  if (filtered.length === 0 || w <= 0 || h <= 0) return []

  // Sort descending by bytes
  const sorted = [...filtered].sort((a, b) => b.bytes - a.bytes)

  const totalBytes = sorted.reduce((sum, item) => sum + item.bytes, 0)

  return _squarify(sorted, totalBytes, x, y, w, h)
}

function _squarify(
  items: Item[],
  totalBytes: number,
  x: number,
  y: number,
  w: number,
  h: number,
): Tile[] {
  if (items.length === 0 || w <= 0 || h <= 0) return []

  if (items.length === 1) {
    const item = items[0]!
    return [
      {
        name: item.name,
        bytes: item.bytes,
        pct: totalBytes > 0 ? item.bytes / totalBytes : 0,
        x,
        y,
        w,
        h,
        category: item.category,
      },
    ]
  }

  // Split items into two halves by cumulative bytes (find midpoint)
  const half = totalBytes / 2
  let cumulative = 0
  let splitIdx = 1
  for (let i = 0; i < items.length - 1; i++) {
    cumulative += items[i]!.bytes
    if (cumulative >= half) {
      splitIdx = i + 1
      break
    }
    splitIdx = i + 2
  }

  const firstHalf = items.slice(0, splitIdx)
  const secondHalf = items.slice(splitIdx)

  const firstBytes = firstHalf.reduce((s, item) => s + item.bytes, 0)
  const secondBytes = secondHalf.reduce((s, item) => s + item.bytes, 0)
  const ratio = totalBytes > 0 ? firstBytes / totalBytes : 0.5

  if (w >= h) {
    // Split vertically (left/right)
    const leftW = Math.max(1, Math.round(w * ratio))
    const rightW = Math.max(1, w - leftW)

    const leftTiles =
      firstHalf.length > 0
        ? _squarify(firstHalf, firstBytes, x, y, leftW, h)
        : []
    const rightTiles =
      secondHalf.length > 0
        ? _squarify(secondHalf, secondBytes, x + leftW, y, rightW, h)
        : []

    return [...leftTiles, ...rightTiles]
  } else {
    // Split horizontally (top/bottom)
    const topH = Math.max(1, Math.round(h * ratio))
    const bottomH = Math.max(1, h - topH)

    const topTiles =
      firstHalf.length > 0
        ? _squarify(firstHalf, firstBytes, x, y, w, topH)
        : []
    const bottomTiles =
      secondHalf.length > 0
        ? _squarify(secondHalf, secondBytes, x, y + topH, w, bottomH)
        : []

    return [...topTiles, ...bottomTiles]
  }
}
