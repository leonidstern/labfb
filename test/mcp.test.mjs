// `labfb mcp`: an MCP client starts it, lists its tools, reads comments, replies, and waits for the next pin.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const LAB = fileURLToPath(new URL('../local.mjs', import.meta.url));
const DIR = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'labfb-mcp-')));
const env = { ...process.env, LABFB_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'labfb-home-')) };
const PORT = String(5900 + Math.floor(Math.random() * 90));
const B = `http://localhost:${PORT}`;
fs.writeFileSync(path.join(DIR, 'index.html'), '<!doctype html><title>t</title><h1 id="t">Hello</h1>');
const server = spawn(process.execPath, [LAB, '.', '--no-open', '--no-fast', '--port', PORT], { cwd: DIR, env });
const mcp = spawn(process.execPath, [LAB, 'mcp'], { cwd: DIR, env });
after(() => {
  mcp.kill();
  server.kill();
  fs.rmSync(DIR, { recursive: true, force: true });
});

let out = '';
const waiting = new Map();
mcp.stdout.on('data', (d) => {
  out += d;
  for (let i = out.indexOf('\n'); i >= 0; i = out.indexOf('\n')) {
    const m = JSON.parse(out.slice(0, i));
    out = out.slice(i + 1);
    waiting.get(m.id)?.(m);
  }
});
let next = 1;
const ask = (method, params) =>
  new Promise((done) => {
    const id = next++;
    waiting.set(id, done);
    mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
const up = async () => {
  for (let i = 0; i < 50; i++) {
    try {
      return await fetch(B + '/');
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
};
const pin = async (text) =>
  (await (await fetch(B + '/_lab/api/comments', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: B },
    body: JSON.stringify({ page: '/index', name: 'Leo', text, anchor: { selector: '#t', x: 0.1, y: 0.5, docX: 0.1, docY: 20, width: 1000, element: '<h1 id="t">' } }),
  })).json()).comment.id;

test('it starts like an MCP server and lists comments, reply and wait', async () => {
  await up();
  const init = await ask('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
  assert.equal(init.result.serverInfo.name, 'labfb');
  mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  const { result } = await ask('tools/list');
  assert.deepEqual(result.tools.map((t) => t.name), ['comments', 'reply', 'wait']);
});

test('comments shows a pin, reply answers on it', async () => {
  const id = await pin('make the title red');
  await new Promise((r) => setTimeout(r, 300));
  const list = await ask('tools/call', { name: 'comments', arguments: {} });
  assert.match(list.result.content[0].text, /make the title red/);
  const r = await ask('tools/call', { name: 'reply', arguments: { id, text: 'Done: red', resolve: true } });
  assert.ok(!r.result.isError, r.result.content[0].text);
  const all = await (await fetch(B + '/_lab/api/comments?page=/index')).json();
  assert.ok((all.comments || all).some((c) => c.parent === id && c.text === 'Done: red'));
});

test('wait returns the next pin', async () => {
  const waited = ask('tools/call', { name: 'wait', arguments: { seconds: 20 } });
  await new Promise((r) => setTimeout(r, 600));
  await pin('make it bigger');
  const w = await waited;
  assert.match(w.result.content[0].text, /make it bigger/);
});
