// The commands that answer and exit: preview, add / remove, list, pages (the labs on this computer) and the agent's
// wait, reply, resolve, pin, invite. Loaded by local.mjs only for these, so starting a lab never reads it.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FOREGROUND_CAP, letter, listenPages, replyChoices, replyIntent, waitSeconds, type Opts } from './args.ts';
import { mySession } from './agents.ts';
import { keyFor, runningLabs, type Lab } from './labs.ts';
import { findLab, labAck, labCall, WAIT_SAID } from './labcall.ts';

type Ctx = { pos: string[]; opts: Opts; HERE: string; CMD: string; ME: string; die: (msg: string) => never };

export async function runCommand({ pos, opts, HERE, CMD, ME, die }: Ctx): Promise<void> {
  // ---------- the Claude desktop app's preview pane ----------
  // It starts servers from .claude/launch.json in the session's folder and hands them a free port in PORT.
  if (pos[0] === 'preview') {
    const root = path.resolve(pos[1] || '.');
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) die(`Not a folder: ${root}`);
    const file = path.join(root, '.claude/launch.json');
    let config = { version: '0.0.1', configurations: [] };
    if (fs.existsSync(file)) {
      // The app writes this file too, and allows comments and trailing commas in it (they don't survive this rewrite).
      const jsonc = (t) => t.replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m, str) => str || '').replace(/,(\s*[}\]])/g, '$1');
      try {
        config = JSON.parse(jsonc(fs.readFileSync(file, 'utf8')));
      } catch {
        die(`${file} isn't valid JSON, so it's left as it is. Add this to its "configurations":\n${JSON.stringify(entry(), null, 2)}`);
      }
    }
    function entry() {
      const args = ['.', '--no-open', ...(typeof opts.proxy === 'string' ? ['--proxy', opts.proxy] : opts.proxy ? ['--proxy'] : [])];
      // Under npx this script sits in npx's cache, which moves with every version: name the package, not the path.
      return CMD.startsWith('npx')
        ? { name: 'lab', runtimeExecutable: 'npx', runtimeArgs: ['--yes', '@leonidstern/labit', ...args], port: 4400, autoPort: true }
        : { name: 'lab', program: ME, args, port: 4400, autoPort: true };
    }
    config.configurations = [...(config.configurations || []).filter((c) => c.name !== 'lab'), entry()];
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n');
    console.log(`Added "lab" to ${file}.`);
    console.log('Open this folder in the Claude desktop app and ask Claude to start the "lab" preview.');
    console.log(`Then: run \`${CMD} wait\` in the background and answer the comments.`);
    process.exit(0);
  }

    const forHere = (lab: Lab) => lab.root === HERE || lab.root.startsWith(HERE + path.sep) || HERE.startsWith(lab.root + path.sep);
  // `labit publish <page.html | folder>`: like publishing an Artifact (Leo 18 Nov: "process is similar to artifacts, can
  // you do it like this"). The page goes into the one pages lab (pagesFolder), named for its topic; that lab starts if
  // it isn't running; the link is printed. Publishing again replaces it, same link. No folder or lab of its own.
  if (pos[0] === 'publish') {
    const src = pos[1] && path.resolve(pos[1]);
    if (!src || !fs.existsSync(src)) die(`Usage: ${CMD} publish <page.html | folder> [--name "topic"]`);
    const { loadSettings } = await import('./settings.ts');
    const home = String(loadSettings(HERE, {}).values.pagesFolder || '~/lab-pages').replace(/^~(?=$|\/)/, os.homedir());
    fs.mkdirSync(home, { recursive: true });
    const root = fs.realpathSync(home);
    const dir = fs.statSync(src).isDirectory();
    const topic = typeof opts.name === 'string' ? opts.name : path.basename(src).replace(/\.html?$/i, '');
    const slug = topic.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'page';
    if (!dir && !/\.html?$/i.test(src)) die(`${src}: give an .html file, or a folder of pages`);
    const dest = path.join(root, dir ? slug : `${slug}.html`);
    if (path.resolve(src) !== dest) {
      fs.rmSync(dest, { recursive: true, force: true });
      fs.cpSync(src, dest, { recursive: true });
    }
    let lab = runningLabs().find((l) => l.root === root);
    if (!lab) {
      spawn(process.execPath, [ME, root, '--no-open', '--name', 'Pages'], { cwd: root, env: { ...process.env, LABIT_EXIT_WITH_PARENT: '' }, detached: true, stdio: 'ignore' }).unref();
      for (let i = 0; i < 100 && !lab; i++) {
        await new Promise((r) => setTimeout(r, 100));
        lab = runningLabs().find((l) => l.root === root);
      }
      if (!lab) die(`The pages lab didn't start. Run it yourself: ${CMD} ${root}`);
    }
    const key = keyFor(path.relative(root, dir ? path.join(dest, 'index.html') : dest)); // "/topic", or "/topic/index"
    console.log(`http://localhost:${lab.port}${key.replace(/\/index$/, '/')}`);
    console.log(`In the pages lab (${root.replace(os.homedir(), '~')}). Publish again to update it, same link.`);
    console.log(`Listen for its pins: cd ${root} && ${CMD} wait --bg --pages ${key}`);
    process.exit(0);
  }

  // `labit list`: what runs, so an agent reuses a lab instead of starting another.
  if (pos[0] === 'list') {
    const labs = runningLabs();
    if (!labs.length) console.log('No labs running.');
    for (const lab of labs) {
      let pages = '';
      try {
        const info = await (await fetch(`http://localhost:${lab.port}/_lab/pages`, { signal: AbortSignal.timeout(2000) })).json();
        const waiting = info.pages.reduce((n, p) => n + (p.waiting ?? p.open), 0);
        pages = ` · ${info.pages.length} page${info.pages.length === 1 ? '' : 's'}${waiting ? `, ${waiting} waiting` : ''}${info.listening ? ` · ${info.listening} listening` : ''}`;
      } catch {}
      // What it runs and how long it has been up: between releases every lab says the same version, and the age is
      // what tells a lab left running for days (serving old code) from a fresh one.
      const age = lab.startedAt ? Date.now() - Date.parse(lab.startedAt) : NaN;
      const since = !Number.isFinite(age) ? '' : age < 36e5 ? `${Math.max(1, Math.round(age / 6e4))} min` : age < 864e5 ? `${Math.round(age / 36e5)} h` : `${Math.round(age / 864e5)} days`;
      const what = `${lab.version ? ` · labit ${lab.version}` : ''}${since ? `, up ${since}` : ''}`;
      console.log(`${lab.name}  http://localhost:${lab.port}  ${lab.root}${lab.proxy ? ` (on ${lab.proxy})` : ''}${what}${pages}`);
    }
    process.exit(0);
  }

  // ---------- every running lab's pages, as a Markdown list ----------
  // Written to .lab/lab-pages.md in this folder: a file Claude can send to the person, so the pages sit with its outputs.
  if (pos[0] === 'pages') {
    const labs = [];
    // The nearest lab wins: one serving this folder (or inside it) hides one serving a folder above, which would list
    // everything else up there too.
    const here = runningLabs().filter((l) => opts.all || forHere(l));
    const near = here.filter((l) => l.root === HERE || l.root.startsWith(HERE + path.sep));
    for (const lab of opts.all || !near.length ? here : near) {
      try {
        const res = await fetch(`http://localhost:${lab.port}/_lab/pages`, { signal: AbortSignal.timeout(2000) });
        if (res.ok) labs.push(await res.json());
      } catch {}
    }
    labs.sort((a, b) => a.name.localeCompare(b.name));
    // One group per local lab. Names only when there's more than one.
    const groups = labs.map((lab) => ({ name: lab.name, pages: lab.pages }));
    const lines = [];
    for (const group of groups) {
      if (groups.length > 1) lines.push(`**${group.name}**`, '');
      for (const p of group.pages) {
        const name = (p.title || p.file || p.path).replace(/[[\]]/g, '');
        const heard = p.listener ? ` · ${p.listener} listening` : p.waiting ? ' · nobody listening' : '';
        lines.push(`- [${name}](${p.url})${p.waiting ? ` · ${p.waiting} waiting` : ''}${heard}${p.when ? ` · ${p.when}` : ''}`);
      }
      lines.push('');
    }
    const out = path.join(HERE, '.lab', 'lab-pages.md');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, (lines.join('\n').trim() || (opts.all ? 'No labs running.' : 'No labs for this folder. `pages --all` lists every lab on this computer.')) + '\n');
    console.log(out);
    process.exit(0);
  }

  // ---------- boards (flag board): the lab places the frames and copies the pages; the agent says what and in what order ----------
  if (pos[0] === 'board') {
    const [, action, first, ...rest] = pos;
    const lab = findLab(opts.dir || '.') || die(`No lab server for this folder. Start one: run ${CMD} in the project.`);
    const arg = action === 'new' ? { topic: [first, ...rest].filter(Boolean).join(' ') } : action === 'list' ? { name: first } : action === 'pick' ? { name: first, frames: rest } : action === 'move' ? { name: first, frame: rest[0] } : { name: first, target: rest[0] };
    if (!['new', 'add', 'move', 'pick', 'list'].includes(action)) die(`Usage: ${CMD} board new "<topic>" [--of /page] [--variants 3 | --widths 390,820,1280 | --flow /a,/b] | add <board> <frame|/page|file.html> [--label "…"] [--width N] [--after <frame>] | move <board> <frame> --after <frame> (or --first) | pick <board> <frame>… | list [<board>]`);
    const out = await labCall(lab.server, '/_lab/api/board', { action, ...arg, of: opts.of, variants: opts.variants, widths: opts.widths, flow: opts.flow, label: opts.label, width: opts.width, after: opts.after, first: opts.first }, mySession(opts.name, opts.model)).catch(() => null);
    if (!out) die(`The lab server for ${lab.dir} isn't running. Start it: ${CMD}`);
    if (out.status === 404 && /boards are off/.test(out.text)) die(`Boards are off in this lab. Turn them on in labit.json: {"flags":{"board":true}}, then restart the lab.`);
    let said = out.text;
    try {
      said = JSON.parse(out.text).text;
    } catch {}
    console.log(said);
    process.exit(out.status < 300 ? 0 : 1);
  }

  // ---------- Claude's side: wait, reply, resolve, pin ----------
  if (['wait', 'reply', 'resolve', 'pin', 'invite'].includes(pos[0])) {
    const [cmd, ref, ...words] = pos;
    const lab = findLab(opts.dir || '.') || die(`No lab server for this folder. Start one: run ${CMD} in the project.`);
    const { dir, server } = lab;
    const session = mySession(opts.name, opts.model);
    const gone = () =>
      die(
        process.env.CODEX_SANDBOX_NETWORK_DISABLED
          ? `Codex's sandbox blocks this command from reaching the lab on this computer (port ${server.port}). Use labit's MCP server instead: ` +
              `codex mcp add labit -- npx @leonidstern/labit@latest mcp. Or let the sandbox reach it: -c sandbox_workspace_write.network_access=true`
          : `The lab server for ${dir} isn't running. Start it: ${CMD} ${dir === process.cwd() ? '' : dir}`.trim() + '.',
      );
    // A lab that goes and comes back (--dev, an update, a crash and a start again) shouldn't end a wait: the command
    // holds on for a few seconds and carries on. The clock starts when the lab first goes, not when the call began --
    // a wait sits open for 25 minutes, so a deadline set up front would already have passed by then.
    const call = async (pathname: string, body: object, seconds = 5) => {
      let until = 0;
      for (;;) {
        try {
          return await labCall(server, pathname, body, session);
        } catch {
          if (!until) until = Date.now() + seconds * 1000;
          if (Date.now() >= until) return gone();
          await new Promise((r) => setTimeout(r, 400));
        }
      }
    };

    // The same words sent again by the same session to the same thing (the agent ran reply again because it never saw
    // the first one's answer) carry the same nonce, so the lab gives back the first comment instead of a second one,
    // as it does for the browser's retries (kept 15 minutes). The browser's nonce is random; the agent's command is a
    // new process each time, so its nonce comes from what it sends and what it answers: a reply names the thread's
    // latest message from a person, so "Done." after the person wrote again is a new answer, not a retry.
    const nonceOf = (...parts: unknown[]) =>
      createHash('sha256').update(JSON.stringify([session.id || session.name, ...parts])).digest('hex').slice(0, 32);

    // A link for a phone on the same wifi: one use, ten minutes. Claude hands it over in chat; the lab must be --wifi.
    // `invite <name>` says who is coming, so their phone starts out named; with none, your own name goes along.
    if (cmd === 'invite') {
      const out = await call('/_lab/invite', { name: [ref, ...words].filter(Boolean).join(' '), page: opts.page || '' });
      if (out.status === 404) die('This lab is open to this computer only. Start it with --wifi to let a phone in.');
      if (out.status >= 300) die(`Could not make a link: ${out.text}`);
      const { links, name } = JSON.parse(out.text);
      console.log(links.join('\n'));
      if (name) console.log(`\nThe device that opens it is ${name} in this lab.`);
      console.log('\nOne use, ten minutes. Over wifi this is plain http: it keeps strangers out, it does not hide the page from someone listening to the network.');
      process.exit(0);
    }

    if (cmd === 'wait') {
      // A wait sits open for as long as it is allowed to; in an agent's foreground that is the person's whole turn,
      // so without --bg it is held to a minute. See waitSeconds in args.ts for why it can't just be detected.
      const { seconds, capped } = waitSeconds(opts, process.stdout.isTTY === true);
      const out = await call('/_lab/wait', { timeout: seconds, pages: listenPages(opts, true), ack: true }, 20);
      console.log(WAIT_SAID[out.status] ?? out.text);
      await labAck(server, out.delivery, session);
      if (capped && out.status === 204)
        console.log(
          `\nThat wait was held to ${FOREGROUND_CAP} seconds. Run it in the background (your app's own way of doing that) and ` +
            'add --bg for the full wait: in the foreground this command holds your turn open, and the person cannot ' +
            'say anything to you until it ends.',
        );
      process.exit(out.status < 300 || out.status === 409 || out.status === 410 || out.status === 423 ? 0 : 1);
    }

    // The agent's own pin on a spot: a suggestion or a question about the page, where a person would have pinned it.
    // The widget finds the element by its selector and draws the pin with labit's mark (it has a session: the agent's).
    if (cmd === 'pin') {
      const selector = (ref || '').trim();
      if (!selector) die(`Say where: ${CMD} pin <selector> "text" [--page /path] [--at x,y], e.g. ${CMD} pin "#pricing h2" "1. …"`);
      if (!words.length) die(`Pin text is missing: ${CMD} pin ${selector} "what you'd change, or your question"`);
      let x = 0.5;
      let y = 0.5;
      if (opts.at !== undefined) {
        const m = /^\s*(\d*\.?\d+)\s*,\s*(\d*\.?\d+)\s*$/.exec(String(opts.at));
        if (!m || Number(m[1]) > 1 || Number(m[2]) > 1) die('--at takes x,y as shares of the element, each 0 to 1: --at 0.5,0.5 is its middle.');
        [x, y] = [Number(m[1]), Number(m[2])];
      }
      const page = await pinPage(opts.page);
      const who = process.env.LAB_AGENT_NAME || session.agent;
      const name = `${who}${session.name !== session.agent ? ` · ${session.name}` : ''}`;
      const out = await call('/_lab/api/comments', { page, name, text: words.join(' '), anchor: { kind: 'element', selector, x, y }, nonce: nonceOf(page, selector, words.join(' ')) });
      if (out.status >= 300) die(`Could not pin: ${out.text}`);
      const { comment } = JSON.parse(out.text);
      console.log(`Pinned ${comment.id} on ${page} at ${selector}.`);
      process.exit(0);
    }
    // Which page a pin goes on: --page as the lab's page key (/pricing), its file (pricing.html) or its address
    // (/pricing.html, http://localhost:4400/pricing.html); with no --page, the lab's only page.
    async function pinPage(asked: unknown): Promise<string> {
      const got = await call('/_lab/pages', {});
      const pages: { path: string; file: string; url: string }[] = got.status < 300 ? JSON.parse(got.text).pages || [] : [];
      const proxied = got.status < 300 && Boolean(JSON.parse(got.text).proxy);
      const list = () => pages.map((p) => p.path).join(', ') || 'none yet';
      if (asked === undefined || asked === true) {
        if (pages.length === 1 && !proxied) return pages[0].path;
        die(`Which page? Add --page /path. This lab's pages: ${list()}.`);
      }
      let want = String(asked).trim();
      try {
        if (/^https?:\/\//.test(want)) want = new URL(want).pathname;
      } catch {}
      try {
        want = decodeURIComponent(want);
      } catch {}
      const bare = want.replace(/^\/+|\/+$/g, '');
      const pathOf = (u: string) => {
        try {
          return decodeURIComponent(new URL(u).pathname).replace(/^\/+|\/+$/g, '');
        } catch {
          return null;
        }
      };
      // A folder's address is its index page; anything else is keyed the way the lab keys it (lib/labs.ts). Behind a
      // dev server any address is a page (the lab lists only those with pins): its key is the answer.
      const key = keyFor((bare.replace(/\.html?$/i, '') || 'index').split('/').join(path.sep));
      if (proxied) return key;
      const asIndex = keyFor(`${bare}/index`.split('/').join(path.sep));
      const hit = pages.find((p) => [want, '/' + bare, key, asIndex].includes(p.path) || (p.file && p.file === bare) || pathOf(p.url) === bare);
      if (hit) return hit.path;
      die(`No page ${want} in this lab. Its pages: ${list()}.`);
    }

    // A comment by its id (of the thread or of a reply in it) or by the number on its card.
    // The store: one file per page in .lab/comments/ (or, from a lab not started since 16 Nov, the one comments.json).
    const data = {};
    const store = path.join(dir, '.lab/comments');
    if (!fs.existsSync(store)) Object.assign(data, JSON.parse(fs.readFileSync(path.join(dir, '.lab/comments.json'), 'utf8')));
    else
      for (const name of fs.readdirSync(store).filter((n) => n.endsWith('.json'))) {
        try {
          const file = JSON.parse(fs.readFileSync(path.join(store, name), 'utf8'));
          if (typeof file.page === 'string' && file.comments) data[file.page] = file.comments;
        } catch {} // a file half written or put aside: the others still count
      }
    const want = opts.page ? '/' + opts.page.replace(/^\/+/, '') : null;
    let hit = null;
    // A reply's id: the answer goes in its thread, and says which message it answers (shown as a quote, as in chat).
    for (const [page, list] of Object.entries(data)) if (list[ref]) hit = { page, id: list[ref].parent || ref, to: list[ref].parent ? ref : '' };
    if (!hit && /^\d+$/.test(ref || '')) {
      const hits = Object.entries(data)
        .filter(([page]) => !want || page === want)
        .map(([page, list]) => {
          const open = Object.values(list).filter((c) => !c.parent && !c.resolved).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
          return open[Number(ref) - 1] && { page, id: open[Number(ref) - 1].id };
        })
        .filter(Boolean);
      if (hits.length > 1) die(`Comment ${ref} is on several pages (${hits.map((h) => h.page).join(', ')}). Add --page <path>.`);
      hit = hits[0];
    }
    if (!hit) die(`No open comment ${ref || ''}${want ? ` on ${want}` : ''}. See .lab/comments.md.`);
    // --progress: the line the page shows while you work, kept on the thread (the latest only), not a message.
    const progress = cmd === 'reply' && opts.progress !== undefined;
    if (progress) {
      if (typeof opts.progress !== 'string' || !opts.progress.trim()) die(`Progress text is missing: ${CMD} reply <id> --progress "what you're on now"`);
      if (words.length || opts.done || opts['on-it'] || opts.question || opts.resolve) die('--progress is only the line, with no answer text, --done, --on-it, --question or --resolve: those are answers, and an answer clears it.');
      const out = await call('/_lab/api/comments', { page: hit.page, action: 'progress', id: hit.id, text: opts.progress });
      if (out.status >= 300) die(`Could not note progress: ${out.text}`);
    } else if (cmd === 'reply') {
      if (!words.length) die(`Reply text is missing: ${CMD} reply <id> "what you did"`);
      let intent = replyIntent(opts);
      if (intent instanceof Error) die(intent.message);
      // A question with choices (--choice "…" --choice "…" [--recommend B]): the person picks one on the page, and the
      // pick comes back in a wait as their reply ("Picked B: …"). It is a question, whatever else it says.
      const choices = replyChoices(opts);
      if (choices instanceof Error) return die(choices.message);
      const asked = choices;
      if (asked && intent && intent !== 'question') die(`A reply with --choice is a question; leave out --${intent === 'working' ? 'on-it' : intent}.`);
      if (asked && opts.resolve) die('A reply with --choice waits for the person to pick; leave out --resolve.');
      if (asked) intent = 'question';
      const who = process.env.LAB_AGENT_NAME || session.agent;
      const name = `${who}${session.name !== session.agent ? ` · ${session.name}` : ''}`;
      const said = Object.values(((data as Record<string, object>)[hit.page] || {}) as Record<string, { id: string; parent?: string; session?: unknown; createdAt: string }>)
        .filter((c) => (c.id === hit.id || c.parent === hit.id) && !c.session)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .pop()?.id;
      const out = await call('/_lab/api/comments', { page: hit.page, parent: hit.id, nonce: nonceOf(hit.page, hit.id, hit.to, said, words.join(' ')), ...(hit.to ? { to: hit.to } : {}), name, text: words.join(' '), ...(typeof opts['suggest-rule'] === 'string' ? { suggest: opts['suggest-rule'] } : {}), ...(intent ? { intent } : {}), ...asked });
      if (out.status >= 300) die(`Could not reply: ${out.text}`);
      if (asked) console.log(`Asked with ${asked.choices.map((c, i) => `${letter(i)}) ${c}`).join('  ')}${asked.recommend !== undefined ? `  (your pick: ${letter(asked.recommend)})` : ''}. The pick comes back in your next wait.`);
    }
    if (cmd === 'resolve' || opts.resolve) {
      const out = await call('/_lab/api/comments', { page: hit.page, action: 'resolve', id: hit.id });
      if (out.status >= 300) die(`Could not resolve: ${out.text}`);
    }
    console.log(`${progress ? 'Progress noted' : cmd === 'reply' ? (opts.resolve ? 'Replied and resolved' : 'Replied') : 'Resolved'} on ${hit.page}.`);
    // --wait: answer and listen again in one command (one round trip less per pin). It listens where --page or
    // --pages says, as wait does: `reply <id> --wait --page /x` used to listen on every page but /x's claim, so a
    // session listening on one page stopped hearing it after its first answer (Leo, 18 Nov).
    if (opts.wait) {
      const { seconds, capped } = waitSeconds(opts, process.stdout.isTTY === true);
      const out = await call('/_lab/wait', { timeout: seconds, pages: listenPages(opts, true), ack: true }, 20);
      console.log(WAIT_SAID[out.status] ?? out.text);
      await labAck(server, out.delivery, session);
      if (capped && out.status === 204)
        console.log(`\nThat wait was held to ${FOREGROUND_CAP} seconds: run the command in the background and add --bg for the full wait.`);
    }
    process.exit(0);
  }
}
