// The board page in real browsers (WebKit and Chrome's engine): frames on one canvas, panned and zoomed, live pages in
// them, selecting and entering one, the board file followed, phones too. Not part of `npm test`; CI runs it in the `browser` job.
// Run: node test/browser/board.mjs (needs playwright; NODE_PATH can point at a node_modules that has it).
import fs from 'node:fs';
import path from 'node:path';
import { claimPort } from './port.mjs';
import { playwright, engines, tmp, labEnv, startLab, labUp, sleep, check, finish } from './harness.mjs';

const pw = playwright();

const DIR = tmp('labit-board-');
const PORT = claimPort(8080, 30);
const B = `http://localhost:${PORT}`;
fs.writeFileSync(path.join(DIR, 'pricing.html'), '<!doctype html><meta charset="utf-8"><title>Pricing</title><h1>Pricing one</h1><div style="height:3000px"></div>');
fs.writeFileSync(path.join(DIR, 'checkout.html'), '<!doctype html><meta charset="utf-8"><title>Checkout</title><h1>Checkout</h1>');
fs.writeFileSync(path.join(DIR, 'index.html'), '<!doctype html><meta charset="utf-8"><title>k</title><h1>Keys</h1><p>text</p>');
fs.writeFileSync(path.join(DIR, 'labit.json'), JSON.stringify({ port: PORT }));
const server = startLab(DIR, labEnv());
await labUp(B);
const put = (name, frames, extra = {}) => fetch(`${B}/_lab/api/board?name=${name}`, { method: 'PUT', headers: { 'content-type': 'application/json', origin: B }, body: JSON.stringify({ v: 1, rev: 0, frames, ...extra }) }).then((r) => r.json());
const grid = (n) => Array.from({ length: n }, (_, i) => ({ id: 'f' + i, src: '/pricing', w: 300, h: 300, x: (i % 5) * 340, y: Math.floor(i / 5) * 340 }));
await put('ten', grid(10), { of: '/pricing' });
await put('three', [{ id: 'a', src: '/pricing', w: 390, h: 844 }, { id: 'b', src: '/pricing', w: 820, h: 1180 }, { id: 'c', src: '/checkout', w: 390, h: 844 }], { of: '/pricing' });
const LONG = 'A long caption that goes on and on about what the person does on this step of the flow and why it matters to them, '.repeat(3);
await put('story', [{ id: 'a', src: '/pricing', w: 600, h: 400, caption: 'Cart' }, { id: 'b', src: '/checkout', w: 600, h: 400, caption: 'User taps Pay' }, { id: 'c', src: '/pricing', w: 600, h: 400, caption: LONG }, { id: 'd', src: '/checkout', w: 600, h: 400 }], { flow: true });
await put('slidephone', [{ id: 'a', src: '/pricing', w: 1920, h: 1080, caption: 'One' }, { id: 'b', src: '/checkout', w: 1920, h: 1080, caption: 'Two' }, { id: 'c', src: '/pricing', w: 1920, h: 1080 }], { flow: true });
await put('plain', [{ id: 'a', src: '/pricing', w: 600, h: 400, x: 800, y: 0, caption: 'right' }, { id: 'b', src: '/checkout', w: 600, h: 400, x: 0, y: 0, caption: 'left' }]);
await put('wide', [{ id: 'a', src: '/pricing', w: 1000, h: 700, x: 0, y: 0 }, { id: 'b', src: '/pricing', w: 1000, h: 700, x: 4000, y: 3000 }]);
try {
  for (const eng of engines()) {
    const browser = await pw[eng].launch();
    try {
      const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
      await ctx.addInitScript(() => localStorage.setItem('lab-name', 'tester'));
      const p = await ctx.newPage();
      const cam = () => p.evaluate(() => __labBoard.camera());
      const bw = (ms = 2500) => sleep(ms);
      // ----- ten frames: the cap, and the widget in them draws nothing
      await p.goto(B + '/_lab/board/ten');
      await bw(4000);
      const ten = await p.evaluate(() => ({ live: __labBoard.live().length, cards: document.querySelectorAll('#lab-board .f').length, scroll: [scrollX, scrollY], hosts: document.querySelectorAll('[data-lab-comments]').length, bodyOverflow: getComputedStyle(document.body).overflow }));
      check(eng, 'ten frames: all ten are on the board, at most 8 are alive', ten.cards === 10 && ten.live === 8, JSON.stringify(ten));
      check(eng, 'the board page has one widget (its own), none in the frames', ten.hosts === 1, String(ten.hosts));
      const inner = await p.evaluate(() => [...document.querySelectorAll('iframe')].map((f) => f.contentDocument?.querySelectorAll('[data-lab-comments]').length));
      check(eng, 'no frame has a widget in it', inner.every((n) => n === 0), JSON.stringify(inner));
      const titleCard = await p.evaluate(() => [...document.querySelectorAll('#lab-board .f')].map((f) => f.querySelector('.c')?.textContent).filter(Boolean));
      check(eng, 'a frame not alive is a title card: label, size, no count', titleCard.length === 2 && titleCard.every((t) => /\/pricing/.test(t) && /300 × 300/.test(t) && !/comment|pin|\d+ open/i.test(t)), JSON.stringify(titleCard));
      // ----- inputs
      const c0 = await cam();
      await p.mouse.move(600, 400);
      await p.mouse.wheel(0, 300);
      await sleep(200);
      const c1 = await cam();
      check(eng, 'a wheel pans the board, never the page', c1.y < c0.y + 0.001 && (await p.evaluate(() => scrollY)) === 0 && c1.z === c0.z, JSON.stringify([c0, c1]));
      await p.keyboard.press('Shift+Digit2');
      await sleep(200);
      check(eng, 'Shift+2 goes to 100%', (await cam()).z === 1);
      await p.keyboard.press('Shift+Digit1');
      await sleep(200);
      const fit = await cam();
      check(eng, 'Shift+1 fits everything again', fit.z < 1 && Math.abs(fit.z - c0.z) < 0.01, JSON.stringify(fit));
      // zoom about the cursor: the world point under it stays under it
      const box = await p.evaluate(() => { const r = document.querySelector('#lab-board').getBoundingClientRect(); return [r.x, r.y]; }); // under the view's bar
      const under = (c, x, y) => [(x - box[0]) / c.z - c.x, (y - box[1]) / c.z - c.y];
      const before = under(await cam(), 700, 300);
      await p.keyboard.down('Control');
      await p.mouse.move(700, 300);
      await p.mouse.wheel(0, -20);
      await p.keyboard.up('Control');
      await sleep(200);
      const z1 = await cam();
      const after = under(z1, 700, 300);
      check(eng, 'Ctrl + wheel zooms about the cursor', z1.z > fit.z && Math.abs(before[0] - after[0]) < 0.5 && Math.abs(before[1] - after[1]) < 0.5, JSON.stringify([fit.z, z1.z, before, after]));
      check(eng, 'a pinch never zooms the page (no gesture reached it)', (await p.evaluate(() => visualViewport.scale)) === 1);
      // ----- Tab, enter by the label, leave (focus goes back to the board); frames are never selected
      await p.keyboard.press('Shift+Digit1');
      await sleep(200);
      await p.keyboard.press('Tab');
      await sleep(400);
      const tabbed = await p.evaluate(() => ({ at: __labBoard.selected(), ring: document.querySelectorAll('#lab-board .f.sel').length }));
      check(eng, 'Tab moves the camera to a frame and draws no selection ring', Boolean(tabbed.at) && tabbed.ring === 0, JSON.stringify(tabbed));
      const lab = await p.locator('#lab-board .f[data-id="f0"] .t').boundingBox();
      await p.mouse.click(lab.x + 8, lab.y + lab.height / 2);
      await sleep(400);
      const inFrame = await p.evaluate(() => ({ entered: __labBoard.entered(), pe: getComputedStyle(__labBoard.frame('f0')).pointerEvents, focus: document.activeElement === __labBoard.frame('f0') }));
      check(eng, 'a click on the frame\'s label gives the page in the frame the pointer and the focus', inFrame.entered === 'f0' && inFrame.pe === 'auto' && inFrame.focus, JSON.stringify(inFrame));
      await p.keyboard.press('Escape');
      await sleep(250);
      const out = await p.evaluate(() => ({ entered: __labBoard.entered(), pe: getComputedStyle(__labBoard.frame('f0')).pointerEvents, body: document.activeElement === document.body, sel: __labBoard.selected() }));
      check(eng, 'Esc in a frame leaves it: the board has the focus again', out.entered === '' && out.pe === 'none' && out.body, JSON.stringify(out));
      await p.keyboard.press('Shift+Digit2'); // the board hears keys after leaving: this would go to the frame otherwise
      await sleep(150);
      check(eng, 'after leaving, board keys work again (Shift+2)', (await cam()).z === 1);
      // ----- finite edges
      await p.keyboard.press('Shift+Digit1');
      for (let i = 0; i < 10; i++) await p.mouse.wheel(-4000, -4000);
      await sleep(300);
      const edge = await cam();
      check(eng, 'panning stops at the edge: some of the board stays in view', (await p.evaluate(() => { const r = document.querySelector('#lab-board .world').getBoundingClientRect(); return r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight; })), JSON.stringify(edge));
      // ----- two boards, one with frames far apart
      await p.goto(B + '/_lab/board/wide');
      await bw(2500);
      const w = await p.evaluate(() => ({ cam: __labBoard.camera(), live: __labBoard.live() }));
      check(eng, 'frames far apart: fit shows both, the small ones are still readable titles or live', w.cam.z < 0.3 && w.live.length <= 2, JSON.stringify(w));
      // ----- save a frame's page: the board does not reload, the frame follows
      await p.goto(B + '/_lab/board/three');
      await bw(2500);
      await p.evaluate(() => (window.__same = 1));
      fs.writeFileSync(path.join(DIR, 'pricing.html'), fs.readFileSync(path.join(DIR, 'pricing.html'), 'utf8').replace('Pricing one', 'Pricing two'));
      await sleep(2500);
      const saved = await p.evaluate(() => ({ same: window.__same === 1, text: [...document.querySelectorAll('iframe')].map((f) => f.contentDocument?.querySelector('h1')?.textContent) }));
      check(eng, 'a save does not reload the board; frames of that page follow', saved.same && saved.text.some((t) => t === 'Pricing two'), JSON.stringify(saved));
      // ----- the board file changes: the board follows
      await put('three', [{ id: 'a', src: '/pricing', w: 390, h: 844 }, { id: 'b', src: '/pricing', w: 820, h: 1180 }, { id: 'c', src: '/checkout', w: 390, h: 844 }, { id: 'd', src: '/checkout', w: 820, h: 1180 }], { of: '/pricing', rev: (await (await fetch(`${B}/_lab/api/board?name=three`)).json()).rev });
      await sleep(2500);
      check(eng, 'a frame added to the board file shows up', (await p.evaluate(() => document.querySelectorAll('#lab-board .f').length)) === 4);
      // ----- a storyboard: captions under frames, arrows between frames in order (a flow board only)
      await p.goto(B + '/_lab/board/story');
      await bw(2500);
      const story = await p.evaluate(() => {
        const world = document.querySelector('#lab-board .world');
        const caps = [...document.querySelectorAll('#lab-board .f')].map((f) => { const c = f.querySelector('.cap'); const r = c.getBoundingClientRect(); return { id: f.dataset.id, text: c.textContent.slice(0, 20), hidden: c.hidden, below: r.top >= f.getBoundingClientRect().bottom - 1, h: r.height, line: parseFloat(getComputedStyle(c).lineHeight) / (parseFloat(getComputedStyle(world).getPropertyValue('--iz')) || 1) || 20, fs: parseFloat(getComputedStyle(c).fontSize) };
        });
        const arrows = [...document.querySelectorAll('#lab-board .arrows path.ar')].map((a) => a.dataset.from + a.dataset.to);
        return { caps, arrows, under: world.firstElementChild?.classList.contains('arrows') };
      });
      check(eng, 'captions: shown under their frame, none where there is none', story.caps.map((c) => c.hidden).join() === 'false,false,false,true' && story.caps.slice(0, 3).every((c) => c.below) && story.caps[1].text === 'User taps Pay', JSON.stringify(story.caps));
      check(eng, 'a long caption wraps to two lines at most', story.caps[2].h > 0 && story.caps[2].h <= story.caps[2].fs * 1.5 * 2 + 12 + 6, JSON.stringify(story.caps[2]));
      check(eng, 'a flow board: one arrow per step (frames - 1), in order, in a layer under the frames', story.arrows.join() === 'ab,bc,cd' && story.under, JSON.stringify(story));
      const arrowEnds = () => p.evaluate(() => { const a = document.querySelector('#lab-board .arrows path.ar'); const f = document.querySelector('#lab-board .f[data-id="a"]').getBoundingClientRect(); const r = a.getBoundingClientRect(); return { dx: Math.abs(r.left - f.right), z: __labBoard.camera().z }; });
      const e0 = await arrowEnds();
      await p.keyboard.press('Shift+Digit2');
      await sleep(400);
      const e1 = await arrowEnds();
      check(eng, 'arrows follow the camera: still leaving the right edge of their frame after a zoom', e0.dx < 3 && e1.dx < 3 && e1.z !== e0.z, JSON.stringify([e0, e1]));
      await p.goto(B + '/_lab/board/three');
      await bw(1800);
      check(eng, 'a board that is no flow has no arrows and no captions', (await p.evaluate(() => [document.querySelectorAll('#lab-board .arrows path.ar').length, [...document.querySelectorAll('#lab-board .cap')].every((c) => c.hidden)])).join() === '0,true');
      // ----- present mode: P, arrows and space step, the caption and "n / N", Esc back where you were
      await p.goto(B + '/_lab/board/story');
      await bw(2500);
      const camBefore = await cam();
      const pres = () => p.evaluate(() => { const r = document.getElementById('lab-board'); const cur = r.querySelector('.f.cur'); const b = cur?.getBoundingClientRect(); const host = document.querySelector('[data-lab-comments]'); return { on: r.classList.contains('pres'), n: r.querySelector('.pn').textContent, cap: r.querySelector('.pc').textContent.slice(0, 14), shown: [...r.querySelectorAll('.f')].filter((f) => getComputedStyle(f).visibility !== 'hidden').map((f) => f.dataset.id).join(), fill: b ? Math.round(Math.max(b.width / innerWidth, b.height / (innerHeight - 72)) * 100) / 100 : 0, mid: b ? Math.abs(b.left + b.width / 2 - innerWidth / 2) < 2 && b.bottom <= innerHeight - 72 + 1 : false, widgetHidden: host ? getComputedStyle(host).display === 'none' : null, live: cur ? Boolean(cur.querySelector('iframe')) : false }; });
      check(eng, 'present: not on until P', (await pres()).on === false);
      await p.keyboard.press('KeyP');
      await sleep(900);
      const p1 = await pres();
      check(eng, 'P presents the first frame alone, fitted above its caption, "1 / 4", the widget out of the way', p1.on && p1.n === '1 / 4' && p1.cap === 'Cart' && p1.shown === 'a' && p1.mid && p1.fill > 0.4 && p1.widgetHidden !== false, JSON.stringify(p1));
      check(eng, 'present: the frame is alive (its page shows)', (await pres()).live);
      await p.keyboard.press('ArrowRight');
      await sleep(500);
      const p2 = await pres();
      await p.keyboard.press('Space');
      await sleep(300);
      const p3 = await pres();
      await p.keyboard.press('Shift+Space');
      await sleep(300);
      const p2b = await pres();
      await p.keyboard.press('ArrowLeft');
      await sleep(300);
      const p1b = await pres();
      check(eng, '→ and Space step in order, ← and ⇧Space back, the caption and counter follow', [p2.n, p2.cap, p2.shown].join() === '2 / 4,User taps Pay,b' && p3.n === '3 / 4' && p2b.n === '2 / 4' && p1b.n === '1 / 4', JSON.stringify([p2, p3, p2b, p1b]));
      for (let i = 0; i < 6; i++) await p.keyboard.press('ArrowRight');
      await sleep(400);
      const end = await pres();
      check(eng, 'the last frame is the end: stepping past it stays; a frame with no caption shows none', end.n === '4 / 4' && end.cap === '' && end.shown === 'd', JSON.stringify(end));
      await p.keyboard.press('Shift+Digit1'); // keys of the board do nothing under a talk
      await sleep(300);
      check(eng, 'under a talk the camera stays on its frame (⇧1 fits nothing)', (await pres()).shown === 'd' && (await pres()).mid);
      await p.keyboard.press('Escape');
      await sleep(500);
      const back = await cam();
      check(eng, 'Esc leaves present mode and the camera is where it was', (await pres()).on === false && Math.abs(back.z - camBefore.z) < 0.001 && Math.abs(back.x - camBefore.x) < 1 && Math.abs(back.y - camBefore.y) < 1 && (await p.evaluate(() => getComputedStyle(document.querySelector('[data-lab-comments]') || document.body).display)) !== 'none', JSON.stringify([camBefore, back]));
      await p.keyboard.press('Tab');
      await p.keyboard.press('Tab');
      await p.keyboard.press('KeyP');
      await sleep(600);
      const sel2 = await pres();
      await p.keyboard.press('KeyP');
      await sleep(300);
      check(eng, 'present starts at the selected frame (here 2), and P again leaves', sel2.on && sel2.n === '2 / 4' && (await pres()).on === false, JSON.stringify(sel2));
      // keys that must not reach the board under a talk, a clicker's keys, and the frames either side kept alive
      await p.keyboard.press('KeyP');
      await sleep(1500);
      const nowN = () => p.evaluate(() => [document.querySelectorAll('#lab-board .f').length, document.querySelector('#lab-board .pn').textContent, __labBoard.live().sort().join('')]);
      const [n0, num0, live0] = await nowN();
      for (const k of ['Meta+KeyD', 'Control+KeyD', 'Meta+KeyZ', 'Control+KeyZ', 'Backspace']) await p.keyboard.press(k);
      await sleep(900);
      const [n1, num1] = await nowN();
      check(eng, 'under a talk ⌘D, ⌘Z and Delete change nothing', n0 === 4 && n1 === 4 && num0 === num1 && !(await pres()).shown.includes(','), JSON.stringify([n0, n1, num0, num1]));
      check(eng, 'the frames either side of the one shown are alive too (a step shows the page, not a card)', ['a', 'b', 'c'].every((id) => live0.includes(id)), live0);
      const stepped = [];
      for (const [key, want] of [['PageDown', '3 / 4'], ['ArrowUp', '2 / 4'], ['ArrowDown', '3 / 4'], ['PageUp', '2 / 4']]) {
        await p.keyboard.press(key);
        await sleep(250);
        stepped.push([key, (await nowN())[1], want]);
      }
      check(eng, 'a clicker steps: PageDown / ↓ next, PageUp / ↑ back', stepped.every(([, got, want]) => got === want), JSON.stringify(stepped));
      await p.keyboard.press('Escape');
      await p.goto(B + '/_lab/board/plain');
      await bw(2000);
      await p.keyboard.press('KeyP');
      await sleep(600);
      const plain = await pres();
      check(eng, 'a board that is no flow presents left to right', plain.on && plain.cap === 'left' && plain.n === '1 / 2', JSON.stringify(plain));
      await p.keyboard.press('Escape');
      // ----- a board that does not exist
      await p.goto(B + '/_lab/board/nothere');
      await sleep(1200);
      check(eng, 'a board that does not exist says so', /no board called nothere/i.test(await p.evaluate(() => document.body.textContent)));
      // ----- the board's own address is the one board: the view a page's board link opens, over an empty page
      await p.goto(B + '/_lab/board/three');
      await bw(1500);
      await p.mouse.move(600, 400);
      await p.mouse.wheel(30, 40);
      await sleep(900);
      const alone = await p.evaluate(() => { const v = document.querySelector('[data-lab-board-view="three"]'); const r = v?.getBoundingClientRect(); return { view: Boolean(v), whole: Boolean(r) && r.top === 0 && r.left === 0 && r.width === innerWidth && r.height === innerHeight, inView: Boolean(v?.querySelector('#lab-board .world')), name: v?.querySelector('.bv-name')?.textContent, half: Boolean(v?.querySelector('.bv-size, .bv-grip')), close: Boolean(v?.querySelector('.bv-close')), title: document.title, hash: location.hash, entries: history.length }; });
      check(eng, 'the board page is the board view over the whole window, named, with no half and no close (nothing is under it)', alone.view && alone.whole && alone.inView && alone.name === 'board three' && !alone.half && !alone.close && alone.title === 'board three', JSON.stringify(alone));
      check(eng, 'the board page keeps its camera in the address (a reload comes back there)', /^#-?\d+,-?\d+,[\d.]+$/.test(alone.hash), alone.hash);
      const backs = [];
      for (const how of ['button', 'Shift+KeyB', 'Escape']) {
        await p.goto(B + '/_lab/board/three?of=%2Fcheckout');
        await bw(1200);
        const label = await p.evaluate(() => document.querySelector('[data-lab-board-view] .bv-close')?.textContent);
        if (how === 'button') await p.click('[data-lab-board-view] .bv-close');
        else await p.keyboard.press(how);
        await p.waitForURL(B + '/checkout', { timeout: 4000 }).catch(() => {});
        backs.push([how, label, new URL(p.url()).pathname]);
      }
      check(eng, 'a board page that names its page (?of=) goes back to it: "‹ back", ⇧B, Esc on an empty board', backs.every(([, label, at]) => label === '‹ back' && at === '/checkout'), JSON.stringify(backs));
      await ctx.close();
      // ----- a phone: first view is every frame at a phone's width, side by side, live; no page zoom
      const ph = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
      const q = await ph.newPage();
      await q.goto(B + '/_lab/board/three');
      await sleep(2500);
      const first = await q.evaluate(() => ({ cam: __labBoard.camera(), live: __labBoard.live(), vv: visualViewport.scale }));
      const widths = await q.evaluate(() => [...document.querySelectorAll('#lab-board .f')].map((f) => f.offsetWidth));
      check(eng, 'phone: the first view is every frame, 390 wide, the ones in view alive', widths.length > 1 && widths.every((w) => w === 390) && first.live.length >= 1 && first.cam.z < 0.9 && first.vv === 1, JSON.stringify({ ...first, widths }));
      // slides on a phone keep their size (never cut to a phone's corner), flow order, and a tap steps
      await q.goto(B + '/_lab/board/slidephone');
      await sleep(2500);
      const slideW = await q.evaluate(() => [...document.querySelectorAll('#lab-board .f')].map((f) => f.offsetWidth));
      const slideX = await q.evaluate(() => [...document.querySelectorAll('#lab-board .f')].map((f) => parseFloat(f.style.left)));
      await q.click('#lab-board .zm .zo');
      await q.click('#lab-board .zm .zc:text("present")');
      await sleep(900);
      const slideFit = await q.evaluate(() => { const b = document.querySelector('#lab-board .f.cur').getBoundingClientRect(); return [Math.round(b.left), Math.round(b.right), innerWidth]; });
      const tapAt = (x) => q.evaluate((x) => { const r = document.getElementById('lab-board'); r.setPointerCapture = () => {}; const at = (t) => r.dispatchEvent(new PointerEvent(t, { pointerType: 'touch', pointerId: 9, isPrimary: true, clientX: x, clientY: 300, bubbles: true, cancelable: true, composed: true })); at('pointerdown'); at('pointerup'); }, x);
      await tapAt(300);
      await sleep(400);
      const tap1 = await q.evaluate(() => document.querySelector('#lab-board .pn').textContent);
      await tapAt(20);
      await sleep(400);
      const tap2 = await q.evaluate(() => document.querySelector('#lab-board .pn').textContent);
      check(eng, 'phone: slide frames keep 1920×1080 in flow order, a presented slide fits the screen whole, a tap steps (left edge back)', slideW.every((w) => w === 1920) && slideX[1] > slideX[0] && slideFit[0] >= 0 && slideFit[1] <= slideFit[2] && tap1 === '2 / 3' && tap2 === '1 / 3', JSON.stringify([slideW, slideX, slideFit, tap1, tap2]));
      await q.click('#lab-board .px');
      // a phone presents from the zoom menu and swipes between frames
      await q.goto(B + '/_lab/board/story');
      await sleep(2500);
      await q.click('#lab-board .zm .zo');
      await q.click('#lab-board .zm .zc:text("present")');
      await sleep(900);
      const swipe = async (dx) => q.evaluate((dx) => {
        const r = document.getElementById('lab-board');
        r.setPointerCapture = () => {};
        const at = (type, x) => r.dispatchEvent(new PointerEvent(type, { pointerType: 'touch', pointerId: 7, isPrimary: true, clientX: x, clientY: 400, bubbles: true, cancelable: true, composed: true }));
        at('pointerdown', 200);
        at('pointermove', 200 + dx / 2);
        at('pointermove', 200 + dx);
        at('pointerup', 200 + dx);
      }, dx);
      const ph0 = await q.evaluate(() => [document.getElementById('lab-board').classList.contains('pres'), document.querySelector('#lab-board .pn').textContent]);
      await swipe(-120);
      await sleep(400);
      const ph1 = await q.evaluate(() => document.querySelector('#lab-board .pn').textContent);
      await swipe(120);
      await sleep(400);
      const ph2 = await q.evaluate(() => document.querySelector('#lab-board .pn').textContent);
      await q.click('#lab-board .px');
      await sleep(300);
      check(eng, 'phone: present from the zoom menu, a swipe left steps on, right back, close leaves', ph0[0] && ph0[1] === '1 / 4' && ph1 === '2 / 4' && ph2 === '1 / 4' && (await q.evaluate(() => !document.getElementById('lab-board').classList.contains('pres'))), JSON.stringify([ph0, ph1, ph2]));
      await ph.close();
    } finally {
      await browser.close();
    }
  }
} finally {
  server.kill();
  fs.rmSync(DIR, { recursive: true, force: true });
}
finish();
