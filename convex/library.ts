import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { requireOwnedManga, requireSettings, requireUser } from "./lib/auth";
import { addToLibrary, recordHistory } from "./lib/library";
import { setProgressPage } from "./lib/pages";
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
 * included.
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

    await setProgressPage(ctx, userMangaId, systemKey);
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

/* ═══════════════════════════════════════════════════════════════
   READING SOURCE

   The site dropdown in the card details popup. It lists every site
   known to have the series, and picking one switches where you're
   reading it.
   ═══════════════════════════════════════════════════════════════ */

/**
 * The sites to offer in the dropdown: every site known to carry the
 * series, plus any site you've read it on, with the current one marked.
 */
export const sourcesFor = query({
  args: { userMangaId: v.id("userMangas") },
  handler: async (ctx, { userMangaId }) => {
    const user = await requireUser(ctx);
    const userManga = await requireOwnedManga(ctx, user._id, userMangaId);

    const carrying = await ctx.db
      .query("mangaSources")
      .withIndex("by_manga", (q) => q.eq("mangaId", userManga.mangaId))
      .collect();

    const siteIds = new Set<Id<"sites">>(carrying.map((source) => source.siteId));
    for (const id of userManga.readSiteIds ?? []) siteIds.add(id);
    if (userManga.currentSiteId !== undefined) siteIds.add(userManga.currentSiteId);

    const sites = [];
    for (const id of siteIds) {
      const site = await ctx.db.get(id);
      if (site === null) continue;
      sites.push({
        siteId: site._id,
        title: site.title,
        icon: site.icon,
        isCurrent: site._id === userManga.currentSiteId,
      });
    }
    return sites.sort((a, b) => a.title.localeCompare(b.title));
  },
});

/**
 * Switches which site you're reading a manga on. Your chapter stays
 * the same. The old site counts as one you've read it on, so the
 * "Source contains" filter still finds it there. The "continue
 * reading" link becomes the series page on the new site until you
 * read a chapter there.
 */
export const switchSource = mutation({
  args: { userMangaId: v.id("userMangas"), siteId: v.id("sites") },
  handler: async (ctx, { userMangaId, siteId }) => {
    const user = await requireUser(ctx);
    const userManga = await requireOwnedManga(ctx, user._id, userMangaId);
    if (userManga.isDeleted) {
      throw new Error("That manga is in the trash. Restore it first.");
    }
    if ((await ctx.db.get(siteId)) === null) throw new Error("No such site.");
    if (userManga.currentSiteId === siteId) return;

    const readSiteIds = [...(userManga.readSiteIds ?? [])];
    const previous = userManga.currentSiteId;
    if (previous !== undefined && !readSiteIds.includes(previous)) {
      readSiteIds.push(previous);
    }

    const source = await ctx.db
      .query("mangaSources")
      .withIndex("by_manga", (q) => q.eq("mangaId", userManga.mangaId))
      .filter((q) => q.eq(q.field("siteId"), siteId))
      .first();

    await ctx.db.patch(userMangaId, {
      currentSiteId: siteId,
      // The old link pointed at a chapter on the old site. Undefined
      // clears it when the new site has no known series page.
      currentChapterUrl: source?.url,
      readSiteIds,
    });
  },
});
