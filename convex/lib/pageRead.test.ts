import { describe, expect, test } from "vitest";
import { cleanTitle, readPage, siteForUrl, type PageSource, type SiteRules } from "./pageRead";

const site: SiteRules = {
  domain: "asuracomic.net",
  title: "Asura Scans",
  slugPattern: "/series/:slug/chapter/:chapter",
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
      page("https://asuracomic.net/series/solo-leveling/chapter/12?ref=home", {
        meta: { "og:title": "Solo Leveling Chapter 12 - Asura Scans", "og:image": "https://asuracomic.net/cover.webp" },
      }),
    );
    expect(info).toEqual({
      domain: "asuracomic.net",
      url: "https://asuracomic.net/series/solo-leveling/chapter/12",
      slug: "solo-leveling",
      title: "Solo Leveling",
      image: "https://asuracomic.net/cover.webp",
      seriesUrl: "https://asuracomic.net/series/solo-leveling",
      chapter: { number: 12, label: "Chapter 12" },
    });
  });

  test("a series page has no chapter", () => {
    const info = readPage(site, page("https://www.asuracomic.net/series/solo-leveling/", { title: "Solo Leveling | Asura Scans" }));
    expect(info).toMatchObject({ title: "Solo Leveling", slug: "solo-leveling", seriesUrl: "https://www.asuracomic.net/series/solo-leveling" });
    expect(info!.chapter).toBeUndefined();
  });

  test("other pages aren't manga pages", () => {
    expect(readPage(site, page("https://asuracomic.net/", { title: "Asura Scans" }))).toBeNull();
    expect(readPage(site, page("https://example.com/series/x/chapter/1", { title: "X" }))).toBeNull();
  });

  test("selectors and embedded data win over og:title", () => {
    const rules = { ...site, titleSelector: "h1", chapterPath: "props.chapter.name" };
    const info = readPage(
      rules,
      page("https://asuracomic.net/series/sl/chapter/5", {
        meta: { "og:title": "Wrong" },
        text: { h1: "Solo Leveling" },
        data: { props: { chapter: { name: "Chapter 5.5 - Extra" } } },
      }),
    );
    expect(info).toMatchObject({ title: "Solo Leveling", chapter: { number: 5.5, label: "Chapter 5.5 - Extra" } });
  });

  test("a chapter with no number isn't tracked", () => {
    const info = readPage(site, page("https://asuracomic.net/series/sl/chapter/prologue", { title: "Solo Leveling" }));
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
  expect(siteForUrl([site], "https://www.asuracomic.net/x")?.domain).toBe("asuracomic.net");
  expect(siteForUrl([site], "https://example.com/")).toBeUndefined();
});
