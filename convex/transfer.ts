import { v, type Infer } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { requireSettings, requireUser } from "./lib/auth";
import { higherPriority } from "./lib/constants";
import { addToLibrary, recordHistory } from "./lib/library";
import { setProgressPage } from "./lib/pages";
import { applySettingsPatch } from "./lib/settings";
import { favouriteTag, findOrCreateTag, findTagByName } from "./lib/tags";
import {
  filterRule,
  mangaStatus,
  mangaType,
  progressKey,
  sortRule,
  systemKey,
  theme,
} from "./lib/validators";

/* ═══════════════════════════════════════════════════════════════
   IMPORT / EXPORT

   Export always writes everything: every manga with its page, tags
   and reading progress, the page list, the tag list, and the
   settings.

   Import lets the user choose how much of that to bring in, from the
   dropdown in the settings screen:

     Titles Only     — just the manga. New ones land on the default
                       page; nothing about existing ones changes.
     Title And Page  — the manga, which page they're on, their tags
                       (Favourite included) and reading progress,
                       merged by the import rules below.
     All Settings    — everything in Title And Page, plus settings.

   Import runs in steps so the extension can show "Importing <title>…"
   while it works. For the chosen option, the extension calls:

     1. importTags      (Title And Page, All Settings) — once
     2. importMangas    — repeatedly, a small batch of manga at a time
     3. importSettings  (All Settings) — once

   and adds up the reports from step 2. Every step is safe to run
   twice, so an import that gets interrupted can simply be run again.

   Catalogue references. `mangas` and `sites` are shared by every
   account, so a file exported from this deployment names rows that
   already exist here. Each reference carries the row's id, tried
   first, plus a natural key (normalizedTitle / domain) as the
   fallback. Import never creates catalogue rows: a manga it cannot
   find is skipped and listed in the report.

   Per-user rows (pages, tags, library entries) have no stable id
   across accounts, so pages are referenced by their systemKey and
   tags by name.
   ═══════════════════════════════════════════════════════════════ */

/** Bump when the file shape changes. The extension should read
    `kollect` from a file before importing it, and every import step
    rejects a file with a different number. */
export const EXPORT_FORMAT_VERSION = 2;

/* ── file format validators ─────────────────────────────────── */

const pageEntry = v.object({
  systemKey,
  title: v.string(),
  order: v.number(),
  icon: v.optional(v.string()),
  filters: v.array(filterRule),
  sort: v.array(sortRule),
});

// The user's own tags. Favourite isn't listed: every account has it.
const tagEntry = v.object({ name: v.string() });

/** One manga in the file: what it is, plus where it sits and how far
    along it is in the exporting library. */
const mangaEntry = v.object({
  // What the manga is
  id: v.optional(v.string()), // mangas id in the exporting deployment
  title: v.string(),
  normalizedTitle: v.string(),
  altTitles: v.array(v.string()),
  image: v.string(),
  type: mangaType,
  authors: v.array(v.string()),
  tags: v.array(v.string()),
  year: v.optional(v.number()),
  status: v.optional(mangaStatus),

  // Where it sits and how far along it is
  progressKey,
  favourite: v.boolean(),
  // The user's own tag names. (`tags` above is the series' genres.)
  userTags: v.array(v.string()),
  addedAt: v.number(),
  currentChapterNumber: v.optional(v.number()),
  currentChapterLabel: v.optional(v.string()),
  currentChapterUrl: v.optional(v.string()),
  currentPercentage: v.optional(v.number()),
  currentSiteId: v.optional(v.string()), // sites id in the exporting deployment
  currentSiteDomain: v.optional(v.union(v.string(), v.null())),
  lastReadAt: v.optional(v.number()),
});

const settingsEntry = v.object({
  defaultProgressKey: progressKey,
  autoClearTrash: v.boolean(),
  trashRetentionDays: v.number(),
  autoCompleteOnFinish: v.boolean(),
  scrollThreshold: v.number(),
  hasPercentageBar: v.boolean(),
  hasScreenOverlayOptions: v.boolean(),
  theme,
});

type MangaEntry = Infer<typeof mangaEntry>;

function assertFormat(kollect: number): void {
  if (kollect !== EXPORT_FORMAT_VERSION) {
    throw new Error(
      `This file uses export format ${kollect}; this version of Kollect reads format ${EXPORT_FORMAT_VERSION}.`,
    );
  }
}

