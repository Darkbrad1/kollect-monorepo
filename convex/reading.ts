import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { getCurrentUser, requireSettings, requireUser } from "./lib/auth";
import { refreshMangaLatest } from "./lib/catalogue";
import { addToLibrary, recordHistory } from "./lib/library";
import { setProgressPage } from "./lib/pages";
import { favouriteTag, addTagTo } from "./lib/tags";
import { normalizeTitle } from "./lib/titles";
import { mangaStatus, progressKey } from "./lib/validators";

/* ═══════════════════════════════════════════════════════════════
   READING PAGES

   What the extension calls from a manga's page on a reading website.
   The extension works out what the page is (which site, which series,
   which chapter) and sends it here as a `page`.

   The rules, as agreed:
   - Only manga in your library are tracked. Reading something you
     haven't added does nothing until you add it.
   - A chapter becomes your current one once you've scrolled past your
     Scroll Threshold, not when you open it.
   - Going back to an earlier chapter saves it to your history but
     keeps your current (furthest) chapter.
   - Auto Complete On Finish moves a manga to Completed when you finish
     the newest chapter and the site says the series has ended.
   - Every visit updates the series' latest chapter, as well as the
     weekly job.
   ═══════════════════════════════════════════════════════════════ */

/** What the extension read off a reading page. */
const pageInfo = v.object({
  // The site's domain from the sites table, e.g. "asuracomic.net".
  domain: v.string(),
  url: v.string(),
  // The series' identifier in the address, when the site has one.
  slug: v.optional(v.string()),
  title: v.string(),
  image: v.optional(v.string()),
  // The series' own page, when this is a chapter page.
  seriesUrl: v.optional(v.string()),
  chapter: v.optional(v.object({ number: v.number(), label: v.string() })),
  latestChapter: v.optional(v.number()),
  status: v.optional(mangaStatus),
});

type PageInfo = typeof pageInfo.type;

async function siteForDomain(ctx: QueryCtx, domain: string): Promise<Doc<"sites"> | null> {
  return await ctx.db
    .query("sites")
    .withIndex("by_domain", (q) => q.eq("domain", domain.toLowerCase()))
    .unique();
}

/** Finds the catalogue manga a page is about: by its address on this
    site first, then by title. */
async function findManga(
  ctx: QueryCtx,
  site: Doc<"sites">,
  page: PageInfo,
): Promise<{ manga: Doc<"mangas">; source: Doc<"mangaSources"> | null } | null> {
  if (page.slug !== undefined) {
    const source = await ctx.db
      .query("mangaSources")
      .withIndex("by_site_slug", (q) => q.eq("siteId", site._id).eq("slug", page.slug))
      .first();
    if (source !== null) {
      const manga = await ctx.db.get(source.mangaId);
      if (manga !== null) return { manga, source };
    }
  }

  const normalized = normalizeTitle(page.title);
  if (normalized === "") return null;
  const manga = await ctx.db
    .query("mangas")
    .withIndex("by_normalizedTitle", (q) => q.eq("normalizedTitle", normalized))
    .first();
  if (manga === null) return null;

  const sources = await ctx.db
    .query("mangaSources")
    .withIndex("by_manga", (q) => q.eq("mangaId", manga._id))
    .collect();
  return { manga, source: sources.find((s) => s.siteId === site._id) ?? null };
}

/**
 * Makes sure the manga and its entry for this site exist, creating
 * them from the page if needed, and notes the newest chapter and the
 * series status the page shows.
 */
