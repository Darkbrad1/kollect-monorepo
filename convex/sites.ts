import { query } from "./_generated/server";

/**
 * All known sites. Card tiles show the source favicon next to the
 * chapter label, and joining sites per tile would be a query per
 * card — so the client fetches this once and looks up by id.
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
