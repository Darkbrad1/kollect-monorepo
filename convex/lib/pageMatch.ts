/* Plain helpers for recognising a reading page from its web address.
   No database access, so the extension uses the exact same rules as
   the server. */

/** True when a page's hostname belongs to a site's domain, including
    subdomains: "www.asuracomic.net" belongs to "asuracomic.net". */
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
    } else if (part.toLowerCase() !== decoded.toLowerCase()) {
      return null;
    }
  }
  // Extra segments after the pattern (like "/page/2") are allowed.
  return result;
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
