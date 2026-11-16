// The widget's live connection in real browsers (WebKit and Chrome's engine): one stream per tab, let go 30 s into the
// background with the state polled instead, opened again in front, opened again when it goes quiet (no beat for
// 40 s), a bye when the page goes away (a listening agent hears the page closed); and a comment reaching two open tabs without a reload.
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
  console.log('playwright is not installed: skipped');
  process.exit(0);
})();

const LAB = fileURLToPath(new URL('../../local.mjs', import.meta.url));
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'labit-conn-'));
const PORT = String(5960 + Math.floor(Math.random() * 30));
const B = `http://localhost:${PORT}`;
// A 1 s grace: once every page is gone, a listening agent's wait ends after a second.
const env = { ...process.env, LAB_CLOSE_GRACE: '1', LABIT_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'labit-home-')), LABIT_NO_UPDATE_CHECK: '1' };
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
  for (const eng of ['webkit', 'chromium']) {
    const browser = await pw[eng].launch();
    try {
      // ---- one tab, its stream through background, front, a stall and leaving ----
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
      await sleep(800);
      const streams = () => p.evaluate(() => window.__streams.map((s) => s.readyState)); // 0 connecting, 1 open, 2 closed
      check(eng, 'one live stream per tab, open', JSON.stringify(await streams()) === '[1]' && seen.live === 1, `${JSON.stringify(await streams())}, ${seen.live} requests`);

      await p.evaluate(setHidden, true);
      await p.clock.runFor(29000);
      check(eng, 'in the background the stream stays for 30 s', (await streams())[0] === 1);
      await p.clock.runFor(2000);
      check(eng, 'then it is let go', (await streams())[0] === 2);
      const polledFrom = seen.state;
      await p.clock.runFor(41000);
      await sleep(300);
      check(eng, 'and the state is polled every 20 s instead', seen.state - polledFrom >= 2, `${seen.state - polledFrom} polls in 41 s`);

      await p.evaluate(setHidden, false);
      await until(async () => (await streams()).at(-1) === 1);
      const s = await streams();
      check(eng, 'back in front: one new stream, open', s.length === 2 && s[1] === 1 && s.filter((x) => x === 1).length === 1, JSON.stringify(s));
      const pollsInFront = seen.state;
      await p.clock.runFor(30000);
      await sleep(300);
      check(eng, 'and the polling stops', seen.state === pollsInFront, `${seen.state - pollsInFront} polls`);

      // The server's beat comes every 15 s of real time; 46 s of page time with none looks like a stalled connection.
      await p.clock.runFor(16000);
      await until(async () => (await streams()).length === 3 && (await streams())[2] === 1);
      const st = await streams();
      check(eng, 'a stream quiet for 40 s is replaced, never two open at once', st.length === 3 && st.filter((x) => x === 1).length === 1, JSON.stringify(st));

      // Leaving says bye, so the lab stops counting the tab and a listening agent's wait ends after the grace.
      // (Checked by what it does: Playwright doesn't report Chrome's last request from a page being left.)
      const agentWait = (s) => new Promise((r) => execFile(process.execPath, [LAB, 'wait', '--timeout', s], { cwd: DIR, env }, (e, out) => r(out)));
      await agentWait('1'); // the last round's comment is handed over now, so this wait has nothing waiting for it
      const listening = agentWait('15');
      await sleep(800);
      const t0 = Date.now();
      await p.goto('about:blank');
      const ended = await listening;
      check(eng, 'leaving the page says bye: a listening agent hears the page closed', /page was closed/.test(ended) && Date.now() - t0 < 6000, `${ended.trim()} after ${Date.now() - t0} ms`);
      await ctx.close();

      // ---- two tabs of one lab: a comment reaches both, no reload ----
      const ctx2 = await browser.newContext({ viewport: { width: 1000, height: 700 } });
      await ctx2.addInitScript(() => localStorage.setItem('lab-name', 'leo'));
      const tabs = [await ctx2.newPage(), await ctx2.newPage()];
      let loads = 0;
      for (const t of tabs) {
        t.on('load', () => loads++);
        await t.goto(B + '/');
      }
      await sleep(1200);
      const pins = (t) => t.evaluate(() => [...document.querySelectorAll('*')].find((n) => n.shadowRoot?.querySelector('.scrim'))?.shadowRoot.querySelectorAll('.pin').length ?? -1);
      const before = await Promise.all(tabs.map(pins));
      await post(`synced in ${eng}`);
      const both = await until(async () => (await Promise.all(tabs.map(pins))).every((n, i) => n === before[i] + 1), 5000);
      check(eng, 'a new comment shows in both open tabs, no reload', both && loads === 2, `pins ${before} → ${await Promise.all(tabs.map(pins))}, loads ${loads}`);
      // Left, not just shut: closing a browser context fires no pagehide, so the tabs would never say bye and would count
      // as background tabs for the next engine's checks.
      for (const t of tabs) await t.goto('about:blank');
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
