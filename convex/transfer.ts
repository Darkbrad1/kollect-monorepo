import { v, type Infer } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { requireSettings, requireUser } from "./lib/auth";
import { higherPriority, isProgressKey, type ProgressKey } from "./lib/constants";
import { addToLibrary, recordHistory } from "./lib/library";
import {
  currentProgressKey,
  ensureMembership,
  placeOnProgressPage,
} from "./lib/pages";
import { applySettingsPatch } from "./lib/settings";
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

   Two shapes, chosen from the dropdown beside the Export button:

     "full"   — Full backup. Pages, membership, reading progress and
                settings. Enough to rebuild the library as it was.
     "titles" — Titles only. Just the manga, for sharing a list or
                starting over on another account.

   Import reads `kind` off the file rather than asking again, so the
   discriminator is load-bearing. `kollect` is a format version: when
   the shape changes, an old file should be rejected with a clear
   message instead of importing halfway.

   Catalogue references. `mangas` and `sites` are shared by every
   account, so a file exported from this deployment names rows that
   already exist here. Each reference carries two keys: the row's id,
   tried first, and a natural key (normalizedTitle / domain) as the
   fallback for a file from another deployment or a site whose id no
   longer resolves. Import never creates catalogue rows — an unknown
   manga is skipped and reported instead.

   Per-user rows (pages, library entries) have no stable id across
   accounts, so pages are referenced by a `ref` string and manga by
   index into the `mangas` array.
   ═══════════════════════════════════════════════════════════════ */

export const EXPORT_FORMAT_VERSION = 1;

/* ── file format validators ─────────────────────────────────── */

const mangaEntry = v.object({
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
});

const pageEntry = v.object({
  ref: v.string(),
  title: v.string(),
  order: v.number(),
  type: v.union(v.literal("system"), v.literal("custom")),
  systemKey,
  icon: v.optional(v.string()),
  filters: v.array(filterRule),
  sort: v.array(sortRule),
});

