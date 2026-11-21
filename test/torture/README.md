# Torture test

Thousands of random, replayable cases against real labs (this checkout's `local.mjs`), in three areas. Each case gets a
lab, a folder and a port of its own, does a random sequence of steps, lets things settle, and compares what every
observer holds with the case's own model of what should be there. The headline is how often labit goes wrong **without
saying so**.

Not part of `npm test` (that runs `test/*.test.mjs`). It only observes: it never changes `lib/`, `src/`, `public/` or
`local.mjs`.

## Run

```sh
node test/torture/run.mjs --smoke                       # ~60 cases, under 2 minutes
node test/torture/run.mjs --cases 3000 --area all --seed 1 --concurrency 12 --json out.json
node test/torture/run.mjs --replay hotswap:3539705355 --no-browser          # one case again, every step printed
node test/torture/run.mjs --replay hotswap:3539705355:1,7,8 --no-browser    # only steps 1, 7 and 8 of it
node test/torture/run.mjs --replay agent-sync:865886972 --no-browser --times 30   # 30 runs; the first that fails is printed
```

| flag (or environment) | default | |
| --- | --- | --- |
| `--cases N` (`TORTURE_CASES`) | 3000 | how many cases; `--area all` shares them 35% dev-sync, 30% hotswap, 35% agent-sync |
| `--area X` (`TORTURE_AREA`) | all | `dev-sync`, `hotswap`, `agent-sync`, several with commas, or `all` |
| `--seed N` (`TORTURE_SEED`) | 1 | the run's seed: the same seed makes the same cases |
| `--concurrency N` (`TORTURE_CONCURRENCY`) | 12 | cases at once |
| `--json file` (`TORTURE_JSON`) | none | everything the report says, and every failing case with its steps |
| `--smoke` | | 60 cases, 8 at once, browsers in 10%, one rerun to confirm, little shrinking (none after the first minute) |
| `--confirm N` | 2 | a failing case is run again this many times (see Flaky) |
| `--shrink N` | 12 | at most this many more runs to make the first case of a new signature smaller; 0: off |
| `--browser-share F` / `--no-browser` | 0.06 | the share of hotswap and agent-sync cases that also drive a real browser |
| `--slow F` | 1 | every bound and settle time times F, for a slow or loaded machine |
| `--replay area:seed[:steps]`, `--times N` | | one case again |
| `--verbose` | | a line per case that did not pass, as it happens |

Real browsers need the `playwright` package: from this checkout, from `NODE_PATH`, or from `../.labit-pw-scratch/node_modules`
(where this machine keeps it for labit's browser tests). Without it the run says "no browsers" and goes on with raw
clients only. Phones come in through this computer's wifi address (the lab is started with `--wifi` and each phone
redeems a one-time link, as a real one does); with no such address they come in as this computer and the run says so.

The run exits 0 when it ran; what it found is in the report. Every lab, command, browser and temp folder a case
started is ended and removed when the case ends, when the run ends, and on ctrl-c. Ports come from 23000–24799 through
the tests' own port locks (`test/browser/port.mjs`), so nothing collides with other tests or labs on the machine.

## What a case is

A case is made from its seed alone: `plan(rng)` gives a list of steps (the "plan"), and `run(plan)` does them against a
new lab. Steps with the same round go at the same moment (several clients writing at once, a save while a page loads);
rounds go one after another. A case's seed is `hash(run seed, area, index)`, so a failing case is replayed by its own
seed, whatever run it came from. A step left out (`--replay area:seed:0,3,4`, or the shrinker) is skipped, and so is a
step that refers to it.

Each case ends in one of:

- **pass**: every check held.
- **loud**: the product said something went wrong: a status that is no 2xx where the rules say yes, a command that
  exits 1, a lab that does not start and says why, a damaged file it reports.
- **silent**: nothing said anything, and an observer holds the wrong thing: a comment answered 201 that a device, the
  agent's text or `.lab` does not have; a page that still shows old bytes; a reload nobody asked for; a status that says
  what is not so.
- **flaky**: it failed, and did not fail again when the same case was run `--confirm` more times. Counted apart, never
  as silent. A race in labit lands here too: the report lists flaky signatures with how many cases hit them, and a
  signature hit by many different cases is a race, not noise (`--replay … --times 30` shows how often).
- **unclear** is a note, not an outcome: the documented contract does not say what should happen there. The case
  still passes; the report counts the passes that carry such a note and lists the notes.
- **harness**: this test's own trouble (a lab that did not start on a clean folder, a browser that did not launch, a
  case over its 90 s). Never counted against labit.

