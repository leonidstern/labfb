// node test.mjs [file that exports listenPages]   exits 0 when every case passes
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const { listenPages } = await import(pathToFileURL(path.resolve(process.argv[2] || 'src/pages.mjs')));
const cases = [
  ['/a,/b', ['/a', '/b']],
  ['a, b', ['/a', '/b']],
  ['/zoom.html', ['/zoom']],
  ['//x', ['/x']],
  ['', null],
  [undefined, null],
  ['/,a', ['/a']],
  ['A.HTM', ['/A']],
  [' /a/b.html ,', ['/a/b']],
  ['/notes.html.bak', ['/notes.html.bak']],
];
for (const [raw, want] of cases) assert.deepEqual(listenPages(raw), want, `listenPages(${JSON.stringify(raw)})`);
console.log('ok', cases.length);