const itemEntry = v.object({
  m: v.number(), // index into mangas
  pages: v.array(v.string()), // page refs
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

const exportFile = v.union(
  v.object({
    kollect: v.number(),
    kind: v.literal("titles"),
    exportedAt: v.number(),
    mangas: v.array(mangaEntry),
  }),
  v.object({
    kollect: v.number(),
    kind: v.literal("full"),
    exportedAt: v.number(),
    mangas: v.array(mangaEntry),
    pages: v.array(pageEntry),
    items: v.array(itemEntry),
    settings: settingsEntry,
  }),
);

type MangaEntry = Infer<typeof mangaEntry>;
type PageEntry = Infer<typeof pageEntry>;

/* ═══════════════════════════════════════════════════════════════
   EXPORT
   ═══════════════════════════════════════════════════════════════ */

/** Stable cross-account identifier for a page. */
function pageRef(page: Doc<"userPages">): string {
  return page.systemKey ?? `custom:${page.title}`;
}

function toMangaEntry(manga: Doc<"mangas">): MangaEntry {
  return {
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
  };
}

export const exportLibrary = query({
  args: { kind: v.union(v.literal("full"), v.literal("titles")) },
  handler: async (ctx, { kind }) => {
    const user = await requireUser(ctx);

    // Live rows only. Exporting the trash would resurrect things the
    // user deleted the next time they imported.
    const rows = await ctx.db
      .query("userMangas")
      .withIndex("by_user_live_added", (q) =>
        q.eq("userId", user._id).eq("isDeleted", false),
      )
      .collect();

    const mangas: MangaEntry[] = [];
    const indexByMangaId = new Map<Id<"mangas">, number>();
    const liveRows: Doc<"userMangas">[] = [];

    for (const row of rows) {
      const manga = await ctx.db.get(row.mangaId);
      if (manga === null) continue; // dangling catalogue reference

      if (!indexByMangaId.has(row.mangaId)) {
        indexByMangaId.set(row.mangaId, mangas.length);
        mangas.push(toMangaEntry(manga));
      }
      liveRows.push(row);
    }

    if (kind === "titles") {
      return {
        kollect: EXPORT_FORMAT_VERSION,
        kind,
        exportedAt: Date.now(),
        mangas,
      };
    }

    /* ── full backup ──────────────────────────────────────────── */

    const pages = await ctx.db
      .query("userPages")
      .withIndex("by_user_order", (q) => q.eq("userId", user._id))
      .collect();

    const refByPageId = new Map<Id<"userPages">, string>();
    for (const page of pages) refByPageId.set(page._id, pageRef(page));

    // sites is tiny; cache lookups so a library sharing one source
    // doesn't re-read the same row per row.
    const domainBySiteId = new Map<Id<"sites">, string | null>();
    const siteDomain = async (siteId: Id<"sites">): Promise<string | null> => {
      const cached = domainBySiteId.get(siteId);
      if (cached !== undefined) return cached;
      const site = await ctx.db.get(siteId);
      const domain = site?.domain ?? null;
      domainBySiteId.set(siteId, domain);
      return domain;
    };

    const items = [];
    for (const row of liveRows) {
      const memberships = await ctx.db
        .query("userPageMangas")
        .withIndex("by_userManga", (q) => q.eq("userMangaId", row._id))
        .collect();

      const refs: string[] = [];
      for (const membership of memberships) {
        const ref = refByPageId.get(membership.pageId);
        if (ref !== undefined) refs.push(ref);
      }

      items.push({
        m: indexByMangaId.get(row.mangaId)!,
        pages: refs,
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
      kind,
      exportedAt: Date.now(),
      mangas,
      pages: pages.map((page) => ({
        ref: pageRef(page),
        title: page.title,
        order: page.order,
        type: page.type,
        systemKey: page.systemKey,
        icon: page.icon,
        filters: page.filters,
        sort: page.sort,
      })),
      items,
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
    };
  },
});

/* ═══════════════════════════════════════════════════════════════
   IMPORT

   Always additive: nothing already in the library is removed.

   When a manga in the file is already in the library:
     chapters — the bigger chapter number becomes current; the smaller
                is saved to reading history so the user can go back
     pages    — progress page chosen by PROGRESS_PRIORITY
                (completed > reading > paused > planned); favourites
                and custom pages from the file are added on top
     trash    — left alone. Deleting was a deliberate choice, so an
                import does not undo it; the manga is listed in the
                report instead

   Settings in a Full backup are applied only when the user ticks the
   option to include them — importing someone else's backup should
   not quietly replace your theme.
   ═══════════════════════════════════════════════════════════════ */

type ImportReport = {
  added: number;
  merged: number;
  alreadyInLibrary: number;
  skipped: { title: string; reason: string }[];
};

const IN_TRASH = "in your trash, so it was left there";

async function isInTrash(
  ctx: MutationCtx,
  userId: Id<"users">,
  mangaId: Id<"mangas">,
): Promise<boolean> {
  const row = await ctx.db
    .query("userMangas")
    .withIndex("by_user_manga", (q) =>
      q.eq("userId", userId).eq("mangaId", mangaId),
    )
    .unique();
  return row !== null && row.isDeleted;
}

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

/** Maps each page ref in the file to a page in this account, creating
    custom pages the account doesn't have. Existing pages keep their
    own title, filters and sort. */
async function ensurePages(
  ctx: MutationCtx,
  userId: Id<"users">,
  filePages: PageEntry[],
): Promise<Map<string, Id<"userPages">>> {
  const existing = await ctx.db
    .query("userPages")
    .withIndex("by_user_order", (q) => q.eq("userId", userId))
    .collect();

  const idByRef = new Map<string, Id<"userPages">>();
  let nextOrder = 0;
  for (const page of existing) {
    idByRef.set(pageRef(page), page._id);
    nextOrder = Math.max(nextOrder, page.order + 1);
  }

  for (const page of filePages) {
    if (idByRef.has(page.ref)) continue;
    // Every account has every system page, so an unknown system ref
    // comes from a different format version. Nothing to create.
    if (page.type === "system") continue;

    const id = await ctx.db.insert("userPages", {
      userId,
      title: page.title,
      order: nextOrder++,
      type: "custom",
      systemKey: null,
      icon: page.icon,
      filters: page.filters,
      sort: page.sort,
    });
    idByRef.set(page.ref, id);
  }

  return idByRef;
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

export const importLibrary = mutation({
  args: {
    file: exportFile,
    // The "also import settings" choice shown during import. Ignored
    // for Titles only files, which carry no settings.
    includeSettings: v.boolean(),
  },
  handler: async (ctx, { file, includeSettings }): Promise<ImportReport> => {
    if (file.kollect !== EXPORT_FORMAT_VERSION) {
      throw new Error(
        `This file uses export format ${file.kollect}; this version of Kollect reads format ${EXPORT_FORMAT_VERSION}.`,
      );
    }

    const user = await requireUser(ctx);
    const settings = await requireSettings(ctx, user._id);

    const report: ImportReport = {
      added: 0,
      merged: 0,
      alreadyInLibrary: 0,
      skipped: [],
    };

    const mangaIds: (Id<"mangas"> | null)[] = [];
    for (const entry of file.mangas) {
      mangaIds.push(await resolveManga(ctx, entry));
    }

    /* ── Titles only ──────────────────────────────────────────── */

    if (file.kind === "titles") {
      for (const [i, entry] of file.mangas.entries()) {
        const mangaId = mangaIds[i];
        if (mangaId === null) {
          report.skipped.push({ title: entry.title, reason: "not in the catalogue" });
          continue;
        }
        if (await isInTrash(ctx, user._id, mangaId)) {
          report.skipped.push({ title: entry.title, reason: IN_TRASH });
          continue;
        }
        const { action } = await addToLibrary(
          ctx,
          user._id,
          mangaId,
          settings.defaultProgressKey,
        );
        if (action === "created") report.added++;
        else report.alreadyInLibrary++;
      }
      return report;
    }

    /* ── Full backup ──────────────────────────────────────────── */

    const pageIdByRef = await ensurePages(ctx, user._id, file.pages);

    for (const item of file.items) {
      const entry = file.mangas[item.m];
      if (entry === undefined) {
        report.skipped.push({
          title: `entry #${item.m}`,
          reason: "the file refers to a manga it does not contain",
        });
        continue;
      }
      const mangaId = mangaIds[item.m];
      if (mangaId === null) {
        report.skipped.push({ title: entry.title, reason: "not in the catalogue" });
        continue;
      }

      const siteId = await resolveSite(ctx, item.currentSiteId, item.currentSiteDomain);
      const fileSide: ChapterSide = {
        number: item.currentChapterNumber,
        label: item.currentChapterLabel,
        url: item.currentChapterUrl,
        percentage: item.currentPercentage,
        siteId: siteId ?? undefined,
        lastReadAt: item.lastReadAt,
      };

      const fileKey =
        (item.pages.find((ref) => isProgressKey(ref)) as ProgressKey | undefined) ??
        null;
      const extraPageIds = item.pages
        .filter((ref) => !isProgressKey(ref))
        .map((ref) => pageIdByRef.get(ref))
        .filter((id): id is Id<"userPages"> => id !== undefined);

      const existing = await ctx.db
        .query("userMangas")
        .withIndex("by_user_manga", (q) =>
          q.eq("userId", user._id).eq("mangaId", mangaId),
        )
        .unique();

      if (existing === null) {
        const userMangaId = await ctx.db.insert("userMangas", {
          userId: user._id,
          mangaId,
          addedAt: item.addedAt,
          isDeleted: false,
          currentChapterNumber: fileSide.number,
          currentChapterLabel: fileSide.label,
          currentChapterUrl: fileSide.url,
          currentPercentage: fileSide.percentage,
          currentSiteId: fileSide.siteId,
          lastReadAt: fileSide.lastReadAt,
        });
        await placeOnProgressPage(
          ctx,
          user._id,
          userMangaId,
          fileKey ?? settings.defaultProgressKey,
        );
        for (const pageId of extraPageIds) {
          await ensureMembership(ctx, pageId, userMangaId);
        }
        report.added++;
        continue;
      }

      if (existing.isDeleted) {
        report.skipped.push({ title: entry.title, reason: IN_TRASH });
        continue;
      }
      report.merged++;

      await mergeChapters(ctx, existing, fileSide, entry.title, report);

      const accountKey = await currentProgressKey(ctx, existing._id);
      const target =
        higherPriority(accountKey, fileKey) ?? settings.defaultProgressKey;
      if (target !== accountKey) {
        await placeOnProgressPage(ctx, user._id, existing._id, target);
      }
      for (const pageId of extraPageIds) {
        await ensureMembership(ctx, pageId, existing._id);
      }
    }

    // Same validation and retention rewrite as the settings screen.
    if (includeSettings) {
      await applySettingsPatch(ctx, settings, file.settings);
    }

    return report;
  },
});
