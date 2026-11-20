// lib/watch.ts: a folder and everything under it, watched. On Linux Node's own recursive watcher sees a file replaced by a
// rename (how the lab writes a board, and how many editors save) once and then never again: the second save is silent.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { tmp, rm, sleep } from './harness.mjs';
import { watchTree } from '../lib/watch.ts';

const roots = [];
const mk = () => {
  const d = tmp('watch');
  roots.push(d);
  return d;
};
after(() => rm(roots));
const atomic = (file, text) => {
  fs.writeFileSync(`${file}.tmp`, text);
  fs.renameSync(`${file}.tmp`, file);
};
// The names heard so far; waits until `want` has been heard (at most 2 s).
const hear = (root, skip) => {
  const heard = [];
  const w = watchTree(root, (event, file) => heard.push(file), skip);
  const until = async (want, ms = 2000) => {
    for (let t = 0; t < ms && !want(heard); t += 20) await sleep(20);
    return want(heard);
  };
  return { heard, until, w };
};

test('a file replaced by a rename is heard every time, not only the first', async () => {
  const root = mk();
  fs.writeFileSync(path.join(root, 'pins.json'), '0');
  const { heard, until, w } = hear(root);
  for (let i = 1; i <= 4; i++) {
    const before = heard.filter((f) => f === 'pins.json').length;
    atomic(path.join(root, 'pins.json'), String(i));
    assert.ok(await until((h) => h.filter((f) => f === 'pins.json').length > before), `save ${i} was heard`);
  }
  w.close();
});

test('a file in a folder that appears later is heard, also when it was written before the folder was watched', async () => {
  const root = mk();
  const { heard, until, w } = hear(root);
  fs.mkdirSync(path.join(root, 'pins'));
  fs.writeFileSync(path.join(root, 'pins', 'a.html'), 'one'); // right after the folder: its watcher may not be there yet
  assert.ok(await until((h) => h.includes(path.join('pins', 'a.html'))), 'the first file of a new folder');
  const n = heard.filter((f) => f === path.join('pins', 'a.html')).length;
  atomic(path.join(root, 'pins', 'a.html'), 'two');
  assert.ok(await until((h) => h.filter((f) => f === path.join('pins', 'a.html')).length > n), 'its next replacement');
  w.close();
});

test('a folder removed and made again is watched again', async () => {
  const root = mk();
  fs.mkdirSync(path.join(root, 'sub'));
  const { heard, until, w } = hear(root);
  fs.rmSync(path.join(root, 'sub'), { recursive: true });
  await sleep(100);
  fs.mkdirSync(path.join(root, 'sub'));
  await sleep(100);
  const n = heard.length;
  atomic(path.join(root, 'sub', 'x.json'), '1');
  assert.ok(await until((h) => h.length > n && h.includes(path.join('sub', 'x.json'))));
  w.close();
});

test('a folder skip() names is not watched', async () => {
  const root = mk();
  fs.mkdirSync(path.join(root, 'node_modules'));
  fs.mkdirSync(path.join(root, 'src'));
  const { heard, until, w } = hear(root, (rel) => rel.split(path.sep).includes('node_modules'));
  fs.writeFileSync(path.join(root, 'node_modules', 'big.js'), '1');
  fs.writeFileSync(path.join(root, 'src', 'a.js'), '1');
  assert.ok(await until((h) => h.includes(path.join('src', 'a.js'))));
  await sleep(200);
  assert.ok(!heard.some((f) => f.includes('big.js')), 'nothing from the skipped folder');
  w.close();
});

test('nothing is heard after close', async () => {
  const root = mk();
  const { heard, w } = hear(root);
  w.close();
  fs.writeFileSync(path.join(root, 'late.txt'), '1');
  await sleep(200);
  assert.deepEqual(heard, []);
});

test('a folder that is not there throws, as fs.watch does', () => {
  assert.throws(() => watchTree(path.join(os.tmpdir(), 'labit-no-such-folder-' + process.pid), () => {}));
});
