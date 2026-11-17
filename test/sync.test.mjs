// Sync, connections and listeners: every open page hears each change, the lab counts a page as open while it holds a
// live stream, and an agent's wait is opened, replaced, cancelled, timed out and closed at the right moments, with
// the pages told each time. No browser: the live stream is read as plain server-sent events.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const LAB = fileURLToPath(new URL('../local.mjs', import.meta.url));
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'labit-sync-'));
const PORT = String(8600 + Math.floor(Math.random() * 200)); // clear of the other test files' ranges (they run at the same time)
const B = `http://localhost:${PORT}`;
fs.writeFileSync(path.join(DIR, 'index.html'), '<!doctype html><title>t</title><h1 id="t">Hello</h1>');
fs.writeFileSync(path.join(DIR, 'other.html'), '<!doctype html><title>o</title><h1 id="o">Other</h1>');
// A 1 s grace once every page is closed, and pins 300 ms apart go over together. A tab with neither a stream nor a check-in is gone after 3 s here (90 s in a real lab).
const env = { ...process.env, LAB_CLOSE_GRACE: '1', LAB_SETTLE_MS: '300', LAB_TAB_TTL: '3', LABIT_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'labit-home-')), LABIT_NO_UPDATE_CHECK: '1' };
const server = spawn(process.execPath, [LAB, '.', '--no-open', '--port', PORT], { cwd: DIR, env });
const procs = new Set();
after(() => {
  for (const p of procs) p.kill();
  server.kill();
  fs.rmSync(DIR, { recursive: true, force: true });
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (ok, ms = 4000, what = 'condition') => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (ok()) return;
    await sleep(25);
  }
  assert.fail(`timed out waiting for ${what}`);
};

// A page's live stream: every state message it got, in order. close() is the tab going away.
const live = (tab) =>
  new Promise((resolve, reject) => {
    const msgs = [];
    let beats = 0;
    const req = http.get({ host: '127.0.0.1', port: PORT, path: '/_lab/live' + (tab ? `?tab=${tab}` : ''), headers: { host: `localhost:${PORT}` } }, (res) => {
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', (d) => {
        buf += d;
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i);
          buf = buf.slice(i + 2);
          if (/^event: beat/m.test(block)) beats++;
          else {
            const data = block.split('\n').find((l) => l.startsWith('data: '));
            if (data) msgs.push(JSON.parse(data.slice(6)));
          }
        }
      });
      // hide(): the tab lets its stream go but stays open (in the background). close(): it goes away and says bye,
      // as the widget does on pagehide.
      const s = { msgs, last: () => msgs[msgs.length - 1], beats: () => beats, ended: false, hide: () => res.destroy(), close: () => (res.destroy(), bye(tab)) };
      res.on('close', () => (s.ended = true));
      resolve(s);
    });
    req.on('error', reject);
  });

const bye = (tab) => tab && fetch(B + '/_lab/bye', { method: 'POST', headers: { 'content-type': 'application/json', origin: B }, body: JSON.stringify({ tab }) });

// `labit wait`, as an agent runs it. kill() is the agent cancelling it.
const wait = (args = [], timeout = 20) => {
  const t0 = Date.now();
  const p = spawn(process.execPath, [LAB, 'wait', '--timeout', String(timeout), '--name', 'sync-test', ...args], { cwd: DIR, env });
  procs.add(p);
  let out = '';
  p.stdout.on('data', (d) => (out += d));
  p.stderr.on('data', (d) => (out += d));
  const done = new Promise((r) => p.on('close', (code) => (procs.delete(p), r({ code, out, ms: Date.now() - t0 }))));
  let over = false;
  done.then(() => (over = true));
  return { done, over: () => over, kill: () => p.kill() };
};
const post = (text, page = '/index') =>
  fetch(B + '/_lab/api/comments', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: B },
    body: JSON.stringify({ page, name: 'Leo', text, anchor: { selector: 'h1', x: 0.1, y: 0.5, docX: 0.1, docY: 20, width: 1000, element: '<h1>' } }),
  }).then((r) => r.json());
// Hands over whatever earlier tests left unanswered, so the next wait starts with nothing waiting for it.
const drain = () => wait([], 1).done;
// The mode pages are told: listening, working or away.
const modeOf = (s) => (s.last()?.session ? s.last().mode : 'away');

test('the lab starts', async () => {
  for (let i = 0; i < 80; i++) {
    try {
      await fetch(B + '/');
      return;
    } catch {
      await sleep(100);
    }
  }
  assert.fail('lab did not start');
});

test('a live stream starts with the lab\'s state; a new comment reaches every open page; the delta has it', async () => {
  const a = await live('a1');
  const b = await live('b1');
  await until(() => a.msgs.length && b.msgs.length, 2000, 'first state');
  const rev = a.last().comments;
  assert.equal(b.last().comments, rev, 'both pages start at the same revision');
  assert.ok(a.last().lab && Number.isInteger(a.last().files), 'the state names the lab and its files revision');
  const { comment } = await post('sync to both');
  await until(() => a.last().comments > rev && b.last().comments > rev, 3000, 'both pages to hear the comment');
  const delta = await (await fetch(`${B}/_lab/api/changes?page=/index&since=${rev}`)).json();
  assert.equal(delta.rev, a.last().comments, 'the delta ends at the revision the pages were told');
  assert.ok(delta.set.some((c) => c.id === comment.id), 'the delta holds the new comment');
  a.close();
  b.close();
});

