// ci/affected.mjs: which browser tests a PR's changed files need.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { affected, groupEdit, groupTests } from '../ci/affected.mjs';

const tests = new Set(['fluid', 'board', 'boardpins', 'ink', 'selection', 'native']);
const reach = { 'src/widget/ink.ts': ['ink', 'selection'], 'src/board/mount.ts': ['board', 'boardpins', 'gone'] };
const run = (files, diffOf) => affected(files, { tests, reach, diffOf });

test('docs, skills, unit tests and other workflows run no browser test', () => {
  const r = run(['README.md', 'CHANGELOG.md', 'docs/settings.md', 'skills/labit/SKILL.md', 'test/local.test.mjs', 'test/phone/sim.mjs', '.github/workflows/gates.yml', 'ci/metrics.mjs']);
  assert.equal(r.tests, '');
  assert.equal(r.native, false);
  assert.equal(r.bench, false);
});

test('a changed browser test runs itself; one CI never runs (a helper) runs everything', () => {
  assert.equal(run(['test/browser/ink.mjs', 'CHANGELOG.md']).tests, 'ink');
  assert.equal(run(['test/browser/port.mjs']).tests, 'all');
});

test('a mapped widget module runs its tests, the build beside it adds nothing, and the native check follows', () => {
  const r = run(['src/widget/ink.ts', 'public/_lab/comments.js']);
  assert.equal(r.tests, 'ink selection');
  assert.equal(r.native, true);
  assert.equal(run(['src/board/mount.ts']).tests, 'board boardpins'); // 'gone' is in no group
});

test('the core, the server, the build, package.json and unknown paths run everything', () => {
  for (const f of ['src/comments.js', 'src/widget/styles.css', 'local.mjs', 'lib/settings.ts', 'package.json', 'scripts/build-widget.mjs', 'ci/affected.mjs', 'src/widget/new.ts', 'new/thing.js']) {
    assert.equal(run([f]).tests, 'all', f);
  }
  // A built file changed without its source: a hand edit, so everything.
  assert.equal(run(['public/_lab/comments.js']).tests, 'all');
});

test('ci/native.mjs runs the native check only; bench/ the bench only', () => {
  assert.deepEqual([run(['ci/native.mjs']).tests, run(['ci/native.mjs']).native], ['', true]);
  assert.deepEqual([run(['bench/run.mjs']).tests, run(['bench/run.mjs']).bench], ['', true]);
});

test('test.yml: a test added to a group runs that test; any other change runs everything', () => {
  const groups = `@@ -1 +1 @@
-          - { name: b, files: selection ink }
+          - { name: b, files: selection ink board }
+          # board: pins on a board`;
  assert.deepEqual(groupEdit(groups), ['board']);
  assert.equal(run(['.github/workflows/test.yml', 'test/browser/board.mjs'], () => groups).tests, 'board');
  const other = `@@ -1 +1 @@
-    timeout-minutes: 12
+    timeout-minutes: 15`;
  assert.equal(groupEdit(other), null);
  assert.equal(run(['.github/workflows/test.yml'], () => other).tests, 'all');
});

test('the groups are read from test.yml', () => {
  const names = groupTests();
  assert.ok(names.size > 10);
  for (const n of names) assert.match(n, /^[\w-]+$/);
});

test('main runs the browsers only for a version bump', async () => {
  const { onMain } = await import('../ci/affected.mjs');
  assert.equal(onMain('-  "version": "0.7.0",\n+  "version": "0.7.1",').tests, 'all');
  assert.equal(onMain('+    "dev": "node scripts/dev.mjs",').tests, '');
  assert.equal(onMain('').tests, '');
});
