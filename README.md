# Kollect

A Chrome extension for keeping track of the manga, manhwa and manhua you're reading. It remembers which chapter you're on, sorts your series into pages (Reading, Planned, Paused, Completed and Favourites), lets you label them with your own tags, and syncs everything to your account.

> **Status:** the backend (database and server functions) is in place and tested. The extension's screens are built, following the Figma design. Day-to-day work happens on `dev`; getting ready to publish happens on `Publish`. Reading tracking is built, with Asura Scans as the first site, but its page-reading rules haven't been checked against the live site yet. See [What's not built yet](#whats-not-built-yet).

## What's in this repo

| Folder | What it is |
|---|---|
| `extension/` | The main product: a Chrome extension built with [Plasmo](https://docs.plasmo.com/). |
| `app/` | A small web app. Right now it's only the sign-in and sign-up pages (`/sign-in`, `/sign-up`); the extension borrows its login from here. |
| `convex/` | The backend, running on [Convex](https://convex.dev): the database layout (`schema.ts`) and the server functions. |

Logins are handled by [Clerk](https://clerk.com).

## Getting set up

You'll need Node.js and [pnpm](https://pnpm.io). The project uses pnpm only, so use pnpm commands rather than npm or npx.

1. **Install everything:**
   ```bash
   pnpm install
   ```

2. **Set up Clerk.** In the Clerk dashboard, create a JWT template named exactly **`convex`**. Convex uses it to check who's logged in.

3. **Set up Convex.** In the Convex dashboard, go to Settings → Environment Variables and add `CLERK_JWT_ISSUER_DOMAIN`. Set it to your Clerk Frontend API address (for example `https://your-app.clerk.accounts.dev`).

4. **Fill in the environment files.**
   - `app/.env.local`: create this file with these two lines (`app/.env.development` works too):
     ```bash
     VITE_CLERK_PUBLISHABLE_KEY=pk_test_...   # Clerk dashboard → API Keys
     VITE_CONVEX_URL=https://....convex.cloud  # Convex dashboard → Settings → URL & Deploy Key
     ```
     Git ignores both files, so secret keys like `CLERK_SECRET_KEY` never get uploaded to GitHub.
   - `extension/.env.development`: needs `PLASMO_PUBLIC_CLERK_PUBLISHABLE_KEY`, `PLASMO_PUBLIC_CLERK_SYNC_HOST` (`http://localhost` in development), `PLASMO_PUBLIC_CONVEX_URL` and `PLASMO_PUBLIC_CONVEX_SITE_URL`.

   The Convex URLs **must point at the same deployment** that `pnpm dev:convex` pushes to. If they don't, the extension shows "Could not find public function".

5. **Push the backend to Convex** (leave it running; it re-pushes when you save):
   ```bash
   pnpm dev:convex
   ```

6. **Run the sign-in app** (it has to be on port 3000, because the extension's sign-in button links there):
   ```bash
   pnpm dev:app
   ```

7. **Run the extension:**
   ```bash
   pnpm dev:extension
   ```
   Then in Chrome, open `chrome://extensions`, turn on Developer mode, click "Load unpacked", and choose `extension/build/chrome-mv3-dev`.

   If a page's console (right-click → Inspect → Console) says **"Cannot find module '~lib/…'"** after you pull new code, Plasmo's saved build is out of date. Stop `pnpm dev:extension`, delete it, and start again:
   ```bash
   rm -rf extension/.plasmo extension/build/chrome-mv3-dev
   pnpm dev:extension
   ```
   Then click the reload arrow on Kollect in `chrome://extensions`.

## Looking at the screens without an account

The extension has a **preview page** that shows every screen filled with made-up manga, so you can click around without signing in or having anything in your library. Nothing you do there is saved: it all resets when you reload.

1. Run `pnpm dev:extension` and load it in Chrome (step 7 above).
2. On `chrome://extensions`, copy the Kollect extension's ID.
3. Open `chrome-extension://<the ID>/tabs/preview.html`.

Add `#sign-in` to the end of that address to see the signed-out screen, or `#reading-page` to see the Kollect button and progress bar on a pretend chapter (Add there shows the check box, then "Is it one of these?").

The made-up data lives in `extension/lib/sample.ts`.

## Trying it in Firefox

Run the sign-in app (`pnpm dev:app`) and Convex (`pnpm dev:convex`) as usual, then:

```bash
pnpm dev:firefox
```

You need Firefox installed. The command finds Firefox, Firefox Developer Edition, Firefox Nightly or Zen (a browser built on Firefox) in your Applications folder (or the one in your home folder). If yours is somewhere else, point to it: `FIREFOX_BINARY="/path/to/Firefox.app/Contents/MacOS/firefox" pnpm dev:firefox`.

This builds the extension for Firefox and opens Firefox with Kollect already loaded, using `web-ext` (Mozilla's tool for running extensions). It opens the sign-in page first: sign in there once. Firefox keeps its own profile in `extension/.firefox-profile`, so you stay signed in next time. When you change the code, the extension reloads by itself; refresh an open reading page to get the new version there. (Live reload inside reading pages is off for Firefox, because some websites' security rules block it and that stopped the Kollect button from loading.)

The Firefox build uses Manifest V3, the same extension format as Chrome. (An older Manifest V2 build didn't load.) Recent Firefox and Zen grant Kollect's website access when it's installed. If a site doesn't show the Kollect button, check that Kollect is allowed on all websites in the browser's add-ons page.

**Making a Firefox package:**

```bash
pnpm --filter extension build:firefox   # makes extension/build/extension-<version>.zip
pnpm --filter extension sign:firefox    # sends it to Mozilla to be signed as a .xpi
```

Normal Firefox only keeps extensions that Mozilla has signed. Signing needs an API key and secret from addons.mozilla.org (Tools → Manage API Keys), set as `WEB_EXT_API_KEY` and `WEB_EXT_API_SECRET` before running `sign:firefox`. The signed `.xpi` in `extension/build` can then be installed in any Firefox by dragging it into the window.

The login part (Clerk's extension package) is made with Chrome in mind, so it's the most likely thing to need changes on Firefox.

## Removing a user

```bash
pnpm users                                                           # find their id
pnpm --filter app exec convex run admin:deleteUser '{"userId": "<id>"}'
```

This removes their library, reading history, pages, tags, settings and any websites they added. Manga in the shared list stay. Their Clerk login isn't touched: if they sign in again they get a fresh, empty account, so delete them in the Clerk dashboard too if needed. You can also run both from the Convex dashboard (Functions → `admin`).

## Claude Code skills

The repo has two skills for Claude Code, in `.claude/skills/`. Type the name to run one:

- `/grill-with-docs` talks a plan through with you before building it, and keeps a glossary (`CONTEXT.md`) and decision records (`docs/adr/`) up to date as you go. It also saves each session as a Markdown file in `docs/grilling/`, which you can copy into Obsidian or another notes app. It loads two helper skills, `grilling` and `domain-modeling`, which are in the same folder. All three come from [mattpocock/skills](https://github.com/mattpocock/skills); `grill-with-docs` has been edited since.
- `unslop` keeps writing from reading like AI wrote it. It's always on: CLAUDE.md tells Claude to follow it in everything it writes. You can also type `/unslop` to run it on a piece of text.

To add your own, make a folder `.claude/skills/<name>/` with a `SKILL.md` in it: a short header (`name`, and a `description` of when to use it) and then the instructions.

## Running the tests

```bash
pnpm test
```

GitHub also runs the checks automatically on every push to `dev` or `master` and on every pull request: typechecks for all three parts, the web app's lint, and these tests. A red cross next to a commit on GitHub means one of them failed; click it to see which.

The tests run the backend functions against a fake, in-memory database, so they don't touch your real data. They live next to the code as `convex/*.test.ts`. Convex never deploys them, because its bundler skips any file name with more than one dot.

## How the extension works

The popup is 800 × 600 pixels. When you're signed out it shows the sign-in screen, with Sign In and Sign Up buttons. When you're signed in it shows your library.

| File | What it is |
|---|---|
| `popup.tsx` | The starting point. Sets up Clerk (logins) and Convex (the backend), and creates your account the first time you sign in. |
| `components/SignInScreen.tsx` | What you see when signed out: a picture of the app, the logo, and Sign In / Sign Up buttons that open the sign-in website. |
| `components/Logo.tsx` | The Kollect pin and the "KOLLECT" wordmark, drawn as SVG so they stay sharp. |
| `components/Overlay.tsx` | The Kollect button and menu for reading pages, the progress bar across the top, and the short "Added to Reading" note. |
| `contents/reader.tsx` | Runs on every website: shows the Kollect button, works out which manga and chapter the page is, shows the progress bar and reports how far you've read on sites Kollect knows, and asks you to check the details when adding on a site it doesn't. |
| `background.ts` | Works behind the scenes: holds your login, talks to Convex for reading pages, and owns the right-click menu and the Alt+Shift+K shortcut. |
| `lib/messages.ts` | The messages reading pages and the background worker send each other. |
| `components/App.tsx` | Chooses between the library and the Settings screen, and remembers which page you were on. |
| `components/ControlsBar.tsx` | The top bar: page tabs, the "all pages" dropdown, Search, Filter, Sort, Add Manga (+) and the Settings button. |
| `components/AddManga.tsx` | The Add Manga panel: search every manga people have added to Kollect (by title or alternative title, leaving out other people's private manga) and add one to the page you're on. |
| `components/Library.tsx` | Loads the manga for the page (or the trash, or your search), filters and sorts them, and shows the grid. |
| `components/CardGrid.tsx` | The grid itself. It only draws the rows you can see, plus 10 manga above and 10 below, so big libraries stay fast. |
| `components/MangaCard.tsx` | One card: cover, title, site icon, chapter and how long ago you read it. Clicking it opens the chapter you're on, or the series' page on a website (`library:cardLink` picks which). |
| `components/CardMenu.tsx` | The ⋯ menu on a card, and the Add Tags panel. |
| `components/MangaDexPicker.tsx` | Update Details → MangaDex: search MangaDex and pick the right entry. |
| `components/CardDetails.tsx` | The Details panel: chapter, last read, the site and chapter dropdowns, and the progress bar. |
| `components/PagePopups.tsx` | The Filter and Sort popups. Changes save on their own a moment after you stop clicking. |
| `components/SettingsPage.tsx` | The Settings screen: Account, General, Theme and Tags. |
| `components/ImportExport.tsx` | The Import and Export buttons, the "Importing…" screen and the import report. |
| `components/ui.tsx` | Small shared pieces: buttons, switches, dropdowns, menus and the "Are You Sure?" popup. |
| `lib/theme.ts` | Turns your theme settings (three colours and a font) into the colours the screens use. |
| `lib/data.tsx` | How screens talk to the backend. The preview page swaps it for made-up data. |
| `tabs/preview.tsx` | The preview page described above. |

**Back to where you left off.** Clicking a card opens your current chapter and jumps to how far down it you got, if you stopped partway. Opening the chapter from your browser's history or a bookmark shows a **Jump back** button instead. When a newer chapter becomes your current one, a note says "Updated to chapter 5".

**On websites.** The Kollect button shows on every website. When you open a page on a site Kollect knows, `contents/reader.tsx` reads it with the shared rules in `convex/lib/pageRead.ts` (which site, which series, which chapter, title and cover). It then asks the background worker whether that manga is in your library and what your settings are. As you scroll, it reports your progress, at most every couple of seconds and only when something changed. The server decides what counts; see [Reading tracking](#reading-tracking). Add works on every page. On a site it doesn't know, or on a page it can't read, a check box shows the website's name, the manga's title and the chapter for you to check or fill in (the chapter can be left empty). On a chapter page Kollect also learns the site's address shape (`convex/lib/pageMatch.ts`, `learnPattern`); otherwise it learns it the first time you open a chapter there. Once it knows the addresses, that website is tracked like any other, for you only. The Kollect button and progress bar are on for a new account; they can be switched off in Settings ("Kollect Options" and "Percentage Bar").

**Theme.** Your three colours set everything: *base* is the background (panels are slightly lighter or darker shades of it), *primary* is for selected things and main buttons, and *secondary* is for the progress bars. Text switches between light and dark on its own so it's always readable. The default theme is base `#1C1C1C`, primary `#D9D9D9`, secondary `#5FA8B0`, font Manrope. The fonts on offer are Manrope, Inter, Montserrat and Nunito.

**Brand.** The logo green, `#0DCF87`, is the one colour that doesn't follow your theme. The extension's toolbar icon is `extension/assets/icon.png` (512 × 512); Plasmo makes the smaller sizes from it. The picture on the signed-out screen is `extension/assets/sign-in-hero.webp`.

**Icons.** The icons come from Remix Icon, but only the ones actually used are copied into `extension/lib/icons.tsx` (the full set is 3 MB). After using a new icon, import it from `~lib/icons` and run:

```bash
pnpm --filter extension icons
```

That command finds every `Ri…` icon name in the extension's code and rewrites `lib/icons.tsx`.

## How the backend works

### Pages and tags

Every manga is on exactly one of the four progress pages: Reading, Planned, Paused or Completed. That page *is* its status. It stays on that page even in the trash, so restoring puts it back where it was.

**Tags** are your own labels, like "Murim" or "Isekai". Each has a colour, shown on its chip; new tags take the next colour from a set list unless you pick one. A manga can have as many as you like, and filters can pick manga out by tag. There are no custom pages; tags do that job instead, so nothing can clash with the built-in pages.

- You manage a list of tags. Renaming or deleting a tag changes it everywhere, and names must be unique (capitals and extra spaces are ignored).
- Deleting a tag also takes it off every manga and removes any filters that used it.
- **Favourite is a built-in tag.** It can't be renamed or deleted. The Favourites page shows every manga with that tag, from all four progress pages.

### The server functions

| File | What it handles |
|---|---|
| `users.ts` | Creating your account on first sign-in (with your settings, the five pages and the Favourite tag), and loading your account info. |
| `library.ts` | Adding manga, moving them between progress pages, reading history (listing past chapters and switching back to one), and switching which site you read a manga on. |
| `pages.ts` | Loading every manga on a page, loading the trash, searching your whole library, and saving a page's filters and sort. |
| `tags.ts` | Your tag list (create, rename, recolour, delete), tagging manga (including creating a tag by typing its name), and favouriting. |
| `trash.ts` | Moving to the trash, restoring, permanent delete, and emptying the trash. |
| `settings.ts` | Changing settings. |
| `transfer.ts` | Export (always everything) and import (in three steps, see below). |
| `sites.ts` | The list of supported reading websites. The list in `lib/siteConfigs.ts` is copied into the database automatically each time the popup opens (new sites are added; a site whose `configVersion` went up is updated). `sites:seed` does the same on demand. |
| `reading.ts` | Everything a reading page asks for: what the page is in your library, adding from the page (Kollect button, right-click, shortcut), and recording your progress. |
| `catalogue.ts` | Keeping each manga's latest chapter number up to date, and the search behind Add Manga. |
| `admin.ts` | Commands for the app's owner: listing users and removing one. Not callable from the extension or website. |
| `lib/` | Helpers shared by the files above. These aren't called directly. |

### Reading tracking

- **Only manga in your library are tracked.** Reading one you haven't added does nothing until you add it with the Kollect button, the right-click menu (Kollect → Add to Kollect / Favourite) or **Alt+Shift+K**. You can change the shortcut at `chrome://extensions/shortcuts`.
- **A chapter counts once you scroll past your Scroll Threshold** (80% by default). Then it becomes your current chapter, and the one you left goes into your reading history.
- **Adding from a chapter page starts you there.** If you have no place in the manga yet (new, not started, or back from the trash with no chapter), pressing Add on chapter 12 makes chapter 12 current straight away, at how far down it you are. The note says "Added to Reading. Now on chapter 12". A manga you're already reading isn't moved.
- **Re-reading an earlier chapter** saves it to your history, but your current chapter stays at the furthest one.
- **On your current chapter**, the percentage goes up as you read and doesn't drop if you scroll back up.
- **Auto Complete On Finish** moves a manga to Completed when you finish the newest chapter and the site says the series has ended.
- **Every visit** updates the series' latest chapter, even for manga you haven't added, as long as Kollect already knows that address.
- **Adding from a page** creates the manga in the shared manga list if nobody has added it before. Kollect goes by the page's address first. If the address doesn't settle it but a manga with the same or a close title exists, the check box asks **"Is it one of these?"** instead of guessing. Each choice shows its cover, title, latest chapter and websites, with an "On Reading" style badge if it's in your library. "No, it's new" adds a separate manga. Picking one links this website to it and saves this page's title as an alternative title. A title counts as close when one contains the other, when they share most of their words, or when it matches an alternative title (`convex/lib/matching.ts`).
- **Pressing Add on a page that isn't a manga**, on a built-in website or one of yours that has learned its chapter addresses, says "This isn't a manga page" with an **Add anyway** button that opens the check box.
- **A chapter typed in the check box** follows the import rule when you already have a current chapter: the bigger one becomes current and the smaller one goes into your reading history. The note after Add says which, for example "Already on Reading. Now on chapter 55".
- **Reading on another website:** if the page's title exactly matches a manga in your library (main or alternative title), Kollect tracks it there without asking. The first time you read it on that website, a note says it matched, with a **Not this manga?** button. That button is only for you: it takes back what Kollect saved there since the match, stops tracking it there, and leaves that manga out when you then press Add. Other people keep the link. Your own links to websites are in the `userSourceLinks` table.
- **Private manga** are ones only on websites people added for themselves. They don't show in other people's Add Manga search until someone adds them from a built-in website.
- **Adding on a website Kollect doesn't know** adds the website too, for you only. From a series page (or any page it can't read), you check the details in a box and can type the chapter you're on; the site's chapter addresses are learned the first time you open a chapter there, and tracking starts then. Kollect works out the site's chapter addresses from that page (`learnPattern` in `convex/lib/pageMatch.ts`). It understands `/‹series›/chapter/12`-style addresses, `/‹series›-chapter-12` (series and chapter in one part), and addresses with a code instead of a chapter number when the page title says which chapter it is. If it can't tell, Add still works through the check box, and the page's console (right-click → Inspect → Console) says what Kollect made of the page. Built-in websites are everyone's and win when both exist for the same address.

Each site's page-reading rules live in `convex/lib/siteConfigs.ts`: the shape of its chapter addresses (for Asura Scans, `/comics/:slug/chapter/:chapter`) and, if needed, where the title and chapter name are on the page. Without those, the title comes from the page's `og:title` tag and the chapter number from the address.

### Search

The Search box in the top bar searches your **whole library** (`pages:searchLibrary`), not just the page you're on. It matches titles and alternative titles, ignoring capitals and punctuation. Titles that start with what you typed come first, then the rest, each A to Z. Each result says which page it's on. Manga in the trash aren't included.

### Card details

The details popup has two dropdowns:

- **Site:** lists only the sites you've read that manga on, with the furthest chapter you reached on each (`library:sourcesFor`). Picking one switches you back to that site, at the furthest chapter you reached there (`library:switchSource`). Re-reading an earlier chapter doesn't move that point back. The chapter you're leaving is saved to your history first, so switching back returns you to it.
- **Chapter:** your reading history (`library:chapterHistory`). Picking a chapter makes it current again (`library:switchToHistoryChapter`), and the chapter you left is kept in history.

### Sorting and filtering

The server returns every manga on a page, along with that page's saved sort and filter settings. The extension does the sorting and filtering itself, and only draws the manga that are on screen.

The filter matching lives in `convex/lib/filters.ts`. It's plain code with no database access, so the extension can use the exact same rules. Pass each manga from the page loader through `toFilterable`, then call `matchesAllFilters`.

| Filter | Options |
|---|---|
| Last read chapter | greater than, equal, less than, between |
| Latest chapter | greater than, equal, less than, between |
| Date added (in days ago) | greater than, less than, between |
| Source | equal (the site you're reading it on now), contains (any site you've read it on, from your reading history) |
| Tag | has, doesn't have |
| Progress | Not started (no current chapter yet), Started |

A page's filters and sort are saved on the page with `pages:setFilters` and `pages:setSort`. "Clear All" saves an empty list.

A manga has to pass *every* filter on the page. "Between" includes both ends. A manga with no value for a field (for example, one you haven't started) doesn't match filters on that field. Progress is the exception: it's there to find exactly those.

The sorting rules live in `convex/lib/sort.ts`, also plain code the extension can use. Call `sortMangas` with the page's items, its sort rows, and a map of site names (from `sites:list`) for the Sources option.

| Sort | Orders by |
|---|---|
| Last Read | when you last read it |
| Date Added | when you added it |
| Read Chapters | the chapter you're on |
| Latest Chapter | the newest chapter out |
| Sources | the name of the site you're reading it on, A to Z |
| Title | the title, ignoring capitals |

The first sort row decides the order, and each later row only breaks ties. Manga with no value for a field (for example, never read) go to the end, whichever direction you pick.

### Export and import

Export always saves everything: each manga with its page, tags and progress, your page list, your tag list, and your settings.

Import has three options:

| Option | What it brings in |
|---|---|
| Title only | Just the manga. New ones go on your default page. Manga you already have aren't changed. |
| Title Page | The manga, which page they're on, their tags (Favourite included), and your reading progress. |
| All Settings | Everything in Title Page, plus your settings. |

Import happens in steps, so the extension can show "Importing *[title]*…" as it goes:

1. `transfer:importTags`: creates any tags you don't have yet (Title Page and All Settings only).
2. `transfer:importMangas`: called over and over, a small batch of manga at a time.
3. `transfer:importSettings`: applies the settings (All Settings only).

Every step is safe to run twice, so an import that gets cut off can simply be started again.

### Import rules

- Import never removes anything.
- If a manga is already in your library, the bigger chapter number becomes current and the smaller one is saved to your reading history.
- If the pages disagree, the higher-priority page wins: Completed, then Reading, then Paused, then Planned.
- The file's tags, Favourite included, are added on top of the ones a manga already has.
- Manga in your trash stay in the trash.
- Settings are only imported with All Settings.
- Manga the app doesn't recognise are skipped and listed in the import report.

### Details from MangaDex

When a manga is first added to the shared list, and every Sunday for all manga, Kollect looks it up on [MangaDex](https://mangadex.org) (`convex/mangadex.ts`). It takes the first search result and saves its cover (replacing the website's), its English, Latin-alphabet and original-language titles as alternative titles, its latest chapter (counted like one more website, so the highest number wins) and its series status (only when no reading website gave one). The lookups are spaced out to stay under MangaDex's limit of about 5 requests a second. The code that reads MangaDex's answers is in `convex/lib/mangadex.ts`, with tests.

When the first result is wrong, anyone can fix it from the card menu: **Update Details → MangaDex** searches MangaDex (the box starts with the title and can be changed) and lists every result with its cover, type, year and status. Picking one updates the cover, other titles, latest chapter and status for everyone, and sets MangaDex's title as your own title. A note at the bottom of the popup then says "Updated <title> from MangaDex". The old entry's titles are removed first. The Details panel links to the MangaDex entry ("Details from MangaDex"). The admin can also relink one by hand: `pnpm --filter app exec convex run mangadex:lookup '{"mangaId": "<id>", "mangadexId": "<id>"}'`.

### Your own title

Click a manga's title in its Details panel to give it your own title. Only you see it, on cards, in Details, in library search and when sorting by Title, and it's part of your export. Clear the box to go back to the shared title.

### Scheduled jobs

| When | What |
|---|---|
| Every Sunday, 03:00 UTC | Look every manga up on MangaDex again (cover, titles, latest chapter, status). |
| Every Sunday, 04:00 UTC | Refresh each manga's latest chapter number. |
| Every day, 05:00 UTC | Permanently delete trash that has passed its "Clear Trash Time". Skipped for anyone who has Auto Clear Trash turned off. |

## What's not built yet


Ideas saved for later are listed in CLAUDE.md under "For the future".


- **Checking Asura Scans against the real site.** Its address (`asurascans.com/comics/<series>/chapter/<n>`) is checked, but the title still comes from the page's `og:title` tag, which hasn't been checked. It may also need selectors for the newest chapter and whether the series has ended.
- **More built-in reading websites.** Only Asura Scans so far; others can be added by users for themselves. There's no screen yet to see, rename or remove the websites you've added.
- **The weekly latest-chapter job's lookup.** Page visits keep the latest chapter up to date, but the weekly job's own lookup is still a placeholder.
- **Removing the preview page before release.** `tabs/preview.html` is handy while designing, but it ships inside the extension, so it should be taken out (or hidden) before the extension is published.
- **Production builds.** `plasmo build` only reads `extension/.env.chrome`, which doesn't have the Clerk or Convex settings yet, so a production build won't work until they're added there.
