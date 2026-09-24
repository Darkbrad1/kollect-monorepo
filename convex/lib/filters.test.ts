import { describe, expect, test } from "vitest";
import type { Id } from "../_generated/dataModel";
import { DAY_MS } from "./constants";
import { matchesAllFilters, matchesFilter, type FilterableManga } from "./filters";

const NOW = 1_800_000_000_000;
const asura = "site_asura" as Id<"sites">;
const flame = "site_flame" as Id<"sites">;

const manga = (overrides: Partial<FilterableManga> = {}): FilterableManga => ({
  lastReadChapter: 50,
  latestChapter: 120,
  addedAt: NOW - 10 * DAY_MS, // added 10 days ago
  currentSiteId: asura,
  readSiteIds: [flame], // read on Flame before, reading on Asura now
  ...overrides,
});

describe("chapter filters", () => {
  test.each([
    ["greaterThan", 40, true],
    ["greaterThan", 50, false],
    ["equal", 50, true],
    ["equal", 51, false],
    ["lessThan", 60, true],
    ["lessThan", 50, false],
  ] as const)("last read chapter %s %d → %s", (op, value, expected) => {
    expect(matchesFilter(manga(), { field: "lastReadChapter", op, value }, NOW)).toBe(expected);
  });

  test("between includes both ends", () => {
    const rule = (min: number, max: number) =>
      ({ field: "latestChapter", op: "between", min, max }) as const;
    expect(matchesFilter(manga(), rule(100, 120), NOW)).toBe(true);
    expect(matchesFilter(manga(), rule(120, 200), NOW)).toBe(true);
    expect(matchesFilter(manga(), rule(121, 200), NOW)).toBe(false);
  });

  test("between works whichever box holds the bigger number", () => {
    expect(
      matchesFilter(manga(), { field: "latestChapter", op: "between", min: 200, max: 100 }, NOW),
    ).toBe(true);
  });

  test("a manga with no chapter yet matches no chapter filter", () => {
    const unread = manga({ lastReadChapter: undefined });
    for (const op of ["greaterThan", "equal", "lessThan"] as const) {
      expect(matchesFilter(unread, { field: "lastReadChapter", op, value: 0 }, NOW)).toBe(false);
    }
  });
});

describe("date added filters (days ago)", () => {
  test("greater than: added more than N days ago", () => {
    expect(matchesFilter(manga(), { field: "dateAdded", op: "greaterThan", value: 7 }, NOW)).toBe(true);
    expect(matchesFilter(manga(), { field: "dateAdded", op: "greaterThan", value: 14 }, NOW)).toBe(false);
  });

  test("less than: added within the last N days", () => {
    expect(matchesFilter(manga(), { field: "dateAdded", op: "lessThan", value: 14 }, NOW)).toBe(true);
    expect(matchesFilter(manga(), { field: "dateAdded", op: "lessThan", value: 7 }, NOW)).toBe(false);
  });

  test("between", () => {
    expect(matchesFilter(manga(), { field: "dateAdded", op: "between", min: 7, max: 14 }, NOW)).toBe(true);
    expect(matchesFilter(manga(), { field: "dateAdded", op: "between", min: 1, max: 5 }, NOW)).toBe(false);
  });
});

describe("source filters", () => {
  test("equal: the site you're reading it on", () => {
    expect(matchesFilter(manga(), { field: "source", op: "equal", siteId: asura }, NOW)).toBe(true);
    expect(matchesFilter(manga(), { field: "source", op: "equal", siteId: flame }, NOW)).toBe(false);
  });

  test("contains: a site in your reading history", () => {
    expect(matchesFilter(manga(), { field: "source", op: "contains", siteId: flame }, NOW)).toBe(true);
    expect(
      matchesFilter(manga(), { field: "source", op: "contains", siteId: "site_other" as Id<"sites"> }, NOW),
    ).toBe(false);
  });

  test("contains: the site you're reading on now counts too", () => {
    expect(matchesFilter(manga(), { field: "source", op: "contains", siteId: asura }, NOW)).toBe(true);
  });
});

describe("several filters", () => {
  test("every filter must match", () => {
    const passes = { field: "lastReadChapter", op: "greaterThan", value: 10 } as const;
    const fails = { field: "latestChapter", op: "lessThan", value: 100 } as const;
    expect(matchesAllFilters(manga(), [passes], NOW)).toBe(true);
    expect(matchesAllFilters(manga(), [passes, fails], NOW)).toBe(false);
  });

  test("no filters lets everything through", () => {
    expect(matchesAllFilters(manga(), [], NOW)).toBe(true);
  });
});
