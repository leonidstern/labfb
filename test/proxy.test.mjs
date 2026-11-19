// The lab in front of a dev server (--proxy): a redirect to the dev server's own address comes back as the lab's, and
// a person who leaves (a closed tab, a cancelled event stream) ends the dev server's side of the request too.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const LAB = fileURLToPath(new URL('../local.mjs', import.meta.url));
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'labit-proxy-'));
const PORT = 6400 + Math.floor(Math.random() * 90);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let closed = 0; // event streams the dev server saw end
const dev = http.createServer((req, res) => {
  const here = `http://localhost:${dev.address().port}`;
  if (req.url === '/old') return void res.writeHead(302, { location: here + '/new?x=1' }).end();
  if (req.url === '/away') return void res.writeHead(302, { location: 'https://example.com/' }).end();
  if (req.url === '/near') return void res.writeHead(302, { location: here + '0/x' }).end(); // another port, not this server
  if (req.url === '/events') {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write('data: 1\n\n');
    return void req.on('close', () => closed++);
  }
  res.end('ok');
});
await new Promise((r) => dev.listen(0, '127.0.0.1', r));
const lab = spawn(process.execPath, [LAB, '.', '--no-open', '--port', String(PORT), '--proxy', String(dev.address().port)], {
  cwd: DIR,
  env: { ...process.env, LABIT_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'labit-home-')), LABIT_NO_UPDATE_CHECK: '1' },
});
after(() => {
  lab.kill();
  dev.closeAllConnections();
  dev.close();
  fs.rmSync(DIR, { recursive: true, force: true });
});
const ask = (p) =>
  new Promise((done, fail) => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path: p, headers: { host: `localhost:${PORT}` } }, (res) => done({ req, res }));
    req.on('error', fail);
  });
const up = async () => {
  for (let i = 0; i < 80; i++) {
    const r = await ask('/').catch(() => null);
    if (r) return void r.res.resume();
    await sleep(100);
  }
  throw new Error('the lab did not start');
};

test('a redirect to the dev server\'s own address stays on the lab; one to somewhere else is left alone', async () => {
  await up();
  const at = async (p) => {
    const { res } = await ask(p);
    res.resume();
    return res.headers.location;
  };
  assert.equal(await at('/old'), `http://localhost:${PORT}/new?x=1`);
  assert.equal(await at('/away'), 'https://example.com/');
  assert.equal(await at('/near'), `http://localhost:${dev.address().port}0/x`, 'an address that only starts the same is not the dev server');
});

test('a person who leaves an event stream ends it at the dev server too', async () => {
  await up();
  const { req, res } = await ask('/events');
  await new Promise((r) => res.once('data', r));
  assert.equal(closed, 0);
  req.destroy();
  for (let i = 0; i < 40 && !closed; i++) await sleep(50);
  assert.equal(closed, 1, 'the dev server saw its stream close');
});
