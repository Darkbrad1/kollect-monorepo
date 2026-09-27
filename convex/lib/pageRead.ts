import type { Doc } from "../_generated/dataModel";
import { hostMatches, matchPath, parseChapterNumber } from "./pageMatch";

/* Reads a reading-website page into what Kollect needs: which series,
   which chapter, the title and cover. Plain code with no browser or
   database access: the extension hands it the page through a
   PageSource, so the rules can be tested here with made-up pages. */

export type SiteRules = Pick<
  Doc<"sites">,
  | "domain"
  | "title"
  | "slugPattern"
  | "caseSensitive"
  | "titlePath"
  | "titleSelector"
  | "chapterPath"
  | "chapterSelector"
  | "seriesLinkSelector"
>;

/** How the page is read. The extension backs this with the real page. */
export type PageSource = {
  /** The full address, e.g. "https://asuracomic.net/series/x/chapter/3". */
  url: string;
  /** The page's <title>. */
  documentTitle: string;
  /** A <meta property|name="..."> value, e.g. meta("og:title"). */
  meta(name: string): string | undefined;
  /** The text of the first element matching a CSS selector. */
  text(selector: string): string | undefined;
  /** The link (href) of the first element matching a CSS selector. */
  link(selector: string): string | undefined;
  /** Data the site embeds in the page (such as Next.js's __NEXT_DATA__). */
  data(): unknown;
};

/** What the server's reading functions take (see convex/reading.ts). */
export type PageInfo = {
  domain: string;
  url: string;
  slug?: string;
  title: string;
  image?: string;
  seriesUrl?: string;
  chapter?: { number: number; label: string };
};

/** The site a page belongs to, if Kollect supports it. */
export function siteForUrl<T extends { domain: string }>(sites: T[], url: string): T | undefined {
  const hostname = new URL(url).hostname;
  return sites.find((site) => hostMatches(site.domain, hostname));
}

/**
 * Reads a page. Returns null when it isn't a series or chapter page
 * (the home page, a search page) or no title can be found.
 */
export function readPage(site: SiteRules, source: PageSource): PageInfo | null {
  const url = new URL(source.url);
  if (!hostMatches(site.domain, url.hostname)) return null;
  if (site.slugPattern === undefined) return null;

  const match = matchPath(site.slugPattern, url.pathname, site.caseSensitive);
  if (match === null) return null;

  const rawTitle =
    fromPath(source.data(), site.titlePath) ??
    (site.titleSelector ? source.text(site.titleSelector) : undefined) ??
    source.meta("og:title") ??
    source.documentTitle;
  const title = cleanTitle(rawTitle ?? "", site.title);
  if (title === "") return null;

  let chapter: PageInfo["chapter"];
  const chapterText =
    fromPath(source.data(), site.chapterPath) ??
    (site.chapterSelector ? source.text(site.chapterSelector) : undefined) ??
    match.chapter;
  if (match.chapter !== undefined && chapterText !== undefined) {
    const number = parseChapterNumber(chapterText) ?? parseChapterNumber(match.chapter);
    if (number !== undefined) {
      const text = chapterText.trim();
      // A bare number from the address reads better as "Chapter 12".
      chapter = { number, label: /^[\d.\-_]+$/.test(text) ? `Chapter ${number}` : text };
    }
  }

  const image = source.meta("og:image");
  const seriesUrl =
    match.chapter === undefined
      ? url.origin + url.pathname.replace(/\/$/, "")
      : ((site.seriesLinkSelector ? source.link(site.seriesLinkSelector) : undefined) ??
        seriesUrlFromPattern(site.slugPattern, url));

  return {
    domain: site.domain,
    url: url.origin + url.pathname,
    slug: match.slug,
    title,
    image: image || undefined,
    seriesUrl: seriesUrl ? new URL(seriesUrl, url).href : undefined,
    chapter,
  };
}

/** The address cut off after the :slug part: the series' own page. */
function seriesUrlFromPattern(pattern: string, url: URL): string | undefined {
  const want = pattern.split("/").filter(Boolean);
  const have = url.pathname.split("/").filter(Boolean);
  const slugAt = want.indexOf(":slug");
  if (slugAt === -1 || have.length <= slugAt) return undefined;
  return `${url.origin}/${have.slice(0, slugAt + 1).join("/")}`;
}

/** Follows a dotted path like "props.pageProps.series.title". */
function fromPath(data: unknown, path: string | undefined): string | undefined {
  if (path === undefined || data === undefined || data === null) return undefined;
  let here: unknown = data;
  for (const key of path.split(".")) {
    if (here === null || typeof here !== "object") return undefined;
    here = (here as Record<string, unknown>)[key];
  }
  return typeof here === "string" || typeof here === "number" ? String(here) : undefined;
}

/**
 * Tidies a title taken from the page: drops the site's name
 * ("Solo Leveling - Asura Scans") and any chapter part
 * ("Solo Leveling Chapter 12").
 */
export function cleanTitle(raw: string, siteTitle: string): string {
  let title = raw.replace(/\s+/g, " ").trim();
  const site = siteTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  title = title.replace(new RegExp(`\\s*[-|–—:]\\s*${site}.*$`, "i"), "");
  title = title.replace(new RegExp(`^${site}\\s*[-|–—:]\\s*`, "i"), "");
  title = title.replace(/\s*[-|–—:,]?\s*\b(?:chapter|ch\.?|episode|ep\.?)\s*\d.*$/i, "");
  return title.trim();
}