A case that finds a silent and a loud thing counts as silent.

## Signatures

Every finding has a signature: `area | class | check | tags`. The tags are a few words chosen by the check to tell one
bug from another (`res=css`, `cond=before-first-live-message`, `sig=SIGKILL`, `browser=webkit`); ids, numbers and text
are in the detail, never in the signature. So one bug seen in 400 cases is one line with a count. For the first case of
each signature that came back on a rerun, the shrinker drops steps (halves, then smaller pieces) while the signature
still shows, within its budget, and the report prints that small list of steps and the exact `--replay` line for it.
Two signatures can be one bug seen from two sides (the tags differ): the small step lists make that easy to see.

## The three areas

Each has its own file with the plan, the steps and the checks; `lib.mjs` has what they share.

**dev-sync** (`dev-sync.mjs`): the lab and its folder in step. Kinds of case: *writers* (clients writing at one
moment: pins, replies, replies to replies, resolve, reopen, move, delete, progress, the agent's `--done`, one pin sent
several times with one nonce, requests that must be refused, a stop and start in between), *crash* (the lab killed with
SIGKILL or SIGTERM some ms into a burst of writes; whatever was answered 2xx must be there after the start),
*damaged* (files in `.lab` cut short, garbled, emptied, of another shape, with entries that are no comments, odd dates,
the same id on two pages, an old shape, a stray `.tmp`, a garbled `state.json` or key, a stale `server.json` or lock),
*two-labs* (a second lab on the folder while one runs, two or three started at once, one after a crash), *rename*
(pages moved under their comments, lab running or stopped), *proxy* (a dev server behind the lab: pages sent in random
pieces, raw and packed bytes, a websocket, the dev server gone). Checks: the lab's lists, the files in
`.lab/comments/`, the delta a page gets from `/_lab/api/changes`, the agent text and `.lab/comments.md` all say what
the model holds; pins never share a number; nothing is lost over a restart.

