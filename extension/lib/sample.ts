import { getFunctionName, type FunctionReference } from "convex/server"

import type { Doc, Id, TableNames } from "../../convex/_generated/dataModel"
import { normalizeTitle } from "../../convex/lib/titles"
import type { DataSource } from "./data"
import { FALLBACK_THEME } from "./theme"

/* ═══════════════════════════════════════════════════════════════
   SAMPLE DATA for the preview page (tabs/preview.tsx).

   A small in-memory stand-in for the backend: enough manga, tags and
   history to show every screen, and enough behaviour (favouriting,
   moving, tagging, trashing, saving filters and settings) that the
   preview can be clicked through. Nothing here reaches Convex.
   ═══════════════════════════════════════════════════════════════ */

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.now()

let counter = 0
const id = <T extends TableNames>(prefix: string) => `${prefix}_${++counter}` as Id<T>

/** A generated cover: a gradient with the title's initials, so the
    preview needs no images from the internet. */
function cover(title: string, hue: number): string {
  const initials = title
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="288" height="432">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="hsl(${hue},55%,42%)"/><stop offset="1" stop-color="hsl(${(hue + 50) % 360},60%,18%)"/>
</linearGradient></defs><rect width="288" height="432" fill="url(#g)"/>
<text x="24" y="400" font-family="sans-serif" font-size="96" font-weight="800" fill="rgba(255,255,255,0.85)">${initials}</text></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

function favicon(letter: string, color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="16" fill="${color}"/><text x="16" y="22" text-anchor="middle" font-family="sans-serif" font-size="17" font-weight="700" fill="#fff">${letter}</text></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

type ProgressKey = "reading" | "planned" | "paused" | "completed"

export type SampleStore = {
  user: Doc<"users">
  settings: Doc<"settings">
  pages: Doc<"userPages">[]
  tags: (Doc<"userTags"> & { color: string })[]
  sites: Doc<"sites">[]
  mangas: Doc<"mangas">[]
  library: Doc<"userMangas">[]
  history: Doc<"readChapters">[]
}

export function createSampleStore(): SampleStore {
  const userId = id<"users">("user")
  const base = { _creationTime: NOW }

  const pages: Doc<"userPages">[] = (
    [
      ["favourites", "Favourites", "heart-line"],
      ["reading", "Reading", "book-open-line"],
      ["planned", "Planned", "calendar-schedule-line"],
      ["paused", "Paused", "pause-circle-line"],
      ["completed", "Completed", "archive-2-line"]
    ] as const
  ).map(([systemKey, title, icon], order) => ({
    ...base,
    _id: id<"userPages">("page"),
    userId,
    title,
    order,
    systemKey,
    icon,
    filters: [],
    sort: []
  }))

  const tag = (name: string, color: string, builtIn: "favourite" | null = null) => ({
    ...base,
    _id: id<"userTags">("tag"),
    userId,
    name,
    normalizedName: name.toLowerCase(),
    builtIn,
    color
  })
  const tags = [
    tag("Favourite", "#F7A1A1", "favourite"),
    tag("Multiple Regressions", "#F7A1A1"),
    tag("Cat", "#B5F2A5"),
    tag("Slow Burn", "#5B8FD6"),
    tag("Murim", "#F4A6F2"),
    tag("Isekai", "#F5D38A")
  ]
  const [fav, regress, cat, slow, murim, isekai] = tags

  const site = (title: string, domain: string, color: string) => ({
    ...base,
    _id: id<"sites">("site"),
    domain,
    icon: favicon(title[0], color),
    title,
    link: `https://${domain}`,
    chapterInUrl: true,
    caseSensitive: false,
    configVersion: 1
  })
  const sites = [
    site("Asurascans", "asurascans.com", "#7C5CD6"),
    site("Flame Comics", "flamecomics.xyz", "#E4572E"),
    site("Reaper Scans", "reaperscans.com", "#2E86AB")
  ]
  const [asura, flame, reaper] = sites

  const entries: [string, ProgressKey, number | undefined, number, number | undefined, typeof asura | undefined, (typeof fav)[], number][] = [
    // title, page, chapter, latest, days since read, site, tags, hue
    ["That Time I Got Reincarnated as a Slime", "reading", 98, 259, 2, asura, [fav, isekai], 200],
    ["Solo Leveling", "reading", 179, 200, 0, asura, [fav], 260],
    ["Omniscient Reader's Viewpoint", "reading", 212, 245, 1, flame, [regress], 20],
    ["The Beginning After the End", "reading", 175, 190, 4, reaper, [isekai], 140],
    ["Return of the Mount Hua Sect", "reading", 88, 130, 9, asura, [murim, regress], 330],
    ["Tower of God", "reading", 540, 640, 12, flame, [], 40],
    ["Nano Machine", "reading", 201, 220, 3, asura, [murim], 180],
    ["The Greatest Estate Developer", "reading", 60, 150, 21, reaper, [slow], 90],
    ["Eleceed", "reading", 250, 310, 6, flame, [cat], 110],
    ["Lookism", "reading", 480, 510, 30, asura, [], 300],
    ["Villain to Kill", "reading", 45, 140, 45, reaper, [], 0],
    ["Terminally-Ill Genius Dark Knight", "reading", 30, 80, 60, flame, [regress], 230],
    ["Mercenary Enrollment", "planned", undefined, 190, undefined, undefined, [], 160],
    ["Frieren: Beyond Journey's End", "planned", undefined, 130, undefined, undefined, [slow], 120],
    ["Kagurabachi", "planned", 5, 60, 90, asura, [], 350],
    ["Chainsaw Man", "paused", 120, 175, 140, flame, [fav], 10],
    ["Blue Lock", "paused", 210, 280, 200, reaper, [], 210],
    ["Berserk", "completed", 374, 374, 285, asura, [fav, slow], 280],
    ["Vinland Saga", "completed", 220, 220, 300, flame, [slow], 190]
  ]

  const mangas: Doc<"mangas">[] = []
  const library: Doc<"userMangas">[] = []
  const history: Doc<"readChapters">[] = []

  entries.forEach(([title, progressKey, chapter, latest, daysAgo, s, tagList, hue], i) => {
    const mangaId = id<"mangas">("manga")
    mangas.push({
      ...base,
      _id: mangaId,
      title,
      normalizedTitle: normalizeTitle(title),
      altTitles: [],
      image: cover(title, hue),
      type: "manhwa",
      authors: [],
      tags: [],
      latestChapter: latest
    })
    const userMangaId = id<"userMangas">("um")
    const readOnFlame = i === 0 // Slime: read on Flame before moving to Asura
    library.push({
      ...base,
      _id: userMangaId,
      userId,
      mangaId,
      addedAt: NOW - (i + 1) * 5 * DAY,
      progressKey,
      tagIds: tagList.map((t) => t._id),
      currentChapterNumber: chapter,
      currentChapterLabel: chapter !== undefined ? `Ch. ${chapter}` : undefined,
      currentChapterUrl: s && chapter ? `https://${s.domain}/${normalizeTitle(title).replace(/ /g, "-")}/${chapter}` : undefined,
      currentSiteId: s?._id,
      currentPercentage: chapter !== undefined ? (i * 37) % 100 : undefined,
      lastReadAt: daysAgo !== undefined ? NOW - daysAgo * DAY : undefined,
      readSiteIds: readOnFlame ? [flame._id] : [],
      isDeleted: false
    })
    if (chapter !== undefined && s) {
      for (const n of [chapter - 2, chapter - 1]) {
        history.push({
          ...base,
          _id: id<"readChapters">("rc"),
          userMangaId,
          number: n,
          label: `Ch. ${n}`,
          siteId: s._id,
          percentage: 100,
          readAt: NOW - ((daysAgo ?? 0) + chapter - n) * DAY
        })
      }
    }
    if (readOnFlame) {
      history.push({
        ...base,
        _id: id<"readChapters">("rc"),
        userMangaId,
        number: 40,
        label: "Ch. 40",
        siteId: flame._id,
        percentage: 100,
        readAt: NOW - 90 * DAY
      })
    }
  })

  // Two manga in the trash.
  for (const [title, hue] of [["Solo Max-Level Newbie", 50], ["Sword Master's Youngest Son", 170]] as const) {
    const mangaId = id<"mangas">("manga")
    mangas.push({
      ...base,
      _id: mangaId,
      title,
      normalizedTitle: normalizeTitle(title),
      altTitles: [],
      image: cover(title, hue),
      type: "manhwa",
      authors: [],
      tags: [],
      latestChapter: 150
    })
    library.push({
      ...base,
      _id: id<"userMangas">("um"),
      userId,
      mangaId,
      addedAt: NOW - 100 * DAY,
      progressKey: "reading",
      tagIds: [],
      currentChapterNumber: 12,
      currentSiteId: asura._id,
      lastReadAt: NOW - 40 * DAY,
      isDeleted: true,
      deletedAt: NOW - 8 * DAY,
      purgeAt: NOW + 22 * DAY
    })
  }

  // Manga other people have added, for the Add Manga search.
  for (const [title, hue, latest] of [
    ["Solo Leveling: Ragnarok", 260, 45],
    ["The Hero Cannot Rest", 300, 12],
    ["Surviving the Game as a Barbarian", 20, 88],
    ["Magic Emperor", 120, 640]
  ] as const) {
    mangas.push({
      ...base,
      _id: id<"mangas">("manga"),
      title,
      normalizedTitle: normalizeTitle(title),
      altTitles: [],
      image: cover(title, hue),
      type: "manhwa",
      authors: [],
      tags: [],
      latestChapter: latest
    })
  }

  const readingPage = pages.find((p) => p.systemKey === "reading")!

  return {
    user: { ...base, _id: userId, token: "sample", name: "Vanta" },
    settings: {
      ...base,
      _id: id<"settings">("settings"),
      userId,
      activeView: readingPage._id,
      defaultProgressKey: "reading",
      autoClearTrash: true,
      trashRetentionDays: 30,
      autoCompleteOnFinish: false,
      scrollThreshold: 80,
      hasPercentageBar: true,
      hasScreenOverlayOptions: true,
      theme: FALLBACK_THEME
    },
    pages,
    tags,
    sites,
    mangas,
    library,
    history
  }
}

/* ── queries and mutations over the store ───────────────────── */

type Args = Record<string, any>

const items = (s: SampleStore, rows: Doc<"userMangas">[]) =>
  rows
    .map((userManga) => ({ userManga, manga: s.mangas.find((m) => m._id === userManga.mangaId)! }))
    .sort((a, b) => b.userManga.addedAt - a.userManga.addedAt)

function query(s: SampleStore, name: string, a: Args): unknown {
  const live = s.library.filter((r) => !r.isDeleted)
  switch (name) {
    case "users:me":
      return { user: s.user, settings: s.settings, pages: s.pages }
    case "tags:list":
      return [...s.tags].sort((x, y) =>
        x.builtIn !== y.builtIn ? (x.builtIn ? -1 : 1) : x.name.localeCompare(y.name)
      )
    case "sites:list":
      return s.sites
    case "pages:mangasForPage": {
      const page = s.pages.find((p) => p._id === a.pageId)!
      const fav = s.tags.find((t) => t.builtIn === "favourite")!._id
      const rows =
        page.systemKey === "favourites"
          ? live.filter((r) => r.tagIds.includes(fav))
          : live.filter((r) => r.progressKey === page.systemKey)
      return { page, items: items(s, rows) }
    }
    case "pages:trashMangas":
      return { items: items(s, s.library.filter((r) => r.isDeleted)) }
    case "pages:searchLibrary": {
      const needle = normalizeTitle(a.text)
      return {
        items: items(s, live).filter(({ manga }) => normalizeTitle(manga.title).includes(needle))
      }
    }
    case "library:sourcesFor": {
      const row = s.library.find((r) => r._id === a.userMangaId)!
      const ids = new Set([...(row.readSiteIds ?? []), ...(row.currentSiteId ? [row.currentSiteId] : [])])
      return s.sites
        .filter((site) => ids.has(site._id))
        .map((site) => {
          const furthest = s.history
            .filter((h) => h.userMangaId === row._id && h.siteId === site._id)
            .sort((x, y) => y.number - x.number)[0]
          const isCurrent = site._id === row.currentSiteId
          return {
            siteId: site._id,
            title: site.title,
            icon: site.icon,
            isCurrent,
            chapterLabel: isCurrent ? row.currentChapterLabel : furthest?.label
          }
        })
    }
    case "catalogue:search": {
      const needle = normalizeTitle(a.text)
      if (needle === "") return []
      return s.mangas
        .filter((m) => m.normalizedTitle.includes(needle))
        .slice(0, 20)
        .map((manga) => {
          const entry = s.library.find((r) => r.mangaId === manga._id)
          return { manga, status: entry === undefined ? "new" : entry.isDeleted ? "trash" : entry.progressKey }
        })
    }
    case "library:chapterHistory":
      return s.history
        .filter((h) => h.userMangaId === a.userMangaId)
        .sort((x, y) => y.number - x.number)
    case "transfer:exportLibrary":
      return { kollect: 2, exportedAt: NOW, note: "Sample export from the preview page." }
    default:
      console.warn(`Preview has no sample data for ${name}`)
      return undefined
  }
}

function mutate(s: SampleStore, name: string, a: Args): { store: SampleStore; result?: unknown } {
  const patchRow = (rowId: string, patch: Partial<Doc<"userMangas">>) => ({
    store: { ...s, library: s.library.map((r) => (r._id === rowId ? { ...r, ...patch } : r)) }
  })
  const row = a.userMangaId ? s.library.find((r) => r._id === a.userMangaId) : undefined
  const fav = s.tags.find((t) => t.builtIn === "favourite")!._id

  switch (name) {
    case "settings:updateSettings":
      return { store: { ...s, settings: { ...s.settings, ...a } } }
    case "users:renameUser":
      return { store: { ...s, user: { ...s.user, name: a.name } } }
    case "library:addManga": {
      const existing = s.library.find((r) => r.mangaId === a.mangaId)
      if (existing) {
        return { store: { ...s, library: s.library.map((r) => (r === existing ? { ...r, isDeleted: false, deletedAt: undefined, purgeAt: undefined } : r)) } }
      }
      const row: Doc<"userMangas"> = {
        _creationTime: NOW,
        _id: id<"userMangas">("um"),
        userId: s.user._id,
        mangaId: a.mangaId,
        addedAt: Date.now(),
        progressKey: a.progressKey ?? s.settings.defaultProgressKey,
        tagIds: [],
        isDeleted: false
      }
      return { store: { ...s, library: [...s.library, row] } }
    }
    case "library:moveToProgressPage":
      return patchRow(a.userMangaId, { progressKey: a.systemKey })
    case "tags:setFavourite":
      return patchRow(a.userMangaId, {
        tagIds: a.favourite ? [...new Set([...row!.tagIds, fav])] : row!.tagIds.filter((t) => t !== fav)
      })
    case "tags:addTag":
      return patchRow(a.userMangaId, { tagIds: [...new Set([...row!.tagIds, a.tagId])] })
    case "tags:removeTag":
      return patchRow(a.userMangaId, { tagIds: row!.tagIds.filter((t) => t !== a.tagId) })
    case "tags:create":
    case "tags:addTagByName": {
      const existing = s.tags.find((t) => t.name.toLowerCase() === a.name.trim().toLowerCase())
      const palette = ["#F7A1A1", "#B5F2A5", "#5B8FD6", "#F4A6F2", "#F5D38A", "#9ED8E6"]
      const tag = existing ?? {
        ...s.tags[0],
        _id: id<"userTags">("tag"),
        name: a.name.trim(),
        normalizedName: a.name.trim().toLowerCase(),
        builtIn: null,
        color: a.color ?? palette[s.tags.length % palette.length]
      }
      const store = existing ? s : { ...s, tags: [...s.tags, tag] }
      if (name === "tags:create") return { store, result: tag._id }
      return {
        store: {
          ...store,
          library: store.library.map((r) =>
            r._id === a.userMangaId ? { ...r, tagIds: [...new Set([...r.tagIds, tag._id])] } : r
          )
        },
        result: tag._id
      }
    }
    case "tags:update":
      return {
        store: {
          ...s,
          tags: s.tags.map((t) =>
            t._id === a.tagId ? { ...t, ...(a.name ? { name: a.name } : {}), ...(a.color ? { color: a.color } : {}) } : t
          )
        }
      }
    case "tags:remove":
      return {
        store: {
          ...s,
          tags: s.tags.filter((t) => t._id !== a.tagId),
          library: s.library.map((r) => ({ ...r, tagIds: r.tagIds.filter((t) => t !== a.tagId) }))
        }
      }
    case "pages:setFilters":
      return { store: { ...s, pages: s.pages.map((p) => (p._id === a.pageId ? { ...p, filters: a.filters } : p)) } }
    case "pages:setSort":
      return { store: { ...s, pages: s.pages.map((p) => (p._id === a.pageId ? { ...p, sort: a.sort } : p)) } }
    case "trash:softDelete":
      return patchRow(a.userMangaId, { isDeleted: true, deletedAt: NOW, purgeAt: NOW + 30 * DAY })
    case "trash:restore":
      return patchRow(a.userMangaId, { isDeleted: false, deletedAt: undefined, purgeAt: undefined })
    case "trash:hardDelete":
      return { store: { ...s, library: s.library.filter((r) => r._id !== a.userMangaId) } }
    case "trash:emptyTrash":
      return { store: { ...s, library: s.library.filter((r) => !r.isDeleted) } }
    case "library:switchSource": {
      const furthest = s.history
        .filter((h) => h.userMangaId === a.userMangaId && h.siteId === a.siteId)
        .sort((x, y) => y.number - x.number)[0]
      return patchRow(a.userMangaId, {
        currentSiteId: a.siteId,
        ...(furthest
          ? { currentChapterNumber: furthest.number, currentChapterLabel: furthest.label }
          : {}),
        readSiteIds: [...new Set([...(row!.readSiteIds ?? []), ...(row!.currentSiteId ? [row!.currentSiteId] : [])])]
      })
    }
    case "library:switchToHistoryChapter": {
      const h = s.history.find((x) => x._id === a.readChapterId)!
      return patchRow(h.userMangaId, {
        currentChapterNumber: h.number,
        currentChapterLabel: h.label,
        currentSiteId: h.siteId
      })
    }
    default:
      console.info(`Preview ignores ${name}`, a)
      return { store: s }
  }
}

/** A data source over a store, for SampleDataProvider. */
export function sampleSource(
  store: SampleStore,
  setStore: (update: (s: SampleStore) => SampleStore) => void
): DataSource {
  return {
    query: (ref, args) => query(store, getFunctionName(ref as FunctionReference<"query">), (args ?? {}) as Args),
    mutate: async (ref, args) => {
      const name = getFunctionName(ref as FunctionReference<"mutation">)
      let result: unknown
      setStore((current) => {
        const out = mutate(current, name, (args ?? {}) as Args)
        result = out.result
        return out.store
      })
      return result
    }
  }
}
