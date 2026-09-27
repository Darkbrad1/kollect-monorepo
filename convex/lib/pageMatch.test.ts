import { describe, expect, test } from "vitest";
import { hostMatches, matchPath, parseChapterNumber } from "./pageMatch";

describe("hostMatches", () => {
  test("the domain itself and its subdomains", () => {
    expect(hostMatches("asuracomic.net", "asuracomic.net")).toBe(true);
    expect(hostMatches("asuracomic.net", "www.AsuraComic.net")).toBe(true);
  });
  test("not a different site that merely ends the same way", () => {
    expect(hostMatches("asuracomic.net", "notasuracomic.net")).toBe(false);
    expect(hostMatches("asuracomic.net", "asuracomic.net.evil.com")).toBe(false);
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
