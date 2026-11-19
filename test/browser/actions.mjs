// Action buttons (flag actions) in real browsers (WebKit and Chrome's engine): a click on a data-lab-action button opens
// a new comment on it with its words in the box, the button's own click doesn't run, the sent pin carries the action
// (and "confirm first" for data-lab-confirm) to the agent; a phone's tap does the same; with no flag nothing changes.
// Not part of `npm test`; CI runs it in the `browser` job.
// Run: node test/browser/actions.mjs (needs playwright; NODE_PATH can point at a node_modules that has it).
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
  console.log(`playwright is not installed: ${process.env.CI ? 'failed (CI)' : 'skipped'}`);
  process.exit(process.env.CI ? 1 : 0);
})();

const LAB = fileURLToPath(new URL('../../local.mjs', import.meta.url));
const env = { ...process.env, PORT: '', XDG_CONFIG_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'labit-cfg-')), LABIT_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'labit-home-')), LABIT_NO_UPDATE_CHECK: '1', LABIT_EXIT_WITH_PARENT: '1' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PAGE = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>a</title><h1>PRs</h1>' +
  '<p>#224 <button id="merge" data-lab-action="merge #224" data-lab-confirm onclick="document.title=\'ran\'">merge</button>' +
  ' <button id="explain" data-lab-action="explain #224" data-lab-action-note="in two lines">explain</button></p>';
