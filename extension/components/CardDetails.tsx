import { useState } from "react"

import { RiBookOpenLine, RiCalendarScheduleLine } from "~lib/icons"

import { api } from "../../convex/_generated/api"
import type { Doc, Id } from "../../convex/_generated/dataModel"
import { useM, useQ } from "~lib/data"
import { daysAgo } from "~lib/format"

import { Cover, SiteIcon, titleOf, type GridItem } from "./MangaCard"
import { Select } from "./ui"

/**
 * The details panel beside a card: cover and title, chapter and last
 * read, then two dropdowns — the sites you've read it on (picking one
 * takes you to the furthest chapter you reached there) and your reading
 * history (picking a chapter switches back to it). The bar on the right
 * shows how far through the current chapter you are.
 */
export function CardDetails({
  item,
  sites,
  readOnly
}: {
  item: GridItem
  sites: Map<Id<"sites">, Doc<"sites">>
  readOnly: boolean
}) {
  const { userManga, manga } = item
  const sources = useQ(api.library.sourcesFor, { userMangaId: userManga._id })
  const history = useQ(api.library.chapterHistory, { userMangaId: userManga._id })
  const switchSource = useM(api.library.switchSource)
  const switchChapter = useM(api.library.switchToHistoryChapter)

  const percent = Math.round(Math.min(100, Math.max(0, userManga.currentPercentage ?? 0)))
  const current = userManga.currentChapterNumber

  const siteOptions = (sources ?? []).map((s) => ({
    value: s.siteId as string,
    lead: <SiteIcon site={sites.get(s.siteId)} size={14} />,
    label: s.chapterLabel && !s.isCurrent ? `${s.title} · ${s.chapterLabel}` : s.title
  }))

  // The history rows, plus the current chapter at the top if it isn't
  // in the history yet, so the dropdown always shows where you are.
  const chapterOptions = [
    ...(current !== undefined && !(history ?? []).some((h) => h.number === current)
      ? [{ value: "current", label: userManga.currentChapterLabel ?? `Ch. ${current}` }]
      : []),
    ...(history ?? []).map((h) => ({ value: h._id as string, label: h.label }))
  ]
  const currentChapterValue =
    (history ?? []).find((h) => h.number === current)?._id ?? (current !== undefined ? "current" : undefined)

  const site = userManga.currentSiteId ? sites.get(userManga.currentSiteId) : undefined

  return (
    <div className="flex w-[360px] gap-2.5 p-2.5">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex gap-2.5">
          <Cover src={manga.image} className="h-[100px] w-[70px] shrink-0 rounded-lg" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <TitleBox item={item} readOnly={readOnly} />
            <dl className="rounded-lg bg-raised px-2.5 py-1.5 text-xs">
              <div className="flex items-center gap-1.5 py-0.5">
                <RiBookOpenLine size={13} className="text-muted" />
                <dt className="text-muted">Chapter</dt>
                <dd className="ml-auto font-semibold tabular-nums">
                  {current ?? "–"} / {manga.latestChapter ?? "?"}
                </dd>
              </div>
              <div className="flex items-center gap-1.5 py-0.5">
                <RiCalendarScheduleLine size={13} className="text-muted" />
                <dt className="text-muted">Last Read</dt>
                <dd className="ml-auto font-semibold">{daysAgo(userManga.lastReadAt) || "Never"}</dd>
              </div>
            </dl>
            {manga.mangadexId && (
              <a
                href={`https://mangadex.org/title/${manga.mangadexId}`}
                target="_blank"
                rel="noreferrer"
                className="w-fit text-2xs text-muted underline-offset-2 hover:text-fg hover:underline">
                Details from MangaDex
              </a>
            )}
          </div>
        </div>

        {readOnly ? (
          <div className="flex h-8 items-center gap-2 rounded-lg bg-raised px-2.5 text-[13px]">
            <SiteIcon site={site} size={14} />
            <span className="truncate">{site?.title ?? "No site yet"}</span>
          </div>
        ) : (
          <Select
            label="Reading on"
            value={userManga.currentSiteId}
            options={siteOptions}
            placeholder="No site yet"
            onChange={(siteId) =>
              void switchSource({ userMangaId: userManga._id, siteId: siteId as Id<"sites"> })
            }
          />
        )}

        {readOnly ? (
          <div className="flex h-8 items-center rounded-lg bg-raised px-2.5 text-[13px]">
            {userManga.currentChapterLabel ?? (current !== undefined ? `Ch. ${current}` : "Not started")}
          </div>
        ) : (
          <Select
            label="Chapter"
            value={currentChapterValue}
            options={chapterOptions}
            placeholder="Not started"
            onChange={(value) => {
              if (value === "current" || value === currentChapterValue) return
              void switchChapter({ readChapterId: value as Id<"readChapters"> })
            }}
          />
        )}
      </div>

      <div
        role="meter"
        aria-label="Chapter progress"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="relative w-4 shrink-0 overflow-hidden rounded-full bg-raised">
        <div className="absolute inset-x-0 top-0 bg-secondary" style={{ height: `${percent}%` }} />
        <span className="absolute left-1/2 top-2 -translate-x-1/2 rotate-90 text-2xs font-bold text-fg mix-blend-difference">
          {percent}
        </span>
      </div>
    </div>
  )
}

/**
 * The title in Details. Click it to type your own title for this manga,
 * which only you see. Enter or clicking away saves it, Escape cancels,
 * and an empty box goes back to the shared title.
 */
function TitleBox({ item, readOnly }: { item: GridItem; readOnly: boolean }) {
  const setTitle = useM(api.library.setTitle)
  const [draft, setDraft] = useState<string | null>(null)
  const title = titleOf(item)
  const className = "text-[15px] font-extrabold leading-[18px]"

  if (readOnly) return <h3 className={`line-clamp-2 ${className}`}>{title}</h3>

  if (draft === null) {
    return (
      <button
        type="button"
        title="Click to give it your own title"
        onClick={() => setDraft(title)}
        className={`line-clamp-2 rounded-md text-left hover:bg-raised ${className}`}>
        {title}
      </button>
    )
  }

  const save = () => {
    if (draft.trim() !== title) void setTitle({ userMangaId: item.userManga._id, title: draft })
    setDraft(null)
  }
  return (
    <input
      autoFocus
      value={draft}
      placeholder={item.manga.title}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter") save()
        if (e.key === "Escape") setDraft(null)
      }}
      className={`w-full rounded-md bg-raised px-1.5 py-0.5 text-fg focus:outline-none focus:ring-1 focus:ring-primary ${className}`}
    />
  )
}
