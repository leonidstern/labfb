// Browser checks of how a drag on a page with comments on is read, in Safari's engine (WebKit) and Chrome's, with
// Playwright: a plain drag marks an area wherever it starts (over words too) and never selects the page's text; Shift-drag
// selects words and shows the actions bar; Shift shows the text cursor; a click pins a point; a double-click selects a
// word only with Shift; the page's own fields and links keep their drags.
// Not part of `npm test`; CI runs it in the `browser` job. Run: node test/browser/selection.mjs   (needs the playwright
// package; NODE_PATH can point at a node_modules that has it). Prints one line per check and exits 1 if any fails.
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
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'labit-selection-'));
const PORT = String(5800 + Math.floor(Math.random() * 300));
const B = `http://localhost:${PORT}`;
const env = { ...process.env, LABIT_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'labit-home-')), LABIT_NO_UPDATE_CHECK: '1' };
const PAGE = `<!doctype html><meta charset="utf-8"><title>selection</title>
<style>body{margin:30px;max-width:420px;font:18px/1.6 Georgia,serif}</style>
<p id="t">Plain words to drag across in this paragraph of text, quite a few of them.</p>
<p id="u">Another paragraph with <a id="lnk" href="#x">a link right here</a> inside it.</p>
<p><input id="field" value="field text typed here"></p>
<div style="height:900px"></div>`;
let scenes = 0;
let PG = '/index';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = spawn(process.execPath, [LAB, '.', '--new', '--no-open', '--port', PORT], { cwd: DIR, env, stdio: 'ignore' }); // its log is not read: a full pipe would stop it
fs.writeFileSync(path.join(DIR, 'index.html'), PAGE);
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
const comments = async () => (await (await fetch(`${B}/_lab/api/comments?page=${PG}`)).json()).comments;
const inRoot = (p, fn) =>
  p.evaluate((src) => {
    const r = [...document.querySelectorAll('*')].find((n) => n.shadowRoot?.querySelector('.scrim'))?.shadowRoot;
    return new Function('r', `return (${src})(r)`)(r);
  }, fn.toString());
// What the widget shows: the bar, the dialog, an area drawn, a pin or box for a point.
const look = (p) =>
  inRoot(p, (r) => {
    const e = r.querySelector('.fd');
    const on = (s) => Boolean(e && !e.hidden && e.querySelector(s)?.classList.contains('on'));
    return { bar: on('.p-bar'), dlg: on('.p-dlg'), zone: r.querySelectorAll('.zone.draft').length, draftPin: r.querySelectorAll('.pin.draft').length, box: r.querySelectorAll('.float').length };
  });
const span = (p, sel, text) =>
  p.evaluate(([sel, text]) => {
    const w = document.createTreeWalker(document.querySelector(sel), NodeFilter.SHOW_TEXT);
    for (let n; (n = w.nextNode()); ) {
      const i = n.data.indexOf(text);
      if (i < 0) continue;
      const r = document.createRange();
      r.setStart(n, i);
      r.setEnd(n, i + text.length);
      const rs = [...r.getClientRects()].map((b) => b.toJSON());
      return { first: rs[0], last: rs[rs.length - 1] };
    }
  }, [sel, text]);
async function dragTo(p, [x0, y0], [x1, y1]) {
  await p.mouse.move(x0, y0);
  await p.mouse.down();
  for (let i = 1; i <= 8; i++) await p.mouse.move(x0 + ((x1 - x0) * i) / 8, y0 + ((y1 - y0) * i) / 8);
  await p.mouse.up();
}
async function dragWords(p, sel, text, shift = false) {
  const s = await span(p, sel, text);
  if (shift) await p.keyboard.down('Shift');
  await dragTo(p, [s.first.left + 1, s.first.top + s.first.height / 2], [s.last.right - 1, s.last.top + s.last.height / 2]);
  if (shift) await p.keyboard.up('Shift');
  return s;
}

async function scene(browser, run) {
  PG = `/s${++scenes}`;
  fs.writeFileSync(path.join(DIR, `${PG.slice(1)}.html`), PAGE);
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  await ctx.addInitScript(() => localStorage.setItem('lab-name', 'leo'));
  const p = await ctx.newPage();
  await p.goto(B + PG);
  await sleep(1100);
  try {
    await run(p);
  } finally {
    await ctx.close();
  }
}

