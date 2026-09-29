import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, query, type QueryCtx } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { normalizeTitle } from "./lib/titles";
import { refreshMangaLatest } from "./lib/catalogue";

/* ═══════════════════════════════════════════════════════════════
   WEEKLY LATEST-CHAPTER REFRESH

   mangas.latestChapter is denormalised so the card grid can render
   "Ch. 219/456" without a per-tile join through mangaSources or
   providers. This is what keeps it current.

   Sweeps every mangaSources row once a week, batching to stay under
   the mutation size ceiling and staggering the outbound checks —
   unlike the content script, these hit sites with no user present.
   ═══════════════════════════════════════════════════════════════ */

const SWEEP_BATCH = 100;
const STAGGER_MS = 250;

export const refreshLatestChapters = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { cursor }) => {
    const batch = await ctx.db
      .query("mangaSources")
      .paginate({ cursor, numItems: SWEEP_BATCH });

    for (const [i, source] of batch.page.entries()) {
      await ctx.scheduler.runAfter(
        i * STAGGER_MS,
        internal.catalogue.checkSource,
        { sourceId: source._id },
      );
    }

    if (!batch.isDone) {
      // Reschedule past this batch's own stagger window so the whole
      // sweep stays spread out rather than bunching at the boundary.
      await ctx.scheduler.runAfter(
        batch.page.length * STAGGER_MS,
        internal.catalogue.refreshLatestChapters,
        { cursor: batch.continueCursor },
      );
    }
  },
});

/**
 * TODO(build order 5 + 9): no sites or providers are seeded yet, so
 * there is nothing to query. Once they are, look the source's site up,
 * prefer a provider API over hitting the aggregator directly, and
 * return the highest chapter number found.
 *
 * Returning null means "couldn't determine" — the source still gets
 * its lastCheckedAt stamped so the sweep does not retry it early.
 */
async function fetchLatestChapter(
  _sourceId: Id<"mangaSources">,
): Promise<number | null> {
  return null;
}

export const checkSource = internalAction({
  args: { sourceId: v.id("mangaSources") },
  handler: async (ctx, { sourceId }) => {
    const latestChapter = await fetchLatestChapter(sourceId);
    await ctx.runMutation(internal.catalogue.applyLatestChapter, {
      sourceId,
      latestChapter,
    });
  },
});

export const applyLatestChapter = internalMutation({
  args: {
    sourceId: v.id("mangaSources"),
    latestChapter: v.union(v.number(), v.null()),
  },
  handler: async (ctx, { sourceId, latestChapter }) => {
    const source = await ctx.db.get(sourceId);
    if (source === null) return; // purged mid-sweep

    const now = Date.now();
    await ctx.db.patch(
      sourceId,
      latestChapter === null
        ? { lastCheckedAt: now }
        : { lastCheckedAt: now, latestChapter },
    );

    if (latestChapter === null) return;

    await refreshMangaLatest(ctx, source.mangaId);
  },
});

/* ═══════════════════════════════════════════════════════════════
   ADD MANGA (the + button in the popup)
   ═══════════════════════════════════════════════════════════════ */

/**
 * Searches the shared manga list: every manga anyone has added to
 * Kollect, by title and alternative titles. Each result says where it
 * is in your library, if anywhere: "new" (not added), "trash", or the
 * page it's on.
 *
 * Private manga (only on websites people added for themselves) are left
 * out, unless they're in your library or on one of your own websites.
 */
export const search = query({
  args: { text: v.string() },
  handler: async (ctx, { text }) => {
    const user = await requireUser(ctx);
    const needle = normalizeTitle(text);
    if (needle === "") return [];

    const byTitle = await ctx.db
      .query("mangas")
      .withSearchIndex("search_title", (q) => q.search("normalizedTitle", needle))
      .take(20);
    const found = [...byTitle];
    const alts = await ctx.db
      .query("mangaAltTitles")
      .withSearchIndex("search_title", (q) => q.search("normalizedTitle", needle))
      .take(20);
    for (const alt of alts) {
      if (found.some((m) => m._id === alt.mangaId)) continue;
      const manga = await ctx.db.get(alt.mangaId);
      if (manga !== null) found.push(manga);
    }

    const results = [];
    for (const manga of found) {
      const entry = await ctx.db
        .query("userMangas")
        .withIndex("by_user_manga", (q) => q.eq("userId", user._id).eq("mangaId", manga._id))
        .unique();
      if (entry === null && !(await canSeeInSearch(ctx, manga._id, user._id))) continue;
      const status = entry === null ? ("new" as const) : entry.isDeleted ? ("trash" as const) : entry.progressKey;
      results.push({ manga, status });
    }
    return results;
  },
});

/** False for someone else's private manga: every website it's on was
    added by someone for themselves, and none of them by you. */
async function canSeeInSearch(ctx: QueryCtx, mangaId: Id<"mangas">, userId: Id<"users">): Promise<boolean> {
  const sources = await ctx.db
    .query("mangaSources")
    .withIndex("by_manga", (q) => q.eq("mangaId", mangaId))
    .collect();
  if (sources.length === 0) return true;
  for (const source of sources) {
    const site = await ctx.db.get(source.siteId);
    if (site === null) continue;
    if (site.addedBy === undefined || site.addedBy === userId) return true;
  }
  return false;
}
