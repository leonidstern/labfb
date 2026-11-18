// What open pages are told when files change and comments land (no browser): CSS, pictures, fonts and HTML saves are
// "hot" (updated in place), anything else is a reload; comment changes come as deltas; a restart is a new lab id.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const LAB = fileURLToPath(new URL('../local.mjs', import.meta.url));
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'labit-hot-'));
const PORT = String(4900 + Math.floor(Math.random() * 90));
const B = `http://localhost:${PORT}`;
fs.writeFileSync(path.join(DIR, 'index.html'), '<!doctype html><title>t</title><link rel="stylesheet" href="s.css"><h1 id="t">Hello</h1>');
fs.writeFileSync(path.join(DIR, 's.css'), 'h1{color:red}');
fs.writeFileSync(path.join(DIR, 'app.js'), 'console.log(1)');
fs.writeFileSync(path.join(DIR, 'pic.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>');

let server = null;
const start = () => (server = spawn(process.execPath, [LAB, '.', '--no-open', '--new', '--port', PORT], { cwd: DIR, env: { ...process.env, PORT } }));
start();
after(() => {
  server?.kill();
  fs.rmSync(DIR, { recursive: true, force: true });
});

const up = async () => {
  for (let i = 0; i < 80; i++) {
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

// The live stream as a page sees it: every state message, parsed.
async function listen() {
  const res = await fetch(B + '/_lab/live?tab=test');
  const reader = res.body.getReader();
  const states = [];
  let buf = '';
  (async () => {
    for (;;) {
      const { value, done } = await reader.read().catch(() => ({ done: true }));
      if (done) return;
      buf += new TextDecoder().decode(value);
      for (let i; (i = buf.indexOf('\n\n')) >= 0; ) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (line.startsWith('data: ')) states.push(JSON.parse(line.slice(6)));
      }
    }
  })();
  const next = async (pred, ms = 3000) => {
    const t0 = Date.now();
    for (;;) {
      const hit = states.find(pred);
      if (hit) return hit;
      if (Date.now() - t0 > ms) return null;
      await new Promise((r) => setTimeout(r, 50));
    }
  };
  return { states, next, stop: () => reader.cancel().catch(() => {}) };
}
const save = (file, text) => fs.writeFileSync(path.join(DIR, file), text);

test('pages are served with the lab id and the widget revision', async () => {
  const html = await (await up()).text();
  assert.match(html, /data-lab="[0-9a-f]{8}"/);
  assert.match(html, /data-widget="[0-9a-f]{10}"/);
});

test('a CSS save is hot (swapped in place), not a reload', async () => {
  await up();
  const live = await listen();
  const first = await live.next(() => true);
  save('s.css', 'h1{color:blue}');
  const hot = await live.next((s) => s.hot > (first.hot || 0));
  live.stop();
  assert.ok(hot, 'a hot update came');
  assert.equal(hot.files, first.files, 'no reload');
  assert.deepEqual(hot.hotFiles, [{ path: '/s.css', kind: 'css' }]);
});

test('an HTML save and a picture save are hot too', async () => {
  const live = await listen();
  const first = await live.next(() => true);
  save('index.html', '<!doctype html><title>t</title><link rel="stylesheet" href="s.css"><h1 id="t">Hello again</h1>');
  const html = await live.next((s) => s.hot > (first.hot || 0));
  assert.deepEqual(html?.hotFiles, [{ path: '/index.html', kind: 'html' }]);
  save('pic.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="5" height="5"/>');
  const img = await live.next((s) => s.hot > html.hot);
  live.stop();
  assert.deepEqual(img?.hotFiles, [{ path: '/pic.svg', kind: 'img' }]);
  assert.equal(img.files, first.files, 'still no reload');
});

test('a script save is a reload', async () => {
  const live = await listen();
  const first = await live.next(() => true);
  save('app.js', 'console.log(2)');
  const reload = await live.next((s) => s.files > first.files);
  live.stop();
  assert.ok(reload, 'files version went up');
  assert.ok(reload.changed?.includes('/app.js'), 'the page is told which file it was');
});

// The page decides: it reloads only if it uses one of these. A README or another page's script leaves it alone.
test('a reload says which files changed', async () => {
  const live = await listen();
  const first = await live.next(() => true);
  save('notes.md', '# notes');
  const reload = await live.next((s) => s.files > first.files);
  live.stop();
  assert.deepEqual(reload?.changed, ['/notes.md']);
});

test('comment changes reach pages as deltas: a new comment, a reply, a delete', async () => {
  const live = await listen();
  const first = await live.next(() => true);
  const { comment } = await post({ page: '/index', name: 'Leo', text: 'bigger title', anchor: { selector: '#t', x: 0.1, y: 0.5, docX: 0.1, docY: 20, width: 1000, element: '<h1 id="t">' } });
  const after1 = await live.next((s) => s.comments > first.comments);
  const d1 = await (await fetch(`${B}/_lab/api/changes?page=/index&since=${first.comments}`)).json();
  assert.ok(d1.set.some((c) => c.id === comment.id), 'the new comment is in the delta');
  await post({ page: '/index', name: 'Claude', text: 'Done: bigger', parent: comment.id });
  const after2 = await live.next((s) => s.comments > after1.comments);
  const d2 = await (await fetch(`${B}/_lab/api/changes?page=/index&since=${after1.comments}`)).json();
  assert.ok(d2.set.some((c) => c.parent === comment.id), 'the reply is in the delta');
  assert.ok(!d2.set.some((c) => c.id === comment.id && c.text !== 'bigger title'), 'only what changed');
  const key = (await (await fetch(B + '/')).text()).match(/data-admin="([^"]+)"/)?.[1];
  await fetch(B + '/_lab/api/comments', { method: 'POST', headers: { 'content-type': 'application/json', origin: B, 'x-lab-admin': key }, body: JSON.stringify({ page: '/index', action: 'delete', id: comment.id }) });
  await live.next((s) => s.comments > after2.comments);
  const d3 = await (await fetch(`${B}/_lab/api/changes?page=/index&since=${after2.comments}`)).json();
  live.stop();
  assert.ok(d3.del.includes(comment.id), 'the delete is in the delta');
});

test('a delta from too long ago, or from the future, asks for the whole list', async () => {
  const far = await (await fetch(`${B}/_lab/api/changes?page=/index&since=999999`)).json();
  assert.equal(far.full, true);
});

test('a restart is a new lab id (pages catch up in place), the widget revision stays', async () => {
  const before = (await (await fetch(B + '/')).text()).match(/data-lab="([^"]+)" data-widget="([^"]+)"/);
  server.kill();
  await new Promise((r) => setTimeout(r, 500));
  start();
  const html = await (await up()).text();
  const now = html.match(/data-lab="([^"]+)" data-widget="([^"]+)"/);
  assert.notEqual(now[1], before[1], 'new lab id');
  assert.equal(now[2], before[2], 'same widget');
});
