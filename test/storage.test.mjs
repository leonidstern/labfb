// Where a local lab keeps its comments: one file per page in .lab/comments/, the old single comments.json moved over
// once, each page's list kept until it changes, and done threads a month old moved out to .lab/archive/.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const LAB = fileURLToPath(new URL('../local.mjs', import.meta.url));
const dirs = [];
const running = new Set();
after(() => {
  for (const s of running) s.kill();
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let nextPort = 5000 + Math.floor(Math.random() * 400);
const folder = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'labit-storage-'));
  dirs.push(d);
  fs.writeFileSync(path.join(d, 'index.html'), '<!doctype html><h1>Hi</h1>');
  return d;
};
// A lab on the folder, once it answers; stop() ends it and waits for it to exit.
async function start(dir) {
  const port = nextPort++;
  const server = spawn(process.execPath, [LAB, '.', '--no-open', '--port', String(port)], { cwd: dir, env: { ...process.env, PORT: String(port) } });
  running.add(server);
  let log = '';
  server.stdout.on('data', (d) => (log += d));
  server.stderr.on('data', (d) => (log += d));
  const B = `http://localhost:${port}`;
  for (let i = 0; i < 80; i++) {
    try {
      await fetch(B + '/');
      break;
    } catch {
      await sleep(100);
    }
  }
  const token = JSON.parse(fs.readFileSync(path.join(dir, '.lab/server.json'), 'utf8')).token;
  const post = (body, admin) =>
    fetch(B + '/_lab/api/comments', { method: 'POST', headers: { 'content-type': 'application/json', origin: B, ...(admin ? { 'x-lab-admin': token } : {}) }, body: JSON.stringify(body) }).then((r) => r.json());
  const list = async (page) => (await (await fetch(`${B}/_lab/api/comments?page=${encodeURIComponent(page)}`, { headers: { 'accept-encoding': 'br' } })).json()).comments;
  const stop = () =>
    new Promise((resolve) => {
      server.once('exit', () => (running.delete(server), resolve()));
      server.kill('SIGTERM');
    });
  return { B, post, list, stop, log: () => log };
}
const anchor = { selector: 'h1', x: 0.1, y: 0.5, docX: 0.1, docY: 20, width: 1000, element: '<h1>' };
const until = async (check, what) => {
  for (let i = 0; i < 50; i++) {
    if (check()) return;
    await sleep(50);
  }
  assert.fail(`timed out: ${what}`);
};
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

test('each page has its own file; a comment rewrites only its page; a restart loads them all', async () => {
  const dir = folder();
  const lab = await start(dir);
  const fileA = path.join(dir, '.lab/comments/a.json');
  const fileB = path.join(dir, '.lab/comments/b.json');
  const a1 = (await lab.post({ page: '/a', name: 'Leo', text: 'one on a', anchor })).comment;
  const b1 = (await lab.post({ page: '/b', name: 'Leo', text: 'one on b', anchor })).comment;
  await until(() => fs.existsSync(fileA) && fs.existsSync(fileB), 'both page files written');
  assert.equal(readJson(fileB).page, '/b');
  assert.ok(readJson(fileB).comments[b1.id], 'the comment is in its page file');
  assert.ok(!fs.existsSync(path.join(dir, '.lab/comments.json')), 'no single file any more');
  // Each write is a new file put in place (write then rename), so an unchanged inode means b.json wasn't rewritten.
  const bBefore = fs.statSync(fileB).ino;
  const aBefore = fs.statSync(fileA).ino;
  const a2 = (await lab.post({ page: '/a', name: 'Leo', text: 'two on a', anchor })).comment;
  await until(() => readJson(fileA).comments[a2.id], 'a.json has the new comment');
  assert.notEqual(fs.statSync(fileA).ino, aBefore, 'a.json rewritten');
  assert.equal(fs.statSync(fileB).ino, bBefore, 'b.json left alone');
  // A page whose last comment is deleted has no file left.
  await lab.post({ page: '/b', action: 'delete', id: b1.id }, true);
  await until(() => !fs.existsSync(fileB), 'empty page file removed');

  await lab.stop();
  const again = await start(dir);
  const onA = await again.list('/a');
  assert.deepEqual(onA.map((c) => c.id).sort(), [a1.id, a2.id].sort(), 'both comments on /a back after a restart');
  assert.deepEqual(await again.list('/b'), []);
  await again.stop();
});

