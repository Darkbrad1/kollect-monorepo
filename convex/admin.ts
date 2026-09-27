import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";
import { purgeUserManga } from "./lib/trash";

/* ═══════════════════════════════════════════════════════════════
   ADMIN

   Commands for you, the app's owner. They're internal, so the
   extension and the website can't call them; run them from a terminal
   (or from the Convex dashboard's Functions page):

     pnpm users
     pnpm --filter app exec convex run admin:deleteUser '{"userId": "<id from pnpm users>"}'
   ═══════════════════════════════════════════════════════════════ */

/** Everyone with an account: their id, name, and how much they have. */
export const listUsers = internalQuery({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    const sites = await ctx.db.query("sites").collect();
    const result = [];
    for (const user of users) {
      const library = await ctx.db
        .query("userMangas")
        .withIndex("by_user_manga", (q) => q.eq("userId", user._id))
        .collect();
      result.push({
        userId: user._id,
        name: user.name,
        signedUp: new Date(user._creationTime).toISOString().slice(0, 10),
        manga: library.length,
        websitesAdded: sites.filter((s) => s.addedBy === user._id).length,
      });
    }
    return result;
  },
});

// Library rows removed per step; each can bring up to 500 history rows.
const USER_BATCH = 50;

/**
 * Removes a user and everything that's theirs: their library (with its
 * reading history), pages, tags, settings, and the websites they added
 * for themselves. Manga in the shared list stay, since other people may
 * have them too.
 *
 * Big libraries are removed in steps; the command starts the job and
 * it finishes by itself shortly after. Running it again is harmless.
 *
 * This doesn't delete their Clerk login. If they sign in again they get
 * a fresh, empty account; to stop that, delete them in the Clerk
 * dashboard as well.
 */
export const deleteUser = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (user === null) return "No user with that id (already removed?).";

    // 1. The library, a batch at a time.
    const rows = await ctx.db
      .query("userMangas")
      .withIndex("by_user_manga", (q) => q.eq("userId", userId))
      .take(USER_BATCH);
    let busy = false;
    for (const row of rows) {
      if ((await purgeUserManga(ctx, row._id)) === "more") busy = true;
    }
    if (rows.length === USER_BATCH || busy) {
      await ctx.scheduler.runAfter(0, internal.admin.deleteUser, { userId });
      return `Removing ${user.name}: working through their library; it will finish by itself.`;
    }

    // 2. Pages, tags and settings: a handful of rows each.
    const pages = await ctx.db
      .query("userPages")
      .withIndex("by_user_order", (q) => q.eq("userId", userId))
      .collect();
    const tags = await ctx.db
      .query("userTags")
      .withIndex("by_user_name", (q) => q.eq("userId", userId))
      .collect();
    const settings = await ctx.db
      .query("settings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const doc of [...pages, ...tags, ...settings]) await ctx.db.delete(doc._id);

    // 3. Websites they added for themselves, and the manga links to them.
    const sites = (await ctx.db.query("sites").collect()).filter((s) => s.addedBy === userId);
    for (const site of sites) {
      const sources = await ctx.db
        .query("mangaSources")
        .withIndex("by_site_slug", (q) => q.eq("siteId", site._id))
        .collect();
      for (const source of sources) await ctx.db.delete(source._id);
      await ctx.db.delete(site._id);
    }

    // 4. The account itself.
    await ctx.db.delete(userId);
    console.log(`Removed user ${user.name} (${userId}).`);
    return `Removed ${user.name}.`;
  },
});
