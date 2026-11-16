// Zoom through a running lab, no browser: a zoom pin reaches a waiting agent with its block, its direction and the skill
// to read; `zoom` hands the agent's block to the lab, which places it; the answer closes the zoom.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const LAB = fileURLToPath(new URL('../local.mjs', import.meta.url));
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'labit-zoom-'));
const PORT = String(4900 + Math.floor(Math.random() * 90));
const B = `http://localhost:${PORT}`;
const PAGE = `<!doctype html><title>audit</title>\n<main>\n<section id="speed"><h2>Speed</h2><p id="a">158 ms</p></section>\n<section id="b"><h2>Server</h2></section>\n</main>\n`;
fs.writeFileSync(path.join(DIR, 'audit.html'), PAGE);
fs.writeFileSync(path.join(DIR, 'deep.html'), '<section><h2>Deeper: 158 ms</h2><p>where it goes</p></section>');

const run = (args) => new Promise((resolve) => execFile(process.execPath, [LAB, ...args], { cwd: DIR }, (err, stdout, stderr) => resolve({ code: err?.code ?? 0, out: stdout + stderr })));
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
const post = (body) => fetch(B + '/_lab/api/comments', { method: 'POST', headers: { 'content-type': 'application/json', origin: B }, body: JSON.stringify(body) }).then((r) => r.json());
const spot = { selector: '#a', x: 0.5, y: 0.5, docX: 0.5, docY: 20, width: 1000, element: '<p id="a">' };

test('a zoom in: the pin names its block, direction and skill; the lab places the block; the answer closes it', async () => {
  await up();
  const waiting = run(['wait', '--timeout', '10']);
  await new Promise((r) => setTimeout(r, 400));
  const { comment } = await post({ page: '/audit', name: 'Leo', text: 'zoom in: dive deeper', anchor: { ...spot, block: 'a', zoom: 'in' } });
  const heard = await waiting;
  assert.match(heard.out, /block: a\n/);
  assert.match(heard.out, /zoom: in, dive deeper/);
  assert.match(heard.out, /skills\/labit\/zoom\.md/);
  assert.match(heard.out, /zoom <id> <file>/);

  fs.writeFileSync(path.join(DIR, 'two.html'), '<section><p>1</p></section><section><p>2</p></section>');
  const two = await run(['zoom', comment.id, 'two.html']);
  assert.notEqual(two.code, 0);
  assert.match(two.out, /send one element/);
  assert.equal(fs.readFileSync(path.join(DIR, 'audit.html'), 'utf8'), PAGE, 'a refused hand-over leaves the page alone');

  const placed = await run(['zoom', comment.id, 'deep.html']);
  assert.equal(placed.code, 0, placed.out);
  assert.match(placed.out, /Placed #a-deeper in audit\.html/);
  const html = fs.readFileSync(path.join(DIR, 'audit.html'), 'utf8');
  assert.match(html, /<p id="a">158 ms<\/p><\/section>\n<section id="a-deeper" data-zoom="in" data-zoom-of="a"><h2>Deeper: 158 ms/);
  const again = await run(['zoom', comment.id, 'deep.html']);
  assert.match(again.out, /already on the page/);

  // With its block placed, the reply closes the zoom by itself, even when it doesn't start with "Done".
  await run(['reply', comment.id, 'Deeper look at 158 ms: #a-deeper']);
  const list = await (await fetch(`${B}/_lab/api/comments?page=/audit`, { headers: { origin: B } })).json();
  assert.equal((list.comments || list).find((c) => c.id === comment.id).resolved, true);
});

test('a pin that is no zoom can\'t take a zoom block', async () => {
  await up();
  const { comment } = await post({ page: '/audit', name: 'Leo', text: 'shorter please', anchor: { ...spot, selector: '#b', block: 'b' } });
  const no = await run(['zoom', comment.id, 'deep.html']);
  assert.match(no.out, /not a zoom/);
});

test('only the agent hands a zoom over', async () => {
  await up();
  const res = await fetch(B + '/_lab/api/zoom', { method: 'POST', headers: { 'content-type': 'application/json', origin: B }, body: JSON.stringify({ page: '/audit', id: 'x', html: '', what: '' }) });
  assert.equal(res.status, 403);
});
