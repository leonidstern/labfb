// Flags: what the lab is trying. Off unless labit.json, your settings or the ⋯ menu's Experiments list turns one on.
// A switch in the menu is saved in your own settings; the project's labit.json still wins.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadSettings, savePersonalFlag } from '../lib/settings.ts';
import { FLAGS, flagDefaults, flagsOn } from '../lib/flags.ts';

const dirs = [];
const kids = [];
after(() => {
  for (const k of kids) k.kill();
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
});
const tmp = () => {
  const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'labit-flags-')));
  dirs.push(d);
  return d;
};
// Settings read from a folder of their own, with no labit.json above it and nobody's personal file in the way.
const read = (dir) => loadSettings(dir, {}, { XDG_CONFIG_HOME: path.join(dir, 'nothing') });

test('every flag is off until somebody says otherwise', () => {
  const s = read(tmp());
  assert.deepEqual(s.values.flags, flagDefaults());
  assert.deepEqual(flagsOn(s.values.flags), []);
  assert.equal(s.from.flags, 'default');
});

test("a flag in the project's file turns it on, and the others stay off", { skip: !Object.keys(FLAGS).length && 'nothing is being tried' }, () => {
  const dir = tmp();
  const one = Object.keys(FLAGS)[0];
  fs.writeFileSync(path.join(dir, 'labit.json'), JSON.stringify({ flags: { [one]: true } }));
  const s = read(dir);
  assert.equal(s.values.flags[one], true);
  assert.deepEqual(flagsOn(s.values.flags), [one]);
  assert.deepEqual(s.problems, []);
  for (const k of Object.keys(FLAGS)) if (k !== one) assert.equal(s.values.flags[k], false);
});

test('a name nobody is trying is said out loud, not obeyed', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'labit.json'), JSON.stringify({ flags: { wasKeptLastYear: true } }));
  const s = read(dir);
  assert.equal(s.problems.length, 1);
  assert.match(s.problems[0], /wasKeptLastYear is not something being tried/);
  assert.deepEqual(flagsOn(s.values.flags), []);
});

test('a flag that is not true or false is ignored, with a word about it', { skip: !Object.keys(FLAGS).length && 'nothing is being tried' }, () => {
  const dir = tmp();
  const one = Object.keys(FLAGS)[0];
  fs.writeFileSync(path.join(dir, 'labit.json'), JSON.stringify({ flags: { [one]: 'yes' } }));
  const s = read(dir);
  assert.match(s.problems[0], /must be true or false/);
  assert.equal(s.values.flags[one], false);
});

test('sectionBar was kept: no flag, and the widget always starts the section bar, in one place', () => {
  assert.ok(!('sectionBar' in FLAGS), 'kept: the flag is gone');
  assert.ok(!('sinceLooked' in FLAGS), 'the Added pill is gone');
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'labit.json'), JSON.stringify({ flags: { sectionBar: true } }));
  const s = read(dir);
  assert.match(s.problems[0], /sectionBar is not something being tried/, 'an old file is told, not refused');
  // The widget's only way in: the bar, the kept marks and every request come from startSections().
  const widget = fs.readFileSync(new URL('../src/comments.js', import.meta.url), 'utf8');
  assert.match(widget, /load\(\);\n\s+startSections\(\);/);
  assert.equal(widget.match(/startSections\(/g).length, 1, 'started in one place only');
});

// Your own settings file, in a config home of its own (the switch writes where XDG_CONFIG_HOME says).
const withConfig = (cfg, fn) => {
  const was = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = cfg;
  try {
    return fn();
  } finally {
    process.env.XDG_CONFIG_HOME = was;
  }
};
const mine = (cfg) => path.join(cfg, 'labit', 'settings.json');

test('a switch is saved in your own settings, keeps the rest of the file, and off leaves no trace', () => {
  const cfg = tmp();
  fs.mkdirSync(path.join(cfg, 'labit'));
  fs.writeFileSync(mine(cfg), JSON.stringify({ name: 'Leo', shortcuts: { chat: 'x' } }));
  const file = withConfig(cfg, () => savePersonalFlag('select', true));
  assert.equal(file, mine(cfg));
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { name: 'Leo', shortcuts: { chat: 'x' }, flags: { select: true } });
  const s = withConfig(cfg, () => loadSettings(tmp(), {}, {}));
  assert.equal(s.values.flags.select, true);
  assert.equal(s.flagFrom.select, 'personal');
  withConfig(cfg, () => savePersonalFlag('select', false));
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { name: 'Leo', shortcuts: { chat: 'x' } });
  assert.throws(() => withConfig(cfg, () => savePersonalFlag('wasKeptLastYear', true)), /not something being tried/);
});

test('a switch makes your settings file when there is none, and never writes over one that is not JSON', () => {
  const cfg = tmp();
  withConfig(cfg, () => savePersonalFlag('select', true));
  assert.deepEqual(JSON.parse(fs.readFileSync(mine(cfg), 'utf8')), { flags: { select: true } });
  fs.writeFileSync(mine(cfg), '{ "name": "Leo", }');
  assert.throws(() => withConfig(cfg, () => savePersonalFlag('select', false)));
  assert.equal(fs.readFileSync(mine(cfg), 'utf8'), '{ "name": "Leo", }', 'left as it was');
});

