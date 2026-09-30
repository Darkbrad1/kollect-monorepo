import type { Infer } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { SCROLL_THRESHOLD_MAX, SCROLL_THRESHOLD_MIN } from "./constants";
import type { progressKey, theme } from "./validators";

export type SettingsPatch = {
  activeView?: string;
  defaultProgressKey?: Infer<typeof progressKey>;
  autoClearTrash?: boolean;
  trashRetentionDays?: number;
  autoCompleteOnFinish?: boolean;
  scrollThreshold?: number;
  hasPercentageBar?: boolean;
  hasScreenOverlayOptions?: boolean;
  theme?: Infer<typeof theme>;
};

/**
 * The one way settings change — the settings screen and a Full backup
 * import both come through here, so range checks and the retention
 * rewrite cannot be skipped by either.
 *
 * Range checks live here because Convex validators only describe
 * shape, not bounds.
 */
export async function applySettingsPatch(
  ctx: MutationCtx,
  settings: Doc<"settings">,
  args: SettingsPatch,
): Promise<void> {
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

  // Whether this call changes how long trash survives. Compared
  // before the patch lands, so a no-op save doesn't kick off a sweep.
  const retentionChanged =
    (args.trashRetentionDays !== undefined &&
      args.trashRetentionDays !== settings.trashRetentionDays) ||
    (args.autoClearTrash !== undefined &&
      args.autoClearTrash !== settings.autoClearTrash);

  await ctx.db.patch(settings._id, patch);

  // Existing trash was stamped with purgeAt under the OLD window, so
  // without this the change silently only applies to future deletes.
  if (retentionChanged) {
    await ctx.scheduler.runAfter(0, internal.trash.rewritePurgeAt, {
      userId: settings.userId,
      cursor: null,
    });
  }
}
