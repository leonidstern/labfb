// The board page in real browsers (WebKit and Chrome's engine): frames on one canvas, panned and zoomed, live pages in
// them, selecting and entering one, the board file followed, phones too. Not part of `npm test`; CI runs it in the `browser` job.
// Run: node test/browser/board.mjs (needs playwright; NODE_PATH can point at a node_modules that has it).
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
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'labit-board-'));
const PORT = 8080 + Math.floor(Math.random() * 30);
const B = `http://localhost:${PORT}`;
fs.writeFileSync(path.join(DIR, 'pricing.html'), '<!doctype html><meta charset="utf-8"><title>Pricing</title><h1>Pricing one</h1><div style="height:3000px"></div>');
fs.writeFileSync(path.join(DIR, 'checkout.html'), '<!doctype html><meta charset="utf-8"><title>Checkout</title><h1>Checkout</h1>');
fs.writeFileSync(path.join(DIR, 'index.html'), '<!doctype html><meta charset="utf-8"><title>k</title><h1>Keys</h1><p>text</p>');
fs.writeFileSync(path.join(DIR, 'labit.json'), JSON.stringify({ port: PORT }));
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
let failed = 0;
const check = (eng, name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${eng.padEnd(8)} ${name}${detail ? ` (${detail})` : ''}`);
};
const put = (name, frames, extra = {}) => fetch(`${B}/_lab/api/board?name=${name}`, { method: 'PUT', headers: { 'content-type': 'application/json', origin: B }, body: JSON.stringify({ v: 1, rev: 0, frames, ...extra }) }).then((r) => r.json());
const grid = (n) => Array.from({ length: n }, (_, i) => ({ id: 'f' + i, src: '/pricing', w: 300, h: 300, x: (i % 5) * 340, y: Math.floor(i / 5) * 340 }));
await put('ten', grid(10), { of: '/pricing' });
await put('three', [{ id: 'a', src: '/pricing', w: 390, h: 844 }, { id: 'b', src: '/pricing', w: 820, h: 1180 }, { id: 'c', src: '/checkout', w: 390, h: 844 }], { of: '/pricing' });
await put('wide', [{ id: 'a', src: '/pricing', w: 1000, h: 700, x: 0, y: 0 }, { id: 'b', src: '/pricing', w: 1000, h: 700, x: 4000, y: 3000 }]);
try {
  for (const eng of (process.env.ENGINES || 'webkit,chromium').split(',')) {
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
      const under = (c, x, y) => [x / c.z - c.x, y / c.z - c.y];
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
      // ----- select, enter, leave (focus goes back to the board)
      await p.keyboard.press('Shift+Digit1');
      await sleep(200);
      const pos = await p.evaluate(() => { const r = document.querySelector('#lab-board .f').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
      await p.mouse.click(pos[0], pos[1]);
      check(eng, 'a click selects the frame', (await p.evaluate(() => __labBoard.selected())) === 'f0');
      await p.keyboard.press('Enter');
      await sleep(400);
      const inFrame = await p.evaluate(() => ({ entered: __labBoard.entered(), pe: getComputedStyle(__labBoard.frame('f0')).pointerEvents, focus: document.activeElement === __labBoard.frame('f0') }));
      check(eng, 'Enter gives the page in the frame the pointer and the focus', inFrame.entered === 'f0' && inFrame.pe === 'auto' && inFrame.focus, JSON.stringify(inFrame));
      await p.keyboard.press('Escape');
      await sleep(250);
      const out = await p.evaluate(() => ({ entered: __labBoard.entered(), pe: getComputedStyle(__labBoard.frame('f0')).pointerEvents, body: document.activeElement === document.body, sel: __labBoard.selected() }));
      check(eng, 'Esc in a frame leaves it: the board has the focus again, the frame stays selected', out.entered === '' && out.pe === 'none' && out.body && out.sel === 'f0', JSON.stringify(out));
      await p.keyboard.press('Shift+Digit2'); // the board hears keys after leaving: this would go to the frame otherwise
      await sleep(150);
      check(eng, 'after leaving, board keys work again (Shift+2)', (await cam()).z === 1);
      await p.keyboard.press('Escape');
      check(eng, 'Esc clears the selection', (await p.evaluate(() => __labBoard.selected())) === '');
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
      // ----- a board that does not exist
      await p.goto(B + '/_lab/board/nothere');
      await sleep(1200);
      check(eng, 'a board that does not exist says so', /no board called nothere/i.test(await p.evaluate(() => document.body.textContent)));
      await ctx.close();
      // ----- a phone: first view is every frame at a phone's width, side by side, live; no page zoom
      const ph = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
      const q = await ph.newPage();
      await q.goto(B + '/_lab/board/three');
      await sleep(2500);
      const first = await q.evaluate(() => ({ cam: __labBoard.camera(), live: __labBoard.live(), vv: visualViewport.scale }));
      const widths = await q.evaluate(() => [...document.querySelectorAll('#lab-board .f')].map((f) => f.offsetWidth));
      check(eng, 'phone: the first view is every frame, 390 wide, the ones in view alive', widths.length > 1 && widths.every((w) => w === 390) && first.live.length >= 1 && first.cam.z < 0.9 && first.vv === 1, JSON.stringify({ ...first, widths }));
      await ph.close();
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
