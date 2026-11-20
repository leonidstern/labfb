// Flags in real browsers (WebKit and Chrome's engine): the ⋯ menu's experiments list switches them (saved in your own
// settings, applied at once: on starts the feature in place, off reloads the page), a page without the lab's key
// switches nothing, and an agent's pin wears labit's mark with no flag set. Not part of `npm test`; CI runs it in the `browser` job.
// Run: node test/browser/flags.mjs (needs playwright; NODE_PATH can point at a node_modules that has it).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
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
  // On CI a missing browser is a failure: a skip there would pass with nothing run.
  console.log(`playwright is not installed: ${process.env.CI ? 'failed (CI)' : 'skipped'}`);
  process.exit(process.env.CI ? 1 : 0);
})();

const LAB = fileURLToPath(new URL('../../local.mjs', import.meta.url));
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'labit-flags-'));
const PORT = claimPort(7970, 30);
const B = `http://localhost:${PORT}`;
fs.writeFileSync(path.join(DIR, 'index.html'), '<!doctype html><meta charset="utf-8"><title>f</title><h1 id="t">Flags</h1><p>text</p>');
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
  // A page without the lab's key (not this computer's browser) can't switch anything.
  const sw = await fetch(B + '/_lab/flags', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ flag: 'inkOnText', on: true }) });
  check('lab', 'POST /_lab/flags without the key is refused', sw.status === 403, String(sw.status));
  // An agent's pin, left the way an agent leaves one.
  execFileSync(process.execPath, [LAB, 'pin', '#t', 'a question from the agent'], { cwd: DIR, env: { ...env, PORT: String(PORT) }, stdio: 'pipe' });

  for (const eng of (process.env.ENGINES || 'webkit,chromium').split(',')) {
    const browser = await pw[eng].launch();
    try {
      const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
      await ctx.addInitScript(() => {
        localStorage.setItem('lab-name', 'tester');
        localStorage.setItem('lab-on', '1');
      });
      const p = await ctx.newPage();
      await p.goto(B + '/');
      // The widget, however long a busy machine takes to start it (a fixed 1.5 s was too short with eight jobs at once).
      await p.waitForFunction(() => [...document.querySelectorAll('*')].some((n) => n.shadowRoot?.querySelector('.more-menu')), null, { timeout: 15000 });
      await sleep(300);
      await p.evaluate(() => (window.labMark = 1)); // gone if the page reloads
      const r = () => p.evaluateHandle(() => [...document.querySelectorAll('*')].find((n) => n.shadowRoot?.querySelector('.more-menu'))?.shadowRoot);
      const menu = await (await r()).evaluate(async (root) => {
        root.querySelector('.more').click();
        await new Promise((res) => setTimeout(res, 300));
        const m = root.querySelector('.more-menu');
        const item = m.querySelector('.exp-btn');
        return { open: !m.hidden, item: item?.textContent || '', agentMark: root.querySelectorAll('.pin .agentmark').length };
      });
      check(eng, 'the ⋯ menu opens', menu.open);
      check(eng, 'it has experiments, none on', menu.item === 'experiments0', menu.item);
      check(eng, "with no flag set, the agent's pin wears labit's mark", menu.agentMark === 1, String(menu.agentMark));
      const list = await (await r()).evaluate(async (root) => {
        root.querySelector('.exp-btn').click();
        await new Promise((res) => setTimeout(res, 100));
        const m = root.querySelector('.more-menu');
        const sw = m.querySelector('[role="switch"][data-flag="inkOnText"]');
        return { open: !m.hidden, back: Boolean(m.querySelector('.exp-back')), sw: sw?.getAttribute('aria-checked'), disabled: sw?.disabled, words: sw?.textContent || '' };
      });
      check(eng, 'experiments opens its list in the menu', list.open && list.back);
      check(eng, 'a switch for inkOnText, off, that this computer may switch', list.sw === 'false' && list.disabled === false, JSON.stringify(list));
      check(eng, 'with its one line', /ink on selected words/.test(list.words), list.words);
      const on = await (await r()).evaluate(async (root) => {
        root.querySelector('[data-flag="inkOnText"]').click();
        await new Promise((res) => setTimeout(res, 800));
        return { checked: root.querySelector('[data-flag="inkOnText"]').getAttribute('aria-checked'), menuOpen: !root.querySelector('.more-menu').hidden };
      });
      check(eng, 'switched on, the menu stays open', on.checked === 'true' && on.menuOpen, JSON.stringify(on));
      // The flag starts at once: the page wears ink on words, with no reload.
      await sleep(300);
      const inked = await p.evaluate(() => document.documentElement.classList.contains('lab-ink-on'));
      check(eng, 'the feature starts at once, no reload', inked && (await p.evaluate(() => window.labMark)) === 1, String(inked));
      await (await r()).evaluate(async (root) => {
        if (root.querySelector('.more-menu').hidden) root.querySelector('.more').click();
        await new Promise((res) => setTimeout(res, 300));
        if (!root.querySelector('.exp-back')?.isConnected) root.querySelector('.exp-btn').click();
        await new Promise((res) => setTimeout(res, 100));
      });
      const saved = JSON.parse(fs.readFileSync(path.join(env.XDG_CONFIG_HOME, 'labit', 'settings.json'), 'utf8'));
      check(eng, 'saved in your own settings', saved.flags?.inkOnText === true, JSON.stringify(saved));
      check(eng, 'labit.json is as it was', JSON.parse(fs.readFileSync(path.join(DIR, 'labit.json'), 'utf8')).flags === undefined);
      // Off: the page goes back to the lab for itself and comes back without it.
      await (await r()).evaluate((root) => root.querySelector('[data-flag="inkOnText"]').click());
      await p.waitForFunction(() => !window.labMark, null, { timeout: 5000 }).catch(() => {});
      await sleep(1500);
      const off = await (await r()).evaluate((root) => ({ since: document.documentElement.classList.contains('lab-ink-on'), item: root.querySelector('.exp-btn')?.textContent || '' }));
      check(eng, 'switched off, the page reloads without it', !(await p.evaluate(() => window.labMark)) && !off.since && off.item === 'experiments0', JSON.stringify(off));
      await p.goto('about:blank');
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
