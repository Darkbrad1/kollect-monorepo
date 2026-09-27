import { internalMutation, query } from "./_generated/server";
import { SITE_CONFIGS } from "./lib/siteConfigs";

/**
 * All known sites. Card tiles show the source favicon next to the
 * chapter label, and joining sites per tile would be a query per
 * card — so the client fetches this once and looks up by id. The
 * extension also reads each site's page-reading rules from here.
 *
 * Small, global, and changes only when a site is added or its
 * extraction config is fixed.
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("sites").collect();
  },
});

/**
 * Copies SITE_CONFIGS (convex/lib/siteConfigs.ts) into the sites table:
 * adds new sites and updates existing ones, matched by domain. Sites
 * missing from the list are left alone, since manga may point at them.
 *
 *   pnpm --filter app exec convex run sites:seed
 */
export const seed = internalMutation({
  args: {},
  handler: async (ctx) => {
    const result = { added: [] as string[], updated: [] as string[] };
    for (const config of SITE_CONFIGS) {
      const existing = await ctx.db
        .query("sites")
        .withIndex("by_domain", (q) => q.eq("domain", config.domain))
        .unique();
      if (existing === null) {
        await ctx.db.insert("sites", config);
        result.added.push(config.domain);
      } else {
        await ctx.db.replace(existing._id, config);
        result.updated.push(config.domain);
      }
    }
    return result;
  },
});
