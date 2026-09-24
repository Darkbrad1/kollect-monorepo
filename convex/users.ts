import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUser, requireSettings, requireUser } from "./lib/auth";
import { ensureFavouriteTag } from "./lib/tags";
import {
  DEFAULT_SETTINGS,
  DEFAULT_THEME,
  SYSTEM_PAGES,
  VIEW_ALL,
} from "./lib/constants";

function displayName(identity: {
  name?: string;
  nickname?: string;
  givenName?: string;
  email?: string;
}): string {
  return (
    identity.name ??
    identity.nickname ??
    identity.givenName ??
    identity.email?.split("@")[0] ??
    "Reader"
  );
}

/**
 * Provisions a user, their settings, their five pages and the built-in
 * Favourite tag in one transaction. Idempotent, so the client can call
 * it on every popup open without guarding. For an existing user it
 * fills in anything missing, such as the Favourite tag for accounts
 * made before tags existed.
 */
export const createUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) throw new Error("Not signed in.");

    const existing = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("token", identity.tokenIdentifier))
      .unique();
    if (existing !== null) {
      await ensureFavouriteTag(ctx, existing._id);
      return existing._id;
    }

    const userId = await ctx.db.insert("users", {
      token: identity.tokenIdentifier,
      name: displayName(identity),
    });

    // Seeded in the order the page selector renders them. "Deleted" in
    // that menu is not a page — it is settings.activeView === "trash".
    const pageIds = [];
    for (const [order, page] of SYSTEM_PAGES.entries()) {
      pageIds.push(
        await ctx.db.insert("userPages", {
          userId,
          title: page.title,
          order,
          systemKey: page.systemKey,
          icon: page.icon,
          filters: [],
          sort: [],
        }),
      );
    }

    const landingPage = pageIds[
      SYSTEM_PAGES.findIndex(
        (p) => p.systemKey === DEFAULT_SETTINGS.defaultProgressKey,
      )
    ];

    await ensureFavouriteTag(ctx, userId);

    await ctx.db.insert("settings", {
      userId,
      activeView: landingPage ?? VIEW_ALL,
      ...DEFAULT_SETTINGS,
      theme: {
        colors: { ...DEFAULT_THEME.colors },
        font: DEFAULT_THEME.font,
      },
    });

    return userId;
  },
});

/**
 * Everything the popup needs on open: identity, settings, and the page
 * list for the selector. Returns null when signed out or before
 * createUser has run, so the client can branch without throwing.
 */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (user === null) return null;

    const settings = await requireSettings(ctx, user._id);
    const pages = await ctx.db
      .query("userPages")
      .withIndex("by_user_order", (q) => q.eq("userId", user._id))
      .collect();

    return { user, settings, pages };
  },
});

export const renameUser = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const user = await requireUser(ctx);
    const trimmed = name.trim();
    if (trimmed.length === 0) throw new Error("Name cannot be empty.");
    await ctx.db.patch(user._id, { name: trimmed });
  },
});
