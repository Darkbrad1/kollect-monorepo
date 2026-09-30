import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation } from "./_generated/server";
import { requireOwnedManga, requireSettings, requireUser } from "./lib/auth";
import {
  purgeAtFor,
  purgeUserManga,
  restoreUserManga,
} from "./lib/trash";

/** How many library rows one purge mutation will work through. */
const PURGE_ROW_BATCH = 50;

/* ═══════════════════════════════════════════════════════════════
   SOFT DELETE / RESTORE

   Memberships survive a soft delete, which is the whole reason
   restore can put a manga back exactly where it was. The cost is
   that live page queries have to drop deleted rows in JS — the
   by_user_live_* indexes cannot be used when entering through
   userPageMangas.
   ═══════════════════════════════════════════════════════════════ */

export const softDelete = mutation({
  args: { userMangaId: v.id("userMangas") },
  handler: async (ctx, { userMangaId }) => {
    const user = await requireUser(ctx);
    const userManga = await requireOwnedManga(ctx, user._id, userMangaId);
    if (userManga.isDeleted) return;

    const settings = await requireSettings(ctx, user._id);
    const deletedAt = Date.now();

    await ctx.db.patch(userMangaId, {
      isDeleted: true,
      deletedAt,
      purgeAt: purgeAtFor(settings, deletedAt),
    });
  },
});

export const restore = mutation({
  args: { userMangaId: v.id("userMangas") },
  handler: async (ctx, { userMangaId }) => {
    const user = await requireUser(ctx);
    const userManga = await requireOwnedManga(ctx, user._id, userMangaId);
    if (!userManga.isDeleted) return;

    await restoreUserManga(ctx, userMangaId);
  },
});

/* ═══════════════════════════════════════════════════════════════
   PERMANENT DELETE

   The Delete entry on the trash page's context menu. Irreversible,
   so the UI must confirm before calling this — there is no undo
   once the readChapters rows are gone.
   ═══════════════════════════════════════════════════════════════ */

export const hardDelete = mutation({
  args: { userMangaId: v.id("userMangas") },
  handler: async (ctx, { userMangaId }) => {
    const user = await requireUser(ctx);
    await requireOwnedManga(ctx, user._id, userMangaId);

    const result = await purgeUserManga(ctx, userMangaId);
    if (result === "more") {
      await ctx.scheduler.runAfter(0, internal.trash.continuePurge, {
        userMangaId,
      });
    }
  },
});

/** Picks up a hardDelete whose readChapters exceeded one mutation. */
export const continuePurge = internalMutation({
  args: { userMangaId: v.id("userMangas") },
  handler: async (ctx, { userMangaId }) => {
    const userManga = await ctx.db.get(userMangaId);
    if (userManga === null) return; // already finished

    const result = await purgeUserManga(ctx, userMangaId);
    if (result === "more") {
      await ctx.scheduler.runAfter(0, internal.trash.continuePurge, {
        userMangaId,
      });
    }
  },
});

/** The Empty Trash button. Batches, then reschedules itself. */
export const emptyTrash = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    await ctx.scheduler.runAfter(0, internal.trash.emptyTrashBatch, {
      userId: user._id,
    });
  },
});

export const emptyTrashBatch = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const rows = await ctx.db
      .query("userMangas")
      .withIndex("by_user_trash", (q) =>
        q.eq("userId", userId).eq("isDeleted", true),
      )
      .take(PURGE_ROW_BATCH);

    for (const row of rows) {
      const result = await purgeUserManga(ctx, row._id);
      if (result === "more") {
        await ctx.scheduler.runAfter(0, internal.trash.continuePurge, {
          userMangaId: row._id,
        });
      }
    }

    // A full batch means there is probably more waiting.
    if (rows.length === PURGE_ROW_BATCH) {
      await ctx.scheduler.runAfter(0, internal.trash.emptyTrashBatch, {
        userId,
      });
    }
  },
});

/* ═══════════════════════════════════════════════════════════════
   SCHEDULED PURGE
   ═══════════════════════════════════════════════════════════════ */

export const purgeExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // gte(0) is load-bearing: purgeAt is optional, and a missing
    // field sorts BEFORE every number in a Convex index. A bare
    // lte(purgeAt, now) would therefore match every row with
    // autoClearTrash off — exactly the rows that must never be
    // purged. The lower bound excludes them.
    const rows = await ctx.db
      .query("userMangas")
      .withIndex("by_purge", (q) =>
        q.eq("isDeleted", true).gte("purgeAt", 0).lte("purgeAt", now),
      )
      .take(PURGE_ROW_BATCH);

    for (const row of rows) {
      const result = await purgeUserManga(ctx, row._id);
      if (result === "more") {
        await ctx.scheduler.runAfter(0, internal.trash.continuePurge, {
          userMangaId: row._id,
        });
      }
    }

    if (rows.length === PURGE_ROW_BATCH) {
      await ctx.scheduler.runAfter(0, internal.trash.purgeExpired, {});
    }
  },
});

/* ═══════════════════════════════════════════════════════════════
   RETENTION CHANGES

   Changing trashRetentionDays or autoClearTrash has to rewrite
   purgeAt across everything already in the trash, or the old
   window keeps applying to rows deleted before the change.
   ═══════════════════════════════════════════════════════════════ */

export const rewritePurgeAt = internalMutation({
  args: {
    userId: v.id("users"),
    cursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, { userId, cursor }) => {
    const settings = await requireSettings(ctx, userId);

    const batch = await ctx.db
      .query("userMangas")
      .withIndex("by_user_trash", (q) =>
        q.eq("userId", userId).eq("isDeleted", true),
      )
      .paginate({ cursor, numItems: PURGE_ROW_BATCH });

    for (const row of batch.page) {
      const deletedAt = row.deletedAt ?? row._creationTime;
      const purgeAt = purgeAtFor(settings, deletedAt);

      if (row.purgeAt === purgeAt) continue;
      await ctx.db.patch(row._id, { purgeAt });
    }

    if (!batch.isDone) {
      await ctx.scheduler.runAfter(0, internal.trash.rewritePurgeAt, {
        userId,
        cursor: batch.continueCursor,
      });
    }
  },
});