test("the project's labit.json wins over your switch, and says it is the project's", () => {
  const dir = tmp();
  const cfg = tmp();
  fs.writeFileSync(path.join(dir, 'labit.json'), JSON.stringify({ flags: { select: false } }));
  withConfig(cfg, () => savePersonalFlag('select', true));
  const s = withConfig(cfg, () => loadSettings(dir, {}, {}));
  assert.equal(s.values.flags.select, false);
  assert.equal(s.flagFrom.select, 'project');
});

// The lab: POST /_lab/flags with the browser's key, from this computer. One lab, started once for these checks.
const LAB = fileURLToPath(new URL('../local.mjs', import.meta.url));
const startLab = async (dir, cfg) => {
  const port = 7600 + Math.floor(Math.random() * 150);
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>t</title><h1 id="t">Hi</h1>');
  const lab = spawn(process.execPath, [LAB, '--no-open', '--new', '--port', String(port)], { cwd: dir, env: { ...process.env, PORT: '', XDG_CONFIG_HOME: cfg } });
  kids.push(lab);
  const B = `http://localhost:${port}`;
  let html = '';
  for (let i = 0; i < 80 && !html; i++) {
    html = await fetch(B + '/').then((r) => r.text(), () => '');
    if (!html) await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(html, 'the lab answers');
  const key = html.match(/data-admin="([^"]+)"/)?.[1];
  const flagsOf = (h) => JSON.parse(h.match(/data-flags='([^']*)'/)[1].replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&amp;/g, '&'));
  const post = (body, k = key) => fetch(B + '/_lab/flags', { method: 'POST', headers: { 'content-type': 'application/json', ...(k ? { 'x-lab-admin': k } : {}) }, body: JSON.stringify(body) });
  return { B, html, key, flagsOf, post };
};

test('the Experiments switch: owner only, saved in your settings, on the page and the live state at once', async () => {
  const dir = tmp();
  const cfg = tmp();
  const { B, html, key, flagsOf, post } = await startLab(dir, cfg);
  assert.ok(key, "this computer's page has the key");
  assert.equal(flagsOf(html).select.on, false);
  assert.equal(flagsOf(html).select.project, undefined);

  assert.equal((await post({ flag: 'select', on: true }, '')).status, 403, 'no key: refused');
  assert.equal((await post({ flag: 'select', on: true }, 'x'.repeat(key.length))).status, 403, 'a wrong key: refused');
  assert.equal((await post({ flag: 'wasKeptLastYear', on: true })).status, 400);
  assert.equal((await post({ flag: 'select', on: 'yes' })).status, 400);
  assert.equal((await post({ flag: '__proto__', on: true })).status, 400);
  assert.equal(fs.existsSync(mine(cfg)), false, 'nothing written for a refused switch');

  const r = await post({ flag: 'select', on: true });
  assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).flags, ['select']);
  assert.deepEqual(JSON.parse(fs.readFileSync(mine(cfg), 'utf8')), { flags: { select: true } }, 'in your own settings');
  assert.equal(fs.existsSync(path.join(dir, 'labit.json')), false, "the project's file is not touched");
  assert.equal(flagsOf(await (await fetch(B + '/')).text()).select.on, true, 'the next page load has it, no restart');
  assert.deepEqual((await (await fetch(B + '/_lab/state')).json()).flags, ['select'], 'open pages hear it');

  await post({ flag: 'select', on: false });
  assert.deepEqual(JSON.parse(fs.readFileSync(mine(cfg), 'utf8')), {});
  assert.deepEqual((await (await fetch(B + '/_lab/state')).json()).flags, []);
});

test("a flag the project's labit.json sets: shown as the project's, and the switch is refused", async () => {
  const dir = tmp();
  const cfg = tmp();
  fs.writeFileSync(path.join(dir, 'labit.json'), JSON.stringify({ flags: { select: true } }));
  const { html, flagsOf, post } = await startLab(dir, cfg);
  assert.deepEqual(flagsOf(html).select, { name: FLAGS.select.name, on: true, project: true });
  assert.equal((await post({ flag: 'select', on: false })).status, 409);
  assert.equal(fs.existsSync(mine(cfg)), false);
});

test('`labit settings` names each flag that is on and whose it is', async () => {
  const { execFile } = await import('node:child_process');
  const cli = (cwd, cfg) => new Promise((resolve) => execFile(process.execPath, [LAB, 'settings'], { cwd, env: { ...process.env, PORT: '', XDG_CONFIG_HOME: cfg } }, (err, out) => resolve({ code: err?.code ?? 0, out })));
  const dir = tmp();
  const cfg = tmp();
  withConfig(cfg, () => savePersonalFlag('select', true));
  let r = await cli(dir, cfg);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^flags\s+select \(yours\)\s+your settings$/m);
  fs.writeFileSync(path.join(dir, 'labit.json'), JSON.stringify({ flags: { select: true } }));
  r = await cli(dir, cfg);
  assert.match(r.out, /^flags\s+select \(labit\.json\)\s+labit\.json \+ your settings$/m);
});
