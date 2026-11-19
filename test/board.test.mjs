// Boards (flag board): the board file, its API, the page of a variant, the watcher, in a folder lab and behind a dev server.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const LAB = fileURLToPath(new URL('../local.mjs', import.meta.url));
const mk = (flags) => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'labit-board-')));
  fs.writeFileSync(path.join(dir, 'labit.json'), JSON.stringify({ flags }));
  return dir;
};
const DIR = mk({ board: true });
const OFF = mk({});
const PX = mk({ board: true });
const base = 9600 + Math.floor(Math.random() * 100);
const [PORT, POFF, PPX, UP] = [base, base + 100, base + 200, base + 300];
const B = `http://localhost:${PORT}`;
fs.writeFileSync(path.join(DIR, 'pricing.html'), '<!doctype html><html><head><title>Pricing</title><link rel="stylesheet" href="s.css"></head><body><h1>Pricing</h1></body></html>');
fs.mkdirSync(path.join(DIR, 'sub'));
fs.writeFileSync(path.join(DIR, 'sub', 'deep.html'), '<!doctype html><html><head><title>Deep</title></head><body><h1>Deep</h1></body></html>');
fs.writeFileSync(path.join(DIR, 'cart.html'), '<!doctype html><title>Cart</title><h1>Cart</h1>');
const upstream = http.createServer((q, r) => r.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><html><body><h1>dev</h1></body></html>')).listen(UP);
const spawnLab = (dir, port, extra = []) => spawn(process.execPath, [LAB, '.', '--no-open', '--port', String(port), ...extra], { cwd: dir, env: process.env });
const procs = [spawnLab(DIR, PORT), spawnLab(OFF, POFF), spawnLab(PX, PPX, ['--proxy', String(UP)])];
after(() => {
  procs.forEach((p) => p.kill());
  upstream.close();
  for (const d of [DIR, OFF, PX]) fs.rmSync(d, { recursive: true, force: true });
});
const up = async (port) => {
  for (let i = 0; i < 80; i++) {
    try {
      return await fetch(`http://localhost:${port}/_lab/state`);
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error('lab did not start');
};
const put = (base, q, body, headers = {}) => fetch(`${base}/_lab/api/board?${q}`, { method: 'PUT', headers: { 'content-type': 'application/json', origin: base, ...headers }, body: JSON.stringify(body) });
const get = (base, q) => fetch(`${base}/_lab/api/board?${q}`).then(async (r) => ({ status: r.status, body: await r.json() }));
const live = (base) =>
  new Promise((resolve) => {
    const u = new URL(base + '/_lab/live');
    const req = http.get({ host: '127.0.0.1', port: u.port, path: u.pathname, headers: { host: u.host } }, (res) => {
      res.setEncoding('utf8');
      const seen = [];
      res.on('data', (d) => {
        for (const l of d.split('\n')) if (l.startsWith('data: ')) seen.push(JSON.parse(l.slice(6)));
      });
      resolve({ seen, close: () => req.destroy() });
    });
  });
const settle = (ms = 400) => new Promise((r) => setTimeout(r, ms));

test('flag off: no routes, nothing on disk', async () => {
  await up(POFF);
  const o = `http://localhost:${POFF}`;
  assert.equal((await fetch(`${o}/_lab/api/board?name=x`)).status, 404);
  assert.match(await (await fetch(`${o}/_lab/api/board?name=x`)).text(), /"board":true/);
  assert.equal((await fetch(`${o}/_lab/board/x/a`)).status, 404);
  assert.equal(fs.existsSync(path.join(OFF, '.lab/boards')), false);
  assert.equal('boards' in (await (await fetch(`${o}/_lab/state`)).json()), false);
});

test('PUT then GET round-trips; the file is .lab/boards/<name>.json with v 1', async () => {
  await up(PORT);
  const frames = [{ id: 'a', src: '/pricing', w: 1440, h: 900, label: 'Pricing' }, { id: 'b', src: '/pricing', w: 390, h: 844, variantOf: 'a' }];
  const r = await put(B, 'name=checkout', { frames });
  assert.equal(r.status, 200);
  const got = await get(B, 'name=checkout');
  assert.equal(got.body.exists, true);
  assert.deepEqual(got.body.frames.map((f) => f.id), ['a', 'b']);
  const disk = JSON.parse(fs.readFileSync(path.join(DIR, '.lab/boards/checkout.json'), 'utf8'));
  assert.equal(disk.v, 1);
  assert.equal(disk.name, 'checkout');
  assert.equal(disk.frames[1].variantOf, 'a');
  assert.equal('x' in disk.frames[0], false, 'the lab chose the places: none stored');
});

test('frames without x and y are laid out in rows, in array order; their own places stay', async () => {
  const frames = [1, 2, 3, 4].map((n) => ({ id: 'abcd'[n - 1], src: '/pricing', w: 1440, h: 900 }));
  frames.push({ id: 'e', src: '/cart', w: 390, h: 844, x: 7, y: 9 });
  await put(B, 'name=rows', { frames });
  const { body } = await get(B, 'name=rows');
  const at = body.frames.map((f) => [f.x, f.y]);
  assert.deepEqual(at[0], [0, 0]);
  assert.deepEqual(at[1], [1520, 0]);
  assert.deepEqual(at[2], [3040, 0]);
  assert.equal(at[3][0], 0, 'the fourth wraps to a new row');
  assert.ok(at[3][1] > 900);
  assert.deepEqual(at[4], [7, 9]);
  assert.equal(body.frames[0].auto, true);
});

test('refused: bad name, other origin, no same origin, dropped frame, stale rev; a damaged file is put aside', async () => {
  const ok = [{ id: 'a', src: '/pricing', w: 1280, h: 800 }];
  assert.equal((await put(B, 'name=Bad%20Name', { frames: ok })).status, 400);
  assert.equal((await put(B, 'name=x1', { frames: [{ id: 'a', src: 'https://example.com/', w: 1, h: 1 }] })).status, 422);
  assert.equal((await put(B, 'name=x1', { frames: [{ id: 'a', src: '//example.com/', w: 1, h: 1 }] })).status, 422);
  assert.equal((await put(B, 'name=x1', { frames: ok }, { origin: 'http://evil.example' })).status, 403);
  assert.equal((await put(B, 'name=x1', { frames: ok })).status, 200);
  const { body } = await get(B, 'name=x1');
  assert.equal((await put(B, 'name=x1', { rev: body.rev, frames: [] })).status, 422, 'a frame is archived, not removed');
  assert.equal((await put(B, 'name=x1', { rev: body.rev + 5, frames: ok })).status, 409);
  assert.equal((await put(B, 'name=x1', { rev: body.rev, frames: [{ ...ok[0], state: 'archived' }] })).status, 200);
  fs.writeFileSync(path.join(DIR, '.lab/boards/broken.json'), '{nope');
  assert.equal((await get(B, 'name=broken')).status, 404);
  assert.ok(fs.readdirSync(path.join(DIR, '.lab/boards')).some((n) => n.startsWith('broken.json.broken-')));
  assert.equal(fs.existsSync(path.join(DIR, '.lab/boards/broken.json')), false);
});

test('the board of a page: named for the page, saved by the first PUT', async () => {
  const a = await get(B, 'page=/sub/deep');
  assert.equal(a.body.name, 'sub--deep');
  assert.equal(a.body.exists, false);
  assert.equal(a.body.frames[0].src, '/sub/deep');
  assert.equal(fs.existsSync(path.join(DIR, '.lab/boards/sub--deep.json')), false);
  const r = await put(B, 'page=/sub/deep', { rev: 0, frames: [...a.body.frames, { id: 'b', src: '/sub/deep', w: 390, h: 844 }] });
  assert.equal(r.status, 200);
  const disk = JSON.parse(fs.readFileSync(path.join(DIR, '.lab/boards/sub--deep.json'), 'utf8'));
  assert.equal(disk.of, '/sub/deep');
  assert.equal((await get(B, 'page=/sub/deep')).body.exists, true);
});

test('a variant file is served at /_lab/board/<n>/<f> with the widget; .lab is still never served', async () => {
  fs.mkdirSync(path.join(DIR, '.lab/boards/hero'), { recursive: true });
  for (const id of 'abc') fs.writeFileSync(path.join(DIR, `.lab/boards/hero/${id}.html`), `<!doctype html><html><head><title>v</title></head><body><h1>${id}</h1></body></html>`);
  for (const id of 'abc') {
    const res = await fetch(`${B}/_lab/board/hero/${id}`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, new RegExp(`<h1>${id}</h1>`));
    assert.match(html, new RegExp(`data-page="/_board/hero/${id}"`));
    assert.equal(html.match(/_lab\/comments\.js/g).length, 1);
  }
  assert.equal((await fetch(`${B}/.lab/boards/hero/a.html`)).status, 404);
  assert.equal((await fetch(`${B}/_lab/board/hero/z`)).status, 404);
  assert.notEqual((await fetch(`${B}/_lab/board/..%2f/a`)).status, 200);
  assert.equal((await fetch(`${B}/_lab/board/hero`)).status, 404, 'the board page itself is another change');
});

test('the lab watches .lab/boards: a board file bumps boards, a saved variant is a hot update of its frame alone, a page save is neither', async () => {
  const s = await live(B);
  await settle(300);
  const n0 = s.seen.at(-1);
  fs.appendFileSync(path.join(DIR, '.lab/boards/hero/b.html'), '<!-- x -->');
  await settle(600);
  const h = s.seen.at(-1);
  assert.equal(h.hot, (n0.hot || 0) + 1);
  assert.deepEqual(h.hotFiles, [{ path: '/_lab/board/hero/b', kind: 'html' }]);
  assert.equal(h.files, n0.files, 'no page reloads');
  const f = JSON.parse(fs.readFileSync(path.join(DIR, '.lab/boards/checkout.json'), 'utf8'));
  fs.writeFileSync(path.join(DIR, '.lab/boards/checkout.json'), JSON.stringify({ ...f, title: 'edited' }));
  await settle(600);
  const b = s.seen.at(-1);
  assert.equal(b.boards, h.boards + 1);
  assert.ok(b.boardNames.includes('checkout'));
  fs.appendFileSync(path.join(DIR, 'cart.html'), '\n<!-- save -->');
  await settle(600);
  assert.equal(s.seen.at(-1).boards, b.boards, 'a page save is not a board change');
  s.close();
});

test('pages list: boards are listed, scratch frames and board keys are not pages', async () => {
  await put(B, 'name=hero', { frames: 'abc'.split('').map((id) => ({ id, src: `/_lab/board/hero/${id}`, w: 1280, h: 800 })) });
  const info = await (await fetch(`${B}/_lab/pages`)).json();
  assert.ok(info.boards.some((b) => b.name === 'hero' && b.frames === 3));
  assert.equal(info.pages.some((p) => /board|\.lab/.test(p.file + p.path)), false);
});

test('behind a dev server the board works the same', async () => {
  await up(PPX);
  const P = `http://localhost:${PPX}`;
  assert.equal((await put(P, 'page=/pricing', { frames: [{ id: 'a', src: '/pricing', w: 390, h: 844 }] })).status, 200);
  assert.equal((await get(P, 'page=/pricing')).body.name, 'pricing');
  assert.equal((await put(P, 'name=widths', { frames: [{ id: 'a', src: '/pricing', w: 390, h: 844 }] })).status, 200);
  // the watcher works here too (the project watcher is off behind a dev server)
  const s = await live(P);
  await settle(300);
  const n = s.seen.at(-1).boards;
  fs.appendFileSync(path.join(PX, '.lab/boards/widths.json'), '\n');
  await settle(600);
  assert.equal(s.seen.at(-1).boards, n + 1);
  s.close();
});

test('a page loaded into a frame is not opened by anybody', async () => {
  const opened = async () => (await (await fetch(`${B}/_lab/pages`)).json()).pages.find((p) => p.path === '/cart').opened;
  await fetch(`${B}/cart`, { headers: { 'sec-fetch-dest': 'iframe' } });
  assert.equal(await opened(), null);
  await fetch(`${B}/cart`, { headers: { 'sec-fetch-dest': 'document' } });
  assert.ok(await opened());
});

// ---------- the commands (labit board …) ----------
import { execFile } from 'node:child_process';
const cli = (dir, ...args) =>
  new Promise((resolve) => execFile(process.execPath, [LAB, 'board', ...args], { cwd: dir, env: process.env }, (err, stdout, stderr) => resolve({ code: err ? err.code : 0, out: stdout + stderr })));

test('board new --variants copies the page, prints the link, and each file is the page plus a base', async () => {
  const r = await cli(DIR, 'new', 'Pricing hero', '--of', '/pricing', '--variants', '3');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^# Board pricing-hero · Pricing hero\nurl: http:\/\/localhost:\d+\/_lab\/board\/pricing-hero\n/);
  assert.match(r.out, /\na {2}a\.html {2}1280×800\n/);
  for (const id of 'abc') {
    const file = fs.readFileSync(path.join(DIR, `.lab/boards/pricing-hero/${id}.html`), 'utf8');
    assert.match(file, /<head><base href="\/"><title>Pricing<\/title>/);
    assert.match(await (await fetch(`${B}/_lab/board/pricing-hero/${id}`)).text(), /<h1>Pricing<\/h1>/);
  }
  const nested = await cli(DIR, 'new', 'Deep', '--of', '/sub/deep', '--variants', '1');
  assert.equal(nested.code, 0, nested.out);
  assert.match(fs.readFileSync(path.join(DIR, '.lab/boards/deep/a.html'), 'utf8'), /<base href="\/sub\/">/);
  const same = await cli(DIR, 'new', 'Pricing hero', '--of', '/pricing', '--variants', '2');
  assert.match(same.out, /# Board pricing-hero-2/, 'a second board of the same topic never overwrites the first');
});

test('variants: default is the caller\'s, 7 is refused, a missing page or a non-page is said plainly', async () => {
  assert.notEqual((await cli(DIR, 'new', 'Many', '--of', '/pricing', '--variants', '7')).code, 0);
  assert.match((await cli(DIR, 'new', 'Nope', '--of', '/missing', '--variants', '2')).out, /not a plain HTML page/);
  assert.match((await cli(DIR, 'new', 'Bad', '--of', 'https://example.com/', '--variants', '2')).out, /page of this lab/);
});

test('widths copy no file and run narrow to wide; flow keeps its order; add puts a step after another', async () => {
  const w = await cli(DIR, 'new', 'Pricing widths', '--of', '/pricing', '--widths', '1280,390,820');
  assert.equal(w.code, 0, w.out);
  assert.deepEqual(w.out.split('\n').filter((l) => /^[abc] /.test(l)).map((l) => l.split(/ {2}/)[2]), ['390×844', '820×1180', '1280×800']);
  assert.equal(fs.existsSync(path.join(DIR, '.lab/boards/pricing-widths')), false);
  const f = await cli(DIR, 'new', 'Checkout flow', '--flow', '/pricing,/cart,/sub/deep');
  assert.match(f.out, /"1 Pricing"/);
  assert.match(f.out, /"3 Deep"/);
  const added = await cli(DIR, 'add', 'checkout-flow', '/cart', '--after', 'a', '--label', 'again');
  assert.match(added.out, /Added d \(\/cart\) after a\./);
  const list = await cli(DIR, 'list', 'checkout-flow');
  assert.deepEqual(list.out.split('\n').filter((l) => /^[a-d] /.test(l)).map((l) => l[0]), ['a', 'd', 'b', 'c']);
  assert.match((await cli(DIR, 'move', 'checkout-flow', 'c', '--first')).out, /c is now first\./);
  assert.match((await cli(DIR, 'move', 'checkout-flow', 'a', '--after', 'a')).out, /after itself/);
  assert.match((await cli(DIR, 'add', 'checkout-flow', 'b', '--label', 'second', '--width', '390')).out, /Changed b\./);
  const disk = JSON.parse(fs.readFileSync(path.join(DIR, '.lab/boards/checkout-flow.json'), 'utf8'));
  assert.deepEqual(disk.frames.map((x) => x.id), ['c', 'a', 'd', 'b']);
  assert.equal(disk.frames.find((x) => x.id === 'b').h, 844);
});

test('add copies a file in as a new variant; list with no name lists boards; the page of a board of a page via board new --of', async () => {
  fs.writeFileSync(path.join(DIR, 'mine.html'), '<!doctype html><title>mine</title><h1>mine</h1>');
  const r = await cli(DIR, 'add', 'pricing-hero', 'mine.html', '--label', 'my take');
  assert.match(r.out, /Added d \(d\.html\)\./);
  assert.match(await (await fetch(`${B}/_lab/board/pricing-hero/d`)).text(), /<h1>mine<\/h1>/);
  const all = await cli(DIR, 'list');
  assert.match(all.out, /^pricing-hero {2}4 frames {2}of \/pricing {2}http/m);
  const one = await cli(DIR, 'new', '--of', '/sub/deep');
  assert.match(one.out, /# Board sub--deep/);
  assert.match((await cli(DIR, 'list', 'nope')).out, /No board nope/);
});

test('flag off: the command says how to turn boards on', async () => {
  await up(POFF);
  const r = await cli(OFF, 'new', 'x', '--of', '/pricing');
  assert.notEqual(r.code, 0);
  assert.match(r.out, /Boards are off/);
});
