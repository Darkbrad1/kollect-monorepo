import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { isProgressKey, type ProgressKey, type SystemKey } from "./constants";

export async function pageForSystemKey(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  systemKey: SystemKey,
): Promise<Doc<"userPages">> {
  const page = await ctx.db
    .query("userPages")
    .withIndex("by_user_systemKey", (q) =>
      q.eq("userId", userId).eq("systemKey", systemKey),
    )
    .unique();

  if (page === null) {
    throw new Error(`User ${userId} has no "${systemKey}" page.`);
  }
  return page;
}

/** Convex returns rows in index order, so new members go on the end. */
async function nextOrder(
  ctx: MutationCtx,
  pageId: Id<"userPages">,
): Promise<number> {
  const last = await ctx.db
    .query("userPageMangas")
    .withIndex("by_page_order", (q) => q.eq("pageId", pageId))
    .order("desc")
    .first();

  return last === null ? 0 : last.order + 1;
}

/**
 * THE invariant, in one place: every live userManga sits on exactly
 * one progress page. Clears whatever progress memberships the manga
 * currently holds, then inserts the one it should have.
 *
 * Favourites and custom pages are outside the progress group and are
 * deliberately left alone — moving from Reading to Completed must not
 * drop a manga off the user's own lists.
 */
export async function placeOnProgressPage(
  ctx: MutationCtx,
  userId: Id<"users">,
  userMangaId: Id<"userMangas">,
  key: ProgressKey,
): Promise<Id<"userPages">> {
  const memberships = await ctx.db
    .query("userPageMangas")
    .withIndex("by_userManga", (q) => q.eq("userMangaId", userMangaId))
    .collect();

  for (const membership of memberships) {
    const page = await ctx.db.get(membership.pageId);
    // A dangling pageId reads back as null — Convex does not validate
    // foreign keys. Such a membership can never be displayed, so drop
    // it alongside the progress ones rather than leaving it to rot.
    if (page === null || isProgressKey(page.systemKey)) {
      await ctx.db.delete(membership._id);
    }
  }

  const target = await pageForSystemKey(ctx, userId, key);
  await ctx.db.insert("userPageMangas", {
    pageId: target._id,
    userMangaId,
    order: await nextOrder(ctx, target._id),
  });

  return target._id;
}

/** Adds a membership unless the manga is already on that page. For
    favourites and custom pages only — progress pages go through
    placeOnProgressPage so the one-page invariant holds. */
export async function ensureMembership(
  ctx: MutationCtx,
  pageId: Id<"userPages">,
  userMangaId: Id<"userMangas">,
): Promise<void> {
  const memberships = await ctx.db
    .query("userPageMangas")
    .withIndex("by_userManga", (q) => q.eq("userMangaId", userMangaId))
    .collect();
  if (memberships.some((m) => m.pageId === pageId)) return;

  await ctx.db.insert("userPageMangas", {
    pageId,
    userMangaId,
    order: await nextOrder(ctx, pageId),
  });
}

/** Which progress page a manga is on, or null if the invariant has
    been broken and it is on none. */
export async function currentProgressKey(
  ctx: QueryCtx | MutationCtx,
  userMangaId: Id<"userMangas">,
): Promise<ProgressKey | null> {
  const memberships = await ctx.db
    .query("userPageMangas")
    .withIndex("by_userManga", (q) => q.eq("userMangaId", userMangaId))
    .collect();

  for (const membership of memberships) {
    const page = await ctx.db.get(membership.pageId);
    if (page !== null && isProgressKey(page.systemKey)) return page.systemKey;
  }
  return null;
}
