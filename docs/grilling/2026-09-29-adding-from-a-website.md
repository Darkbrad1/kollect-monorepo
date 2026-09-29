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

❓ **Q1** - **What counts as a "close" title?**: In round 1 you chose that the check box asks "Is it one of these?" when titles are close. Kollect needs a rule for what "close" means.

- [ ] (a) One title contains the other. For example, "Solo Leveling" and "Solo Leveling Manhwa".
- [ ] (b) Same as (a), or the two titles share most of their words. For example, "The Hero Cannot Rest" and "Hero Cannot Rest Anymore".
- [x] (c) Same as (b), and Kollect also checks each manga's alternative titles, the other names it's known by.

➡️ (c). Alternative titles are the only way "Only I Level Up" can find "Solo Leveling". With (b) alone, Kollect misses every translated title.

**Answer:** (c) Close means one title contains the other, or they share most words, checked against alternative titles too.

---

❓ **Q2** - **What each choice in "Is it one of these?" shows**: Two series called "Reborn" have the same name, so each choice needs something that tells them apart.

- [ ] (a) Title only.
- [ ] (b) Cover, title and latest chapter.
- [x] (c) Cover, title, latest chapter, and the websites it's on.

➡️ (c). You can tell two "Reborn"s apart by their covers and their websites.

**Answer:** (c) Cover, title, latest chapter, and the websites it's on.

---

❓ **Q3** - **Remember the answer**: You add "Only I Level Up" and pick "Solo Leveling" from the list. Kollect already remembers this website's address for it, so this website won't ask again. Should Kollect also save "Only I Level Up" as another name for "Solo Leveling"? Then other websites and other users match it without the question.

- [ ] (a) No. Kollect only remembers this website's address.
- [x] (b) Yes. Kollect always saves the title as another name.
- [ ] (c) Yes, but only when the title comes from a built-in website. Kollect doesn't save titles from own websites, so a typo there stays yours.

➡️ (c). It fits your round 1 answer that own websites stay private.

**Answer:** (b) Always save the title as another name, even from own websites.

---

❓ **Q4** - **Same title, same website, different address**: You add "Reborn" on a website where Kollect already has a "Reborn" at a different address. Today Kollect assumes the website moved the series to a new address, and it links the two without asking.

- [ ] (a) Keep it. Kollect treats it as the same manga at a new address.
- [x] (b) The check box asks, the same way as for a title match from another website.

➡️ (b). Kollect can't tell a moved series from two series with the same name. You can. This case is rare, so the extra question costs little.

**Answer:** (b) The check box asks.

---

❓ **Q5** - **Where private manga are hidden**: I'm calling a manga that's only on own websites a "private manga". In round 1 you chose to hide it from other people's Add Manga search. Two other places could still show it. One is the "Is it one of these?" list. The other is matching. Say another user adds a website you also added, and then adds the same title there. Kollect could link them to your private manga.

- [x] (a) Hide it only from the Add Manga search.
- [ ] (b) Hide it from other people everywhere. If they add the same title from their own website, Kollect makes them their own private manga.

➡️ (b). With (a), the title you typed would show on someone else's card. The cost is that two users could each have a private copy of the same series for a while.

**Answer:** (a) Hide private manga only from the Add Manga search.

---

❓ **Q6** - **When a private manga goes public**: You have a private manga you titled "solo lvling". Someone adds "Solo Leveling" from a built-in website, Kollect matches it to yours, and now everyone sees it. Which title does it keep?

- [x] (a) Yours stays the main title.
- [ ] (b) The built-in website's title becomes the main title. Kollect keeps yours as another name.
- [ ] (c) The built-in website's title replaces yours, and Kollect drops yours.

➡️ (b). Someone checked the built-in website's rules, so its title is more likely right. Kollect keeps yours as another name, so your searches still find it.

**Answer:** (a) Yours stays the main title, and the other gets added to history. (What "history" means is asked in round 3.)

---

❓ **Q7** - **Telling you what happened to the typed chapter**: In round 1 you chose that a typed chapter either becomes current or goes into your reading history. After Add, a note next to the Kollect button says "Added to Reading" or "Already on Reading". Should the note also say what happened to the chapter?

- [ ] (a) No. The note stays as it is.
- [x] (b) Yes. For example, "Already on Reading. Now on chapter 55" or "Already on Reading. Chapter 30 saved to history".