async function ensureManga(
  ctx: MutationCtx,
  site: Doc<"sites">,
  page: PageInfo,
  create: boolean,
): Promise<Doc<"mangas"> | null> {
  let found = await findManga(ctx, site, page);

  if (found === null) {
    if (!create) return null;
    const mangaId = await ctx.db.insert("mangas", {
      title: page.title.trim(),
      normalizedTitle: normalizeTitle(page.title),
      altTitles: [],
      image: page.image ?? "",
      type: "other",
      authors: [],
      tags: [],
    });
    found = { manga: (await ctx.db.get(mangaId))!, source: null };
  }

  const { manga } = found;
  let source = found.source;
  if (source === null) {
    const sourceId = await ctx.db.insert("mangaSources", {
      mangaId: manga._id,
      siteId: site._id,
      slug: page.slug,
      url: page.seriesUrl ?? page.url,
    });
    source = (await ctx.db.get(sourceId))!;
  } else if (page.slug !== undefined && source.slug !== page.slug) {
    // Found by title, but the site now uses a different address for
    // it (some sites change these). Remember the new one.
    await ctx.db.patch(source._id, { slug: page.slug, url: page.seriesUrl ?? source.url });
    source = (await ctx.db.get(source._id))!;
  }

  // The newest chapter this page proves exists: the one it lists as
  // latest, or the one you're reading, whichever is higher.
  const seen = Math.max(page.latestChapter ?? -Infinity, page.chapter?.number ?? -Infinity);
  if (Number.isFinite(seen) && (source.latestChapter === undefined || seen > source.latestChapter)) {
    await ctx.db.patch(source._id, { latestChapter: seen, lastCheckedAt: Date.now() });
    await refreshMangaLatest(ctx, manga._id);
  }

  const patch: Partial<Doc<"mangas">> = {};
  if (page.status !== undefined && page.status !== manga.status) patch.status = page.status;
  if (manga.image === "" && page.image) patch.image = page.image;
  if (Object.keys(patch).length > 0) await ctx.db.patch(manga._id, patch);

  return (await ctx.db.get(manga._id))!;
}

async function libraryEntry(
  ctx: QueryCtx,
  userId: Id<"users">,
  mangaId: Id<"mangas">,
): Promise<Doc<"userMangas"> | null> {
  return await ctx.db
    .query("userMangas")
    .withIndex("by_user_manga", (q) => q.eq("userId", userId).eq("mangaId", mangaId))
    .unique();
}

/**
 * What the Kollect button needs to know about the page you're on:
 * whether the site is supported, whether this manga is in your library
 * (and on which page), and your reading settings. Null when you're
 * signed out.
 */
export const pageState = query({
  args: { page: pageInfo },
  handler: async (ctx, { page }) => {
    const user = await getCurrentUser(ctx);
    if (user === null) return null;
    const settings = await requireSettings(ctx, user._id);

    const site = await siteForDomain(ctx, page.domain);
    const found = site === null ? null : await findManga(ctx, site, page);
    const entry = found === null ? null : await libraryEntry(ctx, user._id, found.manga._id);
    const favourite = await favouriteTag(ctx, user._id);

    return {
      supported: site !== null,
      // Only live entries count; one in the trash reads as "not added".
      inLibrary: entry !== null && !entry.isDeleted,
      progressKey: entry !== null && !entry.isDeleted ? entry.progressKey : null,
      isFavourite: entry !== null && !entry.isDeleted && entry.tagIds.includes(favourite._id),
      currentChapter: entry?.isDeleted === false ? (entry.currentChapterNumber ?? null) : null,
      settings: {
        scrollThreshold: settings.scrollThreshold,
        showProgressBar: settings.hasPercentageBar,
        showButton: settings.hasScreenOverlayOptions,
        theme: settings.theme,
      },
    };
  },
});

/**
 * Adds the manga on this page to your library. Used by the Kollect
 * button, the right-click menu and the keyboard shortcut.
 *
 * - `progressKey` picks the page; without it, it goes on Reading.
 *   If it's already in your library, this moves it there.
 * - `favourite` also favourites it (adding it to Reading first if
 *   it isn't in your library yet).
 * - Something in the trash is restored first.
 */
export const addFromPage = mutation({
  args: {
    page: pageInfo,
    progressKey: v.optional(progressKey),
    favourite: v.optional(v.boolean()),
  },
  handler: async (ctx, { page, progressKey: target, favourite }) => {
    const user = await requireUser(ctx);
    const site = await siteForDomain(ctx, page.domain);
    if (site === null) throw new Error("Kollect doesn't support this website yet.");
    if (normalizeTitle(page.title) === "") throw new Error("Couldn't find this manga's title on the page.");

    const manga = (await ensureManga(ctx, site, page, true))!;
    const { userMangaId, action } = await addToLibrary(ctx, user._id, manga._id, target ?? "reading");

    // A manga that was already there (or just restored) keeps its page
    // unless one was asked for.
    if (action !== "created" && target !== undefined) {
      await setProgressPage(ctx, userMangaId, target);
    }
    if (favourite) {
      const tag = await favouriteTag(ctx, user._id);
      await addTagTo(ctx, (await ctx.db.get(userMangaId))!, tag._id);
    }
    return { userMangaId, action };
  },
});

