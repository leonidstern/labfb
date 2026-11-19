// Select mode (flag select) and your actions (lib/actions.ts) in a real browser: a pin's box shows as many actions as
// fit on one line and "…", "…" opens the rest with ✎ and + add (saved in your settings); V picks blocks, and a picked block opens the same box (no pin drawn) whose
// chips send a pin on the block with the action's prompt for the agent; Esc lets go and leaves. Not part of `npm test`; CI runs it in the `browser` job.
// Run: node test/browser/select.mjs (needs playwright; NODE_PATH can point at a node_modules that has it).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { SEED } from '../../lib/actions.ts';

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
      const last = async () => (await fetch(`${B}/_lab/api/comments?page=/index`).then((r) => r.json())).comments.at(-1);
      const mine = () => JSON.parse(fs.readFileSync(path.join(env.XDG_CONFIG_HOME, 'labit', 'settings.json'), 'utf8')).actions.map((a) => a.name).join(' ');
      const all = 'go fix remove like move states variant';
      // A pin's box: as many as fit, in order, on one line; … opens the rest first, then the ones on the line (to edit)
      await p.locator('h1').click();
      await until(async () => (await line()).names !== '');
      let l = await line();
      const wide = l.names.split(' ').length - 1;
      check(eng, "a pin's box: the line fills with actions in order, then …", wide > 3 && all.startsWith(l.names.slice(0, -2)) && l.names.endsWith(' …') && l.tops === 1 && l.fits && !l.open && l.pin, JSON.stringify(l));
      await chip('…').click();
      l = await line();
      const rest = all.split(' ').slice(wide).join(' ');
      check(eng, '… opens the rest in order, then the line ones', l.open && l.more === `${rest} ${all.split(' ').slice(0, wide).join(' ')}`.trim(), JSON.stringify(l));
      await p.locator('.float .acts .pen').last().click();
      await p.locator('.float .act-edit input').fill('nottoolong');
      check(eng, '✎: the name stops at 7, the counter says so', (await p.locator('.float .act-edit input').inputValue()) === 'nottool' && (await p.locator('.float .act-edit .cnt').textContent()) === '7/7');
      await p.locator('.float .act-edit input').fill('look');
      await p.locator('.float .act-edit textarea').fill('Look at this again.');
      await p.locator('.float .act-edit .ok').click();
      check(eng, '…saved in your settings, in its place, the menu stays open', await until(async () => mine().split(' ')[wide - 1] === 'look' && (await line()).open), mine());
      await p.locator('.float .acts .add').click();
      await p.locator('.float .act-edit input').fill('look');
      await p.locator('.float .act-edit textarea').fill('again');
      await p.locator('.float .act-edit .ok').click();
      check(eng, '+ add: a name twice is refused, with why', await until(async () => /twice/.test((await p.locator('.float .act-edit .why').textContent()) || '')));
      await p.locator('.float .act-edit input').fill('ship');
      await p.locator('.float .act-edit .ok').click();
      check(eng, '+ add: a new one goes at the end', await until(async () => mine().endsWith(' ship')), mine());
      await p.locator('.float .acts [aria-label="edit ship"]').click();
      await p.locator('.float .act-edit .del').click();
      check(eng, 'delete takes it out', await until(async () => !mine().includes('ship')), mine());
      await p.locator('.float .acts [aria-label="edit look"]').click();
      await p.locator('.float .act-edit input').fill(all.split(' ')[wide - 1]);
      await p.locator('.float .act-edit textarea').fill(SEED.find((a) => a.name === all.split(' ')[wide - 1]).prompt);
      await p.locator('.float .act-edit .ok').click();
      check(eng, 'the list is back as it was', await until(async () => mine() === all), mine());
      await p.locator('.float .composer textarea').click();
      await p.keyboard.type('the gap');
      await chip('fix').click();
      check(eng, 'a chip sends "<name>: <your words>"', await until(async () => (await texts()).includes('fix: the gap')));
      check(eng, "…and the agent reads the action's prompt", (await last())?.anchor?.act === 'Fix this: it is broken or wrong.');
      await p.keyboard.press('v');
      check(eng, 'V turns select mode on, no box until a pick', (await mode()) && !(await line()).names);
      await p.locator('h1').click();
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
