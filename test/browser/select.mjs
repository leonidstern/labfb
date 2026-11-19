// Select mode (flag select) in a real browser: V picks blocks, the bar sends the agent what to do as a pin on the block,
// Esc lets go and leaves. Not part of `npm test`; CI runs it in the `browser` job.
// Run: node test/browser/select.mjs (needs playwright; NODE_PATH can point at a node_modules that has it).
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
const DIR = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'labit-select-b-')));
const PORT = 7930 + Math.floor(Math.random() * 30);
const B = `http://localhost:${PORT}`;
const page = (title, body) => `<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font:20px sans-serif">${body}`;
const reset = () => {
  fs.writeFileSync(path.join(DIR, 'index.html'), page('e', '<h1>Ship faster</h1>\n<p>Second block of words</p>\n<div><p>Echo</p></div><div><p>Echo</p></div>\n<a href="/other.html">go away</a>'));
};
reset();
fs.writeFileSync(path.join(DIR, 'other.html'), page('o', '<h1>Other</h1>'));
fs.writeFileSync(path.join(DIR, 'labit.json'), JSON.stringify({ port: PORT, flags: { select: true } }));
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
const until = async (fn, ms = 3000) => {
  for (let t = 0; t < ms; t += 50) {
    if (await fn()) return true;
    await sleep(50);
  }
  return false;
};
let failed = 0;
const check = (eng, name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${eng.padEnd(8)} ${name}${detail ? ` (${detail})` : ''}`);
};
const pins = () => fetch(`${B}/_lab/api/comments?page=/index`).then((r) => r.json()).then((d) => (d.comments || []).length);
const anchors = () => fetch(`${B}/_lab/api/comments?page=/index`).then((r) => r.json()).then((d) => (d.comments || []).map((c) => ({ text: c.text, selector: c.anchor?.selector })));
const texts = () => fetch(`${B}/_lab/api/comments?page=/index`).then((r) => r.json()).then((d) => (d.comments || []).map((c) => c.text));

try {
  for (const eng of (process.env.ENGINES || 'chromium').split(',')) {
    const browser = await pw[eng].launch();
    try {
      reset();
      const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
      await ctx.addInitScript(() => localStorage.setItem('lab-name', 'leo'));
      const p = await ctx.newPage();
      await p.goto(B + '/');
      await sleep(600);
      const start = await pins(p); // the engine before left its pins on this page
      const mode = () => p.evaluate(() => document.documentElement.classList.contains('lab-selecting'));
      const picked = () => p.evaluate(() => document.querySelector('[data-lab-picked]')?.textContent || '');
      const bar = (name) => p.locator(`.selbar button[data-a="${name}"]`);
      await p.keyboard.press('v');
      check(eng, 'V turns select mode on', await mode());
      check(eng, 'the bar shows, its actions wait for a pick', (await bar('remove').isVisible()) && (await bar('remove').isDisabled()));
      await p.locator('h1').click();
      check(eng, 'a click picks the block and drops no pin', (await picked()) === 'Ship faster' && (await pins(p)) === start);
      await p.locator('a[href="/other.html"]').click();
      check(eng, 'a click on a link picks it, the page does not leave', p.url() === B + '/' && (await picked()) === 'go away');
      await p.locator('h1').click();
      await p.keyboard.press('Tab');
      check(eng, 'Tab picks the next block', (await picked()) === 'Second block of words');
      await p.keyboard.press('Shift+Tab');
      check(eng, 'Shift+Tab picks the one before', (await picked()) === 'Ship faster');
      await bar('remove').click();
      check(eng, 'remove sends a pin on the block', await until(async () => (await texts()).includes('Remove this.')));
      await bar('make like').click();
      await p.locator('p').first().click();
      check(eng, 'make like asks for a second block, then sends', await until(async () => (await texts()).some((t) => t.startsWith('Make this look like p "Second block of words"'))));
      check(eng, 'the first block stays picked', (await picked()) === 'Ship faster');
      await p.keyboard.press('Escape');
      check(eng, 'Esc lets go of the block, the mode stays', !(await picked()) && (await mode()));
      await p.keyboard.press('Escape');
      check(eng, 'Esc again leaves the mode, the bar goes', !(await mode()) && !(await bar('remove').isVisible()));
      // One tap, one pin: the same ask on the same block, twice in quick succession, sends one POST.
      const statesBefore = (await texts()).filter((t) => t.startsWith('Show this in its states')).length;
      let posts = 0;
      p.on('request', (r) => r.method() === 'POST' && r.url().includes('/_lab/api/comments') && posts++);
      await p.keyboard.press('v');
      await p.locator('h1').click();
      await bar('states').click();
      await bar('states').click();
      await sleep(400);
      check(eng, 'two quick taps on states send one pin', posts === 1 && (await texts()).filter((t) => t.startsWith('Show this in its states')).length === statesBefore + 1, `${posts} POSTs`);
      // A picked block scrolled out of view: the pin is anchored on the block, not on whatever is at that point (body).
      await p.evaluate(() => document.body.append(Object.assign(document.createElement('div'), { style: 'height:3000px' })));
      await p.evaluate(() => scrollTo(0, 2000));
      await bar('variants').click();
      const at = await until(async () => (await anchors()).some((a) => a.text.startsWith('Make 3 variants') && a.selector && a.selector !== 'body'));
      check(eng, 'a block scrolled away keeps its pin', at, JSON.stringify((await anchors()).find((a) => a.text.startsWith('Make 3 variants'))?.selector));
      await p.evaluate(() => scrollTo(0, 0));
      await p.keyboard.press('Escape');
      await p.keyboard.press('Escape');
      const before = await pins(p);
      await p.locator('h1').click();
      check(eng, 'out of select mode a click pins again', await until(async () => (await p.evaluate(() => document.documentElement.classList.contains('lab-pinning'))) || (await pins(p)) > before || (await p.locator('textarea').count()) > 0));
      // Phones: the select bar steps out of the chat's way and comes back after.
      if (eng !== 'firefox') {
        const ph = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true });
        await ph.addInitScript(() => localStorage.setItem('lab-name', 'leo'));
        const q = await ph.newPage();
        await q.goto(B + '/');
        await sleep(600);
        const shown = () => q.evaluate(() => {
          const b = document.querySelector('[data-lab-comments]')?.shadowRoot?.querySelector('.selbar');
          return Boolean(b && !b.hidden && getComputedStyle(b).visibility === 'visible');
        });
        await q.keyboard.press('v');
        await q.locator('h1').tap({ force: true });
        check(eng, 'phone: the select bar shows for a pick', await until(shown));
        await q.keyboard.press('t');
        check(eng, 'phone: the chat open hides the select bar', await until(async () => (await q.evaluate(() => document.documentElement.classList.contains('lab-sheet'))) && !(await shown())));
        await q.keyboard.press('t');
        check(eng, 'phone: chat closed, the bar is back', await until(shown));
        await ph.close();
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  server.kill();
  fs.rmSync(DIR, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
