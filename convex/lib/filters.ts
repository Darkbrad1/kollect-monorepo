import type { Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { DAY_MS } from "./constants";
import type { filterRule } from "./validators";

/* ═══════════════════════════════════════════════════════════════
   FILTER MATCHING

   Filtering happens in the extension, not in Convex: the page
   loader returns every manga on a page along with the page's saved
   filters, and the extension keeps the ones that match. This file
   is plain TypeScript with no database access, so the extension can
   import it directly and the rules live in one place.

   Rules:
   - Every filter on a page must match (they combine with AND).
   - "between" includes both ends, and works whichever box holds the
     bigger number.
   - A manga with no value for a field (never read, latest chapter
     not known yet) matches no filter on that field.
   ═══════════════════════════════════════════════════════════════ */

export type FilterRule = Infer<typeof filterRule>;

/** The facts about one manga that filters look at. */
export type FilterableManga = {
  lastReadChapter?: number;
  latestChapter?: number;
  addedAt: number;
  currentSiteId?: Id<"sites">;
  // Sites in this manga's reading history.
  readSiteIds: readonly Id<"sites">[];
};

/** Builds the filter input from what the page loader returns. */
export function toFilterable(item: {
  userManga: Doc<"userMangas">;
  manga: Doc<"mangas">;
}): FilterableManga {
  return {
    lastReadChapter: item.userManga.currentChapterNumber,
    latestChapter: item.manga.latestChapter,
    addedAt: item.userManga.addedAt,
    currentSiteId: item.userManga.currentSiteId,
    readSiteIds: item.userManga.readSiteIds ?? [],
  };
}

function compare(
  actual: number | undefined,
  rule: { op: "greaterThan" | "equal" | "lessThan"; value: number } | { op: "between"; min: number; max: number },
): boolean {
  if (actual === undefined) return false;
  switch (rule.op) {
    case "greaterThan":
      return actual > rule.value;
    case "equal":
      return actual === rule.value;
    case "lessThan":
      return actual < rule.value;
    case "between": {
      const low = Math.min(rule.min, rule.max);
      const high = Math.max(rule.min, rule.max);
      return actual >= low && actual <= high;
    }
  }
}

export function matchesFilter(
  manga: FilterableManga,
  rule: FilterRule,
  now: number,
): boolean {
  switch (rule.field) {
    case "lastReadChapter":
      return compare(manga.lastReadChapter, rule);
    case "latestChapter":
      return compare(manga.latestChapter, rule);
    case "dateAdded":
      return compare((now - manga.addedAt) / DAY_MS, rule);
    case "source":
      // equal: the site you're reading it on now.
      // contains: a site you've read it on at some point. The current
      // site counts too — you're reading it there.
      return rule.op === "equal"
        ? manga.currentSiteId === rule.siteId
        : manga.currentSiteId === rule.siteId ||
            manga.readSiteIds.includes(rule.siteId);
  }
}

/** True when the manga passes every filter. No filters means everything passes. */
export function matchesAllFilters(
  manga: FilterableManga,
  rules: readonly FilterRule[],
  now: number = Date.now(),
): boolean {
  return rules.every((rule) => matchesFilter(manga, rule, now));
}
