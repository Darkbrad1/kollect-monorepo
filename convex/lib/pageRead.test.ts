import { describe, expect, test } from "vitest";
import { cleanTitle, readPage, siteForUrl, type PageSource, type SiteRules } from "./pageRead";

const site: SiteRules = {
  domain: "asurascans.com",
  title: "Asura Scans",
  slugPattern: "/comics/:slug/chapter/:chapter",
  caseSensitive: false,
};

/** A made-up page. */
function page(url: string, opts: Partial<{ title: string; meta: Record<string, string>; text: Record<string, string>; data: unknown }> = {}): PageSource {
  return {
    url,
    documentTitle: opts.title ?? "",
    meta: (name) => opts.meta?.[name],
    text: (selector) => opts.text?.[selector],
    link: () => undefined,
    data: () => opts.data,
  };
}

describe("readPage", () => {
  test("a chapter page", () => {
    const info = readPage(
      site,
      page("https://asurascans.com/comics/solo-leveling/chapter/12?ref=home", {
        meta: { "og:title": "Solo Leveling Chapter 12 - Asura Scans", "og:image": "https://asurascans.com/cover.webp" },
      }),
    );
    expect(info).toEqual({
      domain: "asurascans.com",
      url: "https://asurascans.com/comics/solo-leveling/chapter/12",
      slug: "solo-leveling",
      title: "Solo Leveling",
      image: "https://asurascans.com/cover.webp",
      seriesUrl: "https://asurascans.com/comics/solo-leveling",
      chapter: { number: 12, label: "Chapter 12" },
    });
  });

  test("a real Asura address, with the code on the end of the series name", () => {
    const info = readPage(
      site,
      page("https://asurascans.com/comics/the-hero-cannot-rest-05c7df14/chapter/1", {
        meta: { "og:title": "The Hero Cannot Rest Chapter 1 - Asura Scans" },
      }),
    );
    expect(info).toMatchObject({
      slug: "the-hero-cannot-rest-05c7df14",
      title: "The Hero Cannot Rest",
      seriesUrl: "https://asurascans.com/comics/the-hero-cannot-rest-05c7df14",
      chapter: { number: 1, label: "Chapter 1" },
    });
  });

  test("a series page has no chapter", () => {
    const info = readPage(site, page("https://www.asurascans.com/comics/solo-leveling/", { title: "Solo Leveling | Asura Scans" }));
    expect(info).toMatchObject({ title: "Solo Leveling", slug: "solo-leveling", seriesUrl: "https://www.asurascans.com/comics/solo-leveling" });
    expect(info!.chapter).toBeUndefined();
  });

  test("other pages aren't manga pages", () => {
    expect(readPage(site, page("https://asurascans.com/", { title: "Asura Scans" }))).toBeNull();
    expect(readPage(site, page("https://example.com/comics/x/chapter/1", { title: "X" }))).toBeNull();
  });

  test("selectors and embedded data win over og:title", () => {
    const rules = { ...site, titleSelector: "h1", chapterPath: "props.chapter.name" };
    const info = readPage(
      rules,
      page("https://asurascans.com/comics/sl/chapter/5", {
        meta: { "og:title": "Wrong" },
        text: { h1: "Solo Leveling" },
        data: { props: { chapter: { name: "Chapter 5.5 - Extra" } } },
      }),
    );
    expect(info).toMatchObject({ title: "Solo Leveling", chapter: { number: 5.5, label: "Chapter 5.5 - Extra" } });
  });

  test("a chapter with no number isn't tracked", () => {
    const info = readPage(site, page("https://asurascans.com/comics/sl/chapter/prologue", { title: "Solo Leveling" }));
    expect(info!.chapter).toBeUndefined();
  });
});

describe("cleanTitle", () => {
  test.each([
    ["Solo Leveling - Asura Scans", "Solo Leveling"],
    ["Asura Scans | Solo Leveling", "Solo Leveling"],
    ["Solo Leveling Chapter 12", "Solo Leveling"],
    ["Solo Leveling, Ch. 12 – Asura Scans", "Solo Leveling"],
    ["  Omniscient   Reader's Viewpoint ", "Omniscient Reader's Viewpoint"],
  ])("%s → %s", (raw, clean) => {
    expect(cleanTitle(raw, "Asura Scans")).toBe(clean);
  });
});

test("siteForUrl finds the site by address", () => {
  expect(siteForUrl([site], "https://www.asurascans.com/x")?.domain).toBe("asurascans.com");
  expect(siteForUrl([site], "https://example.com/")).toBeUndefined();
});