➡️ (b). In round 1 you said nothing should change without you knowing. This note is where you'd look.

**Answer:** (b) The note says what happened to the chapter.

---

❓ **Q8** - **Which websites count as "known" for the "This isn't a manga page" message**: Kollect can only say "this isn't a manga page" on websites where it knows what the addresses look like. I checked the code and found two problems. First, some websites have chapter addresses like `/solo-leveling-chapter-12`. There, Kollect can't recognise the series page `/solo-leveling`, so it would call that page "not a manga page" too. Second, an own website that hasn't learned its chapter addresses can't tell any of its pages apart.

- [ ] (a) Built-in websites only. Every own website keeps the check box.
- [ ] (b) Built-in websites, plus own websites that have learned their chapter addresses.
- [x] (c) Same as (b), and the message has an "Add anyway" link that opens the check box.

➡️ (c). The message stops mistakes like saving "Asura Scans - Home" as a manga. "Add anyway" still lets you add from series pages Kollect can't recognise, and from any page it gets wrong after a website changes its design.

**Answer:** (c) Built-in websites and own websites that learned their chapter addresses, with an "Add anyway" link.

## Round 3

❓ **Q1** - **What "added to history" means for a title**: In round 2 Q6 you chose that your title stays the main title and the built-in website's title "gets added to history". Manga titles don't have a history in Kollect today. I think you mean it's saved as an alternative title, one of the other names the manga is known by, which search and matching also check.

- [x] (a) Yes, it's saved as an alternative title.
- [ ] (b) Something else (say what).

➡️ (a). Search and matching already look at alternative titles, so "Solo Leveling" still finds your "solo lvling".

**Answer:** (a) The built-in website's title is saved as an alternative title.

---

❓ **Q2** - **Reading on a second website without pressing Add**: I checked the code. You have "Solo Leveling" in your library from Asura Scans. You open chapter 12 of "Solo Leveling" on another website and don't press Add. Today Kollect matches it by the exact title, without asking, and tracks your reading there. In round 1 you chose that Add asks "Is it one of these?" for exactly this kind of title match, so the two rules disagree.

- [x] (a) Keep it. Reading tracks an exact title match without asking.
- [ ] (b) Kollect doesn't track it until you press Add on that website, and Add asks as agreed.
- [ ] (c) Kollect doesn't track it yet, and a note beside the Kollect button asks "Is this Solo Leveling from your library?" with a Yes button. Yes links it and tracking starts.

➡️ (c). With (b) you could read ten chapters without knowing none of them counted. With (a), two different series called "Reborn" would mix up your progress.

**Answer:** (a) Keep tracking an exact title match without asking, and show a message on screen along the lines of "We matched this to [manga name] and it's being tracked automatically".

---

❓ **Q3** - **Fixing a wrong main title**: Your title stays the main title when a manga goes public, and titles typed on own websites are saved as alternative titles. So a typo like "solo lvling" can end up as the title everyone sees. Nobody can change a manga's title from the extension today.

- [x] (a) Only you, as the admin, fix it from the Convex dashboard. Nothing changes in the extension.
- [ ] (b) The person who added a manga can rename it, until someone else has it in their library.
- [x] (c) Anyone can give a manga their own title, which only they see. The shared title stays the same.

➡️ (a) for now, with (c) written under "For the future". There are only a few users, and (c) is a new feature on every card.

**Answer:** (a) and (c) both ticked. Checked in round 4 whether (c) is for now or for the future.

---

❓ **Q4** - **Manga you already have in the "Is it one of these?" list**: The list can include a manga that's already in your library, for example "Solo Leveling" on your Reading page while you add "Only I Level Up" on a new website.

- [ ] (a) Show it like any other choice.
- [x] (b) Show an "On Reading" badge on it, like Add Manga does. Picking it links this website to the manga you already have, and it stays on its page.

➡️ (b). It tells you straight away that you're about to add a second copy, and it matches what Add Manga already shows.

**Answer:** (b) Show an "On Reading" badge. Picking it links this website to the manga you already have.

## Round 4

❓ **Q1** - **When the "we matched this" note shows**: In round 3 you chose that reading tracks an exact title match on another website without asking, and a note on screen says so. After the first match, Kollect remembers this website's address for that manga, so every later chapter there matches by address.

- [x] (a) Only the first time, when Kollect links this website to the manga.
- [ ] (b) Every time you open a chapter of it on this website.

