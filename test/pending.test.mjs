import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const LAB = fileURLToPath(new URL('../local.mjs', import.meta.url));
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'labit-pending-'));
const PORT = String(8990 + Math.floor(Math.random() * 9));
const B = `http://localhost:${PORT}`;
for (const n of ['index', 'other', 'third']) fs.writeFileSync(path.join(DIR, n + '.html'), `<!doctype html><title>${n}</title><h1>${n}</h1>`);
const env = { ...process.env, LAB_CLOSE_GRACE: '1', LAB_SETTLE_MS: '100', LAB_ACK_MS: '1500', LABIT_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'labit-home-')), LABIT_NO_UPDATE_CHECK: '1' };
const server = spawn(process.execPath, [LAB, '.', '--no-open', '--port', PORT], { cwd: DIR, env });
after(() => { for (const t of tabs) t.destroy(); server.kill(); fs.rmSync(DIR, { recursive: true, force: true }); });
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
const pending = () => fetch(B + '/_lab/pending', { headers: { 'x-lab-admin': key(), 'x-lab-agent': '1' } });
test('start', async () => { for (let i = 0; i < 80; i++) { try { await fetch(B + '/'); return; } catch { await sleep(100); } } assert.fail('no start'); });

// The labit plugin's wake (hooks/wake.ts) asks /_lab/pending while its session is idle.
test('pending: the agent key only; it says what nobody was handed, who listened last, and takes nothing', async () => {
  assert.equal((await fetch(B + '/_lab/pending')).status, 403);
  let p = await (await pending()).json();
  assert.equal(p.fresh, 0);
  await post('wake me', '/other');
  p = await (await pending()).json();
  assert.equal(p.fresh, 1);
  assert.deepEqual(p.pages, ['/other']);
  assert.equal(p.listening, false);
  const again = await (await pending()).json();
  assert.equal(again.key, p.key, 'a look takes nothing: the same pins, the same key');
  const a = await wait('w1', { ack: true });
  assert.match(a.text, /wake me/);
  await call('/_lab/ack', { id: a.delivery }, 'w1');
  p = await (await pending()).json();
  assert.equal(p.fresh, 0, 'handed over: nothing pending');
  assert.equal(p.last, 'w1', 'the session that listened last');
  assert.ok(p.cmd && p.dir && p.url);
});
