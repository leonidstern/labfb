# Zoom: rules for the agent (draft)

You are the agent listening on a lab. A request comes in about one block of one page. Do exactly what these rules say, in this folder only.

## What you have

- `page.html`: the lab page. A block is any element with an `id`.
- `page.trail.jsonl`: the page's trail, one JSON object per line, oldest first:
  `{"id":"t4","kind":"ask|pin|pick|make|change","by":"<name>|agent","from":["t2"],"what":"one line","on":"<block id>","dropped":[{"what":"…","why":"…"}]}`
  `from` names the steps this one came out of. A person's `what` is their exact words.
- A block may carry `data-from="t7 t3"`: the steps that made it, nearest first.
- `request.md`: the request, as the lab hands it to you.
- Anything else in the folder belongs to the project the page is about.

## Always: keep the trail

Every time you make or change a block:

1. If the request isn't in the trail yet, append it as a step first: kind `pin`, `by` the person's name, `what` their exact words, `on` the block's id, `from` the first step in the block's `data-from` (leave `from` out if it has none).
2. Append one step for what you did: kind `make` for new blocks, `change` for changed ones, `by` "agent", `from` the request's step, `what` one line.
3. Put your step's id first in `data-from` on every block you made or changed.

Ids continue the count (after t7 comes t8). Never edit or remove earlier lines.

## Zoom out ×N: the bigger picture, how we came to this

Answer in `reply.txt` from the trail, and change no file.

- ×1 what made this: the steps in the block's `data-from` and the steps directly behind them (their `from`). Nothing further back.
- ×2 the whole way here: every step that leads to this block, from the first ask. Include what was dropped on the way and why.
- ×3 everything: every step on the page. Mark each one that does not lead to this block with the words "another branch".

One line per step, oldest first: who (the person's name, or Agent), then what. Quote a person's words exactly, in quotation marks.

If the block has no `data-from`, or its steps aren't in the trail, reply `No trail recorded for this one.` and nothing else. Never rebuild a history from the page's text, from git, from other files or from guesses.

## Zoom in: the smaller picture, more like this one

Make variants of the block. A variant is another answer to the question the block answers.

First find that question. Read the steps in the block's `data-from` and the steps behind them: the ask or comment the block was made for says what it answers. A look answers "what could this look like". A fix answers "how could this be written". A failing case answers "where else does this break". A quote under a finding answers "what supports this". A product idea answers "what would solve this problem". A part of the architecture answers "how could this be built".

Then give other answers to it. Change what the answer is, not how it is written down: the same content in other words, in another order or in another layout (a list, a table, a shorter cut of the same quote) is not a variant. Only when the block is itself about wording or looks (a line of copy, a look, a label, a drawing) are those the answers.

The request names a level. The level says how far from the block the variants may go:

- wide: 4 variants. Other approaches to the same question. How it is done may change (another kind of design, another idea, another way to build it); only the question stays.
- ×1 close: 4 variants. The block's own approach, with other choices inside it, and differences you can see at a glance. What the block does stays the same: a fix behaves the same, a rule keeps its shape, an idea stays that idea.
- ×2 closer: 3 variants. Small differences only.
- ×3 very close: 3 variants. Fine differences: one detail each.

×N is always the block's `data-depth` (0 if it has none) plus 1.

Every variant:

- is a complete element of the same kind as the block, with the same parts inside it;
- differs from the block and from every other variant, and from any earlier variants of the block on the page;
- is still valid as what the block is: a fix still passes its tests, a faster version is still right and really is faster, a test case still tests the same rule and has the right expected result, a quote is a real quote from the files here, a picture still shows what it is of, and every variant still answers the same question.

Hand the variants to the lab. Do not edit `page.html` or `page.trail.jsonl` yourself for a zoom in:

1. Write `variants.html`: the variants one after another, nothing else. Leave out `id`, `data-variant-of`, `data-depth` and `data-from`; the lab sets them.
2. Write `variants.txt`: one line saying what the variants are. It becomes your step in the trail.
3. Run `node place.mjs`. It checks the variants, puts them on the page after the block (after its earlier variants, if it has some), numbers them, and adds the request and your step to the trail. If it reports a problem, fix `variants.html` and run it again.

## Reply

Write what you would answer on the pin to `reply.txt`. Short: it is read on a phone. Plain text.
