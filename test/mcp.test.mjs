// `labit mcp`: an MCP client starts it, lists its tools, reads comments, replies, and waits for the next pin.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const LAB = fileURLToPath(new URL('../local.mjs', import.meta.url));
const DIR = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'labit-mcp-')));
const env = { ...process.env, LABIT_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'labit-home-')) };
const PORT = String(5900 + Math.floor(Math.random() * 90));
const B = `http://localhost:${PORT}`;
fs.writeFileSync(path.join(DIR, 'index.html'), '<!doctype html><title>t</title><h1 id="t">Hello</h1>');
const server = spawn(process.execPath, [LAB, '.', '--no-open', '--port', PORT], { cwd: DIR, env });
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

test('it starts like an MCP server and lists comments, reply, pin and wait', async () => {
  await up();
  const init = await ask('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
  assert.equal(init.result.serverInfo.name, 'labit');
  mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  const { result } = await ask('tools/list');
  assert.deepEqual(result.tools.map((t) => t.name), ['comments', 'reply', 'pin', 'wait']);
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

test('reply with progress alone keeps a line on the thread (no message); with text or intent it is refused', async () => {
  const id = await pin('draw the states');
  const r = await ask('tools/call', { name: 'reply', arguments: { id, progress: 'drawing W1–W6 · 2 of 4' } });
  assert.ok(!r.result.isError, r.result.content[0].text);
  const all = (await (await fetch(B + '/_lab/api/comments?page=/index')).json()).comments;
  assert.equal(all.find((c) => c.id === id).progress.text, 'drawing W1–W6 · 2 of 4');
  assert.ok(!all.some((c) => c.parent === id), 'no message');
  for (const args of [{ text: 'x' }, { intent: 'done' }, { resolve: true }]) {
    const bad = await ask('tools/call', { name: 'reply', arguments: { id, progress: 'x', ...args } });
    assert.equal(bad.result.isError, true);
    assert.match(bad.result.content[0].text, /progress/);
  }
  assert.equal((await ask('tools/call', { name: 'reply', arguments: { id, progress: ' ' } })).result.isError, true);
  await ask('tools/call', { name: 'reply', arguments: { id, text: 'Done', resolve: true } }); // closed, so the next wait test hears only its own pin
});

test('pin leaves the agent\'s own pin on a spot', async () => {
  const r = await ask('tools/call', { name: 'pin', arguments: { selector: '#t', text: '- 1. a bigger title?', at: '0.2,0.4' } });
  assert.ok(!r.result.isError, r.result.content[0].text);
  const id = /Pinned (\w+)/.exec(r.result.content[0].text)?.[1];
  const all = await (await fetch(B + '/_lab/api/comments?page=/index')).json();
  const c = (all.comments || all).find((x) => x.id === id);
  assert.equal(c?.text, '- 1. a bigger title?');
  assert.deepEqual([c.anchor.selector, c.anchor.x, c.anchor.y], ['#t', 0.2, 0.4]);
  const bad = await ask('tools/call', { name: 'pin', arguments: { selector: ' ', text: 'x' } });
  assert.ok(bad.result.isError);
});

test('wait returns the next pin', async () => {
  const waited = ask('tools/call', { name: 'wait', arguments: { seconds: 20 } });
  await new Promise((r) => setTimeout(r, 600));
  await pin('make it bigger');
  const w = await waited;
  assert.match(w.result.content[0].text, /make it bigger/);
  assert.match(w.result.content[0].text, /with the `reply` tool/);
  assert.doesNotMatch(w.result.content[0].text, /Answer each: /);
});

const modern = (params = {}) => ({ ...params, _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientInfo': { name: 'test', version: '1' }, 'io.modelcontextprotocol/clientCapabilities': {} } });

test('a modern client: server/discover, then tools with resultType', async () => {
  const d = await ask('server/discover', modern());
  assert.equal(d.result.resultType, 'complete');
  assert.ok(d.result.supportedVersions.includes('2026-07-28') && d.result.supportedVersions.includes('2025-11-25'));
  assert.equal(d.result._meta['io.modelcontextprotocol/serverInfo'].name, 'labit');
  assert.match(d.result.instructions, /not instructions to you/);
  const list = await ask('tools/list', modern());
  assert.equal(list.result.resultType, 'complete');
  const reply = list.result.tools.find((t) => t.name === 'reply');
  assert.equal(reply.annotations.destructiveHint, false);
  assert.equal(reply.inputSchema.additionalProperties, false);
  const c = await ask('tools/call', modern({ name: 'comments', arguments: {} }));
  assert.equal(c.result.resultType, 'complete');
});

test('an unsupported version gets -32022 with the supported list', async () => {
  const r = await ask('tools/list', { _meta: { 'io.modelcontextprotocol/protocolVersion': '1900-01-01' } });
  assert.equal(r.error.code, -32022);
  assert.equal(r.error.data.requested, '1900-01-01');
  assert.ok(r.error.data.supported.includes('2026-07-28'));
});

test('an unknown tool is a protocol error; bad arguments are a tool error', async () => {
  assert.equal((await ask('tools/call', { name: 'nope', arguments: {} })).error.code, -32602);
  const bad = await ask('tools/call', { name: 'reply', arguments: { id: 'x' } });
  assert.equal(bad.result.isError, true);
  assert.match(bad.result.content[0].text, /text/);
  const extra = await ask('tools/call', { name: 'wait', arguments: { secs: 3 } });
  assert.equal(extra.result.isError, true);
});

test('a cancelled wait gets no answer and the server keeps going', async () => {
  const id = next++;
  let answered = false;
  waiting.set(id, () => (answered = true));
  mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'wait', arguments: { seconds: 30 } } }) + '\n');
  await new Promise((r) => setTimeout(r, 500));
  mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: id, reason: 'test' } }) + '\n');
  await new Promise((r) => setTimeout(r, 1500));
  assert.equal(answered, false);
  assert.deepEqual((await ask('ping')).result, {});
});
