/* Reads MangaDex's answers into what Kollect keeps. Plain code with no
   network access, so it can be tested with made-up answers. The
   fetching is in convex/mangadex.ts.

   API docs: https://api.mangadex.org/docs/ */

export const MANGADEX_API = "https://api.mangadex.org";

type LocalizedString = Record<string, string>;

/** The parts of a MangaDex manga Kollect reads. */
export type MangaDexManga = {
  id: string;
  attributes: {
    title: LocalizedString;
    altTitles: LocalizedString[];
    originalLanguage: string;
    status?: string | null;
    lastChapter?: string | null;
  };
  relationships: { type: string; attributes?: { fileName?: string } }[];
};

/** /manga/{id}/aggregate: every chapter, grouped by volume. */
export type MangaDexAggregate = {
  volumes?: Record<string, { chapters?: Record<string, { chapter: string }> }>;
};

export type MangaDexDetails = {
  mangadexId: string;
  altTitles: string[];
  cover?: string;
  status?: "ongoing" | "hiatus" | "completed" | "cancelled";
  latestChapter?: number;
};

/**
 * Keeps the titles reading websites actually use: English, titles
 * written in the Latin alphabet ("ja-ro", "ko-ro", "zh-ro"), and the
 * title in the series' original language.
 */
function keepTitle(lang: string, original: string): boolean {
  return lang === "en" || lang.endsWith("-ro") || lang === original;
}

export function parseMangaDex(manga: MangaDexManga, aggregate: MangaDexAggregate | null): MangaDexDetails {
  const { attributes } = manga;
  const titles: string[] = [];
  for (const entry of [attributes.title, ...attributes.altTitles]) {
    for (const [lang, text] of Object.entries(entry)) {
      const clean = text.trim();
      if (clean !== "" && keepTitle(lang, attributes.originalLanguage) && !titles.includes(clean)) titles.push(clean);
    }
  }

  // The 512px thumbnail: big enough for a card, much smaller than the original.
  const fileName = manga.relationships.find((r) => r.type === "cover_art")?.attributes?.fileName;
  const cover = fileName ? `https://uploads.mangadex.org/covers/${manga.id}/${fileName}.512.jpg` : undefined;

  const status =
    attributes.status === "ongoing" ||
    attributes.status === "hiatus" ||
    attributes.status === "completed" ||
    attributes.status === "cancelled"
      ? attributes.status
      : undefined;

  // The highest chapter number MangaDex lists, or the series' last
  // chapter when it has ended, whichever is higher.
  let latest = parseChapter(attributes.lastChapter);
  for (const volume of Object.values(aggregate?.volumes ?? {})) {
    for (const chapter of Object.values(volume.chapters ?? {})) {
      const number = parseChapter(chapter.chapter);
      if (number !== undefined && (latest === undefined || number > latest)) latest = number;
    }
  }

  return { mangadexId: manga.id, altTitles: titles, cover, status, latestChapter: latest };
}

function parseChapter(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}