**hotswap** (`hotswap.mjs`): pages, stylesheets, scripts (plain and modules that import another), pictures and
unrelated files are written in place, replaced through a temp file, appended to, cut short, touched, written again with
the same bytes, changed with the same size and time, swapped in by a rename, turned into links, deleted and made again
after 0 ms to 2.5 s, saved 20 to 80 at once, while one to three devices hold pages open (at `/`, with and without
`.html`, in folders, with spaces and marks in the name, in another letter case), go offline and back, reload, hold a
draft open, and the lab stops and starts. The oracle is the disk: after the last step each device must show the bytes
on disk for its page and for every file the page loads, within the bound. Then nothing-to-do-with-it saves follow (a
`.md`, a dot folder, `node_modules`, another page's script, a source file, a comment), and no device may reload.

**agent-sync** (`agent-sync.mjs`): a laptop and a phone (sometimes a third device) on the same pages, one to three
agent sessions (some through `labit wait` / `reply` / `resolve` / `pin`, some speaking the same API). Steps: pins (on a
spot, the page chat, a drawing, an action), replies, a reply sent twice with one nonce, resolve and reopen, move,
delete, the agent's answers (plain, `--done`, `--on-it`, `--question`, `--resolve`), progress lines, its own pins, a
reply command killed part-way, a wait killed, a session that dies holding a hand-off without confirming it, devices
offline and back or reloading, the lab restarted (SIGTERM or SIGKILL). The pages have been open a moment when the
steps begin (each has heard its live stream's first message); what lands while a page is still loading is tried by
the reload steps and carries `cond=made-while-the-page-loaded`. Checks: the lab holds exactly what was said yes
to, each thread in the state the steps leave it in; each device's own list (kept up by the live stream alone) equals
what the lab tells that device now, in the same order, nothing twice; `.lab` equals the lab; the agent text names
every open thread and message; everything a person wrote in an open thread reached some wait, nothing unknown did, and
the counts the hand-offs state add up to each message once; a pin marked "the agent has it" was handed to a wait that
confirmed it; the "waiting" count the page list shows is the number of threads whose last word is a person's.

## Devices

A device (`lib.mjs` `Device`) is a raw HTTP client that speaks as the widget does: it loads a page, reads the widget
tag the lab put in, opens `/_lab/live`, and follows the same rules as `src/widget/live.ts` and `src/comments.js` (when
to reload, when to patch the page, which stylesheets to fetch again, when to ask `/_lab/api/changes` and how to apply
it, what each sender does with its own answer, a browser's "changed?" asks with ETags). It keeps what a browser would be
showing. A phone is the same client coming in through the wifi address with its one-time link's cookie, so the lab sees
a guest. The checks never read these rules: they compare what the device ends up holding with the disk and the lab.

In a share of the cases one device is a real browser instead (Chromium as this computer's, WebKit as this computer's
or, in agent-sync, as an iPhone over the wifi address): what its page really shows (its `<main>`, the stylesheets'
custom properties, what its scripts set, its pins' labels, a draft's words) is read from the page. Some bugs only show
there (anything about the page's own elements), and the raw devices' rules are checked against it.

In a quarter of the agent-sync cases the phone is "held": each answer and live message reaches it up to 15, 40 or
80 ms late, each by its own amount, as on a slow wifi. Failures that need that carry `held=answers-held`.

## Known bugs and their signatures

The report tags every signature with `known bug N (name)` or `NEW: matches no known bug`, and ends with a table of the
bugs below: how many signatures and cases each showed in the run, or `not seen` (after a fix: that bug is gone), then the
NEW signatures. The mapping is by the signature's text only and lives in `known-bugs.mjs` (the `signatures` in the JSON
carry the number as `knownBug`).

| bug | what | shows as (signature text) |
| --- | --- | --- |
| 1 | js-import | `stale-content` with `res=js-import` |
| 2 | dead page | `dead-page` (any tags) |
| 3 | css stale after restart | `stale-content` with `cause=lab-stopped-or-restarted-around-the-save` and `res=css` or `res=css-import` |
| 4 | first live message / NaN catch-up | `stale-content` with `cause=saved-before-the-page's-first-live-message` |
| 5 | more than 50 files | `stale-content` with `cause=saved-among-over-50-files` |
| 6 | letter case | `stale-content` with `cause=page-opened-in-another-letter-case` |
| 7 | same size and mtime (ETag) | `stale-content` with `cause=same-size-and-time-as-before` |
| 8 | comments follow a move | `comments-did-not-follow-the-page` |
| 9 | comment made during page load missing | `comment-missing-on-device` / `agent-reply-missing-on-device` with `cond=made-while-the-page-loaded` |
| 10 | waitingOn name | `waiting-count-wrong` |
| 11 | hand-off record flush | `message-handed-out-twice` (with `restart=`) |
| 12 | duplicate own bubble | `device-shows-a-comment-twice` |

A signature that matches none (for instance `device-shows-old-state`, `agent-reply-missing-on-device` without the
page-load tag, `stale-content` with `res=img` or `res=js` after a restart) is listed as NEW: either a new bug, or one of
the above seen from another side (the small step lists of the report make that easy to see). Add a line to
`known-bugs.mjs` once it is understood.

## What the model knows about the lab (so these are not reported)

- Any POST a session makes that the lab answers 2xx (pin, reply, progress, resolve, answer) confirms what it was handed
  (`local.mjs`: "An answer or a resolve from a session is proof it has what it was handed"). A session that "dies holding
  its hand-off" and then acts again has confirmed it; the "handed but no wait has it" check follows that.
- Resolving and reopening a thread both clear its status line (`lib/comments-api.mjs`).
- After a restart a raw device finds the lab again some seconds later and catches up, as a real browser does: the quiet
  saves' "spurious reload" check is skipped for it (and for real browsers, whose whole quiet phase is skipped).
- A page file cut inside a tag has no place for the widget tag the lab appends: no "dead page" is reported for it.
- A deleted-and-written-again file's gap is measured (delete to written), not taken from the step's plan: the
  `gone=` bucket and the failure's detail use the measured gap.

## Bounds, and how they were picked

- A save reaches a device ~100 ms after it (the lab waits 80 ms for a burst of saves to end). The bound is 5 s for a
  raw device and 9 s for a real browser (it holds a reload 1.5 s after a key or a click, then looks again every 500 ms).
- Comments reach a device within a few ms of the answer; the bound is 5 s. The files in `.lab` follow within a few ms;
  the bound is 2.5 s.
- A lab answers ~130 ms after it is started; the bound is 10 s.
- The lab's own timers are set short where a case needs them to fire and long where it must not: pins go to a wait
  after 120 ms of quiet (`LAB_SETTLE_MS`, 2 s in a real lab), an unconfirmed hand-off is taken back after 1.2 s
  (`LAB_ACK_MS`, 20 s), "not answered" and "still waiting" (2 and 3 minutes) are out of reach (`LAB_ANSWER_MS`,
  `LAB_REMIND_MS` at 10 minutes).

The report ends with how long these really took in the run (half of them within, 99% within, the slowest), so a bound
that is too tight for a machine shows as flaky cases with settle times near the bound: run with `--slow 2`.
