import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { namesOf } from "./matching";
import { normalizeTitle } from "./titles";

/**
 * Sets a manga's latest chapter to the highest figure across all the
 * sites it's on, with MangaDex counting as one more. Recomputed rather than kept as a running max, so a
 * site renumbering its chapters can bring the figure back down.
 * Shared by the weekly refresh and by page visits.
 */
export async function refreshMangaLatest(
  ctx: MutationCtx,
  mangaId: Id<"mangas">,
): Promise<void> {
  const sources = await ctx.db
    .query("mangaSources")
    .withIndex("by_manga", (q) => q.eq("mangaId", mangaId))
    .collect();

  const providers = await ctx.db
    .query("providers")
    .withIndex("by_manga", (q) => q.eq("mangaId", mangaId))
    .collect();

  let highest: number | null = null;
  for (const figure of [...sources.map((s) => s.latestChapter), ...providers.map((p) => p.chapterCount)]) {
    if (figure === undefined) continue;
    if (highest === null || figure > highest) highest = figure;
  }
  if (highest === null) return;

  const manga = await ctx.db.get(mangaId);
  if (manga === null) return; // dangling reference; nothing to update
  if (manga.latestChapter === highest) return;

  await ctx.db.patch(mangaId, { latestChapter: highest, latestChapterAt: Date.now() });
}

/** Saves a title as another name for the manga, unless it already has it. */
export async function addAltTitle(ctx: MutationCtx, manga: Doc<"mangas">, title: string): Promise<void> {
  const clean = title.trim();
  const normalized = normalizeTitle(clean);
  if (normalized === "" || namesOf(manga).includes(normalized)) return;
  await ctx.db.patch(manga._id, { altTitles: [...manga.altTitles, clean] });
  await ctx.db.insert("mangaAltTitles", { mangaId: manga._id, normalizedTitle: normalized });
}
