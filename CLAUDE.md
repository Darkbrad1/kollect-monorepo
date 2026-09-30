# Kollect

A browser extension for keeping track of the manga, manhwa and manhua you're reading.

## How to work with me

- **Explain things at a beginner level.** Write it the way you'd explain it to a first-year student: plain words, short sentences, everyday comparisons. Avoid jargon, and when you have to use a technical term, say what it means.
- **Ask me before making product decisions.** If a choice changes how the app behaves for the user (how a feature works, what happens in an edge case, what something is called), lay out the options, say which one you'd pick and why, and let me choose. Don't decide quietly.
- **Technical choices are yours.** If a choice doesn't change what the user sees or experiences, go ahead and decide it. Just tell me what you picked.
- **I use pnpm, not npm.** I don't have npm installed, so `npm` and `npx` commands won't work for me. Always give pnpm commands: `pnpm <script>`, `pnpm exec <tool>` for a tool installed in the project, or `pnpm dlx <tool>` for one that isn't.
- **Write without AI tells, always.** Every reply, doc, commit message, code comment and piece of text you write follows `.claude/skills/unslop/SKILL.md`: plain words, no filler, no em dashes, sentence-case headings, and the rest of its rules. Check your writing against it before sending.
- **Keep the docs up to date as you go.** Whenever a change affects how something works, how to set it up, or a decision we made, update both files in the same commit:
  - `CLAUDE.md` (this file): how to work with me, and the decisions we've settled.
  - `README.md`: what the project is, how to set it up and run it, how it works, and what isn't built yet.

## The project

- `extension/` is the main product: a Chrome extension built with Plasmo. The Figma design is entirely for this.
- `app/` is a small web app. For now it's only the Clerk sign-in page that the extension syncs its login from. Don't build features here unless asked.
- `convex/` is the backend: the database schema (`schema.ts`) and all the server functions.

Useful commands:

