import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { isProgressKey } from "./lib/constants";
import { favouriteTag } from "./lib/tags";

/* ═══════════════════════════════════════════════════════════════
   PAGE LOADERS

   These return everything on a page and do not paginate. Filtering
   and sorting happen on the client: the page's stored `filters` and
   `sort` come back with the rows as the conditions to apply, and the
   popup renders a window of what is on screen rather than a page of
   results.
   ═══════════════════════════════════════════════════════════════ */

type GridItem = {
  userManga: Doc<"userMangas">;
  manga: Doc<"mangas">;
  // To filter, pass each item to toFilterable in lib/filters.ts.
};

/**
 * Every live manga on one page, newest addition first.
 *
 * A progress page shows the manga whose progressKey matches it. The
 * Favourites page shows the manga carrying the Favourite tag, from
 * every progress page.
 */
export const mangasForPage = query({
  args: { pageId: v.id("userPages") },
  handler: async (ctx, { pageId }) => {
    const user = await requireUser(ctx);

    const page = await ctx.db.get(pageId);
    if (page === null || page.userId !== user._id) {
      throw new Error("No such page.");
    }

    let rows: Doc<"userMangas">[];
    if (isProgressKey(page.systemKey)) {
      const key = page.systemKey;
      rows = await ctx.db
        .query("userMangas")
        .withIndex("by_user_live_progress", (q) =>
          q.eq("userId", user._id).eq("isDeleted", false).eq("progressKey", key),
        )
        .order("desc")
        .collect();
    } else {
      // Convex can't index inside an array, so the Favourites page
      // reads the live library and keeps the tagged rows. Fine at the
      // size of one person's library.
      const favourite = await favouriteTag(ctx, user._id);
      const live = await ctx.db
        .query("userMangas")
        .withIndex("by_user_live_added", (q) =>
          q.eq("userId", user._id).eq("isDeleted", false),
        )
        .order("desc")
        .collect();
      rows = live.filter((row) => row.tagIds.includes(favourite._id));
    }

    const items: GridItem[] = [];
    for (const userManga of rows) {
      const manga = await ctx.db.get(userManga.mangaId);
      if (manga === null) continue; // dangling catalogue reference
      items.push({ userManga, manga });
    }

    return { page, items };
  },
});

/**
 * The trash view, newest deletion first.
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
    for (const userManga of rows) {
      const manga = await ctx.db.get(userManga.mangaId);
      if (manga === null) continue;
      items.push({ userManga, manga });
    }

    return { items };
  },
});
