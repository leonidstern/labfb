// Following the install: a lab started through a link to a build moves onto the build the link points at now, on the
// same folder and port, and a wait keeps listening through it. A build that can't load leaves the lab where it is.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SRC = path.dirname(fileURLToPath(new URL('../local.mjs', import.meta.url)));
const TMP = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'labit-follow-')));
const DIR = path.join(TMP, 'site');
fs.mkdirSync(DIR);
fs.writeFileSync(path.join(DIR, 'index.html'), '<!doctype html><title>index</title><h1>index</h1>');
const build = (name, edge) => {
  const to = path.join(TMP, name);
  fs.cpSync(SRC, to, { recursive: true, filter: (f) => !/[/\\](\.git|node_modules|test|bench|\.lab)$/.test(f) });
  fs.writeFileSync(path.join(to, '.edge-built'), edge);
  return to;
};
const LINK = path.join(TMP, 'current');
const point = (to) => {
  fs.symlinkSync(to, LINK + '.new');
  fs.renameSync(LINK + '.new', LINK);
};
const PORT = String(8600 + Math.floor(Math.random() * 90));
const B = `http://localhost:${PORT}`;
const env = { ...process.env, LABIT_HOME: path.join(TMP, 'home'), LABIT_NO_UPDATE_CHECK: '1', LABIT_IDLE_MS: '0', LABIT_FOLLOW_MS: '300', LABIT_FOLLOW_WAIT_MS: '3000', LABIT_EXIT_WITH_PARENT: '', CLAUDE_CODE_SESSION_ID: 'sess-f', CODEX_THREAD_ID: '', AMP_CURRENT_THREAD_ID: '' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = () => JSON.parse(fs.readFileSync(path.join(DIR, '.lab/server.json'), 'utf8'));
const page = async () => {
  for (let i = 0; i < 100; i++) {
    try {
      return await (await fetch(B + '/')).text();
    } catch {
      await sleep(100);
    }
  }
  assert.fail('the lab is not answering');
};
const until = async (ok, what) => {
  for (let i = 0; i < 150; i++) {
    try {
      if (await ok()) return;
    } catch {}
    await sleep(100);
  }
  assert.fail(what);
};

point(build('a', 'main aaa'));
spawn(process.execPath, [path.join(LINK, 'local.mjs'), '.', '--no-open', '--port', PORT], { cwd: DIR, env, detached: true, stdio: 'ignore' }).unref();
after(() => {
  try {
    process.kill(server().pid);
  } catch {}
  setTimeout(() => fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 5 }), 500);
});

test('the lab runs the build the link points at', async () => {
  assert.match(await page(), /edge: main aaa/);
});

test('the link moves to a newer build: the lab moves onto it, same port, and a wait keeps listening', async () => {
  const first = server().pid;
  const waiting = new Promise((resolve) =>
    execFile(process.execPath, [path.join(LINK, 'local.mjs'), 'wait', '--bg', '--timeout', '30'], { cwd: DIR, env }, (err, stdout, stderr) => resolve({ code: err?.code ?? 0, out: stdout + stderr })),
  );
  await sleep(500);
  point(build('b', 'main bbb'));
  await until(async () => server().pid !== first && /edge: main bbb/.test(await page()), 'the lab did not move onto the newer build');
  await sleep(800); // the wait is back on the lab, with its new key
  const res = await fetch(B + '/_lab/api/comments', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: B },
    body: JSON.stringify({ page: '/index', name: 'Leo', text: 'on the new build', anchor: { selector: 'h1', x: 0.1, y: 0.5, docX: 0.1, docY: 20, width: 1000, element: '<h1>' } }),
  });
  assert.ok(res.ok);
  const { code, out } = await waiting;
  assert.match(out, /on the new build/);
  assert.equal(code, 0);
});

test('a build that does not load: the lab stays on the one it runs', async () => {
  const pid = server().pid;
  const bad = build('c', 'main ccc');
  fs.writeFileSync(path.join(bad, 'local.mjs'), 'this is not javascript (');
  point(bad);
  await sleep(4500); // tried once, waited 3 s, gave up
  assert.equal(server().pid, pid);
  assert.match(await page(), /edge: main bbb/);
});
