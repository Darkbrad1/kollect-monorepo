import type { WithoutSystemFields } from "convex/server";
import type { Doc } from "../_generated/dataModel";

/**
 * The reading websites Kollect supports. They're copied into the sites
 * table automatically (see syncSites in lib/sites.ts): new ones are
 * added, and one whose configVersion went up is replaced. So after
 * changing a site's rules, bump its configVersion. The extension reads
 * the table, so most fixes don't need a new release.
 *
 * The extension also has to be allowed onto each domain: keep
 * SITE_DOMAINS in extension/lib/sites.ts in step with this list.
 *
 * Fields, in plain words:
 * - slugPattern: the shape of a chapter address. ":slug" is the part
 *   naming the series, ":chapter" the part naming the chapter. The same
 *   address cut off after :slug is the series page.
 * - titleSelector / chapterSelector: where on the page the series
 *   title and the chapter name are (CSS selectors). Without one, the
 *   title comes from the page's og:title tag and the chapter from the
 *   address.
 * - titlePath / chapterPath: the same, read from data the site embeds
 *   in the page (for example "props.pageProps.series.title").
 * - seriesLinkSelector: a link on a chapter page back to the series,
 *   for sites whose chapter addresses don't name the series.
 */
export const SITE_CONFIGS: WithoutSystemFields<Doc<"sites">>[] = [
  {
    // Address checked against a real chapter page
    // (asurascans.com/comics/the-hero-cannot-rest-05c7df14/chapter/1).
    // The title still comes from og:title until that's checked too.
    domain: "asurascans.com",
    title: "Asura Scans",
    link: "https://asurascans.com",
    icon: "https://asurascans.com/favicon.ico",
    slugPattern: "/comics/:slug/chapter/:chapter",
    chapterInUrl: true,
    caseSensitive: false,
    configVersion: 2,
  },
];
