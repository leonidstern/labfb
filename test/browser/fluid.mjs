// Browser checks of the fluid comment on selected words (the dialog that opens at once, moving as a comment card does; phones: the bar and the sheet), in Safari's
// engine (WebKit) and Chrome's, with Playwright. Not part of `npm test`; CI runs it in the `browser` job.
// Run: node test/browser/fluid.mjs   (needs the playwright package; NODE_PATH can point at a node_modules that has it).
// Prints one line per check and exits 1 if any fails. docs: the spec is labit-md-research/specs/a-fluid-dialog.md.
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
let DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'labit-fluid-'));
const PORT = String(5500 + Math.floor(Math.random() * 300));
let B = `http://localhost:${PORT}`;
const env = { ...process.env, LABIT_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'labit-home-')), LABIT_NO_UPDATE_CHECK: '1' };
const LONG = 'This is a very long paragraph meant to be selected whole, it keeps going and going with plenty of words so that the selection runs over several lines of the window, and then it goes on a little more for good measure, with yet more words to be sure that it is over three hundred characters long, until finally it ends.';
const PAGE = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>fluid</title>
<style>body{margin:30px;max-width:520px;font:18px/1.6 Georgia,serif} #box{height:96px;overflow:auto;border:1px solid #999} #field{width:200px}</style>
<p id="a">Alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike.</p>
<p id="b">November oscar papa quebec romeo sierra tango uniform victor whiskey.</p>
<div id="box"><p>One two three four five.</p><p>Six seven eight nine ten.</p><p id="in">Inside the scrolling box sits this target phrase for review.</p><p>More lines here.</p><p>And more lines there.</p></div>
<p id="same1">Repeat these exact words please.</p>
<p>Something between the two.</p>
<p id="same2">Repeat these exact words please.</p>
<p id="he" dir="rtl" lang="he">זה טקסט בעברית לבדיקה של הכיוון</p>
<p id="long">${LONG}</p>
<p><input id="field"></p>
<div style="height:1600px"></div>
<p id="end">Words at the very end of the page.</p>`;
// Every scene's page exists before the lab starts: it watches files it already knows for saves.
for (let i = 0; i <= 100; i++) fs.writeFileSync(path.join(DIR, i ? `s${i}.html` : 'index.html'), PAGE);

const server = spawn(process.execPath, [LAB, '.', '--new', '--no-open', '--port', PORT], { cwd: DIR, env, stdio: 'ignore' }); // its log is not read: a full pipe would stop it
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 80; i++) {
  try {
    await fetch(B + '/');
    break;
  } catch {
    await sleep(100);
  }
}
// A second lab whose labit.json changes the actions (go, then two of your own): scenes run in it through withLab2.
const DIR2 = fs.mkdtempSync(path.join(os.tmpdir(), 'labit-fluid-actions-'));
const PORT2 = String(5850 + Math.floor(Math.random() * 100));
const B2 = `http://localhost:${PORT2}`;
fs.writeFileSync(path.join(DIR2, 'labit.json'), JSON.stringify({ actions: { words: ['go', { label: 'tighter', send: 'Tighter: less space' }, { label: 'shorter', send: 'Shorter: half the words' }] } }));
for (let i = 0; i <= 100; i++) fs.writeFileSync(path.join(DIR2, i ? `s${i}.html` : 'index.html'), PAGE);
const server2 = spawn(process.execPath, [LAB, '.', '--new', '--no-open', '--port', PORT2], { cwd: DIR2, env: { ...env, XDG_CONFIG_HOME: path.join(DIR2, 'nobody') }, stdio: 'ignore' });
for (let i = 0; i < 80; i++) {
  try {
    await fetch(B2 + '/');
    break;
  } catch {
    await sleep(100);
  }
}
const withLab2 = async (fn) => {
  const was = [B, DIR];
  [B, DIR] = [B2, DIR2];
  try {
    await fn();
  } finally {
    [B, DIR] = was;
  }
};
let failed = 0;
const check = (eng, name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${eng.padEnd(8)} ${name}${detail ? ` (${detail})` : ''}`);
};
// Each scene has a page of its own (its pins and kept words are per page), so what one leaves can't reach the next.
let PG = '/index';
let scenes = 0;
const comments = async () => (await (await fetch(`${B}/_lab/api/comments?page=${PG}`)).json()).comments;
const save = (html) => fs.writeFileSync(path.join(DIR, `${PG.slice(1)}.html`), html);
const near = (a, b, tol = 3) => Math.abs(a - b) <= tol;

// Inside the widget's shadow root: fn(root, arg) runs there.
const inRoot = (p, fn, arg) =>
  p.evaluate(([src, a]) => {
    const r = [...document.querySelectorAll('*')].find((n) => n.shadowRoot?.querySelector('.scrim'))?.shadowRoot;
    return new Function('r', 'a', `return (${src})(r, a)`)(r, a);
  }, [fn.toString(), arg]);
// The one element now: null when it isn't showing; else which pane, where it is on screen, what runs on it.
// Waits for fn(root, arg) to be true inside the widget's shadow root.
const untilRoot = (p, fn, arg, ms) =>
  p.waitForFunction(([src, a]) => {
    const r = [...document.querySelectorAll('*')].find((n) => n.shadowRoot?.querySelector('.scrim'))?.shadowRoot;
    return Boolean(r) && new Function('r', 'a', `return (${src})(r, a)`)(r, a);
  }, [fn.toString(), arg], { timeout: ms, polling: 'raf' }).catch(() => {});
// The dialog is up and still: its place has not moved for 300 ms (on a slow machine a fixed wait is not always enough
// for its animation: a CI run in Linux WebKit read it 5 px low).
const dlgUp = async (p, ms = 2500) => {
  await p.waitForFunction(() => {
    const r = [...document.querySelectorAll('*')].find((n) => n.shadowRoot)?.shadowRoot;
    const e = r?.querySelector('.fd');
    if (!e || e.hidden || !e.querySelector('.p-dlg')?.classList.contains('on')) return false;
    const b = e.getBoundingClientRect();
    const k = [b.x, b.y, b.width, b.height].join();
    const w = window.__dlgRect;
    const now = performance.now();
    if (!w || w.k !== k) { window.__dlgRect = { k, t: now }; return false; }
    return now - w.t > 300;
  }, null, { timeout: ms, polling: 'raf' }).catch(() => {});
};
const fd = (p) =>
  inRoot(p, (r) => {
    const e = r.querySelector('.fd');
    if (!e || e.hidden) return null;
    const box = e.getBoundingClientRect();
    return {
      bar: e.querySelector('.p-bar').classList.contains('on'),
      dlg: e.querySelector('.p-dlg').classList.contains('on'),
      x: box.x, y: box.y, w: box.width, h: box.height, cls: e.className, opacity: +getComputedStyle(e).opacity,
      anims: e.getAnimations().length,
      text: e.querySelector('textarea')?.value ?? null,
      cut: Boolean(e.querySelector('[data-k=cut]')), rewrite: Boolean(e.querySelector('[data-k=rewrite]')),
      lit: e.querySelector('.quick .hl')?.textContent || '',
    };
  });
// The comment card's motion (animation, length, curve, fill) read off a probe .card with the class, next to what the
// element `pick` (an expression on the root r) runs: the widget's own pieces must move exactly as a card does.
const motion = (p, pick, cls) =>
  inRoot(p, (r, [pick, cls]) => {
    const probe = document.createElement('div');
    probe.className = `card ${cls}`;
    r.append(probe);
    const want = (e) => { const c = e && getComputedStyle(e); return c ? [c.animationName, c.animationDuration, c.animationTimingFunction, c.animationFillMode].join(' ') : 'none'; };
    const out = { card: want(probe), mine: want(new Function('r', `return ${pick}`)(r)) };
    probe.remove();
    return out;
  }, [pick, cls]);
// Corners inside corners: for each inner part of the outer one, its radius plus the gap to the outer's nearest edge
// equals the outer's radius (the rounded corners run concentric). `sides`: which gaps count (all four by default).
const concentric = (p, outer, inner, sides = ['left', 'top', 'right', 'bottom']) =>
  inRoot(p, (r, [outer, inner, sides]) => {
    const o = r.querySelector(outer);
    const ob = o.getBoundingClientRect();
    const R = parseFloat(getComputedStyle(o).borderTopLeftRadius);
    const parts = [...r.querySelectorAll(inner)].map((e) => {
      const b = e.getBoundingClientRect();
      const gaps = { left: b.left - ob.left, top: b.top - ob.top, right: ob.right - b.right, bottom: ob.bottom - b.bottom };
      const inset = Math.min(...sides.map((k) => gaps[k]));
      const ri = parseFloat(getComputedStyle(e).borderTopLeftRadius);
      return { what: e.dataset.k || e.className, ri, inset: +inset.toFixed(2), R, ok: Math.abs(ri + inset - R) < 0.6 };
    });
    return { n: parts.length, bad: parts.filter((x) => !x.ok), sample: parts[0] };
  }, [outer, inner, sides]);
const draftPin = (p) => inRoot(p, (r) => r.querySelectorAll('.pin.draft').length);
// Where words are on screen: the boxes of the nth place `text` is found in the element.
const span = (p, sel, text, nth = 0) =>
  p.evaluate(([sel, text, nth]) => {
    const w = document.createTreeWalker(document.querySelector(sel), NodeFilter.SHOW_TEXT);
    for (let n, seen = 0; (n = w.nextNode()); ) {
      const i = n.data.indexOf(text);
      if (i < 0 || seen++ < nth) continue;
      const r = document.createRange();
      r.setStart(n, i);
      r.setEnd(n, i + text.length);
      const rs = [...r.getClientRects()].map((b) => b.toJSON());
      return { first: rs[0], last: rs[rs.length - 1] };
    }
  }, [sel, text, nth]);
// A drag over the words (Shift held unless plain), let go at their end.
async function drag(p, sel, text, { plain = false, nth = 0 } = {}) {
  const s = await span(p, sel, text, nth);
  const [x0, y0] = [s.first.left + 1, s.first.top + s.first.height / 2];
  const [x1, y1] = [s.last.right - 1, s.last.top + s.last.height / 2];
  if (!plain) await p.keyboard.down('Shift');
  await p.mouse.move(x0, y0);
  await p.mouse.down();
  for (let i = 1; i <= 8; i++) await p.mouse.move(x0 + ((x1 - x0) * i) / 8, y0 + ((y1 - y0) * i) / 8);
  await p.mouse.up();
  if (!plain) await p.keyboard.up('Shift');
  return s;
}
const sent = async (text) => (await comments()).find((c) => c.text === text);
const typed = (p) => p.evaluate((pg) => localStorage.getItem(`lab-typing:${pg}:new`), PG);
const spot = (p) => p.evaluate((pg) => localStorage.getItem(`lab-spot:${pg}`), PG);

// One page in a fresh browser context, so what a scene leaves in the browser's storage doesn't reach the next one.
async function scene(eng, browser, opts, run) {
  PG = `/s${++scenes}`;
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 }, ...opts });
  await ctx.addInitScript(() => localStorage.setItem('lab-name', 'leo'));
  const p = await ctx.newPage();
  await p.goto(B + PG);
  await sleep(1100);
  try {
    await run(p, ctx);
  } finally {
    await ctx.close();
  }
}

try {
  for (const eng of (process.env.ENGINES || 'webkit,chromium').split(',')) {
    const browser = await pw[eng].launch();
    try {
      // Selecting opens the dialog
      await scene(eng, browser, {}, async (p) => {
        const s = await drag(p, '#a', 'delta echo foxtrot');
        await dlgUp(p);
        const c = await fd(p);
        check(eng, 'shift-drag opens the dialog at once at the words\' end: no bar, the cursor in its box', Boolean(c?.dlg && !c.bar) && c.text === '' && near(c.x, s.last.right - 70, 4) && near(c.y, s.last.bottom + 8, 4) && (await inRoot(p, (r) => r.activeElement?.localName === 'textarea')), JSON.stringify([c, s.last]));
        const names = await inRoot(p, (r) => [...r.querySelectorAll('.p-dlg .quick button')].map((b) => b.textContent).join(' '));
        check(eng, 'its row is rewrite · cut · go (the box is the comment), no draft pin', names === 'rewrite cut go' && (await draftPin(p)) === 0, names);
        await p.mouse.move(c.x + c.w / 2, c.y + c.h / 2);
        await sleep(300);
        check(eng, 'resting the mouse on it changes nothing', Boolean((await fd(p))?.dlg));
        // No scrollbar while the box can still grow; one only once it is at its tallest (Leo, 18 Nov).
        await p.keyboard.type('a short note');
        const short = await inRoot(p, (r) => getComputedStyle(r.querySelector('.p-dlg textarea')).overflowY);
        await p.keyboard.type(' and more words'.repeat(40));
        const long = await inRoot(p, (r) => { const t = r.querySelector('.p-dlg textarea'); return { o: getComputedStyle(t).overflowY, h: t.clientHeight }; });
        check(eng, 'the box shows no scrollbar until it is at its tallest', short === 'hidden' && long.o === 'auto' && long.h >= 190, JSON.stringify({ short, long }));
      });
      // Comment preopened (Leo, 18 Nov): the dialog and the sheet open as a comment (the row has rewrite · cut · go, no pill for comment) with the box open; computers have the cursor in it
      await scene(eng, browser, {}, async (p) => {
        await drag(p, '#a', 'delta echo');
        await dlgUp(p);
        await p.keyboard.type('x');
        await sleep(800);
        const st = await inRoot(p, (r) => ({ on: [...r.querySelectorAll('.p-dlg .quick .on')].map((b) => b.dataset.k), others: [...r.querySelectorAll('.p-dlg .quick button')].map((b) => b.dataset.k).join(' '), open: r.querySelector('.p-dlg .box')?.classList.contains('open'), focus: r.activeElement?.localName }));
        check(eng, 'the dialog is a comment (no button for it), the box open and the cursor in it, typed letters in it; rewrite, cut, go one tap away', st.on.length === 0 && st.open && st.focus === 'textarea' && st.others === 'rewrite cut go', JSON.stringify(st));
      });
      await scene(eng, browser, { viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true }, async (p) => {
        await p.evaluate(() => {
          const w = document.createTreeWalker(document.querySelector('#a'), NodeFilter.SHOW_TEXT);
          const n = w.nextNode();
          const r = document.createRange();
          r.setStart(n, 0);
          r.setEnd(n, 11);
          getSelection().removeAllRanges();
          getSelection().addRange(r);
        });
        await sleep(1200);
        await inRoot(p, (r) => r.querySelector('.p-bar [data-k=comment]').click());
        await sleep(1200);
        const st = await inRoot(p, (r) => ({ on: [...r.querySelectorAll('.float:not(.p-dlg *) .quick .on')].map((b) => b.dataset.k), open: r.querySelector('.float:not(.p-dlg *) .box')?.classList.contains('open'), focus: r.activeElement?.localName || null, n: r.querySelectorAll('.float:not(.p-dlg *) .quick button').length }));
        check(eng, 'phones: the sheet opens as a comment with the box open, no keyboard until it is tapped', st.on.length === 0 && st.open && st.focus !== 'textarea' && st.n === 3, JSON.stringify(st));
      });
      await scene(eng, browser, {}, async (p) => {
        await drag(p, '#a', 'delta echo');
        await dlgUp(p);
        await inRoot(p, (r) => r.querySelector('.p-dlg [data-k=cut]').click());
        await sleep(1500);
        check(eng, 'cut in the dialog sends at once', Boolean(await sent('Cut: “delta echo”')) && (await fd(p)) === null, JSON.stringify((await comments()).map((x) => x.text)));
      });
      await scene(eng, browser, {}, async (p) => {
        await drag(p, '#a', 'kilo lima');
        await dlgUp(p);
        await inRoot(p, (r) => [...r.querySelectorAll('.p-dlg .quick button')].pop().click());
        await sleep(1500);
        const pinned = await inRoot(p, (r) => r.querySelectorAll('button.pin').length);
        check(eng, 'go in the dialog sends a comment saying go on the words at once', Boolean(await sent('go')) && (await sent('go')).anchor?.quote?.exact === 'kilo lima' && pinned === 1 && (await fd(p)) === null, `${pinned} ${JSON.stringify(await sent('go'))}`);
      });
      await scene(eng, browser, {}, async (p) => {
        await drag(p, '#a', 'golf hotel');
        await dlgUp(p);
        await inRoot(p, (r) => r.querySelector('.p-dlg [data-k=rewrite]').click());
        await sleep(1500);
        check(eng, 'rewrite in the dialog sends Rewrite: “words” at once', Boolean(await sent('Rewrite: “golf hotel”')) && (await fd(p)) === null, JSON.stringify((await comments()).map((x) => x.text)));
      });
      await scene(eng, browser, {}, async (p) => {
        await drag(p, '#long', LONG.slice(0, 340));
        await dlgUp(p);
        const names = await inRoot(p, (r) => [...r.querySelectorAll('.p-dlg .quick button')].map((b) => b.textContent).join(' '));
        check(eng, 'over 300 characters the dialog has no cut or rewrite', names === 'go', names);
      });
      await scene(eng, browser, {}, async (p) => {
        await p.evaluate(() => scrollTo(0, document.querySelector('#end').getBoundingClientRect().top + scrollY - 640));
        await sleep(200);
        const s = await drag(p, '#end', 'the page.'); // right of the listening pill, which covers the line's start
        await sleep(700);
        const c = await fd(p);
        check(eng, 'on the window\'s last line the dialog goes above the words', Boolean(c?.dlg) && c.y + c.h <= s.first.top, JSON.stringify([c, s.first]));
      });
      await scene(eng, browser, {}, async (p) => {
        await p.evaluate(() => (document.querySelector('#box').scrollTop = 80)); // the phrase near the box's top: a drag near its bottom edge scrolls it in Chrome
        await sleep(100);
        await drag(p, '#in', 'target phrase');
        await dlgUp(p);
        const was = await fd(p);
        await p.evaluate(() => (document.querySelector('#box').scrollTop = 100));
        await sleep(600);
        const now = await fd(p);
        check(eng, 'the dialog follows its words in a scrolling box', Boolean(was && now) && near(was.y - now.y, 20, 2), `${was?.y} → ${now?.y}`);
      });

      // The box joins: a typed letter, Tab, Space, keys that are not ours
      await scene(eng, browser, {}, async (p) => {
        await drag(p, '#a', 'delta echo');
        await dlgUp(p);
        await p.keyboard.type('q');
        await sleep(800);
        const c = await fd(p);
        check(eng, 'a typed letter adds the box, and is its first', Boolean(c?.dlg) && c.text === 'q' && c.cut && (await draftPin(p)) === 0, JSON.stringify(c));
        await p.keyboard.type('uick');
        check(eng, '…and the next keys go into the box', (await fd(p)).text === 'quick');
      });

      // Action keys
      await scene(eng, browser, {}, async (p) => {
        await drag(p, '#a', 'delta echo');
        await dlgUp(p);
        const before = await inRoot(p, (r) => r.querySelector('.p-dlg .quick').classList.contains('alt'));
        await p.keyboard.down('Alt');
        await sleep(200);
        const nums = await inRoot(p, (r) => [...r.querySelectorAll('.p-dlg .quick button')].map((b) => getComputedStyle(b, '::after').content).join(' '));
        await p.keyboard.up('Alt');
        await sleep(200);
        const after = await inRoot(p, (r) => r.querySelector('.p-dlg .quick').classList.contains('alt'));
        check(eng, 'holding Option shows the number on each button, letting go hides them', !before && after === false && nums === '"1" "2" "3"', JSON.stringify([before, nums, after]));
        await p.keyboard.press('Alt+Digit2');
        await sleep(1200);
        check(eng, 'Option+2 runs the second button: cut', Boolean(await sent('Cut: “delta echo”')), JSON.stringify((await comments()).map((x) => x.text)));
      });
      await scene(eng, browser, {}, async (p) => {
        await drag(p, '#a', 'golf hotel');
        await dlgUp(p);
        await p.keyboard.press('Alt+Digit1');
        await sleep(1000);
        check(eng, 'Option+1 sends Rewrite: “words” at once', Boolean(await sent('Rewrite: “golf hotel”')), JSON.stringify((await comments()).map((x) => x.text)));
      });
      await scene(eng, browser, {}, async (p) => {
        await drag(p, '#a', 'india juliet');
        await dlgUp(p);
        await p.keyboard.type('/etc');
        await p.keyboard.press('Alt+Digit9');
        await sleep(300);
        await p.keyboard.press('Enter');
        await sleep(600);
        check(eng, 'a / is plain text now, and Option+9 (no such button) does nothing', Boolean(await sent('/etc')), JSON.stringify([await fd(p), (await comments()).map((x) => x.text)]));
      });
      await scene(eng, browser, {}, async (p) => {
        await drag(p, '#a', 'kilo lima');
        await dlgUp(p);
        await p.keyboard.press('Alt+Digit3');
        await sleep(1000);
        check(eng, 'Option+3 sends go', Boolean(await sent('go')));
      });

      // Escape
      await scene(eng, browser, {}, async (p) => {
        await drag(p, '#a', 'delta echo');
        await dlgUp(p);
        await p.keyboard.type('words I will drop');
        await p.keyboard.press('Escape');
        await sleep(500);
        check(eng, 'Esc closes it: nothing sent, no kept words, no kept spot', (await fd(p)) === null && !(await typed(p)) && !(await spot(p)) && !(await sent('words I will drop')), `${await typed(p)} ${await spot(p)}`);
        await p.reload();
        await sleep(1200);
        check(eng, '…and a reload gives nothing back', (await fd(p)) === null && (await draftPin(p)) === 0);
      });
      await scene(eng, browser, {}, async (p) => {
        await drag(p, '#a', 'delta echo');
        await sleep(100);
        const arrive = await motion(p, "r.querySelector('.fd')", 'in');
        check(eng, 'the dialog arrives with the comment card\'s motion (same animation, length and curve)', arrive.card.startsWith('lab-in ') && arrive.mine === arrive.card, JSON.stringify(arrive));
        const geo = await fd(p);
        check(eng, '…the dialog is the box at once: no growing, nothing animating but the arrival', Boolean(geo?.dlg) && geo.cls.includes('in') && !geo.cls.includes('grow'), JSON.stringify(geo));
        await sleep(400);
        check(eng, '…and there is one element', (await inRoot(p, (r) => r.querySelectorAll('.fd').length)) === 1);
      });
      await scene(eng, browser, {}, async (p) => {
        await drag(p, '#a', 'delta echo');
        await dlgUp(p);
        await p.keyboard.press('Escape');
        await sleep(40);
        const leave = await motion(p, "r.querySelector('.fd')", 'out');
        check(eng, 'the dialog leaves with the card\'s motion too', leave.card.startsWith('lab-out ') && leave.mine === leave.card, JSON.stringify(leave));
        await sleep(300);
        check(eng, 'Esc lets it go', (await fd(p)) === null);
      });

      // Corners inside corners: inner radius + gap = outer radius (computers: the dialog's buttons and box 8 px in)
      await scene(eng, browser, {}, async (p) => {
        await drag(p, '#a', 'delta echo');
        await dlgUp(p);
        const dlg = await concentric(p, '.fd:not(.out)', '.p-dlg .quick button, .p-dlg .box');
        check(eng, 'the dialog\'s buttons and its box are concentric with its corners (radius + gap = outer radius)', dlg.n === 4 && dlg.bad.length === 0, JSON.stringify(dlg));
      });
      // …phones (a touch viewport: bigger corners): the bar, and the sheet the box opens in
      await scene(eng, browser, { viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true }, async (p) => {
        await p.evaluate(() => {
          const w = document.createTreeWalker(document.querySelector('#a'), NodeFilter.SHOW_TEXT);
          const n = w.nextNode();
          const r = document.createRange();
          r.setStart(n, 0);
          r.setEnd(n, 11);
          getSelection().removeAllRanges();
          getSelection().addRange(r);
        });
        await sleep(1200);
        const bar = await concentric(p, '.fd:not(.out)', '.p-bar button');
        check(eng, 'phones: the bar\'s buttons are concentric with its corners', bar.n === 4 && bar.bad.length === 0 && bar.sample.R > 18, JSON.stringify(bar));
        await inRoot(p, (r) => r.querySelector('.p-bar [data-k=comment]').click());
        await sleep(1200);
        const sheet = await concentric(p, '.float:not(.out, .p-dlg *)', '.float:not(.p-dlg *) > .quick button:first-child, .float:not(.p-dlg *) > .composer .box', ['left', 'right']);
        check(eng, '…and the sheet\'s first button and box (12 px in from its corners)', sheet.n === 2 && sheet.bad.length === 0 && sheet.sample.R > 24, JSON.stringify(sheet));
      });
      // …computers: a comment on a spot is one card like the dialog on words, its box 8 px in and concentric with it
      await scene(eng, browser, {}, async (p) => {
        const a = await p.evaluate(() => document.querySelector('#b').getBoundingClientRect().toJSON());
        await p.mouse.click(a.right + 120, a.top + a.height / 2);
        await untilRoot(p, (r) => { const f = r.querySelector('.float:not(.p-dlg *)'); return Boolean(f?.querySelector('.box')) && f.getAnimations().length === 0; }, null, 1200);
        const card = await inRoot(p, (r) => { const f = getComputedStyle(r.querySelector('.float:not(.p-dlg *)')); return { bg: f.backgroundColor, pad: f.paddingTop, shadow: f.boxShadow !== 'none' }; });
        const spot = await concentric(p, '.float:not(.out, .p-dlg *)', '.float:not(.p-dlg *) .box');
        check(eng, 'a spot\'s comment is one card (background, shadow, 8 px in) with its box concentric inside', card.bg !== 'rgba(0, 0, 0, 0)' && card.pad === '8px' && card.shadow && spot.n === 1 && spot.bad.length === 0, JSON.stringify({ card, spot }));
      });

      // Picking an action shows it on; picking it again goes back to the plain comment
      // Actions of your own (labit.json `actions`: go, tighter, shorter): the row and its keys follow them
      await withLab2(() => scene(eng, browser, {}, async (p) => {
        await drag(p, '#a', 'delta echo');
        await dlgUp(p);
        const names = await inRoot(p, (r) => [...r.querySelectorAll('.p-dlg .quick button')].map((b) => b.textContent).join(' '));
        check(eng, 'actions in labit.json: the row is the listed ones in their order', names === 'go tighter shorter', names);
        await inRoot(p, (r) => r.querySelector('.p-dlg [data-k=tighter]').click());
        await sleep(1500);
        const c = await sent('Tighter: less space');
        check(eng, '…an action of your own sends its text at once, on the words', Boolean(c) && c.anchor?.quote?.exact === 'delta echo' && (await fd(p)) === null, JSON.stringify(c?.anchor?.quote));
      }));
      await withLab2(() => scene(eng, browser, {}, async (p) => {
        await drag(p, '#a', 'foxtrot golf');
        await dlgUp(p);
        await inRoot(p, (r) => r.querySelector('.p-dlg [data-k=shorter]').click());
        await sleep(1500);
        const c = await sent('Shorter: half the words');
        check(eng, 'another action of your own sends its text at once too', Boolean(c) && c.anchor?.quote?.exact === 'foxtrot golf' && (await fd(p)) === null, JSON.stringify(c?.anchor?.quote));
      }));
      await withLab2(() => scene(eng, browser, {}, async (p) => {
        await drag(p, '#a', 'india juliet');
        await dlgUp(p);
        await p.keyboard.press('Alt+Digit2');
        await sleep(1500);
        check(eng, 'Option+2 runs the second of your own actions: tighter', Boolean(await sent('Tighter: less space')));
      }));

      // A spot (a click on the page): the regular dialog has the actions row too, over the open box; each sends at once
      await scene(eng, browser, {}, async (p) => {
        await p.mouse.click(300, 190);
        await sleep(800);
        const st = await inRoot(p, (r) => ({ names: [...r.querySelectorAll('.float .quick button')].map((b) => b.textContent).join(' '), open: r.querySelector('.float .box')?.classList.contains('open'), focus: r.activeElement?.localName }));
        check(eng, 'a spot\'s dialog has the row go · remove · fix over the open box, the cursor in it', st.names === 'go remove fix' && st.open && st.focus === 'textarea', JSON.stringify(st));
        await inRoot(p, (r) => r.querySelector('.float [data-k=remove]').click());
        await sleep(1500);
        const c = await sent('Remove this');
        check(eng, '…remove sends "Remove this" at once, on the spot', Boolean(c) && c.anchor?.kind !== 'text', JSON.stringify(c?.anchor));
      });
      await scene(eng, browser, {}, async (p) => {
        await p.mouse.click(300, 190);
        await sleep(800);
        await inRoot(p, (r) => r.querySelector('.float [data-k=fix]').click());
        await sleep(1500);
        check(eng, '…fix sends "Fix this" at once', Boolean(await sent('Fix this')));
      });

      // Sending: leaves, a new selection while it goes
      await scene(eng, browser, {}, async (p) => {
        const s = await span(p, '#a', 'delta echo');
        await drag(p, '#a', 'delta echo');
        await dlgUp(p);
        await p.keyboard.type('nice');
        await sleep(800);
        const open = await fd(p);
        await p.keyboard.press('Enter');
        await sleep(40);
        const mid = await fd(p);
        const sentOut = await motion(p, "r.querySelector('.fd')", 'out');
        check(eng, 'Enter sends: the dialog leaves with the comment card\'s motion, where it was (no shrinking)', Boolean(mid) && sentOut.card.startsWith('lab-out ') && sentOut.mine === sentOut.card && near(mid.h, open.h, 2) && near(mid.y, open.y, 2), JSON.stringify([open, mid, sentOut]));
        await sleep(500);
        const pins = await inRoot(p, (r) => r.querySelectorAll('button.pin').length);
        check(eng, '…it is gone when done, and the pin stays', (await fd(p)) === null && pins >= 1 && Boolean(await sent('nice')));
      });
      await scene(eng, browser, {}, async (p) => {
        await drag(p, '#a', 'delta echo');
        await dlgUp(p);
        await p.keyboard.type('first');
        await sleep(800);
        await p.keyboard.press('Enter');
        await sleep(200);
        await drag(p, '#b', 'papa quebec');
        await sleep(400);
        const c = await fd(p);
        check(eng, 'selecting while the dialog goes shows the new dialog', Boolean(c?.dlg) && c.opacity > 0.9, JSON.stringify(c));
      });

      // Reload and saved files
      await scene(eng, browser, {}, async (p) => {
        await drag(p, '#a', 'delta echo');
        await dlgUp(p);
        await p.keyboard.type('half a thought');
        await sleep(800);
        await p.reload();
        await sleep(1400);
        const c = await fd(p);
        check(eng, 'a reload mid-typing brings the dialog back, with its words and no pin', Boolean(c?.dlg) && c.text === 'half a thought' && (await draftPin(p)) === 0, JSON.stringify(c));
        check(eng, '…without moving (nothing animates)', Boolean(c) && c.anims === 0);
      });
      await scene(eng, browser, {}, async (p) => {
        await drag(p, '#a', 'delta echo');
        await dlgUp(p);
        await p.keyboard.type('moves');
        await sleep(800);
        const before = await fd(p);
        // Moved without a change of layout: the page keeps its scroll place for a paragraph added above, so the words would stay.
        save(PAGE.replace('<p id="a">', '<p id="a" style="position:relative;left:60px;top:40px">'));
        await sleep(2000);
        const after = await fd(p);
        const s = await span(p, '#a', 'delta echo');
        check(eng, 'an HTML save moves the dialog with its words, text and focus kept', Boolean(after?.dlg) && after.y > before.y + 30 && after.x > before.x + 40 && near(after.y, s.last.bottom + 8, 4) && after.text === 'moves' && (await inRoot(p, (r) => r.activeElement?.localName === 'textarea')), JSON.stringify([before, after, s.last]));
      });
      await scene(eng, browser, {}, async (p) => {
        await drag(p, '#a', 'delta echo');
        await dlgUp(p);
        await p.keyboard.type('still here');
        await sleep(800);
        save(PAGE.replace(/<p id="a">.*?<\/p>/, '<p id="a">Nothing of the old words is left.</p>'));
        await sleep(3000);
        const c = await fd(p);
        check(eng, 'words gone: the dialog stays with its text, cut and rewrite are off', Boolean(c?.dlg) && c.text === 'still here' && c.cls.includes('gone'), JSON.stringify(c));
        await inRoot(p, (r) => r.querySelector('[data-k=cut]').click());
        await sleep(300);
        check(eng, '…a click on cut sends nothing', !(await comments()).some((x) => /^Cut: /.test(x.text) && /delta/.test(x.text)) && (await fd(p))?.text === 'still here');
        await p.keyboard.press('Enter');
        await sleep(900);
        const c2 = (await comments()).find((x) => x.text === 'still here');
        check(eng, '…sending posts a pin, with no landing', Boolean(c2) && (await fd(p)) === null);
      });

      // Comments hidden: the bar goes; a dialog with words lets go of the screen and comes back with them
      await scene(eng, browser, {}, async (p) => {
        const toggle = (re) => inRoot(p, (r, src) => [...r.querySelectorAll('button')].find((b) => new RegExp(src).test(b.textContent || ''))?.click(), re);
        await drag(p, '#a', 'delta echo');
        await dlgUp(p);
        await toggle('hide comments');
        await sleep(500);
        check(eng, 'hiding comments lets the dialog go', (await fd(p)) === null);
        await toggle('^comments');
        await sleep(300);
        await drag(p, '#a', 'delta echo');
        await dlgUp(p);
        await p.keyboard.type('kept');
        await sleep(800);
        await toggle('hide comments');
        await sleep(500);
        check(eng, '…and a dialog with words hides too', (await fd(p)) === null);
        await toggle('^comments');
        await sleep(900);
        const c = await fd(p);
        check(eng, '…and comes back with its words when comments are shown', Boolean(c?.dlg) && c.text === 'kept', JSON.stringify(c));
      });

      // Where the words are
      await scene(eng, browser, {}, async (p) => {
        const s = await drag(p, '#same2', 'exact words', { nth: 0 });
        await dlgUp(p);
        await p.keyboard.type('x');
        await sleep(800);
        const c = await fd(p);
        check(eng, 'repeated words: the dialog sits on the second', Boolean(c?.dlg) && near(c.y, s.last.bottom + 8, 4), JSON.stringify([c, s.last]));
      });
      await scene(eng, browser, {}, async (p) => {
        const s = await drag(p, '#he', 'בעברית לבדיקה');
        await sleep(800);
        const d = await fd(p);
        check(eng, 'right-to-left: the dialog is mirrored', Boolean(d?.dlg) && near(d.x + d.w, s.last.left + 70, 6), JSON.stringify([d, s.last]));
      });
      await scene(eng, browser, {}, async (p) => {
        await drag(p, '#long', LONG.slice(0, 340));
        await dlgUp(p);
        await p.keyboard.type('x');
        await sleep(800);
        const c = await fd(p);
        check(eng, 'over 300 characters: no cut, no rewrite', Boolean(c?.dlg) && !c.cut && !c.rewrite, JSON.stringify(c));
      });

      await scene(eng, browser, {}, async (p) => {
        const from = await span(p, '#a', 'mike.');
        const to = await span(p, '#b', 'November oscar');
        await p.keyboard.down('Shift');
        await p.mouse.move(from.first.left + 1, from.first.top + 10);
        await p.mouse.down();
        await p.mouse.move(to.last.right - 1, to.last.top + 10, { steps: 8 });
        await p.mouse.up();
        await p.keyboard.up('Shift');
        await sleep(700);
        await sleep(200);
        await p.keyboard.type('across');
        await sleep(900);
        // Found again, the box is the dialog; words that can't be found again get the plain box (a pin, the box under it).
        const box = await inRoot(p, (r) => r.querySelector('.float textarea')?.value);
        check(eng, '…and the box is open with the cursor in it', box === 'across', String(box));
        await p.keyboard.press('Enter');
        await sleep(700);
        check(eng, '…which sends', Boolean(await sent('across')));
      });

      // Reduced motion
      await scene(eng, browser, { reducedMotion: 'reduce' }, async (p) => {
        const s = await drag(p, '#a', 'delta echo');
        await sleep(80); // the dialog is made right after the mouse is let go
        const c = await fd(p);
        check(eng, 'reduced motion: the dialog is there at once, nothing animates', Boolean(c?.dlg) && c.anims === 0 && near(c.x, s.last.right - 70, 4) && c.opacity === 1, JSON.stringify(c));
      });
    } finally {
      await browser.close();
    }
  }
} finally {
  server.kill();
  server2.kill();
  fs.rmSync(DIR, { recursive: true, force: true });
  fs.rmSync(DIR2, { recursive: true, force: true });
}
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
