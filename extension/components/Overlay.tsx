import { useEffect, useRef, useState, type ReactNode } from "react"

import { RiCloseLine } from "~lib/icons"
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
 * It shows on every website, and Add works on every page: where Kollect
 * can't read the page itself, a check box asks for the details.
 *
 * It only draws; whoever uses it passes in the manga's page and the
 * settings, and saves the changes.
 */
export function Overlay({
  progressKey,
  onPick,
  panel,
  showProgressBar,
  onShowProgressBar,
  scrollThreshold,
  onScrollThreshold
}: {
  /** The page the manga is on, or undefined if it isn't in the library yet. */
  progressKey: ProgressKey | undefined
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

/**
 * A short note beside the Kollect button, like "Added to Reading". A note
 * with a button ("Not this manga?", "Add anyway") also has a close
 * button, and stays until one of them is used.
 */
export function Toast({
  message,
  error,
  action,
  onClose
}: {
  message: string
  error?: boolean
  action?: { label: string; run: () => void }
  onClose?: () => void
}) {
  return (
    <div
      role="status"
      className={cx(
        "fixed bottom-3.5 left-[54px] z-[2147483647] flex min-h-8 max-w-[320px] items-center gap-2 rounded-lg px-3 py-1.5 font-sans text-xs leading-4 shadow-pop",
        error ? "bg-danger text-white" : "bg-surface text-fg"
      )}>
      <span>{message}</span>
      {action && (
        <button
          type="button"
          onClick={action.run}
          className="h-6 shrink-0 whitespace-nowrap rounded-md bg-primary px-2 font-semibold text-on-primary">
          {action.label}
        </button>
      )}
      {onClose && (
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted hover:bg-raised">
          <RiCloseLine size={14} />
        </button>
      )}
    </div>
  )
}

/** One choice in "Is it one of these?". */
export type Candidate = {
  mangaId: string
  title: string
  image: string
  latestChapter: number | null
  sites: string[]
  /** The page it's on in your library, or null if you don't have it. */
  progressKey: ProgressKey | null
}

/**
 * "Is it one of these?": shown on Add when manga with the same or a close
 * title are already in Kollect, and the address doesn't say which one
 * this is. Pick one, or add it as a new manga.
 */
export function ChooseBox({
  candidates,
  onPick,
  onNew,
  onCancel
}: {
  candidates: Candidate[]
  onPick: (mangaId: string) => void
  onNew: () => void
  onCancel: () => void
}) {
  return (
    <div
      role="dialog"
      aria-label="Is it one of these?"
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === "Escape") onCancel()
      }}
      className="w-[280px] rounded-lg bg-surface p-3 text-xs shadow-pop">
      <p className="text-[13px] font-bold">Is it one of these?</p>
      <p className="mt-1 text-2xs leading-4 text-muted">
        Kollect already has manga with this title or a close one. Pick the one you're reading, or add it as new.
      </p>
      <div className="mt-2.5 flex max-h-[260px] flex-col gap-1 overflow-y-auto">
        {candidates.map((c) => {
          const page = PROGRESS_PAGES.find((p) => p.key === c.progressKey)
          const details = [c.latestChapter !== null ? `Ch. ${c.latestChapter}` : null, c.sites.join(", ") || null]
            .filter(Boolean)
            .join(" · ")
          return (
            <button
              key={c.mangaId}
              type="button"
              onClick={() => onPick(c.mangaId)}
              className="flex w-full items-center gap-2 rounded-md p-1 text-left hover:bg-raised">
              {c.image ? (
                <img src={c.image} alt="" className="h-11 w-8 shrink-0 rounded object-cover" />
              ) : (
                <div className="h-11 w-8 shrink-0 rounded bg-raised" />
              )}
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate font-semibold">{c.title}</span>
                {details && <span className="truncate text-2xs text-muted">{details}</span>}
                {page && (
                  <span className="w-fit rounded bg-primary px-1.5 text-2xs font-semibold text-on-primary">
                    On {page.label}
                  </span>
                )}
              </span>
            </button>
          )
        })}
      </div>
      <div className="mt-3 flex justify-end gap-1.5">
        <button type="button" onClick={onCancel} className="h-7 rounded-md px-3 hover:bg-raised">
          Cancel
        </button>
        <button type="button" onClick={onNew} className="h-7 rounded-md bg-primary px-3 font-semibold text-on-primary">
          No, it's new
        </button>
      </div>
    </div>
  )
}

export type NewSiteDraft = { siteName: string; title: string; chapter?: number }

/**
 * The check box shown when adding from a page Kollect can't fully read:
 * a website it doesn't know, or a page it can't make sense of. It shows
 * what Kollect found (the website's name for a new website, the manga's
 * title, the chapter) so you can correct or fill them in. The chapter
 * can be left empty ("Not Started").
 */
export function AddSiteBox({
  heading,
  draft,
  pattern,
  askSite,
  onConfirm,
  onCancel
}: {
  heading: string
  draft: NewSiteDraft
  /** The chapter-address shape Kollect learned here, e.g. "/comics/:slug/chapter/:chapter". */
  pattern?: string
  /** Ask for the website's name: it's new to Kollect. */
  askSite: boolean
  onConfirm: (draft: NewSiteDraft) => void
  onCancel: () => void
}) {
  const [siteName, setSiteName] = useState(draft.siteName)
  const [title, setTitle] = useState(draft.title)
  const [chapter, setChapter] = useState(draft.chapter === undefined ? "" : String(draft.chapter))
  const number = chapter.trim() === "" ? undefined : Number(chapter)
  const ready =
    (!askSite || siteName.trim() !== "") &&
    title.trim() !== "" &&
    (number === undefined || Number.isFinite(number))
  const submit = () => ready && onConfirm({ siteName: siteName.trim(), title: title.trim(), chapter: number })
  const shape = pattern?.replace(":slug", "‹series›").replace(":chapter", "‹chapter›")

  const intro = askSite
    ? pattern
      ? "Kollect doesn't know this website yet. Check these, then add it."
      : "Kollect doesn't know this website yet. It'll learn its chapter addresses the first time you open a chapter here, and start tracking then."
    : "Kollect can't read this page by itself. Check these, then add it."

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
      <p className="mt-1 text-2xs leading-4 text-muted">{intro}</p>
      <div className="mt-2.5 flex flex-col gap-2">
        {askSite && <Field label="Website" value={siteName} onChange={setSiteName} autoFocus />}
        <Field label="Title" value={title} onChange={setTitle} autoFocus={!askSite} />
        <Field
          label="Chapter"
          value={chapter}
          placeholder="Not started"
          onChange={(v) => setChapter(v.replace(/[^0-9.]/g, ""))}
        />
      </div>
      {shape && (
        <>
          <p className="mt-2 text-2xs leading-4 text-muted">Chapter addresses look like</p>
          <p className="mt-0.5 break-all rounded-md bg-raised px-2 py-1 text-2xs leading-4">{shape}</p>
        </>
      )}
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
  autoFocus,
  placeholder
}: {
  label: string
  value: string
  onChange: (value: string) => void
  autoFocus?: boolean
  placeholder?: string
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-2xs text-muted">{label}</span>
      <input
        autoFocus={autoFocus}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 rounded-md bg-raised px-2 text-xs text-fg placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-primary"
      />
    </label>
  )
}
