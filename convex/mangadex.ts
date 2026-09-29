import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { addAltTitle, refreshMangaLatest } from "./lib/catalogue";
import {
  MANGADEX_API,
  parseMangaDex,
  type MangaDexAggregate,
  type MangaDexManga,
} from "./lib/mangadex";
import { mangaStatus } from "./lib/validators";

/* ═══════════════════════════════════════════════════════════════
   MANGADEX

   Fills in each manga's cover, alternative titles, latest chapter and
   series status from MangaDex. It runs when a manga is first added to
   the shared list, and for every manga in a weekly job.

   The rules, as agreed:
   - The manga is found by searching its title and taking the first
     result. If that's wrong, point it at the right one by hand:
       pnpm --filter app exec convex run mangadex:lookup '{"mangaId": "<id>", "mangadexId": "<id from the mangadex.org/title/... address>"}'
   - MangaDex's cover always replaces the website's.
   - Alternative titles: English, ones in the Latin alphabet, and the
     original language (lib/mangadex.ts).
   - Its latest chapter counts like one more website: the highest wins.
   - Its series status is used when no reading website has given one.
   ═══════════════════════════════════════════════════════════════ */

// MangaDex asks every app to say who it is.
const HEADERS = { "User-Agent": "Kollect (https://github.com/Darkbrad1/kollect-monorepo)" };

// MangaDex allows about 5 requests a second. A lookup makes 2 or 3, so
// the weekly job starts one every 700ms.
const STAGGER_MS = 700;
const SWEEP_BATCH = 100;

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: HEADERS });
  if (!response.ok) throw new Error(`MangaDex answered ${response.status} for ${url}`);
  return (await response.json()) as T;
}

export const mangaForLookup = internalQuery({
  args: { mangaId: v.id("mangas") },
  handler: async (ctx, { mangaId }) => {
    const manga = await ctx.db.get(mangaId);
    return manga === null ? null : { title: manga.title, mangadexId: manga.mangadexId };
  },
});

/**
 * Looks one manga up on MangaDex and saves what it finds. Pass
 * `mangadexId` to link it to a particular MangaDex entry (the id in a
 * mangadex.org/title/<id> address); otherwise it keeps the entry it was
 * linked to before, or searches by title and takes the first result.
 */
export const lookup = internalAction({
  args: { mangaId: v.id("mangas"), mangadexId: v.optional(v.string()) },
  handler: async (ctx, { mangaId, mangadexId }): Promise<string> => {
    const manga = await ctx.runQuery(internal.mangadex.mangaForLookup, { mangaId });
    if (manga === null) return "No manga with that id.";

    let id = mangadexId ?? manga.mangadexId;
    if (id === undefined) {
      const params = new URLSearchParams({ title: manga.title, limit: "1" });
      params.append("order[relevance]", "desc");
      const found = await getJson<{ data: MangaDexManga[] }>(`${MANGADEX_API}/manga?${params}`);
      id = found.data[0]?.id;
      if (id === undefined) return `MangaDex has nothing called "${manga.title}".`;
    }

    const entry = await getJson<{ data: MangaDexManga }>(`${MANGADEX_API}/manga/${id}?includes[]=cover_art`);
    const aggregate = await getJson<MangaDexAggregate>(`${MANGADEX_API}/manga/${id}/aggregate`).catch(() => null);
    const details = parseMangaDex(entry.data, aggregate);
    await ctx.runMutation(internal.mangadex.apply, { mangaId, ...details });
    return `Linked "${manga.title}" to mangadex.org/title/${details.mangadexId}.`;
  },
});

export const apply = internalMutation({
  args: {
    mangaId: v.id("mangas"),
    mangadexId: v.string(),
    altTitles: v.array(v.string()),
    cover: v.optional(v.string()),
    status: v.optional(mangaStatus),
    latestChapter: v.optional(v.number()),
  },
  handler: async (ctx, { mangaId, mangadexId, altTitles, cover, status, latestChapter }) => {
    const manga = await ctx.db.get(mangaId);
    if (manga === null) return;

    const patch: Record<string, unknown> = { mangadexId };
    if (cover !== undefined) patch.image = cover;
    // A reading website's own status wins; MangaDex fills the gap.
    if (status !== undefined && (manga.status === undefined || manga.statusSource === "mangadex")) {
      patch.status = status;
      patch.statusSource = "mangadex";
    }
    await ctx.db.patch(mangaId, patch);

    for (const title of altTitles) {
      await addAltTitle(ctx, (await ctx.db.get(mangaId))!, title);
    }

    // Its latest chapter, kept like a website's (see refreshMangaLatest).
    const provider = await ctx.db
      .query("providers")
      .withIndex("by_manga", (q) => q.eq("mangaId", mangaId))
      .filter((q) => q.eq(q.field("name"), "mangadex"))
      .first();
    const fields = { providerMangaId: mangadexId, chapterCount: latestChapter, syncedAt: Date.now() };
    if (provider === null) await ctx.db.insert("providers", { mangaId, name: "mangadex", ...fields });
    else await ctx.db.patch(provider._id, fields);

    await refreshMangaLatest(ctx, mangaId);
  },
});

/** The weekly job: looks every manga up again, a batch at a time. */
export const refreshAll = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { cursor }) => {
    const batch = await ctx.db.query("mangas").paginate({ cursor, numItems: SWEEP_BATCH });
    for (const [i, manga] of batch.page.entries()) {
      await ctx.scheduler.runAfter(i * STAGGER_MS, internal.mangadex.lookup, { mangaId: manga._id });
    }
    if (!batch.isDone) {
      await ctx.scheduler.runAfter(batch.page.length * STAGGER_MS, internal.mangadex.refreshAll, {
        cursor: batch.continueCursor,
      });
    }
  },
});
