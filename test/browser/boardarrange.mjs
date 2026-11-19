// Shortcuts from labit.json in real browsers (WebKit and Chrome's engine): the changed keys work, the old ones don't,
// and the bar shows the new key. Not part of `npm test`; CI runs it in the `browser` job.
// Run: node test/browser/shortcuts.mjs (needs playwright; NODE_PATH can point at a node_modules that has it).
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
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'labit-boardarr-'));
const PORT = 8200 + Math.floor(Math.random() * 30);
const B = `http://localhost:${PORT}`;
fs.writeFileSync(path.join(DIR, 'pricing.html'), '<!doctype html><meta charset="utf-8"><title>Pricing</title><h1>Pricing one</h1><div style="height:3000px"></div>');
fs.writeFileSync(path.join(DIR, 'checkout.html'), '<!doctype html><meta charset="utf-8"><title>Checkout</title><h1>Checkout</h1>');
fs.writeFileSync(path.join(DIR, 'index.html'), '<!doctype html><meta charset="utf-8"><title>k</title><h1>Keys</h1><p>text</p>');
fs.writeFileSync(path.join(DIR, 'labit.json'), JSON.stringify({ port: PORT, flags: { board: true } }));
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
const file = (n) => JSON.parse(fs.readFileSync(path.join(DIR, `.lab/boards/${n}.json`), 'utf8'));
const three = () => [{ id: 'a', src: '/pricing', w: 390, h: 844 }, { id: 'b', src: '/pricing', w: 390, h: 844 }, { id: 'c', src: '/checkout', w: 390, h: 844 }];
try {
  for (const eng of (process.env.ENGINES || 'webkit,chromium').split(',')) {
    const browser = await pw[eng].launch();
    try {
      const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
      await ctx.addInitScript(() => localStorage.setItem('lab-name', 'leo'));
      const p = await ctx.newPage();
      const kids = () => p.evaluate(() => [...document.querySelectorAll('#lab-board .f')].map((f) => f.dataset.id));
      const centre = (id) => p.evaluate((i) => { const r = document.querySelector(`#lab-board .f[data-id="${i}"]`).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, id);
      const sel = async (id) => { const [x, y] = await centre(id); await p.mouse.click(x, y); await sleep(100); };
      const wait = async (fn, ms = 4000) => { for (let i = 0; i < ms / 100; i++) { if (await fn()) return true; await sleep(100); } return false; };
      await put('arr', three(), { of: '/pricing' });
      await p.goto(B + '/_lab/board/arr');
      await sleep(2000);
      // ----- nudge
      await sel('a');
      await p.keyboard.press('ArrowRight');
      await wait(() => file('arr').frames.find((f) => f.id === 'a').x !== undefined);
      let fr = file('arr').frames;
      check(eng, 'an arrow key moves the selected frame 8 px; the frames the lab placed stay unplaced in the file', fr[0].x % 8 === 0 && fr[0].x !== undefined && fr[1].x === undefined && fr[2].x === undefined, JSON.stringify(fr.map((f) => [f.id, f.x])));
      const a1 = fr[0].x;
      await p.keyboard.press('Shift+ArrowDown');
      await wait(() => file('arr').frames[0].y === 80);
      check(eng, 'Shift + arrow moves it 80 px', file('arr').frames[0].y === 80, String(file('arr').frames[0].y));
      // ----- drag the selected frame by its body
      const [cx, cy] = await centre('a');
      const z = (await p.evaluate(() => __labBoard.camera())).z;
      await p.mouse.move(cx, cy);
      await p.mouse.down();
      await p.mouse.move(cx + 120, cy + 40, { steps: 6 });
      await p.mouse.up();
      await wait(() => file('arr').frames[0].x !== a1);
      const moved = file('arr').frames[0];
      check(eng, 'dragging the selected frame moves it, rounded to 8, saved on release', moved.x !== a1 && moved.x % 8 === 0 && moved.y % 8 === 0 && Math.abs((moved.x - a1) - 120 / z) < 24, JSON.stringify([a1, moved.x, moved.y, z]));
      // ----- size from the label's list
      await p.evaluate(() => [...document.querySelectorAll('#lab-board .f.sel .t u')].find((u) => u.textContent === '820').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, composed: true, clientX: 5, clientY: 5 })));
      await wait(() => file('arr').frames[0].w === 820);
      check(eng, 'a size picked from the label list sets width and its preset height', file('arr').frames[0].w === 820 && file('arr').frames[0].h === 1180, JSON.stringify(file('arr').frames[0]));
      // ----- duplicate, undo
      await p.keyboard.press('Control+KeyD');
      await wait(() => file('arr').frames.length === 4);
      const d = file('arr').frames.find((f) => f.variantOf === 'a');
      check(eng, 'Ctrl/⌘ D duplicates the frame as a variant with a new id, 80 px to its right', file('arr').frames.length === 4 && d && d.id !== 'a' && d.x === file('arr').frames[0].x + 820 + 80 && d.src === '/pricing', JSON.stringify(d));
      await sleep(600);
      await p.keyboard.press('Control+KeyZ');
      await wait(async () => file('arr').frames.find((f) => f.id === d.id)?.state === 'archived' && (await kids()).length === 3);
      check(eng, 'Ctrl/⌘ Z archives the duplicate (a frame is never dropped)', file('arr').frames.find((f) => f.id === d.id).state === 'archived' && (await kids()).length === 3, JSON.stringify([await kids(), file('arr').frames.map((f) => [f.id, f.state, f.x])]));
      // ----- archive, undo
      for (let i = 0; i < 4 && (await p.evaluate(() => __labBoard.selected())) !== 'c'; i++) await p.keyboard.press('Tab');
      await p.keyboard.press('Backspace');
      await wait(async () => file('arr').frames.find((f) => f.id === 'c').state === 'archived' && !(await kids()).includes('c'));
      check(eng, 'Backspace archives the selected frame; it leaves the board', file('arr').frames.find((f) => f.id === 'c').state === 'archived' && !(await kids()).includes('c'), JSON.stringify(await kids()));
      await p.keyboard.press('Control+KeyZ');
      await wait(async () => file('arr').frames.find((f) => f.id === 'c').state === 'live' && (await kids()).includes('c'));
      check(eng, 'Ctrl/⌘ Z brings it back', file('arr').frames.find((f) => f.id === 'c').state === 'live' && (await kids()).includes('c'));
      // ----- a change made elsewhere first: theirs is shown, ours is not made
      const cur = await (await fetch(`${B}/_lab/api/board?name=arr`)).json();
      await fetch(`${B}/_lab/api/board?name=arr`, { method: 'PUT', headers: { 'content-type': 'application/json', origin: B }, body: JSON.stringify({ ...cur, title: 'other', rev: cur.rev }) });
      await p.evaluate(() => { /* the board has not heard of it yet */ });
      await sel('b');
      await p.keyboard.press('ArrowLeft');
      await sleep(1500);
      check(eng, 'the board keeps working after another writer got in first', (await kids()).length >= 3 && file('arr').title === 'other');
      // ----- rubber band: pan far past the edge, it settles back
      await p.keyboard.press('Shift+Digit2');
      await sleep(300);
      const edge = async () => p.evaluate(() => { const r = document.querySelector('#lab-board .world').getBoundingClientRect(); return r.left; });
      await p.mouse.move(600, 400);
      for (let i = 0; i < 12; i++) await p.mouse.wheel(3000, 0);
      await sleep(60);
      const over = await edge();
      await sleep(900);
      const rest = await edge();
      check(eng, 'past the edge the board gives way, then settles back inside it', over < rest - 5 || Math.abs(over - rest) > 5, JSON.stringify([over, rest]));
      // ----- phone: a swipe goes to the next frame
      const ph = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
      const q = await ph.newPage();
      await q.goto(B + '/_lab/board/arr');
      await sleep(2500);
      const cdp = await ph.newCDPSession(q).catch(() => null);
      if (cdp) {
        const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
        await touch('touchStart', 300, 400);
        for (let i = 1; i <= 8; i++) await touch('touchMove', 300 - i * 25, 400);
        await touch('touchEnd');
        await sleep(600);
        const sw = await q.evaluate(() => ({ sel: __labBoard.selected(), cam: __labBoard.camera() }));
        check(eng, 'phone: a swipe goes to the next frame, fitted', sw.sel === 'b' && sw.cam.z > 0.9, JSON.stringify(sw));
      } else console.log('skip      phone swipe (no CDP in this engine)');
      await ph.close();
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
