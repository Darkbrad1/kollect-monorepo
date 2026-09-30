import { describe, expect, test } from "vitest";
import { parseMangaDex, type MangaDexManga } from "./mangadex";

const soloLeveling: MangaDexManga = {
  id: "32d76d19",
  attributes: {
    title: { en: "Solo Leveling" },
    altTitles: [
      { ko: "나 혼자만 레벨업" },
      { "ko-ro": "Na Honjaman Level Up" },
      { en: "Only I Level Up" },
      { ru: "Поднятие уровня в одиночку" },
      { ja: "俺だけレベルアップな件" },
    ],
    originalLanguage: "ko",
    status: "completed",
    lastChapter: "179",
  },
  relationships: [{ type: "author" }, { type: "cover_art", attributes: { fileName: "cover.jpg" } }],
};

describe("reading a MangaDex manga", () => {
  test("keeps English, Latin-alphabet and original-language titles", () => {
    expect(parseMangaDex(soloLeveling, null).altTitles).toEqual([
      "Solo Leveling",
      "나 혼자만 레벨업",
      "Na Honjaman Level Up",
      "Only I Level Up",
    ]);
  });

  test("builds the cover address and reads the status", () => {
    const details = parseMangaDex(soloLeveling, null);
    expect(details.cover).toBe("https://uploads.mangadex.org/covers/32d76d19/cover.jpg.512.jpg");
    expect(details.status).toBe("completed");
  });

  test("the latest chapter is the highest listed, or the last chapter", () => {
    const aggregate = {
      volumes: {
        "1": { chapters: { "1": { chapter: "1" }, "2": { chapter: "2" } } },
        none: { chapters: { "200.5": { chapter: "200.5" }, extra: { chapter: "Extra" } } },
      },
    };
    expect(parseMangaDex(soloLeveling, aggregate).latestChapter).toBe(200.5);
    expect(parseMangaDex(soloLeveling, { volumes: {} }).latestChapter).toBe(179);
    const noLast = { ...soloLeveling, attributes: { ...soloLeveling.attributes, lastChapter: "" } };
    expect(parseMangaDex(noLast, null).latestChapter).toBeUndefined();
  });
});

describe("a search result", () => {
  test("says the type from the original language, with year, status and a small cover", async () => {
    const { summarize } = await import("./mangadex");
    const result = summarize({ ...soloLeveling, attributes: { ...soloLeveling.attributes, year: 2018 } });
    expect(result).toEqual({
      mangadexId: "32d76d19",
      title: "Solo Leveling",
      cover: "https://uploads.mangadex.org/covers/32d76d19/cover.jpg.256.jpg",
      type: "manhwa",
      year: 2018,
      status: "completed",
    });
  });
});
