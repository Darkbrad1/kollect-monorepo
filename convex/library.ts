import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireOwnedManga, requireSettings, requireUser } from "./lib/auth";
import { placeOnProgressPage } from "./lib/pages";
import type { ProgressKey } from "./lib/constants";

const progressKey = v.union(
  v.literal("reading"),
  v.literal("planned"),
  v.literal("paused"),
  v.literal("completed"),
);

/**
 * Adds a manga to the caller's library, or brings one back.
 *
 *   found + deleted -> restore, memberships intact, back where it was
 *   found + live    -> no-op
 *   not found       -> create, and land it on defaultProgressKey in
 *                      the same transaction, so the "exactly one
 *                      progress page" invariant never has a gap
 */
export const addManga = mutation({
  args: { mangaId: v.id("mangas") },
  handler: async (ctx, { mangaId }) => {
    const user = await requireUser(ctx);

    const existing = await ctx.db
      .query("userMangas")
      .withIndex("by_user_manga", (q) =>
        q.eq("userId", user._id).eq("mangaId", mangaId),
      )
      .unique();

    if (existing !== null) {
      if (!existing.isDeleted) return { userMangaId: existing._id, action: "noop" as const };

      // Memberships survived the soft delete, so clearing the three
      // fields is the whole restore — the manga reappears on the pages
      // it was on.
      await ctx.db.patch(existing._id, {
        isDeleted: false,
        deletedAt: undefined,
        purgeAt: undefined,
      });
      return { userMangaId: existing._id, action: "restored" as const };
    }

    const settings = await requireSettings(ctx, user._id);
    const userMangaId = await ctx.db.insert("userMangas", {
      userId: user._id,
      mangaId,
      addedAt: Date.now(),
      isDeleted: false,
    });

    await placeOnProgressPage(
      ctx,
      user._id,
      userMangaId,
      settings.defaultProgressKey,
    );

    return { userMangaId, action: "created" as const };
  },
});

/**
 * The single route for every status change, autoCompleteOnFinish
 * included. Clearing the sibling memberships and inserting the new one
 * happen in one transaction, so the manga is never on two progress
 * pages and never on none.
 */
export const moveToProgressPage = mutation({
  args: {
    userMangaId: v.id("userMangas"),
    systemKey: progressKey,
  },
  handler: async (ctx, { userMangaId, systemKey }) => {
    const user = await requireUser(ctx);
    const userManga = await requireOwnedManga(ctx, user._id, userMangaId);

    if (userManga.isDeleted) {
      throw new Error(
        "That manga is in the trash. Restore it before moving it.",
      );
    }

    const pageId = await placeOnProgressPage(
      ctx,
      user._id,
      userMangaId,
      systemKey as ProgressKey,
    );

    return { pageId };
  },
});
