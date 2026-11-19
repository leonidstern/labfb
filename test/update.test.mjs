// A newer release for a lab run from npm: offered in the ⋯ menu with a few lines of what changed, and update moves the
// lab onto it (npx at that version) on the same folder and port. Nothing moves until the person asks.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { releaseNotes } from '../lib/update.ts';

const LAB = fileURLToPath(new URL('../local.mjs', import.meta.url));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'labit-update-'));
const DIR = path.join(TMP, 'site');
const HOME = path.join(TMP, 'home');
fs.mkdirSync(DIR);
fs.mkdirSync(HOME);
fs.writeFileSync(path.join(DIR, 'index.html'), '<!doctype html><title>index</title><h1>index</h1>');
fs.writeFileSync(path.join(HOME, 'latest.json'), JSON.stringify({ version: '9.9.9', at: Date.now() }));
// npx stand-in: npx --yes @leonidstern/labit@9.9.9 <args> starts this labit with the args, and says what it was asked.
const NPX = path.join(TMP, 'npx');
fs.writeFileSync(NPX, `#!/bin/sh\necho "$2" > "${path.join(TMP, 'asked')}"\nshift 2\nexec "${process.execPath}" "${LAB}" "$@"\n`, { mode: 0o755 });
const PORT = String(8500 + Math.floor(Math.random() * 90));
const B = `http://localhost:${PORT}`;
const env = { ...process.env, LABIT_HOME: HOME, LABIT_NO_UPDATE_CHECK: '', LABIT_OFFER_UPDATE: '1', LABIT_NPX: NPX, LABIT_IDLE_MS: '0', LABIT_FOLLOW_WAIT_MS: '8000', LABIT_EXIT_WITH_PARENT: '' };
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
spawn(process.execPath, [LAB, '.', '--no-open', '--port', PORT], { cwd: DIR, env, detached: true, stdio: 'ignore' }).unref();
after(() => {
  try {
    process.kill(server().pid);
  } catch {}
  setTimeout(() => fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 5 }), 500);
});

test("what changed: each bullet's first sentence, only releases after yours", () => {
  const md = '## Unreleased\n\n- not out yet.\n\n## 0.7.0 · 2026-12-01\n\n- Pins: a pin moves with its words. More about it.\n- Faster `wait` on big labs.\n\n## 0.6.2 · 2026-11-17\n\n- Old news.\n';
  assert.deepEqual(releaseNotes(md, '0.6.2', '0.7.0'), ['Pins: a pin moves with its words.', 'Faster wait on big labs.']);
  assert.deepEqual(releaseNotes(md, '0.7.0', '0.7.0'), []);
});

test('a newer release is offered in the page, and nothing moves on its own', async () => {
  await page();
  let html = '';
  for (let i = 0; i < 60 && !/data-update=/.test(html); i++) {
    await sleep(100);
    html = await page();
  }
  assert.match(html, /data-update="\{&quot;version&quot;:&quot;9\.9\.9&quot;/);
});

test('update moves the lab onto that release, same port', async () => {
  const { pid, token } = server();
  const res = await fetch(B + '/_lab/labs', { method: 'POST', headers: { 'content-type': 'application/json', 'x-lab-admin': token }, body: JSON.stringify({ action: 'update', port: Number(PORT) }) });
  assert.equal(res.status, 200);
  for (let i = 0; i < 150; i++) {
    try {
      if (server().pid !== pid) break;
    } catch {}
    await sleep(100);
  }
  assert.notEqual(server().pid, pid, 'a new lab took over');
  assert.equal(fs.readFileSync(path.join(TMP, 'asked'), 'utf8').trim(), '@leonidstern/labit@9.9.9');
  assert.match(await page(), /<h1>index<\/h1>/);
});
