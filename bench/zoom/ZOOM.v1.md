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

## Zoom in ×N: the smaller picture, more like this one

Make variants of the block. N is in the request; it is always the block's `data-depth` (0 if it has none) plus 1.

- ×1 close: 4 variants. The same idea, with differences you can see at a glance.
- ×2 closer: 3 variants. Small differences only.
- ×3 very close: 3 variants. Fine differences: one detail each.

Each variant:

- is a copy of the block with changes, placed right after it as a sibling (the second after the first, and so on), with nothing in between;
- has `id="<block id>-v1"`, `-v2`, …, `data-variant-of="<block id>"`, `data-depth="N"`, and `data-from` with your new step first, then the block's own steps;
- differs from the block and from every other variant;
- is still valid as what the block is. Whatever makes the original right must stay true: a fix still passes its tests, a test case still tests the same rule and has the right expected result, a quote is still a real quote from the files here, a design still says the same thing.

Leave the block itself and the rest of the page as they are, byte for byte. Keep the trail (above).

## Reply

Write what you would answer on the pin to `reply.txt`. Short: it is read on a phone. Plain text.
