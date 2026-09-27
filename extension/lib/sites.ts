/**
 * The addresses the extension is allowed to run on: one pair per
 * supported reading website. Keep in step with SITE_CONFIGS in
 * convex/lib/siteConfigs.ts. When a site moves to a new address, add
 * it here (and there).
 *
 * contents/reader.tsx repeats this list, because Plasmo needs it
 * written out in that file.
 */
export const SITE_MATCHES = ["https://asurascans.com/*", "https://*.asurascans.com/*"]
