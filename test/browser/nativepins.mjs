// Pins the browser holds (flag nativePins, src/widget/pinhold.ts) in real browsers: WebKit (Safari) and Chrome's engine.
// Pins placed the usual way (a click on an element, one on a sticky header, one in the gap between two blocks, Shift +
// double-click on words, one in a box that scrolls) are tied to their element with CSS anchor positioning: through
// scrolling (the page, the box), the page growing above them and words moving in their line, each stays where it is on
// its element; a box that cuts its spot off hides it; a scroll measures nothing; a drag still moves one.
// Not part of `npm test`; CI runs it in the `browser` job.
// Run: node test/browser/nativepins.mjs (needs playwright; NODE_PATH can point at a node_modules that has it).
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
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'labit-nativepins-'));
const PORT = 8340 + Math.floor(Math.random() * 40);
const B = `http://localhost:${PORT}`;
const FILLER = '<p>Filler words to scroll past in the box.</p>'.repeat(4);
fs.writeFileSync(path.join(DIR, 'index.html'), `<!doctype html><meta charset="utf-8"><title>held pins</title>
<style>body{margin:0;font:18px/1.5 Georgia,serif;max-width:640px} p{margin:22px 24px}
#sticky{position:sticky;top:0;z-index:1;background:#eee;padding:14px 24px} #box{height:240px;overflow:auto;margin:16px 24px;border:1px solid #999}
#gapsec{padding:1px 0} #shifted{transform:translateX(40px)}</style>
<header id="sticky"><b>Sticky header with words on it</b></header>
<p id="grow">The page grows here.</p>
<div id="box">${FILLER}<p id="inbox">A paragraph inside the box that scrolls.</p>${FILLER}${FILLER}</div>
<section id="gapsec"><p id="ga">The block above the gap.</p><p id="gb">The block below the gap.</p></section>
<p id="words"><span id="before">Some words before</span> the <span id="q">quoted</span> words and more after them.</p>
<div id="shifted"><p id="tp">A paragraph whose parent is moved by a transform.</p></div>
<div style="height:1600px"></div>
<p id="own" style="anchor-name:--theirs">A paragraph the page anchors something to itself.</p>`);
fs.writeFileSync(path.join(DIR, 'labit.json'), JSON.stringify({ port: PORT, flags: { nativePins: true } }));
const env = { ...process.env, PORT: '', XDG_CONFIG_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'labit-cfg-')), LABIT_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'labit-home-')), LABIT_NO_UPDATE_CHECK: '1', LABIT_EXIT_WITH_PARENT: '1' };
const server = spawn(process.execPath, [LAB, '--new', '--no-open'], { cwd: DIR, env, stdio: 'ignore' });
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

// Each pin, by the element it was put on (what its place is measured from).
const PINS = [
  ['inbox', '#inbox'],
  ['sticky', '#sticky'],
  ['gap', '#ga'],
  ['words', '#q'],
  ['shifted', '#tp'],
  ['drawing', '#box'], // an area is on the element that holds all of it: here the box itself
  ['own', '#own'], // the page's own anchor-name would win over ours: the script places this one
];
// Every pin's place from its element's corner, and whether the browser holds it (fixed, in its rule).
const where = (p) =>
  p.evaluate((pins) => {
    const r = document.querySelector('[data-lab-comments]').shadowRoot;
    const all = [...r.querySelectorAll('button.pin')];
    const out = {};
    pins.forEach(([name, sel], i) => {
      const pin = all.find((b) => new RegExp(`^comment ${i + 1} by`).test(b.getAttribute('aria-label') || ''));
      if (!pin) return;
      const q = pin.getBoundingClientRect();
      const t = document.querySelector(sel).getBoundingClientRect();
      const hit = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2);
      out[name] = { dx: Math.round(q.left - t.left), dy: Math.round(q.top - t.top), y: Math.round(q.top), held: getComputedStyle(pin).position === 'fixed', shown: hit === r.host };
    });
    return out;
  }, PINS);
const same = (a, b, names) => names.filter((n) => !a[n] || !b[n] || Math.abs(a[n].dx - b[n].dx) > 1 || Math.abs(a[n].dy - b[n].dy) > 1);
const settle = (p) => p.evaluate(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(res, 60)))));

