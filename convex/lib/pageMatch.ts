/* Plain helpers for recognising a reading page from its web address.
   No database access, so the extension uses the exact same rules as
   the server. */

/** True when a page's hostname belongs to a site's domain, including
    subdomains: "www.asurascans.com" belongs to "asurascans.com". */
export function hostMatches(domain: string, hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  const site = domain.toLowerCase();
  return host === site || host.endsWith(`.${site}`);
}

export type PathMatch = {
  /** The part of the address that identifies the series, if the pattern has :slug. */
  slug?: string;
  /** The chapter part of the address, if this is a chapter page. */
  chapter?: string;
};

/**
 * Matches a page's path against a site's pattern, such as
 * "/series/:slug/chapter/:chapter". A path that stops right after
 * :slug ("/series/solo-leveling") is that series' own page, so it
 * matches with no chapter. Returns null when the path doesn't fit.
 *
 * One part can also hold both, for sites like
 * "/solo-leveling-chapter-12": the pattern "/:slug-chapter-:chapter".
 */
export function matchPath(
  pattern: string,
  pathname: string,
  caseSensitive = false,
): PathMatch | null {
  const want = pattern.split("/").filter(Boolean);
  const have = pathname.split("/").filter(Boolean);
  const result: PathMatch = {};

  for (let i = 0; i < want.length; i++) {
    const part = want[i];
    const value = have[i];
    if (value === undefined) {
      // Ran out of path: fine only if the series was already found and
      // nothing but the chapter part is missing.
      return result.slug !== undefined && result.chapter === undefined ? result : null;
    }
    const decoded = safeDecode(value);
    if (part === ":slug") {
      result.slug = caseSensitive ? decoded : decoded.toLowerCase();
    } else if (part === ":chapter") {
      result.chapter = decoded;
    } else if (part.includes(":slug") || part.includes(":chapter")) {
      const found = templateRegex(part).exec(decoded);
      if (!found?.groups) return null;
      if (found.groups.slug !== undefined) {
        result.slug = caseSensitive ? found.groups.slug : found.groups.slug.toLowerCase();
      }
      if (found.groups.chapter !== undefined) result.chapter = found.groups.chapter;
    } else if (part.toLowerCase() !== decoded.toLowerCase()) {
      return null;
    }
  }
  // Extra segments after the pattern (like "/page/2") are allowed.
  return result;
}

/** ":slug-chapter-:chapter" → /^(?<slug>.+?)-chapter-(?<chapter>.+)$/i */
function templateRegex(part: string): RegExp {
  const pieces = part.split(/(:slug|:chapter)/).map((piece) => {
    if (piece === ":slug") return "(?<slug>.+?)";
    if (piece === ":chapter") return "(?<chapter>.+)";
    return piece.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  });
  return new RegExp(`^${pieces.join("")}$`, "i");
}

function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/**
 * Pulls a chapter number out of text such as "Chapter 12.5",
 * "Ch. 12", "chapter-12-5" or "12". Returns undefined when there's no
 * number, for example "Extra" or "Prologue".
 */