/* ═══════════════════════════════════════════════════════════════
   EXPORT
   ═══════════════════════════════════════════════════════════════ */

export const exportLibrary = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);

    const pages = await ctx.db
      .query("userPages")
      .withIndex("by_user_order", (q) => q.eq("userId", user._id))
      .collect();

    const tags = await ctx.db
      .query("userTags")
      .withIndex("by_user_name", (q) => q.eq("userId", user._id))
      .collect();
    const tagById = new Map(tags.map((tag) => [tag._id, tag]));

    // sites is tiny; cache lookups so a library sharing one source
    // doesn't re-read the same row per manga.
    const domainBySiteId = new Map<Id<"sites">, string | null>();
    const siteDomain = async (siteId: Id<"sites">): Promise<string | null> => {
      const cached = domainBySiteId.get(siteId);
      if (cached !== undefined) return cached;
      const site = await ctx.db.get(siteId);
      const domain = site?.domain ?? null;
      domainBySiteId.set(siteId, domain);
      return domain;
    };

    // Live rows only. Exporting the trash would resurrect things the
    // user deleted the next time they imported.
    const rows = await ctx.db
      .query("userMangas")
      .withIndex("by_user_live_added", (q) =>
        q.eq("userId", user._id).eq("isDeleted", false),
      )
      .collect();

    const mangas: MangaEntry[] = [];
    for (const row of rows) {
      const manga = await ctx.db.get(row.mangaId);
      if (manga === null) continue; // dangling catalogue reference

      const rowTags = row.tagIds
        .map((id) => tagById.get(id))
        .filter((tag): tag is Doc<"userTags"> => tag !== undefined);

      mangas.push({
        id: manga._id,
        title: manga.title,
        normalizedTitle: manga.normalizedTitle,
        altTitles: manga.altTitles,
        image: manga.image,
        type: manga.type,
        authors: manga.authors,
        tags: manga.tags,
        year: manga.year,
        status: manga.status,

        progressKey: row.progressKey,
        favourite: rowTags.some((tag) => tag.builtIn === "favourite"),
        userTags: rowTags.filter((tag) => tag.builtIn === null).map((tag) => tag.name),
        addedAt: row.addedAt,
        // readChapters is deliberately absent: it is one row per
        // chapter ever read and would dwarf the rest of the file.
        // The fields below are the progress the UI actually shows.
        currentChapterNumber: row.currentChapterNumber,
        currentChapterLabel: row.currentChapterLabel,
        currentChapterUrl: row.currentChapterUrl,
        currentPercentage: row.currentPercentage,
        currentSiteId: row.currentSiteId,
        currentSiteDomain:
          row.currentSiteId === undefined
            ? undefined
            : await siteDomain(row.currentSiteId),
        lastReadAt: row.lastReadAt,
      });
    }

    const settings = await requireSettings(ctx, user._id);

    return {
      kollect: EXPORT_FORMAT_VERSION,
      exportedAt: Date.now(),
      // activeView is a page id and means nothing elsewhere, so it is
      // left out along with the ids Convex manages.
      settings: {
        defaultProgressKey: settings.defaultProgressKey,
        autoClearTrash: settings.autoClearTrash,
        trashRetentionDays: settings.trashRetentionDays,
        autoCompleteOnFinish: settings.autoCompleteOnFinish,
        scrollThreshold: settings.scrollThreshold,
        hasPercentageBar: settings.hasPercentageBar,
        hasScreenOverlayOptions: settings.hasScreenOverlayOptions,
        theme: settings.theme,
      },
      pages: pages.map((page) => ({
        systemKey: page.systemKey,
        title: page.title,
        order: page.order,
        icon: page.icon,
        filters: page.filters,
        sort: page.sort,
      })),
      tags: tags
        .filter((tag) => tag.builtIn === null)
        .map((tag) => ({ name: tag.name })),
      mangas,
    };
  },
});

/* ═══════════════════════════════════════════════════════════════
   IMPORT

   Always additive: nothing already in the library is removed.

   When a manga in the file is already in the library (Title And
   Page, All Settings):
     chapters — the bigger chapter number becomes current; the smaller
                is saved to reading history so the user can go back
     pages    — progress page chosen by PROGRESS_PRIORITY
                (completed > reading > paused > planned)
     tags     — the file's tags, Favourite included, are added on top
                of the ones the manga already has
     trash    — left alone. Deleting was a deliberate choice, so an
                import does not undo it; the manga is listed in the
                report instead
   ═══════════════════════════════════════════════════════════════ */

