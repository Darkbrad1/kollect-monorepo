/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function setup() {
  const t = convexTest(schema, modules);
  const me = t.withIdentity({ tokenIdentifier: "test|me", name: "Me" });
  await me.mutation(api.users.createUser, {});

  const mangaIds = await t.run(async (ctx) => {
    const ids: Id<"mangas">[] = [];
    for (const title of ["Solo Leveling", "Omniscient Reader", "Tower of God"]) {
      ids.push(
        await ctx.db.insert("mangas", {
          title, normalizedTitle: title.toLowerCase(), altTitles: [],
          image: "cover.png", type: "manhwa", authors: [], tags: [],
        }),
      );
    }
    return ids;
  });

  const add = async (mangaId: Id<"mangas">, page?: "reading" | "planned" | "paused" | "completed") => {
    const { userMangaId } = await me.mutation(api.library.addManga, { mangaId });
    if (page) await me.mutation(api.library.moveToProgressPage, { userMangaId, systemKey: page });
    return userMangaId;
  };

  const pageTitles = async (systemKey: "reading" | "planned" | "paused" | "completed" | "favourites") => {
    const info = await me.query(api.users.me, {});
    const page = info!.pages.find((p) => p.systemKey === systemKey)!;
    const { items } = await me.query(api.pages.mangasForPage, { pageId: page._id });
    return items.map((item) => item.manga.title).sort();
  };

  return { t, me, mangaIds, add, pageTitles };
}

describe("tags", () => {
  test("every account starts with the Favourite tag", async () => {
    const { me } = await setup();
    const tags = await me.query(api.tags.list, {});
    expect(tags.map((t) => [t.name, t.builtIn])).toEqual([["Favourite", "favourite"]]);
  });

  test("names are unique, ignoring capitals and extra spaces", async () => {
    const { me } = await setup();
    await me.mutation(api.tags.create, { name: "Murim" });
    await expect(me.mutation(api.tags.create, { name: "  murim " })).rejects.toThrow(/already have/);
  });

  test("the list shows Favourite first, then A to Z", async () => {
    const { me } = await setup();
    for (const name of ["Zombie", "Action", "Murim"]) {
      await me.mutation(api.tags.create, { name });
    }
    const tags = await me.query(api.tags.list, {});
    expect(tags.map((t) => t.name)).toEqual(["Favourite", "Action", "Murim", "Zombie"]);
  });

  test("renaming changes the name everywhere", async () => {
    const { me, mangaIds, add } = await setup();
    const row = await add(mangaIds[0]);
    const tag = await me.mutation(api.tags.create, { name: "Murm" });
    await me.mutation(api.tags.addTag, { userMangaId: row, tagId: tag });
    await me.mutation(api.tags.update, { tagId: tag, name: "Murim" });

    const tags = await me.query(api.tags.list, {});
    expect(tags.map((t) => t.name)).toContain("Murim");
  });

  test("Favourite can't be renamed or deleted", async () => {
    const { me } = await setup();
    const [favourite] = await me.query(api.tags.list, {});
    await expect(me.mutation(api.tags.update, { tagId: favourite._id, name: "Loved" })).rejects.toThrow();
    await expect(me.mutation(api.tags.remove, { tagId: favourite._id })).rejects.toThrow();
  });

  test("deleting a tag takes it off manga (trash too) and out of page filters", async () => {
    const { t, me, mangaIds, add } = await setup();
    const live = await add(mangaIds[0]);
    const trashed = await add(mangaIds[1]);
    const tag = await me.mutation(api.tags.create, { name: "Murim" });
    await me.mutation(api.tags.addTag, { userMangaId: live, tagId: tag });
    await me.mutation(api.tags.addTag, { userMangaId: trashed, tagId: tag });
    await me.mutation(api.trash.softDelete, { userMangaId: trashed });

    const reading = (await me.query(api.users.me, {}))!.pages.find((p) => p.systemKey === "reading")!;
    await t.run((ctx) =>
      ctx.db.patch(reading._id, {
        filters: [
          { field: "tag", op: "has", tagId: tag },
          { field: "lastReadChapter", op: "greaterThan", value: 5 },
        ],
      }),
    );

    await me.mutation(api.tags.remove, { tagId: tag });

    const [liveRow, trashedRow, page] = await t.run(async (ctx) => [
      await ctx.db.get(live),
      await ctx.db.get(trashed),
      await ctx.db.get(reading._id),
    ]);
    expect(liveRow!.tagIds).toEqual([]);
    expect(trashedRow!.tagIds).toEqual([]);
    expect(page!.filters).toEqual([{ field: "lastReadChapter", op: "greaterThan", value: 5 }]);
  });

  test("a manga in the trash can't be tagged", async () => {
    const { me, mangaIds, add } = await setup();
    const row = await add(mangaIds[0]);
    await me.mutation(api.trash.softDelete, { userMangaId: row });
    await expect(me.mutation(api.tags.setFavourite, { userMangaId: row, favourite: true })).rejects.toThrow(/trash/);
  });

  test("an account from before tags gets its Favourite tag on next sign-in", async () => {
    const { t, me } = await setup();
    const [favourite] = await me.query(api.tags.list, {});
    await t.run((ctx) => ctx.db.delete(favourite._id));

    await me.mutation(api.users.createUser, {});
    const tags = await me.query(api.tags.list, {});
    expect(tags.map((t) => t.builtIn)).toEqual(["favourite"]);
  });
});