export function parseChapterNumber(text: string): number | undefined {
  // Prefer a number right after the word chapter / ch / ep.
  const labelled = /\b(?:chapter|chap|ch|episode|ep)(?![a-z])[\s.\-_#:]*(\d+(?:[.\-_]\d+)?)/i.exec(text);
  const match = labelled ?? /(\d+(?:[.\-_]\d+)?)/.exec(text);
  if (!match) return undefined;
  const number = Number(match[1].replace(/[-_]/, "."));
  return Number.isFinite(number) ? number : undefined;
}

/** A chapter number only when the text says it's one: "Chapter 12",
    "Ch. 12", "Episode 7". Unlike parseChapterNumber, a stray number
    ("Top 10 Manga") doesn't count. */
export function labelledChapterNumber(text: string): number | undefined {
  const found = /\b(?:chapter|chap|ch|episode|ep)(?![a-z])[\s.\-_#:]*(\d+(?:[.\-_]\d+)?)/i.exec(text);
  if (!found) return undefined;
  const number = Number(found[1].replace(/[-_]/, "."));
  return Number.isFinite(number) ? number : undefined;
}

const CHAPTER_WORD = /^(?:chapter|chap|ch|c|episode|ep|e)$/i;
const CHAPTER_SEGMENT = /^(?:(?:chapter|chap|ch|episode|ep)[\s.\-_]*)?\d+(?:[.\-_]\d+)?$/i;
const SERIES_AND_CHAPTER = /^(.+?)([-_](?:chapter|chap|ch|episode|ep)[-_]?)(\d+(?:[.\-_]\d+)?)$/i;

/** True when an address part is a chapter number, like "12", "12.5" or "chapter-12". */
export function isChapterPart(text: string): boolean {
  return CHAPTER_SEGMENT.test(text);
}

/**
 * Works out a website's address pattern from one chapter address, for a
 * site Kollect doesn't know yet:
 *
 *   /comics/the-hero-05c7df14/chapter/1  →  /comics/:slug/chapter/:chapter
 *   /manga/solo-leveling/chapter-12      →  /manga/:slug/:chapter
 *   /read/solo-leveling/12               →  /read/:slug/:chapter
 *
 * The chapter is the last part marked as one ("chapter/12", "chapter-12"),
 * or failing that the last number; the series is the part before it
 * (skipping a lone "chapter"). Two more shapes are understood:
 *
 *   /solo-leveling-chapter-12            →  /:slug-chapter-:chapter
 *   /series/omniscient-reader/a8f3c91e   →  /series/:slug/:chapter
 *     (a code instead of a number: only when `pageTitle` names the
 *     chapter, e.g. "Omniscient Reader Chapter 201", which is then
 *     where the number comes from)
 *
 * Returns null when the address doesn't look like a chapter page.
 */
export function learnPattern(
  pathname: string,
  pageTitle = "",
): { pattern: string; slug: string; chapter: string } | null {
  const parts = pathname.split("/").filter(Boolean).map(safeDecode);
  const titleNumber = labelledChapterNumber(pageTitle);
  const agreesWithTitle = (learned: { chapter: string } | null) =>
    learned !== null && (titleNumber === undefined || parseChapterNumber(learned.chapter) === titleNumber);

  const separate = learnSeparateParts(parts);
  if (agreesWithTitle(separate)) return separate;
  const combined = learnCombinedPart(parts);
  if (agreesWithTitle(combined)) return combined;
  // The number in the address isn't the chapter the title names (it may be
  // a series number, as in "/series/2/a8f3c91e"): the chapter is a code.
  if (titleNumber !== undefined) return learnChapterCode(parts);
  return separate ?? combined;
}

/** "/comics/solo-leveling/chapter/12", "/read/solo-leveling/12" */
function learnSeparateParts(parts: string[]) {
  // Prefer a number marked as a chapter ("chapter/3", "chapter-3"), so a
  // page number after it ("/chapter/3/page/2") isn't mistaken for it;
  // otherwise take the last bare number.
  const isNumber = (i: number) => CHAPTER_SEGMENT.test(parts[i]);
  const isMarked = (i: number) =>
    isNumber(i) && (/^[a-z]/i.test(parts[i]) || (i > 0 && CHAPTER_WORD.test(parts[i - 1])));
  let chapterAt = -1;
  for (let i = parts.length - 1; i >= 0 && chapterAt === -1; i--) if (isMarked(i)) chapterAt = i;
  for (let i = parts.length - 1; i >= 0 && chapterAt === -1; i--) if (isNumber(i)) chapterAt = i;
  if (chapterAt === -1) return null;

  const hasWord = chapterAt > 0 && CHAPTER_WORD.test(parts[chapterAt - 1]);
  const slugAt = hasWord ? chapterAt - 2 : chapterAt - 1;
  if (slugAt < 0) return null;

  const pattern = [
    ...parts.slice(0, slugAt),
    ":slug",
    ...(hasWord ? [parts[chapterAt - 1]] : []),
    ":chapter",
  ];
  return {
    pattern: `/${pattern.join("/")}`,
    slug: parts[slugAt].toLowerCase(),
    chapter: parts[chapterAt],
  };
}

/** "/solo-leveling-chapter-12": series and chapter in one part. */
function learnCombinedPart(parts: string[]) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const found = SERIES_AND_CHAPTER.exec(parts[i]);
    if (!found) continue;
    const pattern = [...parts.slice(0, i), `:slug${found[2].toLowerCase()}:chapter`];
    return { pattern: `/${pattern.join("/")}`, slug: found[1].toLowerCase(), chapter: found[3] };
  }
  return null;
}

/** "/series/omniscient-reader/a8f3c91e": the last part names the chapter
    with a code; the part before it is the series. */
function learnChapterCode(parts: string[]) {
  if (parts.length < 2) return null;
  const slugAt = parts.length - 2;
  const pattern = [...parts.slice(0, slugAt), ":slug", ":chapter"];
  return { pattern: `/${pattern.join("/")}`, slug: parts[slugAt].toLowerCase(), chapter: parts[slugAt + 1] };
}
