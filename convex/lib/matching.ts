import type { Doc } from "../_generated/dataModel";
import { normalizeTitle } from "./titles";

/* How Kollect decides that a title on a page might be a manga it already
   has. Plain code, so the rules can be tested on their own.

   - Exact: the titles are the same once normalized (see normalizeTitle).
   - Close: one title contains the other ("Solo Leveling" and "Solo
     Leveling Manhwa"), or they share most of their words ("The Hero
     Cannot Rest" and "Hero Cannot Rest Anymore").

   Both check a manga's alternative titles as well as its main one. */

/** Every name a manga is known by, normalized. */
export function namesOf(manga: Pick<Doc<"mangas">, "normalizedTitle" | "altTitles">): string[] {
  const names = [manga.normalizedTitle, ...manga.altTitles.map(normalizeTitle)];
  return [...new Set(names.filter((n) => n !== ""))];
}

/** Whether two normalized titles are close. Exact matches count too. */
export function isCloseTitle(a: string, b: string): boolean {
  if (a === "" || b === "") return false;
  if (a === b) return true;
  // One contains the other, as whole words.
  if (` ${a} `.includes(` ${b} `) || ` ${b} `.includes(` ${a} `)) return true;
  // They share most of their words: more than half of the longer one's.
  const wordsA = new Set(a.split(" "));
  const wordsB = new Set(b.split(" "));
  let shared = 0;
  for (const word of wordsA) if (wordsB.has(word)) shared++;
  return shared > Math.max(wordsA.size, wordsB.size) / 2;
}

/** How a page title compares with a manga: the same, close, or neither. */
export function compareTitle(
  title: string,
  manga: Pick<Doc<"mangas">, "normalizedTitle" | "altTitles">,
): "exact" | "close" | null {
  const wanted = normalizeTitle(title);
  const names = namesOf(manga);
  if (names.includes(wanted)) return "exact";
  if (names.some((name) => isCloseTitle(wanted, name))) return "close";
  return null;
}
