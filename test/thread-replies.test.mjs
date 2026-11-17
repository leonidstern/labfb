// Threads (src/widget/thread.ts, lib/commands.ts): an answer to a later message in the thread says which one, so the
// widget quotes it, as the chat does.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const LAB = fileURLToPath(new URL('../local.mjs', import.meta.url));
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'labit-thread-')); // nobody's real ~/.config
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'labit-thread-lab-'));
const PORT = 9150 + Math.floor(Math.random() * 40); // clear of the other test files' ranges
const env = { ...process.env, XDG_CONFIG_HOME: HOME, PORT: '' };
const B = `http://localhost:${PORT}`;
fs.writeFileSync(path.join(DIR, 'package.json'), '{}');
fs.writeFileSync(path.join(DIR, 'bar.html'), '<!doctype html><title>Bar</title><p id="x">Hi</p>');
const lab = spawn(process.execPath, [LAB, '.', '--no-open', '--new', '--port', String(PORT)], { cwd: DIR, env });
after(() => {
  lab.kill();
  for (const d of [HOME, DIR]) fs.rmSync(d, { recursive: true, force: true });
});
const cli = (...args) => new Promise((done) => execFile(process.execPath, [LAB, ...args], { cwd: DIR, env }, (err, out, errOut) => done({ code: err?.code ?? 0, out: out + errOut })));
const post = async (body) => (await (await fetch(`${B}/_lab/api/comments`, { method: 'POST', headers: { 'content-type': 'application/json', origin: B }, body: JSON.stringify({ page: '/bar', ...body }) })).json()).comment;
const thread = async () => (await (await fetch(`${B}/_lab/api/comments?page=/bar`)).json()).comments;

test('answering a reply by its id says which message it answers; answering the pin does not', async () => {
  for (let i = 0; i < 80; i++) {
    try {
      await fetch(B + '/');
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  const pin = await post({ name: 'leo', text: 'the menu', anchor: { kind: 'element', selector: '#x', x: 0.5, y: 0.5 } });
  assert.equal((await cli('reply', pin.id, 'Changed the menu.')).code, 0);
  const where = await post({ name: 'leo', text: 'where is it', parent: pin.id });
  assert.equal((await cli('reply', where.id, 'Under the menu.')).code, 0);
  const all = await thread();
  assert.equal(all.find((c) => c.text === 'Under the menu.').to, where.id);
  assert.equal(all.find((c) => c.text === 'Changed the menu.').to, undefined);
});
