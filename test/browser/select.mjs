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
import { SEED, listFrom } from '../../lib/actions.ts';

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
const page = (title, body) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><body style="font:20px sans-serif">${body}`;
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
      await ctx.addInitScript(() => localStorage.setItem('lab-name', 'leo'));
      // Nothing is saved: a comment is answered here, a change to your actions refused (the lab never sees either).
      const posts = [];
      const puts = [];
      await ctx.route('**/_lab/api/comments**', (r) => {
        if (r.request().method() !== 'POST') return r.continue();
        const body = r.request().postDataJSON();
        posts.push(body);
        return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ comment: { id: `m${posts.length}`, page: '/index', name: body.name, text: body.text, anchor: body.anchor, created: new Date().toISOString(), replies: [] }, edit: 'k1' }) });
      });
      // The lab's own check (listFrom) answers every save, so a rejected list is rejected as it would be; nothing is written.
      let saved = SEED.map((a) => ({ ...a }));
      let down = false; // a lab that does not answer
      await ctx.route('**/_lab/api/actions**', (r) => {
        if (r.request().method() === 'GET') return r.continue();
        const body = r.request().postDataJSON();
        puts.push(body);
        if (down) return r.abort();
        const out = listFrom(body);
        if ('why' in out) return r.fulfill({ status: 400, contentType: 'text/plain', body: out.why });
        saved = out.actions;
        return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ actions: saved }) });
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
      const edit = p.locator('.float .act-edit');
      const editing = () => p.evaluate(() => document.querySelector('[data-lab-comments]').shadowRoot.querySelectorAll('.act-edit').length);
      const all = 'go fix remove like move states variant';
      // A pin's box: as many as fit, in order, on one line; … opens the rest first, then the ones on the line (to edit)
      await p.locator('h1').click();
      await until(async () => (await line()).names !== '');
      let l = await line();
      const wide = l.names.split(' ').length - 1;
      check(eng, "a pin's box: the line fills with actions in order, then …", wide > 3 && all.startsWith(l.names.slice(0, -2)) && l.names.endsWith(' …') && l.tops === 1 && l.fits && !l.open && l.pin, JSON.stringify(l));
      await chip('…').click();
      l = await line();
      check(eng, '… grows the line into the whole list, in order', l.open && l.more === all, JSON.stringify(l));
      // Edit in place: a right-click (or a hold) turns that row editable where it is (no form, no boxes).
      const names = () => saved.map((a) => a.name).join(' ');
      const open = async () => until(async () => (await line()).open && (await line()).more === names());
      const focused = () => p.evaluate(() => document.querySelector('[data-lab-comments]').shadowRoot.activeElement?.className);
      const why = async () => (await edit.locator('.why').textContent({ timeout: 500 }).catch(() => '')) || '';
      const nm = edit.locator('input.nm');
      const pr = edit.locator('textarea.p');
      await p.locator('.float .acts [data-act="move"]').click({ button: 'right' });
      check(eng, 'right-click: that row is editable in place, its name focused', (await editing()) === 1 && (await nm.inputValue()) === 'move' && (await pr.inputValue()) === SEED[4].prompt && (await focused()) === 'nm' && !(await p.locator('.float form, .float .act-btns').count()));
      await nm.fill('nottoolong');
      check(eng, 'the name stops at 7, the counter shows near the limit', (await nm.inputValue()) === 'nottool' && (await edit.locator('.cnt').textContent()) === '7/7');
      await p.keyboard.press('Escape');
      check(eng, 'Esc cancels: the row is back, nothing saved, nothing sent, the list stays', (await editing()) === 0 && !puts.length && !posts.length && (await line()).open);
      await p.locator('.float .acts [data-act="like"]').click({ button: 'right' });
      await nm.fill('look');
      await p.keyboard.press('Enter');
      check(eng, 'Enter in the name goes on to the prompt', (await focused()) === 'p');
      await p.keyboard.press('End');
      await p.keyboard.type(' again');
      await p.keyboard.press('Shift+Enter');
      await p.keyboard.type('two');
      check(eng, 'Shift+Enter is a new line, nothing saved yet', (await pr.inputValue()).endsWith(' again\ntwo') && !puts.length);
      await p.keyboard.press('Enter');
      check(eng, 'Enter in the prompt saves the whole list', await until(async () => puts.length === 1), JSON.stringify(puts[0]?.actions?.[3]));
      const put = puts[0]?.actions || [];
      check(eng, '…the row changed in its place, the rest as they were', put.length === 7 && put.map((a) => a.name).join(' ') === all.replace('like', 'look') && put[3].prompt === `${SEED[3].prompt} again\ntwo` && put[0].prompt === SEED[0].prompt, JSON.stringify(put[3]));
      check(eng, '…and the list shows it, the editor closed', (await until(async () => (await editing()) === 0)) && (await open()) && !posts.length);
      // A rejected save keeps the editor open and saves nothing: a name twice, a name over 7 (past the field's own stop).
      await p.locator('.float .acts [data-act="fix"]').click({ button: 'right' });
      await nm.fill('GO');
      await p.keyboard.press('Enter');
      await p.keyboard.press('Enter');
      check(eng, 'a name already in the list: refused, the editor stays open and says why', (await until(async () => /twice/.test(await why()))) && (await editing()) === 1 && puts.length === 2 && names() === all.replace('like', 'look'), await why());
      await nm.evaluate((n) => ((n.value = 'eightchr'), n.dispatchEvent(new Event('input', { bubbles: true }))));
      await pr.focus();
      await p.keyboard.press('Enter');
      check(eng, 'a name over 7: refused the same way, nothing saved', (await until(async () => /characters/.test(await why()))) && (await editing()) === 1 && puts.length === 3 && names() === all.replace('like', 'look'), await why());
      await nm.fill('fixed');
      check(eng, 'typing again clears the reason', (await why()) === '');
      down = true;
      await p.keyboard.press('Enter'); // focus is on the name: goes to the prompt
      await p.keyboard.press('Enter');
      check(eng, 'a lab that does not answer: the row stays open and says so', await until(async () => /not answering/.test(await why())));
      down = false;
      await p.locator('.float .composer textarea').click();
      check(eng, 'a tap elsewhere cancels: nothing saved, nothing sent', (await editing()) === 0 && (await line()).open && puts.length === 4 && !posts.length && names() === all.replace('like', 'look'));
      await p.locator('.float .acts .add').click();
      check(eng, '+ add: an empty row, editable, at the end', (await editing()) === 1 && (await nm.inputValue()) === '' && (await focused()) === 'nm' && (await p.evaluate(() => document.querySelector('[data-lab-comments]').shadowRoot.querySelector('.act-edit').nextElementSibling?.classList.contains('act-foot'))));
      await p.keyboard.press('Escape');
      check(eng, '…Esc takes it away, nothing saved', (await editing()) === 0 && puts.length === 4);
      await p.locator('.float .acts .add').click();
      await p.keyboard.type('ship');
      await p.keyboard.press('Enter');
      await p.keyboard.type('Ship it now.');
      await p.keyboard.press('Enter');
      check(eng, '…typed and saved: the whole list with the new one last', (await until(async () => puts.length === 5)) && puts[4].actions.length === 8 && puts[4].actions[7].name === 'ship' && puts[4].actions[7].prompt === 'Ship it now.', JSON.stringify(puts[4]?.actions?.at(-1)));
      await open();
      // A hold (450 ms) edits too; the release after it is not a use.
      const box = await p.locator('.float .acts [data-act="remove"]').boundingBox();
      await p.mouse.move(box.x + 20, box.y + box.height / 2);
      await p.mouse.down();
      check(eng, 'a hold (450 ms) turns the row editable', await until(async () => (await editing()) === 1));
      await p.mouse.up();
      check(eng, '…and its release is not a use', (await editing()) === 1 && !posts.length && (await nm.inputValue()) === 'remove');
      await p.keyboard.press('Escape');
      await p.locator('.float .acts [data-act="states"]').click({ button: 'right' });
      await edit.locator('.del').click();
      check(eng, 'delete saves the list without it, no confirm', await until(async () => puts.length === 6 && puts[5].actions.map((a) => a.name).join(' ') === `${all.replace('like', 'look').replace(' states', '')} ship`), JSON.stringify(puts[5]?.actions?.map((a) => a.name)));
      const gone = p.locator('.float .acts .act.gone');
      check(eng, '…"deleted · undo" stands in its place', await until(async () => /deleted/.test((await gone.textContent().catch(() => '')) || '')));
      await gone.locator('.undo').click();
      check(eng, 'undo puts it back where it was', await until(async () => puts.length === 7 && puts[6].actions.map((a) => a.name).join(' ') === `${all.replace('like', 'look')} ship`));
      await open();
      await p.locator('.float .acts [data-act="ship"]').click({ button: 'right' });
      await edit.locator('.del').click();
      await gone.waitFor();
      check(eng, '…the offer goes after 4 s', (await until(async () => !(await gone.count()), 6000)) && !posts.length);
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
      // A phone (Pixel 7): a hold edits a row, the fields are 16px (no zoom on focus), the row stays in view in the sheet.
      const pctx = await browser.newContext({ ...pw.devices['Pixel 7'] });
      await pctx.addInitScript(() => localStorage.setItem('lab-name', 'leo'));
      const pputs = [];
      await pctx.route('**/_lab/api/actions**', (r) => {
        if (r.request().method() === 'GET') return r.continue();
        const body = r.request().postDataJSON();
        pputs.push(body);
        return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ actions: body.actions }) });
      });
      const q = await pctx.newPage();
      await q.goto(B + '/');
      await q.locator('h1').evaluate(async (h) => {
        const at = h.getBoundingClientRect();
        const e = (type) => new PointerEvent(type, { bubbles: true, composed: true, pointerType: 'touch', isPrimary: true, button: 0, clientX: at.x + 10, clientY: at.y + 10 });
        h.dispatchEvent(e('pointerdown')); // a hold on the page pins (400 ms)
        await new Promise((r) => setTimeout(r, 700));
        h.dispatchEvent(e('pointerup'));
      });
      await q.locator('.float button[data-k="…"]').waitFor();
      const shut = () => q.evaluate(() => document.querySelector('[data-lab-comments]').shadowRoot.querySelector('.float > .acts')?.hidden !== false);
      check(eng, 'phone: … grows the list', await until(async () => ((await shut()) && (await q.locator('.float button[data-k="…"]').tap().then(() => 0, () => 0))) || !(await shut()), 6000));
      const last2 = q.locator('.float .acts [data-act="variant"]');
      await last2.waitFor();
      // a finger's hold: pointerdown, 450 ms, then the lift (the keyboard comes up on the lift)
      await last2.evaluate((b) => {
        const at = b.getBoundingClientRect();
        const e = (type) => new PointerEvent(type, { bubbles: true, composed: true, pointerType: 'touch', isPrimary: true, button: 0, clientX: at.x + 20, clientY: at.y + at.height / 2 });
        b.dispatchEvent(e('pointerdown'));
        window.__lift = () => b.dispatchEvent(e('pointerup'));
      });
      const pedit = q.locator('.float .act-edit');
      check(eng, 'phone: a hold opens the row for editing', await until(async () => (await pedit.count()) === 1));
      await q.evaluate(() => window.__lift());
      const info = await q.evaluate(() => {
        const r = document.querySelector('[data-lab-comments]').shadowRoot;
        const f = (s) => parseFloat(getComputedStyle(r.querySelector(s)).fontSize);
        const row = r.querySelector('.act-edit').getBoundingClientRect();
        const menu = r.querySelector('.float > .acts').getBoundingClientRect();
        return { nm: f('.act-edit input.nm'), p: f('.act-edit textarea.p'), rowTop: row.top, rowBottom: row.bottom, menuTop: menu.top, menuBottom: menu.bottom, vh: innerHeight, focus: r.activeElement?.className };
      });
      check(eng, 'phone: the fields are 16px', info.nm === 16 && info.p === 16, JSON.stringify(info));
      check(eng, 'phone: the row is kept in view inside the sheet, name focused on the lift', info.rowTop >= info.menuTop - 1 && info.rowBottom <= info.menuBottom + 1 && info.rowBottom <= info.vh && info.focus === 'nm', JSON.stringify(info));
      await q.locator('.float .act-edit textarea.p').fill(`${'long words '.repeat(12)}end`);
      const grown = await q.evaluate(() => {
        const r = document.querySelector('[data-lab-comments]').shadowRoot;
        const row = r.querySelector('.act-edit').getBoundingClientRect();
        const menu = r.querySelector('.float > .acts').getBoundingClientRect();
        return row.bottom <= menu.bottom + 1 && row.bottom <= innerHeight;
      });
      check(eng, 'phone: the prompt grows and the row stays in view', grown);
      await q.keyboard.press('Escape');
      check(eng, 'phone: nothing saved by a hold and a cancel', (await pedit.count()) === 0 && !pputs.length);
      await pctx.close();
    } finally {
      await browser.close();
    }
  }
} finally {
  server.kill();
  fs.rmSync(DIR, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
