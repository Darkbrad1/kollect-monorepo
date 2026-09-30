import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { getCurrentUser, requireSettings, requireUser } from "./lib/auth";
import { addAltTitle, refreshMangaLatest } from "./lib/catalogue";
import { addToLibrary, recordHistory } from "./lib/library";
import { compareTitle } from "./lib/matching";
import { setProgressPage } from "./lib/pages";
import { siteForDomain } from "./lib/sites";
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
     Scroll Threshold, not when you open it. Except when you add a manga
     from a chapter page and have no place in it yet: then that chapter
     counts straight away (see addFromPage).
   - Going back to an earlier chapter saves it to your history but
     keeps your current (furthest) chapter.
   - Auto Complete On Finish moves a manga to Completed when you finish
     the newest chapter and the site says the series has ended.
   - Every visit updates the series' latest chapter, as well as the
     weekly job.

   Which manga a page is (docs/grilling/2026-09-29-adding-from-a-website.md):
   - By its address first: your own link (userSourceLinks), then the
     shared one (mangaSources), unless you said "Not this manga?" to it.
   - Otherwise by title. Add asks "Is it one of these?" whenever a
     title is the same or close (lib/matching.ts). Reading tracks an
     exact title match with a manga in your library without asking,
     and says so the first time on each website.
   ═══════════════════════════════════════════════════════════════ */

