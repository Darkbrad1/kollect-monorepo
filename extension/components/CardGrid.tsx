import { useEffect, useRef, useState, type ReactNode } from "react"

import { CARD_HEIGHT, CARD_WIDTH, CardSkeleton } from "./MangaCard"

const COLUMNS = 5
const GAP_Y = 12
const ROW = CARD_HEIGHT + GAP_Y
// Two rows is 10 manga — the "10 ahead and 10 behind" we agreed on.
const BUFFER_ROWS = 2

/**
 * The scrolling grid of cards. Only the rows on screen, plus two rows
 * above and below, are drawn, so a library of thousands scrolls as
 * smoothly as one of ten.
 */
export function CardGrid<T>({
  items,
  keyOf,
  render
}: {
  items: T[]
  keyOf: (item: T) => string
  render: (item: T) => ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [height, setHeight] = useState(536)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    setHeight(el.clientHeight)
    const observer = new ResizeObserver(() => setHeight(el.clientHeight))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const rows = Math.ceil(items.length / COLUMNS)
  const first = Math.max(0, Math.floor(scrollTop / ROW) - BUFFER_ROWS)
  const last = Math.min(rows - 1, Math.ceil((scrollTop + height) / ROW) + BUFFER_ROWS)
  const visible = items.slice(first * COLUMNS, (last + 1) * COLUMNS)

  return (
    <div
      ref={ref}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      className="k-scroll relative min-h-0 flex-1 overflow-y-auto">
      <div style={{ height: Math.max(0, rows * ROW - GAP_Y) }} className="relative">
        <div
          style={{ top: first * ROW, rowGap: GAP_Y, gridTemplateColumns: `repeat(${COLUMNS}, ${CARD_WIDTH}px)` }}
          className="absolute inset-x-0 grid justify-between">
          {visible.map((item) => (
            <div key={keyOf(item)}>{render(item)}</div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function GridSkeleton() {
  return (
    <div
      style={{ rowGap: GAP_Y, gridTemplateColumns: `repeat(${COLUMNS}, ${CARD_WIDTH}px)` }}
      className="grid min-h-0 flex-1 justify-between overflow-hidden">
      {Array.from({ length: 10 }, (_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  )
}
