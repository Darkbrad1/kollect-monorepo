import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireOwnedManga, requireSettings, requireUser } from "./lib/auth";
import { addToLibrary, recordHistory } from "./lib/library";
import { placeOnProgressPage } from "./lib/pages";
import { progressKey } from "./lib/validators";

/** Adds a manga to the caller's library, or brings one back from the
    trash. See addToLibrary for the three cases. */
export const addManga = mutation({
  args: { mangaId: v.id("mangas") },
  handler: async (ctx, { mangaId }) => {
    const user = await requireUser(ctx);
    const settings = await requireSettings(ctx, user._id);
    return await addToLibrary(ctx, user._id, mangaId, settings.defaultProgressKey);
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

    const pageId = await placeOnProgressPage(ctx, user._id, userMangaId, systemKey);
    return { pageId };
  },
});

/* ═══════════════════════════════════════════════════════════════
   READING HISTORY

   Lets a user step back to a chapter they read before — for
   instance the smaller chapter an import set aside. No screen uses
   these yet; the UI is still being designed.
   ═══════════════════════════════════════════════════════════════ */

/** Every saved chapter for one manga, highest chapter first. */
export const chapterHistory = query({
  args: { userMangaId: v.id("userMangas") },
  handler: async (ctx, { userMangaId }) => {
    const user = await requireUser(ctx);
    await requireOwnedManga(ctx, user._id, userMangaId);

    return await ctx.db
      .query("readChapters")
      .withIndex("by_userManga_number", (q) => q.eq("userMangaId", userMangaId))
      .order("desc")
      .collect();
  },
});

/**
 * Makes a history chapter the current chapter again.
 *
 * The chapter being left is saved into history first, so switching is
 * never lossy — you can always switch forward again. The only case it
 * cannot save is a current chapter with no known website, since every
 * history row must name one; `keptPrevious` reports that.
 */
export const switchToHistoryChapter = mutation({
  args: { readChapterId: v.id("readChapters") },
  handler: async (ctx, { readChapterId }) => {
    const user = await requireUser(ctx);

    const chapter = await ctx.db.get(readChapterId);
    if (chapter === null) throw new Error("No such chapter in history.");

    const userManga = await requireOwnedManga(ctx, user._id, chapter.userMangaId);
    if (userManga.isDeleted) {
      throw new Error("That manga is in the trash. Restore it first.");
    }

    let keptPrevious = true;
    if (userManga.currentChapterNumber !== undefined) {
      if (userManga.currentSiteId === undefined) {
        keptPrevious = false;
      } else {
        await recordHistory(ctx, userManga._id, {
          number: userManga.currentChapterNumber,
          label: userManga.currentChapterLabel,
          url: userManga.currentChapterUrl,
          siteId: userManga.currentSiteId,
          percentage: userManga.currentPercentage,
          readAt: userManga.lastReadAt,
        });
      }
    }

    // All current-chapter fields come from the one history row. A
    // missing url deliberately clears the old one, which pointed at
    // the chapter being left.
    await ctx.db.patch(userManga._id, {
      currentChapterNumber: chapter.number,
      currentChapterLabel: chapter.label,
      currentChapterUrl: chapter.url,
      currentSiteId: chapter.siteId,
      currentPercentage: chapter.percentage,
    });

    return { keptPrevious };
  },
});
