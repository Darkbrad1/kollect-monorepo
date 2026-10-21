import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { SITE_CONFIGS } from "./siteConfigs";

/**
 * Brings the sites table in line with SITE_CONFIGS: adds missing sites,
 * and replaces a site whose configVersion in the list is higher than in
 * the table. Sites no longer in the list are left alone, since manga may
 * point at them. Cheap when nothing changed (one lookup per site), so
 * createUser runs it on every popup open; that way nobody has to seed
 * the table by hand.
 */
export async function syncSites(ctx: MutationCtx) {
  const result = { added: [] as string[], updated: [] as string[] };
  for (const config of SITE_CONFIGS) {
    const existing = await ctx.db
      .query("sites")
      .withIndex("by_domain_addedBy", (q) => q.eq("domain", config.domain).eq("addedBy", undefined))
      .unique();
    if (existing === null) {
      await ctx.db.insert("sites", config);
      result.added.push(config.domain);
    } else if (existing.configVersion < config.configVersion) {
      await ctx.db.replace(existing._id, config);
      result.updated.push(config.domain);
    }
  }
  return result;
}

/** Built-in sites are everyone's; a site a user added is only theirs. */
export function canUseSite(site: Doc<"sites">, userId: Id<"users"> | null): boolean {
  return site.addedBy === undefined || site.addedBy === userId;
}

/** The site for a domain as this user sees it: the built-in one if there
    is one, otherwise the one they added themselves. */
export async function siteForDomain(
  ctx: QueryCtx,
  domain: string,
  userId: Id<"users"> | null,
): Promise<Doc<"sites"> | null> {
  const clean = domain.toLowerCase();
  const builtIn = await ctx.db
    .query("sites")
    .withIndex("by_domain_addedBy", (q) => q.eq("domain", clean).eq("addedBy", undefined))
    .unique();
  if (builtIn !== null || userId === null) return builtIn;
  return await ctx.db
    .query("sites")
    .withIndex("by_domain_addedBy", (q) => q.eq("domain", clean).eq("addedBy", userId))
    .unique();
}
