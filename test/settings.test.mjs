// Settings (lib/settings.ts): labit.json in the project and ~/.config/labit/settings.json fill in what flags and
// variables leave out. The rules on their own first, then `labit settings`, then a lab started with a labit.json.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadSettings, changedActions } from '../lib/settings.ts';

const LAB = fileURLToPath(new URL('../local.mjs', import.meta.url));
const dirs = [];
const kids = [];
after(() => {
  for (const k of kids) k.kill();
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
});
const tmp = (name) => {
  const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `labit-set-${name}-`)));
  dirs.push(d);
  return d;
};
// A project folder with labit.json, and a config home with your settings.json.
const setup = (project, personal) => {
  const proj = tmp('proj');
  const cfg = tmp('cfg');
  if (project) fs.writeFileSync(path.join(proj, 'labit.json'), JSON.stringify(project));
  if (personal) {
    fs.mkdirSync(path.join(cfg, 'labit'));
    fs.writeFileSync(path.join(cfg, 'labit', 'settings.json'), JSON.stringify(personal));
  }
  return { proj, cfg, load: (flags = {}, env = {}) => withConfig(cfg, () => loadSettings(proj, flags, env)) };
};
const withConfig = (cfg, fn) => {
  const was = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = cfg;
  try {
    return fn();
  } finally {
    process.env.XDG_CONFIG_HOME = was;
  }
};

test('the first that has a setting wins: flag, variable, labit.json, your settings, default', () => {
  const { load } = setup({ port: 4700, batchSeconds: 1 }, { port: 4800, batchSeconds: 5, remindAfterMinutes: 9 });
  let s = load();
  assert.equal(s.values.port, 4700);
  assert.match(s.from.port, /labit\.json$/);
  assert.equal(s.values.remindAfterMinutes, 9, 'yours, where the project says nothing');
  assert.equal(s.values.archiveAfterDays, 30, 'the default');
  assert.equal(s.from.archiveAfterDays, 'default');
  s = load({}, { PORT: '5000', LAB_SETTLE_MS: '500' });
  assert.equal(s.values.port, 5000);
  assert.equal(s.from.port, 'env PORT');
  assert.equal(s.values.batchSeconds, 0.5);
  s = load({ port: 5100 }, { PORT: '5000' });
  assert.equal(s.values.port, 5100);
  assert.equal(s.from.port, 'flag');
  assert.deepEqual(s.problems, []);
});

test('a project file can\'t name you or open your lab to the wifi; your file can\'t pick a project\'s folder', () => {
  const { load } = setup({ name: 'mallory', wifi: true, model: 'X' }, { folder: 'dist', proxy: '3000' });
  const s = load();
  assert.equal(s.values.name, '');
  assert.equal(s.values.wifi, false);
  assert.equal(s.values.folder, '.');
  assert.equal(s.values.proxy, '');
  for (const key of ['name', 'wifi', 'model', 'folder', 'proxy']) assert.ok(s.problems.some((p) => p.includes(`${key} can only be set`)), key);
});

test('unknown keys, wrong types and broken JSON are said and skipped, the rest still counts', () => {
  const { proj, load } = setup({ port: 'fast', nope: 1, open: false, archiveAfterDays: 0 });
  let s = load();
  assert.equal(s.values.port, 4400);
  assert.equal(s.values.open, false);
  assert.equal(s.values.archiveAfterDays, 30);
  assert.ok(s.problems.some((p) => /port must be a number/.test(p)));
  assert.ok(s.problems.some((p) => /nope is not a setting/.test(p)));
  assert.ok(s.problems.some((p) => /archiveAfterDays must be a number of at least 1/.test(p)));
  fs.writeFileSync(path.join(proj, 'labit.json'), '{ "port": 4700, }');
  s = load();
  assert.equal(s.values.port, 4400);
  assert.ok(s.problems.some((p) => /not valid JSON/.test(p)));
});

