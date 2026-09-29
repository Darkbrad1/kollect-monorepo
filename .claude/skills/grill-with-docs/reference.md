## What it does

`grill-with-docs` asks you questions about a plan or design until you and the [agent](https://www.aihero.dev/ai-coding-dictionary/agent) understand it the same way. While it asks, it writes the project's words and its hard decisions into your repo. The interview is the same one [grill-me](https://aihero.dev/skills-grill-me) runs: one round of questions, a wait for your answers, then the next round. The difference is that this one works inside a codebase.

It is [stateful](https://www.aihero.dev/ai-coding-dictionary/stateful). Other grilling skills leave everything from the [session](https://www.aihero.dev/ai-coding-dictionary/session) in your head. This one writes files. When a term is settled, it goes into `CONTEXT.md` right away, not in one batch at the end. When a decision meets three conditions, it becomes an ADR. The files cause most of the trouble people have with the skill. They are real files in a real repo, so they can be missing when you expected them, and they can fall out of step when more than one person writes to them.

## When to use it

It only runs when you type `/grill-with-docs`. The agent won't start it by itself.

Use it at the start of a change in a repo, while the plan is still unclear and the names for things aren't agreed yet. It covers work you can plan in one session. Pick the grilling skill that matches your situation:

| Your situation | Skill |
| --- | --- |
| You aren't working in a repo at all | [grill-me](https://aihero.dev/skills-grill-me) |
| A repo, and a change you can settle in one session | `grill-with-docs` |
| Work too big for one session (a new project, a large feature) | [wayfinder](https://aihero.dev/skills-wayfinder) |
| A repo with no domain docs, and no particular feature in mind | `grill-with-docs`, aimed at the whole repo instead of a change |
| A decision that depends on something only another person knows | [to-questionnaire](https://aihero.dev/skills-to-questionnaire) |

`/grill-with-docs` plans in one session. `/wayfinder` plans across several.

## What it needs

The skill writes into your repo, so run it where writing files is safe. Settled terms go into a `CONTEXT.md` glossary at the root. If a `CONTEXT-MAP.md` at the root splits the repo into several parts, each term goes into that part's own `CONTEXT.md`. Decisions go into `docs/adr/`. The skill creates these files the first time it has something to write, so you don't need to set anything up first.

It also needs two other skills, because its own `SKILL.md` is one line that loads them. [grilling](https://aihero.dev/skills-grilling) runs the interview and [domain-modeling](https://aihero.dev/skills-domain-modeling) writes the files. If you install `grill-with-docs` without them, it doesn't work.

## What gets written down

A session settles three kinds of thing, and each ends up in a different place.

| What got settled | Where it goes |
| --- | --- |
| A term, meaning the project's own word for a thing | `CONTEXT.md`, as soon as it's settled |
| A decision that is hard to reverse, surprising without context, and a real trade-off | An ADR in `docs/adr/` |
| Every other decision | The conversation, and nowhere else |

The third row surprises people. `CONTEXT.md` holds only the glossary: no implementation details, no [spec](https://www.aihero.dev/ai-coding-dictionary/spec), no scratch notes. A decision becomes an ADR only if it meets all three conditions, so most decisions don't, and most sessions write no ADRs. A session that improves the glossary and writes no ADRs is working correctly. It does mean that most of what you agreed exists only in that conversation's [context window](https://www.aihero.dev/ai-coding-dictionary/context-window). Pass the conversation to [to-spec](https://aihero.dev/skills-to-spec) instead of [clearing](https://www.aihero.dev/ai-coding-dictionary/clearing) it.

The glossary is the main thing the skill builds. It holds the project's own words, agreed once, so you, the agent and the people you work with don't have to work them out again. Some people disagree that this makes the agent work better. The strongest argument against it says the [model](https://www.aihero.dev/ai-coding-dictionary/model) gives the same result for a term as for its plain-English meaning, so the glossary mainly helps the people who share the words. Even on that view the glossary is still worth keeping, because it helps the people.

## Common questions

**Should I use this or `/wayfinder`?**
It depends on size. Use this skill for anything you can settle in one session. Use [wayfinder](https://aihero.dev/skills-wayfinder) when the work is too big for one session. Wayfinder first lays the work out as a list of decisions to make, written as [tickets](https://www.aihero.dev/ai-coding-dictionary/ticket). It is slower and more detailed, and people often pick it for a feature that is already clear, which is a mistake. It doesn't replace this skill. It can start a grilling session for the parts of its list that need one.

**It ran, but no `CONTEXT.md` and no ADRs appeared.**
There are two known causes. The first is that nothing qualified. An ADR needs all three conditions, and a change that brings no new words has nothing to write. The second is a bug. When another tool runs the skill as one step of its own process (a spec-driven development wrapper, a multi-agent framework, or a rule that calls it), people report that the interview still runs but no files get written. The bug is reported and not fixed. If you run it that way, check the folder before you trust the result.

**It asked everything at once, gave no recommended answers, and never mentioned `CONTEXT.md`.**
The skill didn't load its two helper skills. `SKILL.md` is only one line that loads [grilling](https://aihero.dev/skills-grilling) and [domain-modeling](https://aihero.dev/skills-domain-modeling). An agent that skips them guesses what "grilling" means, and you get one long list of questions. It's more confusing when only one loads. With `grilling` and no `domain-modeling`, you get a good interview and no files. This happens more with some models and lower [effort](https://www.aihero.dev/ai-coding-dictionary/effort) settings, and it's the problem people report most. If you think it happened, ask the agent which skills it loaded.

**Where did all my other decisions go?**
They're only in the conversation. This is the biggest open complaint about the skill. The glossary isn't a spec, most answers don't qualify for an ADR, and nothing links each answer to a spec, a ticket and a test. Exact answers (the order things happen in, what must never happen, default numbers) turn into vaguer wording in later steps. The result can look complete and still miss what you decided. For now, keep the session open and pass it straight to [to-spec](https://aihero.dev/skills-to-spec). Then read the spec against your own answers instead of assuming it has them all.

**Can I use it on an existing repo with no docs?**
Yes. It's the right skill for a codebase with no ADRs, no agreed words and no design rules. Start it and say "help me document my repo". Some people use it together with [improve-codebase-architecture](https://aihero.dev/skills-improve-codebase-architecture) to build or fix a `CONTEXT.md`. Expect to guide it. It reads the code and asks about what it finds, and you decide which of the words already in the code are the right ones.

**What should I do when the session ends?**
The skill often ends without saying what to do next. That's a known weak spot. Usually the next step is [to-spec](https://aihero.dev/skills-to-spec), in the same conversation. If the change is small enough to build right away, go straight to [implement](https://aihero.dev/skills-implement).

**Why is it called that?**
Nobody likes the name. Someone suggested renaming it `grill-domain-model`, which says better what it does, but no one has acted on it. If it does get renamed, its docs page and address change too.

## Signs it's working

- `CONTEXT.md` changes during the session, one term at a time, instead of all at once at the end.
- The glossary holds only words (your project's words with short, exact definitions) and no implementation details or spec-style text.
- It answers questions from the code when the code has the answer, instead of asking you.
- You get few or no ADRs, and the ones you get are decisions you'd be annoyed to argue about again.
- It questions a word you used when your glossary already defines it differently.

## Where it fits

`grill-with-docs` is the first step of the main build process:

```txt
grill-with-docs → to-spec → to-tickets → implement → code-review
```

It runs before anything is written down as a spec. It produces the shared understanding and the agreed words, and [to-spec](https://aihero.dev/skills-to-spec) then turns those into a spec without asking you again. The skills closest to it are [grill-me](https://aihero.dev/skills-grill-me), the same interview with no repo and no files, and [domain-modeling](https://aihero.dev/skills-domain-modeling), the glossary and ADR rules it follows. Both use [grilling](https://aihero.dev/skills-grilling) underneath. Before it, [wayfinder](https://aihero.dev/skills-wayfinder) plans work too big for one session and can pass parts of that plan back to this skill. If you're not sure which skill or process fits, [ask-matt](https://aihero.dev/skills-ask-matt) points you to one.
