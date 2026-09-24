import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { ProgressKey } from "./constants";
import { restoreUserManga } from "./trash";

/**
 * Adds a manga to a user's library, or brings one back.
 *
 *   found + deleted -> restore; it keeps its page and tags, so it goes
 *                      back where it was
 *   found + live    -> no-op
 *   not found       -> create it on the `landOn` page
 *
 * Shared by addManga and the Titles only import.
 */
export async function addToLibrary(
  ctx: MutationCtx,
  userId: Id<"users">,
  mangaId: Id<"mangas">,
  landOn: ProgressKey,
): Promise<{
  userMangaId: Id<"userMangas">;
  action: "created" | "restored" | "noop";
}> {
  const existing = await ctx.db
    .query("userMangas")
    .withIndex("by_user_manga", (q) =>
      q.eq("userId", userId).eq("mangaId", mangaId),
    )
    .unique();

  if (existing !== null) {
    if (!existing.isDeleted) return { userMangaId: existing._id, action: "noop" };
    await restoreUserManga(ctx, existing._id);
    return { userMangaId: existing._id, action: "restored" };
  }

  const userMangaId = await ctx.db.insert("userMangas", {
    userId,
    mangaId,
    addedAt: Date.now(),
    progressKey: landOn,
    tagIds: [],
    isDeleted: false,
  });

  return { userMangaId, action: "created" };
}

export type HistoryEntry = {
  number: number;
  label?: string;
  url?: string;
  siteId: Id<"sites">;
  percentage?: number;
  readAt?: number;
};

/**
 * Saves a chapter into reading history unless that chapter number is
 * already there. Returns whether a row was written.
 */
export async function recordHistory(
  ctx: MutationCtx,
  userMangaId: Id<"userMangas">,
  entry: HistoryEntry,
): Promise<boolean> {
  const existing = await ctx.db
    .query("readChapters")
    .withIndex("by_userManga_number", (q) =>
      q.eq("userMangaId", userMangaId).eq("number", entry.number),
    )
    .first();
  if (existing !== null) return false;

  await ctx.db.insert("readChapters", {
    userMangaId,
    number: entry.number,
    label: entry.label ?? `Ch. ${entry.number}`,
    url: entry.url,
    siteId: entry.siteId,
    percentage: entry.percentage ?? 0,
    readAt: entry.readAt ?? Date.now(),
  });

  // Keep the manga's list of read-on sites in step with its history.
  const userManga = await ctx.db.get(userMangaId);
  const readSiteIds = userManga?.readSiteIds ?? [];
  if (userManga !== null && !readSiteIds.includes(entry.siteId)) {
    await ctx.db.patch(userMangaId, { readSiteIds: [...readSiteIds, entry.siteId] });
  }
  return true;
}