/** What the extension read off a reading page. */
const pageInfo = v.object({
  // The site's domain from the sites table, e.g. "asurascans.com".
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

/* ── finding the manga ────────────────────────────────────────── */

/** The key a user's own link is stored under: the series' slug, or its
    title on sites whose addresses don't name the series. */
function linkKey(page: PageInfo): string {
  return page.slug ?? `title:${normalizeTitle(page.title)}`;
}

async function userLink(
  ctx: QueryCtx,
  userId: Id<"users">,
  siteId: Id<"sites">,
  page: PageInfo,
): Promise<Doc<"userSourceLinks"> | null> {
  return await ctx.db
    .query("userSourceLinks")
    .withIndex("by_user_site_key", (q) => q.eq("userId", userId).eq("siteId", siteId).eq("key", linkKey(page)))
    .unique();
}

/** The shared link for this page's address, whichever manga it's for.
    On a site without slugs, the address is the site plus the title. */
async function sharedSource(
  ctx: QueryCtx,
  site: Doc<"sites">,
  page: PageInfo,
): Promise<Doc<"mangaSources"> | null> {
  if (page.slug !== undefined) {
    return await ctx.db
      .query("mangaSources")
      .withIndex("by_site_slug", (q) => q.eq("siteId", site._id).eq("slug", page.slug))
      .first();
  }
  const normalized = normalizeTitle(page.title);
  if (normalized === "") return null;
  const mangas = await ctx.db
    .query("mangas")
    .withIndex("by_normalizedTitle", (q) => q.eq("normalizedTitle", normalized))
    .take(20);
  for (const manga of mangas) {
    const sources = await ctx.db
      .query("mangaSources")
      .withIndex("by_manga", (q) => q.eq("mangaId", manga._id))
      .collect();
    const here = sources.find((s) => s.siteId === site._id && s.slug === undefined);
    if (here !== undefined) return here;
  }
  return null;
}

type Resolved = {
  link: Doc<"userSourceLinks"> | null;
  /** The shared link for this address, even when it's to another manga. */
  source: Doc<"mangaSources"> | null;
  /** The manga this address means for you, if the address settles it. */
  manga: Doc<"mangas"> | null;
};

/** Which manga this page's address means for this user. */
async function resolveAddress(
  ctx: QueryCtx,
  userId: Id<"users">,
  site: Doc<"sites">,
  page: PageInfo,
): Promise<Resolved> {
  const link = await userLink(ctx, userId, site._id, page);
  const source = await sharedSource(ctx, site, page);
  if (link?.mangaId) return { link, source, manga: await ctx.db.get(link.mangaId) };
  if (source !== null && !(link?.rejectedMangaIds ?? []).includes(source.mangaId)) {
    return { link, source, manga: await ctx.db.get(source.mangaId) };
  }
  return { link, source, manga: null };
}

type TitleMatch = { manga: Doc<"mangas">; match: "exact" | "close" };

/** Manga in the shared list whose title or alternative titles are the
    same as or close to this one. Exact matches come first. */
async function titleMatches(ctx: QueryCtx, title: string, exclude: Id<"mangas">[]): Promise<TitleMatch[]> {
  const wanted = normalizeTitle(title);
  if (wanted === "") return [];
  const found = new Map<Id<"mangas">, Doc<"mangas">>();
  const add = (mangas: Doc<"mangas">[]) => mangas.forEach((m) => found.set(m._id, m));
  add(await ctx.db.query("mangas").withIndex("by_normalizedTitle", (q) => q.eq("normalizedTitle", wanted)).take(20));
  add(await ctx.db.query("mangas").withSearchIndex("search_title", (q) => q.search("normalizedTitle", wanted)).take(20));
  const alts = [
    ...(await ctx.db.query("mangaAltTitles").withIndex("by_normalizedTitle", (q) => q.eq("normalizedTitle", wanted)).take(20)),
    ...(await ctx.db.query("mangaAltTitles").withSearchIndex("search_title", (q) => q.search("normalizedTitle", wanted)).take(20)),
  ];
  for (const alt of alts) {
    if (found.has(alt.mangaId)) continue;
    const manga = await ctx.db.get(alt.mangaId);
    if (manga !== null) found.set(manga._id, manga);
  }

  const matches: TitleMatch[] = [];
  for (const manga of found.values()) {
    if (exclude.includes(manga._id)) continue;
    const match = compareTitle(title, manga);
    if (match !== null) matches.push({ manga, match });
  }
  return matches.sort((a, b) => (a.match === b.match ? 0 : a.match === "exact" ? -1 : 1));
}

/** A manga in your library (not the trash) with exactly this title. */
async function libraryTitleMatch(
  ctx: QueryCtx,
  userId: Id<"users">,
  title: string,
  exclude: Id<"mangas">[],
): Promise<{ manga: Doc<"mangas">; entry: Doc<"userMangas"> } | null> {
  for (const { manga, match } of await titleMatches(ctx, title, exclude)) {
    if (match !== "exact") continue;
    const entry = await libraryEntry(ctx, userId, manga._id);
    if (entry !== null && !entry.isDeleted) return { manga, entry };
  }
  return null;
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

/* ── writing to the shared list ───────────────────────────────── */

async function createManga(ctx: MutationCtx, page: PageInfo): Promise<Doc<"mangas">> {
  const mangaId = await ctx.db.insert("mangas", {
    title: page.title.trim(),
    normalizedTitle: normalizeTitle(page.title),
    altTitles: [],
    image: page.image ?? "",
    type: "other",
    authors: [],
    tags: [],
  });
  // Fill in the cover, other titles and latest chapter from MangaDex.
  await ctx.scheduler.runAfter(0, internal.mangadex.lookup, { mangaId });
  return (await ctx.db.get(mangaId))!;
}

/**
 * Links this page's address to the manga for everyone, if no manga has
 * it yet. Then, if the address is this manga's, notes the newest chapter,
 * the series status and the cover the page shows.
 */
async function noteSource(
  ctx: MutationCtx,
  site: Doc<"sites">,
  page: PageInfo,
  manga: Doc<"mangas">,
  source: Doc<"mangaSources"> | null,
): Promise<void> {
  let mine = source !== null && source.mangaId === manga._id ? source : null;
  if (source === null) {
    const sourceId = await ctx.db.insert("mangaSources", {
      mangaId: manga._id,
      siteId: site._id,
      slug: page.slug,
      url: page.seriesUrl ?? page.url,
    });
    mine = (await ctx.db.get(sourceId))!;
  }
  if (mine === null) return;

  // The newest chapter this page proves exists: the one it lists as
  // latest, or the one you're reading, whichever is higher.
  const seen = Math.max(page.latestChapter ?? -Infinity, page.chapter?.number ?? -Infinity);
  if (Number.isFinite(seen) && (mine.latestChapter === undefined || seen > mine.latestChapter)) {
    await ctx.db.patch(mine._id, { latestChapter: seen, lastCheckedAt: Date.now() });
    await refreshMangaLatest(ctx, manga._id);
  }

  const fresh = (await ctx.db.get(manga._id))!;
  const patch: Partial<Doc<"mangas">> = {};
  if (page.status !== undefined && (page.status !== fresh.status || fresh.statusSource === "mangadex")) {
    patch.status = page.status;
    patch.statusSource = "site";
  }
  if (fresh.image === "" && page.image) patch.image = page.image;
  if (Object.keys(patch).length > 0) await ctx.db.patch(manga._id, patch);
}

/** Records that you added this manga from this address. */
async function linkAdded(
  ctx: MutationCtx,
  userId: Id<"users">,
  site: Doc<"sites">,
  page: PageInfo,
  mangaId: Id<"mangas">,
  link: Doc<"userSourceLinks"> | null,
): Promise<void> {
  if (link === null) {
    await ctx.db.insert("userSourceLinks", {
      userId,
      siteId: site._id,
      key: linkKey(page),
      mangaId,
      rejectedMangaIds: [],
      how: "added",
      linkedAt: Date.now(),
    });
  } else {
    await ctx.db.patch(link._id, { mangaId, how: "added", before: undefined });
  }
}

/* ── the Kollect button ───────────────────────────────────────── */

/**
 * What the Kollect button needs to know about the page you're on:
 * whether the site is one you can track on, whether this manga is in
 * your library (and on which page), and your reading settings. `page`
 * is left out on pages that aren't a manga, where only the settings
 * matter. Null when you're signed out.
 */
export const pageState = query({
  args: { page: v.optional(pageInfo) },
  handler: async (ctx, { page }) => {
    const user = await getCurrentUser(ctx);
    if (user === null) return null;
    const settings = await requireSettings(ctx, user._id);

    const site = page === undefined ? null : await siteForDomain(ctx, page.domain, user._id);
    let entry: Doc<"userMangas"> | null = null;
    if (site !== null && page !== undefined) {
      const resolved = await resolveAddress(ctx, user._id, site, page);
      if (resolved.manga !== null) {
        entry = await libraryEntry(ctx, user._id, resolved.manga._id);
      } else {
        const exclude = resolved.link?.rejectedMangaIds ?? [];
        entry = (await libraryTitleMatch(ctx, user._id, page.title, exclude))?.entry ?? null;
      }
    }
    const live = entry !== null && !entry.isDeleted ? entry : null;
    const favourite = await favouriteTag(ctx, user._id);

    return {
      supported: site !== null,
      // Only live entries count; one in the trash reads as "not added".
      inLibrary: live !== null,
      progressKey: live?.progressKey ?? null,
      isFavourite: live !== null && live.tagIds.includes(favourite._id),
      currentChapter: live?.currentChapterNumber ?? null,
      // How far you got, when this page is your current chapter on this
      // website and you stopped partway (not at the top, not finished).
      // The page offers to jump back there.
      resumeAt:
        live !== null &&
        site !== null &&
        page?.chapter !== undefined &&
        live.currentChapterNumber === page.chapter.number &&
        live.currentSiteId === site._id &&
        (live.currentPercentage ?? 0) > 0 &&
        (live.currentPercentage ?? 0) < 100
          ? live.currentPercentage!
          : null,
      settings: {
        scrollThreshold: settings.scrollThreshold,
        showProgressBar: settings.hasPercentageBar,
        showButton: settings.hasScreenOverlayOptions,
        theme: settings.theme,
      },
    };
  },
});

/** One choice in "Is it one of these?". */
async function describeCandidate(ctx: QueryCtx, userId: Id<"users">, manga: Doc<"mangas">) {
  const sources = await ctx.db
    .query("mangaSources")
    .withIndex("by_manga", (q) => q.eq("mangaId", manga._id))
    .collect();
  const sites: string[] = [];
  for (const source of sources) {
    const site = await ctx.db.get(source.siteId);
    if (site !== null && !sites.includes(site.title)) sites.push(site.title);
  }
  const entry = await libraryEntry(ctx, userId, manga._id);
  return {
    mangaId: manga._id,
    title: manga.title,
    image: manga.image,
    latestChapter: manga.latestChapter ?? null,
    sites,
    // The page it's on in your library, for the "On Reading" badge.
    progressKey: entry !== null && !entry.isDeleted ? entry.progressKey : null,
  };
}

/**
 * Adds the manga on this page to your library. Used by the Kollect
 * button, the right-click menu and the keyboard shortcut.
 *
 * - When the address doesn't settle which manga it is but some titles
 *   are the same or close, nothing is saved: it answers "choose" with
 *   the candidates, and the extension asks "Is it one of these?". It
 *   calls again with `choice`: a manga's id, or "new". Picking one saves
 *   this page's title as another name for it.
 * - `progressKey` picks the page; without it, it goes on Reading.
 *   If it's already in your library, this moves it there.
 * - `favourite` also favourites it (adding it to Reading first if
 *   it isn't in your library yet).
 * - Something in the trash is restored first.
 * - `currentChapter` is the chapter you typed in the check box on a page
 *   Kollect can't read. It follows the import rule: the bigger of it and
 *   your current chapter becomes current, and the smaller one goes into
 *   your reading history. `chapter` in the answer says which happened.
 */
export const addFromPage = mutation({
  args: {
    page: pageInfo,
    progressKey: v.optional(progressKey),
    favourite: v.optional(v.boolean()),
    // For a website Kollect doesn't know yet: its name, and the shape of
    // its chapter addresses learned from this page (lib/pageMatch.ts),
    // if it could learn it here; otherwise learnSitePattern fills it in
    // later, from a chapter page. The site is added for this user only.
    newSite: v.optional(
      v.object({
        title: v.string(),
        slugPattern: v.optional(v.string()),
        icon: v.optional(v.string()),
      }),
    ),
    currentChapter: v.optional(v.object({ number: v.number(), label: v.string() })),
    choice: v.optional(v.union(v.literal("new"), v.id("mangas"))),
    // How far down the page you are (0–100) when you press Add on a
    // chapter page. See "starting here" below.
    percentage: v.optional(v.number()),
  },
  handler: async (ctx, { page, progressKey: target, favourite, newSite, currentChapter, choice, percentage }) => {
    const user = await requireUser(ctx);
    let site = await siteForDomain(ctx, page.domain, user._id);
    if (site === null && newSite !== undefined) site = await addSite(ctx, user._id, page, newSite);
    if (site === null) throw new Error("Kollect doesn't know this website yet.");
    if (normalizeTitle(page.title) === "") throw new Error("Couldn't find this manga's title on the page.");

    const resolved = await resolveAddress(ctx, user._id, site, page);
    let manga: Doc<"mangas"> | null = null;
    if (choice === undefined) {
      manga = resolved.manga;
      if (manga === null) {
        const matches = await titleMatches(ctx, page.title, resolved.link?.rejectedMangaIds ?? []);
        if (matches.length > 0) {
          const candidates = [];
          for (const { manga: m } of matches) candidates.push(await describeCandidate(ctx, user._id, m));
          return { action: "choose" as const, candidates };
        }
      }
    } else if (choice !== "new") {
      manga = await ctx.db.get(choice);
      if (manga === null) throw new Error("That manga isn't in Kollect any more.");
      await addAltTitle(ctx, manga, page.title);
    }
    if (manga === null) manga = await createManga(ctx, page);

    await noteSource(ctx, site, page, manga, resolved.source);
    await linkAdded(ctx, user._id, site, page, manga._id, resolved.link);

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

    let chapter: Awaited<ReturnType<typeof typedChapter>> | undefined;
    if (currentChapter !== undefined) {
      chapter = await typedChapter(ctx, userMangaId, site, page, currentChapter);
    } else if (page.chapter !== undefined && (await ctx.db.get(userMangaId))!.currentChapterNumber === undefined) {
      // Starting here: adding from a chapter page when you have no place
      // in the series yet (new, not started, or back from the trash with
      // no chapter) makes this chapter current straight away, at how far
      // down it you are. A manga you're already reading keeps the Scroll
      // Threshold rule.
      const percent = Math.min(100, Math.max(0, percentage ?? 0));
      chapter = await typedChapter(ctx, userMangaId, site, page, page.chapter, percent);
    }
    return { action, userMangaId, chapter };
  },
});

/** The chapter typed in the check box, by the import rule, or the page's
    chapter when you start a manga by adding it from a chapter page. */
async function typedChapter(
  ctx: MutationCtx,
  userMangaId: Id<"userMangas">,
  site: Doc<"sites">,
  page: PageInfo,
  typed: { number: number; label: string },
  percentage = 0,
): Promise<{ result: "current" | "history" | "same"; number: number }> {
  const entry = (await ctx.db.get(userMangaId))!;
  const current = entry.currentChapterNumber;

  if (current !== undefined && typed.number === current) return { result: "same", number: typed.number };

  if (current !== undefined && typed.number < current) {
    await recordHistory(ctx, userMangaId, {
      number: typed.number,
      label: typed.label,
      url: page.url,
      siteId: site._id,
      percentage: 0,
    });
    return { result: "history", number: typed.number };
  }

  // Bigger (or the first): the chapter you had goes into history.
  if (current !== undefined && entry.currentSiteId !== undefined) {
    await recordHistory(ctx, userMangaId, {
      number: current,
      label: entry.currentChapterLabel,
      url: entry.currentChapterUrl,
      siteId: entry.currentSiteId,
      percentage: entry.currentPercentage,
      readAt: entry.lastReadAt,
    });
  }
  const fresh = (await ctx.db.get(userMangaId))!;
  const sites = fresh.readSiteIds ?? [];
  await ctx.db.patch(userMangaId, {
    currentChapterNumber: typed.number,
    currentChapterLabel: typed.label,
    currentChapterUrl: page.url,
    currentSiteId: site._id,
    currentPercentage: percentage,
    readSiteIds: sites.includes(site._id) ? sites : [...sites, site._id],
    lastReadAt: Date.now(),
  });
  return { result: "current", number: typed.number };
}

/* ── tracking ─────────────────────────────────────────────────── */

/**
 * Called while you read a chapter, with how far down it you are
 * (0–100). See the rules at the top of this file.
 *
 * `matched` in the answer means Kollect has just matched this page to a
 * manga in your library by its title, the first time you read it on this
 * website. The page shows a note about it, with "Not this manga?".
 */
export const recordProgress = mutation({
  args: { page: pageInfo, percentage: v.number() },
  handler: async (
    ctx,
    { page, percentage },
  ): Promise<{
    tracked: boolean;
    counted?: boolean;
    matched?: { title: string };
    // Set when this report made the chapter your current one.
    advanced?: { number: number; label: string };
  }> => {
    const user = await requireUser(ctx);
    const settings = await requireSettings(ctx, user._id);
    const site = await siteForDomain(ctx, page.domain, user._id);
    if (site === null || page.chapter === undefined) return { tracked: false };

    // Known manga get their latest chapter updated even when they aren't
    // in your library. Unknown ones aren't created, and a title only
    // counts when it's a manga in your library.
    const resolved = await resolveAddress(ctx, user._id, site, page);
    let found = resolved.manga;
    let entry = found === null ? null : await libraryEntry(ctx, user._id, found._id);
    if (found === null) {
      const exclude = resolved.link?.rejectedMangaIds ?? [];
      const byTitle = await libraryTitleMatch(ctx, user._id, page.title, exclude);
      if (byTitle === null) return { tracked: false };
      found = byTitle.manga;
      entry = byTitle.entry;
    }
    await noteSource(ctx, site, page, found, resolved.source);
    const manga = (await ctx.db.get(found._id))!;
    if (entry === null || entry.isDeleted) return { tracked: false };

    const matched = (await noteFirstRead(ctx, user._id, site, page, resolved.link, manga, entry))
      ? { matched: { title: manga.title } }
      : {};

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
      return { tracked: true, counted: true, ...matched };
    }

    // Any other chapter only counts once you're past the threshold.
    if (percent < settings.scrollThreshold) return { tracked: true, counted: false, ...matched };

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
      return { tracked: true, counted: true, ...matched };
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
    return { tracked: true, counted: true, ...matched, advanced: { number: chapter.number, label: chapter.label } };
  },
});

/**
 * The first time you read a manga on a website, remembers it. Returns
 * true when that's a match you didn't make yourself (you didn't add it
 * from here), so the page tells you. Your progress just before is kept,
 * so "Not this manga?" can put it back.
 */
async function noteFirstRead(
  ctx: MutationCtx,
  userId: Id<"users">,
  site: Doc<"sites">,
  page: PageInfo,
  link: Doc<"userSourceLinks"> | null,
  manga: Doc<"mangas">,
  entry: Doc<"userMangas">,
): Promise<boolean> {
  if (link !== null && link.mangaId !== null) return false;

  // Read here before these links existed: nothing new to tell you.
  const readHere = (entry.readSiteIds ?? []).includes(site._id) || entry.currentSiteId === site._id;
  const fields = {
    mangaId: manga._id,
    how: readHere ? ("added" as const) : ("matched" as const),
    linkedAt: Date.now(),
    before: readHere
      ? undefined
      : {
          currentChapterNumber: entry.currentChapterNumber,
          currentChapterLabel: entry.currentChapterLabel,
          currentChapterUrl: entry.currentChapterUrl,
          currentSiteId: entry.currentSiteId,
          currentPercentage: entry.currentPercentage,
          lastReadAt: entry.lastReadAt,
        },
  };
  if (link === null) {
    await ctx.db.insert("userSourceLinks", {
      userId,
      siteId: site._id,
      key: linkKey(page),
      rejectedMangaIds: [],
      ...fields,
    });
  } else {
    // You said "Not this manga?" here before; this is a different one.
    await ctx.db.patch(link._id, fields);
  }
  return !readHere;
}

/**
 * "Not this manga?" on the note after a title match. For you only: it
 * stops tracking this manga on this website, takes back what it saved
 * here since the match, and won't match it here again. Other people keep
 * the shared link. Returns whether there was a match to undo.
 */
export const rejectMatch = mutation({
  args: { page: pageInfo },
  handler: async (ctx, { page }) => {
    const user = await requireUser(ctx);
    const site = await siteForDomain(ctx, page.domain, user._id);
    if (site === null) return false;
    const link = await userLink(ctx, user._id, site._id, page);
    if (link === null || link.mangaId === null || link.how !== "matched") return false;

    const entry = await libraryEntry(ctx, user._id, link.mangaId);
    if (entry !== null && link.before !== undefined) await undoSince(ctx, entry, site._id, link.linkedAt, link.before);
    await ctx.db.patch(link._id, {
      mangaId: null,
      rejectedMangaIds: [...link.rejectedMangaIds, link.mangaId],
      before: undefined,
    });
    return true;
  },
});

/** Takes back the reading saved on a website since a title match. */
async function undoSince(
  ctx: MutationCtx,
  entry: Doc<"userMangas">,
  siteId: Id<"sites">,
  since: number,
  before: NonNullable<Doc<"userSourceLinks">["before"]>,
): Promise<void> {
  const rows = await ctx.db
    .query("readChapters")
    .withIndex("by_userManga_number", (q) => q.eq("userMangaId", entry._id))
    .collect();
  let keptHere = false;
  for (const row of rows) {
    const readHere = row.siteId === siteId && row.readAt >= since;
    // The chapter you were on before, moved into history when you read on.
    const movedBefore =
      before.currentSiteId !== undefined &&
      row.number === before.currentChapterNumber &&
      row.siteId === before.currentSiteId &&
      row.readAt === before.lastReadAt;
    if (readHere || movedBefore) await ctx.db.delete(row._id);
    else if (row.siteId === siteId) keptHere = true;
  }

  if (entry.currentSiteId === siteId) {
    await ctx.db.patch(entry._id, {
      currentChapterNumber: before.currentChapterNumber,
      currentChapterLabel: before.currentChapterLabel,
      currentChapterUrl: before.currentChapterUrl,
      currentSiteId: before.currentSiteId,
      currentPercentage: before.currentPercentage,
      lastReadAt: before.lastReadAt,
    });
  }
  const fresh = (await ctx.db.get(entry._id))!;
  if (!keptHere && fresh.currentSiteId !== siteId) {
    await ctx.db.patch(entry._id, { readSiteIds: (fresh.readSiteIds ?? []).filter((id) => id !== siteId) });
  }
}

/* ── websites you add ─────────────────────────────────────────── */

/** Adds a website the user found themselves; only they will see it. */
async function addSite(
  ctx: MutationCtx,
  userId: Id<"users">,
  page: PageInfo,
  newSite: { title: string; slugPattern?: string; icon?: string },
): Promise<Doc<"sites">> {
  const title = newSite.title.trim();
  if (title === "") throw new Error("Give the website a name.");
  if (newSite.slugPattern !== undefined) checkPattern(newSite.slugPattern);
  const domain = page.domain.toLowerCase();
  const origin = new URL(page.url).origin;
  const siteId = await ctx.db.insert("sites", {
    domain,
    title,
    link: origin,
    icon: newSite.icon ?? `${origin}/favicon.ico`,
    slugPattern: newSite.slugPattern,
    chapterInUrl: true,
    caseSensitive: false,
    configVersion: 1,
    addedBy: userId,
  });
  return (await ctx.db.get(siteId))!;
}

function checkPattern(pattern: string) {
  if (!pattern.includes(":slug") || !pattern.includes(":chapter")) {
    throw new Error("Kollect couldn't work out this website's chapter addresses.");
  }
}

/**
 * Teaches Kollect the chapter addresses of a website you added from a
 * page where it couldn't learn them (a series page, say). Called from
 * the first chapter page you open there. Only fills in a missing
 * pattern on one of your own websites; returns whether it did.
 */
export const learnSitePattern = mutation({
  args: { domain: v.string(), slugPattern: v.string() },
  handler: async (ctx, { domain, slugPattern }) => {
    const user = await requireUser(ctx);
    const site = await siteForDomain(ctx, domain, user._id);
    if (site === null || site.addedBy !== user._id || site.slugPattern !== undefined) return false;
    checkPattern(slugPattern);
    await ctx.db.patch(site._id, { slugPattern, configVersion: site.configVersion + 1 });
    return true;
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