describe("tag colours and adding by name", () => {
  test("new tags take the next colour in the list", async () => {
    const { me } = await setup();
    for (const name of ["A", "B", "C"]) await me.mutation(api.tags.create, { name });
    const tags = (await me.query(api.tags.list, {})).filter((t) => t.builtIn === null);
    expect(tags.map((t) => t.color)).toEqual(["#F7A1A1", "#B5F2A5", "#5B8FD6"]);
  });

  test("a colour can be picked, and changed later", async () => {
    const { me } = await setup();
    const tag = await me.mutation(api.tags.create, { name: "Murim", color: "#123abc" });
    expect((await me.query(api.tags.list, {})).find((t) => t._id === tag)!.color).toBe("#123ABC");

    await me.mutation(api.tags.update, { tagId: tag, color: "#00ff00" });
    expect((await me.query(api.tags.list, {})).find((t) => t._id === tag)!.color).toBe("#00FF00");
  });

  test("a colour that isn't a colour code is refused", async () => {
    const { me } = await setup();
    await expect(me.mutation(api.tags.create, { name: "Murim", color: "red" })).rejects.toThrow(/colour code/);
  });

  test("Search/Create adds an existing tag, or makes a new one", async () => {
    const { me, mangaIds, add } = await setup();
    const row = await add(mangaIds[0]);
    const existing = await me.mutation(api.tags.create, { name: "Murim" });

    expect(await me.mutation(api.tags.addTagByName, { userMangaId: row, name: "murim" })).toBe(existing);
    const created = await me.mutation(api.tags.addTagByName, { userMangaId: row, name: "Isekai" });

    const tags = await me.query(api.tags.list, {});
    expect(tags.map((t) => t.name)).toEqual(["Favourite", "Isekai", "Murim"]);
    const info = await me.query(api.users.me, {});
    const reading = info!.pages.find((p) => p.systemKey === "reading")!;
    const { items } = await me.query(api.pages.mangasForPage, { pageId: reading._id });
    expect(items[0].userManga.tagIds.sort()).toEqual([existing, created].sort());
  });

  test("Search/Create won't favourite", async () => {
    const { me, mangaIds, add } = await setup();
    const row = await add(mangaIds[0]);
    await expect(me.mutation(api.tags.addTagByName, { userMangaId: row, name: "favourite" })).rejects.toThrow();
  });
});

describe("saved filters and sort", () => {
  test("a page saves its filters and sort, and Clear All empties them", async () => {
    const { me } = await setup();
    const info = await me.query(api.users.me, {});
    const reading = info!.pages.find((p) => p.systemKey === "reading")!;
    const tag = await me.mutation(api.tags.create, { name: "Murim" });

    await me.mutation(api.pages.setFilters, {
      pageId: reading._id,
      filters: [{ field: "tag", op: "has", tagId: tag }],
    });
    await me.mutation(api.pages.setSort, {
      pageId: reading._id,
      sort: [{ field: "lastRead", direction: "desc" }, { field: "title", direction: "asc" }],
    });

    let page = (await me.query(api.pages.mangasForPage, { pageId: reading._id })).page;
    expect(page.filters).toHaveLength(1);
    expect(page.sort.map((r) => r.field)).toEqual(["lastRead", "title"]);

    await me.mutation(api.pages.setFilters, { pageId: reading._id, filters: [] });
    page = (await me.query(api.pages.mangasForPage, { pageId: reading._id })).page;
    expect(page.filters).toEqual([]);
  });

  test("a filter can't use someone else's tag", async () => {
    const { t, me } = await setup();
    const other = t.withIdentity({ tokenIdentifier: "test|other", name: "Other" });
    await other.mutation(api.users.createUser, {});
    const theirTag = await other.mutation(api.tags.create, { name: "Theirs" });

    const info = await me.query(api.users.me, {});
    const reading = info!.pages.find((p) => p.systemKey === "reading")!;
    await expect(
      me.mutation(api.pages.setFilters, {
        pageId: reading._id,
        filters: [{ field: "tag", op: "has", tagId: theirTag }],
      }),
    ).rejects.toThrow();
  });
});

