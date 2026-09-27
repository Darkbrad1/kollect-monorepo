import { v } from "convex/values";

/* Validators shared by the schema and by the import/export format.
   Keeping one copy means an exported file and the table it came from
   cannot quietly drift apart. They must stay in step with the
   constants in ./constants.ts. */

export const progressKey = v.union(
  v.literal("reading"),
  v.literal("planned"),
  v.literal("paused"),
  v.literal("completed"),
);

// Every page is one of these five. There are no custom pages — tags
// do that job.
export const systemKey = v.union(
  v.literal("reading"),
  v.literal("planned"),
  v.literal("paused"),
  v.literal("completed"),
  v.literal("favourites"),
);

/* ── filters ────────────────────────────────────────────────────
   One saved filter row: a field, an operator, and a value (or two
   values for "between"). Each field only accepts the operators the
   filter menu offers for it. Matching happens in the extension —
   see lib/filters.ts.
   ─────────────────────────────────────────────────────────────── */

const chapterField = v.union(
  v.literal("lastReadChapter"), // the chapter you're on
  v.literal("latestChapter"), // the newest chapter the series has
);

export const filterRule = v.union(
  v.object({
    field: chapterField,
    op: v.union(v.literal("greaterThan"), v.literal("equal"), v.literal("lessThan")),
    value: v.number(),
  }),
  v.object({
    field: chapterField,
    op: v.literal("between"),
    min: v.number(),
    max: v.number(),
  }),
  // Date added is measured in days ago: "greaterThan 7" means added
  // more than 7 days ago.
  v.object({
    field: v.literal("dateAdded"),
    op: v.union(v.literal("greaterThan"), v.literal("lessThan")),
    value: v.number(),
  }),
  v.object({
    field: v.literal("dateAdded"),
    op: v.literal("between"),
    min: v.number(),
    max: v.number(),
  }),
  // "equal": the site you're currently reading it on.
  // "contains": any site you've read it on, from your reading history.
  v.object({
    field: v.literal("source"),
    op: v.union(v.literal("equal"), v.literal("contains")),
    siteId: v.id("sites"),
  }),
  v.object({
    field: v.literal("tag"),
    op: v.union(v.literal("has"), v.literal("doesNotHave")),
    tagId: v.id("userTags"),
  }),
);

/* ── sorts ──────────────────────────────────────────────────────
   A page can have several sort rows; the first decides the order and
   later ones break ties. Sorting happens in the extension — see
   lib/sort.ts. The names match the sort menu.
   ─────────────────────────────────────────────────────────────── */

export const sortRule = v.object({
  field: v.union(
    v.literal("lastRead"), // "Last Read": when you last read it
    v.literal("dateAdded"), // "Date Added"
    v.literal("lastReadChapter"), // "Read Chapters": the chapter you're on
    v.literal("latestChapter"), // "Latest Chapter": the newest chapter out
    v.literal("source"), // "Sources": the site you're reading it on, A to Z
    v.literal("title"), // "Title"
  ),
  direction: v.union(v.literal("asc"), v.literal("desc")),
});

export const mangaType = v.union(
  v.literal("manga"),
  v.literal("manhwa"),
  v.literal("manhua"),
  v.literal("webtoon"),
  v.literal("other"),
);

// the SERIES status — not the user's progress
export const mangaStatus = v.union(
  v.literal("ongoing"),
  v.literal("hiatus"),
  v.literal("completed"),
  v.literal("cancelled"),
);

export const theme = v.object({
  colors: v.object({
    primary: v.string(),
    secondary: v.string(),
    base: v.string(),
  }),
  font: v.string(),
});
