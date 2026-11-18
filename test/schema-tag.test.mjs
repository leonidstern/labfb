// The schema version is in the widget's tag (every way a page gets the widget) and in the stream/state.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { VERSION } from '../lib/schema.mjs';

const LAB = fileURLToPath(new URL('../local.mjs', import.meta.url));
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'labit-schema-'));
const PORT = String(9100 + Math.floor(Math.random() * 100));
const UP = String(9300 + Math.floor(Math.random() * 100));
const B = `http://localhost:${PORT}`;
fs.writeFileSync(path.join(DIR, 'index.html'), '<!doctype html><title>t</title><h1>Hi</h1>');
fs.writeFileSync(path.join(DIR, 'own.html'), '<!doctype html><title>o</title><body><h1>own</h1><script src="/_lab/comments.js" defer></script></body>');
fs.writeFileSync(path.join(DIR, 'ownq.html'), '<!doctype html><title>o</title><body><h1>own</h1><script src="/_lab/comments.js?v=3" defer></script></body>');
fs.writeFileSync(path.join(DIR, 'nobody.html'), '<h1>no body tag</h1>');
fs.mkdirSync(path.join(DIR, 'sub'));
fs.writeFileSync(path.join(DIR, 'sub', 'a.html'), '<!doctype html><title>a</title><p>a</p>');
const env = { ...process.env, LAB_CLOSE_GRACE: '1', LABIT_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'labit-home-')), LABIT_NO_UPDATE_CHECK: '1' };
const procs = [];
const upstream = http.createServer((q, r) => r.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><html><body><h1>dev</h1></body></html>')).listen(Number(UP));
const server = spawn(process.execPath, [LAB, '.', '--no-open', '--port', PORT], { cwd: DIR, env });
const proxied = String(Number(PORT) + 1000);
const DIR2 = fs.mkdtempSync(path.join(os.tmpdir(), 'labit-schema2-'));
const server2 = spawn(process.execPath, [LAB, '.', '--no-open', '--port', proxied, '--proxy', UP], { cwd: DIR2, env: { ...env, LABIT_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'labit-home-')) } });
server2.stderr.on('data', (d) => console.log('S2', String(d)));
server2.stdout.on('data', (d) => console.log('S2', String(d)));
procs.push(server, server2);
after(() => { procs.forEach((p) => p.kill()); upstream.close(); fs.rmSync(DIR, { recursive: true, force: true }); });
const up = async (base) => { for (let i = 0; i < 80; i++) { try { await fetch(base + '/_lab/state'); return; } catch { await new Promise((r) => setTimeout(r, 100)); } } throw new Error('lab did not start'); };
const tagOf = (html) => [...html.matchAll(/<script\b[^>]*\/_lab\/comments\.js[^>]*>/g)].map((m) => m[0]);
const sse = (base) => new Promise((resolve) => {
  const u = new URL(base + '/_lab/live');
  const req = http.get({ host: '127.0.0.1', port: u.port, path: u.pathname, headers: { host: u.host } }, (res) => {
    res.setEncoding('utf8');
    res.once('data', (d) => { req.destroy(); resolve(JSON.parse(d.split('\n').find((l) => l.startsWith('data: ')).slice(6))); });
  });
});

test('plain pages, nested pages, pages with their own tag, pages without body carry data-schema once', async () => {
  await up(B);
  for (const p of ['/', '/index.html', '/own', '/nobody', '/sub/a']) {
    const t = tagOf(await (await fetch(B + p)).text());
    assert.equal(t.length, 1, `${p}: one widget tag, got ${t.length}`);
    assert.match(t[0], new RegExp(`data-schema="${VERSION}"`), p);
  }
});

test('a page that loads the widget with a query string', async () => {
  const t = tagOf(await (await fetch(B + '/ownq')).text());
  console.log('ownq tags:', t);
  assert.equal(t.filter((x) => /data-schema/.test(x)).length, 1);
});

test('state and stream carry the schema', async () => {
  const s = await (await fetch(B + '/_lab/state')).json();
  assert.equal(s.schema, VERSION);
  const l = await sse(B);
  assert.equal(l.schema, VERSION);
  assert.equal(l.widget, s.widget);
});

test('listing page', async () => {
  const html = await (await fetch(B + '/sub/')).text().catch(() => '');
  console.log('listing has widget tag:', /comments\.js/.test(html));
});

test('dev-server proxy', async () => {
  await up(`http://localhost:${proxied}`);
  const t = tagOf(await (await fetch(`http://localhost:${proxied}/`)).text());
  assert.equal(t.length, 1);
  assert.match(t[0], new RegExp(`data-schema="${VERSION}"`));
});
