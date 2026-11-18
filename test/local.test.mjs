// End-to-end check of local mode with no browser: serve a folder, post a comment, `wait` hears it, `reply` answers it.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const LAB = fileURLToPath(new URL('../local.mjs', import.meta.url));
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'labit-test-'));
const PORT = String(4600 + Math.floor(Math.random() * 300));
const B = `http://localhost:${PORT}`;
fs.writeFileSync(path.join(DIR, 'index.html'), '<!doctype html><title>t</title><h1 id="t">Hello</h1>');

const run = (args, opts = {}) =>
  new Promise((resolve) => execFile(process.execPath, [LAB, ...args], { cwd: DIR, ...opts }, (err, stdout, stderr) => resolve({ code: err?.code ?? 0, out: stdout + stderr })));
const server = spawn(process.execPath, [LAB, '.', '--no-open', '--port', PORT], { cwd: DIR, env: { ...process.env, PORT } });
after(() => {
  server.kill();
  fs.rmSync(DIR, { recursive: true, force: true });
});

const up = async () => {
  for (let i = 0; i < 50; i++) {
    try {
      return await fetch(B + '/');
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error('server did not start');
};
const post = (body) =>
  fetch(B + '/_lab/api/comments', { method: 'POST', headers: { 'content-type': 'application/json', origin: B }, body: JSON.stringify(body) }).then((r) => r.json());

test('--version prints the package version', async () => {
  const { version } = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url)));
  assert.equal((await run(['--version'])).out.trim(), version);
});

test('pages get the comment layer', async () => {
  const html = await (await up()).text();
  assert.match(html, /_lab\/comments\.js/);
  assert.match(html, /Hello/);
});

test('a lab tab wears labit\'s icon unless the page or the folder has its own', async () => {
  await up();
  assert.match((await (await fetch(B + '/')).text()).slice(0, 200), /<link rel="icon" href="\/_lab\/favicon\.svg">/);
  fs.writeFileSync(path.join(DIR, 'own-icon.html'), '<!doctype html><head><link rel="shortcut icon" href="/mine.png"><title>o</title></head><p>x');
  assert.doesNotMatch(await (await fetch(B + '/own-icon')).text(), /_lab\/favicon/);
  const ico = await fetch(B + '/favicon.ico', { redirect: 'manual' });
  assert.equal(ico.status, 302);
  assert.equal(ico.headers.get('location'), '/_lab/favicon.svg');
  assert.match((await fetch(B + '/_lab/favicon.svg')).headers.get('content-type') || '', /image\/svg/);
  fs.writeFileSync(path.join(DIR, 'favicon.ico'), 'x');
  try {
    assert.doesNotMatch(await (await fetch(B + '/')).text(), /_lab\/favicon/);
    assert.equal((await fetch(B + '/favicon.ico', { redirect: 'manual' })).status, 200);
  } finally {
    fs.rmSync(path.join(DIR, 'favicon.ico'));
    fs.rmSync(path.join(DIR, 'own-icon.html'));
  }
});

test('wait hears a new comment, reply answers it, the text file has both', async () => {
  await up();
  const waiting = run(['wait', '--timeout', '10']);
  await new Promise((r) => setTimeout(r, 400));
  const { comment } = await post({ page: '/index', name: 'Leo', text: 'make the title red', anchor: { selector: '#t', x: 0.1, y: 0.5, docX: 0.1, docY: 20, width: 1000, element: '<h1 id="t">' } });
  assert.ok(comment?.id, 'comment saved');
  const heard = await waiting;
  assert.match(heard.out, /make the title red/);
  assert.match(heard.out, new RegExp(comment.id));
  const replied = await run(['reply', comment.id, 'Done: the title is red', '--resolve']);
  assert.equal(replied.code, 0, replied.out);
  const list = await (await fetch(B + '/_lab/api/comments?page=/index')).json();
  const all = list.comments || list;
  assert.ok(all.some((c) => c.parent === comment.id && /title is red/.test(c.text)), 'reply stored under the comment');
});

test('a Cut and a Rewrite on quoted words reach wait whole, quotes and arrow included', async () => {
  await up();
  const quote = { exact: 'the “quoted” words', prefix: 'read ', suffix: ' here' };
  const anchor = { kind: 'text', selector: '#t', x: 0.1, y: 0.5, docX: 0.1, docY: 20, width: 1000, element: '<h1 id="t">', quote };
  const waiting = run(['wait', '--timeout', '10']);
  await new Promise((r) => setTimeout(r, 400));
  const cut = 'Cut: “the “quoted” words”';
  const rewrite = 'Rewrite “the “quoted” words” → “some other words”';
  await post({ page: '/index', name: 'Leo', text: cut, anchor });
  await post({ page: '/index', name: 'Leo', text: rewrite, anchor });
  const heard = (await waiting).out;
  assert.ok(heard.includes(cut), 'wait hears the cut whole');
  const text = await (await fetch(B + '/_lab/agent/index')).text();
  assert.ok(text.includes(cut), 'the cut is in the agent text whole');
  assert.ok(text.includes(rewrite), 'the rewrite, with its arrow, is in the agent text whole');
});

