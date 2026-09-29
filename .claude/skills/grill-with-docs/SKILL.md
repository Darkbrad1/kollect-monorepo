---
name: grill-with-docs
description: Interview the user about a plan or design for a change in this repo, one round of questions at a time, until you share one understanding of it. Write each settled term into CONTEXT.md as it settles, and record hard-to-reverse decisions as ADRs under docs/adr/. Only when the user types /grill-with-docs, asks to be grilled on a plan, or asks to "document my repo".
disable-model-invocation: true
---

# Grill with docs

Interview the user about a plan or design until you both understand it the same way, and leave the project's vocabulary and its hard decisions written down in the repo as you go. `reference.md` in this folder explains the thinking behind it.

## The interview

1. Start by asking what the change is, unless the user already said. If they asked to "document my repo", the subject is the codebase itself: read it and ask about what you find.
2. Ask **one round** of questions at a time (a few related questions), then stop and wait for the answers. Never dump every question at once.
3. For each question, give the options you see and **say which one you'd pick and why**, so the user can just agree or correct you.
4. Don't ask what the code can answer. Read the codebase (and `CLAUDE.md`, `README.md`, `CONTEXT.md`, `docs/adr/`) first, and only ask about what's genuinely undecided or unclear.
5. When the user uses a word differently from how `CONTEXT.md` or `CLAUDE.md` defines it, point it out and settle which meaning is right.
6. Keep going round by round until nothing important is fuzzy. Then say the interview is done and list what was settled.

In this project, also follow `CLAUDE.md`: explain at a beginner level, and treat product decisions as the user's to make.

## The glossary: CONTEXT.md

- The moment a term settles (the project's own word for a thing, and what it means), write it into `CONTEXT.md` at the repo root. Don't save terms up for the end.
- Create the file when the first term settles. Don't create it empty up front.
- One entry per term: the word in bold, then a short, tight definition in plain words. Add "Not to be confused with …" when two terms are easy to mix up.
- Keep it a glossary only: no implementation details, no specs, no to-do lists, no notes. If a sentence says *how* something is built rather than *what the word means*, it doesn't belong there.
- If a term changes meaning, update its entry rather than adding a second one.

## Decisions: ADRs in docs/adr/

Write an ADR (architecture decision record) only when a decision passes **all three** tests:

1. It's hard to reverse.
2. It would surprise someone who wasn't here for the discussion.
3. It's a real trade-off: there was a sensible alternative, and choosing this one costs something.

Most decisions fail at least one test, and most sessions produce no ADRs. That's expected.

- File name: `docs/adr/NNNN-short-title.md`, numbered from `0001` upwards. Create the folder when the first ADR is written.
- Contents: **Status** (Accepted), **Context** (the situation and the pressure), **Decision** (what was chosen), **Alternatives** (what else was considered and why not), **Consequences** (what gets easier and harder).
- In this project, also add the decision to "Decisions already made" in `CLAUDE.md`, as that file asks.

## Everything else

Decisions that don't earn an ADR live only in the conversation. At the end, remind the user of that, and offer to write them up (for example into `CLAUDE.md`'s decisions, or as a plan) before the conversation is cleared.

## It's working if

- `CONTEXT.md` changes during the session, term by term.
- The glossary reads as pure vocabulary.
- Questions the code can answer get answered from the code.
- There are few or no ADRs, and each one is a decision nobody would want to argue about again.
