import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { requireSettings, requireUser } from "./lib/auth";

/* ═══════════════════════════════════════════════════════════════
   EXPORT

   Two shapes, chosen from the dropdown beside the Export button:

     "full"   — Full backup. Pages, membership, reading progress and
                settings. Enough to rebuild the library as it was.
     "titles" — Titles only. Just the manga, for sharing a list or
                starting over on another account.

   Import reads `kind` off the file rather than asking again, so the
   discriminator below is load-bearing, not decoration. `kollect` is
   a format version: when this shape changes, an old file should be
   rejected with a clear message instead of importing halfway.

   Convex ids are meaningless in another account, so nothing here
   emits one. Pages are referenced by a stable `ref` string, manga by
   index into the `mangas` array, and the current source by the
   site's domain.
   ═══════════════════════════════════════════════════════════════ */

export const EXPORT_FORMAT_VERSION = 1;

/** Stable cross-account identifier for a page. */
function pageRef(page: Doc<"userPages">): string {
  return page.systemKey ?? `custom:${page.title}`;
}

function mangaIdentity(manga: Doc<"mangas">) {
  return {
    title: manga.title,
    normalizedTitle: manga.normalizedTitle,
    altTitles: manga.altTitles,
    image: manga.image,
    type: manga.type,
    authors: manga.authors,
    tags: manga.tags,
    year: manga.year,
    status: manga.status,
  };
}

export const exportLibrary = query({
  args: { kind: v.union(v.literal("full"), v.literal("titles")) },
  handler: async (ctx, { kind }) => {
    const user = await requireUser(ctx);

    // Live rows only. Exporting the trash would resurrect things the
    // user deleted the next time they imported.
    const rows = await ctx.db
      .query("userMangas")
      .withIndex("by_user_live_added", (q) =>
        q.eq("userId", user._id).eq("isDeleted", false),
      )
      .collect();

    const mangas: ReturnType<typeof mangaIdentity>[] = [];
    const indexByMangaId = new Map<Id<"mangas">, number>();
    const liveRows: Doc<"userMangas">[] = [];

    for (const row of rows) {
      const manga = await ctx.db.get(row.mangaId);
      if (manga === null) continue; // dangling catalogue reference

      if (!indexByMangaId.has(row.mangaId)) {
        indexByMangaId.set(row.mangaId, mangas.length);
        mangas.push(mangaIdentity(manga));
      }
      liveRows.push(row);
    }

    if (kind === "titles") {
      return {
        kollect: EXPORT_FORMAT_VERSION,
        kind,
        exportedAt: Date.now(),
        mangas,
      };
    }

    /* ── full backup ──────────────────────────────────────────── */

    const pages = await ctx.db
      .query("userPages")
      .withIndex("by_user_order", (q) => q.eq("userId", user._id))
      .collect();

    const refByPageId = new Map<Id<"userPages">, string>();
    for (const page of pages) refByPageId.set(page._id, pageRef(page));

    // sites is tiny; cache lookups so a library sharing one source
    // doesn't re-read the same row per row.
    const domainBySiteId = new Map<Id<"sites">, string | null>();
    const siteDomain = async (siteId: Id<"sites">): Promise<string | null> => {
      const cached = domainBySiteId.get(siteId);
      if (cached !== undefined) return cached;
      const site = await ctx.db.get(siteId);
      const domain = site?.domain ?? null;
      domainBySiteId.set(siteId, domain);
      return domain;
    };

    const items = [];
    for (const row of liveRows) {
      const memberships = await ctx.db
        .query("userPageMangas")
        .withIndex("by_userManga", (q) => q.eq("userMangaId", row._id))
        .collect();

      const refs: string[] = [];
      for (const membership of memberships) {
        const ref = refByPageId.get(membership.pageId);
        if (ref !== undefined) refs.push(ref);
      }

      items.push({
        m: indexByMangaId.get(row.mangaId)!,
        pages: refs,
        addedAt: row.addedAt,
        // readChapters is deliberately absent: it is one row per
        // chapter ever read and would dwarf the rest of the file.
        // The fields below are the progress the UI actually shows.
        currentChapterNumber: row.currentChapterNumber,
        currentChapterLabel: row.currentChapterLabel,
        currentChapterUrl: row.currentChapterUrl,
        currentPercentage: row.currentPercentage,
        currentSiteDomain:
          row.currentSiteId === undefined
            ? undefined
            : await siteDomain(row.currentSiteId),
        lastReadAt: row.lastReadAt,
      });
    }

    const settings = await requireSettings(ctx, user._id);

    return {
      kollect: EXPORT_FORMAT_VERSION,
      kind,
      exportedAt: Date.now(),
      mangas,
      pages: pages.map((page) => ({
        ref: pageRef(page),
        title: page.title,
        order: page.order,
        type: page.type,
        systemKey: page.systemKey,
        icon: page.icon,
        filters: page.filters,
        sort: page.sort,
      })),
      items,
      // activeView is a page id and means nothing elsewhere, so it is
      // left out along with the ids Convex manages.
      settings: {
        defaultProgressKey: settings.defaultProgressKey,
        autoClearTrash: settings.autoClearTrash,
        trashRetentionDays: settings.trashRetentionDays,
        autoCompleteOnFinish: settings.autoCompleteOnFinish,
        scrollThreshold: settings.scrollThreshold,
        hasPercentageBar: settings.hasPercentageBar,
        hasScreenOverlayOptions: settings.hasScreenOverlayOptions,
        theme: settings.theme,
      },
    };
  },
});
