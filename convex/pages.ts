import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { isProgressKey } from "./lib/constants";
import { favouriteTag, requireOwnedTag } from "./lib/tags";
import { normalizeTitle } from "./lib/titles";
import { filterRule, sortRule } from "./lib/validators";

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

/**
 * The Search box in the top bar. Searches your whole library, not just
 * the page you're on, by title and alternative titles. Capitals and
 * punctuation don't matter. Titles that start with what you typed come
 * first, then the rest, each A to Z. Manga in the trash aren't
 * included. Each result's userManga.progressKey says which page it's on.
 */
export const searchLibrary = query({
  args: { text: v.string() },
  handler: async (ctx, { text }) => {
    const user = await requireUser(ctx);
    const needle = normalizeTitle(text);
    if (needle === "") return { items: [] as GridItem[] };

    const rows = await ctx.db
      .query("userMangas")
      .withIndex("by_user_live_added", (q) =>
        q.eq("userId", user._id).eq("isDeleted", false),
      )
      .collect();

    const hits: (GridItem & { startsWith: boolean; sortTitle: string })[] = [];
    for (const userManga of rows) {
      const manga = await ctx.db.get(userManga.mangaId);
      if (manga === null) continue;

      const title = normalizeTitle(manga.title);
      const names = [title, ...manga.altTitles.map(normalizeTitle)];
      if (!names.some((name) => name.includes(needle))) continue;

      hits.push({
        userManga,
        manga,
        startsWith: names.some((name) => name.startsWith(needle)),
        sortTitle: title,
      });
    }

    hits.sort((a, b) => {
      if (a.startsWith !== b.startsWith) return a.startsWith ? -1 : 1;
      return a.sortTitle.localeCompare(b.sortTitle);
    });
    return { items: hits.map(({ userManga, manga }) => ({ userManga, manga })) };
  },
});

/* ═══════════════════════════════════════════════════════════════
   SAVED FILTERS AND SORT

   Each page remembers its own filters and sort. The filter and sort
   popups save the whole list each time something changes; "Clear
   All" saves an empty list.
   ═══════════════════════════════════════════════════════════════ */

async function requireOwnedPage(
  ctx: MutationCtx,
  userId: Id<"users">,
  pageId: Id<"userPages">,
): Promise<Doc<"userPages">> {
  const page = await ctx.db.get(pageId);
  if (page === null || page.userId !== userId) throw new Error("No such page.");
  return page;
}

export const setFilters = mutation({
  args: { pageId: v.id("userPages"), filters: v.array(filterRule) },
  handler: async (ctx, { pageId, filters }) => {
    const user = await requireUser(ctx);
    await requireOwnedPage(ctx, user._id, pageId);

    // A tag filter must point at one of this user's own tags.
    for (const rule of filters) {
      if (rule.field === "tag") await requireOwnedTag(ctx, user._id, rule.tagId);
    }
    await ctx.db.patch(pageId, { filters });
  },
});

export const setSort = mutation({
  args: { pageId: v.id("userPages"), sort: v.array(sortRule) },
  handler: async (ctx, { pageId, sort }) => {
    const user = await requireUser(ctx);
    await requireOwnedPage(ctx, user._id, pageId);
    await ctx.db.patch(pageId, { sort });
  },
});
