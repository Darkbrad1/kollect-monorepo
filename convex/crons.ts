import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Sunday 03:00 UTC: covers, other titles, latest chapters and series
// status from MangaDex, for every manga (convex/mangadex.ts).
crons.weekly(
  "refresh from MangaDex",
  { dayOfWeek: "sunday", hourUTC: 3, minuteUTC: 0 },
  internal.mangadex.refreshAll,
  { cursor: null },
);

// Daily sweep of soft-deleted rows past their purgeAt. Rows belonging
// to users with autoClearTrash off carry no purgeAt and are skipped.
crons.daily(
  "purge expired trash",
  { hourUTC: 5, minuteUTC: 0 },
  internal.trash.purgeExpired,
  {},
);

export default crons;
