/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import type { FunctionReturnType } from "convex/server";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { matchesFilter, toFilterable } from "./lib/filters";
import schema from "./schema";

// Test files are never deployed: the Convex bundler skips any file
// whose name contains more than one dot.
const modules = import.meta.glob("./**/*.ts");

const DAY = 24 * 60 * 60 * 1000;

async function setup() {
  const t = convexTest(schema, modules);
  const alice = t.withIdentity({ tokenIdentifier: "test|alice", name: "Alice" });
  const bob = t.withIdentity({ tokenIdentifier: "test|bob", name: "Bob" });
  await alice.mutation(api.users.createUser, {});
  await bob.mutation(api.users.createUser, {});

  const { siteId, mangaIds } = await t.run(async (ctx) => {
    const siteId = await ctx.db.insert("sites", {
      domain: "asurascans.com",
      icon: "asura.png",
      title: "Asurascans",
      link: "https://asurascans.com",
      chapterInUrl: true,
      caseSensitive: false,
      configVersion: 1,
    });
    const mangaIds: Id<"mangas">[] = [];
    for (const title of ["Solo Leveling", "Omniscient Reader", "Tower of God"]) {
      mangaIds.push(
        await ctx.db.insert("mangas", {
          title,
          normalizedTitle: title.toLowerCase(),
          altTitles: [],
          image: "cover.png",
          type: "manhwa",
          authors: [],
          tags: [],
        }),
      );
    }
    return { siteId, mangaIds };
  });

  return { t, alice, bob, siteId, mangaIds };
}

type Ctx = Awaited<ReturnType<typeof setup>>;

/** Adds a manga to a user's library at a chapter, on a progress page. */
async function libraryWith(
  { t }: Ctx,
  as: Ctx["alice"],
  mangaId: Id<"mangas">,
  opts: { chapter?: number; siteId?: Id<"sites">; page?: "reading" | "planned" | "paused" | "completed"; lastReadAt?: number },
): Promise<Id<"userMangas">> {
  const { userMangaId } = await as.mutation(api.library.addManga, { mangaId });
  if (opts.page) {
    await as.mutation(api.library.moveToProgressPage, { userMangaId, systemKey: opts.page });
  }
  if (opts.chapter !== undefined) {
    await t.run((ctx) =>
      ctx.db.patch(userMangaId, {
        currentChapterNumber: opts.chapter,
        currentChapterLabel: `Ch. ${opts.chapter}`,
        currentChapterUrl: `https://asurascans.com/ch/${opts.chapter}`,
        currentSiteId: opts.siteId,
        lastReadAt: opts.lastReadAt ?? 1000,
      }),
    );
  }
  return userMangaId;
}

type ImportOption = "titles" | "titlesAndPages" | "all";

/** Runs the import steps in the order the extension will. */
async function importFile(
  as: Ctx["alice"],
  file: FunctionReturnType<typeof api.transfer.exportLibrary>,
  option: ImportOption,
) {
  const f = file;
  if (option !== "titles") {
    await as.mutation(api.transfer.importPages, { kollect: f.kollect, pages: f.pages });
  }
  const report = await as.mutation(api.transfer.importMangas, {
    kollect: f.kollect,
    mode: option === "titles" ? "titles" : "titlesAndPages",
    mangas: f.mangas,
  });
  if (option === "all") {
    await as.mutation(api.transfer.importSettings, { kollect: f.kollect, settings: f.settings });
  }
  return report;
}

/** A user's state for one manga: current chapter, pages, history. */
async function stateOf({ t }: Ctx, token: string, mangaId: Id<"mangas">) {
  return await t.run(async (ctx) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    const row = await ctx.db
      .query("userMangas")
      .withIndex("by_user_manga", (q) => q.eq("userId", user!._id).eq("mangaId", mangaId))
      .unique();
    if (row === null) return null;

    const memberships = await ctx.db
      .query("userPageMangas")
      .withIndex("by_userManga", (q) => q.eq("userMangaId", row._id))
      .collect();
    const pages: string[] = [];
    for (const m of memberships) {
      const page = await ctx.db.get(m.pageId);
      pages.push(page!.systemKey ?? `custom:${page!.title}`);
    }
    const history = await ctx.db
      .query("readChapters")
      .withIndex("by_userManga_number", (q) => q.eq("userMangaId", row._id))
      .collect();

    return {
      row,
      pages: pages.sort(),
      history: history.map((h) => h.number),
    };
  });
}

