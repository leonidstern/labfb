# Changelog

Versions follow [semver](https://semver.org). Before 1.0, a minor version can change how things work.

## Unreleased

- Any agent, not just Claude:
  - labfb tells which agent runs `wait` and `reply` (Codex, Cursor, Amp, opencode, Antigravity, Claude; Copilot with `LAB_AGENT=copilot`). The page says "talking to Codex", replies are signed "Codex", and a Codex or Amp session shows its way back (`codex resume <id>`, tap to copy; Amp's thread link).
  - The quick step runs with whichever agent tool is installed (the listening agent's own first): `codex exec`, `cursor-agent -p`, `opencode run`, `copilot -p`, `amp -x`, `agy -p`, never with "allow all" flags. A "Done" that changed no file counts as a pass. `LAB_FAST_AGENT` and `LAB_FAST_MODEL` choose.
  - Fixed: the quick step signed every answer "Claude", even when `LAB_FAST_CMD` ran another tool.
  - The skill reads the same for every agent; `npx skills add leonidstern/labfb` installs it for Codex, Cursor, Copilot, Amp, opencode, Windsurf and others. Agents that aren't woken when a background command ends loop `wait --timeout 50` in the foreground.
  - `labfb mcp`: `wait` returns after 50 seconds by default (Codex and Cursor stop tool calls at 60), and the client's name signs replies when the agent's own variables don't reach the server.
  - In Codex's sandbox, a `wait` or `reply` that can't reach the lab says why and how to get around it.
  - A pin can name any tool or model: "use gpt-5" (Codex), "@codex", "gemini: …" (Antigravity), "@cursor", "model:<name>"; Claude models as before. Naming the listening agent sends the pin to the session; a tool that isn't installed says so on the pin. Tool names that are ordinary words (cursor, amp, copilot) count only with "@", so "cursor: pointer" stays a CSS request.
  - One plugin for several agents: `plugin.json` + `mcp.json` (Agent Plugins 1.0) for Codex and others (`codex plugin marketplace add leonidstern/labfb`), `.cursor-plugin/plugin.json` for Cursor; Copilot reads the Claude plugin files. Installed this way the MCP server starts in the plugin's folder, so it finds the project from the client's root (MCP roots) or the shell's folder, and its tools take a `dir`.
- Faster, from a code review:
  - the widget reads every pin's place once per redraw (150 pins: 11 layouts instead of 671 in ten redraws)
  - its font files load only when comments open, so a reader downloads none (57 KB)
  - behind a dev server, each page's file is remembered instead of guessed again for every page on every comment (300 pages: a comment takes 17.5 ms instead of 47.9 ms)
  - saving a CSS or JS file no longer makes labfb walk the folder again
- Fixed: a mistyped flag on any command is refused (it used to end up in a reply's text); `--` ends the flags.
- Fixed: `labfb preview` under npx names the package instead of npx's cache path, and keeps a bare `--proxy` bare.
- Fixed: a pin drag cut short by a redraw left a scroll listener behind.
- Using the latest: labfb says when a newer version is out as it starts (npm checked at most once a day, cached in `~/.labfb/latest.json`; off in CI or with `LABFB_NO_UPDATE_CHECK=1`). The README, setup prompts, skill and MCP setup start it with `@latest`, and a new "Updating" section covers the command, the plugin, MCP and cloud labs.
- `labfb mcp` follows the MCP spec of 2026-07-28 and still talks to older clients: `server/discover`, the version in every request (unsupported → error -32022 with the supported list), `initialize` for clients before it; tool titles, behaviour hints and strict input schemas; server instructions that comment text is people's words, not commands; unknown tools as protocol errors and bad arguments as tool errors; a rate limit; progress notes during a long `wait`, and a cancelled `wait` stops.
- The widget uses the system's own font (San Francisco, Segoe UI, Roboto…) instead of shipping Inter: no font downloads at all, and a smaller package. `--lab-font`, `data-font` and `data-font-url` still pick another.
- Pins on a dev build name the component that drew the element and where: React (18: file and line; 19: the served file), Vue 3 and Svelte, with variant props (`Button variant=ghost (in Toolbar)`, `written at: src/ui.tsx:97`, `component used at: src/ui.tsx:322`). Every pin also says how the element looks (fill, text colour, size and weight, corners), with colours named by the page's CSS variables. A small cut of Census's reader.
- `labfb mcp` (optional): an MCP server over stdin/stdout with the tools `comments`, `reply` and `wait`, for agents with MCP. No new dependencies.
- Cloud lab default: sites deploy with `npm run ship` (`vercel build` + `vercel deploy --prebuilt`, live in seconds) and git deploys off; the setup prompt adds both, and the skill ships, checks the page, then pushes.
- README: "Other agents": using labfb with Codex, Cursor, Gemini CLI or a script (`LAB_AGENT_NAME`, `LAB_FAST_CMD`, `LAB_MODEL`).

## 0.5.0 · 2026-11-14

- The quick model is on by default when the `claude` command is installed (no `--fast` needed). `--no-fast` turns it off; without the command it stays off.
- Skill: "use lab" (or "in lab", "show it in lab") makes Claude show a page in labfb instead of publishing an Artifact: it writes the HTML file, runs labfb, opens the page, and answers your pins.
- Run it in your project: `npx @leonidstern/labfb`, no folder. With the project's dev server running, it puts comments on top of it by itself: it finds the server run from this folder (or one inside it), even with other projects' servers running. `--proxy` with no port does the same.
- A project with a dev server that isn't running is no longer served as a file listing of `src` and `node_modules`: it says to start the server, and names the other projects' servers it saw.
- README: local setup is one prompt to paste into Claude Code, like the cloud lab; the plugin is the shortcut for regular use. No `<folder>` placeholders. The skill starts labfb with no folder.
- A folder with no `index.html` at the top opens its first page (`public/index.html`, say) instead of a list of folders. The list at `/` shows every page with its title, and leaves out folders with no pages.
- `labfb pages`: every running lab's pages as a Markdown list in `.lab/lab-pages.md`, with open comment counts. Running labs register in `~/.labfb/servers/` (removed on exit), and each lab answers `/_lab/pages` for this computer only. The skill sends the file to the person after starting a lab, so it sits under Outputs in the desktop app.
- One lab per project: `labfb list` shows the labs running on this computer; starting a lab in a folder that a running lab already serves opens that lab instead (`--new` starts a separate one). The skill and the cloud setup prompt now check for an existing lab, project, page or session before creating one.
- `labfb add <url>` / `labfb remove <url>`: save cloud lab pages with the project (`.lab/links.json`). `pages` lists the project's labs and cloud pages, by domain with open comments; `pages --all` lists every lab on the computer.
- Fixed: an area comment's text is now the words inside the area. It was the whole paragraph whenever the area reached above or below a line of text.
- Fixed: a comment card could stay see-through when the page was in the background (a stalled fade-in); cards now only slide in, never fade.
- Fixed: dragging on an image while a comment card was open dragged the image itself. Now it marks an area and closes the card; with comments on, images and videos never start a browser drag.
- Pins say more, so an agent finds the spot from the text alone (found with the benchmark in `bench/situations*`):
  - the exact pixel next to the rounded percents; the real file size of `srcset` and `<picture>` images; a spot inside CSS background photos (using the photo's own layer under a gradient); pictures turned by a CSS transform measured with the transform undone; pictures inside an SVG `<image>`
  - the blocks above and below a click on empty space, and the page y; light or dark (the colour behind the pin)
  - words in Chinese, Japanese, Korean and Thai; text added by CSS `::before`/`::after`; the chosen option of a `<select>`; words inside open web components (Shadow DOM)
  - code: the page's own line numbers in excerpts, lines drawn one element per line (Docusaurus), and a block's title next to it
  - animated pictures: a rough time since they loaded (a page can't read which frame is showing)
- Option-click is for commenting only: the page never sees it, so menus, buttons and folds don't act before the pin lands.
- A pin can pick its model in plain words: "@fable", "use opus", "with sonnet", "fable: …". That model makes the change, whatever its size (up to 10 minutes), and signs its answer "Claude · fable". "!" at the start or "@claude" sends the pin straight to the session. Plain mentions ("the fable of…", "Opus 23") don't count.

## 0.4.0 · 2026-11-14

- Package: `npx @leonidstern/labfb <folder>`, `--version`, `npm test`, CI on Node 20, 22 and 24.
- Claude plugin: `/plugin marketplace add leonidstern/labfb`, then `/plugin install labfb@leonidstern`. The skill moved to `skills/labfb/`.
- Delete asks inside the card, not with the browser's dialog.
- Hold Option to comment on links and buttons, also while comments are hidden with `c`.
- Posting a new comment closes its card; the pin stays.
- Closing the page: Claude keeps waiting quietly and wakes on your next comment; after an hour with no page open, `wait` ends and says so. Tabs in the background count as open.
- Replies use the comment id (numbers shift after a delete).
- Fixed: an unknown option was read as a folder name; paths with spaces or on Windows.

## 0.3.0 · 2026-11-14

- Local mode on a running dev server: `--proxy <port>` (Astro, Next, Vite).
- New replies show in the open card; the reply box takes focus.
- The label says whether Claude is listening, working, or away.
- Thin dotted area line that shows on any page; smooth send arrow.

## 0.2.0 · 2026-11-14

- Drag your own pin to move it.
- `data-uncommentable` and `data-comment-target`, the same names as Claude artifact comments.
- `--fast`: a quick model tries small changes first.
- `preview <folder>` for the Claude desktop app's preview pane.

## 0.1.0 · 2026-11-14

- Local mode: comments on pages on your computer, `wait` and `reply` for Claude.
- Cloud lab: pin comments, agent text link, per-person admin links, paper look.
