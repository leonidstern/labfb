# Settings

labit works with no settings at all. When you want to change something, write it in a settings file instead of
adding flags every time.

## Two files

| File | Where | For |
| --- | --- | --- |
| `labit.json` | your project's folder (or any folder above where you run labit) | the project: commit it, and everyone working on it gets the same lab |
| `settings.json` | `~/.config/labit/settings.json` | you: your name, your model, your keys, on every project |

Both are plain JSON. A file only fills in what you didn't say on the command line, so for each setting the first of
these that has it wins:

1. a flag, like `--port 4500`
2. an environment variable, like `PORT=4500`
3. the project's `labit.json`
4. your own `settings.json`
5. the default

To see what's in force and where each value came from:

```sh
npx @leonidstern/labit settings
```

```text
port                       4700                  labit.json
name                       Leo                   your settings
shortcuts                  chat x                labit.json
archiveAfterDays           30                    default
```

A setting labit doesn't know, or a value of the wrong kind, is named when the lab starts and left out; the rest still
counts. `labit settings` exits with an error while there's such a problem.

## Examples

`labit.json` in a project:

```json
{
  "port": 4500,
  "proxy": "3000",
  "batchSeconds": 1,
  "shortcuts": { "chat": "x" }
}
```

Your `~/.config/labit/settings.json`:

```json
{
  "name": "Leo",
  "model": "Sonnet 5.5",
  "open": false,
  "shortcuts": { "toggle": "h" }
}
```

## All settings

| Setting | Default | Also | What it does | In |
| --- | --- | --- | --- | --- |
| `port` | `4400` | `--port`, `PORT` | The first port to try. A taken one moves the lab to the next free port, up to 20 further. | both |
| `proxy` | find it | `--proxy` | Your dev server, as a port (`"3000"`) or an address. Without it labit finds the one running in the project. | project |
| `folder` | `.` | the folder after `labit` | What to serve, from the project's folder: `"dist"`, `"site"`. | project |
| `open` | `true` | `--no-open` | Open the page in your browser when the lab starts. | both |
| `wifi` | `false` | `--wifi` | Let phones and laptops on your wifi comment too. Each device still needs a one-time link from `labit invite`. | yours |
| `batchSeconds` | `2` | `LAB_SETTLE_MS` | How long the lab collects pins before handing them to your agent, so pins made one after another arrive together. `0` hands each one over at once. | both |
| `stopListeningAfterMinutes` | `60` | `LAB_CLOSE_GRACE` (seconds) | With every page closed this long, a listening agent stops. | both |
| `remindAfterMinutes` | `3` | `LAB_REMIND_MS` | A pin handed to your agent with no answer after this long is handed to it again. | both |
| `archiveAfterDays` | `30` | | Done threads with nothing new for this long move to `.lab/archive/` when the lab starts. | both |
| `updateCheck` | `true` | `LABIT_NO_UPDATE_CHECK=1` | Say when a newer labit is out (checked at most once a day). | both |
| `name` | none | | Your name on pins. The page asks once and keeps it here. | yours |
| `model` | none | `--model`, `LAB_MODEL` | The model your agent runs on, shown on the page: "talking to Claude · Sonnet 5.5". | yours |
| `pagesFolder` | `~/lab-pages` | | The one lab for pages that belong to no project (tries, demos, options). Agents add a page there, in a folder named for its topic, instead of starting a new lab. | yours |
| `shortcuts` | below | | Keys for the page. | both |
| `actions` | below | | The buttons in the comment dialog: on words you select, and on a spot or an area. | both |
| `flags` | everything off | the ⋯ menu's **experiments** | What this lab is trying: `{ "<flag>": true }`. See **Experiments** below. | both |

"Project" settings belong to a project, so they're only read from `labit.json`; "yours" only from your own file (a
project you clone can't rename you or open your lab to the network); "both" from either, the project's first.

## Experiments

A new instrument arrives as a flag: off unless you turn it on, tried in a real lab, then kept — the flag goes away and
it is simply labit — or dropped, and the code goes with it. Nothing is in labit because it was built.

```json
{ "flags": { "<flag>": true } }
```

The easy way is the page: open the ⋯ menu and pick **experiments** (the number beside it is how many are on). The
menu turns into the list, one switch a flag with its one line; **‹ experiments** at its head goes back. A switch
applies at once, with no restart: every open page of the lab starts what came on, and reloads for what went off. It is
saved in your own `~/.config/labit/settings.json`, so it holds in every lab you run. Phones get the same list, bigger
to tap. Only the computer running the lab can switch them: a guest on your wifi sees the switches greyed out.

