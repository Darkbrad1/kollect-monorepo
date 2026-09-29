/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const SITE = "asurascans.com";

async function setup() {
  const t = convexTest(schema, modules);
  const me = t.withIdentity({ tokenIdentifier: "test|me", name: "Me" });
  await me.mutation(api.users.createUser, {});

  /** A chapter page of Solo Leveling on the test site. */
  const chapterPage = (number: number, extra: Record<string, unknown> = {}) => ({
    domain: SITE,
    url: `https://${SITE}/comics/solo-leveling/chapter/${number}`,
    slug: "solo-leveling",
    title: "Solo Leveling",
    image: "cover.png",
    seriesUrl: `https://${SITE}/comics/solo-leveling`,
    chapter: { number, label: `Chapter ${number}` },
    ...extra,
  });

  const entry = async () =>
    await t.run(async (ctx) => {
      const rows = await ctx.db.query("userMangas").collect();
      return rows[0] ?? null;
    });

  const history = async () =>
    await t.run(async (ctx) =>
      (await ctx.db.query("readChapters").collect()).map((r) => r.number).sort((a, b) => a - b),
    );

  const state = async (number = 1) => (await me.query(api.reading.pageState, { page: chapterPage(number) }))!;

  return { t, me, chapterPage, entry, history, state };
}

