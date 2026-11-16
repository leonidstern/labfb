# labit

[![npm](https://img.shields.io/npm/v/@leonidstern/labit)](https://www.npmjs.com/package/@leonidstern/labit) [![test](https://github.com/leonidstern/labit/actions/workflows/test.yml/badge.svg)](https://github.com/leonidstern/labit/actions/workflows/test.yml) [![MIT](https://img.shields.io/badge/license-MIT-black)](LICENSE)

Pin comments on your pages. Your coding agent reads them, changes the code, and answers on the pin.

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

## Good to know

- `--wifi` lets your phone at home comment too.
- Comments stay in `.lab/` in your project. Add it to `.gitignore`.
- No dependencies, Node 22+. `--help` lists everything else.

Shared labs on a domain (comments from people you send a link to) come later.

MIT · made by [leonidstern](https://github.com/LeonidStern) · [OOZE](https://ooze.design)
