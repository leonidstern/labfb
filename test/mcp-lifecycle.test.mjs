// `labit mcp` against the MCP spec's lifecycle rules (2025-11-25 and 2026-07-28, stdio): what happens to work in
// flight when the client closes stdin, sends SIGTERM or cancels; that progress stops once a request is answered; that
// a cancel for a finished request is ignored; that the server sends no request before the client's `initialized`;
// and that a batch (an array) gets an error, not silence.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const LAB = fileURLToPath(new URL('../local.mjs', import.meta.url));
const DIR = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'labit-mcplife-')));
const env = { ...process.env, LABIT_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'labit-home-')), LABIT_NO_UPDATE_CHECK: '1' };
const PORT = String(6100 + Math.floor(Math.random() * 200));
const B = `http://localhost:${PORT}`;
fs.writeFileSync(path.join(DIR, 'index.html'), '<!doctype html><title>t</title><h1 id="t">Hello</h1>');
const lab = spawn(process.execPath, [LAB, '.', '--no-open', '--port', PORT], { cwd: DIR, env });
const servers = new Set();
after(() => {
  for (const s of servers) s.proc.kill('SIGKILL');
  lab.kill();
  fs.rmSync(DIR, { recursive: true, force: true });
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (ok, ms, what) => {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(50)) if (await ok()) return;
  assert.fail(`timed out waiting for ${what}`);
};
const mode = async () => {
  const s = await (await fetch(B + '/_lab/state')).json();
  return s.session ? s.mode : 'away';
};

// One MCP server process: every message it writes, and a way to write to it.
const start = () => {
  const proc = spawn(process.execPath, [LAB, 'mcp'], { cwd: DIR, env });
  const s = { proc, msgs: [], exited: false, write: (m) => proc.stdin.write((typeof m === 'string' ? m : JSON.stringify({ jsonrpc: '2.0', ...m })) + '\n') };
  let buf = '';
  proc.stdout.on('data', (d) => {
    buf += d;
    for (let i = buf.indexOf('\n'); i >= 0; i = buf.indexOf('\n')) {
      s.msgs.push(JSON.parse(buf.slice(0, i)));
      buf = buf.slice(i + 1);
    }
  });
  proc.on('exit', () => (s.exited = true));
  s.answer = (id, ms = 5000) => until(() => s.msgs.some((m) => m.id === id && !m.method), ms, `an answer to ${id}`).then(() => s.msgs.find((m) => m.id === id && !m.method));
  servers.add(s);
  return s;
};

test('the lab starts', async () => {
  await until(async () => (await fetch(B + '/').catch(() => null))?.ok, 8000, 'the lab');
});

for (const [how, end] of [
  ['closes stdin', (s) => s.proc.stdin.end()],
  ['sends SIGTERM', (s) => s.proc.kill('SIGTERM')],
]) {
  test(`a client that ${how} during a wait: the server exits and the page stops showing an agent at once`, async () => {
    await until(async () => (await mode()) === 'away', 3000, 'no agent listening before the test');
    const s = start();
    s.write({ id: 1, method: 'tools/call', params: { name: 'wait', arguments: { seconds: 60 } } });
    await until(async () => (await mode()) === 'listening', 6000, 'the page to show the agent listening');
    const t0 = Date.now();
    end(s);
    await until(() => s.exited, 3000, 'the server to exit');
    await until(async () => (await mode()) === 'away', 3000, `"no agent listening" (${Date.now() - t0} ms so far)`);
  });
}

test('a cancelled wait frees the page at once (no agent listening)', async () => {
  await until(async () => (await mode()) === 'away', 3000, 'no agent listening before the test');
  const s = start();
  s.write({ id: 1, method: 'tools/call', params: { name: 'wait', arguments: { seconds: 60 } } });
  await until(async () => (await mode()) === 'listening', 6000, 'listening');
  s.write({ method: 'notifications/cancelled', params: { requestId: 1, reason: 'test' } });
  await until(async () => (await mode()) === 'away', 3000, 'away after the cancel');
  await sleep(300);
  assert.ok(!s.msgs.some((m) => m.id === 1), 'no answer to the cancelled request');
  s.proc.stdin.end();
});

test('a cancel for a request already answered is ignored: the same id used again still gets its answer', async () => {
  const s = start();
  s.write({ id: 7, method: 'ping' });
  await s.answer(7);
  s.write({ method: 'notifications/cancelled', params: { requestId: 7, reason: 'late' } });
  s.msgs.length = 0;
  s.write({ id: 7, method: 'ping' });
  const again = await s.answer(7, 2000).catch(() => null);
  assert.ok(again?.result, 'answered');
  s.proc.stdin.end();
});

test('a wait refused for a bad argument sends no progress after its answer', { timeout: 40000 }, async () => {
  const s = start();
  s.write({ id: 1, method: 'tools/call', params: { name: 'wait', arguments: { seconds: 30, dir: 5 }, _meta: { progressToken: 'p1' } } });
  const r = await s.answer(1);
  assert.equal(r.result.isError, true);
  await sleep(21500); // past the first 20 s progress tick
  assert.deepEqual(s.msgs.filter((m) => m.method === 'notifications/progress').map((m) => m.params.progressToken), [], 'no progress for an answered request');
  s.proc.stdin.end();
});

test('no request to the client before its `initialized`; roots are asked for after it', async () => {
  const s = start();
  s.write({ id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: { roots: {} }, clientInfo: { name: 'test', version: '1' } } });
  await s.answer(1);
  await sleep(400);
  assert.ok(!s.msgs.some((m) => m.method === 'roots/list'), 'roots/list sent before initialized');
  s.write({ method: 'notifications/initialized' });
  await until(() => s.msgs.some((m) => m.method === 'roots/list'), 2000, 'roots/list after initialized');
  const ask = s.msgs.find((m) => m.method === 'roots/list');
  s.write({ id: ask.id, result: { roots: [{ uri: pathToFileURL(DIR).href }] } });
  s.write({ id: 2, method: 'tools/call', params: { name: 'comments', arguments: {} } });
  assert.notEqual((await s.answer(2)).result.isError, true, 'the root is the project');
  s.proc.stdin.end();
});

test('a batch (a JSON array) gets an Invalid Request error, not silence', async () => {
  const s = start();
  s.write('[{"jsonrpc":"2.0","id":1,"method":"ping"}]');
  await until(() => s.msgs.length > 0, 2000, 'any answer');
  assert.equal(s.msgs[0].error?.code, -32600);
  s.proc.stdin.end();
});