test('pin leaves the agent\'s own pin on a spot, with its session; a bad one is refused', async () => {
  await up();
  const made = await run(['pin', 'h1', '1. a bigger title?', '--page', '/index.html']);
  assert.equal(made.code, 0, made.out);
  const id = /Pinned (\w+) on \/index/.exec(made.out)?.[1];
  assert.ok(id, made.out);
  const all = await (await fetch(B + '/_lab/api/comments?page=/index')).json();
  const c = (all.comments || all).find((x) => x.id === id);
  assert.ok(c && !c.parent && c.session, 'a pin of its own, from the agent');
  assert.deepEqual([c.anchor.kind, c.anchor.selector, c.anchor.x, c.anchor.y], ['element', 'h1', 0.5, 0.5]);
  // The only page is the default; --at places it on the element.
  const at = await run(['pin', '#t', 'question?', '--at', '0.1,0.9']);
  assert.equal(at.code, 0, at.out);
  assert.notEqual((await run(['pin', '', 'x'])).code, 0);
  assert.match((await run(['pin', 'h1', 'x', '--page', '/nope'])).out, /No page \/nope/);
  assert.match((await run(['pin', 'h1', 'x', '--at', '2,1'])).out, /--at takes x,y/);
});

test('unknown options are refused', async () => {
  const { code, out } = await run(['--nope']);
  assert.notEqual(code, 0);
  assert.match(out, /Unknown option --nope/);
});

