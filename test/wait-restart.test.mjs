// A lab started again (a crash, an update) has a new agent key: a wait that outlives the restart reads the new key
// and keeps listening, instead of ending on "forbidden" with the lab showing nobody listening.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { H1, site, tmp, rm, spawnLab, stop, sleep, up as answers, serverJson, cli } from './harness.mjs';

const { DIR, PORT, B } = site('wait-restart', 8700, 90);
fs.writeFileSync(path.join(DIR, 'index.html'), '<!doctype html><title>index</title><h1>index</h1>');
const env = { ...process.env, LABIT_HOME: tmp('home'), LABIT_NO_UPDATE_CHECK: '1', LABIT_IDLE_MS: '0', CLAUDE_CODE_SESSION_ID: 'sess-r', CODEX_THREAD_ID: '', AMP_CURRENT_THREAD_ID: '' };
const start = () => spawnLab(DIR, PORT, { env });
const up = () => answers(B + '/', { fail: () => assert.fail('the lab did not start') });
const key = () => serverJson(DIR).agent;

let lab = start();
after(async () => {
  await stop(lab);
  rm([DIR], { maxRetries: 5 });
});

test('a wait outlives a restart of the lab and still gets the next pin', async () => {
  await up();
  const before = key();
  const waiting = cli(['wait', '--bg', '--timeout', '30'], { cwd: DIR, env });
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
    body: JSON.stringify({ page: '/index', name: 'Leo', text: 'after the restart', anchor: H1 }),
  });
  assert.ok(res.ok);
  const { code, out } = await waiting;
  assert.doesNotMatch(out, /forbidden/);
  assert.match(out, /after the restart/);
  assert.equal(code, 0);
});