try {
  for (const eng of (process.env.ENGINES || 'webkit,chromium').split(',')) {
    const browser = await pw[eng].launch();
    try {
      const ctx = await browser.newContext({ viewport: { width: 900, height: 700 } });
      await ctx.addInitScript(() => (localStorage.setItem('lab-on', '1'), localStorage.setItem('lab-name', 'leo')));
      const p = await ctx.newPage();
      await p.goto(B + '/');
      await p.waitForFunction(() => document.querySelector('[data-lab-comments]')?.shadowRoot?.querySelector('.layer'), null, { timeout: 8000 });
      await sleep(600);
      const can = await p.evaluate(() => ({ anchor: CSS.supports('anchor-name: --a'), visibility: CSS.supports('position-visibility: anchors-visible') }));
      check(eng, 'the browser has anchor positioning and position-visibility', can.anchor && can.visibility, JSON.stringify(can));
      // Does it really hide a pin whose spot a box cuts off? (Safari takes the property but doesn't, pinhold.ts:
      // there the pin in the box is placed by the script.) The same probe as the widget's.
      const hides = await p.evaluate(() => {
        const box = document.createElement('div');
        box.style.cssText = 'position:fixed;left:0;top:0;width:4px;height:4px;overflow:hidden;opacity:0;pointer-events:none;z-index:2147483647';
        box.append(Object.assign(document.createElement('div'), { style: 'margin-top:40px;height:4px;anchor-name:--t-probe' }));
        const probe = document.createElement('div');
        probe.style.cssText = 'position:fixed;width:4px;height:4px;opacity:0;z-index:2147483647;position-anchor:--t-probe;position-visibility:anchors-visible;left:anchor(left);top:calc(anchor(top) - 40px)';
        document.body.append(box, probe);
        return new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => {
          const r = probe.getBoundingClientRect();
          const seen = document.elementFromPoint(1, 1) === probe;
          box.remove();
          probe.remove();
          res(Math.abs(r.left) < 1 && Math.abs(r.top) < 1 && !seen);
        })));
      });
      console.log(`info ${eng.padEnd(8)} hides a pin its box cuts off: ${hides}`);
      // Pins put the usual way: a click and Enter; words by Shift + double-click.
      let n = 0;
      const send = async (text) => {
        const box = p.locator('[data-lab-comments] .float textarea').first();
        await box.waitFor({ timeout: 4000 });
        await p.keyboard.type(text);
        await p.keyboard.press('Enter');
        n++;
        await p.waitForFunction((k) => document.querySelector('[data-lab-comments]').shadowRoot.querySelectorAll('button.pin').length >= k, n, { timeout: 5000 }).catch(() => {});
        await p.keyboard.press('Escape');
        await sleep(400);
      };
      const at = (sel, fx, fy) => p.evaluate(([sel, fx, fy]) => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.left + fx * r.width, y: r.top + fy * r.height }; }, [sel, fx, fy]);
      const clickAt = async (sel, fx, fy) => { const pt = await at(sel, fx, fy); await p.mouse.click(pt.x, pt.y); };
      await p.evaluate(() => (document.getElementById('box').scrollTop = 130));
      await settle(p);
      await clickAt('#inbox', 0.6, 0.5);
      await send('in the box');
      await clickAt('#sticky', 0.8, 0.5);
      await send('on the sticky header');
      const gap = await p.evaluate(() => { const a = document.getElementById('ga').getBoundingClientRect(), b = document.getElementById('gb').getBoundingClientRect(); return { x: a.left + 200, y: (a.bottom + b.top) / 2 }; });
      await p.mouse.click(gap.x, gap.y);
      await send('in the gap');
      const q = await at('#q', 0.5, 0.5);
      await p.keyboard.down('Shift');
      await p.mouse.dblclick(q.x, q.y);
      await p.keyboard.up('Shift');
      await send('on the words');
      await clickAt('#tp', 0.5, 0.5);
      await send('under a transform');
      // A drawing (hold D and drag, draw.ts): its lines are the pin, over its whole area.
      await p.evaluate(() => document.getElementById('box').scrollIntoView({ block: 'nearest' }));
      await settle(p);
      const c = await at('#inbox', 0.5, 0.5);
      await p.keyboard.down('d');
      await p.mouse.move(c.x + 120, c.y);
      await p.mouse.down();
      for (let i = 1; i <= 22; i++) await p.mouse.move(c.x + 120 * Math.cos((i / 20) * 2 * Math.PI), c.y + 30 * Math.sin((i / 20) * 2 * Math.PI), { steps: 2 });
      await p.mouse.up();
      await p.keyboard.up('d');
      await send('this one, circled');
      await p.evaluate(() => scrollTo(0, 0));
      await settle(p);
      const names = PINS.map(([name]) => name).filter((k) => k !== 'own'); // own is put last, below
      const rest = await where(p);
      check(eng, hides ? 'five pins and a drawing, all held by the browser' : 'four pins and a drawing held; the one in the box placed by the script', names.every((k) => rest[k]?.shown && rest[k]?.held === (k !== 'inbox' || hides)), JSON.stringify(rest));
      // A scroll measures nothing: no element or words are measured by the widget while the box and the page scroll.
      await p.evaluate(() => {
        window.labMeasured = 0;
        for (const [proto, fn] of [[Element.prototype, 'getBoundingClientRect'], [Range.prototype, 'getClientRects'], [Range.prototype, 'getBoundingClientRect']]) {
          const was = proto[fn];
          proto[fn] = function (...a) { window.labMeasured++; return was.apply(this, a); };
        }
      });
      await p.evaluate(() => (document.getElementById('box').scrollTop = 60));
      await settle(p);
      const measured = await p.evaluate(() => window.labMeasured);
      const boxed = await where(p);
      check(eng, 'the box scrolls: every pin stays on its spot', same(rest, boxed, names).length === 0, JSON.stringify({ rest: rest.inbox, now: boxed.inbox }));
      check(eng, '…the pin in the box moved with it', Math.abs(boxed.inbox.y - rest.inbox.y - 70) <= 1, `${rest.inbox.y} → ${boxed.inbox.y}`);
      if (hides) check(eng, '…and the widget measured nothing for it', measured === 0, `${measured} measurements`);
      await p.evaluate(() => scrollTo(0, 220));
      await settle(p);
      const paged = await where(p);
      check(eng, 'the page scrolls: every pin stays on its spot, the sticky header\'s with it on screen', same(rest, paged, names).length === 0 && Math.abs(paged.sticky.y - rest.sticky.y) <= 1, JSON.stringify({ sticky: [rest.sticky, paged.sticky], off: same(rest, paged, names) }));
      await p.evaluate(() => scrollTo(0, 0));
      // The page grows above them: a reflow moves the elements, the pins come along.
      await p.evaluate(() => (document.getElementById('grow').textContent += ' More words that wrap onto new lines and push everything down.'.repeat(6)));
      await sleep(400);
      const grown = await where(p);
      check(eng, 'the page grows above them: every pin stays on its spot', same(rest, grown, names.filter((k) => k !== 'sticky')).length === 0, JSON.stringify(same(rest, grown, names)));
      // Words that move in their line: the pin on them follows (measured again when the page changes size).
      const before = await p.evaluate(() => { const q = document.getElementById('q').getBoundingClientRect(); return { x: q.left, y: q.top }; });
      await p.evaluate(() => (document.getElementById('before').textContent = 'Many more words come before them now, so the quoted one moves along its line and down'));
      await sleep(400);
      const moved = await p.evaluate(() => { const q = document.getElementById('q').getBoundingClientRect(); return { x: q.left, y: q.top }; });
      const follow = await where(p);
      check(eng, 'words move in their line: the pin on them follows', (Math.abs(moved.x - before.x) > 20 || Math.abs(moved.y - before.y) > 10) && Math.abs(follow.words.dx - rest.words.dx) <= 2 && Math.abs(follow.words.dy - rest.words.dy) <= 2, JSON.stringify({ rest: rest.words, now: follow.words }));
      // The box cuts the pin's spot off (the box itself still on screen): the browser hides it, and shows it again.
      await p.evaluate(() => (document.getElementById('box').scrollTop = 900));
      await settle(p);
      const cut = await where(p);
      await p.evaluate(() => (document.getElementById('box').scrollTop = 60));
      await settle(p);
      const back = await where(p);
      check(eng, 'its box cuts its spot off: hidden, and back when it scrolls into view', !cut.inbox.shown && back.inbox.shown, JSON.stringify({ cut: cut.inbox, back: back.inbox }));
      // A drag still moves a pin: the browser lets go of it while it is dragged, and holds it on its new spot after.
      await p.evaluate(() => document.getElementById('tp').scrollIntoView({ block: 'center' }));
      await settle(p);
      const pinBox = await p.evaluate(() => { const b = [...document.querySelector('[data-lab-comments]').shadowRoot.querySelectorAll('button.pin')].find((x) => /^comment 5 by/.test(x.getAttribute('aria-label'))).getBoundingClientRect(); return { x: b.left + 14, y: b.top + 14 }; });
      await p.mouse.move(pinBox.x, pinBox.y);
      await p.mouse.down();
      await p.mouse.move(pinBox.x + 30, pinBox.y + 40, { steps: 6 });
      const mid = await where(p);
      await p.mouse.up();
      await sleep(800);
      const dropped = await where(p);
      check(eng, 'a drag moves a pin, and it is held again on its new spot', Math.abs(mid.shifted.dx - rest.shifted.dx - 30) <= 4 && Math.abs(mid.shifted.dy - rest.shifted.dy - 40) <= 4 && !mid.shifted.held && dropped.shifted.held, JSON.stringify({ rest: rest.shifted, mid: mid.shifted, dropped: dropped.shifted }));
      // An element the page anchors something to itself: our anchor-name would take its place, so the script places the pin.
      await p.evaluate(() => document.getElementById('own').scrollIntoView({ block: 'center' }));
      await settle(p);
      await clickAt('#own', 0.5, 0.5);
      await send('on an element the page anchors');
      const own = (await where(p)).own;
      check(eng, 'a pin on an element the page anchors itself is placed by the script, on its spot', own && !own.held && own.shown && Math.abs(own.dy + 15) <= 2, JSON.stringify(own));
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
