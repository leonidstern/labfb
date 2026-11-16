// The commands that answer and exit: preview, add / remove, list, pages (the labs on this computer) and the agent's
// wait, reply, resolve, invite. Loaded by local.mjs only for these, so starting a lab never reads it.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { listenPages, type Opts } from './args.ts';
import { mySession } from './agents.ts';
import { runningLabs, type Lab } from './labs.ts';

export type Ctx = { pos: string[]; opts: Opts; HERE: string; CMD: string; ME: string; die: (msg: string) => never };

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
  // Cloud lab pages saved with `labit add`, kept with the project in .lab/links.json.
  const LINKS = path.join(HERE, '.lab', 'links.json');
  const savedLinks = () => {
    try {
      return JSON.parse(fs.readFileSync(LINKS, 'utf8'));
    } catch {
      return [];
    }
  };
  // A cloud page's open comments, from its plain-text agent view (`open: N`).
  const cloudOpen = async (url) => {
    try {
      const u = new URL(url);
      const text = await (await fetch(`${u.origin}/_lab/agent${u.pathname}`, { signal: AbortSignal.timeout(3000) })).text();
      return Number(text.match(/^open: (\d+)/m)?.[1] || 0);
    } catch {
      return 0;
    }
  };

  if (pos[0] === 'add' || pos[0] === 'remove') {
    const raw = pos[1] || die(`Give the page's address: ${CMD} ${pos[0]} https://<lab domain>/<page>`);
    let url;
    try {
      url = new URL(raw);
    } catch {}
    if (!url || !/^https?:$/.test(url.protocol)) die(`Not a page address: ${raw}`);
    const key = url.origin + url.pathname.replace(/\/$/, '');
    let list = savedLinks().filter((l) => l.url !== key);
    let title = opts.name || '';
    if (pos[0] === 'add') {
      if (!title) {
        try {
          const html = await (await fetch(key, { signal: AbortSignal.timeout(5000) })).text();
          title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1].trim() || '';
        } catch {}
      }
      list.push({ url: key, title });
    }
    fs.mkdirSync(path.dirname(LINKS), { recursive: true });
    fs.writeFileSync(LINKS, JSON.stringify(list, null, 2) + '\n');
    console.log(pos[0] === 'add' ? `Saved ${key}${title ? ` (${title})` : ''}. It shows in \`${CMD} pages\` and \`${CMD} list\`.` : `Removed ${key}.`);
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
        const open = info.pages.reduce((n, p) => n + p.open, 0);
        pages = ` · ${info.pages.length} page${info.pages.length === 1 ? '' : 's'}${open ? `, ${open} open comment${open === 1 ? '' : 's'}` : ''}${info.listening ? ` · ${info.listening} listening` : ''}`;
      } catch {}
      console.log(`${lab.name}  http://localhost:${lab.port}  ${lab.root}${lab.proxy ? ` (on ${lab.proxy})` : ''}${pages}`);
    }
    const links = savedLinks();
    if (links.length) console.log(`\nCloud pages saved for ${HERE}:\n${links.map((l) => `${l.title || l.url}  ${l.url}`).join('\n')}`);
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
    // Groups: each local lab, then saved cloud pages by domain. Names only when there's more than one group.
    const groups = labs.map((lab) => ({ name: lab.name, pages: lab.pages }));
    const byHost = new Map();
    for (const link of savedLinks()) {
      const host = new URL(link.url).host;
      byHost.set(host, [...(byHost.get(host) || []), { url: link.url, title: link.title, path: new URL(link.url).pathname, open: await cloudOpen(link.url) }]);
    }
    for (const [host, pages] of byHost) groups.push({ name: host, pages });
    const lines = [];
    for (const group of groups) {
      if (groups.length > 1) lines.push(`**${group.name}**`, '');
      for (const p of group.pages) {
        const name = (p.title || p.file || p.path).replace(/[[\]]/g, '');
        lines.push(`- [${name}](${p.url})${p.open ? ` · ${p.open} open` : ''}`);
      }
      lines.push('');
    }
    const out = path.join(HERE, '.lab', 'lab-pages.md');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, (lines.join('\n').trim() || (opts.all ? 'No labs running, and no saved cloud pages.' : 'No labs for this folder, and no saved cloud pages. `pages --all` lists every lab on this computer.')) + '\n');
    console.log(out);
    process.exit(0);
  }

  // ---------- Claude's side: wait, reply, resolve ----------
  if (['wait', 'reply', 'resolve', 'invite', 'zoom'].includes(pos[0])) {
    const [cmd, ref, ...words] = pos;
    let dir = path.resolve(opts.dir || '.');
    while (!fs.existsSync(path.join(dir, '.lab/server.json'))) {
      if (path.dirname(dir) === dir) die(`No lab server for this folder. Start one: run ${CMD} in the project.`);
      dir = path.dirname(dir);
    }
    const server = JSON.parse(fs.readFileSync(path.join(dir, '.lab/server.json'), 'utf8'));
    const session = mySession(opts.name, opts.model);
    // node:http, not fetch: a wait can last longer than fetch's 5-minute header timeout.
    const call = (pathname: string, body: object) =>
      new Promise<{ status: number; text: string }>((resolve) => {
        const data = JSON.stringify(body);
        const req = http.request(
          { host: '127.0.0.1', port: server.port, path: pathname, method: 'POST',
            headers: { host: `localhost:${server.port}`, 'content-type': 'application/json', 'content-length': Buffer.byteLength(data),
              'x-lab-admin': server.token, 'x-lab-agent': '1', 'x-lab-session': encodeURIComponent(JSON.stringify(session)) } },
          (res) => {
            let text = '';
            res.on('data', (c) => (text += c));
            res.on('end', () => resolve({ status: res.statusCode || 0, text }));
          },
        );
        req.on('error', () =>
          die(
            process.env.CODEX_SANDBOX_NETWORK_DISABLED
              ? `Codex's sandbox blocks this command from reaching the lab on this computer (port ${server.port}). Use labit's MCP server instead: ` +
                  `codex mcp add labit -- npx @leonidstern/labit@latest mcp. Or let the sandbox reach it: -c sandbox_workspace_write.network_access=true`
              : `The lab server for ${dir} isn't running. Start it: ${CMD} ${dir === process.cwd() ? '' : dir}`.trim() + '.',
          ),
        );
        req.end(data);
      });

    // A link for a phone on the same wifi: one use, ten minutes. Claude hands it over in chat; the lab must be --wifi.
    if (cmd === 'invite') {
      const out = await call('/_lab/invite', {});
      if (out.status === 404) die('This lab is open to this computer only. Start it with --wifi to let a phone in.');
      if (out.status >= 300) die(`Could not make a link: ${out.text}`);
      const { links } = JSON.parse(out.text);
      console.log(links.join('\n'));
      console.log('\nOne use, ten minutes. Over wifi this is plain http: it keeps strangers out, it does not hide the page from someone listening to the network.');
      process.exit(0);
    }

    if (cmd === 'wait') {
      const out = await call('/_lab/wait', { timeout: Number(opts.timeout) || 1500, pages: listenPages(opts, true) });
      if (out.status === 204) console.log('No new comments yet. Run wait again to keep listening.');
      else if (out.status === 409) console.log('Another session is listening now; this one stopped.');
      else if (out.status === 410) console.log('The page was closed, so this stopped listening. Wait again only when the person asks or opens the page.');
      else console.log(out.text);
      process.exit(out.status < 300 || out.status === 409 || out.status === 410 ? 0 : 1);
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
    for (const [page, list] of Object.entries(data)) if (list[ref]) hit = { page, id: list[ref].parent || ref };
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
    // A zoom: the block the agent wrote, a bigger picture or a deeper look, handed to the lab, which places it (lib/zoom.ts).
    if (cmd === 'zoom') {
      const [file] = words;
      if (!file) die(`Give the file with the block: ${CMD} zoom <id> <file>`);
      if (!fs.existsSync(file)) die(`No file ${file}.`);
      const out = await call('/_lab/api/zoom', { page: hit.page, id: hit.id, html: fs.readFileSync(file, 'utf8') });
      if (out.status >= 300) {
        let why = out.text;
        try {
          why = JSON.parse(out.text).error || why;
        } catch {}
        die(`Not placed: ${why || out.status}. Fix it and run it again.`);
      }
      const r = JSON.parse(out.text);
      console.log(`Placed #${r.id} in ${r.file}. Now answer on the pin in one line, naming #${r.id} (it links to it): ${CMD} reply ${hit.id} "… #${r.id}"`);
      process.exit(0);
    }
    if (cmd === 'reply') {
      if (!words.length) die(`Reply text is missing: ${CMD} reply <id> "what you did"`);
      const who = process.env.LAB_AGENT_NAME || session.agent;
      const name = `${who}${session.name !== session.agent ? ` · ${session.name}` : ''}`;
      const out = await call('/_lab/api/comments', { page: hit.page, parent: hit.id, name, text: words.join(' ') });
      if (out.status >= 300) die(`Could not reply: ${out.text}`);
    }
    if (cmd === 'resolve' || opts.resolve) {
      const out = await call('/_lab/api/comments', { page: hit.page, action: 'resolve', id: hit.id });
      if (out.status >= 300) die(`Could not resolve: ${out.text}`);
    }
    console.log(`${cmd === 'reply' ? (opts.resolve ? 'Replied and resolved' : 'Replied') : 'Resolved'} on ${hit.page}.`);
    // --wait: answer and listen again in one command (one round trip less per pin).
    if (opts.wait) {
      const out = await call('/_lab/wait', { timeout: Number(opts.timeout) || 1500, pages: listenPages(opts) });
      console.log(out.status === 204 ? 'No new comments yet. Run wait again to keep listening.' : out.status === 409 ? 'Another session is listening now; this one stopped.' : out.status === 410 ? 'The page was closed, so this stopped listening.' : out.text);
    }
    process.exit(0);
  }
}
