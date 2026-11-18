// A lab nobody uses parks itself (LABIT_IDLE_MS): no page open, no agent waiting. One with a page open stays.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const LAB = fileURLToPath(new URL('../local.mjs', import.meta.url));
const kids = [];
const dirs = [];
after(() => {
  kids.forEach((k) => k.kill());
  dirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true }));
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const start = (idleMs) => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'labit-idle-')));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'labit-idle-home-'));
  dirs.push(dir, home);
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><h1>Hi</h1>');
  const port = String(5300 + Math.floor(Math.random() * 300));
  const lab = spawn(process.execPath, [LAB, '.', '--no-open', '--port', port], { cwd: dir, env: { ...process.env, LABIT_HOME: home, LABIT_IDLE_MS: String(idleMs) } });
  kids.push(lab);
  const exited = new Promise((r) => lab.on('exit', r));
  return { dir, home, port, lab, exited };
};
const up = async (port) => {
  for (let i = 0; i < 50; i++) {
    try {
      return await fetch(`http://localhost:${port}/_lab/pages`);
    } catch {
      await sleep(100);
    }
  }
  throw new Error('lab did not start');
};

test('nobody on it: the lab parks itself and can be started again from the parked record', async () => {
  const { dir, home, port, exited } = start(1500);
  await up(port);
  const code = await Promise.race([exited, sleep(8000).then(() => 'still running')]);
  assert.equal(code, 0, 'it ended by itself');
  const parked = JSON.parse(fs.readFileSync(path.join(home, 'parked', `${port}.json`), 'utf8'));
  assert.equal(parked.root, dir);
  assert.equal(parked.why, 'idle');
  assert.ok(parked.argv.includes('--port'), 'how it was started, to start it the same way');
  assert.ok(!fs.existsSync(path.join(home, 'servers', `${port}.json`)), 'no longer listed as running');
});

test('a page open on it: the lab stays', async () => {
  const { port, lab, exited } = start(1500);
  await up(port);
  const live = http.get(`http://localhost:${port}/_lab/live`);
  live.on('error', () => {});
  const code = await Promise.race([exited, sleep(4500).then(() => 'still running')]);
  assert.equal(code, 'still running');
  live.destroy();
  lab.kill();
});
