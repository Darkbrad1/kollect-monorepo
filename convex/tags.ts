import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { requireOwnedManga, requireUser } from "./lib/auth";
import {
  addTagTo,
  cleanTagColor,
  cleanTagName,
  favouriteTag,
  findOrCreateTag,
  findTagByName,
  normalizeTagName,
  requireOwnedTag,
  tagColor,
} from "./lib/tags";

/* ═══════════════════════════════════════════════════════════════
   TAGS

   Each user's own labels. Tags replace custom pages: instead of
   putting a manga on a "Murim" page, you give it a "Murim" tag and
   filter by it. A manga can have any number of tags.

   Each tag has a colour, shown on its chip. New tags take the next
   colour from TAG_COLORS unless one is picked.

   Favourite is a built-in tag. It can't be renamed or deleted,
   because the Favourites page shows the manga that carry it.
   ═══════════════════════════════════════════════════════════════ */

/** The user's tags: Favourite first, then the rest A to Z. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const tags = await ctx.db
      .query("userTags")
      .withIndex("by_user_name", (q) => q.eq("userId", user._id))
      .collect();

    return tags
      .sort((a, b) => {
        if (a.builtIn !== b.builtIn) return a.builtIn === "favourite" ? -1 : 1;
        return a.normalizedName.localeCompare(b.normalizedName);
      })
      .map((tag) => ({ ...tag, color: tagColor(tag) }));
  },
});

/** The Add Tag button in Settings. Colour is optional. */
export const create = mutation({
  args: { name: v.string(), color: v.optional(v.string()) },
  handler: async (ctx, { name, color }) => {
    const user = await requireUser(ctx);
    const cleaned = cleanTagName(name);

    if ((await findTagByName(ctx, user._id, cleaned)) !== null) {
      throw new Error(`You already have a tag called "${cleaned}".`);
    }
    return await findOrCreateTag(ctx, user._id, cleaned, color);
  },
});

/** Renames a tag, changes its colour, or both. */
export const update = mutation({
  args: {
    tagId: v.id("userTags"),
    name: v.optional(v.string()),
    color: v.optional(v.string()),
  },
  handler: async (ctx, { tagId, name, color }) => {
    const user = await requireUser(ctx);
    const tag = await requireOwnedTag(ctx, user._id, tagId);

    const patch: { name?: string; normalizedName?: string; color?: string } = {};

    if (name !== undefined) {
      if (tag.builtIn !== null) throw new Error("The Favourite tag can't be renamed.");
      const cleaned = cleanTagName(name);
      const clash = await findTagByName(ctx, user._id, cleaned);
      if (clash !== null && clash._id !== tagId) {
        throw new Error(`You already have a tag called "${clash.name}".`);
      }
      // Manga and filters point at the tag by id, so renaming it here
      // renames it everywhere.
      patch.name = cleaned;
      patch.normalizedName = normalizeTagName(cleaned);
    }
    if (color !== undefined) patch.color = cleanTagColor(color);

    if (Object.keys(patch).length > 0) await ctx.db.patch(tagId, patch);
  },
});

/**
 * Deletes a tag: takes it off every manga that has it (in the trash
 * too, so a restored manga doesn't come back with a dead tag), and
 * removes any page filters that used it.
 */
export const remove = mutation({
  args: { tagId: v.id("userTags") },
  handler: async (ctx, { tagId }) => {
    const user = await requireUser(ctx);
    const tag = await requireOwnedTag(ctx, user._id, tagId);
    if (tag.builtIn !== null) throw new Error("The Favourite tag can't be deleted.");

    const rows = await ctx.db
      .query("userMangas")
      .withIndex("by_user_manga", (q) => q.eq("userId", user._id))
      .collect();
    for (const row of rows) {
      if (row.tagIds.includes(tagId)) {
        await ctx.db.patch(row._id, { tagIds: row.tagIds.filter((id) => id !== tagId) });
      }
    }

    const pages = await ctx.db
      .query("userPages")
      .withIndex("by_user_order", (q) => q.eq("userId", user._id))
      .collect();
    for (const page of pages) {
      const filters = page.filters.filter(
        (rule) => !(rule.field === "tag" && rule.tagId === tagId),
      );
      if (filters.length !== page.filters.length) {
        await ctx.db.patch(page._id, { filters });
      }
    }

    await ctx.db.delete(tagId);
  },
});

/* ── tagging a manga ────────────────────────────────────────── */

async function liveOwnedManga(
  ctx: MutationCtx,
  userId: Id<"users">,
  userMangaId: Id<"userMangas">,
): Promise<Doc<"userMangas">> {
  const userManga = await requireOwnedManga(ctx, userId, userMangaId);
  if (userManga.isDeleted) {
    throw new Error("That manga is in the trash. Restore it first.");
  }
  return userManga;
}

export const addTag = mutation({
  args: { userMangaId: v.id("userMangas"), tagId: v.id("userTags") },
  handler: async (ctx, { userMangaId, tagId }) => {
    const user = await requireUser(ctx);
    await requireOwnedTag(ctx, user._id, tagId);
    const userManga = await liveOwnedManga(ctx, user._id, userMangaId);
    await addTagTo(ctx, userManga, tagId);
  },
});

export const removeTag = mutation({
  args: { userMangaId: v.id("userMangas"), tagId: v.id("userTags") },
  handler: async (ctx, { userMangaId, tagId }) => {
    const user = await requireUser(ctx);
    await requireOwnedTag(ctx, user._id, tagId);
    const userManga = await liveOwnedManga(ctx, user._id, userMangaId);
    if (!userManga.tagIds.includes(tagId)) return;
    await ctx.db.patch(userMangaId, {
      tagIds: userManga.tagIds.filter((id) => id !== tagId),
    });
  },
});

/**
 * The Search/Create Tags box in the card's Add Tags menu: adds the tag
 * with this name, creating it first if it's new.
 */
export const addTagByName = mutation({
  args: { userMangaId: v.id("userMangas"), name: v.string() },
  handler: async (ctx, { userMangaId, name }) => {
    const user = await requireUser(ctx);
    const userManga = await liveOwnedManga(ctx, user._id, userMangaId);
    const tagId = await findOrCreateTag(ctx, user._id, name);
    const tag = await ctx.db.get(tagId);
    if (tag?.builtIn !== null) {
      throw new Error("Use the Favourite item to favourite a manga.");
    }
    await addTagTo(ctx, userManga, tagId);
    return tagId;
  },
});

/** The "Favourite" item in the card menu. */
export const setFavourite = mutation({
  args: { userMangaId: v.id("userMangas"), favourite: v.boolean() },
  handler: async (ctx, { userMangaId, favourite }) => {
    const user = await requireUser(ctx);
    const tag = await favouriteTag(ctx, user._id);
    const userManga = await liveOwnedManga(ctx, user._id, userMangaId);

    if (favourite) {
      await addTagTo(ctx, userManga, tag._id);
    } else if (userManga.tagIds.includes(tag._id)) {
      await ctx.db.patch(userMangaId, {
        tagIds: userManga.tagIds.filter((id) => id !== tag._id),
      });
    }
  },
});
