import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation } from "./_generated/server";

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

    // Recompute across the manga's sources rather than taking a running
    // max: a site renumbering its chapters should be able to bring the
    // denormalised figure back down.
    const sources = await ctx.db
      .query("mangaSources")
      .withIndex("by_manga", (q) => q.eq("mangaId", source.mangaId))
      .collect();

    let highest: number | null = null;
    for (const s of sources) {
      if (s.latestChapter === undefined) continue;
      if (highest === null || s.latestChapter > highest) highest = s.latestChapter;
    }
    if (highest === null) return;

    const manga = await ctx.db.get(source.mangaId);
    if (manga === null) return; // dangling reference; nothing to update
    if (manga.latestChapter === highest) return;

    await ctx.db.patch(source.mangaId, {
      latestChapter: highest,
      latestChapterAt: now,
    });
  },
});
