// The built copy npm ships (dist/, made by npm run build:cli before every pack): it runs, finds the package's own
// files from dist/, and serves a page with the widget.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const kids = [];
after(() => kids.forEach((k) => k.kill()));

test('the built copy in dist/ runs and serves a page with the widget', async () => {
  execSync('npm run --silent build:cli', { cwd: REPO, stdio: 'ignore' });
  const bin = path.join(REPO, 'dist', 'local.mjs');
  assert.match(execSync(`node "${bin}" --help`, { encoding: 'utf8' }), /^labit \d+\.\d+\.\d+/);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'labit-dist-'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>t</title><h1>hi</h1>');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'labit-home-'));
  const port = 6400 + Math.floor(Math.random() * 500);
  const kid = spawn(process.execPath, [bin, dir, '--no-open', '--port', String(port)], { env: { ...process.env, LABIT_HOME: home, LABIT_NO_UPDATE_CHECK: '1' } });
  kids.push(kid);
  const url = `http://localhost:${port}`;
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(url + '/');
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  assert.match(await (await fetch(url + '/')).text(), /_lab\/comments\.js/);
  assert.equal((await fetch(url + '/_lab/comments.js')).status, 200);
});
