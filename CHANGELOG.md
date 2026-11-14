# Changelog

Versions follow [semver](https://semver.org). Before 1.0, a minor version can change how things work.

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
