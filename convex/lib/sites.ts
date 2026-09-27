import type { MutationCtx } from "../_generated/server";
import { SITE_CONFIGS } from "./siteConfigs";

/**
 * Brings the sites table in line with SITE_CONFIGS: adds missing sites,
 * and replaces a site whose configVersion in the list is higher than in
 * the table. Sites no longer in the list are left alone, since manga may
 * point at them. Cheap when nothing changed (one lookup per site), so
 * createUser runs it on every popup open; that way nobody has to seed
 * the table by hand.
 */
export async function syncSites(ctx: MutationCtx) {
  const result = { added: [] as string[], updated: [] as string[] };
  for (const config of SITE_CONFIGS) {
    const existing = await ctx.db
      .query("sites")
      .withIndex("by_domain", (q) => q.eq("domain", config.domain))
      .unique();
    if (existing === null) {
      await ctx.db.insert("sites", config);
      result.added.push(config.domain);
    } else if (existing.configVersion < config.configVersion) {
      await ctx.db.replace(existing._id, config);
      result.updated.push(config.domain);
    }
  }
  return result;
}
