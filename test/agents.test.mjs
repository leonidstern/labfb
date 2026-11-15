// Any agent: labfb tells which one runs wait / reply, signs and labels with its name, gives Codex and Amp their way
// back to the session, runs the quick step with that agent's own tool, and hints when Codex's sandbox blocks it.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const LAB = fileURLToPath(new URL('../local.mjs', import.meta.url));
// No agent of our own: these tests run inside agents too.
const AGENT_VARS = /^(CLAUDE|CODEX|CURSOR|AMP_|ANTIGRAVITY|GEMINI|OPENCODE|LAB_AGENT|LAB_FAST|AGENT$|AI_AGENT$)/;
const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !AGENT_VARS.test(k)));
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'labfb-home-'));
const kids = [];
const dirs = [];
after(() => {
  kids.forEach((k) => k.kill());
  dirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true }));
});
const tmp = (name) => {
  const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `labfb-${name}-`)));
  dirs.push(d);
  return d;
};
const site = (name) => {
  const d = tmp(name);
  fs.writeFileSync(path.join(d, 'index.html'), '<!doctype html><title>t</title><h1 id="t">Hello</h1>');
  return d;
};
let port = 6100 + Math.floor(Math.random() * 300);
async function lab(dir, args = ['--no-fast'], env = {}) {
  const p = port++;
  const child = spawn(process.execPath, [LAB, '.', '--no-open', '--port', String(p), ...args], { cwd: dir, env: { ...clean, LABFB_HOME: home, ...env } });
  kids.push(child);
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  const B = `http://localhost:${p}`;
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(B + '/');
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  return { B, log: () => log };
}
const pin = async (B, text) =>
  (await (await fetch(B + '/_lab/api/comments', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: B },
    body: JSON.stringify({ page: '/index', name: 'Leo', text, anchor: { selector: '#t', x: 0.1, y: 0.5, docX: 0.1, docY: 20, width: 1000, element: '<h1 id="t">' } }),
  })).json()).comment.id;
const replies = async (B, id, wantOne = true) => {
  for (let i = 0; i < (wantOne ? 60 : 25); i++) {
    const list = (await (await fetch(B + '/_lab/api/comments?page=/index')).json()).comments;
    const r = list.filter((c) => c.parent === id);
    if (r.length || !wantOne) return r;
    await new Promise((res) => setTimeout(res, 100));
  }
  return [];
};
const cli = (dir, args, env) =>
  new Promise((resolve) => execFile(process.execPath, [LAB, ...args], { cwd: dir, env: { ...clean, LABFB_HOME: home, ...env } }, (e, out, err) => resolve(out + err)));

test('replies are signed by the agent that runs reply', async () => {
  const dir = site('sign');
  const { B } = await lab(dir);
  const cases = [
    [{}, 'Claude'],
    [{ CLAUDECODE: '1' }, 'Claude'],
    [{ CODEX_THREAD_ID: 'abc12345-6789' }, 'Codex · session abc12345'],
    [{ AMP_CURRENT_THREAD_ID: 'T-1', CLAUDECODE: '1' }, 'Amp · session T-1'], // Amp also sets CLAUDECODE
    [{ CURSOR_AGENT: '1' }, 'Cursor'],
    [{ OPENCODE_CLIENT: 'cli' }, 'opencode'],
    [{ ANTIGRAVITY_AGENT: '1' }, 'Antigravity'],
    [{ LAB_AGENT: 'copilot' }, 'Copilot'],
    [{ LAB_AGENT: 'My Bot' }, 'My Bot'],
    [{ AGENT: 'amp' }, 'Amp'],
    [{ CODEX_THREAD_ID: 'abc', AI_AGENT: 'claude-code_2_agent' }, 'Codex · session abc'], // a Codex run inside a Claude Code shell
    [{ AGENT: 'something-else' }, 'Claude'], // AGENT only counts when it names an agent labfb knows
    [{ CODEX_THREAD_ID: 'abc', LAB_AGENT_NAME: 'Robot' }, 'Robot · session abc'],
  ];
  for (const [env, name] of cases) {
    const id = await pin(B, 'hello');
    await cli(dir, ['reply', id, 'Done: ok'], env);
    const [r] = await replies(B, id);
    assert.equal(r?.name, name, JSON.stringify(env));
  }
});

