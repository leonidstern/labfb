# Zoom

A zoom is a comment. The person presses 3 once to zoom in, again to zoom out, then clicks, draws an area or selects words: the zoom is placed at once, like a go, and its pin shows arrows in or out. It reaches you like any comment, with two more lines:

- `block: <id>`: the nearest element with an id around the spot.
- `zoom: out, the bigger picture` or `zoom: in, dive deeper`.

The comment is that fixed line. A drawn area or selected words narrow it, and so do words the person adds in the thread: zoom on *that*, inside the block.

It is not a change request. You write **one block** and the lab places it: a bigger picture above the part of the page the block is in, a deeper look right after it. Zooming in on a deeper look goes deeper again; out on a bigger picture, bigger again. Each zoom is one step: from a button's colour, bigger is the screen it's on, not the company's strategy.

## 1. Get the context first

1. **The block.** Read it on the page, and the part of the page around it.
2. **The trail.** `<page>.trail.jsonl` beside the page: the steps on the block (`on`), the ones its `data-from` names, and the ones behind them (`from`). The person's own words are there, and what was dropped and why.
3. **The page and the lab.** Read the whole page and the lab's other pages when they bear on it. What is decided there holds.
4. **The project.** The code, data and files the block is about. Run, measure or render when the skill says so.

No trail behind the block: go by the block and the page, and say so.

## 2. Pick the skill that fits

Pick by what the block is about, not by the page's title. One page can hold several kinds.

| the block is about | skill |
|---|---|
| speed, size, memory, load, a measurement | [zoom/performance.md](zoom/performance.md) |
| a look, a screen, a component, a drawing, copy on a screen | [zoom/design.md](zoom/design.md) |
| code, architecture, a system, an API, data | [zoom/code.md](zoom/code.md) |
| findings, quotes, a study, sources | [zoom/research.md](zoom/research.md) |
| an idea, a plan, a bet, a decision, a product choice | [zoom/product.md](zoom/product.md) |
| a test, a bug, a failing case | [zoom/testing.md](zoom/testing.md) |

None fits: **bigger** is what the block is part of (the goal it serves, what sits next to it, what was decided and dropped on the way, what it affects); **deeper** is what is underneath it (how it works, its parts, the evidence, the edge cases, what was tried, what is not known).

Either way: only what the block doesn't already say. Never restate it. Name what is not known.

## 3. Deliver one block

- One element, normally a `<section>`, with an `<h2>` that says which way and on what: "Bigger picture: page load", "Deeper: the router is gone".
- The page's own classes and styles. Copy how the page draws its parts (boxes, tables, lists); invent no new look.
- Short: 3 to 7 points, each a bold lead and a sentence or two. A table when there are numbers to compare; a small inline SVG when a picture explains it better.
- Numbers with their units and how you got them. Quote people exactly.
- End with one muted line: what it's from (the trail, which files, a fresh run) and what you didn't check.
- Give the parts inside it `id`s, so they can be zoomed in turn. Leave `id`, `data-zoom`, `data-zoom-of` and `data-from` off the outer element: the lab sets them.

Hand it over, then answer:

1. Write the element to a file.
2. `LAB zoom <pin id> <file> "one line saying what it is"`. The lab checks it, places it, names it (`<block>-bigger`, `<block>-deeper`) and adds the request and your line to the trail. If it refuses, it says what to fix.
3. `LAB reply <pin id> "…"`: what it shows, one point per line, and the placed block as `#<its id>` (`#speed-deeper`). In the thread and the chat that becomes a link that scrolls to it.

A block can be zoomed again, on another spot or with other words: each zoom gets its own block. Read the ones already there first and don't repeat them.

Behind a dev server the lab can't write the page: put the block there yourself, in the same place, and say so in the reply.

## The trail

The lab writes it. A pin that sits in a block and your reply to it become two steps (so answer with one clear line: "Done: the heading is shorter"); a zoom becomes two steps when you hand the block over. You add a line by hand in one case: the person picks one of several options. Append a `pick` step in their words, with `dropped` listing what was not picked and why. Never edit or remove earlier lines.

`{"id":"t4","kind":"pin|pick|make|change|answer","by":"<name>|agent","from":["t2"],"on":"<block id>","what":"one line","dropped":[{"what":"…","why":"…"}]}`

If someone asks in words how we came to something, answer from the trail only: one line per step, oldest first, their words quoted exactly, what was dropped and why. No steps: "No trail recorded for this one." Never rebuild a history from the page, git or guesses.
