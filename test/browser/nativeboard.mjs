// Board pins the browser holds (flag native): a pin on a frame is tied to the frame's box by its share of it (pinhold.ts),
// so the board's camera carries it. Through a pan and a zoom it stays on its spot of the frame and the same size, with no
// redraw by the widget; it follows its frame when the frame is moved. In a browser that doesn't really hide a pin its box
// cuts off (Safari) board pins are the script's, as before, and must still be on their spot. WebKit and Chrome's engine.
// Run: node test/browser/nativeboard.mjs (needs playwright; NODE_PATH can point at a node_modules that has it).
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
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'labit-nativeboard-'));
const PORT = 8430 + Math.floor(Math.random() * 30);
const B = `http://localhost:${PORT}`;
fs.writeFileSync(path.join(DIR, 'pricing.html'), '<!doctype html><meta charset="utf-8"><title>Pricing</title><h1>Pricing one</h1><div style="height:3000px"></div>');
fs.writeFileSync(path.join(DIR, 'checkout.html'), '<!doctype html><meta charset="utf-8"><title>Checkout</title><h1>Checkout</h1>');
fs.writeFileSync(path.join(DIR, 'index.html'), '<!doctype html><meta charset="utf-8"><title>k</title><h1>Keys</h1><p>text</p>');
fs.writeFileSync(path.join(DIR, 'labit.json'), JSON.stringify({ port: PORT, flags: { native: true } }));
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
await put('pins', [{ id: 'a', src: '/pricing', w: 390, h: 844 }, { id: 'b', src: '/pricing', w: 820, h: 600 }], { of: '/pricing' });
const hidesClipped = (p) =>
  p.evaluate(() => {
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;left:0;top:0;width:4px;height:4px;overflow:auto;scrollbar-width:none;opacity:0;pointer-events:none;z-index:2147483647';
    box.append(Object.assign(document.createElement('div'), { style: 'height:4px;anchor-name:--t-probe' }), Object.assign(document.createElement('div'), { style: 'height:80px' }));
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;width:4px;height:4px;opacity:0;z-index:2147483647;position-anchor:--t-probe;position-visibility:anchors-visible;left:anchor(left);top:calc(anchor(top) + 40px)';
    document.body.append(box, probe);
    box.scrollTop = 40;
    return new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => {
      const r = probe.getBoundingClientRect();
      const seen = document.elementFromPoint(1, 1) === probe;
      box.remove();
      probe.remove();
      res(Math.abs(r.left) < 1 && Math.abs(r.top) < 1 && !seen);
    })));
  });