test('a listening Codex session is shown by name, with its resume command', async () => {
  const dir = site('listen');
  await lab(dir);
  const wait = spawn(process.execPath, [LAB, 'wait', '--timeout', '30'], { cwd: dir, env: { ...clean, LABFB_HOME: home, CODEX_THREAD_ID: '0199a-codex' } });
  kids.push(wait);
  let s = null;
  for (let i = 0; i < 50 && !s; i++) {
    await new Promise((r) => setTimeout(r, 100));
    s = JSON.parse(fs.readFileSync(path.join(dir, '.lab/server.json'), 'utf8')).session;
  }
  assert.equal(s.agent, 'Codex');
  assert.equal(s.kind, 'codex');
  assert.equal(s.resume, 'codex resume 0199a-codex');
  wait.kill();
});

test("Codex's sandbox: a blocked call says so and how to get around it", async () => {
  const dir = tmp('sandbox');
  fs.mkdirSync(path.join(dir, '.lab'));
  fs.writeFileSync(path.join(dir, '.lab/server.json'), JSON.stringify({ port: 9, token: 'x' }));
  const out = await cli(dir, ['wait', '--timeout', '5'], { CODEX_SANDBOX_NETWORK_DISABLED: '1', CODEX_THREAD_ID: 't' });
  assert.match(out, /Codex's sandbox blocks/);
  assert.match(out, /codex mcp add labfb/);
  const plain = await cli(dir, ['wait', '--timeout', '5'], {});
  assert.match(plain, /isn't running/);
});

test('the quick step uses an installed agent tool (codex), signs with its name, and never gets "allow all" flags', { skip: process.platform === 'win32' }, async () => {
  const dir = site('quick');
  const bin = tmp('bin');
  // A stand-in codex: records its arguments, edits a file, answers Done.
  fs.writeFileSync(path.join(bin, 'codex'), `#!/bin/sh\necho "$@" > "${bin}/args"\ncat >/dev/null\necho changed >> note.txt\necho "Done: changed it"\n`, { mode: 0o755 });
  const { B, log } = await lab(dir, [], { PATH: `${bin}:/usr/bin:/bin` });
  assert.match(log(), /quick model on \(codex\)/);
  const id = await pin(B, 'make the title red');
  const [r] = await replies(B, id);
  assert.equal(r?.name, 'Codex · quick');
  assert.equal(r?.text, 'Done: changed it');
  const args = fs.readFileSync(path.join(bin, 'args'), 'utf8');
  assert.match(args, /^exec .*-s workspace-write/);
  assert.doesNotMatch(args, /danger|bypass|yolo|--force/);
});

test('a "Done" that changed no file counts as a pass: no reply, the session hears it', { skip: process.platform === 'win32' }, async () => {
  const dir = site('nochange');
  const bin = tmp('bin');
  fs.writeFileSync(path.join(bin, 'codex'), '#!/bin/sh\ncat >/dev/null\necho "Done: changed it"\n', { mode: 0o755 });
  const { B, log } = await lab(dir, [], { PATH: `${bin}:/usr/bin:/bin` });
  const id = await pin(B, 'make the title red');
  await new Promise((r) => setTimeout(r, 1500));
  assert.deepEqual(await replies(B, id, false), []);
  assert.match(log(), /said done but changed no file/);
});

test('a Claude model named in a pin needs the claude command: with only codex installed, a note says so and the session takes it', { skip: process.platform === 'win32' }, async () => {
  const dir = site('named');
  const bin = tmp('bin');
  fs.writeFileSync(path.join(bin, 'codex'), '#!/bin/sh\ncat >/dev/null\necho x >> note.txt\necho "Done: codex did it"\n', { mode: 0o755 });
  const { B } = await lab(dir, [], { PATH: `${bin}:/usr/bin:/bin` });
  const [r] = await replies(B, await pin(B, 'make the title red, use opus'));
  assert.equal(r?.name, 'labfb'); // not done by codex: a note, and the session takes it
  assert.match(r?.text, /claude isn't installed/);
});

test('MCP: the client\'s name signs replies when the agent\'s own variables are missing', async () => {
  const dir = site('mcp');
  const { B } = await lab(dir);
  const id = await pin(B, 'hello');
  const mcp = spawn(process.execPath, [LAB, 'mcp'], { cwd: dir, env: { ...clean, LABFB_HOME: home } });
  kids.push(mcp);
  let buf = '';
  const answers = new Map();
  mcp.stdout.on('data', (d) => {
    buf += d;
    for (let i = buf.indexOf('\n'); i >= 0; i = buf.indexOf('\n')) {
      const m = JSON.parse(buf.slice(0, i));
      buf = buf.slice(i + 1);
      answers.get(m.id)?.(m);
    }
  });
  let n = 1;
  const ask = (method, params) => new Promise((done) => { const k = n++; answers.set(k, done); mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: k, method, params }) + '\n'); });
  await ask('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'codex-mcp-client', version: '1' } });
  const list = await ask('tools/list', {});
  assert.match(list.result.tools.find((t) => t.name === 'wait').description, /default 50/);
  await ask('tools/call', { name: 'reply', arguments: { id, text: 'Done: via MCP' } });
  const [r] = await replies(B, id);
  assert.equal(r?.name, 'Codex');
  mcp.kill();
});

// ---------- a pin names the tool or the model ----------
test('pins name a tool or a model: it gets them; "@<listening agent>" goes to the session; ordinary words stay put', async () => {
  const dir = site('route');
  // LAB_FAST_CMD stands in for every tool: it echoes what it was asked to use.
  const { B } = await lab(dir, [], { LAB_FAST_CMD: 'cat >/dev/null; echo x >> note.txt; echo "Done: tool=$LAB_TOOL model=$LAB_MODEL"' });
  const cases = [
    ['make it red, use fable', 'Done: tool=claude model=fable'],
    ['use gpt-5-codex for this', 'Done: tool=codex model=gpt-5-codex'],
    ['@codex make it red', 'Done: tool=codex model='],
    ['gemini: tighten this', 'Done: tool=antigravity model='],
    ['use gemini-2.5-pro here', 'Done: tool=antigravity model=gemini-2.5-pro'],
    ['@cursor make it red', 'Done: tool=cursor model='],
    ['model:o3 rewrite this', 'Done: tool= model=o3'],
    ['use cursor: pointer here', 'Done: tool= model=haiku'], // a CSS request, not Cursor
    ['make the title green', 'Done: tool= model=haiku'],
  ];
  for (const [text, want] of cases) {
    const [r] = await replies(B, await pin(B, text));
    assert.equal(r?.text, want, text);
  }
  // Nobody listening counts as Claude, as before: "@claude" goes to the session.
  await new Promise((r) => setTimeout(r, 300));
  assert.deepEqual(await replies(B, await pin(B, '@claude make it red'), false), []);
});

test('a pin naming a tool that is not installed says so on the pin, and the session takes it', { skip: process.platform === 'win32' }, async () => {
  const dir = site('missing');
  const bin = tmp('bin');
  fs.writeFileSync(path.join(bin, 'codex'), '#!/bin/sh\ncat >/dev/null\necho x >> note.txt\necho "Done: codex"\n', { mode: 0o755 });
  const { B } = await lab(dir, [], { PATH: `${bin}:/usr/bin:/bin` });
  const [r] = await replies(B, await pin(B, '@cursor make it red'));
  assert.equal(r?.name, 'labfb');
  assert.match(r?.text, /cursor-agent isn't installed on this computer/);
  const [c] = await replies(B, await pin(B, 'use gpt-5 to make it red'));
  assert.equal(c?.name, 'Codex · gpt-5');
});

// ---------- plugin files and the MCP server's folder ----------
test('the plugin files agree with the package (name, version) and declare the MCP server', () => {
  const read = (f) => JSON.parse(fs.readFileSync(fileURLToPath(new URL(`../${f}`, import.meta.url)), 'utf8'));
  const { version } = read('package.json');
  for (const f of ['plugin.json', '.claude-plugin/plugin.json', '.cursor-plugin/plugin.json']) {
    assert.equal(read(f).name, 'labfb', f);
    assert.equal(read(f).version, version, `${f} is at ${version}`);
  }
  assert.equal(read('plugin.json').$schema, 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json');
  const mcp = read('mcp.json');
  assert.equal(mcp.$schema, 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json');
  assert.deepEqual(mcp.mcpServers.labfb, { type: 'stdio', command: 'npx', args: ['-y', '@leonidstern/labfb@latest', 'mcp'] });
  assert.equal(read('.agents/plugins/marketplace.json').plugins[0].source.path, './');
});

test('MCP started in a plugin folder finds the project: by the client root, the shell folder, or dir', async () => {
  const dir = site('proj');
  const { B } = await lab(dir);
  await pin(B, 'project pin');
  const pluginDir = tmp('plugin');
  const start = (env) => {
    const mcp = spawn(process.execPath, [LAB, 'mcp'], { cwd: pluginDir, env: { ...clean, LABFB_HOME: home, ...env } });
    kids.push(mcp);
    let buf = '';
    const answers = new Map();
    let rootsAsked = null;
    mcp.stdout.on('data', (d) => {
      buf += d;
      for (let i = buf.indexOf('\n'); i >= 0; i = buf.indexOf('\n')) {
        const m = JSON.parse(buf.slice(0, i));
        buf = buf.slice(i + 1);
        if (m.method === 'roots/list') rootsAsked?.(m);
        else answers.get(m.id)?.(m);
      }
    });
    let n = 1;
    const ask = (method, params) => new Promise((done) => { const k = n++; answers.set(k, done); mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: k, method, params }) + '\n'); });
    const roots = new Promise((r) => (rootsAsked = r));
    return { mcp, ask, roots };
  };
  const says = async (ask, args = {}) => (await ask('tools/call', { name: 'comments', arguments: args })).result.content[0].text;

  // 1. The client gives its root.
  const a = start({ PWD: pluginDir });
  await a.ask('initialize', { protocolVersion: '2025-06-18', capabilities: { roots: {} }, clientInfo: { name: 'codex-mcp-client', version: '1' } });
  const q = await a.roots;
  a.mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: q.id, result: { roots: [{ uri: `file://${dir}`, name: 'proj' }] } }) + '\n');
  await new Promise((r) => setTimeout(r, 200));
  assert.match(await says(a.ask), /project pin/);
  // 2. No roots: the shell's folder (PWD) has the lab.
  const b = start({ PWD: dir });
  await b.ask('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'x', version: '1' } });
  assert.match(await says(b.ask), /project pin/);
  // 3. Neither: the tool's dir.
  const c = start({ PWD: pluginDir });
  await c.ask('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'x', version: '1' } });
  assert.match(await says(c.ask), /No lab in/);
  assert.match(await says(c.ask, { dir }), /project pin/);
});

