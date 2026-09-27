import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { requireOwnedManga, requireSettings, requireUser } from "./lib/auth";
import { addToLibrary, recordHistory } from "./lib/library";
import { setProgressPage } from "./lib/pages";
import { progressKey } from "./lib/validators";

/** Adds a manga to the caller's library, or brings one back from the
    trash. See addToLibrary for the three cases. Used by the popup's
    Add Manga button. */
export const addManga = mutation({
  // progressKey: the page a new manga lands on; your default page if left out.
  args: { mangaId: v.id("mangas"), progressKey: v.optional(progressKey) },
  handler: async (ctx, { mangaId, progressKey: landOn }) => {
    const user = await requireUser(ctx);
    const settings = await requireSettings(ctx, user._id);
    return await addToLibrary(ctx, user._id, mangaId, landOn ?? settings.defaultProgressKey);
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

   The site dropdown in the card details popup. It lists only the
   sites you've read this manga on, and picking one switches back to
   reading it there, at the furthest chapter you reached on that site.
   Re-reading an earlier chapter doesn't move that point back.
   ═══════════════════════════════════════════════════════════════ */

/** The highest-numbered chapter you've read on one site, if any. */
async function furthestOnSite(
  ctx: QueryCtx,
  userMangaId: Id<"userMangas">,
  siteId: Id<"sites">,
): Promise<Doc<"readChapters"> | null> {
  // History is indexed by chapter number, so walking it from the top
  // down, the first entry from this site is the furthest one.
  const history = ctx.db
    .query("readChapters")
    .withIndex("by_userManga_number", (q) => q.eq("userMangaId", userMangaId))
    .order("desc");

  for await (const entry of history) {
    if (entry.siteId === siteId) return entry;
  }
  return null;
}

/** The sites you've read a manga on, with the current one marked and
    the furthest chapter you reached on each. */
export const sourcesFor = query({
  args: { userMangaId: v.id("userMangas") },
  handler: async (ctx, { userMangaId }) => {
    const user = await requireUser(ctx);
    const userManga = await requireOwnedManga(ctx, user._id, userMangaId);

    const siteIds = new Set<Id<"sites">>(userManga.readSiteIds ?? []);
    if (userManga.currentSiteId !== undefined) siteIds.add(userManga.currentSiteId);

    const sites = [];
    for (const id of siteIds) {
      const site = await ctx.db.get(id);
      if (site === null) continue;
      const isCurrent = id === userManga.currentSiteId;
      const last = isCurrent ? null : await furthestOnSite(ctx, userMangaId, id);
      sites.push({
        siteId: site._id,
        title: site.title,
        icon: site.icon,
        isCurrent,
        chapterLabel: isCurrent ? userManga.currentChapterLabel : last?.label,
      });
    }
    return sites.sort((a, b) => a.title.localeCompare(b.title));
  },
});

/**
 * Switches back to reading a manga on a site you've read it on before.
 *
 * The chapter you're leaving is saved to your history first, so
 * switching back returns you to it. Then your current chapter becomes
 * the furthest one you reached on the chosen site: its number, label,
 * reading percentage and link.
 */
export const switchSource = mutation({
  args: { userMangaId: v.id("userMangas"), siteId: v.id("sites") },
  handler: async (ctx, { userMangaId, siteId }) => {
    const user = await requireUser(ctx);
    const userManga = await requireOwnedManga(ctx, user._id, userMangaId);
    if (userManga.isDeleted) {
      throw new Error("That manga is in the trash. Restore it first.");
    }
    if (userManga.currentSiteId === siteId) return;
    if (!(userManga.readSiteIds ?? []).includes(siteId)) {
      throw new Error("You haven't read this manga on that site.");
    }

    // Keep the chapter you're leaving, so you can switch back to it.
    const leaving = userManga.currentSiteId;
    if (leaving !== undefined && userManga.currentChapterNumber !== undefined) {
      await recordHistory(ctx, userMangaId, {
        number: userManga.currentChapterNumber,
        label: userManga.currentChapterLabel,
        url: userManga.currentChapterUrl,
        siteId: leaving,
        percentage: userManga.currentPercentage,
        readAt: userManga.lastReadAt,
      });
    }

    // recordHistory may have updated readSiteIds, so read the row again
    // before touching that list.
    const fresh = (await ctx.db.get(userMangaId))!;
    const readSiteIds = [...(fresh.readSiteIds ?? [])];
    if (leaving !== undefined && !readSiteIds.includes(leaving)) readSiteIds.push(leaving);

    const target = await furthestOnSite(ctx, userMangaId, siteId);
    if (target === null) {
      // A site in your list always has history behind it, but if it
      // doesn't, switch the site and leave the chapter alone.
      await ctx.db.patch(userMangaId, { currentSiteId: siteId, readSiteIds });
      return;
    }

    await ctx.db.patch(userMangaId, {
      currentSiteId: siteId,
      currentChapterNumber: target.number,
      currentChapterLabel: target.label,
      currentChapterUrl: target.url,
      currentPercentage: target.percentage,
      readSiteIds,
    });
  },
});
