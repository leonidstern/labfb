// Zoom through a running lab, no browser: a zoom pin reaches a waiting agent with its block, its direction and the skill
// to read; `zoom` hands the agent's block to the lab, which places it and writes the trail; a plain reply lands in the trail too.
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
const trail = () => fs.readFileSync(path.join(DIR, 'audit.trail.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));

test('a zoom in: the pin names its block, direction and skill; the lab places the block and writes the trail', async () => {
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
  const two = await run(['zoom', comment.id, 'two.html', 'two']);
  assert.notEqual(two.code, 0);
  assert.match(two.out, /send one element/);
  assert.equal(fs.readFileSync(path.join(DIR, 'audit.html'), 'utf8'), PAGE, 'a refused hand-over leaves the page alone');

  const placed = await run(['zoom', comment.id, 'deep.html', 'where the 158 ms goes']);
  assert.equal(placed.code, 0, placed.out);
  assert.match(placed.out, /Placed #a-deeper in audit\.html, after the part/);
  const html = fs.readFileSync(path.join(DIR, 'audit.html'), 'utf8');
  assert.match(html, /<p id="a">158 ms<\/p><\/section>\n<section id="a-deeper" data-zoom="in" data-zoom-of="a" data-from="t2"><h2>Deeper: 158 ms/);
  assert.deepEqual(trail().map((s) => [s.id, s.kind, s.by, s.on, s.pin]), [['t1', 'pin', 'Leo', 'a', comment.id], ['t2', 'make', 'agent', 'a-deeper', comment.id]]);
  const again = await run(['zoom', comment.id, 'deep.html', 'again']);
  assert.match(again.out, /already on the page/);

  const got = await (await fetch(`${B}/_lab/api/trail?page=/audit`)).json();
  assert.equal(got.steps.length, 2);
  // The agent's reply on a zoom pin is not a third step: the hand-over already wrote what was made. And with its block
  // placed, the reply closes the zoom by itself, even when it doesn't start with "Done".
  await run(['reply', comment.id, 'Deeper look at 158 ms: #a-deeper']);
  assert.equal(trail().length, 2);
  const list = await (await fetch(`${B}/_lab/api/comments?page=/audit`, { headers: { origin: B } })).json();
  assert.equal((list.comments || list).find((c) => c.id === comment.id).resolved, true);
});

test('a plain pin in a block: the answer goes into the trail; a pin that is no zoom can\'t take a zoom block', async () => {
  await up();
  const { comment } = await post({ page: '/audit', name: 'Leo', text: 'shorter please', anchor: { ...spot, selector: '#b', block: 'b' } });
  const no = await run(['zoom', comment.id, 'deep.html', 'x']);
  assert.match(no.out, /not a zoom/);
  await run(['reply', comment.id, 'Done: it is shorter now']);
  const last = trail().slice(-2);
  assert.deepEqual(last.map((s) => [s.kind, s.by, s.on, s.what]), [['pin', 'Leo', 'b', 'shorter please'], ['change', 'agent', 'b', 'it is shorter now']]);
  assert.deepEqual(last[1].from, [last[0].id]);
});

test('only the agent hands a zoom over', async () => {
  await up();
  const res = await fetch(B + '/_lab/api/zoom', { method: 'POST', headers: { 'content-type': 'application/json', origin: B }, body: JSON.stringify({ page: '/audit', id: 'x', html: '', what: '' }) });
  assert.equal(res.status, 403);
});
