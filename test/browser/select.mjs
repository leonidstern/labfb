// Select mode (flag select) and your actions (lib/actions.ts) in a real browser: a pin's box shows as many actions as
// fit on one line and "…", "…" grows the line into the whole list, a right-click (or a hold) edits a row in place,
// + add (saved in your settings; here every save and send is caught, nothing is written); V picks blocks, and a picked block opens the same box (no pin drawn) whose
// chips send a pin on the block with the action's prompt for the agent; Esc lets go and leaves. Not part of `npm test`; CI runs it in the `browser` job.
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

try {
  for (const eng of (process.env.ENGINES || 'chromium').split(',')) {
    const browser = await pw[eng].launch();
    try {
      reset();
      const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
      await ctx.addInitScript(() => localStorage.setItem('lab-name', 'tess'));
      // Nothing is saved: a comment is answered here (the lab never sees it).
      const posts = [];
      await ctx.route('**/_lab/api/comments**', (r) => {
        if (r.request().method() !== 'POST') return r.continue();
        const body = r.request().postDataJSON();
        posts.push(body);
        return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ comment: { id: `m${posts.length}`, page: '/index', name: body.name, text: body.text, anchor: body.anchor, created: new Date().toISOString(), replies: [] }, edit: 'k1' }) });
      });
      const texts = async () => posts.map((b) => b.text);
      const p = await ctx.newPage();
      await p.goto(B + '/');
      await sleep(600);
      const mode = () => p.evaluate(() => document.documentElement.classList.contains('lab-selecting'));
      const picked = () => p.evaluate(() => document.querySelector('[data-lab-picked]')?.textContent || '');
      const chip = (name) => p.locator(`.float button[data-k="${name}"]`);
      const line = () => p.evaluate(() => {
        const r = document.querySelector('[data-lab-comments]').shadowRoot;
        const row = r.querySelector('.float > .quick');
        const more = r.querySelector('.float > .acts');
        const shown = row ? [...row.children].filter((b) => !b.hidden) : [];
        return { names: shown.map((b) => b.textContent).join(' '), tops: new Set(shown.map((b) => Math.round(b.getBoundingClientRect().top))).size, fits: row ? row.scrollWidth <= row.clientWidth + 1 : false, more: more ? [...more.querySelectorAll('[data-act]')].map((b) => b.dataset.act).join(' ') : '', open: more ? !more.hidden : false, pin: Boolean(r.querySelector('.pin.draft')) };
      });
      const last = async () => posts.at(-1);
      const all = 'go fix remove like move states variant';
      // A pin's box: as many as fit, in order, on one line; … opens the rest first, then the ones on the line
      await p.locator('h1').click();
      await until(async () => (await line()).names !== '');
      let l = await line();
      const wide = l.names.split(' ').length - 1;
      check(eng, "a pin's box: the line fills with actions in order, then …", wide > 3 && all.startsWith(l.names.slice(0, -2)) && l.names.endsWith(' …') && l.tops === 1 && l.fits && !l.open && l.pin, JSON.stringify(l));
      await chip('…').click();
      l = await line();
      check(eng, '… grows the line into the whole list, in order', l.open && l.more === all, JSON.stringify(l));
      await p.locator('.float .acts .fold').click();
      check(eng, 'done folds it back to the line', await until(async () => !(await line()).open));
      await p.locator('.float .composer textarea').click();
      await p.keyboard.type('the gap');
      await chip('fix').click();
      check(eng, 'a chip sends "<name>: <your words>"', await until(async () => (await texts()).includes('fix: the gap')));
      check(eng, "…and the agent reads the action's prompt", (await last())?.anchor?.act === 'Fix this: it is broken or wrong.');
      await until(async () => !(await line()).names); // the sent box has gone
      await p.keyboard.press('v');
      check(eng, 'V turns select mode on, no box until a pick', (await mode()) && !(await line()).names);
      // The pin sent above still sits on the heading's middle (where the first click was), and a click on it is the widget's, not a pick: aim elsewhere on the heading.
      await p.locator('h1').click({ position: { x: 40, y: 20 } });
      l = await line();
      check(eng, 'a click picks the block, drops no pin, and opens the same box with done on its line (one action fewer)', (await picked()) === 'Ship faster' && l.names.endsWith('… done') && l.names.split(' ').length - 2 < wide && l.tops === 1 && !l.pin, JSON.stringify(l));
      await p.keyboard.press('Tab');
      check(eng, 'Tab picks the next block', (await picked()) === 'Second block of words');
      await p.keyboard.press('Shift+Tab');
      check(eng, 'Shift+Tab picks the one before', (await picked()) === 'Ship faster');
      await chip('…').click();
      await p.locator('.float .acts [data-act="states"]').click();
      check(eng, 'a chip sends a pin on the block', await until(async () => (await texts()).includes('states')));
      const c = await last();
      check(eng, '…with its prompt, on the picked block', /states/.test(c?.anchor?.act || '') && /h1/.test(c?.anchor?.element || ''), JSON.stringify(c?.anchor));
      check(eng, 'sent: the box closes and the block is let go, the mode stays', await until(async () => !(await picked()) && !(await line()).names && (await mode())));
      await p.locator('p').first().click();
      await p.keyboard.press('Escape');
      check(eng, 'Esc lets go of the block and closes its box, the mode stays', !(await picked()) && !(await line()).names && (await mode()));
      await p.keyboard.press('Escape');
      check(eng, 'Esc again leaves the mode', !(await mode()));
      await p.setViewportSize({ width: 390, height: 700 });
      await p.reload(); // the pins sent above were only answered here: a fresh page has none over the heading
      await sleep(600);
      await p.locator('h1').click();
      await until(async () => (await line()).names !== '');
      l = await line();
      check(eng, 'at 390 px the line is still one line', l.tops === 1 && l.fits, JSON.stringify(l));
    } finally {
      await browser.close();
    }
  }
} finally {
  server.kill();
  fs.rmSync(DIR, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
