interface BreadcrumbProps {
  name: string
  onZoomOut: () => void
}

export function Breadcrumb({ name, onZoomOut }: BreadcrumbProps) {
  return (
    <button
      onClick={onZoomOut}
      className="shrink-0 h-8 px-4 flex items-center gap-2 border-b border-white/[0.06] text-xs text-gray-600 hover:text-gray-200 cursor-pointer transition-colors"
    >
      <span className="text-gray-500">&larr;</span>
      <span>{name}</span>
    </button>
  )
}
