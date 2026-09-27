import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/**
 * Sets a manga's latest chapter to the highest figure across all the
 * sites it's on. Recomputed rather than kept as a running max, so a
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

  let highest: number | null = null;
  for (const s of sources) {
    if (s.latestChapter === undefined) continue;
    if (highest === null || s.latestChapter > highest) highest = s.latestChapter;
  }
  if (highest === null) return;

  const manga = await ctx.db.get(mangaId);
  if (manga === null) return; // dangling reference; nothing to update
  if (manga.latestChapter === highest) return;

  await ctx.db.patch(mangaId, { latestChapter: highest, latestChapterAt: Date.now() });
}
