# Changelog

Versions follow [semver](https://semver.org). Before 1.0, a minor version can change how things work.

## Unreleased

- Phones on their side get the same sheets as upright (they used to get the computer's floating chat, which a tap outside didn't close and which couldn't be pulled up).
- Phones: tapping a pin moves the page so the pin sits above its thread sheet instead of under it.
- Router, narrowed after the big benchmark (v5 put back 15 fixes a run, 11 of them wrongly):
  - Shared code is a file loaded from two or more files in other folders (or the stylesheet of such a component, or a `:root` stylesheet). Imports are resolved by path, so a feature's own `status.js` isn't another feature's, and a stylesheet is named in full, so importing `InvoicesTable` doesn't count as importing `InvoicesTable.module.css`. On the benchmark app this flags exactly the 6 shared library files and none of the 11 feature files.
  - Only risky quick changes go to the session to check: code, or more than one file. A one-file style fix the quick model kept no longer wakes it.
- The drawn pointer shows exactly where the system pointer is hidden, checked again when the page scrolls under a still mouse, Shift or Option is pressed, or go and comments are switched. A page's own pointers (a clickable card) win over it; editable text gets a text cursor and data-uncommentable parts the plain arrow; in an open dialog, popover or full screen (above the widget) the picture pointer stays.
- The comment pointer is drawn with CSS (your pin following the mouse) instead of an image, so it changes smoothly: it turns green with a tick for go, and fades out where the system pointer takes over (links, fields, the widget, Shift). Mice only.
- Lab pages draw dividers as Apple-style hairlines: half a pixel (one device pixel on Retina) in Apple's separator grey (`--lab-hair`, `--lab-gray-300`).
- Pins find their element again after the page changes above them: when the stored path leads to a different element (a section added, items reordered), the pin looks for the one with the same tag, classes and words under the same heading, nearest to where it was, and sits at the same spot inside it.
- Pin statuses. A go pin is an outline with a green tick when placed, gets the turning stroke while the agent is on it, and fills green once done. A comment pin shows your initial, the stroke, then a green tick when done (was grey).
- Closing the chat (Escape, the button or a click outside) takes the cursor out of its box, so keys like M and V work right away.
- Keys swapped: M shows and hides comments (was C), C opens and closes the chat (was M).
- Lab colours are set up like Cooking's: a fixed grey scale and greens as base colours (`--lab-gray-*`, `--lab-green-*`), and named uses that point at them (`--lab-page`, `--lab-bg`, `--lab-fg`, `--lab-muted`, `--lab-line`, `--lab-soft`, `--lab-green`, `--lab-green-soft`); dark mode only re-points the uses. Same colours as before, now solid hex.
- Pointers are drawn once as PNGs (1x and 2x) instead of SVG, which browsers re-decode on every pointer change (a flicker, Safari most), and are rewritten only when your initial changes.
- A newer version waits to reload until no thread, list or chat is open, so nothing moves while you read.
- Messages: no "↩ replied" mark, and an agent's name shows without its session id ("Claude", not "Claude · session 8a296ba1").
- The comment pointer looks like your own pin: the white teardrop with your initial (a + before you've given a name), clicking at its point; links and controls keep theirs, Shift gives the text cursor back. The go pointer is the same shape, green with a tick.
- The ✓ / ✓✓ in a message's corner are as tall as the time's digits.
- The list's and chat's close button: hovering only darkens the cross (no circle behind it), and no "close" tooltip.
- Your own messages are soft green with dark text, not black.
- Go mode's pointer is a go pin (green teardrop with a white tick), clicking where its point is.
- Computers, with comments shown: a click or drag no longer selects the page's text; hold Shift to select (and quote) words. Fields and editable text stay selectable.
- Switching go mode (V or the button) redraws nothing, so nothing flickers.
- Apple's continuous corners (squircle) on boxes, cards, bubbles, sheets, keys and rows wherever the browser draws them (Safari 26, Chrome); dots stay circles and the pin keeps its teardrop.
- The lab's design system in one file, `/_lab/lab.css`: colours, three corners, type, boxes, pills, buttons, keys, rows and tables, with `--lab-*` names that are also the widget's theme hooks. The lab's page list and its "not found" page use it.
- The bar's "hide comments" reads just "hide".
- Two corner sizes in all: 6 px for small things (keys, list rows, tabs, tags, text buttons), 12 px for boxes, cards, bubbles, sheets and buttons (the bar's pills too, no more round ends). Circles only for dots and the send button.
- The list has just two tabs, new and open, and opens on new each time. The work, resolved and mine tabs and draft mode are parked (hidden, code kept).
- Replied and done show as small marks beside the name again (↩ replied, ✅ done), not inside the message's words.
- Hovering a pin shows what it's on: a drawn area its green outline, selected words their highlight. An open area pin shows its outline again (it was hidden when the area also held a quoted word), steady: no dark flash or shadow as it opens.
- "copy link" sits on the left side of the screen, beside who's listening; the bar stays on the right.
- The list's and the chat's close button is a round, quiet button with a drawn cross, darker on hover.
- The bar's pills show their keys: chat C, list L, go V, hide M (hidden on touch screens).
- Escape closes the chat and the list too (after an open thread or new comment).
- On a computer, opening the chat closes an open thread (and a new comment with nothing typed in it).
- Scrollbars inside the chat, threads and the list are thin, on a clear track, like macOS ones (CSS only).
- Go mode: a "go" button in the bar, or V, switches it on and off. While it's on, every click, drawn area, selection or hold on a phone posts a "go" pin at once (approve what it's on), with no box to type in; in draft mode go pins wait with the other drafts. Needs your name set once. A go pin is green with a tick, apart from comments.
- A comment on selected words puts its pin on the last selected letter, where the selection ended (on the first when the selection runs over several items).
- A pin the agent is on (handed to it and not answered yet, or answered "On it") has a green stroke running round its own teardrop outline.
- The list has a "work" tab: Now (handed to the agent and not answered yet, or answered "On it"), Next (sent, not handed yet) and Done today, for this page's pins and chat.
- Drawn areas are a green dotted outline with no fill and no dark ring; a quote that runs over several items is found and lit.
- Phones: the chat has two heights, like iOS and Android sheets: pull it up (or flick) to fill the screen, pull it down from there to go back; from the lower height a pull down closes it as before, and a hard flick down from the top closes it too. It opens at the lower height.
- Links in the chat and in threads open in a new tab.
- On a computer, a click outside the chat closes it and does nothing else (no new comment, no press on what's under it); what you typed stays.
- A newer version reloads the page as soon as it's safe: not while you type, have words in a box, place a new comment or just touched the page. An open chat, list or thread no longer holds it back; they come back after the reload.
- Jumping to a pin (list, chat, J / K) puts the pin and its open thread in view together, in the middle of the window when they fit.
- A long thread scrolls inside its card (at most 460 px or 62% of the window) and opens at its first new message, or the newest.
- Hovering a pin on quoted words lights them up; the quote's highlight is green, with no dotted box behind it.
- Phones: the sheet's grab strip is 44 px tall (it reaches a little above the sheet's edge); the bar looks the same.
- Phone sheets, from the bottom-sheet research (Vaul, Ionic, iOS and Android sheets):
  - Android's back gesture closes an open sheet (chat, list, thread, new comment) instead of leaving the page; with something typed it nudges, like a tap on the dimmed page.
  - Right after the messages or the list scrolled (a fling up to the top), a pull down keeps scrolling for 100 ms instead of taking the sheet with it.
  - For 200 ms after letting go of a drag, a tap does nothing, so a sheet springing back under the finger doesn't press a button or pop the keyboard.
  - iOS 26.0's leftover 24 px viewport offset after the keyboard closes is ignored (with nothing focused to type in), so the sheet no longer sits off by that.
- Local labs: what's new and what's read is shared by name, so your phone and your Mac (the same name) show the same: open a pin or the chat on one and its "new" clears on the other. Kept in `.lab/reads.json`.
- Each comment is marked when it's handed to a wait, instead of one "seen up to" time: a comment a batch left out (or one saved a moment late) is no longer skipped for good.
- Chat and list buttons stand out (bold) when something is new, and the chat marks where unread messages start with a "new" line.
- Resolving a thread closes its card.
- Computers: Shift + drag selects words (a plain drag still marks an area), and letting go opens a comment quoting exactly them. Comments from the phone's Comment chip quote the whole selection too, not just the first word. A quote holds up to 300 characters (was 80), so a long selection isn't cut short.
- Threads read like the chat: bubbles (yours on the right), the time and ✓ ✓✓ in the corner, ✅ on a done answer, a "new" line above the first unread reply.
- "copy link" keeps its width while it says "copied", so nothing beside it moves.
- On a computer, opening the chat puts the cursor in its message box.
- Chat: each message has its time in the corner (no hover tooltip over the text), your own with ✓ / ✓✓; no "↩ name: …" quote above replies (the ✅ for done stays); no click to reply (phones swipe).
- The list names each pin by what it's on: when the pinned element says little ("4", an icon), the text of the box around it.
- Phones: holding a link or image no longer starts iOS's drag, which cancelled the hold before the box could open the keyboard.
- Phones: a sheet follows the finger like a native one: from any part, and from its list or messages when they're at the top; a fast flick or a pull past a third closes it at the finger's speed, else it springs back; pulled up, it stretches a little.
- Chat: swipe a message left to reply to it (it follows the finger, ↩ shows, the phone ticks), and the box says so: "message · swipe one to reply".
- Phones: closing the chat or list with the keyboard up no longer jumps: the sheet slides down behind the keyboard, which goes once the sheet is gone.
- Phones, Safari 26: with the keyboard up, the strip above it around Safari's address pill (where Safari draws nothing fixed) is covered by a solid block in the page, so the page no longer shows under the box; the sheet stays a half sheet above it.
- A tap anywhere on a message box puts the cursor in it; the box is taller and wider than its one line of text, so taps near its edge used to miss.
- Chat: your messages show ✓ when sent and ✓✓ once handed to the agent, as in messengers.
- Phones: the page behind an open sheet no longer scrolls, even when you drag on a part of the sheet with nothing to scroll.
- The chat closes from the dimmed page even with text in its box (the text stays for next time); a thread or new comment with typed text nudges instead of closing, since closing would lose it.
- `labfb pages`: a lab serving this folder hides one serving a folder above it, so the list is this lab's pages, not everything up there.
- Phones: the keyboard's ^ ˅ step to the previous or next pin while you write a reply, the keyboard staying up.
- The router, from the big-app benchmark (Haiku said Done on 29 of 30 pins, 25 were right):
  - A quick change to shared code (a file two or more others load, its stylesheet, or a stylesheet that sets :root variables) is put back and goes to the session with why, since it can break pages nobody pinned.
  - The quick model's changes always reach the session as "Quick changes to check", even when no pin was passed, with the ask to check each does what the pin asked and nothing broader.
- Phones: with the keyboard up, a thread, the list and the chat fill exactly what the screen shows (so iOS can't push them up and no page shows around them); a new comment stays just above the keyboard with the page dimmed above it, so you see what you comment on.
- Phones: a tap or a swipe down on the dimmed page above a sheet closes it (the tap now also works on iOS Safari).
- Phones: while a sheet is open, swiping down no longer triggers the browser's pull-to-refresh.
- The chat holds only its own messages (about the page as a whole) and their replies; pins stay on the page and in the list. Your own comments are never new to you (your name in any case or spacing, or a pin this browser started), and the list tags threads with unread replies with a "2 new" pill. The chat stays at its newest message while the keyboard shortens it.
- The list marks done threads with ✅ (resolved, fixed by the quick model, or answered "Done: …").
- Sending eases the new message or reply in and the arrow flies off; the chat keeps its box (and the phone's keyboard) after a send and only follows new messages while you're at the bottom. Phones: prev / next are thumb-sized and keep the keyboard as it was, and the thread sheet keeps its height while you step.
- Phone sheets: the thread, list and chat scroll natively and move only from their top (handle and header), so a swipe down never scrolls the messages; the message box is solid down to the screen's edge (behind the home bar and the keyboard too), the page is dimmed past the screen's edges, the ✕ is gone on phones, and sheets slide away when closed. A sheet sits above the keyboard and fits what the screen shows.
- Phones: the send button works on the first tap with the keyboard open (pressing it no longer takes the cursor out of the box).
- Opening a thread puts the cursor in its reply box, phones too; in the chat, messages of resolved threads and "Done:" answers carry ✅ by the reply mark; chat messages don't count among the comments.
- Phone sheets feel native: they slide up, follow the finger down from the header (always) or the top of their content, spring back or slide away (a flick counts), and the dimmed page fades with them.
- Phone sheets dim the page behind them (a tap there closes them, unless something is typed), never scroll the page, and the chat opens at its newest message.
- Phones: the comment and name boxes ask for no autofill, autocorrect or writing suggestions; prev / next swap the thread in place (no slide, no keyboard).
- Whoever started a thread can resolve and reopen it (the key their browser keeps for moving the pin), on a phone too; deleting stays admin-only.
- Phones: the agent's light sits in the "list" button (steady: listening, blinking: working, grey: nobody) instead of a separate label, and the bar is back at the bottom; the send button is a 36 px circle. On computers the label's light blinks while the agent works.
- Phones: swipe a sheet down to close it; a thread has ‹ prev, next › and new · 2 ›; a tap on the page puts the cursor in the new comment's box at once.
- The page waits to reload after a change while a thread, a new comment or the list is open, or a box has focus; it reloads when you close it.
- A chat ("chat" in the bar): the page's whole conversation in time order, pins (with what they're on) and every reply. A new message is about the page as a whole (no spot, no pin; the agent reads it as "on: the page as a whole"); tap a message to answer it instead. On phones the chat and the list are sheets from the bottom.
- A comments list ("list · 2 new" in the bar, or L), each comment with a few words of what it's on: new (unread replies), open, resolved (admins) and mine; J/K step through the pins and scroll to each, R replies, E resolves.
- Draft mode: with "draft mode" on in the list, new pins wait in this browser until "send 3 drafts", so the quick step doesn't start on pin 1 of 10.
- Phones: a tap only reads; hold a finger still for half a second anywhere to pin (links and buttons too), and the box opens with the keyboard (with comments on, the page's text isn't selectable, so iOS doesn't take the hold for a selection). A new comment or a thread opens as a sheet from the bottom, full width; selected text gets a Comment chip.
- The quick step, from the fix benchmark:
  - It takes bug reports asked as questions ("why is this here twice?", "nothing happens") and one-line logic slips (a comparison, a rounding, a condition), not only wording and styles. Before, Haiku passed every pin worded as a question.
  - When it passes, it says why ("PASS: needs a change in lib/orders.js"); the session gets that line with the pin.
  - Each quick change is checked: labfb notes the project's files before, sees exactly what changed after, and keeps it only when the tool said Done and it is small (3 files, 40 lines). A pass, or a change too big, is put back, so the session starts from the files as they were.
  - The quick model's changes ride along with the next pins the session gets, for a glance (they never wake it by themselves).
  - Every quick decision is a line in `.lab/quick.jsonl` (done, pass, put back; why; files; lines; seconds).
  - 👍 keep / 👎 put back on a quick fix (this computer): 👎 restores the files if nobody changed them since, and hands the pin to the agent marked as rejected.
- Sharper pins, from a frontend fix benchmark against Agentation:
  - Every element on a React dev build now gets its own JSX file and line ("written at") and the component that rendered it, not only a component's outermost element (it was 3 of 24 pins in the benchmark).
  - The "looks" line names only CSS variables that are colours: a radius or spacing variable no longer names a text colour (it did on 12 of 24 pins).
  - Behind a dev server, the app's index.html shell isn't given as a page's file; the route's source is, spelled as on disk (src/pages/Orders.jsx).
  - An area comment lists what it holds: the elements wholly inside it, each with its text, component and line.
  - Locally the agent text says to answer with `reply`, not with a POST.
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
