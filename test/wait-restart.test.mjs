// A lab started again (a crash, an update) has a new agent key: a wait that outlives the restart reads the new key
// and keeps listening, instead of ending on "forbidden" with the lab showing nobody listening.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const LAB = fileURLToPath(new URL('../local.mjs', import.meta.url));
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'labit-wait-restart-'));
const PORT = String(8700 + Math.floor(Math.random() * 90));
const B = `http://localhost:${PORT}`;
fs.writeFileSync(path.join(DIR, 'index.html'), '<!doctype html><title>index</title><h1>index</h1>');
const env = { ...process.env, LABIT_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'labit-home-')), LABIT_NO_UPDATE_CHECK: '1', LABIT_IDLE_MS: '0', CLAUDE_CODE_SESSION_ID: 'sess-r', CODEX_THREAD_ID: '', AMP_CURRENT_THREAD_ID: '' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const start = () => spawn(process.execPath, [LAB, '.', '--no-open', '--port', PORT], { cwd: DIR, env });
const up = async () => {
  for (let i = 0; i < 80; i++) {
    try {
      return await fetch(B + '/');
    } catch {
      await sleep(100);
    }
  }
  assert.fail('the lab did not start');
};
const stop = (lab) => new Promise((r) => (lab.exitCode !== null ? r() : (lab.once('exit', r), lab.kill())));
const key = () => JSON.parse(fs.readFileSync(path.join(DIR, '.lab/server.json'), 'utf8')).agent;

let lab = start();
after(async () => {
  await stop(lab);
  fs.rmSync(DIR, { recursive: true, force: true, maxRetries: 5 });
});

test('a wait outlives a restart of the lab and still gets the next pin', async () => {
  await up();
  const before = key();
  const waiting = new Promise((resolve) =>
    execFile(process.execPath, [LAB, 'wait', '--bg', '--timeout', '30'], { cwd: DIR, env }, (err, stdout, stderr) => resolve({ code: err?.code ?? 0, out: stdout + stderr })),
  );
  await sleep(800);
  await stop(lab);
  await sleep(1000); // down for a moment: the wait holds on
  lab = start();
  await up();
  assert.notEqual(key(), before, 'a lab started again has a new key');
  await sleep(1000); // the wait is back on the lab
  const res = await fetch(B + '/_lab/api/comments', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: B },
    body: JSON.stringify({ page: '/index', name: 'Leo', text: 'after the restart', anchor: { selector: 'h1', x: 0.1, y: 0.5, docX: 0.1, docY: 20, width: 1000, element: '<h1>' } }),
  });
  assert.ok(res.ok);
  const { code, out } = await waiting;
  assert.doesNotMatch(out, /forbidden/);
  assert.match(out, /after the restart/);
  assert.equal(code, 0);
});
