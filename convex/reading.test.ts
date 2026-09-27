/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
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

  test("a manga found by title picks up the site's new address for it", async () => {
    const { t, me, chapterPage } = await setup();
    await me.mutation(api.reading.addFromPage, { page: chapterPage(5) });
    await me.query(api.reading.pageState, { page: chapterPage(6, { slug: "solo-leveling-9f3a" }) });
    await me.mutation(api.reading.recordProgress, {
      page: chapterPage(6, { slug: "solo-leveling-9f3a" }),
      percentage: 10,
    });
    const sources = await t.run(async (ctx) => await ctx.db.query("mangaSources").collect());
    expect(sources.map((s) => s.slug)).toEqual(["solo-leveling-9f3a"]);
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
