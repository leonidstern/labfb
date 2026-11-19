// The MCP tool `board`: listed only where the flag is on; it does what the command line does.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const LAB = fileURLToPath(new URL('../local.mjs', import.meta.url));
const mk = (flags) => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'labit-bmcp-')));
  fs.writeFileSync(path.join(dir, 'labit.json'), JSON.stringify({ flags }));
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>t</title><h1>Hello</h1>');
  return dir;
};
const ON = mk({ board: true });
const OFF = mk({});
const port = 5990 + Math.floor(Math.random() * 40);
const procs = [];
const client = (dir) => {
  const p = spawn(process.execPath, [LAB, 'mcp'], { cwd: dir, env: process.env });
  procs.push(p);
  let buf = '';
  const waiting = new Map();
  p.stdout.on('data', (d) => {
    buf += d;
    for (let i = buf.indexOf('\n'); i >= 0; i = buf.indexOf('\n')) {
      const m = JSON.parse(buf.slice(0, i));
      buf = buf.slice(i + 1);
      waiting.get(m.id)?.(m);
    }
  });
  let n = 1;
  return (method, params) => new Promise((done) => {
    const id = n++;
    waiting.set(id, done);
    p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
};
procs.push(spawn(process.execPath, [LAB, '.', '--no-open', '--port', String(port)], { cwd: ON, env: process.env }));
after(() => {
  procs.forEach((p) => p.kill());
  for (const d of [ON, OFF]) fs.rmSync(d, { recursive: true, force: true });
});
const ready = async () => {
  for (let i = 0; i < 80; i++) {
    try {
      return await fetch(`http://localhost:${port}/_lab/state`);
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
};

test('flag off: no board tool, no board sentence', async () => {
  const ask = client(OFF);
  const init = await ask('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
  assert.doesNotMatch(init.result.instructions, /board/);
  assert.deepEqual((await ask('tools/list')).result.tools.map((t) => t.name), ['comments', 'reply', 'pin', 'wait']);
  const r = await ask('tools/call', { name: 'board', arguments: { action: 'list' } });
  assert.ok(r.error || r.result?.isError);
});

test('flag on: board is listed, makes, lists and picks like the command line, and refuses what it does not take', async () => {
  await ready();
  const ask = client(ON);
  const init = await ask('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
  assert.match(init.result.instructions, /Options, widths and flows go on a board/);
  const names = (await ask('tools/list')).result.tools.map((t) => t.name);
  assert.deepEqual(names, ['comments', 'reply', 'pin', 'wait', 'board']);
  const made = await ask('tools/call', { name: 'board', arguments: { action: 'new', topic: 'Hero', of: '/index', variants: 3 } });
  assert.ok(!made.result.isError, made.result.content[0].text);
  assert.match(made.result.content[0].text, /^# Board hero · Hero\nurl: /);
  assert.ok(fs.existsSync(path.join(ON, '.lab/boards/hero/c.html')));
  assert.match((await ask('tools/call', { name: 'board', arguments: { action: 'list' } })).result.content[0].text, /^hero {2}3 frames/);
  const pick = await ask('tools/call', { name: 'board', arguments: { action: 'pick', name: 'hero', frames: ['b'] } });
  assert.match(pick.result.content[0].text, /Picked b\. Archived a, c/);
  const bad = await ask('tools/call', { name: 'board', arguments: { action: 'new', topic: 'x', x: 1, y: 2 } });
  assert.equal(bad.result.isError, true);
  assert.match(bad.result.content[0].text, /Unknown argument x/);
  assert.equal((await ask('tools/call', { name: 'board', arguments: { action: 'sort' } })).result.isError, true);
});