/**
 * Called while you read a chapter, with how far down it you are
 * (0–100). See the rules at the top of this file.
 */
export const recordProgress = mutation({
  args: { page: pageInfo, percentage: v.number() },
  handler: async (ctx, { page, percentage }) => {
    const user = await requireUser(ctx);
    const settings = await requireSettings(ctx, user._id);
    const site = await siteForDomain(ctx, page.domain);
    if (site === null || page.chapter === undefined) return { tracked: false };

    // Known manga get their latest chapter updated even when they
    // aren't in your library; unknown ones aren't created.
    const manga = await ensureManga(ctx, site, page, false);
    if (manga === null) return { tracked: false };
    const entry = await libraryEntry(ctx, user._id, manga._id);
    if (entry === null || entry.isDeleted) return { tracked: false };

    const now = Date.now();
    const percent = Math.min(100, Math.max(0, percentage));
    const chapter = page.chapter;
    const current = entry.currentChapterNumber;
    const readSiteIds = entry.readSiteIds ?? [];
    const withSite = readSiteIds.includes(site._id) ? readSiteIds : [...readSiteIds, site._id];

    // Still on your current chapter: keep its progress up to date.
    // Scrolling back up doesn't lower it.
    if (current === chapter.number) {
      await ctx.db.patch(entry._id, {
        currentPercentage: Math.max(percent, entry.currentSiteId === site._id ? (entry.currentPercentage ?? 0) : 0),
        currentChapterLabel: chapter.label,
        currentChapterUrl: page.url,
        currentSiteId: site._id,
        readSiteIds: withSite,
        lastReadAt: now,
      });
      await autoComplete(ctx, settings, manga, entry._id, chapter.number);
      return { tracked: true, counted: true };
    }

    // Any other chapter only counts once you're past the threshold.
    if (percent < settings.scrollThreshold) return { tracked: true, counted: false };

    if (current !== undefined && chapter.number < current) {
      // Re-reading an earlier chapter: into history, current stays.
      await recordHistory(ctx, entry._id, {
        number: chapter.number,
        label: chapter.label,
        url: page.url,
        siteId: site._id,
        percentage: percent,
        readAt: now,
      });
      await ctx.db.patch(entry._id, { lastReadAt: now });
      return { tracked: true, counted: true };
    }

    // Moving forward: the chapter you're leaving goes into history.
    if (current !== undefined && entry.currentSiteId !== undefined) {
      await recordHistory(ctx, entry._id, {
        number: current,
        label: entry.currentChapterLabel,
        url: entry.currentChapterUrl,
        siteId: entry.currentSiteId,
        percentage: entry.currentPercentage,
        readAt: entry.lastReadAt,
      });
    }
    // recordHistory may have added to readSiteIds, so read it again.
    const fresh = (await ctx.db.get(entry._id))!;
    const sites = fresh.readSiteIds ?? [];
    await ctx.db.patch(entry._id, {
      currentChapterNumber: chapter.number,
      currentChapterLabel: chapter.label,
      currentChapterUrl: page.url,
      currentSiteId: site._id,
      currentPercentage: percent,
      readSiteIds: sites.includes(site._id) ? sites : [...sites, site._id],
      lastReadAt: now,
    });
    await autoComplete(ctx, settings, manga, entry._id, chapter.number);
    return { tracked: true, counted: true };
  },
});

/** Auto Complete On Finish: past the threshold on the newest chapter of
    a series the site says has ended. */
async function autoComplete(
  ctx: MutationCtx,
  settings: Doc<"settings">,
  manga: Doc<"mangas">,
  userMangaId: Id<"userMangas">,
  chapterNumber: number,
): Promise<void> {
  if (!settings.autoCompleteOnFinish) return;
  if (manga.status !== "completed" || manga.latestChapter === undefined) return;
  if (chapterNumber < manga.latestChapter) return;
  const entry = await ctx.db.get(userMangaId);
  if (entry === null || entry.progressKey === "completed") return;
  if ((entry.currentPercentage ?? 0) < settings.scrollThreshold) return;
  await setProgressPage(ctx, userMangaId, "completed");
}
