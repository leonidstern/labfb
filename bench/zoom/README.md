# Zoom benchmark

This tested the first version of zoom (out = the steps from the trail, in = variants at levels wide, ×1, ×2, ×3). Zoom is now one bigger picture and one deeper look, with a skill per kind of block (`skills/labit/zoom/`); these situations and results are kept as the record of why.

Can an agent zoom from one selected block of a lab page, for any kind of work, by one set of rules?

- Zoom out: the bigger picture, how we came to this (read from the page's trail).
- Zoom in: the smaller picture, more like this one (variants that get closer each step).

`ZOOM.md` holds the rules an agent gets (`ZOOM.v1.md` and `ZOOM.v2.md` are the two earlier sets). `scenarios/` has 34 folders, each a small lab page with its trail (`page.trail.jsonl`), a request (`request.md`) and the project files the page is about. An agent works in a copy of one folder with `ZOOM.md` beside it and nothing else. `truth.json` says what a right answer is; `score.mjs` checks it.

| scenario | who | what |
|---|---|---|
| d-in-1, d-in-2, d-in-3 | designer | zoom in ×1, ×2, ×3 on a look for an empty table: variants must get closer each step |
| d-out-1 | designer | zoom out ×1 on the picked look: only what made it, nothing further back |
| dev-out-2 | developer | zoom out ×2 on a change that was made and reverted (labit's own history) |
| arch-out-3 | developer | zoom out ×3 on a part of the architecture: everything, other branches marked |
| arch-in-1 | developer | zoom in ×1 on a part of the architecture |
| dev-in-1 | developer | zoom in ×1 on a code fix (labit's `--pages` parsing): every variant must pass `test.mjs` |
| test-in-1 | tester | zoom in ×1 on a failing case: new cases must be right, of the same kind, and still fail |
| res-in-1 | researcher | zoom in ×1 on a finding: every new quote must be word for word in `sources/` |
| copy-in-3 | writer | zoom in ×3 on a line of copy: at most 3 words changed each |
| ceo-in-1 | CEO | zoom in ×1 on a core idea for the product: the variants must be other ideas, not the same one reworded |
| ceo-out-2 | CEO | zoom out ×2 on how the product got its name (labit's own history) |
| lead-in-1 | lead designer | zoom in ×1 on a rule of the design system: words and values must agree |
| lead-out-1 | lead designer | zoom out ×1 on a rule of the design system |
| var-again-1 | variant explorer | zoom in ×1 again on a look that already has 4 variants: new ids, the old ones untouched |
| var-small-3 | variant explorer | zoom in ×3 on a button's label: at most 2 words changed each |
| ceo-wide, lead-wide, arch-wide, dev-wide | CEO, lead designer, developer | zoom in wide on the same blocks: other approaches, where ×1 stays inside the approach |
| gfx-logo-1, -2, -3 | designer | zoom in ×1, ×2, ×3 on labit's mark, scored on the drawn picture |
| gfx-icon-1 | designer | zoom in ×1 on an icon |
| gfx-photo-1 | designer | zoom in ×1 on a crop of a picture: the subject must stay whole |
| chart-in-1 | anyone | zoom in ×1 on a chart: the same numbers, drawn to scale |
| perf-in-1 | developer | zoom in ×1 on slow code: every variant must be right and measurably faster |
| perf-out-2 | developer | zoom out ×2 on a speed-up |
| doc-in-1 | writer | zoom in ×1 on a long README section: shorter, and no invented command |
| notrail-in-1 | anyone | zoom in ×1 on a block with no trail |
| ctx-wide | developer | zoom in wide while another page of the lab rules a database out |
| none-out-1 | anyone | zoom out on a block with no trail: must say so, not make a history up |
| keep-1 | anyone | a plain comment: the change is made and the trail is kept |

```
cp -R bench/zoom/scenarios <runs>            # one copy per run
cp bench/zoom/ZOOM.md <runs>/<scenario>/     # the rules, in each folder
# give an agent one folder: "read ZOOM.md, then request.md, do what the rules say"
node bench/zoom/score.mjs <runs> [--json out.json]
```

In a run folder the agent also gets `place.mjs`, the sketch of the lab's part that these runs used; in labit itself that is `lib/zoom.ts` and `labit variants`. `render.py` draws SVG variants with macOS Quick Look and Pillow, so the graphics checks run on a Mac only.

## Results, 2026-11-16

One run per situation and model, with the rules in `ZOOM.md` (`results/opus-all.json`, `results/sonnet.json`).

| | Opus | Sonnet |
|---|---|---|
| checks passed | 559 / 562 | 558 / 562 |
| situations with nothing wrong | 31 / 34 | 32 / 34 |

Read by eye, Sonnet lets a drawing drift at ×1 (two of its four marks are other marks) and shortens zoom-out steps; Opus painted one icon's plus in a page colour, which no check saw. Both used another page of the lab without being told (`ctx-wide`). `results/opus.json` and `results/opus-v2.json` are the same situations under the two earlier sets of rules.

The scorer runs the code variants of `dev-in-1` with Node. Checks that need a reader (is a design variant still the same idea, is an architecture variant another shape of the same part) are not scored; `arch-in-1` says so in `truth.json`.