try {
  for (const eng of (process.env.ENGINES || 'webkit,chromium').split(',')) {
    const browser = await pw[eng].launch();
    try {
      const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
      await ctx.addInitScript(() => { localStorage.setItem('lab-name', 'tester'); localStorage.setItem('lab-on', '1'); });
      const p = await ctx.newPage();
      p.on('pageerror', (e) => console.log('pageerror', e.message));
      await p.goto(B + '/_lab/board/pins');
      await p.waitForFunction(() => [...document.querySelectorAll('*')].some((n) => n.shadowRoot?.querySelector('.scrim')), null, { timeout: 5000 });
      await sleep(2000);
      const hides = await hidesClipped(p);
      console.log(`info ${eng.padEnd(8)} hides a pin its box cuts off: ${hides}`);
      const sh = (fn) => p.evaluate((f) => new Function('r', f)([...document.querySelectorAll('*')].find((n) => n.shadowRoot?.querySelector('.scrim')).shadowRoot), fn);
      const rect = (id) => p.evaluate((i) => { const r = document.querySelector(`#lab-board .f[data-id="${i}"]`).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width }; }, id);
      const a = await rect('a');
      await p.keyboard.press('Digit1'); // comment mode
      await sleep(200);
      await p.mouse.click(a.x + 100, a.y + 150);
      await p.waitForFunction(() => { const r = [...document.querySelectorAll('*')].find((n) => n.shadowRoot?.querySelector('.scrim')).shadowRoot; return Boolean(r.querySelector('textarea')); }, null, { timeout: 4000 }).catch(() => {});
      await p.keyboard.type('too tight here');
      await p.keyboard.press('Enter');
      let saved;
      for (let i = 0; i < 30 && !saved; i++) { await sleep(150); saved = (await (await fetch(`${B}/_lab/api/comments?page=/_board/pins`)).json()).comments?.[0]; }
      const an = saved?.anchor;
      await sleep(600);
      const pinAt = () => sh('const b = r.querySelector("button.pin"); const q = b.getBoundingClientRect(); return { x: q.x, y: q.y + q.height, w: q.width, held: getComputedStyle(b).position === "fixed" }');
      const spot = (fr) => ({ x: fr.x + an.fx * (fr.w / 390), y: fr.y + an.fy * (fr.w / 390) });
      const on = (pp, fr) => Math.abs(pp.x - spot(fr).x) < 3 && Math.abs(pp.y - spot(fr).y) < 3;
      const p1 = await pinAt();
      check(eng, hides ? 'a board pin on a frame is held by the browser, on its spot' : 'a board pin is placed by the script here (this browser shows clipped pins), on its spot', p1.held === hides && on(p1, a), JSON.stringify({ p1, want: spot(a) }));
      // Pan: drag the empty board (pointer mode). No redraw by the widget while the camera moves, and the pin stays on its spot.
      await p.keyboard.press('Digit1'); // back to the pointer (1 toggles; Esc on a board goes back to its page)
      await sleep(200);
      await p.evaluate(() => {
        window.labMeasured = 0;
        for (const [proto, fn] of [[Element.prototype, 'getBoundingClientRect'], [Range.prototype, 'getClientRects']]) {
          const was = proto[fn];
          proto[fn] = function (...x) { if (this.closest?.('#lab-board') === null || this instanceof Range) window.labMeasured++; return was.apply(this, x); };
        }
      });
      await p.mouse.move(1100, 700);
      await p.mouse.down();
      await p.mouse.move(950, 600, { steps: 12 });
      await p.mouse.up();
      await sleep(400);
      const measured = await p.evaluate(() => window.labMeasured);
      const a2 = await rect('a');
      const p2 = await pinAt();
      check(eng, 'a pan: the pin stays on its spot of the frame', a2.x < a.x - 50 && on(p2, a2), JSON.stringify({ moved: [a.x, a2.x], p2, want: spot(a2) }));
      if (hides) check(eng, '…and the widget measured nothing while the camera moved', measured === 0, `${measured} measurements`);
      // Zoom to 100%: on its spot and the same size on screen.
      await p.keyboard.press('Shift+Digit2');
      await sleep(800);
      const a3 = await rect('a');
      const p3 = await pinAt();
      check(eng, 'a zoom: the pin stays on its spot, the same size on screen', on(p3, a3) && Math.abs(p3.w - p1.w) < 1, JSON.stringify({ p3, want: spot(a3), w: p1.w }));
      // The frame moves in the board file: the pin goes with it.
      const now = await (await fetch(`${B}/_lab/api/board?name=pins`)).json();
      await fetch(`${B}/_lab/api/board?name=pins`, { method: 'PUT', headers: { 'content-type': 'application/json', origin: B }, body: JSON.stringify({ ...now, frames: now.frames.map((f) => (f.id === 'a' ? { ...f, x: f.x + 80, auto: false } : f)) }) });
      await sleep(1800);
      const a4 = await rect('a');
      const p4 = await pinAt();
      check(eng, 'the frame is moved: the pin goes with it', a4.x > a3.x + 10 && on(p4, a4), JSON.stringify({ moved: [a3.x, a4.x], p4, want: spot(a4) }));
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
