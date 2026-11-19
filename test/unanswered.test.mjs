// A pin handed to a wait that never answers (a shell loop left running by a closed session, Leo 19 Nov) counts as not
// answered after LAB_ANSWER_MS: it goes to the next wait, the comment says so, and the lab's state names the session
// as not answering until it replies to anything.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const LAB = fileURLToPath(new URL('../local.mjs', import.meta.url));
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'labit-unanswered-'));
const PORT = String(8800 + Math.floor(Math.random() * 90));
const B = `http://localhost:${PORT}`;
fs.writeFileSync(path.join(DIR, 'design.html'), '<!doctype html><title>design</title><h1>design</h1>');
const env = { ...process.env, LAB_CLOSE_GRACE: '1', LAB_SETTLE_MS: '100', LAB_ANSWER_MS: '1500', LABIT_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'labit-home-')), LABIT_NO_UPDATE_CHECK: '1' };
const server = spawn(process.execPath, [LAB, '.', '--no-open', '--port', PORT], { cwd: DIR, env });
const tabs = [];
after(async () => {
  for (const t of tabs) t.destroy();
  if (server.exitCode === null) await new Promise((r) => { server.once('exit', r); server.kill(); });
  fs.rmSync(DIR, { recursive: true, force: true, maxRetries: 5 });
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const key = () => JSON.parse(fs.readFileSync(path.join(DIR, '.lab/server.json'), 'utf8')).agent;
const call = (p, body, who) => new Promise((resolve, reject) => {
  const data = JSON.stringify(body);
  const req = http.request({ host: '127.0.0.1', port: PORT, path: p, method: 'POST', headers: { host: `localhost:${PORT}`, 'content-type': 'application/json', 'content-length': Buffer.byteLength(data), 'x-lab-admin': key(), 'x-lab-agent': '1', 'x-lab-session': encodeURIComponent(JSON.stringify({ id: who, name: who })) } }, (res) => {
    let text = ''; res.on('data', (c) => (text += c));
    res.on('end', () => resolve({ status: res.statusCode, text, delivery: res.headers['x-lab-delivery'] || '' }));
  });
  req.on('error', reject); req.end(data);
});
const PAGES = ['/design'];
const wait = (who, o = {}) => call('/_lab/wait', { timeout: 3, pages: PAGES, ack: true, ...o }, who);
const waitAcked = async (who, o) => {
  const r = await wait(who, o);
  if (r.delivery) await call('/_lab/ack', { id: r.delivery }, who);
  return r;
};
const post = (text) => fetch(B + '/_lab/api/comments', { method: 'POST', headers: { 'content-type': 'application/json', origin: B }, body: JSON.stringify({ page: '/design', name: 'Leo', text, anchor: { selector: 'h1', x: 0.1, y: 0.5, docX: 0.1, docY: 20, width: 1000, element: '<h1>' } }) }).then((r) => r.json());
const find = async (id) => ((await fetch(`${B}/_lab/api/comments?page=/design`, { headers: { origin: B } }).then((r) => r.json())).comments || []).find((c) => c.id === id);
const state = () => fetch(`${B}/_lab/state`).then((r) => r.json());

test('start', async () => {
  for (let i = 0; i < 80; i++) { try { await fetch(B + '/'); break; } catch { await sleep(100); } }
  tabs.push(http.get({ host: '127.0.0.1', port: PORT, path: '/_lab/live?tab=t1', headers: { host: `localhost:${PORT}` } }, (r) => r.resume()));
  await sleep(300);
});

test('a hand-off with no reply goes to the next wait and is marked not answered', async () => {
  const { comment } = await post('make the title bigger');
  const a = await waitAcked('ghost'); // the loop: waits and acks, never answers
  assert.match(a.text, /make the title bigger/);
  assert.ok((await find(comment.id)).handedAt, 'handed to the ghost');
  await sleep(2200);
  const c = await find(comment.id);
  assert.equal(c.handedAt, undefined, 'hand-off taken back');
  assert.ok(c.unanswered, 'marked not answered');
  assert.deepEqual((await state()).silent.map((q) => q.label), ['Claude (ghost)'], 'the ghost is named as not answering');
  // Another session's wait for the same pages gets the pin whole.
  const b = await waitAcked('live');
  assert.match(b.text, /# New comments/);
  assert.match(b.text, /make the title bigger/);
  assert.ok((await find(comment.id)).handedAt, 'handed to the live session');
  // The live session answers in time: nothing comes back.
  const r = await call('/_lab/api/comments', { page: '/design', parent: comment.id, name: 'live', text: 'on it', intent: 'on-it' }, 'live');
  assert.ok(r.status < 300, r.text);
  await sleep(2200);
  assert.ok((await find(comment.id)).handedAt, 'an answered hand-off stays handed');
});

test("a session that isn't answering doesn't end an answering one's wait, and gets pins after it", async () => {
  const live = wait('live', { timeout: 6 });
  await sleep(300);
  const ghost = await wait('ghost', { timeout: 1 }); // the loop re-arms
  assert.equal(ghost.status, 204, 'the ghost heard nothing');
  const { comment } = await post('and the colour');
  const got = await live;
  assert.equal(got.status, 200, `the live wait was not ended: ${got.status} ${got.text}`);
  assert.match(got.text, /and the colour/);
  await call('/_lab/ack', { id: got.delivery }, 'live');
  await call('/_lab/api/comments', { page: '/design', parent: comment.id, name: 'live', text: 'done', intent: 'done' }, 'live');
});

test('a reply from the session that was not answering clears it', async () => {
  const { comment } = await post('ghost talks again');
  const a = await waitAcked('ghost');
  assert.match(a.text, /ghost talks again/);
  assert.equal((await state()).silent.length, 1, 'still named before it says anything');
  await call('/_lab/api/comments', { page: '/design', parent: comment.id, name: 'ghost', text: 'on it', intent: 'on-it' }, 'ghost');
  assert.equal((await state()).silent.length, 0, 'answering again');
});
