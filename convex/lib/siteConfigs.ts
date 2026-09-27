import type { WithoutSystemFields } from "convex/server";
import type { Doc } from "../_generated/dataModel";

/**
 * The reading websites Kollect supports. `sites:seed` copies this list
 * into the sites table (run it after changing anything here); the
 * extension reads the table, so most fixes don't need a new release.
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
    // NOT CHECKED AGAINST THE LIVE SITE YET: the address shape is from
    // memory, and there are no selectors, so it relies on og:title
    // and the chapter number in the address.
    domain: "asuracomic.net",
    title: "Asura Scans",
    link: "https://asuracomic.net",
    icon: "https://asuracomic.net/favicon.ico",
    slugPattern: "/series/:slug/chapter/:chapter",
    chapterInUrl: true,
    caseSensitive: false,
    configVersion: 1,
  },
];
