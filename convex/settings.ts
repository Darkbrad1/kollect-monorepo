import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireSettings, requireUser } from "./lib/auth";
import {
  SCROLL_THRESHOLD_MAX,
  SCROLL_THRESHOLD_MIN,
} from "./lib/constants";

/**
 * Backs the settings screen. Every field is optional so a single
 * toggle is one small patch rather than a read-modify-write of the
 * whole document.
 *
 * Range checks live here because Convex validators only describe
 * shape, not bounds.
 */
export const updateSettings = mutation({
  args: {
    activeView: v.optional(v.string()),
    defaultProgressKey: v.optional(
      v.union(
        v.literal("reading"),
        v.literal("planned"),
        v.literal("paused"),
        v.literal("completed"),
      ),
    ),
    autoClearTrash: v.optional(v.boolean()),
    trashRetentionDays: v.optional(v.number()),
    autoCompleteOnFinish: v.optional(v.boolean()),
    scrollThreshold: v.optional(v.number()),
    hasPercentageBar: v.optional(v.boolean()),
    hasScreenOverlayOptions: v.optional(v.boolean()),
    theme: v.optional(
      v.object({
        colors: v.object({
          primary: v.string(),
          secondary: v.string(),
          base: v.string(),
        }),
        font: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const settings = await requireSettings(ctx, user._id);

    if (args.scrollThreshold !== undefined) {
      const t = args.scrollThreshold;
      if (!Number.isFinite(t) || t < SCROLL_THRESHOLD_MIN || t > SCROLL_THRESHOLD_MAX) {
        throw new Error(
          `scrollThreshold must be between ${SCROLL_THRESHOLD_MIN} and ${SCROLL_THRESHOLD_MAX}, got ${t}.`,
        );
      }
    }

    if (args.trashRetentionDays !== undefined) {
      const d = args.trashRetentionDays;
      if (!Number.isInteger(d) || d < 1) {
        // "Never purge" is autoClearTrash: false, not 0 days — keeping
        // them separate means turning auto-clear off does not destroy
        // the retention value the user picked.
        throw new Error(
          `trashRetentionDays must be a positive whole number, got ${d}. Use autoClearTrash: false to stop purging.`,
        );
      }
    }

    // ctx.db.patch REMOVES any field whose value is undefined, so the
    // args object cannot be forwarded as-is — an unset optional arg
    // would delete a required field. Strip the absent keys first.
    const patch = Object.fromEntries(
      Object.entries(args).filter(([, value]) => value !== undefined),
    );
    if (Object.keys(patch).length === 0) return;

    await ctx.db.patch(settings._id, patch);
  },
});
