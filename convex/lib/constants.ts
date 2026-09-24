/* ═══════════════════════════════════════════════════════════════
   SHARED CONSTANTS

   PROGRESS_KEYS are the four pages a manga can be on. Every manga
   that isn't in the trash is on exactly one, stored as
   userMangas.progressKey. Favourites is a page too, but it doesn't
   hold manga: it shows the ones with the Favourite tag.

   These live apart from schema.ts so mutations can import them
   without pulling defineSchema along.
   ═══════════════════════════════════════════════════════════════ */

export const PROGRESS_KEYS = [
  "reading",
  "planned",
  "paused",
  "completed",
] as const;

export const SYSTEM_KEYS = [...PROGRESS_KEYS, "favourites"] as const;

export type ProgressKey = (typeof PROGRESS_KEYS)[number];
export type SystemKey = (typeof SYSTEM_KEYS)[number];

export const isProgressKey = (k: string | null): k is ProgressKey =>
  k !== null && (PROGRESS_KEYS as readonly string[]).includes(k);

/* ── progress priority ──────────────────────────────────────────
   When an import finds a manga on one progress page in the file and
   a different one in the account, the page earlier in this list
   wins. Completed outranks everything: importing an older file never
   pulls a finished series back into Reading.
   ─────────────────────────────────────────────────────────────── */

export const PROGRESS_PRIORITY: readonly ProgressKey[] = [
  "completed",
  "reading",
  "paused",
  "planned",
];

/** The higher-priority of two progress pages; either side may be absent. */
export function higherPriority(
  a: ProgressKey | null,
  b: ProgressKey | null,
): ProgressKey | null {
  if (a === null) return b;
  if (b === null) return a;
  return PROGRESS_PRIORITY.indexOf(a) <= PROGRESS_PRIORITY.indexOf(b) ? a : b;
}

/* ── system pages seeded by createUser ──────────────────────────
   Order matches the page selector in the Figma file: Favourites
   first, then the four progress pages. "Deleted" in that menu is
   not a page — it is settings.activeView === "trash".

   Icons are remixicon names, matching the icon set used in the
   design. Purely display; renaming one is a row update.
   ─────────────────────────────────────────────────────────────── */

export const SYSTEM_PAGES: ReadonlyArray<{
  systemKey: SystemKey;
  title: string;
  icon: string;
}> = [
  { systemKey: "favourites", title: "Favourites", icon: "heart-line" },
  { systemKey: "reading", title: "Reading", icon: "book-open-line" },
  { systemKey: "planned", title: "Planned", icon: "calendar-schedule-line" },
  { systemKey: "paused", title: "Paused", icon: "pause-circle-line" },
  { systemKey: "completed", title: "Completed", icon: "archive-2-line" },
];

/* ── tags ────────────────────────────────────────────────────── */

// The built-in tag behind the Favourites page. It can't be renamed or
// deleted, because that page depends on it.
export const FAVOURITE_TAG_NAME = "Favourite";

/* ── hard-coded views ───────────────────────────────────────── */

export const VIEW_ALL = "all";
export const VIEW_TRASH = "trash";

/* ── settings bounds + defaults ─────────────────────────────────
   scrollThreshold is the percentage of a chapter that has to pass
   above the viewport before it counts as read. The settings UI
   exposes it as a 0–100 control; updateSettings is what actually
   enforces the range, since Convex validators can't express it.
   ─────────────────────────────────────────────────────────────── */

export const SCROLL_THRESHOLD_MIN = 0;
export const SCROLL_THRESHOLD_MAX = 100;

export const DEFAULT_TRASH_RETENTION_DAYS = 30;

/* Font matches the Font row in the settings design. The hexes are
   still a close read of the mockups rather than sampled tokens —
   TODO(ui-slice): lift the exact values when the screen is built. */
export const DEFAULT_THEME = {
  colors: {
    primary: "#E8615D",
    secondary: "#5FD9C8",
    base: "#0F0F0F",
  },
  font: "Manrope",
} as const;

export const DEFAULT_SETTINGS = {
  defaultProgressKey: "reading" as ProgressKey,
  trashRetentionDays: DEFAULT_TRASH_RETENTION_DAYS,
  autoClearTrash: true,
  autoCompleteOnFinish: false,
  scrollThreshold: 80,
  hasPercentageBar: false,
  hasScreenOverlayOptions: false,
} as const;

export const DAY_MS = 24 * 60 * 60 * 1000;
