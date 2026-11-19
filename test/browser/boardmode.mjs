// Shortcuts from labit.json in real browsers (WebKit and Chrome's engine): the changed keys work, the old ones don't,
// and the bar shows the new key. Not part of `npm test`; CI runs it in the `browser` job.
// Run: node test/browser/shortcuts.mjs (needs playwright; NODE_PATH can point at a node_modules that has it).
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
  console.log('playwright is not installed: skipped');
  process.exit(0);
})();

const LAB = fileURLToPath(new URL('../../local.mjs', import.meta.url));
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'labit-boardmode-'));
const PORT = 8140 + Math.floor(Math.random() * 30);
const B = `http://localhost:${PORT}`;
fs.writeFileSync(path.join(DIR, 'pricing.html'), '<!doctype html><meta charset="utf-8"><title>Pricing</title><h1>Pricing one</h1><div style="height:3000px"></div>');
fs.writeFileSync(path.join(DIR, 'checkout.html'), '<!doctype html><meta charset="utf-8"><title>Checkout</title><h1>Checkout</h1>');
fs.writeFileSync(path.join(DIR, 'index.html'), '<!doctype html><meta charset="utf-8"><title>k</title><h1>Keys</h1><p>text</p>');
fs.writeFileSync(path.join(DIR, 'labit.json'), JSON.stringify({ port: PORT, flags: { board: true } }));
const env = { ...process.env, PORT: '', XDG_CONFIG_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'labit-cfg-')), LABIT_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'labit-home-')), LABIT_NO_UPDATE_CHECK: '1', LABIT_EXIT_WITH_PARENT: '1' };
const server = spawn(process.execPath, [LAB, '--new', '--no-open'], { cwd: DIR, env });
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
const OFFDIR = fs.mkdtempSync(path.join(os.tmpdir(), 'labit-boardoff-'));
fs.writeFileSync(path.join(OFFDIR, 'index.html'), '<!doctype html><meta charset="utf-8"><title>k</title><h1>Off</h1>');
const POFF = PORT + 1;
fs.writeFileSync(path.join(OFFDIR, 'labit.json'), JSON.stringify({ port: POFF }));
const off = spawn(process.execPath, [LAB, '--new', '--no-open'], { cwd: OFFDIR, env });
for (let i = 0; i < 80; i++) {
  try {
    await fetch(`http://localhost:${POFF}/`);
    break;
  } catch {
    await sleep(100);
  }
}
const root = (p) => p.evaluate(() => [...document.querySelectorAll('*')].find((n) => n.shadowRoot?.querySelector('.scrim')) ? true : false);
try {
  for (const eng of (process.env.ENGINES || 'webkit,chromium').split(',')) {
    const browser = await pw[eng].launch();
    try {
      const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
      await ctx.addInitScript(() => localStorage.setItem('lab-name', 'leo'));
      const p = await ctx.newPage();
      await p.goto(B + '/pricing');
      await p.waitForFunction(() => [...document.querySelectorAll('*')].some((n) => n.shadowRoot?.querySelector('.scrim')), null, { timeout: 5000 });
      await sleep(500);
      await p.evaluate(() => scrollTo(0, 600));
      await sleep(200);
      // The ⋯ menu has the entry, with its key
      const menu = () => p.evaluate(() => { const r = [...document.querySelectorAll('*')].find((n) => n.shadowRoot?.querySelector('.scrim')).shadowRoot; r.querySelector('.more').click(); return [...r.querySelectorAll('.more-menu button')].map((b) => b.textContent); });
      const items = await menu();
      check(eng, 'the ⋯ menu offers "open as board" with its key', items.some((t) => /open as board.*⇧B/.test(t)), JSON.stringify(items));
      await p.keyboard.press('Escape');
      await p.keyboard.press('Shift+KeyB');
      await p.waitForURL(/_lab\/board\/pricing/, { timeout: 5000 });
      await sleep(2500);
      const b = await p.evaluate(() => ({ url: location.pathname + location.search, cards: document.querySelectorAll('#lab-board .f').length, live: __labBoard.live() }));
      check(eng, 'Shift+B opens this page as a board named after it, one frame (an unsaved board)', b.url === '/_lab/board/pricing?of=%2Fpricing' && b.cards === 1 && b.live[0] === 'a', JSON.stringify(b));
      await p.keyboard.press('Escape'); // nothing selected: back to the page
      await p.waitForURL(/\/pricing$/, { timeout: 5000 });
      await sleep(1200);
      const y = await p.evaluate(() => scrollY);
      check(eng, 'Esc on an empty board goes back to the page, scrolled where it was', Math.abs(y - 600) < 5, String(y));
      // Shift+B on a board goes back too
      await p.keyboard.press('Shift+KeyB');
      await p.waitForURL(/_lab\/board\/pricing/, { timeout: 5000 });
      await sleep(1500);
      await p.keyboard.press('Shift+KeyB');
      await p.waitForURL(/\/pricing$/, { timeout: 5000 });
      check(eng, 'Shift+B on a board goes back to the page', true);
      // the board is saved by the first change; here the agent's CLI-made board shows as a ⌘K row
      await fetch(`${B}/_lab/api/board?name=checkout`, { method: 'PUT', headers: { 'content-type': 'application/json', origin: B }, body: JSON.stringify({ v: 1, rev: 0, frames: [{ id: 'a', src: '/pricing', w: 390, h: 844 }], of: '/pricing' }) });
      await sleep(800);
      await p.keyboard.press('Control+KeyK');
      await sleep(1200);
      const rows = await p.evaluate(() => { const r = [...document.querySelectorAll('*')].find((n) => n.shadowRoot?.querySelector('.scrim')).shadowRoot; return [...r.querySelectorAll('.sw-row[data-kind="board"]')].map((x) => x.textContent); });
      check(eng, '⌘K lists the board: name, frames, no comment count', rows.length === 1 && /board checkout/.test(rows[0]) && /1 frame/.test(rows[0]) && !/comment|open/i.test(rows[0]), JSON.stringify(rows));
      await p.keyboard.press('Escape');
      // flag off: no key, no menu entry
      const q = await ctx.newPage();
      await q.goto(`http://localhost:${POFF}/`);
      await q.waitForFunction(() => [...document.querySelectorAll('*')].some((n) => n.shadowRoot?.querySelector('.scrim')), null, { timeout: 5000 });
      await sleep(400);
      await q.keyboard.press('Shift+KeyB');
      await sleep(600);
      check(eng, 'flag off: Shift+B does nothing', new URL(q.url()).pathname === '/');
      await ctx.close();
    } finally {
      await browser.close();
    }
  }
} finally {
  server.kill();
  off.kill();
  fs.rmSync(DIR, { recursive: true, force: true });
  fs.rmSync(OFFDIR, { recursive: true, force: true });
}
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
