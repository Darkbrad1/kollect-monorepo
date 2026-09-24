/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
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
    const file = await c.alice.query(api.transfer.exportLibrary, { kind: "full" });
    await c.bob.mutation(api.transfer.importLibrary, { file });

    const s = await stateOf(c, "test|bob", c.mangaIds[0]);
    expect(s!.row.currentChapterNumber).toBe(80);
    expect(s!.row.currentChapterUrl).toBe("https://asurascans.com/ch/80");
    expect(s!.history).toEqual([50]);
  });

  test("account's bigger chapter stays current; file's goes to history", async () => {
    const c = await setup();
    await libraryWith(c, c.alice, c.mangaIds[0], { chapter: 50, siteId: c.siteId });
    await libraryWith(c, c.bob, c.mangaIds[0], { chapter: 80, siteId: c.siteId });

    const file = await c.alice.query(api.transfer.exportLibrary, { kind: "full" });
    await c.bob.mutation(api.transfer.importLibrary, { file });

    const s = await stateOf(c, "test|bob", c.mangaIds[0]);
    expect(s!.row.currentChapterNumber).toBe(80);
    expect(s!.row.currentChapterUrl).toBe("https://asurascans.com/ch/80");
    expect(s!.history).toEqual([50]);
  });

  test("equal chapters change nothing", async () => {
    const c = await setup();
    await libraryWith(c, c.alice, c.mangaIds[0], { chapter: 60, siteId: c.siteId });
    await libraryWith(c, c.bob, c.mangaIds[0], { chapter: 60, siteId: c.siteId });

    const file = await c.alice.query(api.transfer.exportLibrary, { kind: "full" });
    await c.bob.mutation(api.transfer.importLibrary, { file });

    const s = await stateOf(c, "test|bob", c.mangaIds[0]);
    expect(s!.row.currentChapterNumber).toBe(60);
    expect(s!.history).toEqual([]);
  });

  test("importing the same file twice does not duplicate history", async () => {
    const c = await setup();
    await libraryWith(c, c.alice, c.mangaIds[0], { chapter: 80, siteId: c.siteId });
    await libraryWith(c, c.bob, c.mangaIds[0], { chapter: 50, siteId: c.siteId });

    const file = await c.alice.query(api.transfer.exportLibrary, { kind: "full" });
    await c.bob.mutation(api.transfer.importLibrary, { file });
    await c.bob.mutation(api.transfer.importLibrary, { file });

    const s = await stateOf(c, "test|bob", c.mangaIds[0]);
    expect(s!.history).toEqual([50]);
  });

  test("site resolves by domain when the id doesn't", async () => {
    const c = await setup();
    await libraryWith(c, c.alice, c.mangaIds[0], { chapter: 80, siteId: c.siteId });
    await libraryWith(c, c.bob, c.mangaIds[0], { chapter: 50, siteId: c.siteId });

    const file = await c.alice.query(api.transfer.exportLibrary, { kind: "full" });
    if (file.kind !== "full") throw new Error("expected full");
    file.items[0].currentSiteId = "not-a-real-id" as Id<"sites">;
    await c.bob.mutation(api.transfer.importLibrary, { file });

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

    const file = await c.alice.query(api.transfer.exportLibrary, { kind: "full" });
    await c.bob.mutation(api.transfer.importLibrary, { file });

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

    const file = await c.alice.query(api.transfer.exportLibrary, { kind: "full" });
    await c.bob.mutation(api.transfer.importLibrary, { file });

    const s = await stateOf(c, "test|bob", c.mangaIds[0]);
    expect(s!.pages).toEqual(["custom:Murim", "favourites", "reading"]);
  });
});

describe("import — other cases", () => {
  test("a manga in the trash is restored, then merged", async () => {
    const c = await setup();
    await libraryWith(c, c.alice, c.mangaIds[0], { chapter: 80, siteId: c.siteId });
    const bobRow = await libraryWith(c, c.bob, c.mangaIds[0], { chapter: 50, siteId: c.siteId });
    await c.bob.mutation(api.trash.softDelete, { userMangaId: bobRow });

    const file = await c.alice.query(api.transfer.exportLibrary, { kind: "full" });
    const report = await c.bob.mutation(api.transfer.importLibrary, { file });

    const s = await stateOf(c, "test|bob", c.mangaIds[0]);
    expect(report.restored).toBe(1);
    expect(s!.row.isDeleted).toBe(false);
    expect(s!.row.currentChapterNumber).toBe(80);
  });

  test("a manga missing from the catalogue is skipped, never created", async () => {
    const c = await setup();
    await libraryWith(c, c.alice, c.mangaIds[0], {});
    const file = await c.alice.query(api.transfer.exportLibrary, { kind: "titles" });
    file.mangas.push({ ...file.mangas[0], id: undefined, title: "Made Up", normalizedTitle: "made up" });

    const report = await c.bob.mutation(api.transfer.importLibrary, { file });

    expect(report.added).toBe(1);
    expect(report.skipped).toEqual([{ title: "Made Up", reason: "not in the catalogue" }]);
    const count = await c.t.run(async (ctx) => (await ctx.db.query("mangas").collect()).length);
    expect(count).toBe(3);
  });

  test("titles only lands new manga on the default page", async () => {
    const c = await setup();
    await libraryWith(c, c.alice, c.mangaIds[0], { page: "completed" });
    const file = await c.alice.query(api.transfer.exportLibrary, { kind: "titles" });
    await c.bob.mutation(api.transfer.importLibrary, { file });

    const s = await stateOf(c, "test|bob", c.mangaIds[0]);
    expect(s!.pages).toEqual(["reading"]);
  });

  test("a file from another format version is rejected clearly", async () => {
    const c = await setup();
    const file = await c.alice.query(api.transfer.exportLibrary, { kind: "titles" });
    await expect(
      c.bob.mutation(api.transfer.importLibrary, { file: { ...file, kollect: 2 } }),
    ).rejects.toThrow(/export format 2/);
  });
});

describe("switching back to a history chapter", () => {
  test("the chapter being left is kept, so you can switch forward again", async () => {
    const c = await setup();
    await libraryWith(c, c.alice, c.mangaIds[0], { chapter: 80, siteId: c.siteId });
    await libraryWith(c, c.bob, c.mangaIds[0], { chapter: 50, siteId: c.siteId });
    const file = await c.alice.query(api.transfer.exportLibrary, { kind: "full" });
    await c.bob.mutation(api.transfer.importLibrary, { file });

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
