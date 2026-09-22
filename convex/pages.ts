import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { requireUser } from "./lib/auth";

/* ═══════════════════════════════════════════════════════════════
   PAGE LOADERS

   These return everything on a page and do not paginate. Filtering
   and sorting happen on the client: the page's stored `filters` and
   `sort` come back with the rows as the conditions to apply, and the
   popup renders a window of what is on screen rather than a page of
   results.

   That is what makes the multi-sort UI workable — Convex has no
   post-query ORDER BY, so any sort beyond a single indexed field
   has to happen client side anyway.
   ═══════════════════════════════════════════════════════════════ */

type GridItem = {
  order: number;
  userManga: Doc<"userMangas">;
  manga: Doc<"mangas">;
};

/**
 * Every live manga on one page, in membership order.
 *
 * Entering through userPageMangas means the by_user_live_* indexes
 * are unavailable, so soft-deleted rows are dropped in JS. That is
 * unavoidable without giving up restore, which needs memberships to
 * survive deletion.
 */
export const mangasForPage = query({
  args: { pageId: v.id("userPages") },
  handler: async (ctx, { pageId }) => {
    const user = await requireUser(ctx);

    const page = await ctx.db.get(pageId);
    if (page === null || page.userId !== user._id) {
      throw new Error("No such page.");
    }

    const memberships = await ctx.db
      .query("userPageMangas")
      .withIndex("by_page_order", (q) => q.eq("pageId", pageId))
      .collect();

    const items: GridItem[] = [];
    for (const membership of memberships) {
      const userManga = await ctx.db.get(membership.userMangaId);
      if (userManga === null) continue; // dangling membership
      if (userManga.isDeleted) continue; // live rows only

      const manga = await ctx.db.get(userManga.mangaId);
      if (manga === null) continue; // dangling catalogue reference

      items.push({ order: membership.order, userManga, manga });
    }

    return { page, items };
  },
});

/**
 * The trash view. Unlike mangasForPage this enters through
 * userMangas, so it can use the by_user_trash index directly.
 * Newest deletion first.
 */
export const trashMangas = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);

    const rows = await ctx.db
      .query("userMangas")
      .withIndex("by_user_trash", (q) =>
        q.eq("userId", user._id).eq("isDeleted", true),
      )
      .order("desc")
      .collect();

    const items: GridItem[] = [];
    for (const [i, userManga] of rows.entries()) {
      const manga = await ctx.db.get(userManga.mangaId);
      if (manga === null) continue;
      items.push({ order: i, userManga, manga });
    }

    return { items };
  },
});
