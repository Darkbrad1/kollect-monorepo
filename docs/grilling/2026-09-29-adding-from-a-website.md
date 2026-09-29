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
- [x] (a) Settle the gaps below.
- [ ] (b) Change something specific (say what).
- [ ] (c) Both.

➡️ (a), unless you have a change in mind.

**Answer:** (a) Settle the gaps.

---

❓ **Q2** - **When is it the same manga?**: A manga counts as the same when the title matches exactly, ignoring capitals and punctuation. That fails both ways. "Solo Leveling" on one site and "Only I Level Up" on another become two manga, so you can end up with both in your library. Two different series both called "Reborn" become one manga, sharing one card and one latest chapter.
- [ ] (a) Keep matching on the exact title alone.
- [x] (b) When the title match comes from a different website, or there are close titles, show the check box and ask "Is it one of these?", with a "No, it's new" option.
- [ ] (c) Never match across websites by title.

➡️ (b). It only asks when there's real doubt, so most adds stay one click, and you decide instead of Kollect guessing.

**Answer:** (b) Ask "Is it one of these?" when the match is by title from another website, or titles are close.

---

❓ **Q3** - **Who sees manga added from a website you added?**: A website you add is only yours, but a manga you add from it goes into the shared list, and everyone sees it in Add Manga. A title typed as "asdf" in the check box shows up in everyone's search.
- [ ] (a) Keep it. Everything goes into the shared list.
- [x] (b) Manga that are only on websites someone added for themselves don't show in other people's Add Manga search. They appear for everyone once someone adds them from a built-in site.
- [ ] (c) Same as (b), and also let you fix the title of a manga only you have.

➡️ (b). It follows the rule that a website you add is only yours, and keeps typos out of everyone else's search.

**Answer:** (b) Manga only on someone's own websites are hidden from other people until someone adds them from a built-in website.

---

❓ **Q4** - **Chapter you're on when you press Add**: On a known website, adding from chapter 50 leaves the card at "Not Started" until you scroll past your Scroll Threshold. On a page Kollect can't read, the chapter typed in the check box becomes current straight away.
- [x] (a) Keep it. On known websites, the threshold rule applies even when you add.
- [ ] (b) When you add from a chapter page, that chapter becomes current right away (at 0%), on every website.

➡️ (a). The threshold rule is already settled. The downside: if you add and close the tab before scrolling, the card says "Not Started".

**Answer:** (a) Keep the Scroll Threshold rule when adding on known websites.

---

❓ **Q5** - **Typed chapter when the manga is already in your library**: You're on chapter 40, open a page Kollect can't read, press Add and type 55. Right now the 55 is thrown away without telling you.
- [ ] (a) Keep it. An existing current chapter always stays.
- [x] (b) Use the import rule: the bigger number becomes current, and the smaller one goes into your reading history.
- [ ] (c) Always use what you typed.

➡️ (b). It matches how import works, and nothing gets lost without you knowing.

**Answer:** (b) Use the import rule: bigger number becomes current, smaller one goes to reading history.

---

❓ **Q6** - **Pressing Add on a page that isn't a manga**: On a home page or search page, Add opens the check box with the page title, such as "Asura Scans - Home". Clicking Add in the box saves that as a manga.
- [ ] (a) Keep it. The box opens and you fix the title.
- [x] (b) On websites Kollect knows, say "This isn't a manga page" and don't open the box. On unknown websites, keep the box.
- [ ] (c) Only allow Add on pages Kollect recognises as a series or chapter page.

➡️ (b). On a known website Kollect can tell a manga page from the home page, so the box there is almost always a mistake. On unknown websites the box is the only way in.

**Answer:** (b) On known websites, say "This isn't a manga page" instead of opening the check box. Unknown websites keep the box.

## Round 2

❓ **Q1** - **What counts as a "close" title?**: From round 1, the check box asks "Is it one of these?" when titles are close. Kollect needs a rule for "close".

- [ ] (a) One title contains the other ("Solo Leveling" and "Solo Leveling (Manhwa)").
- [ ] (b) (a), or the titles share most of their words ("The Hero Cannot Rest" and "Hero Cannot Rest Anymore").
- [ ] (c) (b), and also check each manga's other known titles (alternative titles), not just the main one.

