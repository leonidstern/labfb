// The widget's live connection in real browsers (WebKit and Chrome's engine): one stream, kept in the background (a
// comment shows there at once), opened again when it goes quiet (no beat for 40 s), a bye when the page goes away (a
// listening agent hears the page closed); and 8 tabs of one lab sharing one stream, handed to another tab when the
// one holding it leaves, every tab getting each comment without a reload.
// Not part of `npm test`; CI runs it in the `browser` job. Run: node test/browser/connection.mjs (needs playwright;
// NODE_PATH can point at a node_modules that has it). One line per check; exits 1 if any fails.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const pw = (() => {
  for (const paths of [undefined, (process.env.NODE_PATH || '').split(path.delimiter)]) {
    try {
      return require(require.resolve('playwright', paths && { paths }));
    } catch {}
  }
  // On CI a missing browser is a failure: a skip there would pass with nothing run.
  console.log(`playwright is not installed: ${process.env.CI ? 'failed (CI)' : 'skipped'}`);
  process.exit(process.env.CI ? 1 : 0);
})();

const LAB = fileURLToPath(new URL('../../local.mjs', import.meta.url));
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'labit-conn-'));
const PORT = String(5960 + Math.floor(Math.random() * 30));
const B = `http://localhost:${PORT}`;
// A 1 s grace: once every page is gone, a listening agent's wait ends after a second.
const env = { ...process.env, LAB_CLOSE_GRACE: '1', LABIT_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'labit-home-')), LABIT_NO_UPDATE_CHECK: '1', LABIT_EXIT_WITH_PARENT: '1' };
fs.writeFileSync(path.join(DIR, 'index.html'), '<!doctype html><meta charset="utf-8"><title>c</title><h1 id="t">Connection</h1><p>text</p>');
const server = spawn(process.execPath, [LAB, '.', '--new', '--no-open', '--port', PORT], { cwd: DIR, env });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 80; i++) {
  try {
    await fetch(B + '/');
    break;
  } catch {
    await sleep(100);
  }
}
let failed = 0;
const check = (eng, name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${eng.padEnd(8)} ${name}${detail ? ` (${detail})` : ''}`);
};
const until = async (ok, ms = 5000) => {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(50)) if (await ok()) return true;
  return false;
};
// Every EventSource the page makes, and whether it was closed.
const trackStreams = () => {
  const ES = window.EventSource;
  window.__streams = [];
  window.EventSource = class extends ES {
    constructor(...a) {
      super(...a);
      window.__streams.push(this);
    }
  };
};
const setHidden = (hidden) => {
  for (const [k, v] of [['hidden', hidden], ['visibilityState', hidden ? 'hidden' : 'visible']]) Object.defineProperty(document, k, { configurable: true, get: () => v });
  document.dispatchEvent(new Event('visibilitychange'));
};
const post = (text) =>
  fetch(B + '/_lab/api/comments', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: B },
    body: JSON.stringify({ page: '/index', name: 'Leo', text, anchor: { selector: '#t', x: 0.2, y: 0.5, docX: 0.2, docY: 20, width: 1000, element: '<h1 id="t">' } }),
  }).then((r) => r.json());

try {
  for (const eng of (process.env.ENGINES || 'webkit,chromium').split(',')) {
    const browser = await pw[eng].launch();
    try {
      // ---- one tab: its stream through the background, front, a stall and leaving ----
      const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
      await ctx.addInitScript(() => localStorage.setItem('lab-name', 'leo'));
      await ctx.addInitScript(trackStreams);
      const p = await ctx.newPage();
      const seen = { live: 0, state: 0 };
      p.on('request', (r) => {
        const u = new URL(r.url());
        if (u.pathname === '/_lab/live') seen.live++;
        if (u.pathname === '/_lab/state') seen.state++;
      });
      await p.clock.install();
      await p.goto(B + '/');
      await until(() => p.evaluate(() => window.__streams.length === 1 && window.__streams[0].readyState === 1));
      await sleep(250);
      const streams = () => p.evaluate(() => window.__streams.map((s) => s.readyState)); // 0 connecting, 1 open, 2 closed
      check(eng, 'one live stream, open', JSON.stringify(await streams()) === '[1]' && seen.live === 1, `${JSON.stringify(await streams())}, ${seen.live} requests`);

      await p.evaluate(setHidden, true);
      await p.clock.runFor(90000);
      await sleep(250);
      check(eng, 'in the background the stream stays open, no polling', JSON.stringify(await streams()) === '[1]' && seen.state === 0, `${JSON.stringify(await streams())}, ${seen.state} polls`);
      const pinsOf = (t) => t.evaluate(() => [...document.querySelectorAll('*')].find((n) => n.shadowRoot?.querySelector('.scrim'))?.shadowRoot.querySelectorAll('.pin').length ?? -1);
      const hiddenBefore = await pinsOf(p);
      await post(`while hidden in ${eng}`);
      check(eng, 'a comment made while it is in the background shows there at once', await until(async () => (await pinsOf(p)) === hiddenBefore + 1, 4000));
      await p.evaluate(setHidden, false);
      await sleep(250);
      check(eng, 'back in front: the same stream, no reconnect', JSON.stringify(await streams()) === '[1]' && seen.live === 1, JSON.stringify(await streams()));

      // The server's beat comes every 15 s of real time; 46 s of page time with none looks like a stalled connection.
      await p.clock.runFor(46000);
      await until(async () => (await streams()).length === 2 && (await streams())[1] === 1);
      const st = await streams();
      check(eng, 'a stream quiet for 40 s is replaced, never two open at once', st.length === 2 && st.filter((x) => x === 1).length === 1, JSON.stringify(st));

      // Leaving says bye, so the lab stops counting the tab and a listening agent's wait ends after the grace.
      // (Checked by what it does: Playwright doesn't report Chrome's last request from a page being left.)
      const agentWait = (s) => new Promise((r) => execFile(process.execPath, [LAB, 'wait', '--timeout', s], { cwd: DIR, env }, (e, out) => r(out)));
      await agentWait('1'); // comments made so far are handed over now, so this wait has nothing waiting for it
      const listening = agentWait('15');
      await sleep(800);
      const t0 = Date.now();
      await p.goto('about:blank');
      const ended = await listening;
      check(eng, 'leaving the page says bye: a listening agent hears the page closed', /page was closed/.test(ended) && Date.now() - t0 < 6000, `${ended.trim()} after ${Date.now() - t0} ms`);
      await ctx.close();

      // ---- eight tabs of one lab: one stream for all, handed over when its tab goes ----
      const ctx2 = await browser.newContext({ viewport: { width: 1000, height: 700 } });
      await ctx2.addInitScript(() => localStorage.setItem('lab-name', 'leo'));
      await ctx2.addInitScript(trackStreams);
      const tabs = [];
      let loads = 0;
      for (let i = 0; i < 8; i++) {
        const t = await ctx2.newPage();
        t.on('load', () => loads++);
        await t.goto(B + '/');
        tabs.push(t);
      }
      const open = async (list) => (await Promise.all(list.map((t) => t.evaluate(() => window.__streams.filter((s) => s.readyState === 1).length)))).reduce((a, b) => a + b, 0);
      await until(async () => (await open(tabs)) === 1, 1500);
      check(eng, '8 tabs share one open stream', (await open(tabs)) === 1, `${await open(tabs)} open`);
      let before = await Promise.all(tabs.map(pinsOf));
      await post(`to all 8 in ${eng}`);
      const all8 = await until(async () => (await Promise.all(tabs.map(pinsOf))).every((n, i) => n === before[i] + 1), 5000);
      check(eng, 'a new comment shows in all 8, no reload', all8 && loads === 8, `pins ${before} → ${await Promise.all(tabs.map(pinsOf))}, loads ${loads}`);

      const holder = (await Promise.all(tabs.map((t) => t.evaluate(() => window.__streams.some((s) => s.readyState === 1))))).indexOf(true);
      await tabs[holder].goto('about:blank');
      const rest = tabs.filter((_, i) => i !== holder);
      check(eng, 'the tab with the stream leaves: another opens it within 2 s', await until(async () => (await open(rest)) === 1, 2000), `${await open(rest)} open`);
      for (const t of rest) await t.evaluate(setHidden, true);
      before = await Promise.all(rest.map(pinsOf));
      await post(`to the other 7 in ${eng}`);
      const all7 = await until(async () => (await Promise.all(rest.map(pinsOf))).every((n, i) => n === before[i] + 1), 5000);
      check(eng, 'and all 7 left, every one in the background, still get the next comment', all7, `pins ${before} → ${await Promise.all(rest.map(pinsOf))}`);
      // Left, not just shut: closing a browser context fires no pagehide, so the tabs would never say bye and would count
      // as open for the next engine's checks.
      for (const t of rest) await t.goto('about:blank');
      await ctx2.close();
    } finally {
      await browser.close();
    }
  }
} finally {
  server.kill();
  fs.rmSync(DIR, { recursive: true, force: true });
}
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
