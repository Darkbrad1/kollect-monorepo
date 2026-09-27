import { describe, expect, test } from "vitest";
import { hostMatches, learnPattern, matchPath, parseChapterNumber } from "./pageMatch";

describe("hostMatches", () => {
  test("the domain itself and its subdomains", () => {
    expect(hostMatches("asurascans.com", "asurascans.com")).toBe(true);
    expect(hostMatches("asurascans.com", "www.AsuraScans.com")).toBe(true);
  });
  test("not a different site that merely ends the same way", () => {
    expect(hostMatches("asurascans.com", "notasurascans.com")).toBe(false);
    expect(hostMatches("asurascans.com", "asurascans.com.evil.com")).toBe(false);
  });
});

describe("matchPath", () => {
  const pattern = "/series/:slug/chapter/:chapter";
  test("a chapter page gives the series and the chapter", () => {
    expect(matchPath(pattern, "/series/Solo-Leveling/chapter/12")).toEqual({
      slug: "solo-leveling",
      chapter: "12",
    });
  });
  test("the series page itself matches without a chapter", () => {
    expect(matchPath(pattern, "/series/solo-leveling")).toEqual({ slug: "solo-leveling" });
    expect(matchPath(pattern, "/series/solo-leveling/")).toEqual({ slug: "solo-leveling" });
  });
  test("other pages don't match", () => {
    expect(matchPath(pattern, "/")).toBeNull();
    expect(matchPath(pattern, "/news/solo-leveling")).toBeNull();
    expect(matchPath(pattern, "/series")).toBeNull();
    expect(matchPath(pattern, "/series/solo-leveling/comments")).toBeNull();
  });
  test("case is kept when the site asks for it", () => {
    expect(matchPath("/read/:slug/:chapter", "/read/B6i-yU/3", true)).toEqual({
      slug: "B6i-yU",
      chapter: "3",
    });
  });
});

describe("parseChapterNumber", () => {
  test.each([
    ["Chapter 12", 12],
    ["Ch. 12.5", 12.5],
    ["chapter-12-5", 12.5],
    ["CHAPTER 40 - The Return", 40],
    ["Episode 7", 7],
    ["153", 153],
    ["ch12", 12],
  ])("%s → %s", (text, number) => {
    expect(parseChapterNumber(text)).toBe(number);
  });
  test("prefers the number after the word chapter", () => {
    expect(parseChapterNumber("Season 2 Chapter 30")).toBe(30);
  });
  test("no number means undefined", () => {
    expect(parseChapterNumber("Prologue")).toBeUndefined();
  });
});

describe("learnPattern", () => {
  test.each([
    ["/comics/the-hero-cannot-rest-05c7df14/chapter/1", "/comics/:slug/chapter/:chapter", "the-hero-cannot-rest-05c7df14", "1"],
    ["/manga/Solo-Leveling/chapter-12", "/manga/:slug/:chapter", "solo-leveling", "chapter-12"],
    ["/read/solo-leveling/12.5", "/read/:slug/:chapter", "solo-leveling", "12.5"],
    ["/solo-leveling/ep/7/", "/:slug/ep/:chapter", "solo-leveling", "7"],
    ["/manga/sl/chapter/3/page/2", "/manga/:slug/chapter/:chapter", "sl", "3"],
  ])("%s → %s", (path, pattern, slug, chapter) => {
    expect(learnPattern(path)).toEqual({ pattern, slug, chapter });
  });

  test("the pattern it learns reads the same address back", () => {
    const learned = learnPattern("/comics/the-hero-05c7df14/chapter/1")!;
    expect(matchPath(learned.pattern, "/comics/other-series-11aa22bb/chapter/40")).toEqual({
      slug: "other-series-11aa22bb",
      chapter: "40",
    });
    expect(matchPath(learned.pattern, "/comics/other-series-11aa22bb")).toEqual({ slug: "other-series-11aa22bb" });
  });

  test.each(["/", "/series/solo-leveling", "/solo-leveling-chapter-12", "/12", "/watch"])(
    "%s isn't a chapter address it can learn from",
    (path) => {
      expect(learnPattern(path)).toBeNull();
    },
  );
});
