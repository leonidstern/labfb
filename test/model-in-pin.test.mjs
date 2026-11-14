// A pin can name the model that handles it ("use fable", "@opus"), or skip the models ("!", "@claude").
// LAB_FAST_CMD stands in for the model: it echoes the model it was given, so no model runs.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const LAB = fileURLToPath(new URL('../local.mjs', import.meta.url));
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'labfb-route-'));
const PORT = String(5700 + Math.floor(Math.random() * 200));
const B = `http://localhost:${PORT}`;
fs.writeFileSync(path.join(DIR, 'index.html'), '<!doctype html><title>t</title><h1 id="t">Hello</h1>');
const server = spawn(process.execPath, [LAB, '.', '--no-open', '--port', PORT], {
  cwd: DIR,
  env: { ...process.env, PORT, LABFB_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'labfb-home-')), LAB_FAST_CMD: 'cat >/dev/null; echo "Done: used $LAB_MODEL"' },
});
after(() => {
  server.kill();
  fs.rmSync(DIR, { recursive: true, force: true });
});
const up = async () => {
  for (let i = 0; i < 50; i++) {
    try {
      return await fetch(B + '/');
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error('server did not start');
};
const pin = async (text) => {
  const res = await fetch(B + '/_lab/api/comments', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: B },
    body: JSON.stringify({ page: '/index', name: 'Leo', text, anchor: { selector: '#t', x: 0.1, y: 0.5, docX: 0.1, docY: 20, width: 1000, element: '<h1 id="t">' } }),
  });
  return (await res.json()).comment.id;
};
const replyTo = async (id) => {
  for (let i = 0; i < 40; i++) {
    const list = await (await fetch(B + '/_lab/api/comments?page=/index')).json();
    const r = (list.comments || list).find((c) => c.parent === id);
    if (r) return r;
    await new Promise((res) => setTimeout(res, 100));
  }
  return null;
};

test('a pin that names a model is handled by that model', async () => {
  await up();
  const r = await replyTo(await pin('make the title red, use fable'));
  assert.equal(r?.name, 'Claude · fable');
  assert.equal(r?.text, 'Done: used fable');
});

test('a pin that names no model goes to the quick model', async () => {
  const r = await replyTo(await pin('make the title green'));
  assert.equal(r?.name, 'Claude · quick');
  assert.equal(r?.text, 'Done: used haiku');
});

test('"!" sends the pin straight to the session', async () => {
  const id = await pin('!make the title blue');
  assert.equal(await replyTo(id), null);
});
