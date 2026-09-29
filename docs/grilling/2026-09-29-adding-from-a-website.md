---
date: 2026-09-29
topic: Adding manga from a reading website
tags: [grilling]
---

# Adding manga from a reading website

How adding a manga from a reading website works today, and the gaps to settle. Taken from `convex/reading.ts` and `extension/contents/reader.tsx`.

## How it works now

1. You press Add (in the Kollect button's menu, the right-click menu, or Alt+Shift+K).
2. The extension works out what kind of page you're on:
   - **A page it can read on a website it knows** (like an Asura Scans chapter). It adds the manga straight away, with no questions.
   - **A chapter page on a website it doesn't know.** The check box opens with the website name, title and chapter filled in. On Add, the website is saved as yours only, and tracking starts.
   - **Any other page** (a series page on a new site, or an address it doesn't understand). The check box opens with whatever it could find. The chapter you type becomes your current chapter.
3. The backend looks for the manga in the shared manga list. It checks this website's address for the series first, then the title across every website. Capitals and punctuation don't count. If nothing matches, it creates a new manga in the shared list, visible to everyone.
4. The manga goes into your library on the page you picked (Reading if you didn't pick one). If it's in your trash, it comes back out.

## Round 1

❓ **Q1** - **What do you want from this session?**: Check that the summary above matches what you expect and settle any gaps (a), change something specific you already have in mind (b), or get it written down as a glossary in `CONTEXT.md` (c).

➡️ (a) and (c) together, unless you have a change in mind.

---

❓ **Q2** - **Same title means same manga?**: A manga counts as the same when the titles match, even on different websites. Two different series called "Reborn" on Site A and Site B would share one card and one latest chapter. "Solo Leveling" and "Solo Leveling (Manhwa)" become two separate manga.
- (a) Keep matching on title alone.
- (b) Keep it, but when a title match comes from a different website, show the check box and ask "Is this the same as *Reborn*?"
- (c) Never match across websites by title.

➡️ (a) for now. Same-name different series are rare, and (b) adds a question to most first-time adds on a second site.

---

❓ **Q3** - **Who sees manga added from a website you added?**: A website you add is only yours, but the manga you add from it goes into the shared list, and everyone sees it in Add Manga. A title typed as "asdf" in the check box shows up in everyone's search.
- (a) Keep it. Everything goes into the shared list.
- (b) Manga that are only on websites someone added for themselves don't show in other people's Add Manga search. They appear for everyone once someone adds them from a built-in site.
- (c) Same as (b), and also let you fix the title of a manga only you have.

➡️ (b). It follows the rule that a website you add is only yours, and keeps typos out of everyone else's search.

---

❓ **Q4** - **Chapter you're on when you press Add**: On a known website, adding from chapter 50 leaves the card at "Not Started" until you scroll past your Scroll Threshold. On a page Kollect can't read, the chapter typed in the check box becomes current straight away.
- (a) Keep it. On known websites, the threshold rule applies even when you add.
- (b) When you add from a chapter page, that chapter becomes current right away, on every website.

➡️ (a). The threshold rule is already settled. The check box is different because the typed chapter is the only information Kollect gets there.

---

❓ **Q5** - **Typed chapter when the manga is already in your library**: You're on chapter 40, open a page Kollect can't read, press Add and type 55. Right now the 55 is thrown away without telling you.
- (a) Keep it. An existing current chapter always stays.
- (b) Use the import rule: the bigger number becomes current, and the smaller one goes into your reading history.
- (c) Always use what you typed.

➡️ (b). It matches how import works, and nothing gets lost without you knowing.
