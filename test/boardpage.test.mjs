// The board page's route: /_lab/board/<name> is a shell with board.js and the widget under the board's key.
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

test('the board page is a shell: board.js first, then the widget under the board key', async () => {
  await up(base);
  const r = await fetch(`http://localhost:${base}/_lab/board/checkout`);
  const html = await r.text();
  assert.equal(r.status, 200);
  assert.match(html, /<script src="\/_lab\/board\.js" data-name="checkout"><\/script>/);
  assert.match(html, /data-page="\/_board\/checkout"/);
  assert.ok(html.indexOf('/_lab/board.js') < html.indexOf('/_lab/comments.js'), 'the board script comes first: it must exist before the frames load');
  assert.match(html, /maximum-scale=1, user-scalable=no/);
  const js = await fetch(`http://localhost:${base}/_lab/board.js`);
  assert.equal(js.status, 200);
  assert.ok((await js.text()).length > 1000);
});

test('a board page does not count as an opened page', async () => {
  const s = await (await fetch(`http://localhost:${base}/_lab/state`)).json();
  assert.ok(!(s.pages || []).some((p) => /_board/.test(p.path || '')));
});

test('a name that is not a board name is not a board page', async () => {
  const r = await fetch(`http://localhost:${base}/_lab/board/Bad%20Name`);
  assert.notEqual(r.status, 200);
});
