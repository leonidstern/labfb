// A newer release for a lab run from npm: offered in the ⋯ menu; pressing it asks the agent, whose `labit update`
// prints what changed and moves the lab onto it (npx at that version) on the same folder and port. Nothing moves on its own.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
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
// With a file named hang beside it, it says so and starts nothing: a release that never loads.
const NPX = path.join(TMP, 'npx');
const HANG = path.join(TMP, 'hang');
fs.writeFileSync(NPX, `#!/bin/sh\nif [ -f "${HANG}" ]; then echo "$2" > "${path.join(TMP, 'asked-hang')}"; exit 0; fi\necho "$2" > "${path.join(TMP, 'asked')}"\nshift 2\nexec "${process.execPath}" "${LAB}" "$@"\n`, { mode: 0o755 });
const PORT = String(8500 + Math.floor(Math.random() * 90));
const B = `http://localhost:${PORT}`;
const env = { ...process.env, LABIT_HOME: HOME, LABIT_NO_UPDATE_CHECK: '', LABIT_OFFER_UPDATE: '1', LABIT_NPX: NPX, LABIT_IDLE_MS: '0', LABIT_FOLLOW_WAIT_MS: '5000', LABIT_FOLLOW_MS: '300', LABIT_EXIT_WITH_PARENT: '' };
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
// A second lab, already on npm's newest (0.0.1 is older than any labit): it has nothing to offer.
const DIR2 = path.join(TMP, 'site2');
const HOME2 = path.join(TMP, 'home2');
fs.mkdirSync(DIR2);
fs.mkdirSync(HOME2);
fs.writeFileSync(path.join(DIR2, 'index.html'), '<!doctype html><title>two</title><h1>two</h1>');
fs.writeFileSync(path.join(HOME2, 'latest.json'), JSON.stringify({ version: '0.0.1', at: Date.now() }));
const PORT2 = String(Number(PORT) + 100);
const env2 = { ...env, LABIT_HOME: HOME2 };
spawn(process.execPath, [LAB, '.', '--no-open', '--port', PORT2], { cwd: DIR2, env: env2, detached: true, stdio: 'ignore' }).unref();
const server2 = () => JSON.parse(fs.readFileSync(path.join(DIR2, '.lab/server.json'), 'utf8'));
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const update = (cwd, e) => new Promise((resolve) => execFile(process.execPath, [LAB, 'update'], { cwd, env: e }, (err, stdout, stderr) => resolve({ code: err?.code ?? 0, text: stdout + stderr })));
after(() => {
  for (const s of [server, server2])
    try {
      process.kill(s().pid);
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
  // Several of the lab's follow rounds (LABIT_FOLLOW_MS) later, it is the same lab and npx was never asked.
  const { pid } = server();
  await sleep(1500);
  assert.equal(server().pid, pid, 'the lab did not move on its own');
  assert.ok(alive(pid), 'and it is still running');
  assert.ok(!fs.existsSync(path.join(TMP, 'asked')), 'npx was not asked');
});

test("a page without the lab's key can't update it", async () => {
  const { pid } = server();
  const res = await fetch(B + '/_lab/labs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'update', port: Number(PORT) }) });
  assert.equal(res.status, 403);
  await sleep(500);
  assert.equal(server().pid, pid);
  assert.ok(!fs.existsSync(path.join(TMP, 'asked')), 'npx was not asked');
});

test('labit update on a lab with nothing newer says so and fails', async () => {
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(`http://localhost:${PORT2}/`);
      break;
    } catch {
      await sleep(100);
    }
  }
  const { pid } = server2();
  const out = await update(DIR2, env2);
  assert.equal(out.code, 1, out.text);
  assert.match(out.text, /This lab is on the newest labit: nothing to update\./);
  assert.equal(server2().pid, pid);
  assert.ok(!fs.existsSync(path.join(TMP, 'asked')), 'npx was not asked');
});

test('a release that never loads: the lab asked npx, and keeps running', async () => {
  const { pid } = server();
  fs.writeFileSync(HANG, '');
  try {
    const out = await update(DIR, env);
    assert.equal(out.code, 0, out.text);
    // Past the lab's wait for the newer one to say it loaded (LABIT_FOLLOW_WAIT_MS).
    await sleep(6500);
    assert.equal(fs.readFileSync(path.join(TMP, 'asked-hang'), 'utf8').trim(), '@leonidstern/labit@9.9.9', 'npx was asked');
    assert.equal(server().pid, pid, 'the same lab');
    assert.ok(alive(pid), 'still running');
    assert.match(await page(), /<h1>index<\/h1>/);
  } finally {
    fs.rmSync(HANG, { force: true });
  }
});

test('labit update (the agent, asked from the menu) moves the lab onto that release, same port', async () => {
  const { pid } = server();
  const out = await update(DIR, env);
  assert.equal(out.code, 0, out.text);
  assert.match(out.text, /Updating this lab to labit 9\.9\.9/);
  // 9.9.9 has no tag to read its CHANGELOG from (and a run may be offline): no notes, said as such.
  assert.match(out.text, /No notes for this release\./);
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