describe("full backup import — chapters", () => {
  test("bigger chapter from the file becomes current; account's goes to history", async () => {
    const c = await setup();
    await libraryWith(c, c.alice, c.mangaIds[0], { chapter: 80, siteId: c.siteId, page: "reading" });
    await libraryWith(c, c.bob, c.mangaIds[0], { chapter: 50, siteId: c.siteId, page: "reading" });

    // Bob is on 50; Alice's backup says 80.
    const file = await c.alice.query(api.transfer.exportLibrary, {});
    await importFile(c.bob, file, "titlesAndPages");

    const s = await stateOf(c, "test|bob", c.mangaIds[0]);
    expect(s!.row.currentChapterNumber).toBe(80);
    expect(s!.row.currentChapterUrl).toBe("https://asurascans.com/ch/80");
    expect(s!.history).toEqual([50]);
  });

  test("account's bigger chapter stays current; file's goes to history", async () => {
    const c = await setup();
    await libraryWith(c, c.alice, c.mangaIds[0], { chapter: 50, siteId: c.siteId });
    await libraryWith(c, c.bob, c.mangaIds[0], { chapter: 80, siteId: c.siteId });

    const file = await c.alice.query(api.transfer.exportLibrary, {});
    await importFile(c.bob, file, "titlesAndPages");

    const s = await stateOf(c, "test|bob", c.mangaIds[0]);
    expect(s!.row.currentChapterNumber).toBe(80);
    expect(s!.row.currentChapterUrl).toBe("https://asurascans.com/ch/80");
    expect(s!.history).toEqual([50]);
  });

  test("equal chapters change nothing", async () => {
    const c = await setup();
    await libraryWith(c, c.alice, c.mangaIds[0], { chapter: 60, siteId: c.siteId });
    await libraryWith(c, c.bob, c.mangaIds[0], { chapter: 60, siteId: c.siteId });

    const file = await c.alice.query(api.transfer.exportLibrary, {});
    await importFile(c.bob, file, "titlesAndPages");

    const s = await stateOf(c, "test|bob", c.mangaIds[0]);
    expect(s!.row.currentChapterNumber).toBe(60);
    expect(s!.history).toEqual([]);
  });

  test("importing the same file twice does not duplicate history", async () => {
    const c = await setup();
    await libraryWith(c, c.alice, c.mangaIds[0], { chapter: 80, siteId: c.siteId });
    await libraryWith(c, c.bob, c.mangaIds[0], { chapter: 50, siteId: c.siteId });

    const file = await c.alice.query(api.transfer.exportLibrary, {});
    await importFile(c.bob, file, "titlesAndPages");
    await importFile(c.bob, file, "titlesAndPages");

    const s = await stateOf(c, "test|bob", c.mangaIds[0]);
    expect(s!.history).toEqual([50]);
  });

  test("site resolves by domain when the id doesn't", async () => {
    const c = await setup();
    await libraryWith(c, c.alice, c.mangaIds[0], { chapter: 80, siteId: c.siteId });
    await libraryWith(c, c.bob, c.mangaIds[0], { chapter: 50, siteId: c.siteId });

    const file = await c.alice.query(api.transfer.exportLibrary, {});
    file.mangas[0].currentSiteId = "not-a-real-id" as Id<"sites">;
    await importFile(c.bob, file, "titlesAndPages");

    const s = await stateOf(c, "test|bob", c.mangaIds[0]);
    expect(s!.row.currentSiteId).toBe(c.siteId);
  });
});

describe("full backup import — pages", () => {
  const cases: [string, string, string][] = [
    ["reading", "completed", "completed"],
    ["completed", "reading", "completed"],
    ["planned", "paused", "paused"],
    ["paused", "reading", "reading"],
    ["planned", "reading", "reading"],
  ];

  test.each(cases)("account on %s, file on %s → %s", async (accountPage, filePage, expected) => {
    const c = await setup();
    await libraryWith(c, c.alice, c.mangaIds[0], { page: filePage as never });
    await libraryWith(c, c.bob, c.mangaIds[0], { page: accountPage as never });

    const file = await c.alice.query(api.transfer.exportLibrary, {});
    await importFile(c.bob, file, "titlesAndPages");

    const s = await stateOf(c, "test|bob", c.mangaIds[0]);
    expect(s!.pages).toEqual([expected]);
  });

  test("favourites and custom pages are added on top", async () => {
    const c = await setup();
    const userMangaId = await libraryWith(c, c.alice, c.mangaIds[0], { page: "reading" });
    await c.t.run(async (ctx) => {
      const alice = await ctx.db.query("users").withIndex("by_token", (q) => q.eq("token", "test|alice")).unique();
      const fav = await ctx.db
        .query("userPages")
        .withIndex("by_user_systemKey", (q) => q.eq("userId", alice!._id).eq("systemKey", "favourites"))
        .unique();
      const murim = await ctx.db.insert("userPages", {
        userId: alice!._id, title: "Murim", order: 9, type: "custom",
        systemKey: null, filters: [], sort: [],
      });
      await ctx.db.insert("userPageMangas", { pageId: fav!._id, userMangaId, order: 0 });
      await ctx.db.insert("userPageMangas", { pageId: murim, userMangaId, order: 0 });
    });
    await libraryWith(c, c.bob, c.mangaIds[0], { page: "planned" });

    const file = await c.alice.query(api.transfer.exportLibrary, {});
    await importFile(c.bob, file, "titlesAndPages");

    const s = await stateOf(c, "test|bob", c.mangaIds[0]);
    expect(s!.pages).toEqual(["custom:Murim", "favourites", "reading"]);
  });
});

