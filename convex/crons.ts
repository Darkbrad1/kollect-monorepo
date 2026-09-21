import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Sunday 04:00 UTC — off-peak, and once a week is plenty for a figure
// that only feeds the "/456" half of the chapter label.
crons.weekly(
  "refresh latest chapters",
  { dayOfWeek: "sunday", hourUTC: 4, minuteUTC: 0 },
  internal.catalogue.refreshLatestChapters,
  { cursor: null },
);

export default crons;