try {
  for (const eng of (process.env.ENGINES || 'webkit,chromium').split(',')) {
    const browser = await pw[eng].launch();
    try {
      await scene(browser, async (p) => {
        await dragWords(p, '#t', 'words to drag');
        await sleep(500);
        const l = await look(p);
        check(eng, 'a plain drag over words marks an area, no bar', l.zone === 1 && !l.bar && !l.dlg, JSON.stringify(l));
        check(eng, '…and selects none of the page\'s text', (await p.evaluate(() => String(getSelection()))) === '');
        await p.keyboard.type('over words');
        await p.keyboard.press('Enter');
        await sleep(700);
        const c = (await comments()).find((x) => x.text === 'over words');
        check(eng, '…saved as an area anchor, not a quote', typeof c?.anchor?.zw === 'number' && !c.anchor.quote?.selected, JSON.stringify(c?.anchor?.kind));
      });
      await scene(browser, async (p) => {
        const s = await dragWords(p, '#t', 'words to drag', true);
        await sleep(700);
        const l = await look(p);
        check(eng, 'Shift-drag over words shows the actions bar, no area', l.bar && !l.zone && !l.draftPin, JSON.stringify(l));
        await p.keyboard.type('shifted');
        await sleep(700);
        await p.keyboard.press('Enter');
        await sleep(700);
        const c = (await comments()).find((x) => x.text === 'shifted');
        check(eng, '…its comment is a text anchor quoting exactly the words', c?.anchor?.kind === 'text' && c.anchor.quote?.exact === 'words to drag', JSON.stringify(c?.anchor?.quote));
        check(eng, '…the page\'s text is not left selected', (await p.evaluate(() => String(getSelection()))) === '' && Boolean(s));
      });
      await scene(browser, async (p) => {
        const s = await span(p, '#t', 'drag across');
        const x = s.first.left + 20;
        const y = s.first.top + s.first.height / 2;
        const IBEAM = 'data:image/svg+xml'; // the drawn I-beam with the green pin tip, falling back to text
        const cursor = () => p.evaluate(([x, y]) => ({ shift: document.documentElement.classList.contains('lab-shift-cur'), selectable: document.documentElement.classList.contains('lab-shift'), cursor: getComputedStyle(document.elementFromPoint(x, y)).cursor }), [x, y]);
        await p.mouse.move(x - 5, y);
        await p.mouse.move(x, y);
        await sleep(200);
        const off = await cursor();
        check(eng, 'no Shift: the pin pointer, not the text cursor', !off.shift && !off.cursor.includes(IBEAM), JSON.stringify(off));
        await p.keyboard.down('Shift');
        await sleep(200);
        const on = await cursor();
        check(eng, 'Shift held over words: the drawn I-beam with the pin tip (text as fallback)', on.shift && on.cursor.includes(IBEAM) && on.cursor.includes('%2324a046') && /,\s*text$/.test(on.cursor), JSON.stringify(on));
        await p.keyboard.up('Shift');
        const quick = await cursor(); // no waiting: the cursor follows the key at once, the text stays selectable a moment longer
        check(eng, '…right after Shift is let go the cursor is no longer the I-beam (text still selectable for the selection)', !quick.shift && !quick.cursor.includes(IBEAM) && quick.selectable, JSON.stringify(quick));
        await sleep(700);
        const back = await cursor();
        check(eng, '…Shift let go: the pin pointer again', !back.shift && !back.cursor.includes(IBEAM), JSON.stringify(back));
        const field = await p.locator('#field').boundingBox();
        await p.keyboard.down('Shift');
        await p.mouse.move(field.x + 10, field.y + 5);
        await sleep(200);
        const inField = await p.evaluate(() => getComputedStyle(document.querySelector('#field')).cursor);
        await p.keyboard.up('Shift');
        check(eng, '…and over the page\'s own input its own cursor stays', inField !== 'crosshair' && inField !== 'none', inField);
      });
      await scene(browser, async (p) => {
        await dragWords(p, '#t', 'ords to dra', true); // starts and ends inside words
        await sleep(700);
        await p.keyboard.type('snap');
        await sleep(700);
        await p.keyboard.press('Enter');
        await sleep(700);
        const c = (await comments()).find((x) => x.text === 'snap');
        check(eng, 'a Shift-drag from inside a word to inside another takes both whole words', c?.anchor?.quote?.exact === 'words to drag', JSON.stringify(c?.anchor?.quote));
      });
      await scene(browser, async (p) => {
        await dragWords(p, '#t', 'aragra', true); // inside "paragraph" only
        await sleep(700);
        await p.keyboard.type('inside');
        await sleep(700);
        await p.keyboard.press('Enter');
        await sleep(700);
        const c = (await comments()).find((x) => x.text === 'inside');
        check(eng, '…a Shift-drag inside one word keeps exactly its letters', c?.anchor?.quote?.exact === 'aragra', JSON.stringify(c?.anchor?.quote));
      });
      await scene(browser, async (p) => {
        await dragTo(p, [700, 40], [900, 120]); // right of the column: nothing to select there
        await sleep(400);
        const l = await look(p);
        check(eng, 'a drag from empty space marks an area, no bar', l.zone === 1 && !l.bar, JSON.stringify(l));
        await p.keyboard.type('area');
        await p.keyboard.press('Enter');
        await sleep(700);
        const c = (await comments()).find((x) => x.text === 'area');
        check(eng, '…saved as an area anchor', typeof c?.anchor?.zw === 'number' && c.anchor.kind !== 'text', JSON.stringify(c?.anchor?.kind));
      });
      await scene(browser, async (p) => {
        const s = await span(p, '#t', 'drag across');
        await p.mouse.click(s.first.left + 10, s.first.top + 10);
        await sleep(500);
        const l = await look(p);
        check(eng, 'a plain click on words places a point pin, no bar', l.box === 1 && !l.bar && !l.dlg, JSON.stringify(l));
        await p.keyboard.type('point');
        await p.keyboard.press('Enter');
        await sleep(700);
        const c = (await comments()).find((x) => x.text === 'point');
        check(eng, '…saved as a point (no quote selected)', Boolean(c) && !c.anchor.quote?.selected && c.anchor.zw === undefined, JSON.stringify(c?.anchor?.kind));
      });
      await scene(browser, async (p) => {
        const s = await span(p, '#t', 'paragraph');
        await p.mouse.dblclick((s.first.left + s.first.right) / 2, s.first.top + s.first.height / 2);
        await sleep(900);
        const l = await look(p);
        check(eng, 'a double-click on a word without Shift selects nothing and shows no bar', !l.bar && !l.dlg && (await p.evaluate(() => String(getSelection()))) === '', JSON.stringify(l));
      });
      await scene(browser, async (p) => {
        const s = await span(p, '#t', 'quite a few');
        await p.mouse.click(s.first.left + 10, s.first.top + 10, { clickCount: 3 });
        await sleep(900);
        const l = await look(p);
        check(eng, 'a triple-click without Shift shows no bar', !l.bar, JSON.stringify(l));
      });
      await scene(browser, async (p) => {
        const s = await span(p, '#t', 'paragraph');
        await p.keyboard.down('Shift');
        await p.mouse.dblclick((s.first.left + s.first.right) / 2, s.first.top + s.first.height / 2);
        await p.keyboard.up('Shift');
        await sleep(900);
        const l = await look(p);
        check(eng, 'Shift + double-click on a word shows the actions bar (no box left from the first click)', l.bar && !l.box && !l.draftPin, JSON.stringify(l));
        await p.keyboard.type('word');
        await sleep(700);
        await p.keyboard.press('Enter');
        await sleep(700);
        const c = (await comments()).find((x) => x.text === 'word');
        check(eng, '…quoting that word', c?.anchor?.quote?.exact === 'paragraph', JSON.stringify(c?.anchor?.quote));
      });
      await scene(browser, async (p) => {
        const s = await span(p, '#t', 'quite a few');
        await p.keyboard.down('Shift');
        await p.mouse.click(s.first.left + 10, s.first.top + 10, { clickCount: 3 });
        await p.keyboard.up('Shift');
        await sleep(900);
        const l = await look(p);
        check(eng, 'Shift + triple-click selects the paragraph and shows the actions bar', l.bar && !l.box, JSON.stringify(l));
      });
      await scene(browser, async (p) => {
        const f = await p.locator('#field').boundingBox();
        await dragTo(p, [f.x + 5, f.y + f.height / 2], [f.x + 90, f.y + f.height / 2]);
        await sleep(500);
        const l = await look(p);
        const picked = await p.evaluate(() => document.querySelector('#field').value.slice(document.querySelector('#field').selectionStart, document.querySelector('#field').selectionEnd));
        check(eng, 'a drag inside the page\'s own input selects its text and is not touched', picked.length > 3 && !l.bar && !l.zone, `${picked} ${JSON.stringify(l)}`);
      });
      await scene(browser, async (p) => {
        const s = await span(p, '#lnk', 'link right');
        await dragTo(p, [s.first.left + 2, s.first.top + 8], [s.last.right, s.last.top + 8]);
        await sleep(500);
        const l = await look(p);
        check(eng, 'a drag that starts on a link leaves the page\'s own drag (no bar, no area)', !l.bar && !l.zone, JSON.stringify(l));
      });
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
