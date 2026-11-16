# Zoom

A zoom is a comment with `block: <id>` (the nearest element with an id) and `zoom: in` or `zoom: out`. A drawn area, selected words or words in the thread narrow it. It is not a change request: write **one block**; the lab places it.

## In and out

- **In:** one level more detail: how it works, its parts, the evidence, edge cases, what is not known.
- **Out:** one level more of what it sits in: the goal, what is next to it, what it affects, what was decided and dropped.
- One level per zoom: out from a button's colour is its screen, not the company's plan.
- Only what the block doesn't already say. Name what is not known.

Examples, not a menu: a number → in: measure and break it down; out: its budget and share. A finding → in: the quotes behind it; out: the question it answers. A function → in: the path, file and line; out: what calls it.

## Context, then evidence

Read the block and its page, the page's comments and answers (`.lab/comments.md`), the lab's other pages, the project.

Never invent a number, quote, path or result: measure, run, read or quote it, say which, and mark guesses. One short check, not a suite.

## The block

One element in the page's own markup and classes. A heading that says which way and on what. A table for numbers, a drawing for a look, steps for a path, quotes as quotes. Short. A last line: what it is from, what wasn't checked. Ids on inner parts; no `id`, `data-zoom` or `data-zoom-of` on the outer element.

## Hand-over

Run `LAB zoom <pin id> <file>`: the lab places it (in: after the section, out: above it) and names it, or says what to fix. Then reply in one line naming the id it printed as `#that-id` (a link to the block).

- Nothing worth adding, or the answer is already on the page: say so, or link to it.
- The lab can't place it (no block id, a page behind a dev server): put it next to the block yourself and say so.
