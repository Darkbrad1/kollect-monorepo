import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireSettings, requireUser } from "./lib/auth";
import { applySettingsPatch } from "./lib/settings";
import { progressKey, theme } from "./lib/validators";

/**
 * Backs the settings screen. Every field is optional so a single
 * toggle is one small patch rather than a read-modify-write of the
 * whole document. Validation and the retention rewrite live in
 * applySettingsPatch, which a Full backup import also goes through.
 */
export const updateSettings = mutation({
  args: {
    activeView: v.optional(v.string()),
    defaultProgressKey: v.optional(progressKey),
    autoClearTrash: v.optional(v.boolean()),
    trashRetentionDays: v.optional(v.number()),
    autoCompleteOnFinish: v.optional(v.boolean()),
    scrollThreshold: v.optional(v.number()),
    hasPercentageBar: v.optional(v.boolean()),
    hasScreenOverlayOptions: v.optional(v.boolean()),
    theme: v.optional(theme),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const settings = await requireSettings(ctx, user._id);
    await applySettingsPatch(ctx, settings, args);
  },
});
