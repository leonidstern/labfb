// Browser checks of the fluid comment on selected words (the actions bar, which the box joins, both moving as a comment card does), in Safari's
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
  console.log('playwright is not installed: skipped');
  process.exit(0);
})();

const LAB = fileURLToPath(new URL('../../local.mjs', import.meta.url));
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'labit-fluid-'));
const PORT = String(5500 + Math.floor(Math.random() * 300));
const B = `http://localhost:${PORT}`;
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
// The bar's comment button: adds the box (with the cursor in it); then `text` is typed into it.
const join = async (p, text = '') => {
  await inRoot(p, (r) => r.querySelector('.p-bar [data-k=comment]').click());
  await sleep(500);
  if (text) await p.keyboard.type(text);
};
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
  for (const eng of ['webkit', 'chromium']) {
    const browser = await pw[eng].launch();
    try {
      // The bar
      await scene(eng, browser, {}, async (p) => {
        const s = await drag(p, '#a', 'delta echo foxtrot');
        await sleep(700);
        const c = await fd(p);
        check(eng, 'shift-drag shows the actions bar at the words\' end', Boolean(c?.bar && !c.dlg) && near(c.x, s.last.right + 4) && near(c.y, s.last.bottom + 6), JSON.stringify([c, s.last]));
        const names = await inRoot(p, (r) => [...r.querySelectorAll('.p-bar button')].map((b) => b.textContent).join(' '));
        check(eng, 'the bar is comment · rewrite · cut · go, compact: no box, no draft pin', names === 'comment rewrite cut go' && Boolean(c) && c.h < 50 && c.w < 260 && c.text === null && (await draftPin(p)) === 0, `${names} ${c && [c.w, c.h]}`);
        await p.mouse.move(c.x + c.w / 2, c.y + c.h / 2);
        await sleep(700);
        check(eng, 'resting the mouse on the bar does not add the box', Boolean((await fd(p))?.bar));
      });
      await scene(eng, browser, {}, async (p) => {
        await drag(p, '#a', 'delta echo foxtrot');
        await sleep(700);
        await inRoot(p, (r) => r.querySelector('.p-bar [data-k=comment]').click());
        await sleep(800);
        const c = await fd(p);
        check(eng, 'a click on comment adds the box, with the cursor in it', Boolean(c?.dlg) && c.text === '' && (await inRoot(p, (r) => r.activeElement?.localName === 'textarea')), JSON.stringify(c));
      });
      await scene(eng, browser, {}, async (p) => {
        await drag(p, '#a', 'delta echo');
        await sleep(700);
        await inRoot(p, (r) => r.querySelector('.p-bar [data-k=cut]').click());
        await sleep(1500);
        check(eng, 'cut on the bar sends at once', Boolean(await sent('Cut: “delta echo”')) && (await fd(p)) === null, JSON.stringify((await comments()).map((x) => x.text)));
      });
      await scene(eng, browser, {}, async (p) => {
        await drag(p, '#a', 'kilo lima');
        await sleep(700);
        await inRoot(p, (r) => [...r.querySelectorAll('.p-bar button')].pop().click());
        await sleep(1500);
        const pinned = await inRoot(p, (r) => r.querySelectorAll('button.pin.go').length);
        check(eng, 'go on the bar sends a go pin on the words at once', Boolean(await sent('go')) && (await sent('go')).anchor?.quote?.exact === 'kilo lima' && pinned === 1 && (await fd(p)) === null, `${pinned} ${JSON.stringify(await sent('go'))}`);
      });
      await scene(eng, browser, {}, async (p) => {
        await drag(p, '#a', 'golf hotel');
        await sleep(700);
        await inRoot(p, (r) => r.querySelector('.p-bar [data-k=rewrite]').click());
        await sleep(900);
        const c = await fd(p);
        check(eng, 'rewrite on the bar puts the words in the box', Boolean(c?.dlg) && c.text === 'golf hotel', JSON.stringify(c));
      });
      await scene(eng, browser, {}, async (p) => {
        await drag(p, '#long', LONG.slice(0, 340));
        await sleep(700);
        const names = await inRoot(p, (r) => [...r.querySelectorAll('.p-bar button')].map((b) => b.textContent).join(' '));
        check(eng, 'over 300 characters the bar has no cut or rewrite', names === 'comment go', names);
      });
      await scene(eng, browser, {}, async (p) => {
        await p.evaluate(() => scrollTo(0, document.querySelector('#end').getBoundingClientRect().top + scrollY - 640));
        await sleep(200);
        const s = await drag(p, '#end', 'the page.'); // right of the bar's listening pill, which covers the line's start
        await sleep(700);
        const c = await fd(p);
        check(eng, 'on the window\'s last line the bar goes above the words', Boolean(c?.bar) && c.y + c.h <= s.first.top, JSON.stringify([c, s.first]));
      });
      await scene(eng, browser, {}, async (p) => {
        await drag(p, '#a', 'delta echo');
        await sleep(100);
        const arrive = await motion(p, "r.querySelector('.fd')", 'in');
        check(eng, 'the bar arrives with the comment card\'s motion (same animation, length and curve)', arrive.card.startsWith('lab-in ') && arrive.mine === arrive.card, JSON.stringify(arrive));
        await join(p, 'x'); // the box joins: the dialog comes in as a card does
        await sleep(30);
        const dlg = await motion(p, "r.querySelector('.fd:not(.out)')", 'in');
        check(eng, 'the dialog comes in with the card\'s motion', dlg.card.startsWith('lab-in ') && dlg.mine === dlg.card, JSON.stringify(dlg));
        const geo = await fd(p);
        check(eng, '…the dialog is the box at once: no growing, nothing animating but the arrival', Boolean(geo?.dlg) && geo.cls.includes('in') && !geo.cls.includes('grow'), JSON.stringify(geo));
      });
      await scene(eng, browser, {}, async (p) => {
        await drag(p, '#a', 'delta echo');
        await sleep(700);
        await p.keyboard.press('Escape');
        await sleep(40);
        const leave = await motion(p, "r.querySelector('.fd')", 'out');
        check(eng, 'the bar leaves with the card\'s motion too', leave.card.startsWith('lab-out ') && leave.mine === leave.card, JSON.stringify(leave));
        await sleep(300);
        check(eng, 'Esc on the bar lets it go', (await fd(p)) === null);
      });

      // Corners inside corners: inner radius + gap = outer radius (computers: bar buttons 6 px in, the dialog's buttons and box 8 px in)
      await scene(eng, browser, {}, async (p) => {
        await drag(p, '#a', 'delta echo');
        await sleep(700);
        const bar = await concentric(p, '.fd:not(.out)', '.p-bar button');
        check(eng, 'the bar\'s buttons are concentric with its corners (radius + gap = outer radius)', bar.n === 4 && bar.bad.length === 0, JSON.stringify(bar));
        await join(p, 'x');
        await sleep(600);
        const dlg = await concentric(p, '.fd:not(.out)', '.p-dlg .quick button, .p-dlg .box');
        check(eng, '…and so are the dialog\'s buttons and its box', dlg.n === 4 && dlg.bad.length === 0, JSON.stringify(dlg));
      });
      // Picking an action shows it on; picking it again goes back to the plain comment
      await scene(eng, browser, {}, async (p) => {
        await drag(p, '#a', 'delta echo');
        await sleep(700);
        await join(p, 'x');
        await sleep(800);
        const st = () => inRoot(p, (r) => ({ on: [...r.querySelectorAll('.p-dlg .quick .on')].map((b) => b.dataset.k).join(), text: r.querySelector('.p-dlg textarea').value }));
        await inRoot(p, (r) => r.querySelector('.p-dlg [data-k=rewrite]').click());
        await sleep(200);
        const on = await st();
        await inRoot(p, (r) => r.querySelector('.p-dlg [data-k=rewrite]').click());
        await sleep(200);
        const off = await st();
        check(eng, 'rewrite shows on with the words in the box; picked again it is off and the box is a plain comment again', on.on === 'rewrite' && on.text === 'delta echo' && off.on === '' && off.text === '', JSON.stringify([on, off]));
      });
      // Sending: leaves, a new selection while it goes
      await scene(eng, browser, {}, async (p) => {
        const s = await span(p, '#a', 'delta echo');
        await drag(p, '#a', 'delta echo');
        await sleep(700);
        await join(p, 'nice');
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
        await sleep(700);
        await join(p, 'first');
        await sleep(800);
        await p.keyboard.press('Enter');
        await sleep(200);
        await drag(p, '#b', 'papa quebec');
        await sleep(400);
        const c = await fd(p);
        check(eng, 'selecting while the dialog goes shows the new bar', Boolean(c?.bar) && c.opacity > 0.9, JSON.stringify(c));
      });

      // Comments hidden: the bar goes; the dialog goes too
      await scene(eng, browser, {}, async (p) => {
        const toggle = (re) => inRoot(p, (r, src) => [...r.querySelectorAll('button')].find((b) => new RegExp(src).test(b.textContent || ''))?.click(), re);
        await drag(p, '#a', 'delta echo');
        await sleep(700);
        await toggle('hide comments');
        await sleep(500);
        check(eng, 'hiding comments lets the bar go', (await fd(p)) === null);
        await toggle('^comments');
        await sleep(300);
        await drag(p, '#a', 'delta echo');
        await sleep(700);
        await join(p, 'kept');
        await sleep(800);
        await toggle('hide comments');
        await sleep(500);
        check(eng, '…and so does a dialog with words', (await fd(p)) === null);
      });

      // Where the words are
      await scene(eng, browser, {}, async (p) => {
        const s = await drag(p, '#same2', 'exact words', { nth: 0 });
        await sleep(700);
        await join(p, 'x');
        await sleep(800);
        const c = await fd(p);
        check(eng, 'repeated words: the dialog sits on the second', Boolean(c?.dlg) && near(c.y, s.last.bottom + 8, 4), JSON.stringify([c, s.last]));
      });
      await scene(eng, browser, {}, async (p) => {
        await drag(p, '#long', LONG.slice(0, 340));
        await sleep(700);
        await join(p, 'x');
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
        const c = await fd(p);
        check(eng, 'words over two paragraphs: the bar shows', Boolean(c?.bar), JSON.stringify(c));
        await join(p, 'across');
        await sleep(900);
        // Found again, the box is the dialog; words that can't be found again get the plain box (a pin, the box under it).
        const box = await inRoot(p, (r) => r.querySelector('.float textarea')?.value);
        check(eng, '…and the box that joins it holds the first letters', box === 'across', String(box));
        await p.keyboard.press('Enter');
        await sleep(700);
        check(eng, '…which sends', Boolean(await sent('across')));
      });

      // Reduced motion
      await scene(eng, browser, { reducedMotion: 'reduce' }, async (p) => {
        const s = await drag(p, '#a', 'delta echo');
        await sleep(80); // the bar is made right after the mouse is let go
        const c = await fd(p);
        check(eng, 'reduced motion: the bar is there at once, nothing animates', Boolean(c?.bar) && c.anims === 0 && near(c.x, s.last.right + 4) && c.opacity === 1, JSON.stringify(c));
        await join(p, 'x');
        await sleep(60);
        const d = await fd(p);
        check(eng, '…and so is the dialog', Boolean(d?.dlg) && d.anims === 0 && d.opacity === 1, JSON.stringify(d));
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
