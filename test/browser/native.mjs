// What the browser does for the widget with the flag native, besides holding pins (nativepins.mjs), in real browsers:
// WebKit (Safari) and Chrome's engine, on a computer and as a phone (iPhone 13, Pixel 7).
// - A pin's card and a new comment's box are tied to their pin (thread.ts tieToPin): they stay with it through
//   scrolling, a sticky header's too, and the card opens above its pin when there is no room below.
// - The comment box grows with its words by itself (field-sizing), with no height written by the script.
// - The ⋯ menu is a popover: the browser opens it, closes it on a press elsewhere or Esc, and the menu says so.
// - A long chat opens at its newest message while it lays out only the messages near the screen.
// Not part of `npm test`; CI runs it in the `browser` job.
// Run: node test/browser/native.mjs (needs playwright; NODE_PATH can point at a node_modules that has it).
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
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'labit-native-'));
const PORT = 8390 + Math.floor(Math.random() * 40);
const B = `http://localhost:${PORT}`;
fs.writeFileSync(path.join(DIR, 'index.html'), `<!doctype html><meta charset="utf-8"><title>native</title>
<style>body{margin:0;font:18px/1.5 Georgia,serif;max-width:640px} p{margin:22px 24px}
#sticky{position:sticky;top:0;z-index:1;background:#eee;padding:14px 24px}</style>
<header id="sticky"><b>Sticky header with words on it</b></header>
${'<p>Words to fill the page so that it scrolls.</p>'.repeat(16)}
<p id="mid">A paragraph in the middle of the page.</p>
${'<p>More words to fill the page.</p>'.repeat(30)}`);
fs.writeFileSync(path.join(DIR, 'labit.json'), JSON.stringify({ port: PORT, flags: { native: true } }));
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
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${eng.padEnd(16)} ${name}${detail ? ` (${detail})` : ''}`);
};
const settle = (p) => p.evaluate(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(res, 60)))));
const inRoot = (p, fn, arg) => p.evaluate(([src, a]) => new Function('r', 'a', `return (${src})(r, a)`)(document.querySelector('[data-lab-comments]').shadowRoot, a), [fn.toString(), arg]);
const untilRoot = (p, fn, arg, ms = 4000) =>
  p.waitForFunction(([src, a]) => { const r = document.querySelector('[data-lab-comments]')?.shadowRoot; return Boolean(r) && new Function('r', 'a', `return (${src})(r, a)`)(r, a); }, [fn.toString(), arg], { timeout: ms, polling: 'raf' }).catch(() => {});
const page = (await (async () => { const h = await (await fetch(B + '/')).text(); return /data-page="([^"]*)"/.exec(h)?.[1] || '/index'; })());

// The chat: 80 messages on the page as a whole, posted as this computer would.
const admin = JSON.parse(fs.readFileSync(path.join(DIR, '.lab/server.json'), 'utf8')).agent;
for (let i = 1; i <= 80; i++)
  await fetch(`${B}/_lab/api/comments`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-lab-admin': admin, 'x-lab-agent': '1' }, body: JSON.stringify({ page, name: 'agent', text: `message ${i} of the long chat`, anchor: { kind: 'page' } }) });

try {
  for (const eng of (process.env.ENGINES || 'webkit,chromium').split(',')) {
    const browser = await pw[eng].launch();
    try {
      for (const phone of [null, eng === 'webkit' ? 'iPhone 13' : 'Pixel 7']) {
        const tag = phone ? `${eng}/${eng === 'webkit' ? 'ios' : 'android'}` : eng;
        const ctx = await browser.newContext(phone ? { ...pw.devices[phone] } : { viewport: { width: 900, height: 700 } });
        await ctx.addInitScript(() => (localStorage.setItem('lab-on', '1'), localStorage.setItem('lab-name', 'leo')));
        const p = await ctx.newPage();
        await p.goto(B + '/');
        await p.waitForFunction(() => document.querySelector('[data-lab-comments]')?.shadowRoot?.querySelector('.layer'), null, { timeout: 8000 });
        await sleep(600);
        const can = await p.evaluate(() => ({ anchor: CSS.supports('anchor-name: --a'), popover: typeof HTMLElement.prototype.showPopover === 'function', grow: CSS.supports('field-sizing', 'content') }));
        console.log(`info ${tag.padEnd(16)} ${JSON.stringify(can)}`);
        const tap = async (x, y) => (phone ? p.touchscreen.tap(x, y) : p.mouse.click(x, y));
        const at = (sel, fx, fy) => p.evaluate(([sel, fx, fy]) => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.left + fx * r.width, y: r.top + fy * r.height }; }, [sel, fx, fy]);

        // The ⋯ menu on a computer: a popover the browser opens and closes. (A phone keeps it in the bar: a pinch zoom
        // scales the bar, not the top layer.)
        if (can.popover && !phone) {
          await inRoot(p, (r) => r.querySelector('.more').click());
          await settle(p);
          const open = await inRoot(p, (r) => { const m = r.querySelector('.more-menu'); return { pop: m.matches(':popover-open'), hidden: m.hidden, expanded: r.querySelector('.more').getAttribute('aria-expanded'), focus: r.activeElement?.closest('.more-menu') === m }; });
          check(tag, 'the ⋯ menu opens as a popover, says so, and takes the focus', open.pop && !open.hidden && open.expanded === 'true' && open.focus, JSON.stringify(open));
          await p.keyboard.press('Escape');
          await settle(p);
          const esc = await inRoot(p, (r) => { const m = r.querySelector('.more-menu'); return { pop: m.matches(':popover-open'), hidden: m.hidden }; });
          check(tag, '…Esc closes it', !esc.pop && esc.hidden, JSON.stringify(esc));
          await inRoot(p, (r) => r.querySelector('.more').click());
          await settle(p);
          const again = await inRoot(p, (r) => r.querySelector('.more-menu').matches(':popover-open'));
          await tap(300, 300);
          await sleep(400);
          const out = await inRoot(p, (r) => { const m = r.querySelector('.more-menu'); return { pop: m.matches(':popover-open'), hidden: m.hidden, drafts: r.querySelectorAll('.pin.draft').length }; });
          check(tag, '…and so does a press elsewhere on the page', again && !out.pop && out.hidden, JSON.stringify({ again, ...out }));
          const closed = await inRoot(p, (r) => { const m = r.querySelector('.more-menu'); const b = m.getBoundingClientRect(); return { display: getComputedStyle(m).display, w: b.width }; });
          check(tag, '…and closed it takes no room and no clicks', closed.display === 'none' && closed.w === 0, JSON.stringify(closed));
          if (out.drafts) await p.keyboard.press('Escape');
          await sleep(300);
        }

        // A new comment's box: beside its pin on a computer, growing with its words by itself. A phone pins on a long press
        // (a tap only reads), so there the box that grows is the chat's: the same box.
        let box = '.box textarea';
        if (phone) {
          await inRoot(p, (r) => r.querySelector('.chat-btn').click());
          await untilRoot(p, (r) => Boolean(r.querySelector('.chat .box textarea')));
          box = '.chat .box textarea';
          await inRoot(p, (r, sel) => r.querySelector(sel).focus(), box);
        } else {
          await p.evaluate(() => document.getElementById('mid').scrollIntoView({ block: 'center' }));
          await settle(p);
          const mid = await at('#mid', 0.3, 0.5);
          await tap(mid.x, mid.y);
          await untilRoot(p, (r) => Boolean(r.querySelector('.box textarea')));
        }
        if (!phone && can.anchor) {
          const beside = await inRoot(p, (r) => { const f = r.querySelector('.float'), d = r.querySelector('.pin.draft'); const a = f.getBoundingClientRect(), l = d.offsetParent.getBoundingClientRect().left + d.offsetLeft + d.offsetWidth; return { tied: f.classList.contains('tied-beside'), dx: Math.round(a.left - l), pos: getComputedStyle(f).position }; /* the pin's layout box: a pressed pin is scaled */ });
          check(tag, "a new comment's box is tied to its pin, just right of it", beside.tied && beside.pos === 'fixed' && Math.abs(beside.dx - 8) <= 2, JSON.stringify(beside));
        }
        const h1 = await inRoot(p, (r, sel) => r.querySelector(sel).getBoundingClientRect().height, box);
        for (const [i, line] of ['one line', 'and a second', 'and a third'].entries()) {
          if (i) await p.keyboard.press('Shift+Enter');
          await p.keyboard.type(line);
        }
        await settle(p);
        const grown = await inRoot(p, (r, sel) => { const t = r.querySelector(sel); return { h: t.getBoundingClientRect().height, inline: t.style.height, grow: t.classList.contains('grow') }; }, box);
        const lines = await inRoot(p, (r, sel) => parseFloat(getComputedStyle(r.querySelector(sel)).lineHeight), box);
        if (can.grow) check(tag, 'the box grows with its words (three lines), the script writing no height', grown.h >= 3 * lines && grown.grow && !grown.inline, JSON.stringify({ h1, lines, ...grown }));
        else check(tag, 'the box grows with its words (three lines; measured, no field-sizing here)', grown.h >= 3 * lines && !grown.grow, JSON.stringify({ h1, lines, ...grown }));
        if (phone) {
          await inRoot(p, (r, sel) => { const t = r.querySelector(sel); t.value = ''; t.dispatchEvent(new Event('input', { bubbles: true })); t.blur(); }, box); // nothing sent: the chat is the long chat below
          await inRoot(p, (r) => r.querySelector('.chat-btn').click());
          await sleep(400);
        } else {
          await p.keyboard.press('Enter');
          await untilRoot(p, (r) => r.querySelectorAll('button.pin').length >= 1);
          await p.keyboard.press('Escape');
          await sleep(500);
        }

        // A pin's card, tied to its pin (computers): it stays with it as the page scrolls, and opens above it near the
        // screen's bottom.
        if (!phone && can.anchor) {
          const pinAt = () => inRoot(p, (r) => { const b = r.querySelector('button.pin').getBoundingClientRect(); return { x: b.left + 14, y: b.top + 14, top: b.top, bottom: b.bottom, left: b.left }; });
          let pin = await pinAt();
          await p.mouse.click(pin.x, pin.y);
          await untilRoot(p, (r) => Boolean(r.querySelector('.card:not(.out)')));
          await settle(p);
          const card = () => inRoot(p, (r) => { const c = r.querySelector('.card:not(.out)'); const a = c.getBoundingClientRect(); return { tied: c.classList.contains('tied-card') || c.hasAttribute('part'), pos: getComputedStyle(c).position, top: Math.round(a.top), bottom: Math.round(a.bottom), left: Math.round(a.left) }; });
          const c1 = await card();
          pin = await pinAt();
          check(tag, "a pin's card is tied to its pin, just below it", c1.tied && c1.pos === 'fixed' && Math.abs(c1.top - Math.round(pin.bottom) - 10) <= 2, JSON.stringify({ card: c1, pin }));
          await p.evaluate(() => scrollBy(0, 60));
          await settle(p);
          const c2 = await card();
          const pin2 = await pinAt();
          check(tag, '…and stays with it as the page scrolls', Math.abs(c2.top - Math.round(pin2.bottom) - 10) <= 2 && Math.abs(pin2.top - pin.top + 60) <= 2, JSON.stringify({ card: c2, pin: pin2 }));
          // Near the screen's bottom: above its pin.
          await p.evaluate(() => { const r = document.getElementById('mid').getBoundingClientRect(); scrollBy(0, r.top - innerHeight + 90); });
          await settle(p);
          await sleep(300);
          const c3 = await card();
          const pin3 = await pinAt();
          check(tag, '…near the bottom of the screen it opens above its pin', c3.bottom <= Math.round(pin3.top) && c3.top >= 0, JSON.stringify({ card: c3, pin: pin3 }));
          await p.keyboard.press('Escape');
          await sleep(300);
        }

        // Labs & pages (⌘K) on a computer: a popover, closed by Esc and by a press elsewhere.
        if (!phone && can.popover) {
          await p.keyboard.press('Control+k');
          await untilRoot(p, (r) => r.querySelector('.switch')?.matches(':popover-open'), null, 4000);
          const sw = await inRoot(p, (r) => { const b = r.querySelector('.switch'); return { pop: Boolean(b?.matches(':popover-open')), hidden: b?.hidden }; });
          check(tag, 'labs & pages (ctrl K) opens as a popover', sw.pop && sw.hidden === false, JSON.stringify(sw));
          await p.keyboard.press('Escape');
          await sleep(500);
          const swEsc = await inRoot(p, (r) => { const b = r.querySelector('.switch'); return { pop: b.matches(':popover-open'), hidden: b.hidden }; });
          check(tag, '…Esc closes it', !swEsc.pop && swEsc.hidden, JSON.stringify(swEsc));
          await p.keyboard.press('Control+k');
          await untilRoot(p, (r) => r.querySelector('.switch')?.matches(':popover-open'), null, 4000);
          const swAgain = await inRoot(p, (r) => r.querySelector('.switch').matches(':popover-open'));
          await p.mouse.click(40, 640);
          await sleep(500);
          const swOut = await inRoot(p, (r) => { const b = r.querySelector('.switch'); return { pop: b.matches(':popover-open'), hidden: b.hidden }; });
          check(tag, '…and so does a press elsewhere', swAgain && !swOut.pop && swOut.hidden, JSON.stringify({ swAgain, ...swOut }));
          if (await inRoot(p, (r) => r.querySelectorAll('.pin.draft').length)) await p.keyboard.press('Escape');
          await sleep(300);
        }

        // A drawing's card (computers): tied below its drawing, not below a pin.
        if (!phone && can.anchor) {
          await p.evaluate(() => document.getElementById('mid').scrollIntoView({ block: 'center' }));
          await settle(p);
          const c = await at('#mid', 0.5, 0.5);
          await p.keyboard.down('d');
          await p.mouse.move(c.x + 120, c.y);
          await p.mouse.down();
          for (let i = 1; i <= 22; i++) await p.mouse.move(c.x + 120 * Math.cos((i / 20) * 2 * Math.PI), c.y + 30 * Math.sin((i / 20) * 2 * Math.PI), { steps: 2 });
          await p.mouse.up();
          await p.keyboard.up('d');
          await untilRoot(p, (r) => Boolean(r.querySelector('.box textarea')));
          await p.keyboard.type('this, circled');
          await p.keyboard.press('Enter');
          await untilRoot(p, (r) => Boolean(r.querySelector('.pin.ink')));
          await p.keyboard.press('Escape');
          await sleep(500);
          await p.mouse.click(c.x + 120, c.y); // on its line
          await untilRoot(p, (r) => Boolean(r.querySelector('.card:not(.out)')));
          await settle(p);
          const ink = await inRoot(p, (r) => { const card = r.querySelector('.card:not(.out)'), svg = r.querySelector('.pin.ink.open svg') || r.querySelector('.pin.ink svg'); const a = card.getBoundingClientRect(), z = svg.getBoundingClientRect(); return { tied: card.classList.contains('tied-card') || card.hasAttribute('part'), pos: getComputedStyle(card).position, cardTop: Math.round(a.top), cardBottom: Math.round(a.bottom), zoneTop: Math.round(z.top), zoneBottom: Math.round(z.bottom) }; });
          const below = Math.abs(ink.cardTop - ink.zoneBottom - 10) <= 3, above = Math.abs(ink.cardBottom - ink.zoneTop + 12) <= 3;
          check(tag, "a drawing's card is tied below its drawing (or above it, without room)", ink.tied && ink.pos === 'fixed' && (below || above), JSON.stringify(ink));
          await p.keyboard.press('Escape');
          await sleep(300);
        }

        // A long chat: it opens at its newest message, laying out only those near the screen.
        await p.evaluate(() => scrollTo(0, 0));
        await inRoot(p, (r) => r.querySelector('.chat-btn').click());
        await untilRoot(p, (r) => r.querySelectorAll('.msgs > .msg').length >= 80, null, 5000);
        await sleep(600);
        const chat = await inRoot(p, (r) => {
          const box = r.querySelector('.msgs');
          const msgs = [...box.querySelectorAll(':scope > .msg')];
          const last = msgs[msgs.length - 1].getBoundingClientRect(), b = box.getBoundingClientRect();
          return { n: msgs.length, lastInView: last.bottom <= b.bottom + 2 && last.top >= b.top - 2, cv: getComputedStyle(msgs[0]).contentVisibility, lastText: msgs[msgs.length - 1].textContent.includes('message 80') };
        });
        check(tag, 'a long chat opens at its newest message', chat.n >= 80 && chat.lastInView && chat.lastText, JSON.stringify(chat));
        check(tag, '…laying out only the messages near the screen', chat.cv === 'auto', String(chat.cv));
        await ctx.close();
      }
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
