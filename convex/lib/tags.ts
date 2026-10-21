import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { FAVOURITE_TAG_NAME, TAG_COLORS } from "./constants";

/** Trims and tidies spaces. Throws on an empty name. */
export function cleanTagName(name: string): string {
  const cleaned = name.trim().replace(/\s+/g, " ");
  if (cleaned.length === 0) throw new Error("A tag needs a name.");
  return cleaned;
}

/** Throws unless the colour is a "#rrggbb" code. */
export function cleanTagColor(color: string): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
    throw new Error(`"${color}" isn't a colour code like #5B8FD6.`);
  }
  return color.toUpperCase();
}

/** A tag's colour, with a default for tags made before colours existed. */
export function tagColor(tag: Doc<"userTags">): string {
  return tag.color ?? TAG_COLORS[0];
}

/** The colour a new tag gets: the next one in TAG_COLORS. */
export async function nextTagColor(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<string> {
  const count = (
    await ctx.db
      .query("userTags")
      .withIndex("by_user_name", (q) => q.eq("userId", userId))
      .collect()
  ).filter((tag) => tag.builtIn === null).length;
  return TAG_COLORS[count % TAG_COLORS.length];
}

/** The form used for the no-duplicates check. */
export function normalizeTagName(name: string): string {
  return cleanTagName(name).toLowerCase();
}

export async function findTagByName(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  name: string,
): Promise<Doc<"userTags"> | null> {
  return await ctx.db
    .query("userTags")
    .withIndex("by_user_name", (q) =>
      q.eq("userId", userId).eq("normalizedName", normalizeTagName(name)),
    )
    .first();
}

export async function favouriteTag(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<Doc<"userTags">> {
  const tag = await ctx.db
    .query("userTags")
    .withIndex("by_user_builtIn", (q) =>
      q.eq("userId", userId).eq("builtIn", "favourite"),
    )
    .first();
  if (tag === null) throw new Error(`User ${userId} has no Favourite tag.`);
  return tag;
}

/** Creates the built-in Favourite tag if the user doesn't have one. */
export async function ensureFavouriteTag(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<Id<"userTags">> {
  const existing = await ctx.db
    .query("userTags")
    .withIndex("by_user_builtIn", (q) =>
      q.eq("userId", userId).eq("builtIn", "favourite"),
    )
    .first();
  if (existing !== null) return existing._id;

  return await ctx.db.insert("userTags", {
    userId,
    name: FAVOURITE_TAG_NAME,
    normalizedName: normalizeTagName(FAVOURITE_TAG_NAME),
    builtIn: "favourite",
    color: TAG_COLORS[0],
  });
}

/** Finds a tag by name, creating it if it doesn't exist yet. A new
    tag gets `color` if given, otherwise the next colour in the list. */
export async function findOrCreateTag(
  ctx: MutationCtx,
  userId: Id<"users">,
  name: string,
  color?: string,
): Promise<Id<"userTags">> {
  const existing = await findTagByName(ctx, userId, name);
  if (existing !== null) return existing._id;

  return await ctx.db.insert("userTags", {
    userId,
    name: cleanTagName(name),
    normalizedName: normalizeTagName(name),
    builtIn: null,
    color: color === undefined ? await nextTagColor(ctx, userId) : cleanTagColor(color),
  });
}

export async function requireOwnedTag(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  tagId: Id<"userTags">,
): Promise<Doc<"userTags">> {
  const tag = await ctx.db.get(tagId);
  if (tag === null || tag.userId !== userId) throw new Error("No such tag.");
  return tag;
}

/** Adds a tag to a manga, unless it's already there. */
export async function addTagTo(
  ctx: MutationCtx,
  userManga: Doc<"userMangas">,
  tagId: Id<"userTags">,
): Promise<void> {
  if (userManga.tagIds.includes(tagId)) return;
  await ctx.db.patch(userManga._id, { tagIds: [...userManga.tagIds, tagId] });
}