➡️ (a). After the first time you already know, and a note on every chapter gets in the way of reading.

**Answer:** (a) Only the first time, when Kollect links this website to the manga.

---

❓ **Q2** - **Undoing a wrong match**: Two different series called "Reborn" would still get matched. The note could let you undo it.

- [ ] (a) The note only tells you. There's no undo.
- [x] (b) The note has a "Not this manga?" button. It removes the link to this website and the chapter it just saved, and stops tracking here. You can then press Add, which asks "Is it one of these?" as agreed.

➡️ (b). Without it, a wrong match keeps saving chapters to the wrong manga, and you can't fix it from the extension.

**Answer:** (b) A "Not this manga?" button on the note undoes the match.

---

❓ **Q3** - **Own titles: now or later?**: In round 3 Q3 you ticked (a) and (c). I read that as: for now you fix typos from the Convex dashboard, and "anyone can give a manga their own title" goes under "For the future" in `CLAUDE.md`.

- [x] (a) Yes. Dashboard now, own titles later.
- [ ] (b) Build own titles now, as part of this work.

➡️ (a). This work already covers a lot, and own titles change every card, so they deserve their own round of questions.

**Answer:** (a) Dashboard now. Your own titles go under "For the future".

## Round 5

❓ **Q1** - **"The first time" for whom?**: The link between a website's address and a manga is shared by everyone. Say user A reads "Reborn" on a new website first, and Kollect links it. When user B later reads it there, Kollect matches it by address, so no link is made and, by the round 4 rule, B sees no note.

- [ ] (a) The note shows only when Kollect makes the link, so only user A sees it.
- [x] (b) The note shows the first time each user reads that manga on that website, even if someone else made the link.

➡️ (b). User B needs the note and the "Not this manga?" button as much as user A does.

**Answer:** (b) The first time each user reads that manga on that website.

---

❓ **Q2** - **What "Not this manga?" undoes when others use the link**: User B presses "Not this manga?", but user A has been reading the same series there, linked to that manga, for weeks.

- [ ] (a) It removes the link for everyone.
- [x] (b) It stops tracking only for B. Kollect remembers B said no, and B presses Add to pick the right manga. The link stays for everyone else.
- [ ] (c) It removes the link for everyone only if nobody else has read that manga on that website. Otherwise it works like (b).

➡️ (c). One person can fix a fresh wrong match for everyone, but nobody can break tracking that someone else has been relying on.

**Answer:** (b) It stops tracking only for the user who pressed it. Everyone else keeps the link.

## Settled

Waiting for your confirmation before any of this is built.

- A title counts as close when one title contains the other, the two share most of their words, or it matches an alternative title.
- Add asks "Is it one of these?" in the check box when the only match is by title from another website, or when titles are close. "No, it's new" creates a new manga.
- Add also asks when the same title is already on the same website at a different address.
- Each choice in the list shows the cover, title, latest chapter and the websites it's on. A manga already in your library has an "On Reading" style badge. Picking it links this website to it, and it stays on its page.
- Picking a match saves this website's title as an alternative title, from any website, own websites included.
- A private manga is hidden only from other people's Add Manga search. It still shows in "Is it one of these?" and still matches.
- When a private manga goes public, its title stays the main title. The built-in website's title is saved as an alternative title.
- Typos in a main title are fixed by the admin from the Convex dashboard. Giving a manga your own title goes under "For the future".
- On a known website, Add still waits for the Scroll Threshold before a chapter becomes current.
- A chapter typed in the check box for a manga already in your library follows the import rule: the bigger number becomes current, and the smaller one goes into reading history.
- The note after Add says what happened to the chapter, for example "Already on Reading. Now on chapter 55".
- On built-in websites, and own websites that learned their chapter addresses, Add on a page that isn't a manga says "This isn't a manga page" with an "Add anyway" link. Other websites open the check box.
- Reading a manga on another website where the title exactly matches one in your library is tracked without asking. A note says Kollect matched it and is tracking it, the first time each user reads that manga on that website.
- The note has a "Not this manga?" button. It stops tracking there for you only, removes the chapter it just saved, and remembers your answer. Everyone else keeps the link. You then press Add to pick the right manga.
- Follows from the last point, to confirm: what you pick after "Not this manga?" applies only to you. Other users on that website still get the original manga.

No ADRs: none of these are hard to undo later.