test('a lab with the old comments.json moves it into per-page files and keeps it as .bak', async () => {
  const dir = folder();
  fs.mkdirSync(path.join(dir, '.lab'));
  const now = new Date().toISOString();
  const old = {
    '/x': { x1: { id: 'x1', parent: null, name: 'Leo', text: 'old store x', createdAt: now, resolved: false, anchor } },
    '/y/z': { y1: { id: 'y1', parent: null, name: 'Leo', text: 'old store y', createdAt: now, resolved: false, anchor } },
  };
  fs.writeFileSync(path.join(dir, '.lab/comments.json'), JSON.stringify(old));
  const lab = await start(dir);
  assert.ok(!fs.existsSync(path.join(dir, '.lab/comments.json')), 'old file moved');
  assert.deepEqual(readJson(path.join(dir, '.lab/comments.json.bak')), old, 'old file kept as .bak, unchanged');
  assert.equal(readJson(path.join(dir, '.lab/comments/x.json')).page, '/x');
  assert.equal(readJson(path.join(dir, '.lab/comments/y_2fz.json')).page, '/y/z');
  assert.equal((await lab.list('/y/z'))[0].text, 'old store y');
  // The reply command finds comments in the new files.
  const replied = await new Promise((resolve) => execFile(process.execPath, [LAB, 'reply', 'x1', 'Done: moved'], { cwd: dir }, (err, out, errOut) => resolve({ code: err?.code ?? 0, out: out + errOut })));
  assert.equal(replied.code, 0, replied.out);
  assert.ok((await lab.list('/x')).some((c) => c.parent === 'x1' && c.text === 'Done: moved'), 'the reply landed');
  await lab.stop();
  const again = await start(dir);
  assert.equal((await again.list('/x'))[0].text, 'old store x', 'still there after the next start (not migrated twice)');
  assert.ok(fs.existsSync(path.join(dir, '.lab/comments.json.bak')));
  await again.stop();
});

test("a page's kept list is dropped when the page changes (new comment, reply, delete)", async () => {
  const dir = folder();
  const lab = await start(dir);
  const c1 = (await lab.post({ page: '/p', name: 'Leo', text: 'first', anchor })).comment;
  const one = await lab.list('/p');
  assert.deepEqual(await lab.list('/p'), one, 'asked again: the same list');
  const c2 = (await lab.post({ page: '/p', name: 'Leo', text: 'second', anchor })).comment;
  assert.deepEqual((await lab.list('/p')).map((c) => c.id), [c1.id, c2.id], 'the new comment shows');
  const r = (await lab.post({ page: '/p', parent: c1.id, name: 'Leo', text: 'a reply' })).comment;
  assert.ok((await lab.list('/p')).some((c) => c.id === r.id), 'the reply shows');
  await lab.post({ page: '/p', action: 'delete', id: c2.id }, true);
  assert.ok(!(await lab.list('/p')).some((c) => c.id === c2.id), 'the deleted comment is gone');
  // Another page's change leaves this one's list as it is, and is seen on its own page.
  await lab.post({ page: '/q', name: 'Leo', text: 'elsewhere', anchor });
  assert.equal((await lab.list('/q')).length, 1);
  assert.equal((await lab.list('/p')).length, 2);
  await lab.stop();
});

test('done threads with nothing new in 30 days are archived on start; open and recent ones stay', async () => {
  const dir = folder();
  fs.mkdirSync(path.join(dir, '.lab/comments'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.lab/archive'), { recursive: true });
  const ago = (days) => new Date(Date.now() - days * 864e5).toISOString();
  const c = (id, days, extra = {}) => ({ id, parent: null, name: 'Leo', text: `comment ${id}`, createdAt: ago(days), resolved: false, anchor, ...extra });
  const comments = {
    old: c('old', 60, { resolved: true }), // done, last message 50 days ago: archived with its reply
    oldReply: c('oldReply', 50, { parent: 'old', anchor: null }),
    recent: c('recent', 60, { resolved: true }), // done, but a reply 2 days ago: stays
    recentReply: c('recentReply', 2, { parent: 'recent', anchor: null }),
    open: c('open', 90), // open, however old: stays
    fresh: c('fresh', 5, { resolved: true }), // done 5 days ago: stays
  };
  fs.writeFileSync(path.join(dir, '.lab/comments/h.json'), JSON.stringify({ page: '/h', comments }));
  // An archive already there is added to, not replaced.
  fs.writeFileSync(path.join(dir, '.lab/archive/h.json'), JSON.stringify({ page: '/h', comments: { before: c('before', 100, { resolved: true }) } }));
  const lab = await start(dir);
  const live = (await lab.list('/h')).map((x) => x.id).sort();
  assert.deepEqual(live, ['fresh', 'open', 'recent', 'recentReply'], 'the old done thread is no longer sent');
  const archived = readJson(path.join(dir, '.lab/archive/h.json'));
  assert.equal(archived.page, '/h');
  assert.deepEqual(Object.keys(archived.comments).sort(), ['before', 'old', 'oldReply'], 'archived next to what was there');
  assert.deepEqual(Object.keys(readJson(path.join(dir, '.lab/comments/h.json')).comments).sort(), ['fresh', 'open', 'recent', 'recentReply'], 'the page file no longer has it');
  assert.match(lab.log(), /archived 1 done thread/);
  await lab.stop();
});
