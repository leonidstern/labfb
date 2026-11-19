// The "update waiting" badge in real browsers (WebKit and Chrome's engine): a reload held while something is open puts a
// green "!" on the labit mark (the pill on a computer, the chat button on a phone, the ⋯ when no mark shows), the host's
// label says so meanwhile (and keeps the pill's own words aside, a new status included), a tap on the host takes the
// update at once without opening the ⋯ menu or following the pill's link, and when the reload happens the badge goes and
// the host gets its own label back. Not part of `npm test`; CI runs it in the `browser` job.
// Run: node test/browser/updbadge.mjs (needs playwright; NODE_PATH can point at a node_modules that has it).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
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
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'labit-updbadge-'));
const PORT = String(5600 + Math.floor(Math.random() * 190)); // below 6000: browsers refuse that port (X11)
const B = `http://localhost:${PORT}`;
const env = { ...process.env, LABIT_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'labit-home-')), LABIT_NO_UPDATE_CHECK: '1', LABIT_EXIT_WITH_PARENT: '1' };
const UPD_LABEL = 'update waiting, tap to load';
const SESSION_URL = 'https://claude.ai/code/session_updbadge';
const write = (f, t) => fs.writeFileSync(path.join(DIR, f), t);
write('index.html', '<!doctype html><meta charset="utf-8"><title>upd</title><style>body{margin:30px}</style><h1>Update badge</h1><p>text</p>');
write('data.json', '{"a":0}'); // a file the page may fetch: a save of it reloads the page
let saves = 0;
const save = () => write('data.json', JSON.stringify({ a: ++saves }));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = spawn(process.execPath, [LAB, '.', '--new', '--no-open', '--port', PORT], { cwd: DIR, env, stdio: 'ignore' });
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
const waitFor = async (ok, ms) => {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(40)) if (await ok()) return true;
  return false;
};
// The widget's shadow root, and a function run in it.
const inRoot = (p, fn, arg) =>
  p.evaluate(([src, a]) => {
    const r = [...document.querySelectorAll('*')].find((n) => n.shadowRoot?.querySelector('.more'))?.shadowRoot;
    return r ? new Function('r', 'a', `return (${src})(r, a)`)(r, a) : null;
  }, [fn.toString(), arg]);
// Where the badge is and what its host says.
const badge = (p) =>
  inRoot(p, (r) => {
    const u = r.querySelector('.upd');
    const host = u?.parentElement;
    const name = !host ? '' : host.classList.contains('listener') ? 'pill' : host.classList.contains('chat-btn') ? 'chat' : host.classList.contains('more') ? 'more' : host.className;
    return { shown: Boolean(u && !u.hidden), host: name, label: host?.getAttribute('aria-label') ?? null, kept: host?.dataset.updLabel ?? null, hasUpd: host?.classList.contains('has-upd') || false, others: [...r.querySelectorAll('.has-upd')].length };
  });
// Saved as the page unloads (after the widget let go of the badge), read back once the new page is in.
const snapOnUnload = (p) =>
  p.evaluate(() => {
    let pressed = 0; // when the last press began: a tap that takes the update reloads at once, not when the 1.5 s hold after a touch ends
    addEventListener('pointerdown', () => (pressed = performance.now()), true);
    // A click that got past the badge's host to the window: what it did on its way (the page may be unloading already,
    // so what it opened or followed would only flash; it must not get here at all, or come prevented and having opened nothing).
    sessionStorage.removeItem('upd-click');
    const r = [...document.querySelectorAll('*')].find((n) => n.shadowRoot?.querySelector('.more'))?.shadowRoot;
    const got = (e) => sessionStorage.setItem('upd-click', JSON.stringify({ prevented: e.defaultPrevented, menuOpen: !r.querySelector('.more-menu').hidden }));
    // On the hosts themselves too (after the widget's own listeners there, so the ⋯ menu has opened if it was going to).
    for (const n of [window, r.querySelector('a.listener'), r.querySelector('.more'), r.querySelector('.chat-btn')]) n.addEventListener('click', got);
    addEventListener('beforeunload', () => {
      const r = [...document.querySelectorAll('*')].find((n) => n.shadowRoot?.querySelector('.more'))?.shadowRoot;
      const who = r.querySelector('a.listener');
      const more = r.querySelector('.more');
      const menu = r.querySelector('.more-menu');
      sessionStorage.setItem('upd-snap', JSON.stringify({
        updHidden: r.querySelector('.upd')?.hidden ?? true, hasUpd: r.querySelectorAll('.has-upd').length,
        whoLabel: who.getAttribute('aria-label'), whoKept: who.dataset.updLabel ?? null,
        moreLabel: more.getAttribute('aria-label'), moreKept: more.dataset.updLabel ?? null,
        menuOpen: Boolean(menu && !menu.hidden), expanded: more.getAttribute('aria-expanded'), url: location.href,
        afterPress: pressed ? Math.round(performance.now() - pressed) : null,
      }));
    });
  });