Or write it in a file: the project's `labit.json` for everyone on the project, or your own settings file. A file you
edit by hand is read when the lab starts. A flag the project's `labit.json` sets wins over yours, on or off: the menu
shows that switch greyed, with "set by the project's labit.json" under it. `labit settings` lists which are on and
whose each is: `flags  select (yours)`.

| Flag | What it is |
| --- | --- |
| `select` | select mode: `V` (or select in the ⋯ menu) makes a click pick the block under it instead of pinning; a bar asks the agent to remove it, make it like another, move it, show its states or make variants, or pins it. Tab and Shift+Tab step, Esc lets go, then leaves. Off by default |

`sectionBar` was kept, so the section bar is always on a page with two or more sections; `board` was kept, so every lab has boards; `agentPins` was kept, so a pin the agent left always wears labit's mark; `liveUrl` was dropped for now.

A flag whose name nobody is trying any more (it was kept, or dropped) is said out loud when labit starts and
otherwise ignored, so an old file never stops a lab from running.

## Actions

Select words (hold Shift and drag) and the comment dialog opens at once, the cursor in its box; a click on a spot or an area
opens the same dialog there. Its row has the actions only, since the box itself is the comment; clicking one sends it at
once. The defaults:

```json
{ "actions": { "words": ["rewrite", "cut", "go"], "spot": ["go", "remove", "fix"] } }
```

- **Built in:** `rewrite` sends `Rewrite: “…”` at once (the agent proposes the new wording), `cut` sends `Cut: “…”` at once,
  `go` sends a comment that says "go" on the words (or the spot) at once, nothing to type, `remove` sends `Remove this` and `fix` sends
  `Fix this`. `rewrite` and `cut` need words, so a spot's row leaves them out.
- **Your own:** `{ "label": "tighter", "send": "Tighter: less space" }` sends that text on the words or the spot at once, with whatever you
  typed after it.
- **Order** is the order shown. `comment` is always there first, so it isn't listed (listed anyway, it is ignored). Up to 5
  actions beside it, labels up to 16 characters. A name that isn't one, a repeat or a bad label is said when labit starts and
  left out; the rest still counts.
- **Keys:** ⌥ + 1 to 4 run the buttons in the order they show (the key's place, so Option's own characters don't matter); holding ⌥
  while the dialog is open shows the number on each button. Up to the number of actions (4 at most).
- **`spot`** is the row of the regular dialog on a spot or an area (phones: the same row in the sheet); `words` is the row
  on selected words. Each is its own list.

```json
{
  "actions": {
    "words": ["go", { "label": "tighter", "send": "Tighter: less space" }, { "label": "shorter", "send": "Shorter: half the words" }]
  }
}
```

The project's list for `words` wins over yours, list by list.

## Shortcuts

Each key is one letter or digit. You only list the ones you change; the others keep their default. A project's keys
win over yours, key by key.

| Action | Default | Does |
| --- | --- | --- |
| `toggle` | `m` | Show or hide comments |
| `comment` | `1` | Switches between comment (a click places one) and pointer (a click is just a click): once for the pointer, again for the comment. The old `pointer` key (3) is gone; one left in a file is ignored. |
| `chat` | `t` | Open the chat |
| `pin` | `c` | Comment mode: a click places a comment. Leaves select mode or the pointer |
| `next` | `w` | The next new comment (with Shift: the one before) |
| `pause` | `p` | Pause the page's videos and animations, or play what was paused (each one also has its own control: hold ⌥ over it on a computer, in its corner on a phone) |
| `slow` | `s` | Play the page's videos and animations at ¼ speed, or back at full speed (the ¼ in a thing's own control slows only it); a pin made while paused carries the moment in ms |
| `done` | `d` | Tapped: hide or show done threads (shown, faded, at first). Held while you drag: draw a comment (a circle, an arrow, an underline…); the agent is told what it reads as |
| `reply` | `r` | With a thread open: type a reply |
| `resolve` | `e` | With a thread open: resolve or reopen it |
| `select` | `v` | With the `select` flag on: select mode on or off |

Letters follow the key's place on non-Latin layouts (the T key is T in Russian too), and digits work with Shift or
on AZERTY. The page shows your keys: the chat button reads "chat (x)" when `chat` is `x`.

## Not settings

- **Per run, flags only:** `--new`, `--all`, `--pages`, `--timeout`, `--resolve`, `--done`, `--on-it`, `--question`, `--wait`, `--page`, `--dir`.
- **Set by agents:** `LAB_AGENT`, `LAB_AGENT_NAME`, `LAB_SESSION_NAME` and the agents' own session ids.
- **For tests:** `LABIT_HOME`, `LAB_TAB_TTL`.