test('a closed stream gets nothing more and the lab keeps serving the pages still open', async () => {
  const gone = await live('g1');
  const stays = await live('s1');
  await until(() => gone.msgs.length && stays.msgs.length, 2000, 'first state');
  gone.close();
  await until(() => gone.ended, 2000, 'the closed stream to end');
  const heard = gone.msgs.length;
  const rev = stays.last().comments;
  await post('after one page closed');
  await until(() => stays.last().comments > rev, 3000, 'the open page to hear it');
  assert.equal(gone.msgs.length, heard, 'nothing written to the closed one');
  assert.equal((await fetch(B + '/')).status, 200, 'the lab still answers');
  stays.close();
});

test('two tabs: closing one keeps the agent listening; closing the last ends the wait after the grace', async () => {
  await drain();
  const t1 = await live('two-1');
  const t2 = await live('two-2');
  const w = wait();
  await until(() => modeOf(t1) === 'listening', 4000, 'pages to show the agent listening');
  t1.close();
  await sleep(2200); // past the 1 s grace: one tab still open
  assert.equal(w.over(), false, 'still listening with one tab open');
  t2.close();
  const { out, ms } = await w.done;
  assert.match(out, /page was closed/);
  assert.ok(ms < 9000, `ended ${ms} ms after it started`);
});

test('a wait that times out ends quietly and the pages say no agent is listening', async () => {
  await drain();
  const p = await live('to-1');
  const w = wait([], 1);
  await until(() => modeOf(p) === 'listening', 4000, 'listening');
  const { out } = await w.done;
  assert.doesNotMatch(out, /page was closed|another session/);
  await until(() => modeOf(p) === 'away', 3000, 'away after the timeout');
  p.close();
});

test('a new wait for the same pages replaces the old one: the old one is told, the pages never show away in between', async () => {
  await drain();
  const p = await live('re-1');
  const first = wait();
  await until(() => modeOf(p) === 'listening', 4000, 'listening');
  const from = p.msgs.length;
  const second = wait();
  const old = await first.done;
  assert.match(old.out, /another session is listening/i);
  await sleep(500);
  assert.ok(p.msgs.slice(from).every((m) => m.mode !== 'away'), 'no "away" between the two waits');
  assert.equal(second.over(), false, 'the new wait listens on');
  second.kill();
  await second.done;
  p.close();
});

test('a wait for other pages stays when a plain wait comes and goes', async () => {
  await drain();
  const p = await live('pg-1');
  const mine = wait(['--pages', 'other']);
  await until(() => modeOf(p) === 'listening', 4000, 'listening');
  const plain = wait([], 1);
  await plain.done;
  await sleep(300);
  assert.equal(mine.over(), false, 'the --pages wait is still open');
  assert.equal(modeOf(p), 'listening', 'still listening: one wait is open');
  mine.kill();
  await mine.done;
  await until(() => modeOf(p) === 'away', 3000, 'away once the last wait is cancelled');
  p.close();
});

test('a cancelled wait shows away at once, and a comment made then goes to the next wait, not lost', async () => {
  await drain();
  const p = await live('ca-1');
  const w = wait();
  await until(() => modeOf(p) === 'listening', 4000, 'listening');
  w.kill();
  await w.done;
  await until(() => modeOf(p) === 'away', 3000, 'away after the cancel');
  const { comment } = await post('made while nobody listened');
  await sleep(600); // past the settle time: nobody to wake
  const next = wait([], 5);
  const { out } = await next.done;
  assert.match(out, new RegExp(comment.id), 'the next wait gets it');
  assert.match(out, /made while nobody listened/);
  await until(() => modeOf(p) === 'working', 3000, 'working once handed over');
  p.close();
});

test('pins made one after another reach the agent together, in one message', async () => {
  await drain();
  const p = await live('st-1');
  const w = wait();
  await until(() => modeOf(p) === 'listening', 4000, 'listening');
  const one = (await post('first of two')).comment;
  await sleep(100); // inside the 300 ms settle
  const two = (await post('second of two')).comment;
  const { out } = await w.done;
  assert.match(out, /In this message: 2 new/);
  assert.match(out, new RegExp(one.id));
  assert.match(out, new RegExp(two.id));
  const again = wait([], 1);
  const later = await again.done;
  assert.doesNotMatch(later.out, new RegExp(`${one.id}|${two.id}`), 'neither comes a second time');
  p.close();
});

test('a page that only polls the state (a background tab) still counts as open', async () => {
  await drain();
  const p = await live('bg-1');
  const w = wait();
  await until(() => modeOf(p) === 'listening', 4000, 'listening');
  p.hide(); // the stream is let go in the background ...
  for (let i = 0; i < 3; i++) {
    const s = await (await fetch(`${B}/_lab/state?tab=bg-1`)).json(); // ... and the state polled instead
    assert.equal(s.mode, 'listening');
    await sleep(800);
  }
  assert.equal(w.over(), false, 'past the grace and still listening');
  assert.equal((await bye('bg-1')).status, 204);
  assert.match((await w.done).out, /page was closed/);
});

test('a tab that goes silent (no bye, no check-in: it crashed, or a phone froze it) stops counting after the timeout', async () => {
  await drain();
  const p = await live('crash-1');
  const w = wait();
  await until(() => modeOf(p) === 'listening', 4000, 'listening');
  const t0 = Date.now();
  p.hide(); // the stream drops and nothing more comes from the tab
  const { out } = await w.done;
  assert.match(out, /page was closed/);
  const ms = Date.now() - t0;
  assert.ok(ms > 2500 && ms < 9000, `ended ${ms} ms after the tab went silent (timeout 3 s + grace 1 s)`);
});
