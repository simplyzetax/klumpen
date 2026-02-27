interface TooltipProps {
  name: string
  size: string
  pct: string
  x: number
  y: number
}

export function Tooltip({ name, size, pct, x, y }: TooltipProps) {
  return (
    <div
      className="fixed bg-[#1a1a1a] border border-white/20 px-3 py-2 text-xs pointer-events-none z-10 max-w-[300px] leading-relaxed"
      style={{ left: x + 14, top: y + 14 }}
    >
      <div className="text-gray-200 font-bold break-all">{name}</div>
      <div>
        <span className="text-green-400">{size}</span>
        {"  "}
        <span className="text-gray-500">{pct}</span>
      </div>
    </div>
  )
}