describe("pages", () => {
  test("a progress page shows only the manga on it", async () => {
    const { mangaIds, add, pageTitles } = await setup();
    await add(mangaIds[0], "reading");
    await add(mangaIds[1], "completed");

    expect(await pageTitles("reading")).toEqual(["Solo Leveling"]);
    expect(await pageTitles("completed")).toEqual(["Omniscient Reader"]);
  });

  test("Favourites shows favourited manga from every progress page", async () => {
    const { me, mangaIds, add, pageTitles } = await setup();
    const a = await add(mangaIds[0], "reading");
    const b = await add(mangaIds[1], "completed");
    await add(mangaIds[2], "planned");
    await me.mutation(api.tags.setFavourite, { userMangaId: a, favourite: true });
    await me.mutation(api.tags.setFavourite, { userMangaId: b, favourite: true });

    expect(await pageTitles("favourites")).toEqual(["Omniscient Reader", "Solo Leveling"]);

    await me.mutation(api.tags.setFavourite, { userMangaId: a, favourite: false });
    expect(await pageTitles("favourites")).toEqual(["Omniscient Reader"]);
  });

  test("trashed manga leave Favourites, and come back on restore", async () => {
    const { me, mangaIds, add, pageTitles } = await setup();
    const a = await add(mangaIds[0], "paused");
    await me.mutation(api.tags.setFavourite, { userMangaId: a, favourite: true });

    await me.mutation(api.trash.softDelete, { userMangaId: a });
    expect(await pageTitles("favourites")).toEqual([]);
    expect(await pageTitles("paused")).toEqual([]);

    await me.mutation(api.trash.restore, { userMangaId: a });
    expect(await pageTitles("favourites")).toEqual(["Solo Leveling"]);
    expect(await pageTitles("paused")).toEqual(["Solo Leveling"]);
  });
});