export type ImportReport = {
  added: number;
  merged: number;
  alreadyInLibrary: number;
  skipped: { title: string; reason: string }[];
};

const IN_TRASH = "in your trash, so it was left there";

async function resolveManga(
  ctx: MutationCtx,
  entry: MangaEntry,
): Promise<Id<"mangas"> | null> {
  if (entry.id !== undefined) {
    const id = ctx.db.normalizeId("mangas", entry.id);
    if (id !== null && (await ctx.db.get(id)) !== null) return id;
  }

  // normalizedTitle is not unique — two series can share a name — so
  // prefer a match of the same type before falling back to the first.
  const matches = await ctx.db
    .query("mangas")
    .withIndex("by_normalizedTitle", (q) =>
      q.eq("normalizedTitle", entry.normalizedTitle),
    )
    .take(10);
  if (matches.length === 0) return null;
  return (matches.find((m) => m.type === entry.type) ?? matches[0])._id;
}

async function resolveSite(
  ctx: MutationCtx,
  idHint: string | undefined,
  domain: string | null | undefined,
): Promise<Id<"sites"> | null> {
  if (idHint !== undefined) {
    const id = ctx.db.normalizeId("sites", idHint);
    if (id !== null && (await ctx.db.get(id)) !== null) return id;
  }
  if (domain) {
    const site = await ctx.db
      .query("sites")
      .withIndex("by_domain", (q) => q.eq("domain", domain))
      .first();
    if (site !== null) return site._id;
  }
  return null;
}

type ChapterSide = {
  number?: number;
  label?: string;
  url?: string;
  percentage?: number;
  siteId?: Id<"sites">;
  lastReadAt?: number;
};

/**
 * The chapter rule: bigger number becomes current, smaller goes to
 * history. Equal numbers, or no chapter in the file, change nothing.
 */
async function mergeChapters(
  ctx: MutationCtx,
  userManga: Doc<"userMangas">,
  file: ChapterSide,
  title: string,
  report: ImportReport,
): Promise<void> {
  if (file.number === undefined) return;

  const account: ChapterSide = {
    number: userManga.currentChapterNumber,
    label: userManga.currentChapterLabel,
    url: userManga.currentChapterUrl,
    percentage: userManga.currentPercentage,
    siteId: userManga.currentSiteId,
    lastReadAt: userManga.lastReadAt,
  };

  const setCurrent = async (side: ChapterSide) => {
    // Every current-chapter field comes from the one side. Undefined
    // values deliberately clear the old ones, which described the
    // other chapter.
    await ctx.db.patch(userManga._id, {
      currentChapterNumber: side.number,
      currentChapterLabel: side.label,
      currentChapterUrl: side.url,
      currentPercentage: side.percentage,
      currentSiteId: side.siteId,
    });
  };

  if (account.number === undefined) {
    await setCurrent(file);
  } else if (file.number !== account.number) {
    const fileWins = file.number > account.number;
    const loser = fileWins ? account : file;
    if (fileWins) await setCurrent(file);

    if (loser.siteId === undefined) {
      report.skipped.push({
        title,
        reason: `chapter ${loser.number} was not saved to history because its website is unknown`,
      });
    } else {
      await recordHistory(ctx, userManga._id, {
        number: loser.number!,
        label: loser.label,
        url: loser.url,
        siteId: loser.siteId,
        percentage: loser.percentage,
        readAt: loser.lastReadAt,
      });
    }
  }

  // "Last read" describes the series, not a chapter: keep the latest.
  const lastReadAt = Math.max(account.lastReadAt ?? 0, file.lastReadAt ?? 0);
  if (lastReadAt > 0 && lastReadAt !== account.lastReadAt) {
    await ctx.db.patch(userManga._id, { lastReadAt });
  }
}

/** Step 1 (Title And Page, All Settings): creates the file's tags
    that this account doesn't have yet, matched by name. */
export const importTags = mutation({
  args: { kollect: v.number(), tags: v.array(tagEntry) },
  handler: async (ctx, { kollect, tags }) => {
    assertFormat(kollect);
    const user = await requireUser(ctx);

    let created = 0;
    for (const { name } of tags) {
      if (name.trim() === "") continue;
      if ((await findTagByName(ctx, user._id, name)) !== null) continue;
      await findOrCreateTag(ctx, user._id, name);
      created++;
    }

    return { created };
  },
});

