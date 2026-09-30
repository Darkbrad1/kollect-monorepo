import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/* Identity comes from Clerk via convex/auth.config.ts — one issuer
   for the web app, one for the extension. users.token holds the
   Clerk tokenIdentifier, which is what links the two. */

export async function getCurrentUser(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) return null;

  return await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("token", identity.tokenIdentifier))
    .unique();
}

export async function requireUser(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<"users">> {
  const user = await getCurrentUser(ctx);
  if (user === null) {
    throw new Error(
      "No user row for this identity. Call createUser once after sign-in.",
    );
  }
  return user;
}

export async function requireSettings(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<Doc<"settings">> {
  const settings = await ctx.db
    .query("settings")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();

  if (settings === null) {
    throw new Error(`User ${userId} has no settings row.`);
  }
  return settings;
}

/** Loads a userManga and asserts it belongs to the caller. */
export async function requireOwnedManga(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  userMangaId: Id<"userMangas">,
): Promise<Doc<"userMangas">> {
  const userManga = await ctx.db.get(userMangaId);
  if (userManga === null) throw new Error(`No such userManga: ${userMangaId}`);
  if (userManga.userId !== userId) {
    throw new Error("That library entry belongs to another user.");
  }
  return userManga;
}
