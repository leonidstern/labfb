# Changelog

Versions follow [semver](https://semver.org). Before 1.0, a minor version can change how things work.

## Unreleased

## 0.6.0 · 2026-11-16

- New npm name: `@leonidstern/labit` (`npx @leonidstern/labit`; npm turned down the plain name `labit` as too close to `lab` and `lit`). The `labit` and `labfb` commands both work once installed. The GitHub repo is now leonidstern/labit (old links redirect).
- Everything else is labit too: the command in help and docs, the MCP server and plugins (`claude mcp add labit -- npx labit@latest mcp`), the skill (`skills/labit/`). Settings move to `~/.labit`; `LABIT_HOME` and `LABIT_NO_UPDATE_CHECK` replace the `LABFB_` names, which still work.
- The widget's source is split into modules: its stylesheet is `src/widget/styles.css` and pin anchoring is `src/widget/anchoring.ts` (TypeScript). `npm run build` bundles them into the same single `comments.js`.
- Needs Node 22 or newer: Node 20 reached end of life in April 2026. CI tests Node 22, 24 and 26.
- The page script ships without its code comments: 49 KB gzipped instead of 68 KB, same code. Its commented source is `src/comments.js`; `npm run build` writes `public/_lab/comments.js` (`npm run build:watch` while working on it).
- Local labs keep comments one file per page in `.lab/comments/` (a comment rewrites only its page's file). A lab with the old `.lab/comments.json` moves it over on start and keeps the old file as `.lab/comments.json.bak`.
- Each page's comments list is kept, compressed, until that page changes, instead of being built and compressed again for every page load.
- Done threads with nothing new in 30 days move to `.lab/archive/<page>.json` (on start, then once a day): pages no longer load them.
- Removed the quick model and its router: every pin goes straight to the listening session. Gone with it: `--fast` / `--no-fast`, the `LAB_FAST_*` variables, `.lab/quick.jsonl`, picking a tool or model in the pin ("use haiku", "@codex", "model:…", "!"), and 👍 keep / 👎 put back on quick fixes.
- Command-Z (Control-Z) takes back the last pin or go placed from the tab, newest first (deleted on this computer, resolved for guests).
- Keys: C chat, W next new comment (Shift-W the one before), 1 comment, 2 go, 3 cursor (pins shown, clicks are the page's own), M hide; in a text box Control-D goes to the next new comment. The bar marks them in its words: (c)hat, ne(w). Old N, J, K, V, L, A, D keys are gone.
- Tabs in the background stay connected to the lab, so their pins, chat and "(3)" title count keep up while you're in another tab.
- N goes to the next new comment (the pill shows the key); Control-N does it from anywhere, the reply box too (Control-Shift-N: the one before); J and K still step forward and back.
- Going to a new comment ("N new" or J / K) puts the cursor in its reply box (computers).
- The bar's "N new" has no ‹ › arrows: a click goes to the next new comment, J and K step forward and back.
- No pictures left in the widget's controls: the close cross and the send arrow are drawn with CSS, and the picture pointers are gone (where the drawn pin can't show, in an open dialog or before the mouse moves, the system crosshair / copy pointer stands in). Holding Option over a link shows the drawn pin too.
- ‹ N new › counts new messages in done threads too.
- A thread's reopen / resolve / delete sit on the right, a size smaller, out of the reading flow.
- Washes set to 5 / 10 / 15 / 50 % for black and white, 15 / 30 / 50 % and solid for green.
- Colours are washes, as in Cooking: white, black and green, each with 4 see-through steps (`--lab-black-1…4`, `--lab-white-1…4`, `--lab-green-1…4`); soft fills, hovers, lines and secondary text are washes of black on light and of white on dark.
- The bar keeps its pills in place: ‹ N new › and "show done" stay (quiet and disabled at 0) instead of appearing and shifting the others.
- The browser tab shows new messages as "(3) Page title".
- The chat's top is just the grab strip (no empty title row), as tall as a thread's.
- A pin on the page's body or main that was on a word sits on that word again after the page changes; if the word is gone it shows faded as moved. One with no word shows faded as moved once the page's height has changed under it (new pins keep that height).
- The list window is parked: the bar shows ‹ N new › while there are new comments (the middle and J go to the next, ‹ and K to the previous), and a "show done · N" / "hide done" pill. On phones the agent's light moves to the chat button. `LIST_WINDOW` brings the list back.
- The list shows each pin on one line (longer ones end in …); rows highlight in Apple's hover grey.
- Done pins with nothing new in them are hidden on the page; "show done · N" in the list brings them back (remembered per browser). A done pin with a new reply shows as usual.
- A wait's message starts with what it holds ("In this message: 3 new, 1 reply"), so an agent that only read part of it can tell something is missing.
- A safety net for missed pins: a thread handed to the agent more than 3 minutes ago (`LAB_REMIND_MS`) that still has no answer after the person's last words comes back in the next wait, under "Still waiting for your answer", at most every 10 minutes.
- Chat: a reply shows what it answers, as in Telegram (the name and the start of that message, a green bar beside it); a tap there jumps to it.
- The bar has ‹ › around "list" while there are new comments: they step through the new ones from the top of the page, without opening the list.
- The chat has no "chat" title (phones and computers).
- Writing in a done thread reopens it on the page at once (the lab already reopened it on its side).
- Greys are Apple's system greys, four steps a scheme (gray 6 #f2f2f7, gray 5 #e5e5ea, gray 3 #c7c7cc, gray #8e8e93; dark #2c2c2e, #3a3a3c, #38383a), in the widget and `lab.css`.
- On a computer a thread or new comment closes at once, like the chat (its fade-out flickered); phones still slide the sheet away.
- Lighter talk between the lab and the agent:
  - A reply in a thread the agent already has comes as one line (the new words, the thread's id and what it's about), not the whole thread again.
  - A new pin wakes the agent after 2 s of quiet (`LAB_SETTLE_MS`), so a quick run of pins goes over together.
  - Pins leave out details agents rarely use (computed looks, colours, window size, CSS path); they stay in the full text at `/_lab/agent/<page>`.
  - `reply … --wait` answers and listens again in one command.
- Done shows as a small green ✓ beside the name (like the ticks on messages), not "✅ done".
- A thread's reply box is the chat's: soft grey, no border; the new comment box drops its border too and keeps only a soft shadow so it stands out on the page.
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
