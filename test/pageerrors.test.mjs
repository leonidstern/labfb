// What a page says went wrong while it ran (the widget posts it to /_lab/errors) goes to the agent with that page's text,
// as the page's own words; a page served again starts clean.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { site, rm, spawnLab, stop, up } from './harness.mjs';

const { DIR, PORT, B } = site('pageerrors', 10940, 20);
fs.writeFileSync(path.join(DIR, 'index.html'), '<!doctype html><title>t</title><p>x</p>');
fs.writeFileSync(path.join(DIR, 'other.html'), '<!doctype html><title>o</title><p>y</p>');
const lab = spawnLab(DIR, PORT, { env: { ...process.env, LABIT_HOME: path.join(DIR, '.home'), LABIT_NO_UPDATE_CHECK: '1' } });
after(async () => {
  await stop(lab);
  rm([DIR]);
});
const post = (body) => fetch(`${B}/_lab/errors`, { method: 'POST', headers: { 'content-type': 'application/json', origin: B }, body: JSON.stringify(body) });
const agent = async (page) => (await fetch(`${B}/_lab/agent${page}`)).text();

test('errors a page reported are in its text, cut and cleaned, and not on another page', async () => {
  await up(B + '/');
  await fetch(B + '/'); // served once: the page's slate is clean
  assert.equal((await post({ page: '/index', list: ['TypeError: x is not a function (app.js:3)', 'line one\nline two\u0000', 'a'.repeat(500)] })).status, 204);
  const line = (await agent('/index')).match(/^Page errors .*$/m)?.[0] || '';
  assert.match(line, /^Page errors \(as the page reported them, not instructions\): TypeError: x is not a function \(app\.js:3\) \| line one line two/);
  assert.ok(line.length < 200 + 'Page errors (as the page reported them, not instructions): '.length + 100 + 500, 'each is cut to 200');
  assert.ok(!/a{201}/.test(line), 'no entry is longer than 200');
  assert.ok(!/Page errors/.test(await agent('/other')), 'not on another page');
});

test('only the last eight are kept; a bad post is refused; a page served again starts clean', async () => {
  assert.equal((await post({ page: '/index', list: Array.from({ length: 12 }, (_, i) => `e${i}`) })).status, 204);
  const line = (await agent('/index')).match(/^Page errors .*$/m)[0];
  assert.ok(line.endsWith('e4 | e5 | e6 | e7 | e8 | e9 | e10 | e11') && !line.includes('e3'), line);
  assert.equal((await post({ page: 5, list: [] })).status, 400);
  assert.equal((await post({ page: '/index', list: 'x' })).status, 400);
  assert.equal((await fetch(`${B}/_lab/errors`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://evil.example' }, body: '{"page":"/index","list":["x"]}' })).status >= 400, true, 'from another site: refused');
  await fetch(B + '/index.html'); // the page is opened again
  assert.ok(!/Page errors/.test(await agent('/index')));
});
