<h1><picture><source media="(prefers-color-scheme: dark)" srcset="docs/labit-mark-dark.svg"><img src="docs/labit-mark-light.svg" alt="" width="34" height="34" align="top"></picture> labit</h1>

[![npm](https://img.shields.io/npm/v/@leonidstern/labit)](https://www.npmjs.com/package/@leonidstern/labit) [![test](https://github.com/leonidstern/labit/actions/workflows/test.yml/badge.svg)](https://github.com/leonidstern/labit/actions/workflows/test.yml) [![MIT](https://img.shields.io/badge/license-MIT-black)](LICENSE)

**Review is the new build.** Pin comments on your pages. Your coding agent reads them, changes the code, and answers on the pin.

![Comments pinned on a demo page](docs/comments.png)

## Start

In your project:

```sh
npx @leonidstern/labit@latest
```

It finds your running dev server (Astro, Next, Vite…) or serves plain HTML, and opens the page with comments on top. Click to comment, drag to mark an area. `M` hides the comments.

## Let your agent answer

**Claude Code:** install the plugin once, then say **"start labit"** in any project.

```text
/plugin marketplace add leonidstern/labit
/plugin install labit@leonidstern
```

**Any other agent:** tell it to run these in your project.

```sh
npx @leonidstern/labit wait                    # ends with your next comment
npx @leonidstern/labit reply <id> "Done: …"    # answers on the pin
```

Or as an MCP server: `npx @leonidstern/labit@latest mcp`.

Everything merged to main, before it is released: `npx @leonidstern/labit@next`.

**Fewer permission prompts (Claude Code):** copy [examples/claude-settings.json](examples/claude-settings.json) to `.claude/settings.json` in your project (or merge its `permissions` into yours). labit's commands and MCP tools then run without asking; `--wifi` and `invite`, which let another device in, still ask. Claude Code reads a project's allow rules only once you've opened the folder in it and trusted it.

## Good to know

- `--wifi` lets your phone comment too. Each device opens a one-time link from `npx @leonidstern/labit invite`, so being on the same wifi isn't enough. The pages still travel in the clear over the wifi.
- Agents learn how you like answers: reply as usual, and when you say an answer was too long or unclear, your message shows **rule?**. Tap it and the rule goes to `~/.config/labit/replies.md`, handed to every agent with your pins.
- You name yourself once. The name is kept for this computer in `~/.config/labit/settings.json`, so every later lab starts out knowing you — browsers keep it per port, labs don't. `labit invite [name]` carries a name to a phone the same way. `--page /path` makes the link open that page. Opening a used or old link again on a phone that's already in just takes you there, and a phone that keeps using the lab stays in.
- Settings (port, your dev server, keys, how long the lab waits…): `labit.json` in the project and `~/.config/labit/settings.json` for you. `labit settings` shows them all; [docs/settings.md](docs/settings.md) explains each.
- Comments stay in `.lab/` in your project. Add it to `.gitignore`.
- `3` is zoom, on plain HTML pages: a comment that asks your agent for a deeper look into what it's on (3 once) or the bigger picture around it (3 again). `1` comment, `2` go, `4` pointer.
- No dependencies, Node 22+. `--help` lists everything else.

Shared labs on a domain (comments from people you send a link to) come later.

MIT · made by [leonidstern](https://github.com/LeonidStern) · [OOZE](https://ooze.design)