test('shortcuts merge key by key (the project\'s over yours over the defaults); a key used twice is said', () => {
  const { load } = setup({ shortcuts: { chat: 'x' } }, { shortcuts: { chat: 'q', toggle: 'h', next: 'X', bogus: 'z', done: 'dd', pause: 'p' } });
  const s = load();
  assert.equal(s.values.shortcuts.chat, 'x');
  assert.equal(s.values.shortcuts.toggle, 'h');
  assert.equal(s.values.shortcuts.next, 'x', 'lowercased');
  assert.equal(s.values.shortcuts.comment, '1', 'a default');
  assert.equal(s.values.shortcuts.added, 'a', 'the Added list key');
  assert.equal(s.values.shortcuts.done, 'd', 'two letters: refused, the default stays');
  assert.ok(s.problems.some((p) => /bogus is not an action/.test(p)));
  assert.equal(s.values.shortcuts.pause, undefined, 'pause was removed: a stored one is ignored');
  assert.ok(s.problems.some((p) => /\.pause is not an action/.test(p)), 'and said, not a crash');
  assert.ok(s.problems.some((p) => /"x" is used twice/.test(p)));
});

test('labit.json is found from a folder inside the project; an old zoom setting is named and ignored', () => {
  const { proj, cfg } = setup({ port: 4600, zoom: { skill: 'docs/zoom.md' }, shortcuts: { zoom: 'z' } });
  const sub = path.join(proj, 'src', 'pages');
  fs.mkdirSync(sub, { recursive: true });
  const s = withConfig(cfg, () => loadSettings(sub));
  assert.equal(s.values.port, 4600);
  assert.equal(s.values.zoom, undefined);
  assert.equal(s.values.shortcuts.pointer, undefined, 'no pointer key: key 1 switches');
  assert.ok(s.problems.some((p) => /zoom is not a setting/.test(p)));
  assert.ok(s.problems.some((p) => /\.zoom is not an action/.test(p)));
});

const cli = (cwd, args, env = {}) =>
  new Promise((resolve) => execFile(process.execPath, [LAB, ...args], { cwd, env: { ...process.env, PORT: '', ...env } }, (err, stdout, stderr) => resolve({ code: err?.code ?? 0, out: stdout + stderr })));

test('`labit settings` shows each value and where it came from, and fails on a problem', async () => {
  const { proj, cfg } = setup({ port: 4700, shortcuts: { chat: 'x' } }, { name: 'Leo', model: 'Opus 5.5' });
  let r = await cli(proj, ['settings'], { XDG_CONFIG_HOME: cfg });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^port\s+4700\s+labit\.json$/m);
  assert.match(r.out, /^name\s+Leo\s+your settings$/m);
  assert.match(r.out, /^model\s+Opus 5\.5\s+your settings$/m);
  assert.match(r.out, /^shortcuts\s+chat x\s+labit\.json$/m);
  assert.match(r.out, /^archiveAfterDays\s+30\s+default$/m);
  r = await cli(proj, ['settings', '--port', '4999'], { XDG_CONFIG_HOME: cfg });
  assert.match(r.out, /^port\s+4999\s+flag$/m);
  fs.writeFileSync(path.join(proj, 'labit.json'), JSON.stringify({ wifi: true }));
  r = await cli(proj, ['settings'], { XDG_CONFIG_HOME: cfg });
  assert.equal(r.code, 1);
  assert.match(r.out, /wifi can only be set in your own settings/);
});

