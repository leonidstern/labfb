// A lab a test run started ends with that run, also when the run is killed before its own cleanup.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const LAB = fileURLToPath(new URL('../local.mjs', import.meta.url));
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'labit-orphan-'));
fs.writeFileSync(path.join(DIR, 'index.html'), '<!doctype html><h1>Hi</h1>');
after(() => fs.rmSync(DIR, { recursive: true, force: true }));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const alive = async (port) => {
  try {
    await fetch(`http://localhost:${port}/_lab/pages`, { signal: AbortSignal.timeout(500) });
    return true;
  } catch {
    return false;
  }
};

for (const [flag, ends] of [['1', true], ['', false]]) {
  test(`run killed, LABIT_EXIT_WITH_PARENT=${flag || '(unset)'}: the lab ${ends ? 'ends too' : 'keeps running'}`, async () => {
    const port = String(5400 + Math.floor(Math.random() * 90));
    // The "run": a node process that starts a lab and then is killed with no cleanup at all.
    const run = spawn(process.execPath, ['-e', `const c=require('child_process').spawn(process.execPath,${JSON.stringify([LAB, '.', '--no-open', '--port', port])},{stdio:'ignore'});console.log(c.pid);setInterval(()=>{},1e3)`], {
      cwd: DIR,
      env: { ...process.env, LABIT_EXIT_WITH_PARENT: flag },
    });
    const labPid = Number(await new Promise((r) => run.stdout.once('data', (d) => r(String(d).trim()))));
    after(() => {
      try {
        process.kill(labPid);
      } catch {}
    });
    for (let i = 0; i < 50 && !(await alive(port)); i++) await sleep(100);
    assert.ok(await alive(port), 'lab started');
    run.kill('SIGKILL');
    await sleep(3000);
    assert.equal(await alive(port), !ends);
  });
}
