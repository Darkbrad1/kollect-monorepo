import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { DAY_MS } from "./constants";

/**
 * When a soft-deleted manga becomes eligible for purging.
 *
 * autoClearTrash off returns undefined — the row stays in the trash
 * indefinitely. That is why retention is a separate number from the
 * flag: turning auto-clear back on restores the user's chosen window
 * instead of a default.
 */
export function purgeAtFor(
  settings: Doc<"settings">,
  deletedAt: number,
): number | undefined {
  if (!settings.autoClearTrash) return undefined;
  return deletedAt + settings.trashRetentionDays * DAY_MS;
}

/** Clears the three soft-delete fields. Memberships were never touched,
    so the manga reappears on exactly the pages it was on. */
export async function restoreUserManga(
  ctx: MutationCtx,
  userMangaId: Id<"userMangas">,
): Promise<void> {
  await ctx.db.patch(userMangaId, {
    isDeleted: false,
    deletedAt: undefined,
    purgeAt: undefined,
  });
}

/* Children are deleted before the parent, so a partial failure leaves
   orphaned children rather than a userManga pointing at rows that are
   half gone. readChapters is the only child that can be large, so it
   is the one that gets a budget. */
export const PURGE_CHILD_BATCH = 500;

/**
 * Permanently removes one library row: readChapters, then page
 * memberships, then the row itself.
 *
 * Returns "more" when there were too many readChapters to finish in
 * this mutation. The caller reschedules; the userManga row survives
 * until its children are gone, so nothing is left dangling.
 */
export async function purgeUserManga(
  ctx: MutationCtx,
  userMangaId: Id<"userMangas">,
): Promise<"done" | "more"> {
  const chapters = await ctx.db
    .query("readChapters")
    .withIndex("by_userManga_number", (q) => q.eq("userMangaId", userMangaId))
    .take(PURGE_CHILD_BATCH + 1);

  const hasMore = chapters.length > PURGE_CHILD_BATCH;
  for (const chapter of chapters.slice(0, PURGE_CHILD_BATCH)) {
    await ctx.db.delete(chapter._id);
  }
  if (hasMore) return "more";

  const memberships = await ctx.db
    .query("userPageMangas")
    .withIndex("by_userManga", (q) => q.eq("userMangaId", userMangaId))
    .collect();
  for (const membership of memberships) {
    await ctx.db.delete(membership._id);
  }

  await ctx.db.delete(userMangaId);
  return "done";
}
