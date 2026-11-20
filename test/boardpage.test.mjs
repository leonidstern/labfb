// The board page's route: /_lab/board/<name> is an empty page that loads the one board (boardview.js, the same file a
// page's board view is) and the widget under the board's key.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const LAB = fileURLToPath(new URL('../local.mjs', import.meta.url));
const mk = (flags) => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'labit-boardpage-')));
  fs.writeFileSync(path.join(dir, 'labit.json'), JSON.stringify({ flags }));
  return dir;
};
const [ON] = [mk({})];
const base = 9900 + Math.floor(Math.random() * 100);
const procs = [ON].map((d, i) => spawn(process.execPath, [LAB, '.', '--no-open', '--port', String(base + i * 100)], { cwd: d, env: process.env }));
after(() => {
  procs.forEach((p) => p.kill());
  for (const d of [ON]) fs.rmSync(d, { recursive: true, force: true });
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

test('the board page is a shell: the one board (boardview.js) first, then the widget under the board key', async () => {
  await up(base);
  const r = await fetch(`http://localhost:${base}/_lab/board/checkout`);
  const html = await r.text();
  assert.equal(r.status, 200);
  assert.match(html, /<script type="module">import\{own\}from"\/_lab\/boardview\.js";own\("checkout"\)<\/script>/);
  assert.match(html, /<title>board checkout<\/title>/);
  assert.match(html, /data-page="\/_board\/checkout"/);
  assert.ok(html.indexOf('/_lab/boardview.js') < html.indexOf('/_lab/comments.js'), 'the board script comes first: it must exist before the frames load');
  assert.match(html, /maximum-scale=1, user-scalable=no/);
  const js = await fetch(`http://localhost:${base}/_lab/boardview.js`);
  assert.equal(js.status, 200);
  const text = await js.text();
  assert.ok(text.length > 1000);
  assert.match(text, /export\{[^}]*\bas own\b[^}]*\}/, 'the file the page imports own() from');
});

test('one board is shipped: no second bundle beside the view', async () => {
  assert.equal((await fetch(`http://localhost:${base}/_lab/board.js`)).status, 404);
  const here = path.dirname(fileURLToPath(import.meta.url));
  assert.ok(!fs.existsSync(path.join(here, '../public/_lab/board.js')));
  assert.ok(!JSON.parse(fs.readFileSync(path.join(here, '../package.json'), 'utf8')).files.includes('public/_lab/board.js'));
});

test('a board page does not count as an opened page', async () => {
  const s = await (await fetch(`http://localhost:${base}/_lab/state`)).json();
  assert.ok(!(s.pages || []).some((p) => /_board/.test(p.path || '')));
});

test('a name that is not a board name is not a board page', async () => {
  const r = await fetch(`http://localhost:${base}/_lab/board/Bad%20Name`);
  assert.notEqual(r.status, 200);
});