describe("import — other cases", () => {
  test("a manga in the trash stays in the trash (full backup)", async () => {
    const c = await setup();
    await libraryWith(c, c.alice, c.mangaIds[0], { chapter: 80, siteId: c.siteId });
    const bobRow = await libraryWith(c, c.bob, c.mangaIds[0], { chapter: 50, siteId: c.siteId });
    await c.bob.mutation(api.trash.softDelete, { userMangaId: bobRow });

    const file = await c.alice.query(api.transfer.exportLibrary, {});
    const report = await importFile(c.bob, file, "titlesAndPages");

    const s = await stateOf(c, "test|bob", c.mangaIds[0]);
    expect(s!.row.isDeleted).toBe(true);
    expect(s!.row.currentChapterNumber).toBe(50);
    expect(s!.history).toEqual([]);
    expect(report.skipped[0].reason).toMatch(/in your trash/);
  });

  test("a manga in the trash stays in the trash (titles only)", async () => {
    const c = await setup();
    await libraryWith(c, c.alice, c.mangaIds[0], {});
    const bobRow = await libraryWith(c, c.bob, c.mangaIds[0], {});
    await c.bob.mutation(api.trash.softDelete, { userMangaId: bobRow });

    const file = await c.alice.query(api.transfer.exportLibrary, {});
    const report = await importFile(c.bob, file, "titles");

    const s = await stateOf(c, "test|bob", c.mangaIds[0]);
    expect(s!.row.isDeleted).toBe(true);
    expect(report.added).toBe(0);
  });

  test("settings are imported only with All Settings", async () => {
    const c = await setup();
    await c.alice.mutation(api.settings.updateSettings, { scrollThreshold: 55 });
    const file = await c.alice.query(api.transfer.exportLibrary, {});

    const bobThreshold = () =>
      c.bob.query(api.users.me, {}).then((me) => me!.settings.scrollThreshold);

    await importFile(c.bob, file, "titles");
    expect(await bobThreshold()).toBe(80);

    await importFile(c.bob, file, "titlesAndPages");
    expect(await bobThreshold()).toBe(80);

    await importFile(c.bob, file, "all");
    expect(await bobThreshold()).toBe(55);
  });

  test("a manga missing from the catalogue is skipped, never created", async () => {
    const c = await setup();
    await libraryWith(c, c.alice, c.mangaIds[0], {});
    const file = await c.alice.query(api.transfer.exportLibrary, {});
    file.mangas.push({ ...file.mangas[0], id: undefined, title: "Made Up", normalizedTitle: "made up" });

    const report = await importFile(c.bob, file, "titles");

    expect(report.added).toBe(1);
    expect(report.skipped).toEqual([{ title: "Made Up", reason: "not in the catalogue" }]);
    const count = await c.t.run(async (ctx) => (await ctx.db.query("mangas").collect()).length);
    expect(count).toBe(3);
  });

  test("titles only lands new manga on the default page, with no progress", async () => {
    const c = await setup();
    await libraryWith(c, c.alice, c.mangaIds[0], { page: "completed", chapter: 40, siteId: c.siteId });
    const file = await c.alice.query(api.transfer.exportLibrary, {});
    await importFile(c.bob, file, "titles");

    const s = await stateOf(c, "test|bob", c.mangaIds[0]);
    expect(s!.pages).toEqual(["reading"]);
    expect(s!.row.currentChapterNumber).toBeUndefined();
  });

  test("titles only leaves manga already in the library untouched", async () => {
    const c = await setup();
    await libraryWith(c, c.alice, c.mangaIds[0], { page: "completed", chapter: 90, siteId: c.siteId });
    await libraryWith(c, c.bob, c.mangaIds[0], { page: "planned", chapter: 10, siteId: c.siteId });
    const file = await c.alice.query(api.transfer.exportLibrary, {});
    const report = await importFile(c.bob, file, "titles");

    const s = await stateOf(c, "test|bob", c.mangaIds[0]);
    expect(report.alreadyInLibrary).toBe(1);
    expect(s!.pages).toEqual(["planned"]);
    expect(s!.row.currentChapterNumber).toBe(10);
  });

  test("title and page brings custom pages over", async () => {
    const c = await setup();
    await c.t.run(async (ctx) => {
      const alice = await ctx.db.query("users").withIndex("by_token", (q) => q.eq("token", "test|alice")).unique();
      await ctx.db.insert("userPages", {
        userId: alice!._id, title: "Murim", order: 9, type: "custom",
        systemKey: null, filters: [], sort: [],
      });
    });
    const file = await c.alice.query(api.transfer.exportLibrary, {});

    await importFile(c.bob, file, "titles");
    const titlesOnly = await c.bob.query(api.users.me, {});
    expect(titlesOnly!.pages.map((p) => p.title)).not.toContain("Murim");

    await importFile(c.bob, file, "titlesAndPages");
    const withPages = await c.bob.query(api.users.me, {});
    expect(withPages!.pages.map((p) => p.title)).toContain("Murim");
  });

  test("a file from another format version is rejected clearly", async () => {
    const c = await setup();
    const file = await c.alice.query(api.transfer.exportLibrary, {});
    await expect(
      c.bob.mutation(api.transfer.importMangas, { kollect: 2, mode: "titles", mangas: file.mangas }),
    ).rejects.toThrow(/export format 2/);
  });
});

