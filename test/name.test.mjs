// Your name is remembered for this computer, not for one lab: the browser's own memory is per origin and every lab
// has its own port, so a name given to one lab used to mean nothing to the next.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const LAB = fileURLToPath(new URL('../local.mjs', import.meta.url));
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'labit-me-')); // nobody's real ~/.config
const ME = path.join(HOME, 'labit', 'me.json');
const labs = [];
const dirs = [HOME];

const startLab = async (port) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'labit-lab-'));
  dirs.push(dir);
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>t</title><h1>Hello</h1>');
  const server = spawn(process.execPath, [LAB, '.', '--no-open', '--new', '--port', String(port)], {
    cwd: dir,
    env: { ...process.env, XDG_CONFIG_HOME: HOME },
  });
  labs.push(server);
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://localhost:${port}/`);
      return { port, html: await res.text() };
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error(`lab on ${port} did not start`);
};

after(() => {
  for (const s of labs) s.kill();
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
});

test('a lab tells the page nothing until it knows who you are', async () => {
  const { html } = await startLab(4711);
  assert.doesNotMatch(html, /data-me=/);
});

test('a name given once is kept for this computer and handed to the next lab', async () => {
  const res = await fetch('http://localhost:4711/_lab/me', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'leo' }),
  });
  assert.equal(res.status, 204);
  assert.equal(JSON.parse(fs.readFileSync(ME, 'utf8')).name, 'leo');

  // The lab that was already running says so now…
  assert.match(await (await fetch('http://localhost:4711/')).text(), /data-me="leo"/);
  // …and so does a lab started after it, in another folder on another port.
  const next = await startLab(4712);
  assert.match(next.html, /data-me="leo"/);
});

test('an empty or oversized name is refused, and the kept one stands', async () => {
  for (const name of ['', '   ', 'x'.repeat(61), 42, null]) {
    const res = await fetch('http://localhost:4711/_lab/me', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    assert.equal(res.status, 400, String(name));
  }
  assert.equal(JSON.parse(fs.readFileSync(ME, 'utf8')).name, 'leo');
});
