/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const SITE = "asuracomic.net";

async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.sites.seed, {});
  const me = t.withIdentity({ tokenIdentifier: "test|me", name: "Me" });
  await me.mutation(api.users.createUser, {});

  /** A chapter page of Solo Leveling on the test site. */
  const chapterPage = (number: number, extra: Record<string, unknown> = {}) => ({
    domain: SITE,
    url: `https://${SITE}/series/solo-leveling/chapter/${number}`,
    slug: "solo-leveling",
    title: "Solo Leveling",
    image: "cover.png",
    seriesUrl: `https://${SITE}/series/solo-leveling`,
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
    expect(sources[0]).toMatchObject({ slug: "solo-leveling", url: `https://${SITE}/series/solo-leveling` });
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

  test("an unsupported site is refused", async () => {
    const { me, chapterPage } = await setup();
    await expect(
      me.mutation(api.reading.addFromPage, { page: chapterPage(5, { domain: "example.com" }) }),
    ).rejects.toThrow(/doesn't support/);
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

describe("page state", () => {
  test("signed out gives null", async () => {
    const { t, chapterPage } = await setup();
    expect(await t.query(api.reading.pageState, { page: chapterPage(1) })).toBeNull();
  });

  test("reports your reading settings", async () => {
    const { me, state } = await setup();
    await me.mutation(api.settings.updateSettings, { hasPercentageBar: true, scrollThreshold: 17 });
    expect((await state()).settings).toMatchObject({ scrollThreshold: 17, showProgressBar: true, showButton: false });
  });
});
