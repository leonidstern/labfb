// Editing words in place (flag editText): the lab finds the words in exactly one place of the project, writes them,
// and undoes. Nothing is written when it is not sure. Tests the lab over HTTP, in the style of hot.test.mjs.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const LAB = fileURLToPath(new URL('../local.mjs', import.meta.url));
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'labit-edit-home-'));
const DIR = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'labit-edit-')));
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'labit-edit-out-'));
const PORT = String(5200 + Math.floor(Math.random() * 90));
const B = `http://localhost:${PORT}`;
const put = (f, t) => (fs.mkdirSync(path.dirname(path.join(DIR, f)), { recursive: true }), fs.writeFileSync(path.join(DIR, f), t));
const get = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');
fs.writeFileSync(path.join(DIR, 'labit.json'), JSON.stringify({ flags: { editText: true } }));
put('index.html', '<!doctype html><title>t</title>\n<h1>Ship faster</h1>\n<p>Ship   faster   with us</p>\n<p>Tom &amp; Ann\'s shop</p>\n<p>Unique line here</p>\n<p>Same twice</p><p>Same twice</p>\n<p>Only on index <b>x</b></p>\n');
put('src/App.tsx', "export const A = () => <p>Tom & Ann's shop is open</p>;\n");
put('a.html', '<p>Shared words</p>');
put('b.html', '<p>Shared words</p>');
put('page.html', '<p>Before <i>Kept</i> after</p><p>Kept</p>');
fs.writeFileSync(path.join(OUT, 'secret.html'), '<p>Outside words</p>');
fs.symlinkSync(path.join(OUT, 'secret.html'), path.join(DIR, 'link.html'));
put('.lab-hidden/x.html', '<p>Hidden words</p>');

