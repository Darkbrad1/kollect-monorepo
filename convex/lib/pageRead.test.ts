import { describe, expect, test } from "vitest";
import { cleanTitle, guessPage, readPage, siteForUrl, type PageSource, type SiteRules } from "./pageRead";

const site: SiteRules = {
  domain: "asurascans.com",
  title: "Asura Scans",
  slugPattern: "/comics/:slug/chapter/:chapter",
  caseSensitive: false,
};

/** A made-up page. */
function page(url: string, opts: Partial<{ title: string; meta: Record<string, string>; text: Record<string, string>; links: Record<string, string>; data: unknown }> = {}): PageSource {
  return {
    url,
    documentTitle: opts.title ?? "",
    meta: (name) => opts.meta?.[name],
    text: (selector) => opts.text?.[selector],
    link: (selector) => opts.links?.[selector],
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

describe("guessPage (a website Kollect doesn't know)", () => {
  test("learns the address shape and reads the page", () => {
    const guess = guessPage(
      page("https://www.flamecomics.xyz/series/omniscient-reader/chapter-201", {
        meta: { "og:site_name": "Flame Comics", "og:title": "Omniscient Reader Chapter 201 | Flame Comics" },
        links: { 'link[rel~="icon"]': "https://flamecomics.xyz/icon.png" },
      }),
    );
    expect(guess).toEqual({
      slugPattern: "/series/:slug/:chapter",
      siteName: "Flame Comics",
      icon: "https://flamecomics.xyz/icon.png",
      page: {
        domain: "flamecomics.xyz",
        url: "https://www.flamecomics.xyz/series/omniscient-reader/chapter-201",
        slug: "omniscient-reader",
        title: "Omniscient Reader",
        seriesUrl: "https://www.flamecomics.xyz/series/omniscient-reader",
        chapter: { number: 201, label: "Chapter 201" },
      },
    });
  });

  test("names the site after its address when the page doesn't say", () => {
    const guess = guessPage(page("https://reaperscans.com/read/tower/3", { title: "Tower of God" }));
    expect(guess).toMatchObject({ siteName: "Reaperscans", page: { title: "Tower of God", chapter: { number: 3 } } });
  });

  test("leaves the title empty for the user when the page has none", () => {
    expect(guessPage(page("https://x.com/read/tower/3"))!.page.title).toBe("");
  });

  test("a site with series and chapter in one part", () => {
    const guess = guessPage(
      page("https://manhuaplus.org/solo-leveling-chapter-12/", { meta: { "og:title": "Solo Leveling Chapter 12" } }),
    );
    expect(guess).toMatchObject({
      slugPattern: "/:slug-chapter-:chapter",
      page: { slug: "solo-leveling", title: "Solo Leveling", chapter: { number: 12 } },
    });
    expect(guess!.page.seriesUrl).toBeUndefined();
  });

  test("a site that uses a code for the chapter takes the number from the title", () => {
    const guess = guessPage(
      page("https://flamecomics.xyz/series/omniscient-reader/a8f3c91e", {
        meta: { "og:title": "Omniscient Reader Chapter 201 - Flame Comics", "og:site_name": "Flame Comics" },
      }),
    );
    expect(guess).toMatchObject({
      slugPattern: "/series/:slug/:chapter",
      page: { slug: "omniscient-reader", title: "Omniscient Reader", chapter: { number: 201, label: "Chapter 201" } },
    });
  });

  test("not on pages that aren't chapters", () => {
    expect(guessPage(page("https://www.google.com/search"))).toBeNull();
    expect(guessPage(page("https://flamecomics.xyz/series/omniscient-reader"))).toBeNull();
  });
});
