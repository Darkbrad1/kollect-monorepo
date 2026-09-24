import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  filterRule,
  mangaStatus,
  mangaType,
  progressKey,
  sortRule,
  systemKey,
  theme,
} from "./lib/validators";

/* Validators live in convex/lib/validators.ts so the import/export
   format is checked against the same definitions as these tables.
   They must stay in step with PROGRESS_KEYS in lib/constants.ts. */

/* ═══════════════════════════════════════════════════════════════
   SCHEMA
   ═══════════════════════════════════════════════════════════════ */

export default defineSchema({
  /* ─── IDENTITY ────────────────────────────────────────────────
     Clerk, not Convex Auth: convex/auth.config.ts registers a
     web issuer and an extension issuer, so identity arrives via
     ctx.auth.getUserIdentity() and users.token is the Clerk
     tokenIdentifier.
     ─────────────────────────────────────────────────────────── */

  users: defineTable({
    token: v.string(), // ctx.auth.getUserIdentity().tokenIdentifier
    name: v.string(),
  }).index("by_token", ["token"]),

  settings: defineTable({
    userId: v.id("users"),

    // a userPages id, or the literal "all" / "trash".
    // string rather than v.id so hard-coded views fit.
    activeView: v.string(),

    // where a newly added manga lands
    defaultProgressKey: progressKey,

    // Its own flag rather than encoding "off" as 0 days, so
    // toggling auto-clear doesn't destroy the retention value
    // the user picked.
    autoClearTrash: v.boolean(),
    trashRetentionDays: v.number(),

    autoCompleteOnFinish: v.boolean(),

    // 0–100. Convex validators can't express a range; the bound
    // is enforced in updateSettings.
    scrollThreshold: v.number(),

    hasPercentageBar: v.boolean(),
    hasScreenOverlayOptions: v.boolean(),

    theme,
  }).index("by_user", ["userId"]),

  /* ─── PAGES ───────────────────────────────────────────────────
     Membership IS status. There is no status field on userMangas.

     INVARIANT: every LIVE userManga is on exactly one page whose
     systemKey is in PROGRESS_KEYS. Soft-deleted rows keep their
     membership but are excluded from every live query.
     ─────────────────────────────────────────────────────────── */

  userPages: defineTable({
    userId: v.id("users"),
    title: v.string(), // renameable, even for system pages
    order: v.number(),
    type: v.union(v.literal("system"), v.literal("custom")),

    // load-bearing: code finds pages by this, never by title.
    // renamePage must not touch it.
    systemKey,

    icon: v.optional(v.string()),

    // display options only — these never determine membership
    filters: v.array(filterRule),
    sort: v.array(sortRule),
  })
    .index("by_user_order", ["userId", "order"])
    .index("by_user_systemKey", ["userId", "systemKey"]),

  userPageMangas: defineTable({
    pageId: v.id("userPages"),
    userMangaId: v.id("userMangas"),
    order: v.number(),
    // userId and mangaId deliberately absent — both derivable
    // from userMangaId. Duplicating them is three chances to drift.
  })
    .index("by_page_order", ["pageId", "order"])
    .index("by_userManga", ["userMangaId"]), // "what pages is this on?"

  /* ─── LIBRARY + PROGRESS ──────────────────────────────────── */

  userMangas: defineTable({
    userId: v.id("users"),
    mangaId: v.id("mangas"),
    addedAt: v.number(),

    // Flat, not nested. ctx.db.patch is shallow, so a nested
    // chapter object would mean read-modify-write on every
    // scroll tick.
    currentChapterNumber: v.optional(v.number()),
    currentChapterLabel: v.optional(v.string()), // "Extra", "Ch. 12.5"
    currentChapterUrl: v.optional(v.string()),
    currentSiteId: v.optional(v.id("sites")),
    currentPercentage: v.optional(v.number()),
    lastReadAt: v.optional(v.number()),

    // Soft delete. isDeleted is the indexable equality field;
    // deletedAt is what the trash view displays; purgeAt is what
    // the cron scans (deletedAt + settings.trashRetentionDays).
    isDeleted: v.boolean(),
    deletedAt: v.optional(v.number()),
    purgeAt: v.optional(v.number()),
  })
    .index("by_user_manga", ["userId", "mangaId"]) // dedupe check
    .index("by_user_live_read", ["userId", "isDeleted", "lastReadAt"])
    .index("by_user_live_added", ["userId", "isDeleted", "addedAt"])
    .index("by_user_trash", ["userId", "isDeleted", "deletedAt"])
    .index("by_purge", ["isDeleted", "purgeAt"]), // cron sweeper

  readChapters: defineTable({
    userMangaId: v.id("userMangas"),
    number: v.number(), // sortable — 12.5 works
    label: v.string(), // what was actually displayed
    // Optional so rows written before it existed stay valid. Kept so
    // switching back to this chapter can restore its link.
    url: v.optional(v.string()),
    siteId: v.id("sites"),
    percentage: v.number(),
    readAt: v.number(),
  }).index("by_userManga_number", ["userMangaId", "number"]),

  /* ─── CATALOGUE ───────────────────────────────────────────── */

  mangas: defineTable({
    title: v.string(),

    // lowercased, punctuation stripped, whitespace collapsed.
    // This is what scraped titles get matched against.
    normalizedTitle: v.string(),
    altTitles: v.array(v.string()),

    image: v.string(),
    type: mangaType,
    authors: v.array(v.string()),

    // Denormalised highest chapter seen across this manga's
    // sources. The card grid renders "Ch. 219/456" per tile, and
    // a per-tile join through mangaSources or providers would be
    // a query per card. Written by the weekly refresh cron.
    latestChapter: v.optional(v.number()),
    latestChapterAt: v.optional(v.number()),

    // the SERIES status — not the user's progress.
    // "hiatus" here means the publisher stopped; the user-side
    // equivalent is the "paused" page.
    status: v.optional(mangaStatus),
    year: v.optional(v.number()),
    tags: v.array(v.string()),
  })
    .index("by_normalizedTitle", ["normalizedTitle"])
    // exact-match index above is the fast path; this is the
    // fuzzy fallback when a scraped title doesn't match cleanly
    .searchIndex("search_title", {
      searchField: "normalizedTitle",
    }),

  // Replaces the old mangas.sites array — Convex can't index
  // inside an array, so "which manga is this URL?" would have
  // been a full scan on every page load.
  mangaSources: defineTable({
    mangaId: v.id("mangas"),
    siteId: v.id("sites"),

    // The stable URL segment identifying the manga on this site.
    // Need not be readable, need not resolve on its own —
    // it's a matching key, not a link. null until the site
    // has a slugPattern, in which case matching falls back to title.
    slug: v.optional(v.string()),

    url: v.string(), // canonical series page, for "open on site"
    latestChapter: v.optional(v.number()),
    lastCheckedAt: v.optional(v.number()),
  })
    .index("by_manga", ["mangaId"])
    .index("by_site_slug", ["siteId", "slug"]), // THE lookup

  sites: defineTable({
    domain: v.string(), // "asurascans.com" — matched against tabs
    icon: v.string(),
    title: v.string(),
    link: v.string(), // home page, display only

    // ── extraction config ──────────────────────────────────
    // Seeded from the DB and cached by the extension, so adding
    // a site or fixing a redesign is a row update rather than a
    // Web Store review cycle.

    // "/comics/:slug/chapter/:chapter", "/read/:slug/:chapter",
    // "/title/:slug". null → no URL-based identification, fall
    // back to seriesLinkSelector or title matching.
    slugPattern: v.optional(v.string()),

    // true when the :chapter segment parses as a number
    // (asura /chapter/24). false for opaque ids (atsu /B6i-yU).
    chapterInUrl: v.boolean(),

    // opaque ids must not be lowercased; title-derived slugs should be
    caseSensitive: v.boolean(),

    // Prefer embedded JSON over CSS. Path into whichever payload
    // probe.js found, e.g. "props.pageProps.series.title".
    titlePath: v.optional(v.string()),
    titleSelector: v.optional(v.string()),
    chapterPath: v.optional(v.string()),
    chapterSelector: v.optional(v.string()),

    // for sites whose chapter URLs carry no manga identifier
    seriesLinkSelector: v.optional(v.string()),

    // bump when config changes so clients know to refetch
    configVersion: v.number(),
  }).index("by_domain", ["domain"]),

  /* ─── EXTERNAL METADATA ───────────────────────────────────── */

  providers: defineTable({
    mangaId: v.id("mangas"),
    name: v.union(
      v.literal("anilist"),
      v.literal("mal"),
      v.literal("mangaupdates"),
      v.literal("kitsu"),
      v.literal("mangadex"),
    ),
    providerMangaId: v.string(),

    // small, queryable subset lives here
    score: v.optional(v.number()),
    chapterCount: v.optional(v.number()),
    synopsis: v.optional(v.string()),
    syncedAt: v.number(),
  })
    .index("by_manga", ["mangaId"])
    .index("by_provider_externalId", ["name", "providerMangaId"]),

  // Raw API responses live apart from providers: documents cap at
  // 1 MB and you can't select columns, so an inline blob would
  // ride along every provider query.
  providerPayloads: defineTable({
    providerId: v.id("providers"),
    data: v.any(),
  }).index("by_provider", ["providerId"]),
});
