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

// null for custom pages
export const systemKey = v.union(
  v.literal("reading"),
  v.literal("planned"),
  v.literal("paused"),
  v.literal("completed"),
  v.literal("favourites"),
  v.null(),
);

export const filterRule = v.object({
  field: v.union(
    v.literal("type"),
    v.literal("site"),
    v.literal("author"),
    v.literal("tag"),
  ),
  value: v.string(),
});

export const sortRule = v.object({
  field: v.union(
    v.literal("title"),
    v.literal("lastReadAt"),
    v.literal("addedAt"),
    v.literal("progress"),
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