// ---------- the quick step: checked, put back when it passes or is too big, logged, and a reason when it passes ----------
test('a quick "PASS: <reason>" reaches the session with the pin', async () => {
  const dir = site('passnote');
  const { B } = await lab(dir, [], { LAB_FAST_CMD: 'cat >/dev/null; echo "PASS: needs a change in lib/orders.js sortOrders"' });
  const id = await pin(B, 'sorted by total and this comes first?');
  let text = '';
  for (let i = 0; i < 50 && !/quick model passed/.test(text); i++) {
    await new Promise((r) => setTimeout(r, 100));
    text = await (await fetch(B + '/_lab/agent/index')).text();
  }
  assert.match(text, /^quick model passed: needs a change in lib\/orders\.js sortOrders$/m);
  const out = await cli(dir, ['wait', '--timeout', '5'], {});
  assert.match(out, new RegExp(`id ${id}`));
  assert.match(out, /quick model passed: needs a change/);
});

const quickLog = (dir) => (fs.existsSync(path.join(dir, '.lab/quick.jsonl')) ? fs.readFileSync(path.join(dir, '.lab/quick.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []);
const until = async (ok, n = 60) => {
  for (let i = 0; i < n && !(await ok()); i++) await new Promise((r) => setTimeout(r, 100));
};

test('a pass puts back what the quick tool changed, and the log says so', async () => {
  const dir = site('undo-pass');
  const page = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  const { B } = await lab(dir, [], { LAB_FAST_CMD: 'cat >/dev/null; echo "<p>half done</p>" >> index.html; echo "PASS: needs a choice"' });
  await pin(B, 'make the title red');
  await until(() => quickLog(dir).length > 0);
  assert.equal(fs.readFileSync(path.join(dir, 'index.html'), 'utf8'), page, 'index.html is as it was');
  const [l] = quickLog(dir);
  assert.equal(l.result, 'undone');
  assert.deepEqual(l.files, ['index.html']);
  assert.equal(l.note, 'needs a choice');
});

test('a quick change that is too big is put back and goes to the session with why', async () => {
  const dir = site('undo-big');
  const { B } = await lab(dir, [], { LAB_FAST_CMD: 'cat >/dev/null; for i in $(seq 1 50); do echo "line $i" >> extra.css; done; echo "Done: restyled everything"' });
  const id = await pin(B, 'make the title red');
  await until(() => quickLog(dir).length > 0);
  assert.equal(fs.existsSync(path.join(dir, 'extra.css')), false, 'the new file is gone');
  assert.deepEqual(await replies(B, id, false), [], 'no "Done" on the pin');
  assert.match(quickLog(dir)[0].note, /too big for a quick one \(1 files, 50 lines\)/);
  const text = await (await fetch(B + '/_lab/agent/index')).text();
  assert.match(text, /^quick model passed: its change was too big/m);
});

test('the quick changes ride along with the next pins the session gets', async () => {
  const dir = site('glance');
  // Done for "red" pins, a pass for the rest.
  const { B } = await lab(dir, [], { LAB_FAST_CMD: 'if grep -q "make it red" ; then echo "h1{color:red}" > red.css; echo "Done: title red"; else echo "PASS: needs a choice"; fi' });
  const red = await pin(B, 'make it red');
  await until(async () => (await replies(B, red, false)).length > 0);
  const other = await pin(B, 'pick a nicer font');
  await until(() => quickLog(dir).length > 1);
  const out = await cli(dir, ['wait', '--timeout', '5'], {});
  assert.match(out, new RegExp(`id ${other}`));
  assert.match(out, /^# Quick changes to check/m);
  assert.match(out, new RegExp(`^- id ${red} "make it red" \\(/index\\): red\\.css: \\+ h1\\{color:red\\}`, 'm'));
});

test('👎 on a quick fix puts it back and hands the pin to the agent; a file changed since is left alone', async () => {
  const dir = site('thumbs');
  const { B } = await lab(dir, [], { LAB_FAST_CMD: 'cat >/dev/null; echo "h1{color:red}" > red.css; echo "Done: title red"' });
  const token = JSON.parse(fs.readFileSync(path.join(dir, '.lab/server.json'), 'utf8')).token;
  const undo = (id) => fetch(B + '/_lab/quick-undo', { method: 'POST', headers: { 'content-type': 'application/json', origin: B, 'x-lab-admin': token }, body: JSON.stringify({ page: '/index', id }) });
  const a = await pin(B, 'make it red');
  await until(async () => (await replies(B, a, false)).length > 0);
  assert.equal(fs.existsSync(path.join(dir, 'red.css')), true);
  assert.equal((await fetch(B + '/_lab/quick-undo', { method: 'POST', headers: { 'content-type': 'application/json', origin: B }, body: '{}' })).status, 403, 'needs this computer');
  assert.equal((await undo(a)).status, 200);
  assert.equal(fs.existsSync(path.join(dir, 'red.css')), false, 'put back');
  const out = await cli(dir, ['wait', '--timeout', '5'], {});
  assert.match(out, new RegExp(`id ${a}`));
  assert.match(out, /quick model passed: the person rejected the quick fix \(👎\), so it was put back: red\.css: \+ h1\{color:red\}/);
  // Changed since the quick fix: not put back.
  const b = await pin(B, 'make it red again');
  await until(async () => (await replies(B, b, false)).length > 0);
  fs.writeFileSync(path.join(dir, 'red.css'), 'h1{color:darkred}\n');
  const r = await undo(b);
  assert.equal(r.status, 409);
  assert.match((await r.json()).error, /changed since: red\.css/);
  assert.equal(fs.readFileSync(path.join(dir, 'red.css'), 'utf8'), 'h1{color:darkred}\n');
});

test('a quick change to shared code (a file two others load) is put back and goes to the session', async () => {
  const dir = site('shared');
  fs.mkdirSync(path.join(dir, 'ui'));
  fs.writeFileSync(path.join(dir, 'ui', 'Button.js'), 'export const Button = () => "<button>";\n');
  for (const f of ['a.js', 'b.js']) fs.writeFileSync(path.join(dir, f), "import { Button } from './ui/Button.js';\nButton();\n");
  const before = fs.readFileSync(path.join(dir, 'ui', 'Button.js'), 'utf8');
  const { B } = await lab(dir, [], { LAB_FAST_CMD: 'cat >/dev/null; printf "export const Button = () => 2;\\n" > ui/Button.js; echo "Done: bigger button"' });
  const id = await pin(B, 'make this button bigger');
  await until(() => quickLog(dir).length > 0);
  assert.equal(fs.readFileSync(path.join(dir, 'ui', 'Button.js'), 'utf8'), before, 'put back');
  assert.deepEqual(await replies(B, id, false), [], 'no "Done" on the pin');
  assert.match(quickLog(dir)[0].note, /shared code \(ui\/Button\.js\)/);
  const out = await cli(dir, ['wait', '--timeout', '5'], {});
  assert.match(out, new RegExp(`id ${id}`));
  assert.match(out, /quick model passed: its change was to shared code/);
});

test('quick changes reach the session to check even when no pin was passed', async () => {
  const dir = site('review');
  const { B } = await lab(dir, [], { LAB_FAST_CMD: 'cat >/dev/null; echo "h1{color:red}" > red.css; echo "Done: title red"' });
  const id = await pin(B, 'make it red');
  await until(async () => (await replies(B, id, false)).length > 0);
  const out = await cli(dir, ['wait', '--timeout', '5'], {});
  assert.match(out, /^# Quick changes to check$/m);
  assert.match(out, new RegExp(`^- id ${id} "make it red" \\(/index\\): red\\.css`, 'm'));
  assert.doesNotMatch(out, /^# New comments/m);
  const again = await cli(dir, ['wait', '--timeout', '5'], {});
  assert.doesNotMatch(again, /Quick changes to check/, 'handed over once');
});