/** Step 2: imports a batch of manga. Call it repeatedly with small
    batches and add the reports up; the extension can show each
    batch's titles while it waits. */
export const importMangas = mutation({
  args: {
    kollect: v.number(),
    // "titles" for Titles Only; "titlesAndPages" for Title And Page
    // and All Settings. Titles Only ignores the file's pages and tags.
    mode: v.union(v.literal("titles"), v.literal("titlesAndPages")),
    mangas: v.array(mangaEntry),
  },
  handler: async (ctx, { kollect, mode, mangas }): Promise<ImportReport> => {
    assertFormat(kollect);
    const user = await requireUser(ctx);
    const settings = await requireSettings(ctx, user._id);

    const report: ImportReport = {
      added: 0,
      merged: 0,
      alreadyInLibrary: 0,
      skipped: [],
    };

    const favouriteId =
      mode === "titlesAndPages" ? (await favouriteTag(ctx, user._id))._id : null;

    for (const entry of mangas) {
      const mangaId = await resolveManga(ctx, entry);
      if (mangaId === null) {
        report.skipped.push({ title: entry.title, reason: "not in the catalogue" });
        continue;
      }

      const existing = await ctx.db
        .query("userMangas")
        .withIndex("by_user_manga", (q) =>
          q.eq("userId", user._id).eq("mangaId", mangaId),
        )
        .unique();

      if (existing?.isDeleted) {
        report.skipped.push({ title: entry.title, reason: IN_TRASH });
        continue;
      }

      /* ── Titles Only ──────────────────────────────────────── */

      if (mode === "titles") {
        if (existing !== null) {
          report.alreadyInLibrary++;
        } else {
          await addToLibrary(ctx, user._id, mangaId, settings.defaultProgressKey);
          report.added++;
        }
        continue;
      }

      /* ── Title And Page ───────────────────────────────────── */

      const siteId = await resolveSite(ctx, entry.currentSiteId, entry.currentSiteDomain);
      const fileSide: ChapterSide = {
        number: entry.currentChapterNumber,
        label: entry.currentChapterLabel,
        url: entry.currentChapterUrl,
        percentage: entry.currentPercentage,
        siteId: siteId ?? undefined,
        lastReadAt: entry.lastReadAt,
      };

      // The file's tags, as this account's tag ids. A tag the account
      // doesn't have yet is created, in case importTags was skipped.
      const fileTagIds: Id<"userTags">[] = [];
      if (entry.favourite && favouriteId !== null) fileTagIds.push(favouriteId);
      for (const name of entry.userTags) {
        if (name.trim() === "") continue;
        fileTagIds.push(await findOrCreateTag(ctx, user._id, name));
      }

      if (existing === null) {
        await ctx.db.insert("userMangas", {
          userId: user._id,
          mangaId,
          addedAt: entry.addedAt,
          progressKey: entry.progressKey,
          tagIds: [...new Set(fileTagIds)],
          isDeleted: false,
          currentChapterNumber: fileSide.number,
          currentChapterLabel: fileSide.label,
          currentChapterUrl: fileSide.url,
          currentPercentage: fileSide.percentage,
          currentSiteId: fileSide.siteId,
          lastReadAt: fileSide.lastReadAt,
        });
        report.added++;
        continue;
      }

      report.merged++;
      await mergeChapters(ctx, existing, fileSide, entry.title, report);

      const target = higherPriority(existing.progressKey, entry.progressKey)!;
      if (target !== existing.progressKey) {
        await setProgressPage(ctx, existing._id, target);
      }

      const tagIds = [...new Set([...existing.tagIds, ...fileTagIds])];
      if (tagIds.length !== existing.tagIds.length) {
        await ctx.db.patch(existing._id, { tagIds });
      }
    }

    return report;
  },
});

/** Step 3 (All Settings only): same validation and trash-timer
    rewrite as the settings screen. */
export const importSettings = mutation({
  args: { kollect: v.number(), settings: settingsEntry },
  handler: async (ctx, { kollect, settings: fileSettings }) => {
    assertFormat(kollect);
    const user = await requireUser(ctx);
    const settings = await requireSettings(ctx, user._id);
    await applySettingsPatch(ctx, settings, fileSettings);
  },
});
