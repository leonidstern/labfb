import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const LAB = fileURLToPath(new URL('../local.mjs', import.meta.url));
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'labit-two-'));
const PORT = String(8800 + Math.floor(Math.random() * 90));
const B = `http://localhost:${PORT}`;
for (const n of ['index', 'other', 'third']) fs.writeFileSync(path.join(DIR, n + '.html'), `<!doctype html><title>${n}</title><h1>${n}</h1>`);
const env = { ...process.env, LAB_CLOSE_GRACE: '1', LAB_SETTLE_MS: '100', LAB_ACK_MS: '1500', LABIT_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'labit-home-')), LABIT_NO_UPDATE_CHECK: '1' };
const server = spawn(process.execPath, [LAB, '.', '--no-open', '--port', PORT], { cwd: DIR, env });
after(async () => {
  for (const t of tabs) t.destroy();
  // The lab writes to .lab as it shuts down: wait for it to exit before removing the folder.
  if (server.exitCode === null) await new Promise((r) => { server.once('exit', r); server.kill(); });
  fs.rmSync(DIR, { recursive: true, force: true, maxRetries: 5 });
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const key = () => JSON.parse(fs.readFileSync(path.join(DIR, '.lab/server.json'), 'utf8')).agent;

const call = (p, body, who, signal) => new Promise((resolve, reject) => {
  const data = JSON.stringify(body);
  const req = http.request({ host: '127.0.0.1', port: PORT, path: p, method: 'POST', signal, headers: { host: `localhost:${PORT}`, 'content-type': 'application/json', 'content-length': Buffer.byteLength(data), 'x-lab-admin': key(), 'x-lab-agent': '1', 'x-lab-session': encodeURIComponent(JSON.stringify({ id: who, name: who })) } }, (res) => {
    let text = ''; res.on('data', (c) => (text += c));
    res.on('end', () => resolve({ status: res.statusCode, text, delivery: res.headers['x-lab-delivery'] || '' }));
  });
  req.on('error', reject); req.end(data);
});
const wait = (who, o = {}) => call('/_lab/wait', { timeout: 3, pages: null, ...o }, who);
const post = (text, page = '/index') => fetch(B + '/_lab/api/comments', { method: 'POST', headers: { 'content-type': 'application/json', origin: B }, body: JSON.stringify({ page, name: 'Leo', text, anchor: { selector: 'h1', x: 0.1, y: 0.5, docX: 0.1, docY: 20, width: 1000, element: '<h1>' } }) }).then((r) => r.json());
const list = (page = '/index') => fetch(`${B}/_lab/api/comments?page=${page}`, { headers: { origin: B } }).then((r) => r.json());
const handedAt = async (id, page) => ((await list(page)).comments || []).find((c) => c.id === id)?.handedAt;
const drain = async (who) => { for (let i = 0; i < 3; i++) { const r = await wait(who, { timeout: 1, ack: true }); if (r.delivery) await call('/_lab/ack', { id: r.delivery }, who); } };

const tabs = [];
test('start', async () => { for (let i = 0; i < 80; i++) { try { await fetch(B + '/'); return; } catch { await sleep(100); } } assert.fail('no start'); });
test('open a page', async () => { const req = http.get({ host: '127.0.0.1', port: PORT, path: '/_lab/live?tab=t1', headers: { host: `localhost:${PORT}` } }, (r) => r.resume()); tabs.push(req); await sleep(300); });

test('a second session on the same pages: the first is told to leave them, the second gets a heads-up with its pins', async () => {
  const first = wait('sess-a', { timeout: 5, pages: ['/index'] });
  await sleep(200);
  const second = wait('sess-b', { timeout: 5, pages: ['/index'] });
  const a = await first;
  assert.equal(a.status, 409, 'the first wait ended by the second');
  await post('a pin for whoever listens');
  const b = await second;
  assert.equal(b.status, 200);
  assert.match(b.text, /^Heads up: Claude \(sess-a\) also listened on \/index just now\. Two sessions on one page/);
  assert.match(b.text, /a pin for whoever listens/);
});

test('the same session listening again: no heads-up', async () => {
  const again = wait('sess-b', { timeout: 5, pages: ['/index'] });
  await sleep(200);
  await post('second pin');
  const r = await again;
  assert.doesNotMatch(r.text, /Heads up/);
  assert.match(r.text, /second pin/);
});

test('different pages: no heads-up', async () => {
  const w = wait('sess-c', { timeout: 5, pages: ['/other'] });
  await sleep(200);
  await post('on other', '/other');
  const r = await w;
  assert.doesNotMatch(r.text, /Heads up/);
});
