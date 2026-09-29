import type { Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { sortRule } from "./validators";

/* ═══════════════════════════════════════════════════════════════
   SORTING

   Like filtering, sorting happens in the extension. This file is
   plain code with no database access, so the extension can import it
   and the rules live in one place.

   Rules:
   - The first sort row decides the order; each later row only breaks
     ties left by the ones before it.
   - A manga with no value for a field (never read, latest chapter not
     known yet, no source) goes to the end, whichever direction you
     pick, so blanks never crowd the top of the page.
   - If every row ties, manga keep the order the page loader gave
     them (newest addition first).
   ═══════════════════════════════════════════════════════════════ */

export type SortRule = Infer<typeof sortRule>;

type Item = { userManga: Doc<"userMangas">; manga: Doc<"mangas"> };

function valueFor(
  item: Item,
  field: SortRule["field"],
  siteTitleById: ReadonlyMap<Id<"sites">, string>,
): number | string | undefined {
  switch (field) {
    case "lastRead":
      return item.userManga.lastReadAt;
    case "dateAdded":
      return item.userManga.addedAt;
    case "lastReadChapter":
      return item.userManga.currentChapterNumber;
    case "latestChapter":
      return item.manga.latestChapter;
    case "source": {
      const siteId = item.userManga.currentSiteId;
      return siteId === undefined ? undefined : siteTitleById.get(siteId)?.toLowerCase();
    }
    case "title":
      return (item.userManga.customTitle ?? item.manga.title).toLowerCase();
  }
}

function compareValues(a: number | string, b: number | string): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

/**
 * Returns the items in sorted order. `siteTitleById` maps site ids to
 * names for the Sources sort; build it from the sites.list query.
 */
export function sortMangas<T extends Item>(
  items: readonly T[],
  rules: readonly SortRule[],
  siteTitleById: ReadonlyMap<Id<"sites">, string> = new Map(),
): T[] {
  return [...items].sort((x, y) => {
    for (const rule of rules) {
      const a = valueFor(x, rule.field, siteTitleById);
      const b = valueFor(y, rule.field, siteTitleById);
      if (a === undefined && b === undefined) continue;
      if (a === undefined) return 1; // blanks last, either direction
      if (b === undefined) return -1;
      const result = compareValues(a, b);
      if (result !== 0) return rule.direction === "asc" ? result : -result;
    }
    return 0;
  });
}
