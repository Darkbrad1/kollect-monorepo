import { useEffect, useRef, useState, type ReactNode } from "react"

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
 * It shows on every website. Off a manga's chapter page the Add options
 * are greyed out with a note saying where to go.
 *
 * It only draws; whoever uses it passes in the manga's page and the
 * settings, and saves the changes.
 */
export function Overlay({
  progressKey,
  canAdd,
  onPick,
  panel,
  showProgressBar,
  onShowProgressBar,
  scrollThreshold,
  onScrollThreshold
}: {
  /** The page the manga is on, or undefined if it isn't in the library yet. */
  progressKey: ProgressKey | undefined
  /** False when this page isn't one a manga can be added from. */
  canAdd: boolean
  onPick: (key: ProgressKey) => void
  /** Shown above the button instead of the menu, such as the "add this website" box. */
  panel?: ReactNode
  showProgressBar: boolean
  onShowProgressBar: (on: boolean) => void
  scrollThreshold: number
  onScrollThreshold: (value: number) => void
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  // A panel takes the menu's place.
  useEffect(() => {
    if (panel) setOpen(false)
  }, [panel])

  // Clicking anywhere else on the page closes the menu.
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      // composedPath, not target: on a reading website the button sits in
      // its own shadow root, and there the target is just that root.
      if (root.current && !e.composedPath().includes(root.current)) setOpen(false)
    }
    document.addEventListener("mousedown", close)
    return () => document.removeEventListener("mousedown", close)
  }, [open])

  return (
    <div
      ref={root}
      className={cx(
        "fixed bottom-3.5 left-3.5 z-[2147483647] flex flex-col items-start gap-2 font-sans text-fg transition-opacity duration-200",
        open || panel ? "opacity-100" : "opacity-40 hover:opacity-100"
      )}>
      {panel}
      {open && !panel && (
        <div className="w-[240px] rounded-lg bg-surface p-1 shadow-pop">
          {PROGRESS_PAGES.map(({ key, label }) => {
            const Icon = PAGE_ICONS[key]
            const here = progressKey === key
            return (
              <button
                key={key}
                type="button"
                disabled={!canAdd}
                onClick={() => onPick(key)}
                className={cx(
                  "flex h-6 w-full items-center gap-2 rounded-md px-2 text-left text-xs transition-colors",
                  "disabled:cursor-not-allowed disabled:opacity-40",
                  here ? "bg-primary text-on-primary" : "enabled:hover:bg-raised"
                )}>
                <Icon size={12} className="shrink-0" />
                Add To {label}
              </button>
            )
          })}
          {!canAdd && (
            <p className="px-2 pb-1 pt-0.5 text-2xs text-muted">Open a chapter page to add a manga.</p>
          )}
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
              step={1}
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

/** A short note beside the Kollect button, like "Added to Reading". */
export function Toast({ message, error }: { message: string; error?: boolean }) {
  return (
    <div
      role="status"
      className={cx(
        "fixed bottom-3.5 left-[54px] z-[2147483647] flex h-8 max-w-[320px] items-center rounded-lg px-3 font-sans text-xs shadow-pop",
        error ? "bg-danger text-white" : "bg-surface text-fg"
      )}>
      {message}
    </div>
  )
}

export type NewSiteDraft = { siteName: string; title: string; chapter: number }

/**
 * Shown when adding a manga on a website Kollect doesn't know yet. It
 * shows what Kollect found (the website's name, the manga's title and
 * the chapter) so you can correct them, and the chapter-address shape it
 * learned, which it will use to track this website from now on.
 */
export function AddSiteBox({
  heading,
  draft,
  pattern,
  onConfirm,
  onCancel
}: {
  heading: string
  draft: NewSiteDraft
  /** e.g. "/comics/:slug/chapter/:chapter" */
  pattern: string
  onConfirm: (draft: NewSiteDraft) => void
  onCancel: () => void
}) {
  const [siteName, setSiteName] = useState(draft.siteName)
  const [title, setTitle] = useState(draft.title)
  const [chapter, setChapter] = useState(String(draft.chapter))
  const number = Number(chapter)
  const ready = siteName.trim() !== "" && title.trim() !== "" && chapter.trim() !== "" && Number.isFinite(number)
  const submit = () => ready && onConfirm({ siteName: siteName.trim(), title: title.trim(), chapter: number })
  const shape = pattern.replace(":slug", "‹series›").replace(":chapter", "‹chapter›")

  return (
    <div
      role="dialog"
      aria-label={heading}
      // Keep typing here from reaching the website's own keyboard shortcuts.
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === "Enter") submit()
        if (e.key === "Escape") onCancel()
      }}
      className="w-[260px] rounded-lg bg-surface p-3 text-xs shadow-pop">
      <p className="text-[13px] font-bold">{heading}</p>
      <p className="mt-1 text-2xs leading-4 text-muted">
        Kollect doesn't know this website yet. Check these, then add it.
      </p>
      <div className="mt-2.5 flex flex-col gap-2">
        <Field label="Website" value={siteName} onChange={setSiteName} autoFocus />
        <Field label="Title" value={title} onChange={setTitle} />
        <Field label="Chapter" value={chapter} onChange={(v) => setChapter(v.replace(/[^0-9.]/g, ""))} />
      </div>
      <p className="mt-2 text-2xs leading-4 text-muted">Chapter addresses look like</p>
      <p className="mt-0.5 break-all rounded-md bg-raised px-2 py-1 text-2xs leading-4">{shape}</p>
      <div className="mt-3 flex justify-end gap-1.5">
        <button type="button" onClick={onCancel} className="h-7 rounded-md px-3 hover:bg-raised">
          Cancel
        </button>
        <button
          type="button"
          disabled={!ready}
          onClick={submit}
          className="h-7 rounded-md bg-primary px-3 font-semibold text-on-primary disabled:opacity-40">
          Add
        </button>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  autoFocus
}: {
  label: string
  value: string
  onChange: (value: string) => void
  autoFocus?: boolean
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-2xs text-muted">{label}</span>
      <input
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 rounded-md bg-raised px-2 text-xs text-fg focus:outline-none focus:ring-1 focus:ring-primary"
      />
    </label>
  )
}