const server = spawn(process.execPath, [LAB, '.', '--no-open', '--new', '--port', PORT], { cwd: DIR, env: { ...process.env, PORT, LABIT_HOME: HOME, XDG_CONFIG_HOME: HOME } });
after(() => {
  server.kill();
  for (const d of [HOME, DIR, OUT]) fs.rmSync(d, { recursive: true, force: true });
});
const up = async () => {
  for (let i = 0; i < 100; i++) {
    try {
      return await fetch(B + '/');
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error('server did not start');
};
const html = await up().then((r) => r.text());
const KEY = /data-admin="([0-9a-f]+)"/.exec(html)?.[1];
const call = (body, key = KEY) => fetch(B + '/_lab/api/edit', { method: 'POST', headers: { 'content-type': 'application/json', origin: B, ...(key ? { 'x-lab-admin': key } : {}) }, body: JSON.stringify({ page: '/index', ...body }) });
const edit = (body) => call(body).then((r) => r.json());

test('the page holds the admin key on this computer', () => assert.ok(KEY));

test('words in one place are replaced once, the rest of the file is untouched, the answer names file and line', async () => {
  const before = get('index.html');
  const r = await edit({ was: 'Unique line here', now: 'Unique line there' });
  assert.equal(r.ok, true);
  assert.equal(r.edit.file, 'index.html');
  assert.equal(r.edit.line, 5);
  assert.equal(get('index.html'), before.replace('Unique line here', 'Unique line there'));
});

test('undo puts the same bytes back; undo twice, or after the words changed, says so and writes nothing', async () => {
  const before = get('index.html');
  const r = await edit({ was: 'Unique line there', now: 'Unique line again' });
  assert.equal((await edit({ undo: r.edit.id })).ok, true);
  assert.equal(get('index.html'), before);
  assert.equal((await edit({ undo: r.edit.id })).ok, false);
  const s = await edit({ was: 'Unique line there', now: 'Third' });
  fs.writeFileSync(path.join(DIR, 'index.html'), get('index.html').replace('Third', 'Fourth'));
  const u = await edit({ undo: s.edit.id });
  assert.deepEqual([u.ok, u.why], [false, 'the words changed since']);
  assert.match(get('index.html'), /Fourth/);
  fs.writeFileSync(path.join(DIR, 'index.html'), get('index.html').replace('Fourth', 'Unique line there'));
});

test('odd spacing in the file still matches, and undo restores the file own bytes', async () => {
  const before = get('index.html');
  const r = await edit({ was: 'Ship faster with us', now: 'Ship calmer with us' });
  assert.equal(r.ok, true);
  assert.equal(r.edit.was, 'Ship   faster   with us');
  assert.equal((await edit({ undo: r.edit.id })).ok, true);
  assert.equal(get('index.html'), before);
});

test('the same words twice are refused, naming the places; the file is unchanged', async () => {
  const before = get('index.html');
  const r = await edit({ was: 'Same twice', now: 'Different' });
  assert.equal(r.ok, false);
  assert.match(r.why, /^more than one place: index\.html \(2 places\)/);
  assert.equal(get('index.html'), before);
});

test('the same words twice, with a prefix that fits one, go to that one', async () => {
  put('twice.html', '<p>Alpha one</p>\n<p>Beta one</p>\n');
  const r = await edit({ was: 'one', now: 'two', prefix: 'Beta', suffix: '' });
  assert.equal(r.ok, true);
  assert.equal(get('twice.html'), '<p>Alpha one</p>\n<p>Beta two</p>\n');
});

test('&amp; and an apostrophe match "Tom & Ann\'s shop" in html; the new words are escaped', async () => {
  const r = await edit({ was: "Tom & Ann's shop", now: 'Tom & Ann & co', file: 'index.html' });
  assert.equal(r.ok, true);
  assert.match(get('index.html'), /<p>Tom &amp; Ann &amp; co<\/p>/);
});

test('in a tsx file the match is found and braces are escaped', async () => {
  const r = await edit({ was: "Tom & Ann's shop is open", now: 'Open {now}', file: 'src/App.tsx' });
  assert.equal(r.ok, true);
  assert.equal(r.edit.file, 'src/App.tsx');
  assert.match(get('src/App.tsx'), /Open \{'\{'\}now\{'\}'\}/);
});

test('words in two files with no hint are refused and both files are named; a hint that fits one writes it', async () => {
  const r = await edit({ was: 'Shared words', now: 'Mine' });
  assert.equal(r.ok, false);
  assert.match(r.why, /a\.html/);
  assert.match(r.why, /b\.html/);
  assert.equal(get('a.html'), '<p>Shared words</p>');
  assert.equal((await edit({ was: 'Shared words', now: 'Mine', file: 'b.html' })).ok, true);
  assert.equal(get('b.html'), '<p>Mine</p>');
});

test('one hit in the first file that has it does not hide a second file: the project is searched whole', async () => {
  put('one.html', '<p>Dup words</p>');
  put('two.html', '<p>Dup words</p>');
  const r = await edit({ was: 'Dup words', now: 'X' });
  assert.equal(r.ok, false);
  assert.match(r.why, /one\.html/);
  assert.equal(get('one.html'), '<p>Dup words</p>');
});

test('outside paths, dot folders, symlinks out: nothing is written', async () => {
  for (const file of ['../x', '.lab/server.json', '.lab-hidden/x.html', 'link.html', '/etc/passwd']) {
    const r = await edit({ was: 'Outside words', now: 'Changed', file });
    assert.equal(r.ok, false, file);
  }
  assert.equal(fs.readFileSync(path.join(OUT, 'secret.html'), 'utf8'), '<p>Outside words</p>');
  const hidden = await edit({ was: 'Hidden words', now: 'Changed' });
  assert.equal(hidden.ok, false);
  assert.equal(get('.lab-hidden/x.html'), '<p>Hidden words</p>');
});

test('without the admin key nothing is written', async () => {
  const before = get('index.html');
  assert.equal((await call({ was: 'Only on index', now: 'x' }, '')).status, 403);
  assert.equal((await call({ was: 'Only on index', now: 'x' }, 'f'.repeat(24))).status, 403);
  assert.equal(get('index.html'), before);
});

test('a dry run writes nothing and says where', async () => {
  const before = get('index.html');
  const r = await edit({ was: 'Only on index', now: 'Changed', dry: true });
  assert.equal(r.ok, true);
  assert.equal(r.edit.file, 'index.html');
  assert.equal(get('index.html'), before);
});

test('new words with a line break or more than 300 characters go to the agent, not the file', async () => {
  assert.equal((await edit({ was: 'Only on index', now: 'a\nb' })).ok, false);
  assert.equal((await edit({ was: 'Only on index', now: 'x'.repeat(301) })).ok, false);
});

test('a pin on the words follows them: its quote changes, its text does not', async () => {
  put('pin.html', '<p>Pinned words stay here</p>');
  const c = await fetch(B + '/_lab/api/comments', { method: 'POST', headers: { 'content-type': 'application/json', origin: B }, body: JSON.stringify({ page: '/pin', name: 'Leo', text: 'shorter please', anchor: { kind: 'text', selector: 'p', quote: { exact: 'Pinned words', prefix: '', suffix: ' stay here' } } }) }).then((r) => r.json());
  const r = await fetch(B + '/_lab/api/edit', { method: 'POST', headers: { 'content-type': 'application/json', origin: B, 'x-lab-admin': KEY }, body: JSON.stringify({ page: '/pin', was: 'Pinned words', now: 'Moved words' }) }).then((x) => x.json());
  assert.equal(r.ok, true);
  const list = await fetch(B + '/_lab/api/comments?page=/pin').then((x) => x.json());
  const got = list.comments.find((x) => x.id === c.comment.id);
  assert.equal(got.anchor.quote.exact, 'Moved words');
  assert.equal(got.text, 'shorter please');
});

test('the edits of a page are listed', async () => {
  const r = await fetch(B + '/_lab/api/edit?page=/index', { headers: { origin: B } }).then((x) => x.json());
  assert.ok(r.edits.length >= 3);
});