describe("switching back to a history chapter", () => {
  test("the chapter being left is kept, so you can switch forward again", async () => {
    const c = await setup();
    await libraryWith(c, c.alice, c.mangaIds[0], { chapter: 80, siteId: c.siteId });
    await libraryWith(c, c.bob, c.mangaIds[0], { chapter: 50, siteId: c.siteId });
    const file = await c.alice.query(api.transfer.exportLibrary, {});
    await importFile(c.bob, file, "titlesAndPages");

    const bobRow = (await stateOf(c, "test|bob", c.mangaIds[0]))!.row;
    const history = await c.bob.query(api.library.chapterHistory, { userMangaId: bobRow._id });
    const result = await c.bob.mutation(api.library.switchToHistoryChapter, {
      readChapterId: history[0]._id,
    });

    const s = await stateOf(c, "test|bob", c.mangaIds[0]);
    expect(result.keptPrevious).toBe(true);
    expect(s!.row.currentChapterNumber).toBe(50);
    expect(s!.history.sort()).toEqual([50, 80]);
  });
});

describe("scheduled purge", () => {
  test("never purges trash for users with auto-clear off", async () => {
    const c = await setup();
    await c.alice.mutation(api.settings.updateSettings, { autoClearTrash: false });
    const keep = await libraryWith(c, c.alice, c.mangaIds[0], {});
    await c.alice.mutation(api.trash.softDelete, { userMangaId: keep });

    const expire = await libraryWith(c, c.bob, c.mangaIds[1], {});
    await c.bob.mutation(api.trash.softDelete, { userMangaId: expire });
    await c.t.run((ctx) => ctx.db.patch(expire, { purgeAt: Date.now() - DAY }));

    await c.t.mutation(internal.trash.purgeExpired, {});

    const [kept, purged] = await c.t.run(async (ctx) => [
      await ctx.db.get(keep),
      await ctx.db.get(expire),
    ]);
    expect(kept).not.toBeNull();
    expect(purged).toBeNull();
  });
});

describe("source contains filter", () => {
  test("a site gets remembered once a chapter from it lands in history", async () => {
    const c = await setup();
    const flame = await c.t.run((ctx) =>
      ctx.db.insert("sites", {
        domain: "flamecomics.xyz", icon: "flame.png", title: "Flame", link: "https://flamecomics.xyz",
        chapterInUrl: true, caseSensitive: false, configVersion: 1,
      }),
    );
    // Bob read chapter 50 on Flame; Alice's file has chapter 80 on Asura.
    await libraryWith(c, c.alice, c.mangaIds[0], { chapter: 80, siteId: c.siteId, page: "reading" });
    await libraryWith(c, c.bob, c.mangaIds[0], { chapter: 50, siteId: flame, page: "reading" });

    const file = await c.alice.query(api.transfer.exportLibrary, {});
    await importFile(c.bob, file, "titlesAndPages");

    const me = await c.bob.query(api.users.me, {});
    const reading = me!.pages.find((p) => p.systemKey === "reading")!;
    const { items } = await c.bob.query(api.pages.mangasForPage, { pageId: reading._id });
    const manga = toFilterable(items[0]);

    // Now reading on Asura, with Flame in the history.
    expect(matchesFilter(manga, { field: "source", op: "equal", siteId: c.siteId }, Date.now())).toBe(true);
    expect(matchesFilter(manga, { field: "source", op: "equal", siteId: flame }, Date.now())).toBe(false);
    expect(matchesFilter(manga, { field: "source", op: "contains", siteId: flame }, Date.now())).toBe(true);
  });
});
