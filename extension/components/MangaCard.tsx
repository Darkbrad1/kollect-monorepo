import { RiBookOpenLine, RiMoreFill } from "~lib/icons"
import { useState } from "react"

import type { Doc } from "../../convex/_generated/dataModel"
import { chapterProgress } from "~lib/format"

import { cx, type Icon } from "./ui"

export type GridItem = { userManga: Doc<"userMangas">; manga: Doc<"mangas"> }

export const CARD_WIDTH = 144
export const CARD_HEIGHT = 262
const COVER_HEIGHT = 216

/** A site's favicon, or its first letter when there's no image. */
export function SiteIcon({ site, size = 12 }: { site?: Doc<"sites">; size?: number }) {
  if (!site) return null
  if (/^(https?:|data:)/.test(site.icon)) {
    return <img src={site.icon} alt="" width={size} height={size} className="shrink-0 rounded-full" />
  }
  return (
    <span
      style={{ width: size, height: size, fontSize: size * 0.6 }}
      className="grid shrink-0 place-items-center rounded-full bg-hover font-bold text-fg">
      {site.title.charAt(0)}
    </span>
  )
}

/** A manga cover, with a placeholder if the image is missing or broken. */
export function Cover({ src, className }: { src: string; className?: string }) {
  const [broken, setBroken] = useState(false)
  if (broken || src === "") {
    return (
      <div className={cx("grid place-items-center bg-raised text-muted", className)}>
        <RiBookOpenLine size={28} />
      </div>
    )
  }
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={() => setBroken(true)}
      className={cx("bg-raised object-cover", className)}
    />
  )
}

/**
 * One manga in the grid: cover, title, chapter progress with the site
 * favicon, and a time on the right. Hovering shows the ⋯ button that
 * opens the card menu; clicking anywhere else on the card opens the manga.
 */
export function MangaCard({
  item,
  site,
  timeText,
  badge,
  menuOpen,
  onMenu,
  onOpen
}: {
  item: GridItem
  site?: Doc<"sites">
  timeText: string
  badge?: { icon: Icon; label: string }
  menuOpen: boolean
  onMenu: (anchor: DOMRect) => void
  onOpen: () => void
}) {
  const { userManga, manga } = item
  const BadgeIcon = badge?.icon
  return (
    // The whole card opens the manga; the ⋯ button and right-click open the menu.
    <div
      role="button"
      tabIndex={0}
      aria-label={`Open ${manga.title}`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onOpen()
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        onMenu(new DOMRect(e.clientX, e.clientY, 0, 0))
      }}
      className="group relative flex cursor-pointer flex-col"
      style={{ width: CARD_WIDTH, height: CARD_HEIGHT }}>
      <div className="relative overflow-hidden rounded-xl">
        <Cover
          src={manga.image}
          className="h-[216px] w-full transition-transform duration-200 group-hover:scale-[1.03]"
        />
        {badge && BadgeIcon && (
          <span className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-2xs font-semibold text-white">
            <BadgeIcon size={11} />
            {badge.label}
          </span>
        )}
      </div>

      <button
        type="button"
        aria-label={`Options for ${manga.title}`}
        onClick={(e) => {
          e.stopPropagation()
          onMenu(e.currentTarget.getBoundingClientRect())
        }}
        className={cx(
          "absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white transition-opacity",
          menuOpen ? "opacity-100" : "opacity-0 focus:opacity-100 group-hover:opacity-100"
        )}>
        <RiMoreFill size={14} />
      </button>

      <h3 className="mt-2 line-clamp-2 text-xs font-bold leading-[14px]" title={manga.title}>
        {manga.title}
      </h3>
      <div className="mt-auto flex items-center gap-1 text-2xs text-muted">
        <SiteIcon site={site} size={11} />
        <span className="truncate">
          {chapterProgress(userManga.currentChapterNumber, manga.latestChapter)}
        </span>
        <span className="ml-auto shrink-0">{timeText}</span>
      </div>
    </div>
  )
}

export function CardSkeleton() {
  return (
    <div className="k-skeleton flex flex-col" style={{ width: CARD_WIDTH, height: CARD_HEIGHT }}>
      <div className="rounded-xl bg-raised" style={{ height: COVER_HEIGHT }} />
      <div className="mt-2 h-3 w-4/5 rounded bg-raised" />
      <div className="mt-1 h-3 w-1/2 rounded bg-raised" />
      <div className="mt-auto h-2.5 w-full rounded bg-raised" />
    </div>
  )
}
