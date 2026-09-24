# Kollect

A Chrome extension for keeping track of the manga, manhwa and manhua you're reading. It remembers which chapter you're on, sorts your series into pages (Reading, Planned, Paused, Completed and Favourites), lets you label them with your own tags, and syncs everything to your account.

> **Status:** the backend (database and server functions) is in place and tested. The extension's screens are being designed in Figma and haven't been built yet. See [What's not built yet](#whats-not-built-yet).

## What's in this repo

| Folder | What it is |
|---|---|
| `extension/` | The main product: a Chrome extension built with [Plasmo](https://docs.plasmo.com/). |
| `app/` | A small web app. Right now it's only the sign-in page; the extension borrows its login from here. |
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
   - `app/.env.local`: copy `app/.env.example` and fill in `VITE_CLERK_PUBLISHABLE_KEY` and `VITE_CONVEX_URL`.
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

## Running the tests

```bash
pnpm test
```

The tests run the backend functions against a fake, in-memory database, so they don't touch your real data. They live next to the code as `convex/*.test.ts`. Convex never deploys them, because its bundler skips any file name with more than one dot.

## How the backend works

### Pages and tags

Every manga is on exactly one of the four progress pages: Reading, Planned, Paused or Completed. That page *is* its status. It stays on that page even in the trash, so restoring puts it back where it was.

**Tags** are your own labels, like "Murim" or "Isekai". A manga can have as many as you like, and filters can pick manga out by tag. There are no custom pages; tags do that job instead, so nothing can clash with the built-in pages.

- You manage a list of tags. Renaming or deleting a tag changes it everywhere, and names must be unique (capitals and extra spaces are ignored).
- Deleting a tag also takes it off every manga and removes any filters that used it.
- **Favourite is a built-in tag.** It can't be renamed or deleted. The Favourites page shows every manga with that tag, from all four progress pages.

### The server functions

| File | What it handles |
|---|---|
| `users.ts` | Creating your account on first sign-in (with your settings, the five pages and the Favourite tag), and loading your account info. |
| `library.ts` | Adding manga, moving them between progress pages, and reading history (listing past chapters and switching back to one). |
| `pages.ts` | Loading every manga on a page, and loading the trash. |
| `tags.ts` | Your tag list (create, rename, delete), tagging manga, and favouriting. |
| `trash.ts` | Moving to the trash, restoring, permanent delete, and emptying the trash. |
| `settings.ts` | Changing settings. |
| `transfer.ts` | Export (always everything) and import (in three steps, see below). |
| `sites.ts` | The list of supported reading websites. |
| `catalogue.ts` | Keeping each manga's latest chapter number up to date. |
| `lib/` | Helpers shared by the files above. These aren't called directly. |

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

A manga has to pass *every* filter on the page. "Between" includes both ends. A manga with no value for a field (for example, one you haven't started) doesn't match filters on that field.

### Export and import

Export always saves everything: each manga with its page, tags and progress, your page list, your tag list, and your settings.

Import has three options:

| Option | What it brings in |
|---|---|
| Titles Only | Just the manga. New ones go on your default page. Manga you already have aren't changed. |
| Title And Page | The manga, which page they're on, their tags (Favourite included), and your reading progress. |
| All Settings | Everything in Title And Page, plus your settings. |

Import happens in steps, so the extension can show "Importing *[title]*…" as it goes:

1. `transfer:importTags`: creates any tags you don't have yet (Title And Page and All Settings only).
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

### Scheduled jobs

| When | What |
|---|---|
| Every Sunday, 04:00 UTC | Refresh each manga's latest chapter number. |
| Every day, 05:00 UTC | Permanently delete trash that has passed its "Clear Trash Time". Skipped for anyone who has Auto Clear Trash turned off. |

## What's not built yet

- **The extension's screens.** On hold until the design is final. The popup is still a placeholder.
- **Backend pieces the screens will need:**
  - Saving a page's filters and sort. The filter rules exist, but nothing saves them to a page yet.
  - The final list of sort options.
- **Reading tracking.** On hold until the design is final. Nothing watches reading sites yet, so chapters don't update on their own. When it's built, the reading page will talk to the backend directly, so it works even when the popup is closed.
- **Latest-chapter lookups.** The weekly job runs, but the part that actually looks up each series' newest chapter is a placeholder until reading websites are added.
- **Production builds.** `plasmo build` only reads `extension/.env.chrome`, which doesn't have the Clerk or Convex settings yet, so a production build won't work until they're added there.
- **Automatic checks on GitHub.** Tests only run when someone runs `pnpm test`. Nothing runs them automatically on a pull request yet.
