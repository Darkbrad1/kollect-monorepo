import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { ProgressKey, SystemKey } from "./constants";

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

/**
 * Moves a manga to a progress page. Every status change goes through
 * here. A manga has exactly one progressKey, so it can never be on two
 * progress pages or on none.
 */
export async function setProgressPage(
  ctx: MutationCtx,
  userMangaId: Id<"userMangas">,
  key: ProgressKey,
): Promise<void> {
  await ctx.db.patch(userMangaId, { progressKey: key });
}
