import { internalMutation, query } from "./_generated/server";
import { syncSites } from "./lib/sites";

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
 * Brings the sites table in line with convex/lib/siteConfigs.ts right
 * away. Normally not needed: createUser does this on every popup open.
 *
 *   pnpm --filter app exec convex run sites:seed
 */
export const seed = internalMutation({
  args: {},
  handler: async (ctx) => await syncSites(ctx),
});
