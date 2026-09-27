/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const flamePage = (number: number, slug = "omniscient-reader", title = "Omniscient Reader") => ({
  domain: "flamecomics.xyz",
  url: `https://flamecomics.xyz/series/${slug}/chapter-${number}`,
  slug,
  title,
  chapter: { number, label: `Chapter ${number}` },
});

test("removing a user removes everything of theirs and nothing of anyone else's", async () => {
  const t = convexTest(schema, modules);
  const me = t.withIdentity({ tokenIdentifier: "test|me", name: "Me" });
  const other = t.withIdentity({ tokenIdentifier: "test|other", name: "Other" });
  await me.mutation(api.users.createUser, {});
  await other.mutation(api.users.createUser, {});

  // Me: a private website, several manga with history, and a tag.
  const newSite = { title: "Flame", slugPattern: "/series/:slug/:chapter" };
  for (let i = 0; i < 60; i++) {
    await me.mutation(api.reading.addFromPage, { page: flamePage(1, `series-${i}`, `Series ${i}`), newSite });
  }
  await me.mutation(api.reading.recordProgress, { page: flamePage(1, "series-0", "Series 0"), percentage: 100 });
  await me.mutation(api.reading.recordProgress, { page: flamePage(2, "series-0", "Series 0"), percentage: 100 });
  await me.mutation(api.tags.create, { name: "Murim" });

  // Other: a manga on the built-in site.
  const asura = {
    domain: "asurascans.com",
    url: "https://asurascans.com/comics/solo-leveling/chapter/5",
    slug: "solo-leveling",
    title: "Solo Leveling",
    chapter: { number: 5, label: "Chapter 5" },
  };
  await other.mutation(api.reading.addFromPage, { page: asura });

  const users = await t.query(internal.admin.listUsers, {});
  const mine = users.find((u) => u.name === "Me")!;
  expect(mine).toMatchObject({ manga: 60, websitesAdded: 1 });

  await t.mutation(internal.admin.deleteUser, { userId: mine.userId });
  await t.finishAllScheduledFunctions(() => {});

  const left = await t.run(async (ctx) => ({
    users: (await ctx.db.query("users").collect()).map((u) => u.name),
    userMangas: (await ctx.db.query("userMangas").collect()).length,
    readChapters: (await ctx.db.query("readChapters").collect()).length,
    pages: (await ctx.db.query("userPages").collect()).length,
    tags: (await ctx.db.query("userTags").collect()).map((tag) => tag.name),
    settings: (await ctx.db.query("settings").collect()).length,
    sites: (await ctx.db.query("sites").collect()).map((s) => s.domain),
    sources: (await ctx.db.query("mangaSources").collect()).map((s) => s.slug),
    mangas: (await ctx.db.query("mangas").collect()).length,
  }));

  expect(left).toEqual({
    users: ["Other"],
    userMangas: 1,
    readChapters: 0,
    pages: 5,
    tags: ["Favourite"],
    settings: 1,
    sites: ["asurascans.com"],
    sources: ["solo-leveling"],
    // The shared manga list keeps everything.
    mangas: 61,
  });

  // Running it again is harmless.
  expect(await t.mutation(internal.admin.deleteUser, { userId: mine.userId })).toMatch(/already removed/);
});
