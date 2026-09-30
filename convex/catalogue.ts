import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { normalizeTitle } from "./lib/titles";

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