test('a lab started with a labit.json: its port, its shortcuts on the page, its batchSeconds', async () => {
  const port = 7400 + Math.floor(Math.random() * 200); // clear of the other test files' ranges
  const { proj, cfg } = setup({ port, shortcuts: { chat: 'x' }, batchSeconds: 0 });
  fs.writeFileSync(path.join(proj, 'index.html'), '<!doctype html><title>t</title><h1 id="t">Hi</h1>');
  const env = { ...process.env, PORT: '', XDG_CONFIG_HOME: cfg };
  const lab = spawn(process.execPath, [LAB, '--no-open', '--new'], { cwd: proj, env });
  kids.push(lab);
  const B = `http://localhost:${port}`;
  let html = '';
  for (let i = 0; i < 80 && !html; i++) {
    html = await fetch(B + '/').then((r) => r.text(), () => '');
    if (!html) await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(html, `the lab answers on ${port}, the port in labit.json`);
  assert.match(html, /data-keys='\{"chat":"x"\}'/, 'only the changed key goes to the page');
  const waiting = cli(proj, ['wait', '--timeout', '10'], { XDG_CONFIG_HOME: cfg });
  await new Promise((r) => setTimeout(r, 500));
  const t0 = Date.now();
  await fetch(B + '/_lab/api/comments', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: B },
    body: JSON.stringify({ page: '/index', name: 'Leo', text: 'make it red', anchor: { selector: '#t', x: 0.1, y: 0.5, docX: 0.1, docY: 20, width: 1000, element: '<h1 id="t">', block: 't' } }),
  });
  const { out } = await waiting;
  assert.ok(Date.now() - t0 < 1500, 'batchSeconds 0: handed over at once');
  assert.match(out, /make it red/);
  assert.match(out, /block: t/);
  assert.doesNotMatch(out, /^zoom:|zoom skill/m);
});

test('actions: the defaults, merged area by area (the project over yours), comment implied, bad ones said and left out', () => {
  let s = setup().load();
  assert.deepEqual(s.values.actions, { words: ['rewrite', 'cut', 'go'], spot: ['go', 'remove', 'fix'] });
  assert.deepEqual(changedActions(s.values.actions), {}, 'nothing to tell the widget');
  const tighter = { label: 'tighter', send: 'Tighter: less space' };
  s = setup({ actions: { words: ['go', tighter, 'comment', 'Cut'] } }, { actions: { words: ['rewrite'], spot: ['cut', 'cut', 'nope'] } }).load();
  assert.deepEqual(s.values.actions.words, ['go', tighter, 'cut'], 'the order given; comment dropped (it is always first); names in any case');
  assert.deepEqual(s.values.actions.spot, ['cut'], "yours, where the project says nothing: a repeat and an unknown name left out");
  assert.equal(s.problems.filter((p) => /twice|not an action/.test(p)).length, 2);
  assert.deepEqual(changedActions(s.values.actions), { words: s.values.actions.words, spot: ['cut'] });
  assert.equal(s.from.actions.split(' + ').length, 2, 'both files said where it came from');
  s = setup({ actions: { words: [] } }).load();
  assert.deepEqual(s.values.actions.words, [], 'an empty list is allowed: just the comment');
  assert.deepEqual(changedActions(s.values.actions), { words: [] });
});

test('actions: labels of 16 characters at most, text to send, no more than 5 beside comment, only words and spot', () => {
  const long = { label: 'a label far too long', send: 'x' };
  const s = setup({ actions: { words: [long, { label: 'ok' }, 7, 'cut', 'rewrite', 'go', ...['a', 'b', 'c'].map((l) => ({ label: l, send: l }))], elsewhere: [], spot: 'cut' } }).load();
  assert.deepEqual(s.values.actions.words, ['cut', 'rewrite', 'go', { label: 'a', send: 'a' }, { label: 'b', send: 'b' }], 'five kept, in order; the rest said');
  assert.deepEqual(s.values.actions.spot, ['go', 'remove', 'fix'], 'not a list: the default stays');
  const said = s.problems.join('\n');
  for (const re of [/16 characters at most/, /needs a "label" and the text to "send"/, /more than 5 actions/, /elsewhere is not a place/, /spot must be a list/]) assert.match(said, re);
  assert.equal(setup({ actions: 'cut' }).load().problems.length, 1, 'not an object: said once, the defaults stay');
});
