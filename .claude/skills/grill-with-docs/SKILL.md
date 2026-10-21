---
name: grill-with-docs
description: A thorough interview that sharpens a plan or design, and writes docs (ADRs and a glossary) as it goes.
disable-model-invocation: true
---

Call the Skill tool twice, for "grilling" and "domain-modeling".

## Session notes

Also keep a Markdown notes file for the session, so the user can copy it into Obsidian or another notes app.

- Put it at `docs/grilling/YYYY-MM-DD-<topic>.md`, with today's date and a short topic in lowercase words joined by hyphens. Create it when the first round is asked.
- Start the file with YAML front matter (`date`, `topic`, `tags: [grilling]`), then a `# <Topic>` heading and a short summary of the starting point.
- Write each round into the file as it's asked, under a `## Round N` heading, using the same question format as the chat.
- When the user answers, add their answer under each question as `**Answer:** ...`, in their words or a close summary.
- When the session ends, add a `## Settled` section that lists every decision in one line each, and links to any ADRs written.
- Use plain Markdown only: headings, lists, tables, code blocks and normal `[text](path)` links. No HTML.
