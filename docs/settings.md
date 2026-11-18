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
| `flags` | everything off | | What this lab is trying: `{ "<flag>": true }`. See **Trying things** below. | either |

"Project" settings belong to a project, so they're only read from `labit.json`; "yours" only from your own file (a
project you clone can't rename you or open your lab to the network); "both" from either, the project's first.

## Trying things

A new instrument arrives as a flag: off unless you turn it on, tried in a real lab, then kept — the flag goes away and
it is simply labit — or dropped, and the code goes with it. Nothing is in labit because it was built.

```json
{ "flags": { "liveUrl": true } }
```

You don't have to edit a file: open the ⋯ menu in the lab's bar and there is a **trying** heading at the foot of it
with a switch for each. A switch writes the project's `labit.json`, so your agent is looking at the same thing you
are. Only this computer sees those switches — a guest on your wifi reads the page, they don't decide what labit is
trying. `labit settings` lists which are on and where that came from.

| Flag | What it is |
| --- | --- |
| `liveUrl` | a lab in front of a page that is already live, so you pin on what shipped |
| `agentPins` | a pin the agent left wears labit's own mark, the one the bar shows while an agent listens |

A flag whose name nobody is trying any more (it was kept, or dropped) is said out loud when labit starts and
otherwise ignored, so an old file never stops a lab from running.

## Shortcuts

Each key is one letter or digit. You only list the ones you change; the others keep their default. A project's keys
win over yours, key by key.

| Action | Default | Does |
| --- | --- | --- |
| `toggle` | `m` | Show or hide comments |
| `comment` | `1` | A click places a comment |
| `go` | `2` | A click places a go pin (do it, no questions) |
| `pointer` | `3` | A click is just a click |
| `chat` | `c` | Open the chat |
| `next` | `w` | The next new comment (with Shift: the one before) |
| `pause` | `p` | Pause the page (animations and videos stop) |
| `done` | `d` | Show or hide done threads |
| `reply` | `r` | With a thread open: type a reply |
| `resolve` | `e` | With a thread open: resolve or reopen it |

Letters follow the key's place on non-Latin layouts (the C key is C in Russian too), and digits work with Shift or
on AZERTY. The page shows your keys: the chat button reads "chat (x)" when `chat` is `x`.

## Not settings

- **Per run, flags only:** `--new`, `--all`, `--pages`, `--timeout`, `--resolve`, `--done`, `--on-it`, `--question`, `--wait`, `--page`, `--dir`.
- **Set by agents:** `LAB_AGENT`, `LAB_AGENT_NAME`, `LAB_SESSION_NAME` and the agents' own session ids.
- **For tests:** `LABIT_HOME`, `LAB_TAB_TTL`.
