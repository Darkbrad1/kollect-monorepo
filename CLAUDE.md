# Kollect

A browser extension for keeping track of the manga, manhwa and manhua you're reading.

## How to work with me

- **Explain things at a beginner level.** Write it the way you'd explain it to a first-year student: plain words, short sentences, everyday comparisons. Avoid jargon, and when you have to use a technical term, say what it means.
- **Ask me before making product decisions.** If a choice changes how the app behaves for the user (how a feature works, what happens in an edge case, what something is called), lay out the options, say which one you'd pick and why, and let me choose. Don't decide quietly.
- **Technical choices are yours.** If a choice doesn't change what the user sees or experiences, go ahead and decide it. Just tell me what you picked.
- **I use pnpm, not npm.** I don't have npm installed, so `npm` and `npx` commands won't work for me. Always give pnpm commands: `pnpm <script>`, `pnpm exec <tool>` for a tool installed in the project, or `pnpm dlx <tool>` for one that isn't.
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
- `pnpm dev:extension`: runs the extension in development
- `pnpm --filter app exec convex <command>`: any other Convex command, for example `dashboard` or `run`

## Decisions already made

These were settled with me, so don't reopen them without asking.

- **Pages:** four progress pages (Reading, Planned, Paused, Completed) plus Favourites. There is no "Dropped" page. "Deleted" in the menu is the trash view, not a page. There are **no custom pages**: tags replace them (see below).
- **Being on a page *is* the status.** Every manga that isn't in the trash sits on exactly one progress page. Status changes always go through `moveToProgressPage`.
- **Sorting and filtering happen in the extension, not in Convex.** Convex only stores each page's filter and sort settings and returns every manga on the page. The extension shows about 10 on screen and loads 10 ahead and 10 behind as you scroll.
- **Deleting:** deleting moves a manga to the trash. Deleting from the trash page removes it permanently, after the user confirms.
- **Trash settings:** "Auto Clear Trash" is its own on/off switch, separate from "Clear Trash Time", so switching it off doesn't lose the number of days.
- **Scroll threshold:** a value from 0 to 100.
- **Export:** always exports everything: every manga with its pages and reading progress, the page list, and the settings.
- **Import:** the user picks one of three options from a dropdown:
  - **Titles Only:** just the manga. New ones land on the default page. Manga already in the library aren't changed.
  - **Title And Page:** the manga, which pages they're on, and reading progress.
  - **All Settings:** everything in Title And Page, plus the settings.
- **Import rules:**
  - It never removes anything.
  - When a manga is already in the library, the bigger chapter number becomes current and the smaller one is saved to reading history.
  - When the pages disagree, priority is Completed, then Reading, then Paused, then Planned.
  - Manga in the trash stay in the trash.
  - Manga the app doesn't recognise are skipped and listed in the import report. They are never added to the shared manga list. This only happens when a file comes from a different database (for example development vs. the real app), so real users won't see it.
  - Settings are only imported with the All Settings option.
  - Import runs in small batches so the extension can show "Importing *[title]*…" while it works.
- **Filters:** every filter on a page must match. The options are:
  - **Last read chapter** and **Latest chapter:** greater than, equal, less than, between.
  - **Date added:** greater than, less than, between, counted in days ago. "Greater than 7" means added more than 7 days ago.
  - **Source:** equal means the site you're reading it on now. Contains means any site you've read it on before, from your reading history (the current site counts too).
  - "Between" includes both ends. A manga with no value for a field (for example, never read) doesn't match filters on that field.
- **Tags** (decided, not built yet; the details are still being settled):
  - Users put their own tags on manga instead of making custom pages, so nothing can clash with the built-in pages.
  - Tags can be used in filters.
  - **Favourite is a tag.** The Favourites page stays, but it shows the manga that have the Favourite tag, instead of holding its own list.
- **Reading tracking** (for later): the reading page talks to the backend directly, whether or not the popup is open. Don't route it through the popup.
- **On hold:** the extension screens and reading tracking wait until the design is final. Don't start them unless asked.
- **The latest chapter** for each manga is stored on the manga itself and refreshed by a weekly job.