const labs = [];
const lab = async (flags) => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'labit-actions-')));
  const port = 7400 + Math.floor(Math.random() * 400);
  fs.writeFileSync(path.join(dir, 'index.html'), PAGE);
  fs.writeFileSync(path.join(dir, 'labit.json'), JSON.stringify({ port, flags }));
  labs.push({ dir, server: spawn(process.execPath, [LAB, '--new', '--no-open'], { cwd: dir, env }) });
  const b = `http://localhost:${port}`;
  for (let i = 0; i < 80; i++) {
    try {
      await fetch(b + '/');
      break;
    } catch {
      await sleep(100);
    }
  }
  return b;
};
let failed = 0;
const check = (eng, name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${eng.padEnd(8)} ${name}${detail ? ` (${detail})` : ''}`);
};
const boxText = (p) => p.evaluate(() => [...document.querySelectorAll('[data-lab-comments]')].map((n) => n.shadowRoot?.querySelector('.float textarea')?.value).find((v) => v !== undefined) ?? null);

// Your actions' "…" list, edited in place (Leo, 19 Nov, "C"): a right-click or a hold turns that row editable where it
// is (no form, no boxes); Enter in the name goes to the prompt, Enter there saves through PUT /_lab/api/actions,
// Shift+Enter is a new line, Escape or a tap elsewhere cancels (and the tap uses nothing), "+ add" opens an empty row,
// "delete" saves the list without it. Nothing is ever saved: the PUT and any comment POST are aborted here.
const W = (fn, arg) => `(() => { const r = [...document.querySelectorAll('[data-lab-comments]')].map((n) => n.shadowRoot).find((s) => s?.querySelector('.float')); return (${fn})(r, ${JSON.stringify(arg ?? null)}); })()`;
const editTest = async (eng, browser, B, phone) => {
  const tag = phone ? `${eng}/ph` : eng;
  const ctx = await browser.newContext(phone ? { ...pw.devices['iPhone 13'], defaultBrowserType: undefined } : { viewport: { width: 1000, height: 700 } });
  await ctx.addInitScript(() => (localStorage.setItem('lab-name', 'zz'), localStorage.setItem('lab-on', '1'), localStorage.setItem('lab-hint-seen', '1')));
  const puts = [];
  let posts = 0;
  await ctx.route('**/_lab/api/actions**', (r) => (r.request().method() === 'GET' ? r.continue() : (puts.push(r.request().postDataJSON()), r.abort())));
  await ctx.route('**/_lab/api/comments**', (r) => (r.request().method() === 'GET' ? r.continue() : (posts++, r.abort())));
  const p = await ctx.newPage();
  const ev = (fn, arg) => p.evaluate(W(fn, arg));
  await p.goto(B + '/');
  await sleep(2500);
  await (phone ? p.tap('#explain') : p.click('#explain'));
  await sleep(400);
  await ev((r) => r.querySelector('[data-k="…"]').click());
  await sleep(400);
  const state = () => ev((r) => {
    const row = r.querySelector('.act.act-edit');
    const a = r.activeElement;
    return { rows: r.querySelectorAll('.act-edit').length, form: r.querySelectorAll('form.act-edit, .act-btns').length, name: row?.querySelector('input.nm')?.value ?? null, prompt: row?.querySelector('textarea.p')?.value ?? null,
      cnt: row?.querySelector('.cnt')?.textContent ?? null, why: row?.querySelector('.why')?.textContent ?? null, del: row ? !row.querySelector('.del').hidden : null, focus: a ? a.className : '', last: row ? !row.nextElementSibling?.classList.contains('act') : null,
      font: row ? getComputedStyle(row.querySelector('input.nm')).fontSize : '', ring: row ? getComputedStyle(row.querySelector('textarea.p')).borderTopWidth : '', menu: !r.querySelector('.acts:not(.row)')?.hidden };
  });
  const rowAt = (name) => ev((r, n) => { const u = r.querySelector(`.use[data-act="${n}"]`); u.scrollIntoView({ block: 'nearest' }); const b = u.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; }, name);
  const holdRow = async (name) => {
    if (!phone) {
      const [x, y] = await rowAt(name);
      await p.mouse.move(x, y);
      await p.mouse.down();
      await sleep(600);
      return p.mouse.up();
    }
    // A finger's hold: pointer events as a touch makes them (Playwright has no long press), then the lift.
    await ev((r, n) => { const u = r.querySelector(`.use[data-act="${n}"]`); const b = u.getBoundingClientRect(); u.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true, pointerType: 'touch', isPrimary: true, button: 0, clientX: b.x + 5, clientY: b.y + 5 })); }, name);
    await sleep(600);
    await ev((r, n) => { const u = r.querySelector(`.use[data-act="${n}"]`); u.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, composed: true, pointerType: 'touch', isPrimary: true, button: 0 })); u.click(); }, name);
  };
  const press = (k) => p.keyboard.press(k);

  // A hold edits that row in place.
  await holdRow('fix');
  await sleep(300);
  let s = await state();
  check(tag, 'a hold turns that row editable in place: name and full prompt, no form, no boxes', s.rows === 1 && s.form === 0 && s.name === 'fix' && s.prompt === 'Fix this: it is broken or wrong.' && s.ring === '0px' && s.menu, JSON.stringify(s));
  check(tag, 'the name has the focus (after the lift), no counter far from the limit', s.focus === 'nm' && s.cnt === '', `${s.focus} ${s.cnt}`);
  check(tag, 'the hold used nothing', posts === 0, String(posts));
  if (phone) check(tag, 'phone fields are 16px (no zoom on focus)', s.font === '16px', s.font);
  // 7 letters just stop; the counter shows near the end.
  await press('End');
  await p.keyboard.type('xxx');
  s = await state();
  check(tag, '"6/7" near the limit', s.name === 'fixxxx' && s.cnt === '6/7', JSON.stringify([s.name, s.cnt]));
  await p.keyboard.type('yyyy');
  s = await state();
  check(tag, 'the name stops at 7', s.name.length === 7 && s.cnt === '7/7', JSON.stringify([s.name, s.cnt]));
  await press('Escape');
  s = await state();
  check(tag, 'Escape cancels: the row is as it was, nothing saved', s.rows === 0 && s.menu && puts.length === 0 && (await ev((r) => r.querySelector('.use[data-act="fix"]')?.hidden === false)), JSON.stringify(s));

  // Right-click (computers) or a hold again; Enter goes on to the prompt, Shift+Enter is a new line, Enter saves.
  if (phone) await holdRow('like');
  else {
    const [x, y] = await rowAt('like');
    await p.mouse.click(x, y, { button: 'right' });
  }
  await sleep(300);
  await press('End');
  await press('Enter');
  s = await state();
  check(tag, 'Enter in the name goes to the prompt', s.focus === 'p', s.focus);
  await press('End');
  await p.keyboard.type(' more');
  await press('Shift+Enter');
  await p.keyboard.type('two');
  s = await state();
  check(tag, 'Shift+Enter is a new line in the prompt', /more\ntwo$/.test(s.prompt), JSON.stringify(s.prompt));
  await press('Enter');
  await sleep(400);
  s = await state();
  const put = puts.at(-1)?.actions;
  check(tag, 'Enter saves the whole list through PUT /_lab/api/actions', puts.length === 1 && put?.[3]?.name === 'like' && /more\ntwo$/.test(put[3].prompt) && put.length === 7, JSON.stringify(put?.[3]));
  check(tag, 'a lab that did not answer keeps the row open and says so', s.rows === 1 && /not answering/.test(s.why), JSON.stringify(s.why));

  // A tap elsewhere in the list cancels and is only that: the row tapped is not used.
  const [fx, fy] = await rowAt('move');
  await (phone ? p.touchscreen.tap(fx, fy) : p.mouse.click(fx, fy));
  await sleep(400);
  s = await state();
  check(tag, 'a tap on another row cancels, and uses nothing', s.rows === 0 && s.menu && posts === 0, JSON.stringify({ rows: s.rows, menu: s.menu, posts }));

  // + add: an empty row at the end, in the same state; Escape takes it away.
  await ev((r) => r.querySelector('.acts .add').click());
  await sleep(300);
  s = await state();
  check(tag, '"+ add" opens an empty row at the end, editable, no delete', s.rows === 1 && s.name === '' && s.prompt === '' && s.last && !s.del, JSON.stringify(s));
  await press('Escape');
  s = await state();
  check(tag, 'Escape takes the empty row away', s.rows === 0 && (await ev((r) => r.querySelectorAll('.act-list > .act').length)) === 7);

  // delete: no confirm, saves the list without it.
  await holdRow('remove');
  await sleep(300);
  await ev((r) => r.querySelector('.act-edit .del').click());
  await sleep(400);
  const after = puts.at(-1)?.actions?.map((a) => a.name).join(',');
  check(tag, 'delete saves the list without that row, no confirm', puts.length === 2 && after === 'go,fix,like,move,states,variant', after);

  // Phones: the row being edited stays in view inside the sheet when the list is short (a keyboard).
  if (phone) {
    await press('Escape');
    await ev((r) => (r.querySelector('.acts:not(.row)').style.maxHeight = '120px'));
    await holdRow('variant');
    await sleep(400);
    const seen = await ev((r) => { const m = r.querySelector('.acts:not(.row)').getBoundingClientRect(); const b = r.querySelector('.act-edit').getBoundingClientRect(); return b.top >= m.top - 1 && Math.min(b.bottom, m.bottom) > b.top + 20; });
    check(tag, 'the edited row is scrolled into view inside the sheet', seen);
  }
  await ctx.close();
};

try {
  const OFF = await lab({});
  for (const eng of (process.env.ENGINES || 'webkit,chromium').split(',')) {
    const B = await lab({ actions: true }); // a lab per engine: no pin from the other one
    const browser = await pw[eng].launch();
    try {
      for (const phone of [true, false]) // the phone first: it sends nothing, so no pin stands over a button
        for (const id of ['explain', 'merge']) {
          const tag = phone ? `${eng}/ph` : eng;
          const ctx = await browser.newContext(phone ? { ...pw.devices['iPhone 13'], defaultBrowserType: undefined } : { viewport: { width: 1000, height: 700 } });
          await ctx.addInitScript(() => (localStorage.setItem('lab-name', 'zz'), localStorage.setItem('lab-on', '1'), localStorage.setItem('lab-hint-seen', '1')));
          const p = await ctx.newPage();
          await p.goto(B + '/');
          await sleep(2500);
          await (phone ? p.tap(`#${id}`) : p.click(`#${id}`));
          await sleep(400);
          if (id === 'explain') check(tag, 'explain opens the box with its words and note', (await boxText(p)) === 'explain #224\nin two lines', String(await boxText(p)));
          else {
            check(tag, "merge opens the box, the button's own click doesn't run", (await boxText(p)) === 'merge #224' && (await p.title()) === 'a', await p.title());
            if (phone) {
              await ctx.close();
              continue;
            }
            const sent = p.waitForRequest((r) => r.url().endsWith('/_lab/api/comments') && r.method() === 'POST');
            await p.evaluate(() => [...document.querySelectorAll('[data-lab-comments]')].map((n) => n.shadowRoot?.querySelector('.float .send')).find(Boolean)?.click());
            const body = (await sent).postDataJSON();
            check(tag, 'the pin carries the action and confirm', body.text === 'merge #224' && body.anchor.act === 'merge #224' && body.anchor.confirm === true, JSON.stringify({ t: body.text, a: body.anchor.act, c: body.anchor.confirm }));
            await sleep(500);
            const agent = await (await fetch(`${B}/_lab/agent${body.page}`)).text();
            check(tag, 'the agent reads the action and confirm first', /action: merge #224 — confirm first: say what will happen and wait for the person's ✓/.test(agent), agent.slice(0, 300));
          }
          await ctx.close();
        }
      const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
      await ctx.addInitScript(() => (localStorage.setItem('lab-name', 'zz'), localStorage.setItem('lab-on', '1')));
      const p = await ctx.newPage();
      await p.goto(OFF + '/');
      await sleep(2500);
      await p.click('#merge');
      await sleep(400);
      check(eng, 'no flag: the button is the page\'s own', (await p.title()) === 'ran' && (await boxText(p)) === null);
      await ctx.close();
      for (const phone of [false, true]) await editTest(eng, browser, B, phone);
    } finally {
      await browser.close();
    }
  }
} finally {
  for (const l of labs) {
    l.server.kill();
    fs.rmSync(l.dir, { recursive: true, force: true });
  }
}
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