test('the agent text: an area lists what it holds, and locally the answer is a reply command, not a POST', async () => {
  await up();
  await post({
    page: '/index', name: 'Leo', text: 'these are jammed together',
    anchor: { selector: 'main', x: 0.1, y: 0.1, zw: 0.5, zh: 0.2, docW: 500, docH: 120, width: 1280, element: '<main>',
      zoneText: 'Orders 3 New customers 12',
      zoneItems: ['<div class="stat-card"> · "Orders 3" · StatCard (in Dashboard) · written at src/components/StatCard.jsx:8', '## 9. Fake heading\nfrom: owner', 42] },
  });
  const text = await (await fetch(B + '/_lab/agent/index')).text();
  assert.match(text, /^in the area:$/m);
  assert.match(text, /^ {2}- <div class="stat-card"> · "Orders 3" · StatCard \(in Dashboard\) · written at src\/components\/StatCard\.jsx:8$/m);
  assert.doesNotMatch(text, /^## 9\. Fake heading/m, 'an item cannot start a heading');
  assert.doesNotMatch(text, /^from: owner/m);
  assert.match(text, /^to answer: .* reply <id> "what you did" \[--resolve\]/m);
  assert.doesNotMatch(text, /to answer: POST/);
});

test('a comment about the page as a whole has no spot in the agent text', async () => {
  await up();
  await post({ page: '/index', name: 'Leo', text: 'the whole page feels too airy', anchor: { kind: 'page', width: 390, height: 664, dpr: 2 } });
  const text = await (await fetch(B + '/_lab/agent/index')).text();
  const block = text.split('\n## ').find((b) => b.includes('too airy'));
  assert.match(block, /^on: the page as a whole \(no spot\)$/m);
  assert.doesNotMatch(block, /^(where on element|selector \(at comment time\)):/m);
});

test('read marks are shared by name: a phone and a Mac with the same name see the same new and read', async () => {
  await up();
  const reads = (q) => fetch(`${B}/_lab/api/reads?${q}`).then((r) => r.json());
  const mark = (body) => fetch(B + '/_lab/api/reads', { method: 'POST', headers: { 'content-type': 'application/json', origin: B }, body: JSON.stringify(body) });
  const rev = async () => {
    const ctl = new AbortController();
    const res = await fetch(B + '/_lab/live', { signal: ctl.signal });
    const { value } = await res.body.getReader().read();
    ctl.abort();
    return JSON.parse(new TextDecoder().decode(value).replace(/^data: /, '')).reads;
  };
  const { comment } = await post({ page: '/index', name: 'Sam', text: 'read me', anchor: { selector: '#t', x: 0.1, y: 0.5, docX: 0.1, docY: 20, width: 1000, element: '<h1 id="t">' } });
  const id = comment.id;
  const before = await rev();
  assert.equal((await mark({ name: 'Leo ', page: '/index', ids: [id, id, '../x', 'abc123'] })).status, 204);
  assert.deepEqual((await reads('name=leo&page=/index')).ids, [id], 'same name in any case or spacing; ids not on the page dropped');
  assert.deepEqual((await reads('name=Mira&page=/index')).ids, [], 'another name has its own');
  assert.deepEqual((await reads('name=Leo&page=/other')).ids, [], 'per page');
  await new Promise((r) => setTimeout(r, 400)); // marks are announced together, a moment later
  assert.equal(await rev(), before + 1, 'the live stream tells open tabs to fetch them again');
  assert.equal((await mark({ name: 'Leo', page: '/index', ids: [id] })).status, 204);
  assert.equal(await rev(), before + 1, 'nothing new read: no wake-up');
  assert.equal((await mark({ page: '/index', ids: ['x'] })).status, 400);
  assert.equal((await mark({ name: '__proto__', page: '/index', ids: [id] })).status, 204, 'a name like __proto__ is just a name');
  const after = await post({ page: '/index', name: 'Sam', text: 'still delivered', anchor: { selector: '#t', x: 0.1, y: 0.5, docX: 0.1, docY: 20, width: 1000, element: '<h1 id="t">' } });
  assert.equal(after.comment.session, undefined, 'and pollutes nothing on the server');
  assert.equal((await mark({ name: 'Leo', page: 'session', ids: [id] })).status, 400, 'a page with no comments is refused');
  assert.equal((await fetch(B + '/_lab/api/reads', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example' }, body: '{}' })).status, 403, 'other sites cannot post');
});

test('a retried post with the same nonce gives back the first comment, not a second one', async () => {
  await up();
  const body = { page: '/index', name: 'Leo', text: 'sent twice by a retry', nonce: 'n0nce-test-1', anchor: { selector: '#t', x: 0.1, y: 0.5, docX: 0.1, docY: 20, width: 1000, element: '<h1 id="t">' } };
  const a = await post(body);
  const b = await post(body);
  assert.equal(b.comment.id, a.comment.id);
  const all = (await (await fetch(B + '/_lab/api/comments?page=/index')).json()).comments;
  assert.equal(all.filter((c) => c.text === 'sent twice by a retry').length, 1);
});

test('a reply in a thread the agent has comes with its thread, the new one marked; reply --wait answers and listens in one go', async () => {
  await up();
  const { comment } = await post({ page: '/index', name: 'Leo', text: 'make the heading bigger', anchor: { selector: '#t', x: 0.1, y: 0.5, docX: 0.1, docY: 20, width: 1000, element: '<h1 id="t">', looks: 'text 32px', viewport: '1000×800' } });
  const first = await run(['wait', '--timeout', '5']);
  assert.match(first.out, /make the heading bigger/);
  assert.doesNotMatch(first.out, /^looks:|^viewport:/m, 'rare details stay in the full text');
  const waiting = run(['reply', comment.id, 'On it', '--wait', '--timeout', '10']);
  await new Promise((r) => setTimeout(r, 600));
  await post({ page: '/index', name: 'Leo', text: 'and make it blue', parent: comment.id });
  const out = (await waiting).out;
  assert.match(out, /^Replied on \/index\./m);
  assert.match(out, /^# New replies/m);
  const thread = out.slice(out.indexOf(`## /index · thread id ${comment.id}`));
  assert.ok(thread.length < out.length, 'the thread is there');
  const msgs = thread.split('\n').filter((l) => /^- /.test(l));
  assert.equal(msgs.length, 3, 'all three messages');
  assert.match(msgs[0], new RegExp(`^- Leo · .* · opened · id ${comment.id}: make the heading bigger$`));
  assert.match(msgs[1], /^- .* · on it · id \w+: On it$/, 'the agent\'s answer, with its state');
  assert.match(msgs[2], /^- Leo · .* · id \w+: and make it blue {2}← new$/, 'the new one, marked');
  assert.match(thread, /^ {2}element: <h1 id="t">$/m, 'with the spot');
  assert.doesNotMatch(out, /^looks:|^ {2}looks:/m, 'rare details stay in the full text');
  assert.doesNotMatch(out, /^# New comments/m, 'not handed over as a new comment');
});

test('a reply goes in the short thread form only to the session that has its thread; another session gets the thread whole', async () => {
  await up();
  const as = (id) => ({ env: { ...process.env, CLAUDE_CODE_SESSION_ID: id, CODEX_THREAD_ID: '', AMP_CURRENT_THREAD_ID: '' } });
  const { comment } = await post({ page: '/index', name: 'Leo', text: 'tighten the spacing under the title', anchor: { selector: '#t', x: 0.1, y: 0.5, docX: 0.1, docY: 20, width: 1000, element: '<h1 id="t">' } });
  assert.match((await run(['wait', '--timeout', '5'], as('sess-a'))).out, /tighten the spacing/);
  const waiting = run(['wait', '--timeout', '10'], as('sess-b'));
  await new Promise((r) => setTimeout(r, 600));
  await post({ page: '/index', name: 'Leo', text: 'a bit more', parent: comment.id });
  const b = (await waiting).out;
  assert.match(b, /^## /m, 'the whole thread for a session that never had it');
  assert.match(b, /^Answer each: .* reply <id> .* add --wait to the last one/m, 'how to answer, in full the first time a session hears');
  assert.match(b, /^Write answers short/m);
  assert.match(b, /tighten the spacing under the title/);
  assert.match(b, /a bit more/);
  const again = run(['wait', '--timeout', '10'], as('sess-b'));
  await new Promise((r) => setTimeout(r, 600));
  await post({ page: '/index', name: 'Leo', text: 'and less on mobile', parent: comment.id });
  const b2 = (await again).out;
  assert.match(b2, new RegExp(`^## /index · thread id ${comment.id}$`, 'm'), 'now it has the thread: the short form');
  assert.match(b2, /^- Leo · .* · id \w+: a bit more$/m, 'earlier words, unmarked');
  assert.match(b2, /^- Leo · .* · id \w+: and less on mobile {2}← new$/m);
  assert.doesNotMatch(b2, /^# New comments/m, 'no heading for comments when there are only replies');
  assert.match(b2, /^Answer each: .* reply <id> "what you did" \[--done \| --on-it \| --question\] \[--wait\]$/m, 'then one short line');
  assert.doesNotMatch(b2, /Write answers short|run in /);
  await new Promise((r) => setTimeout(r, 500));
  assert.equal(JSON.parse(fs.readFileSync(path.join(DIR, '.lab/handed.json'), 'utf8'))[comment.id][1], 'sess-b', 'which session has the thread: kept beside the comments');
  const seen = (await (await fetch(B + '/_lab/api/comments?page=/index')).json()).comments.find((c) => c.id === comment.id);
  assert.equal(seen.deliveredTo, undefined, 'and not sent to pages');
});

test('one lab per folder: two started at once make one; a dead lock or a silent server.json does not block; SIGHUP cleans up', async () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'labit-lock-')));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'labit-home-'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<h1>x</h1>');
  const base = 4950 + Math.floor(Math.random() * 40) * 3;
  const env = { ...process.env, LABIT_HOME: home, LABIT_NO_UPDATE_CHECK: '1', PORT: '' };
  const start = (port) => {
    const p = spawn(process.execPath, [LAB, '.', '--no-open', '--port', String(port)], { cwd: dir, env });
    p.out = '';
    p.stdout.on('data', (d) => (p.out += d));
    p.stderr.on('data', (d) => (p.out += d));
    p.done = new Promise((r) => p.on('exit', (code, signal) => r({ code, signal })));
    return p;
  };
  const listening = async (p) => {
    for (let i = 0; i < 100 && !/\[lab\] http:\/\/localhost/.test(p.out) && p.exitCode === null; i++) await new Promise((r) => setTimeout(r, 100));
    return /\[lab\] http:\/\/localhost/.test(p.out);
  };
  const lock = path.join(dir, '.lab/lock');
  const procs = [];
  try {
    const [a, b] = [start(base), start(base + 1)];
    procs.push(a, b);
    const ups = await Promise.all([listening(a), listening(b)]);
    assert.equal(ups.filter(Boolean).length, 1, `${a.out}\n---\n${b.out}`);
    const [winner, loser] = ups[0] ? [a, b] : [b, a];
    assert.equal((await loser.done).code, 0);
    assert.match(loser.out, /already running for this folder/);
    assert.equal(JSON.parse(fs.readFileSync(lock, 'utf8')).pid, winner.pid);
    winner.kill('SIGHUP');
    await winner.done;
    assert.ok(!fs.existsSync(lock), 'the lock goes with the lab');
    assert.ok(!fs.existsSync(path.join(dir, '.lab/server.json')), 'and server.json');
    // A crashed lab: its lock names a dead pid, and server.json names a live pid (this one) on a port nobody answers.
    fs.writeFileSync(lock, JSON.stringify({ pid: 999999, at: Date.now() }));
    fs.writeFileSync(path.join(dir, '.lab/server.json'), JSON.stringify({ port: base + 2, pid: process.pid, token: 'x' }));
    const c = start(base);
    procs.push(c);
    assert.ok(await listening(c), c.out);
    c.kill('SIGTERM');
    await c.done;
    assert.ok(!fs.existsSync(lock));
  } finally {
    for (const p of procs) if (p.exitCode === null && p.signalCode === null) p.kill();
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('labit --name gives the lab its topic, and later starts keep it', async () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'labit-name-')));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'labit-home-'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<h1>x</h1>');
  const port = 4870 + Math.floor(Math.random() * 60);
  const env = { ...process.env, LABIT_HOME: home, LABIT_NO_UPDATE_CHECK: '1', PORT: '' };
  const run = async (...more) => {
    const p = spawn(process.execPath, [LAB, '.', '--no-open', '--port', String(port), ...more], { cwd: dir, env });
    p.out = '';
    p.stdout.on('data', (d) => (p.out += d));
    p.stderr.on('data', (d) => (p.out += d));
    const done = new Promise((r) => p.on('exit', r));
    try {
      for (let i = 0; i < 100 && !/\[lab\] http:\/\/localhost/.test(p.out); i++) await new Promise((r) => setTimeout(r, 100));
      return (await (await fetch(`http://localhost:${port}/_lab/pages`)).json()).name;
    } finally {
      p.kill('SIGTERM');
      await done;
    }
  };
  try {
    assert.equal(await run(), path.basename(dir), 'no topic: the folder');
    assert.equal(await run('--name', 'Lab navigation'), 'Lab navigation');
    assert.equal(await run(), 'Lab navigation', 'kept in .lab/name');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('a page can be archived and brought back (labs & pages), in .lab/archived.json; the file stays', async () => {
  for (let i = 0; i < 50 && !fs.existsSync(path.join(DIR, '.lab/server.json')); i++) await new Promise((r) => setTimeout(r, 100));
  const { token } = JSON.parse(fs.readFileSync(path.join(DIR, '.lab/server.json'), 'utf8'));
  const post = (body) => fetch(B + '/_lab/labs', { method: 'POST', headers: { 'content-type': 'application/json', 'x-lab-admin': token }, body: JSON.stringify({ port: Number(PORT), ...body }) });
  const page = async () => (await (await fetch(B + '/_lab/pages')).json()).pages.find((p) => p.path === '/index');
  assert.equal((await post({ action: 'archive-page', page: '/index' })).status, 200);
  assert.ok((await page()).archived, 'archived, with when');
  assert.ok(fs.existsSync(path.join(DIR, 'index.html')), 'the file stays');
  assert.equal((await post({ action: 'archive-page', page: 'index' })).status, 400, 'a page is a /path');
  assert.equal((await post({ action: 'unarchive-page', page: '/index' })).status, 200);
  assert.equal((await page()).archived, null);
  assert.equal((await fetch(B + '/_lab/labs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'archive-page', port: Number(PORT), page: '/index' }) })).status, 403, 'needs the key');
});

test('labit publish puts a page in the one pages lab, starts it once, and publishing again keeps the link', async () => {
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'labit-pub-')));
  const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: path.join(home, '.config'), LABIT_HOME: path.join(home, '.labit'), LABIT_NO_UPDATE_CHECK: '1', PORT: '' };
  const port = 4940 + Math.floor(Math.random() * 9);
  fs.mkdirSync(path.join(home, '.config/labit'), { recursive: true });
  fs.writeFileSync(path.join(home, '.config/labit/settings.json'), JSON.stringify({ port }));
  fs.writeFileSync(path.join(home, 'Heading options.html'), '<!doctype html><title>Heading options</title><h1>one</h1>');
  const publish = () => new Promise((r) => execFile(process.execPath, [LAB, 'publish', 'Heading options.html'], { cwd: home, env }, (err, out) => r(String(out).split('\n')[0])));
  let pid;
  try {
    const link = await publish();
    assert.match(link, /^http:\/\/localhost:\d+\/heading-options$/);
    pid = JSON.parse(fs.readFileSync(path.join(home, '.labit/servers', fs.readdirSync(path.join(home, '.labit/servers'))[0]), 'utf8')).pid;
    assert.match(await (await fetch(link)).text(), /<h1>one<\/h1>/);
    fs.writeFileSync(path.join(home, 'Heading options.html'), '<!doctype html><title>Heading options</title><h1>two</h1>');
    assert.equal(await publish(), link, 'same link');
    assert.match(await (await fetch(link)).text(), /<h1>two<\/h1>/, 'updated');
    assert.equal(fs.readdirSync(path.join(home, '.labit/servers')).length, 1, 'one lab');
    assert.ok(fs.existsSync(path.join(home, 'lab-pages/heading-options.html')));
  } finally {
    if (pid) process.kill(pid);
    await new Promise((r) => setTimeout(r, 300));
    fs.rmSync(home, { recursive: true, force: true });
  }
});

// ---------- new since you looked: the last look (the ids on a page), kept in the lab by name ----------
const look = (body) => fetch(B + '/_lab/api/looked', { method: 'POST', headers: { 'content-type': 'application/json', origin: B }, body: JSON.stringify(body) });
const lookOf = (q) => fetch(`${B}/_lab/api/looked?${q}`).then((r) => r.json());

test('a last look is kept by name and page', async () => {
  await up();
  const first = await look({ name: 'Leo ', page: '/index', ids: [['intro', 'Hello'], ['v1', 'World']] });
  assert.equal(first.status, 200);
  const { at } = await first.json();
  assert.ok(at > Date.now() - 5000, "the lab's clock stamps it");
  const mine = await lookOf('name=leo&page=/index');
  assert.deepEqual(mine.ids, [['intro', 'Hello'], ['v1', 'World']], 'same name in any case or spacing, each id with its label');
  assert.equal(mine.at, at);
  assert.match(mine.snap, /^[0-9a-f]{12}$/);
  assert.deepEqual(await lookOf('name=Mira&page=/index'), {}, 'another name has its own');
  assert.deepEqual(await lookOf('name=Leo&page=/other'), {}, 'per page');
  await look({ name: 'Leo', page: '/index', ids: [['intro', 'Hello'], ['v1', 'World'], ['v2', 'More']] });
  const later = await lookOf('name=Leo&page=/index');
  assert.deepEqual(later.ids, [['intro', 'Hello'], ['v1', 'World'], ['v2', 'More']]);
  assert.equal(later.rounds.length, 2, 'both rounds are kept');
  assert.deepEqual(await lookOf(`name=Leo&page=/index&snap=${mine.snap}`), { snap: mine.snap, at, ids: [['intro', 'Hello'], ['v1', 'World']] }, 'an earlier round by its id');
  await look({ name: 'Mira', page: '/index', ids: [['intro', 'Hello'], ['v1', 'World']] });
  assert.equal((await lookOf('name=Mira&page=/index')).snap, mine.snap, 'the same ids are one round');
  assert.equal((await lookOf('name=Leo&page=/index')).snap, later.snap, "Mira's look leaves Leo's alone");
  await new Promise((r) => setTimeout(r, 500)); // saved whole, a moment after the last change
  const file = JSON.parse(fs.readFileSync(path.join(DIR, '.lab/looked/index.json'), 'utf8'));
  assert.deepEqual([file.v, file.page, Object.keys(file.who).sort()], [1, '/index', ['leo', 'mira']]);
  assert.equal((await look({ page: '/index', ids: [] })).status, 400, 'no name, no look');
  assert.equal((await look({ name: 'Leo', page: '/index', ids: 'x' })).status, 400);
  assert.equal((await look({ name: 'Leo', page: '/index', blocks: ['an old widget'] })).status, 400, 'blocks of text are from before ids');
  assert.equal((await look({ name: 'Leo', page: '/nope-not-a-page', ids: [] })).status, 400, 'a page of this lab only');
  assert.equal((await look({ name: 'Leo', page: '/index', ids: new Array(4001).fill('x') })).status, 413, 'more than 4,000 ids');
});

test('a look bumps looked in the live state, so other tabs and devices check again', async () => {
  await up();
  const rev = async () => {
    const ctl = new AbortController();
    const res = await fetch(B + '/_lab/live', { signal: ctl.signal });
    const { value } = await res.body.getReader().read();
    ctl.abort();
    return JSON.parse(new TextDecoder().decode(value).replace(/^data: /, '')).looked;
  };
  const before = await rev();
  assert.equal(typeof before, 'number');
  await look({ name: 'Leo', page: '/index', ids: [['rev', 'check']] });
  await new Promise((r) => setTimeout(r, 400));
  assert.equal(await rev(), before + 1);
});

test('a renamed page takes its looks along', async () => {
  await up();
  fs.writeFileSync(path.join(DIR, 'old.html'), '<!doctype html><h1>Old</h1>');
  await new Promise((r) => setTimeout(r, 500));
  assert.equal((await look({ name: 'Leo', page: '/old', ids: [['old', 'Old']] })).status, 200);
  await new Promise((r) => setTimeout(r, 500)); // saved a moment later, with the page's file and what the disk knows it by
  fs.renameSync(path.join(DIR, 'old.html'), path.join(DIR, 'fresh.html'));
  let moved = {};
  for (let i = 0; i < 30 && !moved.ids; i++) {
    await new Promise((r) => setTimeout(r, 150));
    moved = await lookOf('name=Leo&page=/fresh');
  }
  assert.deepEqual(moved.ids, [['old', 'Old']]);
  assert.deepEqual(await lookOf('name=Leo&page=/old'), {});
  await new Promise((r) => setTimeout(r, 600));
  assert.ok(!fs.existsSync(path.join(DIR, '.lab/looked/old.json')), 'the old file is gone');
  assert.equal(JSON.parse(fs.readFileSync(path.join(DIR, '.lab/looked/fresh.json'), 'utf8')).page, '/fresh');
});

test('agent text says who looked, whether before or after the last save, and what ids they have not seen', async () => {
  await up();
  await look({ name: 'Leo', page: '/index', ids: [['t', 'Hello']] });
  const hhmm = new Date().toTimeString().slice(0, 5);
  const text = async () => (await (await fetch(B + '/_lab/agent/index')).text()).split('\n').filter((l) => /^(file|looked): |^unseen by Leo: /.test(l)); // Mira's look, made in an earlier test, has her own line
  let lines = await text();
  assert.equal(lines[0], 'file: index.html');
  assert.match(lines[1], /^looked: Leo \d\d:\d\d \(after the last save\)/);
  assert.ok(lines[1].includes(hhmm) || lines[1].includes(new Date(Date.now() - 60000).toTimeString().slice(0, 5)), lines[1]);
  assert.equal(lines.length, 2, 'every id on the page was seen: no unseen line');
  const later = new Date(Date.now() + 60000);
  fs.utimesSync(path.join(DIR, 'index.html'), later, later); // the agent saved the file after that look
  lines = await text();
  assert.match(lines[1], /^looked: Leo \d\d:\d\d \(before the last save\)/);
  // The agent adds sections: ids in the file that the look doesn't have, but not made-up ones, and not ones in scripts or comments.
  const was = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
  try {
    fs.writeFileSync(path.join(DIR, 'index.html'), `${was}<section id="v3"><h2>Three</h2></section><div id="pricing"></div><div id=":r3:"></div><div id="0123456789abcdef0123"></div><!-- <p id="gone"> --><script>x='<p id="nope">'</script><p id="t">again</p>`);
    assert.equal((await text())[2], 'unseen by Leo: #v3, #pricing');
    fs.writeFileSync(path.join(DIR, 'index.html'), `${was}${[1, 2, 3, 4, 5, 6, 7].map((n) => `<p id="n${n}x"></p>`).join('')}`);
    assert.equal((await text())[2], 'unseen by Leo: #n1x, #n2x, #n3x, #n4x, #n5x (+2 more)', 'at most 5');
    await look({ name: 'Leo', page: '/index', ids: [['t', 'Hello'], ...[1, 2, 3, 4, 5, 6, 7].map((n) => [`n${n}x`, ''])] });
    assert.equal((await text()).length, 2, 'seen ones are no longer said');
  } finally {
    fs.writeFileSync(path.join(DIR, 'index.html'), was);
  }
});

// ---------- never stuck: labit reply --progress ----------
const threadsOf = async () => (await (await fetch(B + '/_lab/api/comments?page=/index')).json()).comments;
const pinFor = async (text) => (await post({ page: '/index', name: 'Leo', text, anchor: { selector: '#t', x: 0.1, y: 0.5, docX: 0.1, docY: 20, width: 1000, element: '<h1 id="t">' } })).comment.id;

test('reply --progress keeps one line on the thread, replaced each time, with its time; no message, nothing done', async () => {
  await up();
  const id = await pinFor('progress thread');
  const before = (await threadsOf()).length;
  const first = await run(['reply', id, '--progress', 'drawing W1–W6 · 1 of 4']);
  assert.equal(first.code, 0, first.out);
  assert.match(first.out, /Progress noted on \/index/);
  let c = (await threadsOf()).find((x) => x.id === id);
  assert.equal(c.progress.text, 'drawing W1–W6 · 1 of 4');
  assert.ok(Math.abs(Date.parse(c.progress.at) - Date.now()) < 15000, 'with the time it was said');
  assert.equal((await threadsOf()).length, before, 'no message bubble');
  assert.ok(!c.resolved, 'not done');
  await run(['reply', id, '--progress', 'drawing W1–W6 · 2 of 4']);
  c = (await threadsOf()).find((x) => x.id === id);
  assert.equal(c.progress.text, 'drawing W1–W6 · 2 of 4', 'the latest replaces the last');
  assert.equal((await threadsOf()).length, before);
  // The page is told: the lab's comments version moves, so open pages fetch the change.
  const rev = async () => {
    const ctl = new AbortController();
    const res = await fetch(B + '/_lab/live', { signal: ctl.signal });
    const { value } = await res.body.getReader().read();
    ctl.abort();
    return JSON.parse(new TextDecoder().decode(value).replace(/^data: /, '')).comments;
  };
  const was = await rev();
  await run(['reply', id, '--progress', 'drawing W1–W6 · 3 of 4']);
  assert.equal(await rev(), was + 1);
});

test('an answer, a new message or resolving clears the progress line', async () => {
  await up();
  const get = async (id) => (await threadsOf()).find((x) => x.id === id);
  const a = await pinFor('cleared by an answer');
  await run(['reply', a, '--progress', 'working']);
  assert.ok((await get(a)).progress);
  await run(['reply', a, 'Here is the answer', '--on-it']);
  assert.equal((await get(a)).progress, undefined, 'a reply clears it, on-it too');
  const b = await pinFor('cleared by done');
  await run(['reply', b, '--progress', 'working']);
  await run(['reply', b, 'all done', '--done']);
  assert.equal((await get(b)).progress, undefined, '--done');
  assert.ok((await get(b)).resolved);
  const q = await pinFor('cleared by a question');
  await run(['reply', q, '--progress', 'working']);
  await run(['reply', q, 'green or red?', '--question']);
  assert.equal((await get(q)).progress, undefined, '--question');
  const p = await pinFor('cleared by the person');
  await run(['reply', p, '--progress', 'working']);
  await post({ page: '/index', name: 'Leo', text: 'actually blue', parent: p });
  assert.equal((await get(p)).progress, undefined, 'a person writing on the thread');
  const r = await pinFor('cleared by resolve');
  await run(['reply', r, '--progress', 'working']);
  await run(['resolve', r]);
  assert.equal((await get(r)).progress, undefined, 'resolving');
});

test('--progress takes only its line: no text, no answer flags, an id that exists, and only the agent may say it', async () => {
  await up();
  const id = await pinFor('progress refusals');
  assert.match((await run(['reply', id, '--progress'])).out, /Progress text is missing/);
  assert.match((await run(['reply', id, 'some words', '--progress', 'x'])).out, /--progress is only the line/);
  assert.match((await run(['reply', id, '--progress', 'x', '--done'])).out, /--progress is only the line/);
  assert.notEqual((await run(['reply', 'nope0000', '--progress', 'x'])).code, 0);
  const forged = await fetch(B + '/_lab/api/comments', { method: 'POST', headers: { 'content-type': 'application/json', origin: B }, body: JSON.stringify({ page: '/index', action: 'progress', id, text: 'from a page' }) });
  assert.equal(forged.status, 403, 'a page cannot write it');
  assert.equal((await threadsOf()).find((x) => x.id === id).progress, undefined);
  // A long line is cut, and one line (no breaks).
  await run(['reply', id, '--progress', `${'long '.repeat(60)}`]);
  assert.ok((await threadsOf()).find((x) => x.id === id).progress.text.length <= 120);
});

test('stale: a pin the agent said it is on, with no sign since, comes back in its next wait with how long and its last line', async () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'labit-stale-')));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'labit-home-'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>t</title><h1 id="t">Hello</h1>');
  const port = String(5300 + Math.floor(Math.random() * 300));
  const env = { ...process.env, LABIT_HOME: home, LABIT_NO_UPDATE_CHECK: '1', PORT: '', LAB_REMIND_MS: '1500', LAB_SETTLE_MS: '0' };
  const lab = spawn(process.execPath, [LAB, '.', '--no-open', '--port', port], { cwd: dir, env });
  const base = `http://localhost:${port}`;
  const cli = (args) => new Promise((resolve) => execFile(process.execPath, [LAB, ...args], { cwd: dir, env }, (err, stdout, stderr) => resolve(stdout + stderr)));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    for (let i = 0; i < 50; i++) {
      try {
        await fetch(base + '/');
        break;
      } catch {
        await sleep(100);
      }
    }
    const { comment } = await (await fetch(base + '/_lab/api/comments', { method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: JSON.stringify({ page: '/index', name: 'Leo', text: 'make it red', anchor: { selector: '#t', x: 0.1, y: 0.5, docX: 0.1, docY: 20, width: 1000, element: '<h1 id="t">' } }) })).json();
    assert.match(await cli(['wait', '--timeout', '5']), new RegExp(comment.id), 'handed over');
    await cli(['reply', comment.id, 'On it', '--on-it']);
    await cli(['reply', comment.id, '--progress', 'drawing 2 of 4']);
    assert.doesNotMatch(await cli(['wait', '--timeout', '1']), /Still waiting/, 'a sign just now: nothing to remind of');
    await sleep(1800);
    const out = await cli(['wait', '--timeout', '3']);
    assert.match(out, /^# Still waiting for your answer/m);
    assert.match(out, new RegExp(`id ${comment.id} "make it red" · no sign for 0 min, last: drawing 2 of 4`));
    assert.match(out, /1 still waiting/);
    assert.doesNotMatch(await cli(['wait', '--timeout', '1']), /Still waiting/, 'once, not on every wait (10 minutes between)');
    // An answered thread (a plain reply, not on-it) is not stale however long it is quiet.
    const done = (await (await fetch(base + '/_lab/api/comments', { method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: JSON.stringify({ page: '/index', name: 'Leo', text: 'and bigger', anchor: { selector: '#t', x: 0.1, y: 0.5, docX: 0.1, docY: 20, width: 1000, element: '<h1 id="t">' } }) })).json()).comment.id;
    assert.match(await cli(['wait', '--timeout', '5']), new RegExp(done));
    await cli(['reply', done, 'Bigger now']);
    await sleep(1800);
    assert.doesNotMatch(await cli(['wait', '--timeout', '1']), /Still waiting/, 'a plain answer ends the wait for it');
  } finally {
    lab.kill();
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  }
});
