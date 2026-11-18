// Flags: what the lab is trying. Off unless a file or the ⋯ menu turns one on; a switch writes the project's
// labit.json, and turning it off again leaves no trace in the file.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadSettings, saveFlag } from '../lib/settings.ts';
import { FLAGS, flagDefaults, flagsOn } from '../lib/flags.ts';

const dirs = [];
after(() => {
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

test("a flag in the project's file turns it on, and the others stay off", () => {
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

test('a flag that is not true or false is ignored, with a word about it', () => {
  const dir = tmp();
  const one = Object.keys(FLAGS)[0];
  fs.writeFileSync(path.join(dir, 'labit.json'), JSON.stringify({ flags: { [one]: 'yes' } }));
  const s = read(dir);
  assert.match(s.problems[0], /must be true or false/);
  assert.equal(s.values.flags[one], false);
});

test('a switch writes the file, and off again leaves nothing behind', () => {
  const dir = tmp();
  const one = Object.keys(FLAGS)[0];
  const file = saveFlag(dir, one, true);
  assert.equal(file, path.join(dir, 'labit.json'));
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { flags: { [one]: true } });
  assert.equal(read(dir).values.flags[one], true);

  saveFlag(dir, one, false);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), {});
  assert.equal(read(dir).values.flags[one], false);
});

test('a switch keeps the rest of labit.json as it was', () => {
  const dir = tmp();
  const one = Object.keys(FLAGS)[0];
  fs.writeFileSync(path.join(dir, 'labit.json'), JSON.stringify({ port: 4455, flags: { [one]: true } }, null, 2));
  saveFlag(dir, one, false);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'labit.json'), 'utf8')), { port: 4455 });
});

test('sinceLooked is off until switched on, and the widget starts nothing without it', () => {
  assert.equal(flagDefaults().sinceLooked, false);
  assert.ok(FLAGS.sinceLooked.name && FLAGS.sinceLooked.since);
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'labit.json'), JSON.stringify({ flags: { sinceLooked: true } }));
  assert.deepEqual(flagsOn(read(dir).values.flags), ['sinceLooked']);
  // The widget's only way in: the pill, the kept looks and every request come from startChanges().
  const widget = fs.readFileSync(new URL('../src/comments.js', import.meta.url), 'utf8');
  assert.match(widget, /flag\('sinceLooked'\)\) startChanges\(\)/);
  assert.equal(widget.match(/startChanges\(/g).length, 1, 'started in one place only');
});