describe("adding from a reading page", () => {
  test("adds a new manga to Reading, creating it in the shared list", async () => {
    const { t, me, chapterPage, state } = await setup();
    expect((await state()).inLibrary).toBe(false);

    const { action } = await me.mutation(api.reading.addFromPage, { page: chapterPage(5) });
    expect(action).toBe("created");

    const after = await state();
    expect(after).toMatchObject({ supported: true, inLibrary: true, progressKey: "reading", isFavourite: false });

    const sources = await t.run(async (ctx) => await ctx.db.query("mangaSources").collect());
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({ slug: "solo-leveling", url: `https://${SITE}/comics/solo-leveling` });
  });

  test("picking a page moves a manga that's already added", async () => {
    const { me, chapterPage, state } = await setup();
    await me.mutation(api.reading.addFromPage, { page: chapterPage(5) });
    await me.mutation(api.reading.addFromPage, { page: chapterPage(5), progressKey: "paused" });
    expect((await state()).progressKey).toBe("paused");
  });

  test("Favourite on a manga that isn't added adds it to Reading and favourites it", async () => {
    const { me, chapterPage, state } = await setup();
    await me.mutation(api.reading.addFromPage, { page: chapterPage(5), favourite: true });
    expect(await state()).toMatchObject({ inLibrary: true, progressKey: "reading", isFavourite: true });
  });

  test("a manga in the trash is restored to the page it was on", async () => {
    const { me, chapterPage, entry, state } = await setup();
    await me.mutation(api.reading.addFromPage, { page: chapterPage(5), progressKey: "planned" });
    await me.mutation(api.trash.softDelete, { userMangaId: (await entry())!._id });
    expect((await state()).inLibrary).toBe(false);

    await me.mutation(api.reading.addFromPage, { page: chapterPage(5) });
    expect(await state()).toMatchObject({ inLibrary: true, progressKey: "planned" });
  });

  test("an unknown site is refused unless it's being added", async () => {
    const { me, chapterPage } = await setup();
    await expect(
      me.mutation(api.reading.addFromPage, { page: chapterPage(5, { domain: "example.com" }) }),
    ).rejects.toThrow(/doesn't know this website/);
  });

  test("reading it at a new address on the same site links that address too", async () => {
    const { t, me, chapterPage } = await setup();
    await me.mutation(api.reading.addFromPage, { page: chapterPage(5) });
    const result = await me.mutation(api.reading.recordProgress, {
      page: chapterPage(6, { slug: "solo-leveling-9f3a" }),
      percentage: 10,
    });
    expect(result).toMatchObject({ tracked: true, matched: { title: "Solo Leveling" } });
    const sources = await t.run(async (ctx) => await ctx.db.query("mangaSources").collect());
    expect(sources.map((s) => s.slug).sort()).toEqual(["solo-leveling", "solo-leveling-9f3a"]);
  });
});

describe("tracking", () => {
  test("manga you haven't added aren't tracked or created", async () => {
    const { t, me, chapterPage, entry } = await setup();
    const result = await me.mutation(api.reading.recordProgress, { page: chapterPage(5), percentage: 100 });
    expect(result).toEqual({ tracked: false });
    expect(await entry()).toBeNull();
    expect(await t.run(async (ctx) => await ctx.db.query("mangas").collect())).toHaveLength(0);
  });

  test("a chapter becomes current only past the scroll threshold", async () => {
    const { me, chapterPage, entry } = await setup();
    await me.mutation(api.reading.addFromPage, { page: chapterPage(5) });

    await me.mutation(api.reading.recordProgress, { page: chapterPage(5), percentage: 79 });
    expect((await entry())!.currentChapterNumber).toBeUndefined();

    await me.mutation(api.reading.recordProgress, { page: chapterPage(5), percentage: 80 });
    expect(await entry()).toMatchObject({ currentChapterNumber: 5, currentChapterLabel: "Chapter 5", currentPercentage: 80 });
  });

  test("the threshold follows your setting", async () => {
    const { me, chapterPage, entry } = await setup();
    await me.mutation(api.settings.updateSettings, { scrollThreshold: 16 });
    await me.mutation(api.reading.addFromPage, { page: chapterPage(5) });
    await me.mutation(api.reading.recordProgress, { page: chapterPage(5), percentage: 17 });
    expect((await entry())!.currentChapterNumber).toBe(5);
  });

  test("moving forward saves the chapter you left to history", async () => {
    const { me, chapterPage, entry, history } = await setup();
    await me.mutation(api.reading.addFromPage, { page: chapterPage(5) });
    await me.mutation(api.reading.recordProgress, { page: chapterPage(5), percentage: 100 });
    await me.mutation(api.reading.recordProgress, { page: chapterPage(6), percentage: 90 });

    expect((await entry())!.currentChapterNumber).toBe(6);
    expect(await history()).toEqual([5]);
  });

  test("re-reading an earlier chapter keeps your furthest chapter", async () => {
    const { me, chapterPage, entry, history } = await setup();
    await me.mutation(api.reading.addFromPage, { page: chapterPage(40) });
    await me.mutation(api.reading.recordProgress, { page: chapterPage(40), percentage: 100 });
    await me.mutation(api.reading.recordProgress, { page: chapterPage(10), percentage: 100 });

    expect((await entry())!.currentChapterNumber).toBe(40);
    expect(await history()).toEqual([10]);
  });

  test("progress on the current chapter updates, but scrolling back up doesn't lower it", async () => {
    const { me, chapterPage, entry } = await setup();
    await me.mutation(api.reading.addFromPage, { page: chapterPage(5) });
    await me.mutation(api.reading.recordProgress, { page: chapterPage(5), percentage: 85 });
    await me.mutation(api.reading.recordProgress, { page: chapterPage(5), percentage: 95 });
    await me.mutation(api.reading.recordProgress, { page: chapterPage(5), percentage: 30 });
    expect((await entry())!.currentPercentage).toBe(95);
  });

  test("visiting a page updates the latest chapter, even for manga you haven't added", async () => {
    const { t, me, chapterPage } = await setup();
    await me.mutation(api.reading.addFromPage, { page: chapterPage(5) });

    const other = t.withIdentity({ tokenIdentifier: "test|other", name: "Other" });
    await other.mutation(api.users.createUser, {});
    await other.mutation(api.reading.recordProgress, {
      page: chapterPage(7, { latestChapter: 120 }),
      percentage: 10,
    });

    const manga = await t.run(async (ctx) => (await ctx.db.query("mangas").collect())[0]);
    expect(manga.latestChapter).toBe(120);
  });
});

describe("Auto Complete On Finish", () => {
  async function finish(opts: { setting: boolean; status: "completed" | "ongoing" }) {
    const s = await setup();
    await s.me.mutation(api.settings.updateSettings, { autoCompleteOnFinish: opts.setting });
    await s.me.mutation(api.reading.addFromPage, {
      page: s.chapterPage(99, { latestChapter: 100, status: opts.status }),
    });
    await s.me.mutation(api.reading.recordProgress, {
      page: s.chapterPage(100, { latestChapter: 100, status: opts.status }),
      percentage: 100,
    });
    return (await s.entry())!.progressKey;
  }

  test("finishing the last chapter of an ended series moves it to Completed", async () => {
    expect(await finish({ setting: true, status: "completed" })).toBe("completed");
  });

  test("not while the series is still coming out", async () => {
    expect(await finish({ setting: true, status: "ongoing" })).toBe("reading");
  });

  test("not when the setting is off", async () => {
    expect(await finish({ setting: false, status: "completed" })).toBe("reading");
  });
});

describe("sites you add yourself", () => {
  const flamePage = (number: number) => ({
    domain: "flamecomics.xyz",
    url: `https://flamecomics.xyz/series/omniscient-reader/chapter-${number}`,
    slug: "omniscient-reader",
    title: "Omniscient Reader",
    seriesUrl: "https://flamecomics.xyz/series/omniscient-reader",
    chapter: { number, label: `Chapter ${number}` },
  });
  const newSite = { title: "Flame Comics", slugPattern: "/series/:slug/:chapter" };

  test("adding a manga on a new site adds the site, just for you, and tracking works", async () => {
    const { t, me, entry } = await setup();
    await me.mutation(api.reading.addFromPage, { page: flamePage(200), newSite });

    const mine = await me.query(api.sites.list, {});
    expect(mine.find((s) => s.domain === "flamecomics.xyz")).toMatchObject({
      title: "Flame Comics",
      slugPattern: "/series/:slug/:chapter",
      link: "https://flamecomics.xyz",
    });

    await me.mutation(api.reading.recordProgress, { page: flamePage(201), percentage: 90 });
    expect((await entry())!.currentChapterNumber).toBe(201);

    const other = t.withIdentity({ tokenIdentifier: "test|other", name: "Other" });
    await other.mutation(api.users.createUser, {});
    expect((await other.query(api.sites.list, {})).map((s) => s.domain)).not.toContain("flamecomics.xyz");
    expect((await t.query(api.sites.list, {})).map((s) => s.domain)).not.toContain("flamecomics.xyz");
    await expect(other.mutation(api.reading.addFromPage, { page: flamePage(200) })).rejects.toThrow(
      /doesn't know this website/,
    );
  });

  test("a second manga on the same site reuses it", async () => {
    const { t, me } = await setup();
    await me.mutation(api.reading.addFromPage, { page: flamePage(200), newSite });
    await me.mutation(api.reading.addFromPage, {
      page: { ...flamePage(3), slug: "tower", title: "Tower of God", url: "https://flamecomics.xyz/series/tower/chapter-3" },
      newSite,
    });
    const flame = await t.run(async (ctx) =>
      (await ctx.db.query("sites").collect()).filter((s) => s.domain === "flamecomics.xyz"),
    );
    expect(flame).toHaveLength(1);
  });

  test("a built-in site is used instead of making a private copy", async () => {
    const { t, me, chapterPage } = await setup();
    await me.mutation(api.reading.addFromPage, { page: chapterPage(5), newSite: { title: "My Asura", slugPattern: "/x/:slug/:chapter" } });
    const asura = await t.run(async (ctx) =>
      (await ctx.db.query("sites").collect()).filter((s) => s.domain === SITE),
    );
    expect(asura).toHaveLength(1);
    expect(asura[0].addedBy).toBeUndefined();
  });

  test("a site needs a name and a pattern with the series and chapter in it", async () => {
    const { me } = await setup();
    await expect(
      me.mutation(api.reading.addFromPage, { page: flamePage(1), newSite: { title: " ", slugPattern: newSite.slugPattern } }),
    ).rejects.toThrow(/name/);
    await expect(
      me.mutation(api.reading.addFromPage, { page: flamePage(1), newSite: { title: "Flame", slugPattern: "/series/:slug" } }),
    ).rejects.toThrow(/chapter addresses/);
  });
});

describe("adding on a page Kollect can't read", () => {
  // A series page on a new site: no chapter addresses learned yet.
  const seriesPage = {
    domain: "mangasite.io",
    url: "https://mangasite.io/manga/tower-of-god",
    title: "Tower of God",
  };

  test("adds the manga and the website, and the typed chapter becomes current", async () => {
    const { t, me, entry } = await setup();
    await me.mutation(api.reading.addFromPage, {
      page: seriesPage,
      newSite: { title: "Manga Site" },
      currentChapter: { number: 40, label: "Chapter 40" },
    });
    const site = (await me.query(api.sites.list, {})).find((s) => s.domain === "mangasite.io")!;
    expect(site.slugPattern).toBeUndefined();
    expect(await entry()).toMatchObject({
      currentChapterNumber: 40,
      currentChapterUrl: seriesPage.url,
      currentSiteId: site._id,
    });

    // Without the chapter, it just isn't started.
    await t.run(async (ctx) => {
      for (const row of await ctx.db.query("userMangas").collect()) await ctx.db.delete(row._id);
    });
    await me.mutation(api.reading.addFromPage, { page: { ...seriesPage, title: "Solo Leveling" } });
    expect((await entry())!.currentChapterNumber).toBeUndefined();
  });

  test("a smaller typed chapter goes into your history, and your current one stays", async () => {
    const { me, chapterPage, entry, history } = await setup();
    await me.mutation(api.reading.addFromPage, { page: chapterPage(5) });
    await me.mutation(api.reading.recordProgress, { page: chapterPage(5), percentage: 100 });
    const result = await me.mutation(api.reading.addFromPage, {
      page: { ...chapterPage(5), chapter: undefined },
      currentChapter: { number: 1, label: "Chapter 1" },
    });
    expect(result).toMatchObject({ action: "noop", chapter: { result: "history", number: 1 } });
    expect((await entry())!.currentChapterNumber).toBe(5);
    expect(await history()).toEqual([1]);
  });

  test("a bigger typed chapter becomes current, and the old one goes into your history", async () => {
    const { me, chapterPage, entry, history } = await setup();
    await me.mutation(api.reading.addFromPage, { page: chapterPage(5) });
    await me.mutation(api.reading.recordProgress, { page: chapterPage(5), percentage: 100 });
    const result = await me.mutation(api.reading.addFromPage, {
      page: { ...chapterPage(5), chapter: undefined },
      currentChapter: { number: 55, label: "Chapter 55" },
    });
    expect(result).toMatchObject({ chapter: { result: "current", number: 55 } });
    expect(await entry()).toMatchObject({ currentChapterNumber: 55, currentPercentage: 0 });
    expect(await history()).toEqual([5]);
  });

  test("the first chapter page teaches Kollect the addresses, and tracking starts", async () => {
    const { me, entry } = await setup();
    await me.mutation(api.reading.addFromPage, { page: seriesPage, newSite: { title: "Manga Site" } });

    const learned = await me.mutation(api.reading.learnSitePattern, {
      domain: "mangasite.io",
      slugPattern: "/manga/:slug/chapter-:chapter",
    });
    expect(learned).toBe(true);

    await me.mutation(api.reading.recordProgress, {
      page: {
        domain: "mangasite.io",
        url: "https://mangasite.io/manga/tower-of-god/chapter-3",
        slug: "tower-of-god",
        title: "Tower of God",
        chapter: { number: 3, label: "Chapter 3" },
      },
      percentage: 100,
    });
    expect((await entry())!.currentChapterNumber).toBe(3);
  });

  test("only fills in a missing pattern on your own website", async () => {
    const { t, me } = await setup();
    // Built-in site: not changed.
    expect(await me.mutation(api.reading.learnSitePattern, { domain: SITE, slugPattern: "/x/:slug/:chapter" })).toBe(false);

    await me.mutation(api.reading.addFromPage, { page: seriesPage, newSite: { title: "Manga Site" } });
    const other = t.withIdentity({ tokenIdentifier: "test|other", name: "Other" });
    await other.mutation(api.users.createUser, {});
    // Someone else's site: they can't see it, so nothing happens.
    expect(await other.mutation(api.reading.learnSitePattern, { domain: "mangasite.io", slugPattern: "/a/:slug/:chapter" })).toBe(false);

    // Once learned, it stays.
    expect(await me.mutation(api.reading.learnSitePattern, { domain: "mangasite.io", slugPattern: "/manga/:slug/:chapter" })).toBe(true);
    expect(await me.mutation(api.reading.learnSitePattern, { domain: "mangasite.io", slugPattern: "/other/:slug/:chapter" })).toBe(false);
  });
});

describe("site list", () => {
  test("is set up automatically when the popup opens", async () => {
    const t = convexTest(schema, modules);
    await t.withIdentity({ tokenIdentifier: "test|new", name: "New" }).mutation(api.users.createUser, {});
    const sites = await t.run(async (ctx) => await ctx.db.query("sites").collect());
    expect(sites.map((s) => s.domain)).toContain("asurascans.com");
  });

  test("a site whose rules got a newer version is updated; others are left alone", async () => {
    const { t, me } = await setup();
    await t.run(async (ctx) => {
      const site = (await ctx.db.query("sites").collect()).find((s) => s.domain === SITE)!;
      await ctx.db.patch(site._id, { configVersion: 0, slugPattern: "/old/:slug" });
    });
    await me.mutation(api.users.createUser, {});
    const site = await t.run(async (ctx) => (await ctx.db.query("sites").collect()).find((s) => s.domain === SITE)!);
    expect(site.slugPattern).toBe("/comics/:slug/chapter/:chapter");
  });
});

describe("page state", () => {
  test("signed out gives null", async () => {
    const { t, chapterPage } = await setup();
    expect(await t.query(api.reading.pageState, { page: chapterPage(1) })).toBeNull();
  });

  test("the button and progress bar are on for a new account", async () => {
    const { state } = await setup();
    expect((await state()).settings).toMatchObject({ scrollThreshold: 80, showProgressBar: true, showButton: true });
  });

  test("reports your reading settings", async () => {
    const { me, state } = await setup();
    await me.mutation(api.settings.updateSettings, { hasPercentageBar: false, scrollThreshold: 17 });
    expect((await state()).settings).toMatchObject({ scrollThreshold: 17, showProgressBar: false, showButton: true });
  });
});

describe("Add Manga in the popup", () => {
  test("searches the shared list and says where each one is", async () => {
    const { t, me, chapterPage } = await setup();
    await me.mutation(api.reading.addFromPage, { page: chapterPage(5), progressKey: "paused" });
    await t.run(async (ctx) => {
      await ctx.db.insert("mangas", {
        title: "Solo Max-Level Newbie", normalizedTitle: "solo max level newbie", altTitles: [],
        image: "", type: "manhwa", authors: [], tags: [],
      });
    });

    const results = await me.query(api.catalogue.search, { text: "solo" });
    expect(results.map((r) => [r.manga.title, r.status]).sort()).toEqual([
      ["Solo Leveling", "paused"],
      ["Solo Max-Level Newbie", "new"],
    ]);
    expect(await me.query(api.catalogue.search, { text: "  " })).toEqual([]);

    const newbie = results.find((r) => r.status === "new")!.manga._id;
    await me.mutation(api.library.addManga, { mangaId: newbie, progressKey: "planned" });
    const after = await me.query(api.catalogue.search, { text: "newbie" });
    expect(after[0].status).toBe("planned");
  });
});

/* ── which manga a page is ───────────────────────────────────────── */

/** A second built-in site, so two users can share its addresses. */
async function addReaper(t: ReturnType<typeof convexTest>) {
  await t.run(async (ctx) => {
    await ctx.db.insert("sites", {
      domain: "reaperscans.com",
      title: "Reaper Scans",
      link: "https://reaperscans.com",
      icon: "",
      slugPattern: "/series/:slug/:chapter",
      chapterInUrl: true,
      caseSensitive: false,
      configVersion: 1,
    });
  });
}

const reaperPage = (number: number, slug = "solo-leveling", title = "Solo Leveling") => ({
  domain: "reaperscans.com",
  url: `https://reaperscans.com/series/${slug}/${number}`,
  slug,
  title,
  chapter: { number, label: `Chapter ${number}` },
});

describe("Is it one of these?", () => {
  test("a title already on another website asks first, and saves nothing", async () => {
    const { t, me, chapterPage } = await setup();
    await addReaper(t);
    await me.mutation(api.reading.addFromPage, { page: chapterPage(5) });

    const result = await me.mutation(api.reading.addFromPage, { page: reaperPage(7) });
    expect(result).toMatchObject({
      action: "choose",
      candidates: [{ title: "Solo Leveling", sites: ["Asura Scans"], progressKey: "reading", latestChapter: 5 }],
    });
    const sources = await t.run(async (ctx) => await ctx.db.query("mangaSources").collect());
    expect(sources).toHaveLength(1);
  });

  test("picking one links the website to it, and it stays on its page", async () => {
    const { t, me, chapterPage } = await setup();
    await addReaper(t);
    await me.mutation(api.reading.addFromPage, { page: chapterPage(5), progressKey: "paused" });
    const ask = await me.mutation(api.reading.addFromPage, { page: reaperPage(7) });
    const mangaId = ask.action === "choose" ? ask.candidates[0].mangaId : undefined;

    const result = await me.mutation(api.reading.addFromPage, { page: reaperPage(7), choice: mangaId });
    expect(result.action).toBe("noop");
    expect(await me.query(api.reading.pageState, { page: reaperPage(7) })).toMatchObject({
      inLibrary: true,
      progressKey: "paused",
    });
    const sources = await t.run(async (ctx) => await ctx.db.query("mangaSources").collect());
    expect(sources.map((s) => s.slug)).toEqual(["solo-leveling", "solo-leveling"]);
  });

  test("a close title asks, and picking it saves the title as another name", async () => {
    const { t, me, chapterPage } = await setup();
    await addReaper(t);
    await me.mutation(api.reading.addFromPage, { page: chapterPage(5) });
    const page = reaperPage(7, "solo-leveling-manhwa", "Solo Leveling Manhwa");

    const ask = await me.mutation(api.reading.addFromPage, { page });
    expect(ask.action).toBe("choose");
    const mangaId = ask.action === "choose" ? ask.candidates[0].mangaId : undefined;
    await me.mutation(api.reading.addFromPage, { page, choice: mangaId });

    const manga = await t.run(async (ctx) => (await ctx.db.query("mangas").collect())[0]);
    expect(manga.altTitles).toEqual(["Solo Leveling Manhwa"]);
    // Add Manga finds it by that name too.
    const found = await me.query(api.catalogue.search, { text: "manhwa" });
    expect(found.map((r) => r.manga.title)).toEqual(["Solo Leveling"]);
  });

  test("another name is matched later, on any website", async () => {
    const { t, me, chapterPage } = await setup();
    await addReaper(t);
    await me.mutation(api.reading.addFromPage, { page: chapterPage(5) });
    const renamed = reaperPage(7, "only-i-level-up", "Only I Level Up");
    // Not close at all: a new manga, unless you pick one. Here Kollect
    // can't know, so it adds a new one.
    const first = await me.mutation(api.reading.addFromPage, { page: renamed });
    expect(first.action).toBe("created");

    // Someone ties the two names together by picking.
    await t.run(async (ctx) => {
      const solo = (await ctx.db.query("mangas").collect()).find((m) => m.title === "Solo Leveling")!;
      await ctx.db.patch(solo._id, { altTitles: ["Only I Level Up"] });
      await ctx.db.insert("mangaAltTitles", { mangaId: solo._id, normalizedTitle: "only i level up" });
    });
    const ask = await me.mutation(api.reading.addFromPage, {
      page: { ...chapterPage(1), slug: "only-i-level-up", title: "Only I Level Up" },
    });
    expect(ask.action).toBe("choose");
    const titles = ask.action === "choose" ? ask.candidates.map((c) => c.title).sort() : [];
    expect(titles).toEqual(["Only I Level Up", "Solo Leveling"]);
  });

  test("No, it's new makes a separate manga with the same title", async () => {
    const { t, me, chapterPage } = await setup();
    await addReaper(t);
    await me.mutation(api.reading.addFromPage, { page: chapterPage(5) });
    const result = await me.mutation(api.reading.addFromPage, { page: reaperPage(7), choice: "new" });
    expect(result.action).toBe("created");
    const mangas = await t.run(async (ctx) => await ctx.db.query("mangas").collect());
    expect(mangas.map((m) => m.title)).toEqual(["Solo Leveling", "Solo Leveling"]);
  });

  test("the same title at a different address on the same website asks", async () => {
    const { me, chapterPage } = await setup();
    await me.mutation(api.reading.addFromPage, { page: chapterPage(5) });
    const result = await me.mutation(api.reading.addFromPage, { page: chapterPage(1, { slug: "solo-leveling-2" }) });
    expect(result.action).toBe("choose");
  });

  test("a title nothing like any other is added without asking", async () => {
    const { me, chapterPage } = await setup();
    await me.mutation(api.reading.addFromPage, { page: chapterPage(5) });
    const result = await me.mutation(api.reading.addFromPage, {
      page: chapterPage(1, { slug: "tower-of-god", title: "Tower of God" }),
    });
    expect(result.action).toBe("created");
  });
});

describe("private manga", () => {
  const flame = {
    domain: "flamecomics.xyz",
    url: "https://flamecomics.xyz/series/omniscient-reader/3",
    slug: "omniscient-reader",
    title: "Omniscient Reader",
    chapter: { number: 3, label: "Chapter 3" },
  };

  test("are left out of other people's Add Manga search until they're on a built-in website", async () => {
    const { t, me, chapterPage } = await setup();
    await me.mutation(api.reading.addFromPage, {
      page: flame,
      newSite: { title: "Flame", slugPattern: "/series/:slug/:chapter" },
    });
    const other = t.withIdentity({ tokenIdentifier: "test|other", name: "Other" });
    await other.mutation(api.users.createUser, {});

    expect((await me.query(api.catalogue.search, { text: "omniscient" })).map((r) => r.status)).toEqual(["reading"]);
    expect(await other.query(api.catalogue.search, { text: "omniscient" })).toEqual([]);

    // Someone adds it from a built-in website and picks the same manga.
    const page = chapterPage(3, { slug: "omniscient-reader", title: "Omniscient Reader" });
    const ask = await other.mutation(api.reading.addFromPage, { page });
    const mangaId = ask.action === "choose" ? ask.candidates[0].mangaId : undefined;
    await other.mutation(api.reading.addFromPage, { page, choice: mangaId });

    const third = t.withIdentity({ tokenIdentifier: "test|third", name: "Third" });
    await third.mutation(api.users.createUser, {});
    expect((await third.query(api.catalogue.search, { text: "omniscient" })).map((r) => r.manga.title)).toEqual([
      "Omniscient Reader",
    ]);
  });
});

describe("matching while you read", () => {
  async function readingOnTwoSites() {
    const s = await setup();
    await addReaper(s.t);
    await s.me.mutation(api.reading.addFromPage, { page: s.chapterPage(5) });
    await s.me.mutation(api.reading.recordProgress, { page: s.chapterPage(5), percentage: 100 });
    return s;
  }

  test("an exact title in your library is tracked on another website, with a note the first time", async () => {
    const { me, entry } = await readingOnTwoSites();
    const first = await me.mutation(api.reading.recordProgress, { page: reaperPage(12), percentage: 100 });
    expect(first).toEqual({ tracked: true, counted: true, matched: { title: "Solo Leveling" } });
    expect((await entry())!.currentChapterNumber).toBe(12);

    const next = await me.mutation(api.reading.recordProgress, { page: reaperPage(13), percentage: 100 });
    expect(next).toEqual({ tracked: true, counted: true });
  });

  test("no note on the website you added it from", async () => {
    const { me, chapterPage } = await readingOnTwoSites();
    const result = await me.mutation(api.reading.recordProgress, { page: chapterPage(6), percentage: 100 });
    expect(result).toEqual({ tracked: true, counted: true });
  });

  test("each person gets the note the first time, even if someone else made the link", async () => {
    const { t, me } = await readingOnTwoSites();
    await me.mutation(api.reading.recordProgress, { page: reaperPage(12), percentage: 100 });

    const other = t.withIdentity({ tokenIdentifier: "test|other", name: "Other" });
    await other.mutation(api.users.createUser, {});
    const manga = await t.run(async (ctx) => (await ctx.db.query("mangas").collect())[0]);
    await other.mutation(api.library.addManga, { mangaId: manga._id, progressKey: "reading" });

    const result = await other.mutation(api.reading.recordProgress, { page: reaperPage(3), percentage: 100 });
    expect(result).toMatchObject({ tracked: true, matched: { title: "Solo Leveling" } });
  });

  test("Not this manga? takes back what was saved, for you only", async () => {
    const { t, me, entry, history } = await readingOnTwoSites();
    await me.mutation(api.reading.recordProgress, { page: reaperPage(12), percentage: 100 });
    await me.mutation(api.reading.recordProgress, { page: reaperPage(13), percentage: 100 });
    expect(await history()).toEqual([5, 12]);

    expect(await me.mutation(api.reading.rejectMatch, { page: reaperPage(13) })).toBe(true);
    const after = (await entry())!;
    expect(after).toMatchObject({ currentChapterNumber: 5, currentPercentage: 100 });
    expect(await history()).toEqual([]);
    const reaper = await t.run(async (ctx) => (await ctx.db.query("sites").collect()).find((s) => s.domain === "reaperscans.com")!);
    expect(after.readSiteIds).not.toContain(reaper._id);

    // Not tracked there any more, for you.
    expect(await me.mutation(api.reading.recordProgress, { page: reaperPage(14), percentage: 100 })).toEqual({
      tracked: false,
    });
    expect((await me.query(api.reading.pageState, { page: reaperPage(14) }))!.inLibrary).toBe(false);

    // Everyone else keeps the link.
    const other = t.withIdentity({ tokenIdentifier: "test|other", name: "Other" });
    await other.mutation(api.users.createUser, {});
    const manga = await t.run(async (ctx) => (await ctx.db.query("mangas").collect())[0]);
    await other.mutation(api.library.addManga, { mangaId: manga._id, progressKey: "reading" });
    expect(await other.mutation(api.reading.recordProgress, { page: reaperPage(3), percentage: 100 })).toMatchObject({
      tracked: true,
    });
  });

  test("after Not this manga?, Add leaves that manga out, and your pick is only yours", async () => {
    const { t, me } = await readingOnTwoSites();
    await me.mutation(api.reading.recordProgress, { page: reaperPage(12), percentage: 100 });
    await me.mutation(api.reading.rejectMatch, { page: reaperPage(12) });

    const result = await me.mutation(api.reading.addFromPage, { page: reaperPage(12) });
    expect(result.action).toBe("created");
    expect(await me.mutation(api.reading.recordProgress, { page: reaperPage(13), percentage: 100 })).toEqual({
      tracked: true,
      counted: true,
    });
    const [original, mine] = await t.run(async (ctx) => await ctx.db.query("userMangas").collect());
    expect(original.currentChapterNumber).toBe(5);
    expect(mine.currentChapterNumber).toBe(13);

    // The shared link still points at the original.
    const sources = await t.run(async (ctx) => await ctx.db.query("mangaSources").collect());
    expect(sources.filter((s) => s.slug === "solo-leveling")).toHaveLength(2);
    expect(new Set(sources.map((s) => s.mangaId)).size).toBe(1);
  });

  test("a title that's only close isn't tracked without asking", async () => {
    const { me } = await readingOnTwoSites();
    const result = await me.mutation(api.reading.recordProgress, {
      page: reaperPage(12, "solo-leveling-manhwa", "Solo Leveling Manhwa"),
      percentage: 100,
    });
    expect(result).toEqual({ tracked: false });
  });
});

describe("clicking a card", () => {
  const link = async (me: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>, t: ReturnType<typeof convexTest>) => {
    const row = await t.run(async (ctx) => (await ctx.db.query("userMangas").collect())[0]);
    return await me.query(api.library.cardLink, { userMangaId: row._id });
  };

  test("opens the chapter you're on", async () => {
    const { t, me, chapterPage } = await setup();
    await me.mutation(api.reading.addFromPage, { page: chapterPage(5) });
    await me.mutation(api.reading.recordProgress, { page: chapterPage(5), percentage: 100 });
    expect(await link(me, t)).toBe(`https://${SITE}/comics/solo-leveling/chapter/5`);
  });

  test("without one, opens the series page on the website you added it from", async () => {
    const { t, me, chapterPage } = await setup();
    await addReaper(t);
    await me.mutation(api.reading.addFromPage, { page: chapterPage(5) });
    // Also on another website, which you didn't add it from.
    const manga = await t.run(async (ctx) => (await ctx.db.query("mangas").collect())[0]);
    const reaper = await t.run(async (ctx) => (await ctx.db.query("sites").collect()).find((s) => s.domain === "reaperscans.com")!);
    await t.run(async (ctx) => {
      await ctx.db.insert("mangaSources", { mangaId: manga._id, siteId: reaper._id, slug: "x", url: "https://reaperscans.com/series/x" });
    });
    expect(await link(me, t)).toBe(`https://${SITE}/comics/solo-leveling`);
  });

  test("otherwise a built-in website it's on, and in the trash too", async () => {
    const { t, me, chapterPage } = await setup();
    await me.mutation(api.reading.addFromPage, { page: chapterPage(5) });
    await t.run(async (ctx) => {
      for (const row of await ctx.db.query("userSourceLinks").collect()) await ctx.db.delete(row._id);
    });
    const row = await t.run(async (ctx) => (await ctx.db.query("userMangas").collect())[0]);
    await me.mutation(api.trash.softDelete, { userMangaId: row._id });
    expect(await link(me, t)).toBe(`https://${SITE}/comics/solo-leveling`);
  });

  test("null when Kollect has no link", async () => {
    const { t, me } = await setup();
    await t.run(async (ctx) => {
      const mangaId = await ctx.db.insert("mangas", {
        title: "Imported", normalizedTitle: "imported", altTitles: [], image: "", type: "other", authors: [], tags: [],
      });
      const user = (await ctx.db.query("users").collect())[0];
      await ctx.db.insert("userMangas", {
        userId: user._id, mangaId, addedAt: 0, progressKey: "reading", tagIds: [], isDeleted: false,
      });
    });
    expect(await link(me, t)).toBeNull();
  });
});

describe("details from MangaDex", () => {
  test("replace the cover, add titles, and count its latest chapter and status", async () => {
    const { t, me, chapterPage } = await setup();
    await me.mutation(api.reading.addFromPage, { page: chapterPage(5, { latestChapter: 150 }) });
    const manga = await t.run(async (ctx) => (await ctx.db.query("mangas").collect())[0]);

    await t.mutation(internal.mangadex.apply, {
      mangaId: manga._id,
      mangadexId: "32d76d19",
      altTitles: ["Solo Leveling", "Only I Level Up"],
      cover: "https://uploads.mangadex.org/covers/32d76d19/cover.jpg.512.jpg",
      status: "completed",
      latestChapter: 200,
    });
    const after = await t.run(async (ctx) => (await ctx.db.get(manga._id))!);
    expect(after).toMatchObject({
      image: "https://uploads.mangadex.org/covers/32d76d19/cover.jpg.512.jpg",
      altTitles: ["Only I Level Up"],
      status: "completed",
      statusSource: "mangadex",
      latestChapter: 200,
      mangadexId: "32d76d19",
    });

    // A reading website's status wins over MangaDex's.
    await me.mutation(api.reading.recordProgress, { page: chapterPage(6, { status: "ongoing" }), percentage: 10 });
    expect(await t.run(async (ctx) => (await ctx.db.get(manga._id))!.status)).toBe("ongoing");
  });

  test("a lower MangaDex latest chapter doesn't pull the figure down", async () => {
    const { t, me, chapterPage } = await setup();
    await me.mutation(api.reading.addFromPage, { page: chapterPage(5, { latestChapter: 150 }) });
    const manga = await t.run(async (ctx) => (await ctx.db.query("mangas").collect())[0]);
    await t.mutation(internal.mangadex.apply, { mangaId: manga._id, mangadexId: "x", altTitles: [], latestChapter: 20 });
    expect(await t.run(async (ctx) => (await ctx.db.get(manga._id))!.latestChapter)).toBe(150);
  });
});
