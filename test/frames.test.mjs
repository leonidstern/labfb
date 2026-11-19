// A page behind a dev server can sit in a frame: the lab drops the dev server's x-frame-options (and its content
// security policy) on pages, and leaves other files as they are.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const LAB = fileURLToPath(new URL('../local.mjs', import.meta.url));
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'labit-frames-'));
const UP = 9500 + Math.floor(Math.random() * 100);
const PORT = UP + 150;
const B = `http://localhost:${PORT}`;
const guard = { 'x-frame-options': 'DENY', 'content-security-policy': "frame-ancestors 'none'" };
const upstream = http
  .createServer((q, r) =>
    q.url === '/app.js'
      ? r.writeHead(200, { 'content-type': 'text/javascript', ...guard }).end('1')
      : r.writeHead(200, { 'content-type': 'text/html', ...guard }).end('<!doctype html><html><body><h1>dev</h1></body></html>'),
  )
  .listen(UP);
const server = spawn(process.execPath, [LAB, '.', '--no-open', '--port', String(PORT), '--proxy', String(UP)], { cwd: DIR, env: process.env });
after(() => {
  server.kill();
  upstream.close();
  fs.rmSync(DIR, { recursive: true, force: true });
});
const up = async () => {
  for (let i = 0; i < 80; i++) {
    try {
      return await fetch(B + '/_lab/state');
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error('lab did not start');
};

test('a proxied page can be framed; other files keep their headers', async () => {
  await up();
  const page = await fetch(B + '/', { headers: { accept: 'text/html' } });
  assert.equal(page.headers.get('x-frame-options'), null);
  assert.equal(page.headers.get('content-security-policy'), null);
  assert.match(await page.text(), /_lab\/comments\.js/);
  const js = await fetch(B + '/app.js');
  assert.equal(js.headers.get('x-frame-options'), 'DENY');
});
