// Shortcuts from labit.json in real browsers (WebKit and Chrome's engine): the changed keys work, the old ones don't,
// and the bar shows the new key. Not part of `npm test`; CI runs it in the `browser` job.
// Run: node test/browser/shortcuts.mjs (needs playwright; NODE_PATH can point at a node_modules that has it).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { claimPort } from './port.mjs';

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
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'labit-shiftkeys-'));
const PORT = claimPort(7960, 30);
const B = `http://localhost:${PORT}`;
fs.writeFileSync(path.join(DIR, 'index.html'), '<!doctype html><meta charset="utf-8"><title>k</title><h1>Keys</h1><p>text</p>');
fs.writeFileSync(path.join(DIR, 'labit.json'), JSON.stringify({ port: PORT }));
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
try {
  for (const eng of (process.env.ENGINES || 'webkit,chromium').split(',')) {
    const browser = await pw[eng].launch();
    try {
      const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
      await ctx.addInitScript(() => { localStorage.setItem('lab-name', 'leo'); localStorage.setItem('lab-on', '1'); });
      const p = await ctx.newPage();
      await p.goto(B + '/');
      await p.waitForFunction(() => [...document.querySelectorAll('*')].some((n) => n.shadowRoot?.querySelector('.scrim')), null, { timeout: 5000 });
      await sleep(400);
      const ls = (k) => p.evaluate((x) => localStorage.getItem(x), k);
      // Shift and a digit are the board's: ⇧1, ⇧2 and ⇧0 do nothing here, a plain 1 still switches pointer and comment.
      for (const d of ['1', '2', '0']) await p.keyboard.press(`Shift+Digit${d}`);
      await sleep(150);
      check(eng, 'Shift+1, Shift+2 and Shift+0 do not switch the pointer', !(await ls('lab-cursor')));
      await p.keyboard.press('Digit1');
      await sleep(150);
      check(eng, 'a plain 1 still switches to the pointer', (await ls('lab-cursor')) === '1');
      await p.keyboard.press('Digit1');
      // Shift+D and Shift+M belong to the board; a plain D still shows and hides done pins.
      await p.keyboard.press('Shift+KeyD');
      await p.keyboard.press('Shift+KeyM');
      await sleep(150);
      check(eng, 'Shift+D does not hide done pins, Shift+M does not hide comments', !(await ls('lab-hide-done')) && (await ls('lab-on')) === '1');
      await p.keyboard.press('KeyD');
      await sleep(150);
      check(eng, 'a plain D still hides done pins', (await ls('lab-hide-done')) === '1');
      // Escape closes the new comment and says it did (the board's Esc, listening after, leaves the press alone).
      await p.evaluate(() => { window.__esc = []; addEventListener('keydown', (e) => e.key === 'Escape' && window.__esc.push(e.defaultPrevented)); });
      await p.mouse.click(150, 120);
      await p.waitForFunction(() => { const r = [...document.querySelectorAll('*')].find((n) => n.shadowRoot?.querySelector('.scrim'))?.shadowRoot; return Boolean(r?.querySelector('textarea')); }, null, { timeout: 3000 });
      await p.keyboard.press('Escape');
      await sleep(150);
      check(eng, 'Escape that closes a comment box is marked as used', JSON.stringify(await p.evaluate(() => window.__esc)) === '[true]');
      await ctx.close();
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
