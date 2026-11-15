# labfb

[![npm](https://img.shields.io/npm/v/@leonidstern/labfb)](https://www.npmjs.com/package/@leonidstern/labfb) [![test](https://github.com/LeonidStern/labfb/actions/workflows/test.yml/badge.svg)](https://github.com/LeonidStern/labfb/actions/workflows/test.yml) [![MIT](https://img.shields.io/badge/license-MIT-black)](LICENSE)

Pin comments on pages, and your agent reads them as plain text. Use it on a live domain where anyone with the link can comment, or on your own computer, where your agent (Claude, Codex, Cursor…) answers on the pins while it works.

**Small, no dependencies, runs in any folder.** labfb uses only Node 20+ itself: no packages to install, about 125 kB on npm, 14 files. Run `npx @leonidstern/labfb` in any project or folder: nothing goes into your project's dependencies or code, and it works with any stack, from plain HTML to Astro, Next or Vite.

![Comments pinned on a demo page](docs/comments.png)

## Features

**Cloud lab**: pages on a domain, for people you share links with
- **No account:** anyone with the link clicks anywhere, types a name and comments.
- **One link for your agent:** "copy link" gives plain text with every open comment. Paste it into any agent and it goes to the file.
- **Knows what's under the pin:** the quoted words, the element, the image file and pixel, the code line, the video second; on a dev build, the component and the file and line that wrote it. No screenshots needed.
- **One domain, many repos:** the lab domain only proxies `/<name>/*` to each member's own repo and Vercel project.
- **Admin links per person:** let someone resolve and delete on their pages only. Nothing to set up per person.

**Local lab**: pages on your computer, for you and Claude
- **No deploy:** run `npx @leonidstern/labfb@latest` in your project. It finds your running Astro, Next or Vite dev server and puts comments on top, or serves plain HTML files.
- **Your agent answers on the pin:** it hears each comment as you post it, edits the file, the page reloads, and the reply shows on the pin.
- **Shows who is listening:** the label says whether Claude is listening or working. Close the page and Claude waits quietly: your first comment when you're back wakes it, and it stops after an hour.
- **Quick model first, a small router:** when Claude Code (or Codex, Cursor, opencode, Copilot, Amp, Antigravity) is installed, small, clear changes, and one-line bugs even when asked as a question, are done by its one-shot mode in a few seconds, each checked and put back if it's a pass or too big. What it passes reaches your agent with its reason, and its changes ride along for a glance. `--no-fast` turns it off.
- **Phone too:** `--wifi` lets a phone at home join. Comments stay in `.lab/`, one store per project.

Both: works on text, code, photos and video, drag your pins, hold Option to comment on links and buttons, 27 KB gzipped (the script on the page), and a [Claude skill](skills/labfb/SKILL.md) that knows both flows.

## Cloud lab

Paste this into your agent. It is the whole setup.

```text
Set up labfb (https://github.com/leonidstern/labfb) for me on Vercel.

0. First check whether I already have a lab (a Vercel project with LAB_HOST set, or a site that loads /_lab/comments.js). If I do, stop and tell me: add sites to that one instead.
1. Fork the repo and import it into Vercel: framework preset "Other", no build command.
2. Add Upstash Redis from the Vercel Marketplace (free tier). It sets KV_REST_API_URL and KV_REST_API_TOKEN.
3. Set env vars: LAB_HOST=<lab domain, e.g. lab.example.com> and LAB_COMMENTS_ADMIN_TOKEN=<output of `openssl rand -hex 24`>. Tell me the token. Redeploy so the variables apply.
4. Add <lab domain> to the Vercel project and tell me the DNS record to create.
5. For each site that should get comments (slug = a short name, e.g. anna):
   - serve it under the base path /<slug> (Astro `base`, Next `basePath`, Vite `base`) from its own Vercel project; every page answers 200, no redirects
   - add two rewrites to labfb's vercel.json:
     { "source": "/<slug>", "destination": "https://<their-project>.vercel.app/<slug>" },
     { "source": "/<slug>/:path*", "destination": "https://<their-project>.vercel.app/<slug>/:path*" }
   - add this to the site's shared layout, before </body>:
     <script src="https://<lab domain>/_lab/comments.js" defer></script>
   - put pages at /<slug>/<project>/<secret>/<page>, where <secret> is 10 random characters per project; mark them noindex and link to them from nowhere
   - deploy it with prebuilt deploys: add "ship": "npx --yes vercel build --prod --yes && npx --yes vercel deploy --prebuilt --prod --yes"
     to its package.json scripts and "git": { "deploymentEnabled": false } to its vercel.json, so `npm run ship` builds on my computer
     and is live in seconds, and a push only keeps the history (link it once: `npx vercel link`)
6. Once I confirm the DNS works: POST a test comment with curl to https://<lab domain>/_lab/api/comments
   ({"page":"/_lab/demo","name":"setup","text":"test"}, content-type application/json) and check that
   https://<lab domain>/_lab/agent/_lab/demo shows it as text. Then delete it with header x-lab-admin: <token>.
```

- **Comment:** open a page through the lab domain, press `c` (or hold Option), then click or drag. Drag your own pin to move it.
- **Read:** `https://<lab domain>/_lab/agent/<page path>` returns every open comment as plain text. Paste it into your agent.
- **Resolve or delete:** open any page once with `#lab-admin=<token>`.
- **Deploys:** each site ships with `npm run ship` (built on your computer, uploaded with `vercel deploy --prebuilt`, live in about 6 s for a small Astro site); pushes don't deploy. Ship what you commit.
- **Admins:** ask your agent "make a lab admin link for anna on /anna". With your token it gets a link that lets anna resolve and delete comments on `/anna` pages only. One browser can hold links for several labs. Nothing to set up per person (how: top of `api/lab-comments.mjs`).

## Local lab

Paste this into Claude Code in your project. It is the whole setup.

```text
Start labfb (https://github.com/leonidstern/labfb) on this project and listen to my comments.

1. Run `npx @leonidstern/labfb@latest` here in the background. It finds this project's dev server, or serves plain HTML files.
   If it says the dev server isn't running, start it the way this project does, then run it again. Never stop other servers.
2. Run `npx @leonidstern/labfb wait` in the background, with --name set to this project's name. It ends with my next comment.
3. For each comment, change what it asks, then answer on the pin: `npx @leonidstern/labfb reply <id> "Done: …"`, with the id
   that wait printed. Add --resolve when it's fully done; if you need something from me, ask in the reply instead.
4. Run wait again right away. Stop when wait says the page was closed.
```

Using it often? Install the plugin once, then just say **"start labfb"** in any project. With the plugin, **"use lab"** also makes Claude show new pages in labfb instead of an Artifact:

```text
/plugin marketplace add leonidstern/labfb
/plugin install labfb@leonidstern
```

Without Claude, run `npx @leonidstern/labfb@latest` in your project:

- **Dev server (Astro, Next, Vite…):** start it as usual. labfb finds the one running from this project, even with other projects' servers running, and puts comments on top. `--proxy 4321` picks a port yourself.
- **Plain HTML files:** served as they are. Pages somewhere else: `npx @leonidstern/labfb@latest dist`.

- **Comment:** press `c` (or hold Option) and click. Drag to mark an area.
- **One lab per project:** `npx @leonidstern/labfb list` shows the labs running on your computer. Starting one in a folder that a running lab already serves opens that lab instead (`--new` starts a separate one anyway).
- **This project's pages:** `npx @leonidstern/labfb pages` writes `.lab/lab-pages.md`, the project's lab pages as links with open comment counts (`--all` for every lab on your computer). `npx @leonidstern/labfb add <url>` adds a cloud lab page to the project's list. Claude sends it to you, so in the desktop app it sits under Outputs.
- **Pick the tool or model in the pin:** write "use fable", "@opus", "use gpt-5", "@codex", "gemini: …", "@cursor" or "model:<name>" and that tool and model makes the change. Start with `!` (or name the agent that is listening, like `@claude`) to send it straight to the session. A tool that isn't installed says so on the pin, and the session takes it. Other pins go to the quick model first.
- **MCP (optional):** `npx @leonidstern/labfb@latest mcp` is an MCP server with three tools, `comments`, `reply` and `wait`, for the lab in the folder the agent runs in (`comments` also reads a cloud lab page by its address). In Claude Code, once for all your projects: `claude mcp add -s user labfb -- npx @leonidstern/labfb@latest mcp`. The `wait` command stays the quickest way to hear a pin as it's posted.
- **Options:** `--no-fast` turns off the quick model, `--wifi` lets a phone at home join. `npx @leonidstern/labfb preview` opens it in the Claude desktop app's preview pane. `--help` has the rest.
- **Files:** comments stay in `.lab/` in the project. Delete it to start over. Add `.lab/` to `.gitignore`.

## Other agents

labfb works with any agent that can use a terminal or MCP. Comments are plain text, the local loop is a few shell commands, and the skill is in the shared Agent Skills format.

- **The plugin (skill + MCP server):**
  - Codex: `codex plugin marketplace add leonidstern/labfb`, then `codex plugin add labfb@leonidstern`.
  - Cursor: add the repo as a plugin (Dashboard → Plugins & MCPs → Import from Repo), or copy it to `~/.cursor/plugins/local/labfb`.
  - Copilot CLI: `copilot plugin marketplace add leonidstern/labfb` (it reads the Claude plugin files).
  - Others with Agent Plugins: `plugin.json` and `mcp.json` at the repo root.
- **Just the skill:** `npx skills add leonidstern/labfb` puts it where your agent reads skills (`.agents/skills/` for most). Then "start labfb" works as in Claude. To point every session at it, add to your `AGENTS.md`:
  ```md
  Pin comments on pages: labfb. Say "start labfb" to listen; see .agents/skills/labfb/SKILL.md.
  ```
- **Cloud lab:** give the agent the `/_lab/agent/<page path>` link. It's plain text with every open comment.
- **Local lab:** paste the prompt from [Local lab](#local-lab), or use the skill. labfb tells the agent apart by itself: the page says "talking to Codex", replies are signed "Codex", and the quick step uses that agent's own tool.
- **Agents that aren't woken when a background command ends** (Codex, Antigravity): run `wait --timeout 50` in the foreground, in a loop. The MCP `wait` returns after 50 seconds by default for the same reason (Codex and Cursor stop tool calls at 60).

| Agent | Known by | MCP | Quick step | Back to the session |
|---|---|---|---|---|
| Claude Code | `CLAUDECODE` | `claude mcp add labfb -- npx @leonidstern/labfb@latest mcp` | `claude -p` (haiku) | link, or `claude --resume` |
| Codex | `CODEX_THREAD_ID` | `codex mcp add labfb -- npx @leonidstern/labfb@latest mcp` | `codex exec -s workspace-write` | `codex resume <id>` (tap the label to copy) |
| Cursor | `CURSOR_AGENT` | its MCP settings | `cursor-agent -p` | |
| Amp | `AMP_CURRENT_THREAD_ID` | its MCP settings | `amp -x` | thread link |
| opencode | `OPENCODE_CLIENT` | its MCP settings | `opencode run` (edits only) | |
| Antigravity | `ANTIGRAVITY_AGENT` | its MCP settings | `agy -p` | |
| Copilot CLI | set `LAB_AGENT=copilot` | its MCP settings | `copilot -p --allow-tool write` | |

- **Choose:** `LAB_AGENT=<name>` overrides who is listening (any name), `LAB_AGENT_NAME` signs replies, `LAB_FAST_AGENT=codex` picks the quick tool, `LAB_FAST_MODEL` its model. The quick step never gets "allow all" flags: it may edit files in the project, nothing else, and a "Done" that changed no file counts as a pass.
- **Codex's sandbox:** if `wait` or `reply` can't reach the lab, labfb says so. Use the MCP tools, or allow it: `-c sandbox_workspace_write.network_access=true`.
- **Your own quick step:** `LAB_FAST_CMD` replaces the agent's tool. It runs in the project folder, gets the prompt on stdin, the model a pin asked for in `LAB_MODEL` and the listening agent in `LAB_AGENT`; its last line is the answer: `Done: <what changed>` or `PASS`.

```sh
LAB_FAST_CMD='./scripts/quick-edit.sh' npx @leonidstern/labfb@latest   # start, with your own quick step
npx @leonidstern/labfb reply <id> "Done: …"                           # the agent answers on a pin
```

In a pin, Claude models ("use fable", "@opus") need the `claude` command, GPT models (`gpt-…`) need `codex`, and Gemini models need `agy`. The MCP server finds the project from the client's root folder or the shell's folder; if it can't, its tools take a `dir`.

## Updating

- **The command:** start labfb with `npx @leonidstern/labfb@latest` and npx fetches the newest version (plain `npx @leonidstern/labfb` may reuse an older copy it keeps). When a newer one is out, labfb says so as it starts; it checks npm at most once a day. `LABFB_NO_UPDATE_CHECK=1` turns that off.
- **The Claude Code plugin:** `claude plugin marketplace update leonidstern`, then `claude plugin update labfb@leonidstern`.
- **The MCP server:** added with `@latest` (as above), it starts the newest version each time.
- **Your cloud lab:** sync your fork of labfb with this repo on GitHub ("Sync fork") and redeploy; every site on the lab gets the new widget from the lab domain.

## Both

![A person pins, the agent GETs one link as plain text, then opens the exact file, line, pixel or second](docs/how-agents-see-comments.png)

- **Page hints:** `data-uncommentable` keeps comments off a part of the page; `data-comment-target` pins any click inside to that element. Same names as Claude artifact comments.
- **Theme:** set `--lab-accent`, `--lab-bg`, `--lab-fg`, `--lab-radius` or `--lab-font` on `[data-lab-comments]`.

Development: `npm test` runs the local-mode checks (Node 20+, no packages). Changes are in [CHANGELOG.md](CHANGELOG.md).

Tested with Claude: on a page with a photo, code and a video, Fable, Sonnet and Haiku found every spot from the link alone (file, pixel, line, second), see [bench](bench/). Admin links and deleting are tested across three labs in [bench/labs](bench/labs/). The script is 19 KB gzipped and loads after the page. Links are hidden, not locked, so don't put anything confidential there.

MIT · made by [leonidstern](https://github.com/LeonidStern) · [OOZE](https://ooze.design)
