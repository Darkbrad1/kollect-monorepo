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
    await me.mutation(api.tags.rename, { tagId: tag, name: "Murim" });

    const tags = await me.query(api.tags.list, {});
    expect(tags.map((t) => t.name)).toContain("Murim");
  });

  test("Favourite can't be renamed or deleted", async () => {
    const { me } = await setup();
    const [favourite] = await me.query(api.tags.list, {});
    await expect(me.mutation(api.tags.rename, { tagId: favourite._id, name: "Loved" })).rejects.toThrow();
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
