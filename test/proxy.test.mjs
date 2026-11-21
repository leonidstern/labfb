// The lab in front of a dev server (--proxy): a page in another charset, a redirect to the dev server's own address comes back as the lab's, and
// a person who leaves (a closed tab, a cancelled event stream) ends the dev server's side of the request too.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { site, tmp, rm, spawnLab, sleep } from './harness.mjs';

const { DIR, PORT } = site('proxy', 6400, 90);

let closed = 0; // event streams the dev server saw end
const dev = http.createServer((req, res) => {
  const here = `http://localhost:${dev.address().port}`;
  if (req.url === '/old') return void res.writeHead(302, { location: here + '/new?x=1' }).end();
  if (req.url === '/ip') return void res.writeHead(302, { location: `http://127.0.0.1:${dev.address().port}/new#h` }).end();
  if (req.url === '/six') return void res.writeHead(302, { location: `http://[::1]:${dev.address().port}/new` }).end();
  if (req.url === '/away') return void res.writeHead(302, { location: 'https://example.com/' }).end();
  if (req.url === '/near') return void res.writeHead(302, { location: here + '0/x' }).end(); // another port, not this server
  if (req.url === '/latin') return void res.writeHead(200, { 'content-type': 'text/html; charset=iso-8859-1' }).end(Buffer.from('<!doctype html><html><head><title>t</title></head><body>caf\xe9</body></html>', 'latin1'));
  if (req.url === '/nohead') return void res.writeHead(200, { 'content-type': 'text/html' }).end('\n<!-- c -->\n<!DOCTYPE html>\n<html><body><p>no head</p></body></html>');
  if (req.url === '/events') {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write('data: 1\n\n');
    return void req.on('close', () => closed++);
  }
  res.end('ok');
});
await new Promise((r) => dev.listen(0, '127.0.0.1', r));
const lab = spawnLab(DIR, PORT, { args: ['--proxy', String(dev.address().port)], env: { ...process.env, LABIT_HOME: tmp('home'), LABIT_NO_UPDATE_CHECK: '1' } });
after(() => {
  lab.kill();
  dev.closeAllConnections();
  dev.close();
  rm([DIR]);
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
  assert.equal(await at('/ip'), `http://localhost:${PORT}/new#h`, 'the same server by its number');
  assert.equal(await at('/six'), `http://localhost:${PORT}/new`);
  assert.equal(await at('/away'), 'https://example.com/');
  assert.equal(await at('/near'), `http://localhost:${dev.address().port}0/x`, 'an address that only starts the same is not the dev server');
});

test('a page the dev server sends as iso-8859-1 is read as such and goes on as UTF-8', async () => {
  await up();
  const r = await fetch(`http://localhost:${PORT}/latin`, { headers: { accept: 'text/html' } });
  assert.equal(r.headers.get('content-type'), 'text/html; charset=utf-8');
  const text = await r.text();
  assert.ok(text.includes('caf\u00e9'), 'the é is an é');
  assert.ok(!text.includes('\ufffd'), 'no replacement marks');
});

test('a page with a comment before its doctype and no <head> keeps its doctype whole', async () => {
  await up();
  const text = await (await fetch(`http://localhost:${PORT}/nohead`, { headers: { accept: 'text/html' } })).text();
  assert.match(text, /<!DOCTYPE html><script>[^]*?<\/script>\n<html>/, 'the doctype is in one piece, the reload-holder after it');
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

test('a page asked for while the dev server restarts waits for it instead of failing', async () => {
  await up();
  const port = dev.address().port;
  dev.closeAllConnections();
  await new Promise((r) => dev.close(r));
  const got = new Promise((done, fail) => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path: '/back', headers: { host: `localhost:${PORT}`, accept: 'text/html' } }, (res) => {
      let t = '';
      res.on('data', (c) => (t += c));
      res.on('end', () => done({ status: res.statusCode, t }));
    });
    req.on('error', fail);
  });
  await sleep(800);
  await new Promise((r) => dev.listen(port, '127.0.0.1', r));
  const { status } = await got;
  assert.equal(status, 200, 'the page came once the server was back');
  // Not forever: a server that stays down answers 502 after about 5 s.
  dev.closeAllConnections();
  await new Promise((r) => dev.close(r));
  const t0 = Date.now();
  const status2 = await new Promise((done, fail) => http.get({ host: '127.0.0.1', port: PORT, path: '/gone', headers: { host: `localhost:${PORT}`, accept: 'text/html' } }, (res) => (res.resume(), done(res.statusCode))).on('error', fail));
  assert.equal(status2, 502);
  assert.ok(Date.now() - t0 > 4000 && Date.now() - t0 < 8000, `${Date.now() - t0} ms`);
});
