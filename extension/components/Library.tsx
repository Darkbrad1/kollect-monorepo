import { RiSearchLine } from "~lib/icons"
import { useEffect, useMemo, useState } from "react"

import { matchesAllFilters, toFilterable } from "../../convex/lib/filters"
import { sortMangas } from "../../convex/lib/sort"
import { api } from "../../convex/_generated/api"
import type { Doc, Id } from "../../convex/_generated/dataModel"
import { useM, useOnce, useQ } from "~lib/data"
import { daysAgo, daysLeft } from "~lib/format"
import { PAGE_ICONS, PROGRESS_PAGES, TRASH_ICON } from "~lib/pages"

import { CardGrid, GridSkeleton } from "./CardGrid"
import { CardMenu } from "./CardMenu"
import type { View } from "./ControlsBar"
import { EmptyState } from "./EmptyState"
import { MangaCard, titleOf, type GridItem } from "./MangaCard"
import { ConfirmDialog, Floating } from "./ui"

/** Waits until typing pauses before searching. */
function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const id = window.setTimeout(() => setSettled(value), ms)
    return () => window.clearTimeout(id)
  }, [value, ms])
  return settled
}

export function openLink(url: string) {
  if (typeof chrome !== "undefined" && chrome.tabs?.create) void chrome.tabs.create({ url })
  else window.open(url, "_blank", "noopener")
}

/**
 * The area under the top bar: the current page's manga (filtered and
 * sorted by the page's saved settings), the trash, or search results
 * from the whole library.
 */
export function Library({
  view,
  search,
  settings,
  favouriteId
}: {
  view: View
  search: string
  settings: Doc<"settings">
  favouriteId: Id<"userTags"> | undefined
}) {
  const text = useDebounced(search.trim(), 200)
  const searching = text !== ""

  const pageData = useQ(
    api.pages.mangasForPage,
    !searching && view.kind === "page" ? { pageId: view.page._id } : "skip"
  )
  const trashData = useQ(api.pages.trashMangas, !searching && view.kind === "trash" ? {} : "skip")
  const searchData = useQ(api.pages.searchLibrary, searching ? { text } : "skip")
  const siteList = useQ(api.sites.list, {})
  const hardDelete = useM(api.trash.hardDelete)
  const once = useOnce()
  const [note, setNote] = useState<string | null>(null)

  /** A short note at the bottom of the popup, gone after a few seconds. */
  const showNote = (message: string, ms = 3000) => {
    setNote(message)
    window.setTimeout(() => setNote((current) => (current === message ? null : current)), ms)
  }

  /** Opens a card's manga: the chapter you're on, or the series page on a
      website (see library:cardLink). Says so when Kollect has no link. */
  const openCard = async (item: GridItem) => {
    try {
      const url = await once(api.library.cardLink, { userMangaId: item.userManga._id })
      // Your current chapter, stopped partway: the reading page jumps
      // back to where you were. The background opens the tab so it knows
      // which tab should jump.
      const percent = item.userManga.currentPercentage ?? 0
      if (url && url === item.userManga.currentChapterUrl && percent > 0 && percent < 100 && typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
        return void chrome.runtime.sendMessage({ type: "openAt", url, percent }).catch(() => openLink(url))
      }
      if (url) return openLink(url)
      showNote("Kollect doesn't have a link for this manga yet. Open it from its website and press Add.", 4000)
    } catch (error) {
      showNote(error instanceof Error ? error.message : String(error), 4000)
    }
  }

  const [menu, setMenu] = useState<{ id: Id<"userMangas">; anchor: DOMRect } | null>(null)
  const [confirm, setConfirm] = useState<GridItem | null>(null)

  const sites = useMemo(
    () => new Map((siteList ?? []).map((s) => [s._id, s] as const)),
    [siteList]
  )

  // The page from the loader is fresher than the one in `view`, so a
  // filter saved a moment ago applies straight away.
  const page = pageData?.page ?? (view.kind === "page" ? view.page : undefined)
  const raw = searching ? searchData?.items : view.kind === "trash" ? trashData?.items : pageData?.items

  const items = useMemo(() => {
    if (!raw) return undefined
    if (searching || view.kind === "trash" || !page) return raw
    const now = Date.now()
    const titles = new Map([...sites].map(([id, s]) => [id, s.title] as const))
    const kept = raw.filter((item) => matchesAllFilters(toFilterable(item), page.filters, now))
    return sortMangas(kept, page.sort, titles)
  }, [raw, searching, view.kind, page, sites])

  const inTrash = !searching && view.kind === "trash"

  // Look the open menu's manga up in the live list, so its details
  // update as soon as something changes (and the menu closes if the
  // manga leaves this page).
  const menuItem = menu ? raw?.find((item) => item.userManga._id === menu.id) : undefined

  if (items === undefined) return <GridSkeleton />

  if (items.length === 0) {
    if (searching) {
      return <EmptyState icon={RiSearchLine} text={`Nothing in your library matches “${text}”.`} />
    }
    if (inTrash) {
      return (
        <EmptyState
          icon={TRASH_ICON}
          text={
            settings.autoClearTrash
              ? `You currently have no items in Deleted. If you delete an item it will be removed in ${settings.trashRetentionDays} days.`
              : "You currently have no items in Deleted. Deleted items stay here until you remove them or empty the trash."
          }
        />
      )
    }
    const filtered = (raw?.length ?? 0) > 0
    return (
      <EmptyState
        icon={page ? PAGE_ICONS[page.systemKey] : TRASH_ICON}
        text={
          filtered
            ? "No manga on this page match your filters."
            : page?.systemKey === "favourites"
              ? "You currently have no items in Favourites. Favourite a manga for it to show here."
              : `You currently have no items in ${page?.title}. Add manga for them to show here.`
        }
      />
    )
  }

  return (
    <>
      <CardGrid
        items={items}
        keyOf={(item) => item.userManga._id}
        render={(item) => {
          const progress = PROGRESS_PAGES.find((p) => p.key === item.userManga.progressKey)
          return (
            <MangaCard
              item={item}
              site={item.userManga.currentSiteId ? sites.get(item.userManga.currentSiteId) : undefined}
              timeText={inTrash ? daysLeft(item.userManga.purgeAt) : daysAgo(item.userManga.lastReadAt)}
              badge={
                searching && progress
                  ? { icon: PAGE_ICONS[progress.key], label: progress.label }
                  : undefined
              }
              menuOpen={menu?.id === item.userManga._id}
              onMenu={(anchor) => setMenu({ id: item.userManga._id, anchor })}
              onOpen={() => void openCard(item)}
            />
          )
        }}
      />

      {menu && menuItem && (
        <Floating anchor={menu.anchor} placement="bottom-end" onClose={() => setMenu(null)}>
          <CardMenu
            item={menuItem}
            inTrash={inTrash}
            favouriteId={favouriteId}
            sites={sites}
            onClose={() => setMenu(null)}
            onNote={showNote}
            onDelete={() => {
              setConfirm(menuItem)
              setMenu(null)
            }}
          />
        </Floating>
      )}

      {confirm && (
        <ConfirmDialog
          message={`After doing this, ${titleOf(confirm)} can't be restored.`}
          confirmLabel="Delete"
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            void hardDelete({ userMangaId: confirm.userManga._id })
            setConfirm(null)
          }}
        />
      )}

      {note && (
        <div
          role="status"
          className="fixed bottom-4 left-1/2 z-50 max-w-[360px] -translate-x-1/2 rounded-lg bg-surface px-3 py-2 text-xs leading-4 shadow-pop">
          {note}
        </div>
      )}
    </>
  )
}
