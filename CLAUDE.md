# Kollect

A browser extension for keeping track of the manga, manhwa and manhua you're reading.

## How to work with me

- **Explain things at a beginner level.** Write it the way you'd explain it to a first-year student: plain words, short sentences, everyday comparisons. Avoid jargon, and when you have to use a technical term, say what it means.
- **Ask me before making product decisions.** If a choice changes how the app behaves for the user (how a feature works, what happens in an edge case, what something is called), lay out the options, say which one you'd pick and why, and let me choose. Don't decide quietly.
- **Technical choices are yours.** If a choice doesn't change what the user sees or experiences, go ahead and decide it. Just tell me what you picked.

## The project

- `extension/` is the main product: a Chrome extension built with Plasmo. The Figma design is entirely for this.
- `app/` is a small web app. For now it's only the Clerk sign-in page that the extension syncs its login from. Don't build features here unless asked.
- `convex/` is the backend: the database schema (`schema.ts`) and all the server functions.

Useful commands:

- `pnpm test`: runs the backend tests (`convex/*.test.ts`)
- `npx convex dev` (run from `app/`): pushes the schema and functions to Convex, typechecks them, and regenerates `convex/_generated`
- `pnpm dev:extension`: runs the extension in development

## Decisions already made

These were settled with me, so don't reopen them without asking.

- **Pages:** four progress pages (Reading, Planned, Paused, Completed) plus Favourites. There is no "Dropped" page. "Deleted" in the menu is the trash view, not a page.
- **Being on a page *is* the status.** Every manga that isn't in the trash sits on exactly one progress page. Status changes always go through `moveToProgressPage`.
- **Sorting and filtering happen in the extension, not in Convex.** Convex only stores each page's filter and sort settings and returns every manga on the page. The extension shows about 10 on screen and loads 10 ahead and 10 behind as you scroll.
- **Deleting:** deleting moves a manga to the trash. Deleting from the trash page removes it permanently, after the user confirms.
- **Trash settings:** "Auto Clear Trash" is its own on/off switch, separate from "Clear Trash Time", so switching it off doesn't lose the number of days.
- **Scroll threshold:** a value from 0 to 100.
- **Export:** two options, "Full backup" (pages, progress and settings) and "Titles only" (just the list).
- **Import:**
  - It never removes anything.
  - When a manga is already in the library, the bigger chapter number becomes current and the smaller one is saved to reading history.
  - When the pages disagree, priority is Completed, then Reading, then Paused, then Planned.
  - Manga in the trash stay in the trash.
  - Settings are only imported if the user ticks the option to include them.
- **The latest chapter** for each manga is stored on the manga itself and refreshed by a weekly job.