➡️ (c). Alternative titles are how "Only I Level Up" can ever find "Solo Leveling". (b) alone would miss every translated title.

---

❓ **Q2** - **What each choice in "Is it one of these?" shows**: Two series called "Reborn" look the same by name, so each choice needs something to tell them apart.

- [ ] (a) Title only.
- [ ] (b) Cover, title and latest chapter.
- [ ] (c) Cover, title, latest chapter, and the websites it's on.

➡️ (c). The cover and the websites are what tell two "Reborn"s apart at a glance.

---

❓ **Q3** - **Remember the answer**: You pick "Solo Leveling" when adding "Only I Level Up". Kollect already remembers this website's address for it, so this website never asks again. Should the title "Only I Level Up" also be saved as another name for "Solo Leveling", so other websites and other users match it without asking?

- [ ] (a) No, only remember this website's address.
- [ ] (b) Yes, always save the title as another name.
- [ ] (c) Yes, but only when it comes from a built-in website. A title from an own website isn't saved, so a typo there doesn't reach anyone else.

➡️ (c). It fits your round 1 answer that own websites stay private.

---

❓ **Q4** - **Same title, same website, different address**: You add "Reborn" on a website where Kollect already has a "Reborn" at a different address. Today Kollect assumes the website moved the series to a new address and links them without asking.

- [ ] (a) Keep it: treat it as the same manga at a new address.
- [ ] (b) Ask with the check box, like a title match from another website.

➡️ (b). A website moving a series and a website having two series with one name look the same to Kollect, and only you can tell them apart. It's rare, so the extra question costs little.

---

❓ **Q5** - **Where private manga are hidden**: I'm calling a manga that's only on own websites a "private manga". From round 1, other people don't see it in Add Manga. Two more places could show it: the "Is it one of these?" list, and matching when someone else adds the same title from their own copy of the same website.

- [ ] (a) Hide it only from the Add Manga search.
- [ ] (b) Hide it everywhere for other people. If they add the same title from their own website, they get their own private manga.

➡️ (b). Otherwise your typed title would show up on someone else's card. The cost is that two users could each have their own private copy of one series for a while.

---

❓ **Q6** - **When a private manga goes public**: Someone adds "Solo Leveling" from a built-in website, and it matches your private manga, which you titled "solo lvling". It now shows for everyone. Which title does it keep?

- [ ] (a) Yours stays the main title.
- [ ] (b) The built-in website's title becomes the main title. Yours is kept as another name.
- [ ] (c) The built-in website's title replaces yours, and yours is dropped.

➡️ (b). Built-in websites have checked rules, so their title is more likely right, and keeping yours as another name means your search still finds it.

---

❓ **Q7** - **Telling you what happened to the typed chapter**: From round 1, a typed chapter can become current or go into your reading history. After Add, the note beside the Kollect button says "Added to Reading" or "Already on Reading". Should it also say what happened to the chapter?

- [ ] (a) No, keep the note as it is.
- [ ] (b) Yes, for example "Already on Reading. Now on chapter 55" or "Already on Reading. Chapter 30 saved to history".

➡️ (b). Round 1 said nothing should change without you knowing, and this is where you'd look.

---

❓ **Q8** - **Which websites count as "known" for the "This isn't a manga page" message**: Kollect can only say "this isn't a manga page" on websites where it knows the address shapes. I checked the code: on a website whose chapter addresses look like `/solo-leveling-chapter-12`, Kollect can't recognise the series page (`/solo-leveling`), so that page would be called "not a manga page" too. Also, your own websites that haven't learned their chapter addresses yet can't tell anything apart.

- [ ] (a) Built-in websites only. Every own website keeps the check box.
- [ ] (b) Built-in websites and own websites that have learned their chapter addresses. On a series page Kollect can't recognise, the check box opens instead of the message.
- [ ] (c) Like (b), and the message has an "Add anyway" link that opens the check box, in case Kollect is wrong (for example after a website redesign).

➡️ (c). The message stops the "Asura Scans - Home" mistake, and "Add anyway" means a wrong guess by Kollect never blocks you.