- `pnpm test`: runs the backend tests (`convex/*.test.ts`)
- `pnpm dev:convex`: pushes the schema and functions to Convex, typechecks them, and regenerates `convex/_generated`. It runs inside `app/`, where the Convex project settings live.
- `pnpm dev:app`: runs the sign-in web app on port 3000
- `pnpm dev:extension`: runs the extension in development (Chrome)
- `pnpm dev:firefox`: the same for Firefox. Builds into `extension/build/firefox-mv3-dev` and opens Firefox with Kollect loaded, using `web-ext` (Mozilla's tool). Firefox keeps its own profile in `extension/.firefox-profile`, so your login survives between runs. It finds Firefox, Firefox Developer Edition, Nightly or Zen in the usual places; set `FIREFOX_BINARY` to use another. It runs Plasmo with `--no-cs-reload`: Firefox applies a website's security rules to the reading-page script, and sites that block its live-reload connection (atsu.moe) stopped the whole script. Refresh a reading page after a code change.
- `pnpm --filter extension build:firefox`: a Firefox release package (`extension/build/*.zip`). `pnpm --filter extension sign:firefox` gets it signed by Mozilla as a `.xpi` that normal Firefox can install for good; it needs `WEB_EXT_API_KEY` and `WEB_EXT_API_SECRET` from addons.mozilla.org.
- `pnpm users`: lists everyone with an account (id, name, how many manga, websites they added)
- `pnpm --filter app exec convex run admin:deleteUser '{"userId": "<id>"}'`: removes a user and everything of theirs (library, history, pages, tags, settings, websites they added). Shared manga stay. It doesn't delete their Clerk login. Both commands can also be run from the Convex dashboard's Functions page.
- `pnpm --filter app exec convex <command>`: any other Convex command, for example `dashboard` or `run`
- `pnpm --filter app exec convex run sites:seed`: copies the supported reading websites into the database right away. Normally not needed: it happens automatically each time the popup opens.
- `pnpm --filter extension icons`: rewrites `extension/lib/icons.tsx` with every Remix icon the extension uses. Run it after using a new icon.

## Project skills

Skills live in `.claude/skills/<name>/SKILL.md`. The grilling skills come from [mattpocock/skills](https://github.com/mattpocock/skills) (MIT licence; see `.claude/skills/LICENSE-mattpocock-skills`). They were copied unchanged, except for `grill-with-docs`: its `SKILL.md` description and `reference.md` were rewritten to follow `unslop`, and its `SKILL.md` adds the session notes file.

- `/grill-with-docs` (only when typed): interviews me about a plan and writes the docs as it goes. It works by loading the two skills below, so keep all three.
  - `grilling`: the interview. Questions come in numbered rounds, each with a recommended answer; it looks up facts itself and leaves decisions to me.
  - `domain-modeling`: the paper trail. Settled terms go into `CONTEXT.md` (a glossary, format in `domain-modeling/CONTEXT-FORMAT.md`), and hard-to-reverse decisions become ADRs in `docs/adr/` (format in `domain-modeling/ADR-FORMAT.md`).
  - Session notes: each session is also written to a Markdown file in `docs/grilling/` (questions, my answers, and what was settled), so I can copy it into Obsidian.
  - Background in `.claude/skills/grill-with-docs/reference.md`. The `agents/openai.yaml` files are for other AI tools and don't affect Claude Code.
- `unslop` (always on): the writing rules for everything Claude writes here (no filler, fancy words, em dashes and so on). "How to work with me" above makes it apply all the time; `/unslop` also runs it on a piece of text you give it.

## Extension code conventions

- Import icons from `~lib/icons`, never from `@remixicon/react` directly (the full package is 3 MB). Then run `pnpm --filter extension icons`.
- Screens reach the backend through `useQ`, `useM` and `useOnce` from `~lib/data`, not Convex's hooks directly, so the preview page can swap in made-up data.
- When a screen starts using a new backend function, add a fake version of it to `extension/lib/sample.ts` so the preview page keeps working.
- **Built-in reading websites** (the ones everyone gets) live in `SITE_CONFIGS` in `convex/lib/siteConfigs.ts`. When changing an existing site's rules, bump its `configVersion` so the database copy gets updated. The extension runs on every website, so there's no address list to keep in step.
- Colours come from the theme (`bg-surface`, `text-muted`, `bg-primary` and so on in Tailwind). Don't hard-code colours, or the user's theme won't apply. The one exception is `brand`, the logo green.

## For the future (not now)

Ideas to come back to. Don't start them unless asked.

- **A public page on the web app.** Visitors who aren't signed in see a list of every website users have added, with no duplicates.
- **Your catalogue on the web app.** Signed in, you can see your whole library there too.
- **A proper way to remove users**, friendlier than the `admin:deleteUser` command, for example also removing their Clerk login.

## Decisions already made

These were settled with me, so don't reopen them without asking.

- **Pages:** four progress pages (Reading, Planned, Paused, Completed) plus Favourites. There is no "Dropped" page. "Deleted" in the menu is the trash view, not a page. There are **no custom pages**: tags replace them (see below).
- **Being on a page *is* the status.** Every manga sits on exactly one progress page, stored as `progressKey` on the manga. It keeps it in the trash, so restoring puts it back. Status changes always go through `moveToProgressPage`.
- **Sort options:** Last Read, Date Added, Read Chapters (the chapter you're on), Latest Chapter, Sources (the site you're reading on, A to Z) and Title, each ascending or descending. A page can have several; the first decides the order and later ones break ties. Manga with no value for a field go last either way.
- **Sorting and filtering happen in the extension, not in Convex.** Convex only stores each page's filter and sort settings and returns every manga on the page. The extension shows about 10 on screen and loads 10 ahead and 10 behind as you scroll.
- **Deleting:** deleting moves a manga to the trash. Deleting from the trash page removes it permanently, after the user confirms.
- **Trash settings:** "Auto Clear Trash" is its own on/off switch, separate from "Clear Trash Time", so switching it off doesn't lose the number of days.
- **Scroll threshold:** a whole number from 0 to 100. The +/− buttons move it by 1, and you can also click the number and type an exact value (like 16 or 17).
- **Number boxes** (Scroll Threshold, Clear Trash Time): click the number to type a value; Enter or clicking away saves it, Escape cancels, and values outside the allowed range snap to the nearest end.
- **Export:** always exports everything: every manga with its page, tags and reading progress, the page list, the tag list, and the settings.
- **Import:** the user picks one of three options from a dropdown:
  - **Title only:** just the manga. New ones land on the default page. Manga already in the library aren't changed.
  - **Title Page:** the manga, which page they're on, their tags (Favourite included), and reading progress.
  - **All Settings:** everything in Title Page, plus the settings.
- **Import rules:**
  - It never removes anything.
  - When a manga is already in the library, the bigger chapter number becomes current and the smaller one is saved to reading history.
  - When the pages disagree, priority is Completed, then Reading, then Paused, then Planned.
  - The file's tags are added on top of the ones a manga already has.
  - Manga in the trash stay in the trash.
  - Manga the app doesn't recognise are skipped and listed in the import report. They are never added to the shared manga list. This only happens when a file comes from a different database (for example development vs. the real app), so real users won't see it.
  - Settings are only imported with the All Settings option.
  - Import runs in small batches so the extension can show "Importing *[title]*…" while it works.
- **Filters:** every filter on a page must match. The options are:
  - **Last read chapter** and **Latest chapter:** greater than, equal, less than, between.
  - **Date added:** greater than, less than, between, counted in days ago. "Greater than 7" means added more than 7 days ago.
  - **Source:** equal means the site you're reading it on now. Contains means any site you've read it on before, from your reading history (the current site counts too).
  - **Tag:** has, doesn't have.
  - "Between" includes both ends. A manga with no value for a field (for example, never read) doesn't match filters on that field.
- **Tags:**
  - Users put their own tags on manga instead of making custom pages, so nothing can clash with the built-in pages. Tags can be used in filters.
  - Tags are the user's own labels only, not the series' genres (genre filtering may come later).
  - Users manage a list of tags. Renaming or deleting a tag changes it everywhere. Names are unique, ignoring capitals and extra spaces. Deleting a tag also removes it from every manga and from any filters that used it.
  - **Each tag has a colour**, shown on its chip. New tags take the next colour from a set list unless one is picked, and the colour can be changed later.
  - **Settings has a Tags section** (Search/Create Tags, Add Tag, and the tag chips). It replaces the old Pages section. The card menu's **Add Tags** has the same Search/Create box: typing a new name creates the tag and adds it.
  - **Favourite is a built-in tag.** It can't be renamed or deleted. The "Favourite" item in the card menu adds or removes it. The Favourites page shows every manga with the Favourite tag, from all four progress pages.
- **Card details:**
  - The site dropdown lists **only the sites you've read that manga on**, not every site that has it.
  - Picking a site **switches back to reading it there, at the furthest chapter you reached on that site**, along with that chapter's link and percentage. Going back to re-read an earlier chapter doesn't change this: read up to 40, re-read 10, and you land on 40.
  - The chapter you're leaving is saved to your history first, so switching back returns you to it. The site you left still counts as one you've read it on.
  - The chapter dropdown is the reading history; picking a chapter switches back to it.
  - The slider in card details only **shows** reading progress; it can't be dragged to change it.
  - The top bar has two layout styles in the design. They work the same way, so the backend treats them the same.
- **Search** (top bar) searches the **whole library**, not just the page you're on, by title and alternative titles. Capitals and punctuation don't matter. Titles that start with what you typed come first. Manga in the trash aren't included.
- **Secret keys never go in git.** `app/.env.local` and `app/.env.development` are ignored, so keys like `CLERK_SECRET_KEY` stay on your computer. There's no example env file for the web app; the README lists the two values it needs. The extension's `.env` files only hold public values (publishable key, public URLs), so they're tracked.
- **Automatic checks:** every push to `dev` or `master`, and every pull request, runs the typechecks, the web app's lint, and the backend tests on GitHub (`.github/workflows/checks.yml`). Keep them passing.
- **Reading tracking** works whether or not the popup is open. The reading page (content script) asks the background worker, which holds the login and talks to Convex. Nothing goes through the popup.
- **Tracking rules** (`convex/reading.ts`):
  - Only manga in your library are tracked. Reading one you haven't added does nothing until you add it (Kollect button, right-click menu, or Alt+Shift+K).
  - A chapter becomes your current chapter once you've scrolled past your Scroll Threshold, not when you open it.
  - Going back to an earlier chapter saves it to your history but keeps your current (furthest) chapter. On your current chapter, the percentage goes up as you read and doesn't drop if you scroll back up.
  - **Auto Complete On Finish** moves a manga to Completed when you finish the newest chapter *and* the site says the series has ended.
  - **The latest chapter** is updated whenever you visit a series or chapter page, plus the weekly job as a backup.
  - Adding from a page creates the manga in the shared manga list if it's new (unlike import, which never does).
- **Which manga a page is** (settled in `docs/grilling/2026-09-29-adding-from-a-website.md`, built in `convex/reading.ts` and `convex/lib/matching.ts`):
  - By address first: your own link (`userSourceLinks`), then the shared one (`mangaSources`), unless you said "Not this manga?" to it.
  - **A close title** is one that contains the other, shares most of its words, or matches an alternative title.
  - **Add asks "Is it one of these?"** when the address doesn't settle it and a title is the same or close, including the same title at a different address on the same website. Each choice shows cover, title, latest chapter and websites, with an "On <page>" badge if you have it. "No, it's new" makes a separate manga. Picking one links the website to it and saves the page's title as an alternative title, from any website.
  - **Reading on another website** tracks an exact title match (main or alternative) with a manga in your library without asking. The first time each person reads that manga on that website, a note says it matched, with **Not this manga?**. That button is only for you: it takes back what was saved there since the match, stops tracking it there, and leaves that manga out when you then press Add; your pick is only yours. Everyone else keeps the link. Close titles are never tracked without asking.
  - **Private manga** (only on own websites) are hidden only from other people's Add Manga search. They still show in "Is it one of these?". When one goes public, its title stays the main title and the built-in website's title becomes an alternative title.
  - **Title typos** in the shared list are fixed by the admin from the Convex dashboard.
- **Your own title** (`userMangas.customTitle`): everyone can give a manga their own title, which only they see. Click the title in the Details panel to type it: Enter or clicking away saves, Escape cancels, and an empty box (or the shared title typed back) goes back to the shared title. It shows everywhere in your library: cards, Details, Copy Title, library search (which also still matches the shared and alternative titles), sorting by Title, and export and import (`ownTitle`; import never replaces one you already have). Add Manga and "Is it one of these?" show the shared title, because they show the shared list. The latest chapter stays shared; only your current chapter is yours.
  - **On a known website**, Add still waits for the Scroll Threshold before a chapter becomes current.
  - **A typed chapter** for a manga you already have follows the import rule (bigger is current, smaller goes to history), and the note after Add says what happened ("Already on Reading. Now on chapter 55").
  - **Add on a page that isn't a manga**, on a built-in website or an own website that has learned its chapter addresses, says "This isn't a manga page" with **Add anyway**, which opens the check box. Other websites open the check box straight away.
  - Notes with a button ("Not this manga?", "Add anyway") stay until you use the button or close them.
- **The Kollect button shows on every website**, so the extension asks for access to all websites (Chrome warns "Read and change all your data on all websites" when installing). **Add works on every page**: where Kollect can't read the page by itself, the check box opens instead (see below).
- **Firefox uses Manifest V3**, like Chrome (`--target=firefox-mv3`, built into `build/firefox-mv3-dev` and `build/firefox-mv3-prod`). The Manifest V2 build didn't load. Recent Firefox and Zen grant the website access at install.
- **Adding on a website Kollect doesn't know:**
  - **Address shapes it understands:** series and chapter as separate parts (`/comics/‹series›/chapter/12`, `/manga/‹series›/chapter-12`, `/read/‹series›/12`); both in one part (`/‹series›-chapter-12`); and a code instead of a chapter number (`/series/‹series›/a8f3c91e`) when the page title names the chapter ("… Chapter 201"), which is then where the number comes from. If the title names a different chapter than a number in the address, the title wins.
  - **The check box** opens when adding on a website Kollect doesn't know, or on any page it can't read (a series page on a new site, an address it doesn't understand). It shows what Kollect found: the website's name (new websites only), the manga's title, and the chapter, all editable. The chapter can be left empty ("Not Started"). On a chapter page it also shows the chapter-address shape it learned (like `/comics/‹series›/chapter/‹chapter›`), and tracking starts straight away.
  - **Learning later:** a website added from a page where Kollect couldn't learn its chapter addresses is saved without them. The first time you open a chapter page there that Kollect can read, it learns the addresses (`reading:learnSitePattern`) and tracking starts. A chapter typed in the box follows the import rule (see "Which manga a page is").
  - **A website you add is only yours** (`sites.addedBy`). Built-in sites (no `addedBy`) are everyone's, and win when both exist for the same address. Good user-added sites can later be moved into the built-in list. Import never links you to a site someone else added.
- **The Kollect button and progress bar are on by default** for new accounts. Existing accounts keep whatever they had.
- **Settings on reading pages:** "Percentage Bar" in Settings and "Show Progress Bar" in the Kollect menu are the same switch. "Kollect Options" switched off hides only the Kollect button; tracking, the right-click menu and the shortcut keep working.
- **On reading websites** (the Figma frame is called "on website"):
  - **Right-click menu** (on every website): a Kollect menu with "Add" and "Favourite". Add puts the manga on **Reading**. Favourite on a manga that isn't in the library yet adds it to Reading *and* favourites it, in one step.
  - **Keyboard shortcut** to add a manga: **Alt+Shift+K** by default. Users can change it in the browser's shortcut settings.
  - **The overlay** is a round Kollect button in the bottom-left corner. It sits at **40% opacity** and fades to full when the mouse is over it (and stays full while its menu is open). Its menu has Add To Reading / Planned / Paused / Completed (the page the manga is on is highlighted), Show Progress Bar, and Change Scroll Threshold.
  - **The progress bar** is a thin bar across the very top of the reading page showing how far down the chapter you are.
  - After adding from the right-click menu or the shortcut, a short note ("Added to Reading", "Already on Planned") appears beside the Kollect button for 3 seconds.
  - **"Updated to chapter 5"** shows for 3 seconds when a chapter becomes your current one (you scrolled past your Scroll Threshold on a newer chapter). The "Matched to…" note wins when both happen at once.
  - **Back to where you left off:** clicking a card in Kollect opens your current chapter and jumps to the percentage you reached, with a 3-second note "Back to where you were (42%)". It only jumps when you stopped partway (above 0% and below 100%); a finished chapter opens at the top. The page is scrolled straight away, then corrected for up to 8 seconds while images load, and it stops the moment you scroll yourself (wheel, touch, keys or a click). Opening that chapter some other way (browser history, a bookmark) doesn't jump: a note says "You stopped at 42% of this chapter." with a **Jump back** button. The background worker opens the tab from the card, so it knows which tab should jump (`openAt` and `jump` in `lib/messages.ts`).
- **Reading websites:** start with one site, **Asura Scans** (`asurascans.com`, chapter addresses like `/comics/<series>/chapter/<n>`), get it fully working, then add others. The address is checked; the title (from `og:title`) isn't yet.
- **The extension screens** follow the Figma design (built on the old `design` branch, now merged into `dev`). These parts weren't in the Figma design and were confirmed afterwards:
  - **Cards:** clicking anywhere on a card opens the manga in a new tab (the ⋯ button and right-click open the menu). It opens the chapter you're on; without one, the series' page on the website you last read it on, then the website you added it from, then any built-in website (`library:cardLink`). With no link at all, a note says "Kollect doesn't have a link for this manga yet. Open it from its website and press Add." Trash cards open the same way. Details opens as a side panel next to the ⋯ menu. The menu says "Unfavourite" when the manga is already a favourite. Favourite is hidden from tag lists (Add Tags, Settings → Tags). Trash cards show "N Days Left" and their Details panel is look-only. A manga you haven't started shows "Not Started".
  - **Top bar:** the ⌄ button lists every page by name. Filter and Sort are greyed out in the trash and while searching. Search results show a badge saying which page each manga is on. Empty pages show a short message.
  - **Filter and Sort** save on their own a moment after you stop clicking. A new sort row starts as Dec, and each sort option can only be used once.
  - **Settings** opens as a full screen with a Back button. Clear Trash Time moves 1 day at a time and is greyed out when Auto Clear Trash is off. Fonts: Manrope, Inter, Montserrat, Nunito. Clicking a tag chip opens an editor (name, colour, Save, Delete with confirmation).
  - **Import** shows a full "Importing *title*…" screen with a progress bar, then a report (Added, Merged, Already Had, Skipped).
  - **Reading-page button:** the progress bar uses the theme's secondary colour. The button stays solid while its menu is open. The page the manga is on is highlighted in the menu; picking another moves it.
  - **Reading-page menu size:** 12px text (the design shows about 8px, too small to read) and a 32px button, so it's easy to click.
- **Add Manga (+ in the top bar):** searches every manga anyone has added to Kollect, by title and alternative title, leaving out other people's private manga. New ones go on the page you're looking at (Reading, Planned, Paused or Completed), or Reading from Favourites, the trash or a search. Ones you already have show "On <page>"; ones in your trash show Restore. If nothing matches, it says to add it from its website with the Kollect button.
- **A manga you haven't started** shows "Not Started" on its card, even when the latest chapter is known.
- **Default theme:** base `#1C1C1C`, primary `#D9D9D9`, secondary `#5FA8B0`, font Manrope.
- **Brand:** the logo green is `#0DCF87` (`brand` in Tailwind). It's used for the logo and the signed-out screen, and doesn't change with the theme. The logo is traced as an SVG in `components/Logo.tsx`; the extension icon (`extension/assets/icon.png`) is made from it.
- **Signed-out screen:** a picture of the app on the left; the logo, "Kollect and save your favourite manga's", **Sign In** and **Sign Up** on the right. Both buttons open the sign-in website (`/sign-in` and `/sign-up`).
- **The latest chapter** for each manga is stored on the manga itself, refreshed by page visits and a weekly job.
- **Details from MangaDex** (`convex/mangadex.ts`, `convex/lib/mangadex.ts`):
  - Each manga is looked up when it's first added to the shared list, and again by a weekly job (Sunday 03:00 UTC), which also covers older manga.
  - It's found by searching its title and taking the first result. The admin can relink one by hand with `mangadex:lookup` and a `mangadexId`.
  - **Update Details → MangaDex** in the card menu (not in the trash): a search box filled in with the title you see, results as you type (cover, title, type, year, status), and a "Linked now" badge on the current entry. Picking one changes the cover, other titles, latest chapter and status for everyone, and makes MangaDex's title your own title only. Update Details is a submenu so other places to get details from can be added later. After a pick, the menu closes and a note at the bottom of the popup says "Updated <title> from MangaDex" for 3 seconds.
  - Relinking removes the old entry's alternative titles first; titles saved from reading websites stay.
  - The card's Details panel has a "Details from MangaDex" link to the linked entry.
  - Covers load without sending the page address (`referrerPolicy="no-referrer"`), because MangaDex refuses covers asked for from other websites.
  - The MangaDex cover always replaces the website's.
  - Alternative titles saved: English, ones in the Latin alphabet (like "Na Honjaman Level Up"), and the original-language title.
  - Its latest chapter counts like one more website: the highest number wins.
  - Its series status is used when no reading website has given one; a website's status wins.
