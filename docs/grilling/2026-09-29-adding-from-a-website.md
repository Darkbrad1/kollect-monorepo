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

❓ **Q1** - **What do you want from this session?**: Check that the summary above matches what you expect and settle the gaps below, change something specific you already have in mind, or both.
- [ ] (a) Settle the gaps below.
- [ ] (b) Change something specific (say what).
- [ ] (c) Both.

➡️ (a), unless you have a change in mind.

---

❓ **Q2** - **When is it the same manga?**: A manga counts as the same when the title matches exactly, ignoring capitals and punctuation. That fails both ways. "Solo Leveling" on one site and "Only I Level Up" on another become two manga, so you can end up with both in your library. Two different series both called "Reborn" become one manga, sharing one card and one latest chapter.
- [ ] (a) Keep matching on the exact title alone.
- [ ] (b) When the title match comes from a different website, or there are close titles, show the check box and ask "Is it one of these?", with a "No, it's new" option.
- [ ] (c) Never match across websites by title.

➡️ (b). It only asks when there's real doubt, so most adds stay one click, and you decide instead of Kollect guessing.

---

❓ **Q3** - **Who sees manga added from a website you added?**: A website you add is only yours, but a manga you add from it goes into the shared list, and everyone sees it in Add Manga. A title typed as "asdf" in the check box shows up in everyone's search.
- [ ] (a) Keep it. Everything goes into the shared list.
- [ ] (b) Manga that are only on websites someone added for themselves don't show in other people's Add Manga search. They appear for everyone once someone adds them from a built-in site.
- [ ] (c) Same as (b), and also let you fix the title of a manga only you have.

➡️ (b). It follows the rule that a website you add is only yours, and keeps typos out of everyone else's search.

---

❓ **Q4** - **Chapter you're on when you press Add**: On a known website, adding from chapter 50 leaves the card at "Not Started" until you scroll past your Scroll Threshold. On a page Kollect can't read, the chapter typed in the check box becomes current straight away.
- [ ] (a) Keep it. On known websites, the threshold rule applies even when you add.
- [ ] (b) When you add from a chapter page, that chapter becomes current right away (at 0%), on every website.

➡️ (a). The threshold rule is already settled. The downside: if you add and close the tab before scrolling, the card says "Not Started".

---

❓ **Q5** - **Typed chapter when the manga is already in your library**: You're on chapter 40, open a page Kollect can't read, press Add and type 55. Right now the 55 is thrown away without telling you.
- [ ] (a) Keep it. An existing current chapter always stays.
- [ ] (b) Use the import rule: the bigger number becomes current, and the smaller one goes into your reading history.
- [ ] (c) Always use what you typed.

➡️ (b). It matches how import works, and nothing gets lost without you knowing.

---

❓ **Q6** - **Pressing Add on a page that isn't a manga**: On a home page or search page, Add opens the check box with the page title, such as "Asura Scans - Home". Clicking Add in the box saves that as a manga.
- [ ] (a) Keep it. The box opens and you fix the title.
- [ ] (b) On websites Kollect knows, say "This isn't a manga page" and don't open the box. On unknown websites, keep the box.
- [ ] (c) Only allow Add on pages Kollect recognises as a series or chapter page.

➡️ (b). On a known website Kollect can tell a manga page from the home page, so the box there is almost always a mistake. On unknown websites the box is the only way in.
