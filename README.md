# Kollect

A Chrome extension for keeping track of the manga, manhwa and manhua you're reading. It remembers which chapter you're on, sorts your series into pages (Reading, Planned, Paused, Completed, Favourites, plus your own), and syncs everything to your account.

> **Status:** the backend (database and server functions) is in place and tested. The extension's screens are being designed in Figma and haven't been built yet. See [What's not built yet](#whats-not-built-yet).

## What's in this repo

| Folder | What it is |
|---|---|
| `extension/` | The main product: a Chrome extension built with [Plasmo](https://docs.plasmo.com/). |
| `app/` | A small web app. Right now it's only the sign-in page; the extension borrows its login from here. |
| `convex/` | The backend, running on [Convex](https://convex.dev): the database layout (`schema.ts`) and the server functions. |

Logins are handled by [Clerk](https://clerk.com).

## Getting set up

You'll need Node.js and [pnpm](https://pnpm.io).

1. **Install everything:**
   ```bash
   pnpm install
   ```

2. **Set up Clerk.** In the Clerk dashboard, create a JWT template named exactly **`convex`**. Convex uses it to check who's logged in.

3. **Set up Convex.** In the Convex dashboard, go to Settings → Environment Variables and add `CLERK_JWT_ISSUER_DOMAIN`. Set it to your Clerk Frontend API address (for example `https://your-app.clerk.accounts.dev`).

4. **Fill in the environment files.**
   - `app/.env.local`: copy `app/.env.example` and fill in `VITE_CLERK_PUBLISHABLE_KEY` and `VITE_CONVEX_URL`.
   - `extension/.env.development`: needs `PLASMO_PUBLIC_CLERK_PUBLISHABLE_KEY`, `PLASMO_PUBLIC_CLERK_SYNC_HOST` (`http://localhost` in development), `PLASMO_PUBLIC_CONVEX_URL` and `PLASMO_PUBLIC_CONVEX_SITE_URL`.

   The Convex URLs **must point at the same deployment** that `npx convex dev` pushes to. If they don't, the extension shows "Could not find public function".

5. **Push the backend to Convex** (leave it running; it re-pushes when you save):
   ```bash
   cd app && npx convex dev
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

### Pages are the status

A manga's status isn't stored as a label. It's *which page it's on*. Every manga that isn't in the trash sits on exactly one of the four progress pages (Reading, Planned, Paused, Completed). Favourites and your own custom pages are extra, and a manga can be on as many of those as you like.

### The server functions

| File | What it handles |
|---|---|
| `users.ts` | Creating your account on first sign-in (with your settings and the five built-in pages), and loading your account info. |
| `library.ts` | Adding manga, moving them between progress pages, and reading history (listing past chapters and switching back to one). |
| `pages.ts` | Loading every manga on a page, and loading the trash. |
| `trash.ts` | Moving to the trash, restoring, permanent delete, and emptying the trash. |
| `settings.ts` | Changing settings. |
| `transfer.ts` | Export ("Full backup" or "Titles only") and import. |
| `sites.ts` | The list of supported reading websites. |
| `catalogue.ts` | Keeping each manga's latest chapter number up to date. |
| `lib/` | Helpers shared by the files above. These aren't called directly. |

### Sorting and filtering

The server returns every manga on a page, along with that page's saved sort and filter settings. The extension does the sorting and filtering itself, and only draws the manga that are on screen.

### Import rules

- Import never removes anything.
- If a manga is already in your library, the bigger chapter number becomes current and the smaller one is saved to your reading history.
- If the pages disagree, the higher-priority page wins: Completed, then Reading, then Paused, then Planned.
- Manga in your trash stay in the trash.
- Settings are only imported if you choose to include them.
- Manga the app doesn't recognise are skipped and listed in the import report.

### Scheduled jobs

| When | What |
|---|---|
| Every Sunday, 04:00 UTC | Refresh each manga's latest chapter number. |
| Every day, 05:00 UTC | Permanently delete trash that has passed its "Clear Trash Time". Skipped for anyone who has Auto Clear Trash turned off. |

## What's not built yet

- **The extension's screens.** The popup is still a placeholder while the Figma design is finished.
- **Reading tracking.** Nothing watches reading sites yet, so chapters don't update on their own.
- **Latest-chapter lookups.** The weekly job runs, but the part that actually looks up each series' newest chapter is a placeholder until reading websites are added.
- **Filters.** The filter settings need their final list of fields and operators.
- **Production builds.** `plasmo build` only reads `extension/.env.chrome`, which doesn't have the Clerk or Convex settings yet, so a production build won't work until they're added there.
