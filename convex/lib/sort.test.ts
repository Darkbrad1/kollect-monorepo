import { describe, expect, test } from "vitest";
import type { Doc, Id } from "../_generated/dataModel";
import { sortMangas } from "./sort";

const asura = "site_asura" as Id<"sites">;
const flame = "site_flame" as Id<"sites">;
const siteTitles = new Map([[asura, "Asurascans"], [flame, "Flame Comics"]]);

function item(
  title: string,
  fields: {
    lastReadAt?: number;
    addedAt?: number;
    chapter?: number;
    latest?: number;
    site?: Id<"sites">;
  } = {},
) {
  return {
    userManga: {
      lastReadAt: fields.lastReadAt,
      addedAt: fields.addedAt ?? 0,
      currentChapterNumber: fields.chapter,
      currentSiteId: fields.site,
    } as Doc<"userMangas">,
    manga: { title, latestChapter: fields.latest } as Doc<"mangas">,
  };
}

const titles = (items: { manga: { title: string } }[]) => items.map((i) => i.manga.title);

describe("each sort option", () => {
  const items = [
    item("Beta", { lastReadAt: 20, addedAt: 1, chapter: 5, latest: 50, site: flame }),
    item("alpha", { lastReadAt: 30, addedAt: 3, chapter: 9, latest: 10, site: asura }),
    item("Gamma", { lastReadAt: 10, addedAt: 2, chapter: 7, latest: 90, site: asura }),
  ];

  test.each([
    ["lastRead", ["Gamma", "Beta", "alpha"]],
    ["dateAdded", ["Beta", "Gamma", "alpha"]],
    ["lastReadChapter", ["Beta", "Gamma", "alpha"]],
    ["latestChapter", ["alpha", "Beta", "Gamma"]],
    ["title", ["alpha", "Beta", "Gamma"]], // capitals don't matter
  ] as const)("%s ascending", (field, expected) => {
    expect(titles(sortMangas(items, [{ field, direction: "asc" }]))).toEqual(expected);
  });

  test("descending reverses it", () => {
    expect(titles(sortMangas(items, [{ field: "title", direction: "desc" }]))).toEqual(["Gamma", "Beta", "alpha"]);
  });

  test("sources sorts by the site's name", () => {
    const sorted = sortMangas(items, [{ field: "source", direction: "desc" }], siteTitles);
    expect(sorted[0].manga.title).toBe("Beta"); // Flame Comics after Asurascans
  });
});

describe("sort rules", () => {
  test("later rows break ties left by earlier ones", () => {
    const items = [item("B", { chapter: 5 }), item("A", { chapter: 5 }), item("C", { chapter: 1 })];
    const sorted = sortMangas(items, [
      { field: "lastReadChapter", direction: "desc" },
      { field: "title", direction: "asc" },
    ]);
    expect(titles(sorted)).toEqual(["A", "B", "C"]);
  });

  test("blanks go last, whichever direction", () => {
    const items = [item("Unread"), item("Ten", { chapter: 10 }), item("Two", { chapter: 2 })];
    expect(titles(sortMangas(items, [{ field: "lastReadChapter", direction: "asc" }]))).toEqual(["Two", "Ten", "Unread"]);
    expect(titles(sortMangas(items, [{ field: "lastReadChapter", direction: "desc" }]))).toEqual(["Ten", "Two", "Unread"]);
  });

  test("a full tie keeps the loader's order, and nothing is changed in place", () => {
    const items = [item("First"), item("Second"), item("Third")];
    expect(titles(sortMangas(items, [{ field: "lastRead", direction: "asc" }]))).toEqual(["First", "Second", "Third"]);
    expect(titles(sortMangas(items, []))).toEqual(["First", "Second", "Third"]);
  });
});
