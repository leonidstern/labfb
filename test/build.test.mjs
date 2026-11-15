// The minified widget (npm run build): it parses, it's much smaller, and the local lab serves it only while it's
// newer than the readable source, so an edit to the source is never hidden behind an old build.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = path.join(ROOT, 'public/_lab/comments.js');
const MIN = path.join(ROOT, 'public/_lab/comments.min.js');
const kids = [];
after(() => kids.forEach((k) => k.kill()));
const hasEsbuild = fs.existsSync(path.join(ROOT, 'node_modules/esbuild'));

test('the build writes a minified widget that parses and is at most 65% of the source', { skip: !hasEsbuild && 'npm ci first' }, () => {
  execFileSync(process.execPath, [path.join(ROOT, 'scripts/build.mjs')], { cwd: ROOT, env: { ...process.env, LAB_DEPLOY: '' } });
  execFileSync(process.execPath, ['--check', MIN]);
  const src = fs.statSync(SRC).size;
  const min = fs.statSync(MIN).size;
  assert.ok(min < src * 0.65, `min ${min} vs source ${src}`);
  assert.match(fs.readFileSync(MIN, 'utf8'), /^\/\* lab comments · .* MIT/);
});

test('the local lab serves the minified widget while it is newer than the source, else the source', { skip: !hasEsbuild && 'npm ci first' }, async () => {
  if (!fs.existsSync(MIN)) execFileSync(process.execPath, [path.join(ROOT, 'scripts/build.mjs')], { cwd: ROOT, env: { ...process.env, LAB_DEPLOY: '' } });
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'labfb-build-')));
  fs.writeFileSync(path.join(dir, 'index.html'), '<h1>hi</h1>');
  const port = String(5100 + Math.floor(Math.random() * 80));
  kids.push(spawn(process.execPath, [path.join(ROOT, 'local.mjs'), '.', '--no-open', '--no-fast', '--port', port], { cwd: dir }));
  const get = async () => {
    for (let i = 0; i < 50; i++) {
      try { return await (await fetch(`http://localhost:${port}/_lab/comments.js`)).text(); } catch { await new Promise((r) => setTimeout(r, 100)); }
    }
  };
  const now = Date.now() / 1000;
  const was = fs.statSync(SRC);
  try {
    fs.utimesSync(SRC, was.atime, now - 60); // source older: the build is served
    fs.utimesSync(MIN, now, now);
    assert.equal(await get(), fs.readFileSync(MIN, 'utf8'));
    fs.utimesSync(SRC, was.atime, now + 60); // source edited after the build: the source is served
    assert.equal(await get(), fs.readFileSync(SRC, 'utf8'));
  } finally {
    fs.utimesSync(SRC, was.atime, was.mtime);
  }
});

test('the local lab compresses text and answers a repeat with 304 not changed', async () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'labfb-etag-')));
  fs.writeFileSync(path.join(dir, 'index.html'), '<h1>hi</h1>' + '<p>words</p>'.repeat(200));
  fs.writeFileSync(path.join(dir, 'pic.svg'), '<svg xmlns="http://www.w3.org/2000/svg">' + '<rect width="1" height="1"/>'.repeat(100) + '</svg>');
  const port = String(5200 + Math.floor(Math.random() * 80));
  kids.push(spawn(process.execPath, [path.join(ROOT, 'local.mjs'), '.', '--no-open', '--no-fast', '--port', port], { cwd: dir }));
  const http = await import('node:http');
  const get = (p, headers = {}) => new Promise((ok, bad) => http.get({ host: '127.0.0.1', port, path: p, headers }, (r) => { r.resume(); r.on('end', () => ok(r)); }).on('error', bad));
  let first;
  for (let i = 0; i < 50 && !first; i++) first = await get('/pic.svg', { 'accept-encoding': 'gzip, br' }).catch(() => new Promise((r) => setTimeout(r, 100)));
  assert.equal(first.headers['content-encoding'], 'br');
  assert.equal(first.headers['cache-control'], 'no-cache');
  assert.ok(first.headers.etag);
  assert.equal((await get('/pic.svg', { 'if-none-match': first.headers.etag })).statusCode, 304);
  assert.equal((await get('/pic.svg', { 'accept-encoding': 'gzip' })).headers['content-encoding'], 'gzip');
  assert.equal((await get('/pic.svg')).headers['content-encoding'], undefined, 'no encoding asked, none sent');
  assert.equal((await get('/', { 'accept-encoding': 'br' })).headers['content-encoding'], 'br', 'pages too');
  fs.writeFileSync(path.join(dir, 'pic.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  assert.equal((await get('/pic.svg', { 'if-none-match': first.headers.etag })).statusCode, 200, 'a changed file is sent fresh');
});
