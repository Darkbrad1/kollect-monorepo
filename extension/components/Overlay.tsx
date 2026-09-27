import { useEffect, useRef, useState } from "react"

import type { ProgressKey } from "~lib/pages"
import { PAGE_ICONS, PROGRESS_PAGES } from "~lib/pages"

import { LogoMark } from "./Logo"
import { cx, Stepper, Switch } from "./ui"

/**
 * The Kollect button on a reading page, bottom left. Clicking it opens a
 * small menu: add the manga to one of the four pages (the page it's on
 * now is highlighted), turn the progress bar on or off, and change the
 * scroll threshold. It stays faint until the mouse is over it, so it
 * doesn't get in the way of reading.
 *
 * It only draws; whoever uses it passes in the manga's page and the
 * settings, and saves the changes.
 */
export function Overlay({
  progressKey,
  onPick,
  showProgressBar,
  onShowProgressBar,
  scrollThreshold,
  onScrollThreshold
}: {
  /** The page the manga is on, or undefined if it isn't in the library yet. */
  progressKey: ProgressKey | undefined
  onPick: (key: ProgressKey) => void
  showProgressBar: boolean
  onShowProgressBar: (on: boolean) => void
  scrollThreshold: number
  onScrollThreshold: (value: number) => void
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  // Clicking anywhere else on the page closes the menu.
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", close)
    return () => document.removeEventListener("mousedown", close)
  }, [open])

  return (
    <div
      ref={root}
      className={cx(
        "fixed bottom-3.5 left-3.5 z-[2147483647] flex flex-col items-start gap-2 font-sans text-fg transition-opacity duration-200",
        open ? "opacity-100" : "opacity-40 hover:opacity-100"
      )}>
      {open && (
        <div className="w-[236px] rounded-lg bg-surface p-1 shadow-pop">
          {PROGRESS_PAGES.map(({ key, label }) => {
            const Icon = PAGE_ICONS[key]
            const here = progressKey === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => onPick(key)}
                className={cx(
                  "flex h-6 w-full items-center gap-2 rounded-md px-2 text-left text-xs transition-colors",
                  here ? "bg-primary text-on-primary" : "hover:bg-raised"
                )}>
                <Icon size={12} className="shrink-0" />
                Add To {label}
              </button>
            )
          })}
          <div className="flex h-6 items-center justify-between whitespace-nowrap px-2 text-xs">
            Show Progress Bar
            <Switch checked={showProgressBar} onChange={onShowProgressBar} label="Show Progress Bar" />
          </div>
          <div className="flex h-6 items-center justify-between whitespace-nowrap pl-2 text-xs">
            Change Scroll Threshold
            <Stepper
              compact
              label="Scroll Threshold"
              value={scrollThreshold}
              onChange={onScrollThreshold}
              step={5}
              min={0}
              max={100}
              format={(v) => `${v}%`}
            />
          </div>
        </div>
      )}
      <button
        type="button"
        aria-label="Kollect"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="grid h-8 w-8 place-items-center rounded-full bg-surface shadow-pop">
        <LogoMark size={18} />
      </button>
    </div>
  )
}

/** The thin bar across the top of a reading page showing how far down the chapter you are. */
export function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[2147483647] h-1">
      <div
        className="h-full bg-secondary transition-[width] duration-150"
        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
      />
    </div>
  )
}