describe("switching the reading source", () => {
  // You read chapters 1–40 on Flame, then moved to Asurascans and are
  // on chapter 98 there. A third site, Reaper, carries the series but
  // you've never read it there.
  async function withSites() {
    const c = await setup();
    const [asura, flame, reaper] = await c.t.run(async (ctx) => {
      const site = (domain: string, title: string) =>
        ctx.db.insert("sites", {
          domain, icon: `${domain}.png`, title, link: `https://${domain}`,
          chapterInUrl: true, caseSensitive: false, configVersion: 1,
        });
      return [
        await site("asurascans.com", "Asurascans"),
        await site("flamecomics.xyz", "Flame"),
        await site("reaperscans.com", "Reaper"),
      ];
    });
    const row = await c.add(c.mangaIds[0], "reading");
    await c.t.run(async (ctx) => {
      await ctx.db.insert("mangaSources", {
        mangaId: c.mangaIds[0], siteId: reaper, url: "https://reaperscans.com/solo",
      });
      for (const [number, readAt] of [[39, 100], [40, 200]]) {
        await ctx.db.insert("readChapters", {
          userMangaId: row, number, label: `Ch. ${number}`, siteId: flame,
          url: `https://flamecomics.xyz/solo/${number}`, percentage: 100, readAt,
        });
      }
      await ctx.db.patch(row, {
        currentChapterNumber: 98,
        currentChapterLabel: "Ch. 98",
        currentChapterUrl: "https://asurascans.com/solo/98",
        currentPercentage: 30,
        currentSiteId: asura,
        lastReadAt: 300,
        readSiteIds: [flame],
      });
    });
    return { ...c, row, asura, flame, reaper };
  }

  test("the dropdown lists only sites you've read it on, with your chapter at each", async () => {
    const { me, row } = await withSites();
    const sites = await me.query(api.library.sourcesFor, { userMangaId: row });
    expect(sites.map((s) => [s.title, s.isCurrent, s.chapterLabel])).toEqual([
      ["Asurascans", true, "Ch. 98"],
      ["Flame", false, "Ch. 40"],
    ]);
  });

  test("switching jumps to the chapter you were last on at that site", async () => {
    const { t, me, row, flame } = await withSites();
    await me.mutation(api.library.switchSource, { userMangaId: row, siteId: flame });

    const after = await t.run((ctx) => ctx.db.get(row));
    expect(after!.currentSiteId).toBe(flame);
    expect(after!.currentChapterNumber).toBe(40);
    expect(after!.currentChapterUrl).toBe("https://flamecomics.xyz/solo/40");
    expect(after!.currentPercentage).toBe(100);
  });

  test("re-reading an earlier chapter doesn't move you back", async () => {
    const { t, me, row, flame } = await withSites();
    // After reaching 40 on Flame, you went back and re-read chapter 10 there.
    await t.run((ctx) =>
      ctx.db.insert("readChapters", {
        userMangaId: row, number: 10, label: "Ch. 10", siteId: flame,
        url: "https://flamecomics.xyz/solo/10", percentage: 100, readAt: 250,
      }),
    );
    await me.mutation(api.library.switchSource, { userMangaId: row, siteId: flame });

    const after = await t.run((ctx) => ctx.db.get(row));
    expect(after!.currentChapterNumber).toBe(40);
  });

  test("switching back returns you to where you left off", async () => {
    const { t, me, row, asura, flame } = await withSites();
    await me.mutation(api.library.switchSource, { userMangaId: row, siteId: flame });
    await me.mutation(api.library.switchSource, { userMangaId: row, siteId: asura });

    const after = await t.run((ctx) => ctx.db.get(row));
    expect(after!.currentSiteId).toBe(asura);
    expect(after!.currentChapterNumber).toBe(98);
    expect(after!.currentChapterUrl).toBe("https://asurascans.com/solo/98");
    expect(after!.readSiteIds!.sort()).toEqual([asura, flame].sort());
  });

  test("you can't switch to a site you've never read it on", async () => {
    const { me, row, reaper } = await withSites();
    await expect(
      me.mutation(api.library.switchSource, { userMangaId: row, siteId: reaper }),
    ).rejects.toThrow(/haven't read/);
  });

  test("a manga in the trash can't switch", async () => {
    const { me, row, flame } = await withSites();
    await me.mutation(api.trash.softDelete, { userMangaId: row });
    await expect(me.mutation(api.library.switchSource, { userMangaId: row, siteId: flame })).rejects.toThrow(/trash/);
  });
});

describe("search", () => {
  test("finds manga on every page, ignoring capitals and punctuation", async () => {
    const { me, mangaIds, add } = await setup();
    await add(mangaIds[0], "reading"); // Solo Leveling
    await add(mangaIds[1], "completed"); // Omniscient Reader
    await add(mangaIds[2], "planned"); // Tower of God

    const found = await me.query(api.pages.searchLibrary, { text: "  LEVELING!" });
    expect(found.items.map((i) => [i.manga.title, i.userManga.progressKey])).toEqual([
      ["Solo Leveling", "reading"],
    ]);
  });

  test("titles that start with the search come first", async () => {
    const { me, mangaIds, add } = await setup();
    for (const id of mangaIds) await add(id);
    // "o" starts "Omniscient Reader" and appears inside the other two.
    const found = await me.query(api.pages.searchLibrary, { text: "o" });
    expect(found.items.map((i) => i.manga.title)).toEqual([
      "Omniscient Reader",
      "Solo Leveling",
      "Tower of God",
    ]);
  });

  test("matches alternative titles too", async () => {
    const { t, me, mangaIds, add } = await setup();
    await add(mangaIds[0]);
    await t.run((ctx) => ctx.db.patch(mangaIds[0], { altTitles: ["Na Honjaman Level Up"] }));
    const found = await me.query(api.pages.searchLibrary, { text: "honjaman" });
    expect(found.items.map((i) => i.manga.title)).toEqual(["Solo Leveling"]);
  });

  test("leaves out the trash, and an empty search finds nothing", async () => {
    const { me, mangaIds, add } = await setup();
    const row = await add(mangaIds[0]);
    await me.mutation(api.trash.softDelete, { userMangaId: row });
    expect((await me.query(api.pages.searchLibrary, { text: "solo" })).items).toEqual([]);
    expect((await me.query(api.pages.searchLibrary, { text: "  " })).items).toEqual([]);
  });
});