const snap = (p) => p.evaluate(() => ({ ...JSON.parse(sessionStorage.getItem('upd-snap') || 'null'), click: JSON.parse(sessionStorage.getItem('upd-click') || 'null') }));
const clickStopped = (s) => !s.click || (s.click.prevented && !s.click.menuOpen);
// A listening agent, with a session link, for as long as this runs.
const listen = new AbortController();
const agentListens = () => {
  const key = JSON.parse(fs.readFileSync(path.join(DIR, '.lab/server.json'), 'utf8')).agent;
  const sess = { id: 'sess-upd', name: 'upd test', agent: 'Claude', kind: 'claude', url: SESSION_URL };
  fetch(`${B}/_lab/wait`, { method: 'POST', signal: listen.signal, headers: { 'content-type': 'application/json', origin: B, 'x-lab-admin': key, 'x-lab-agent': '1', 'x-lab-session': encodeURIComponent(JSON.stringify(sess)) }, body: JSON.stringify({ timeout: 600 }) }).catch(() => {});
};

try {
  for (const eng of (process.env.ENGINES || 'webkit,chromium').split(',')) {
    const browser = await pw[eng].launch();
    try {
      // A computer: the badge sits on the pill's mark.
      const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
      await ctx.addInitScript(() => localStorage.setItem('lab-name', 'leo'));
      const p = await ctx.newPage();
      let popups = 0;
      ctx.on('page', () => popups++); // a page the pill's link opens (target _blank)
      let loads = 0;
      p.on('load', () => loads++);
      await p.goto(B + '/');
      const pillShows = () => inRoot(p, (r) => { const w = r.querySelector('a.listener'); return Boolean(w && !w.hidden && w.getClientRects().length && w.querySelector('.mark')); });
      await waitFor(pillShows, 4000);
      await sleep(1600); // a reload waits while you've just pressed a key or clicked
      const away = await inRoot(p, (r) => r.querySelector('a.listener').getAttribute('aria-label'));

      // Held by the open chat: the badge on the pill, which says "update waiting" and keeps its words aside.
      await p.keyboard.press('t');
      await waitFor(() => inRoot(p, (r) => r.querySelector('.chatwin')?.hidden === false), 2000);
      save();
      await waitFor(async () => (await badge(p))?.shown, 4000);
      let b = await badge(p);
      check(eng, 'a held reload shows the badge on the pill, where the agent mark shows', b.shown && b.host === 'pill' && b.hasUpd && b.others === 1, JSON.stringify(b));
      check(eng, "the pill's label says an update waits, its own words kept aside", b.label === UPD_LABEL && b.kept === away && /no agent/.test(away), `${JSON.stringify(b)} away ${away}`);
      check(eng, 'held: the page has not reloaded', loads === 1, `loads ${loads}`);
      // A status update while it waits: the label still says "update waiting", the new words are kept for after.
      agentListens();
      await waitFor(async () => /talking to/.test((await badge(p))?.kept || ''), 4000);
      b = await badge(p);
      check(eng, "a new status while held is kept aside, the label still says an update waits", b.label === UPD_LABEL && /talking to/.test(b.kept || ''), JSON.stringify(b));
      // Closing the chat lets the reload through: the badge goes and the pill's latest words come back.
      await snapOnUnload(p);
      await p.keyboard.press('Escape');
      await waitFor(() => loads === 2, 4000);
      await waitFor(pillShows, 4000);
      const gone = await snap(p);
      check(eng, 'closed, the held reload goes through', loads === 2, `loads ${loads}`);
      check(eng, 'as it goes the badge is hidden and no host is marked', gone?.updHidden === true && gone?.hasUpd === 0, JSON.stringify(gone));
      check(eng, "the pill's own label is back, with the status that came while held", /talking to/.test(gone?.whoLabel || '') && gone?.whoLabel !== UPD_LABEL && gone?.whoKept === null, JSON.stringify(gone));

      // A tap on the badge's host takes the update at once, without following the pill's link.
      await waitFor(() => inRoot(p, (r, url) => r.querySelector('a.listener').getAttribute('href') === url, SESSION_URL), 4000);
      const href = await inRoot(p, (r) => r.querySelector('a.listener').getAttribute('href'));
      await sleep(1600);
      await p.keyboard.press('t');
      await waitFor(() => inRoot(p, (r) => r.querySelector('.chatwin')?.hidden === false), 2000);
      save();
      await waitFor(async () => (await badge(p))?.shown, 4000);
      b = await badge(p);
      await sleep(1200); // held: more than the 500 ms the waiting reload checks again in
      const before = loads;
      await snapOnUnload(p);
      await p.locator('a.listener').click({ timeout: 3000 }).catch((e) => console.log(`  (click: ${e.message.split('\n')[0]})`));
      const took = await waitFor(() => loads === before + 1, 3000);
      await waitFor(pillShows, 4000);
      const tapped = await snap(p);
      check(eng, 'held, with the chat still open, the badge is on the pill (which links to the session)', b.shown && b.host === 'pill' && before === 2 && href === SESSION_URL, `${JSON.stringify(b)} loads ${before} href ${href}`);
      check(eng, 'a tap on the pill takes the update: the page reloads at once', took && tapped?.afterPress !== null && tapped.afterPress < 1000, `loads ${loads}, ${tapped?.afterPress} ms after the press`);
      check(eng, "the tap did not follow the pill's link", clickStopped(tapped) && popups === 0 && tapped?.url === B + '/' && p.url() === B + '/', `popups ${popups}, click ${JSON.stringify(tapped?.click)}, ${tapped?.url} ${p.url()}`);

      // No mark showing (the pill hidden, as before the first status comes): the ⋯ carries the badge.
      await sleep(1600);
      await inRoot(p, (r) => r.append(Object.assign(document.createElement('style'), { textContent: '.listener { display: none !important; }' })));
      await p.keyboard.press('t');
      await waitFor(() => inRoot(p, (r) => r.querySelector('.chatwin')?.hidden === false), 2000);
      const moreBefore = await inRoot(p, (r) => r.querySelector('.more').getAttribute('aria-label'));
      save();
      await waitFor(async () => (await badge(p))?.shown, 4000);
      b = await badge(p);
      await sleep(1200);
      check(eng, 'with no mark showing, the badge is on the ⋯ button, which says an update waits', b.shown && b.host === 'more' && b.hasUpd && b.others === 1 && b.label === UPD_LABEL, JSON.stringify(b));
      const before2 = loads;
      await snapOnUnload(p);
      await p.locator('.more').click({ timeout: 3000 }).catch((e) => console.log(`  (click: ${e.message.split('\n')[0]})`));
      const took2 = await waitFor(() => loads === before2 + 1, 3000);
      await waitFor(pillShows, 4000);
      const tapped2 = await snap(p);
      check(eng, 'a tap on the ⋯ takes the update: the page reloads at once', took2 && tapped2?.afterPress !== null && tapped2.afterPress < 1000, `loads ${loads}, ${tapped2?.afterPress} ms after the press`);
      check(eng, 'and did not open the ⋯ menu', clickStopped(tapped2) && !tapped2.menuOpen && tapped2.expanded !== 'true' && tapped2.url === B + '/', JSON.stringify(tapped2));
      check(eng, "the ⋯ had its own label before", moreBefore !== UPD_LABEL, String(moreBefore));
      await p.goto('about:blank');
      await ctx.close();

      // A phone: the chat button carries the agent's mark, so it carries the badge.
      const phone = pw.devices[eng === 'webkit' ? 'iPhone 13' : 'Pixel 7'];
      const pctx = await browser.newContext({ ...phone });
      await pctx.addInitScript(() => localStorage.setItem('lab-name', 'leo'));
      const q = await pctx.newPage();
      let qloads = 0;
      q.on('load', () => qloads++);
      await q.goto(B + '/');
      await waitFor(() => inRoot(q, (r) => Boolean(r.querySelector('.chat-btn .mark'))), 4000);
      await sleep(1600);
      await q.locator('.chat-btn').tap({ timeout: 3000 }).catch((e) => console.log(`  (tap: ${e.message.split('\n')[0]})`));
      await waitFor(() => inRoot(q, (r) => r.querySelector('.chatwin')?.hidden === false), 2000);
      save();
      await waitFor(async () => (await badge(q))?.shown, 4000);
      b = await badge(q);
      check(eng, 'on a phone the badge is on the chat button, which carries the mark', b.shown && b.host === 'chat' && b.hasUpd && b.others === 1 && b.label === UPD_LABEL && qloads === 1, `${JSON.stringify(b)} loads ${qloads}`);
      await q.goto('about:blank');
      await pctx.close();
    } finally {
      await browser.close();
    }
  }
} finally {
  listen.abort();
  server.kill();
  await sleep(300); // the lab writes its .lab files as it stops
  fs.rmSync(DIR, { recursive: true, force: true, maxRetries: 5 });
}
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
