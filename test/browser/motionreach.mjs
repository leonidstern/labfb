// The ⌥ motion control can always be reached (Leo, 19 Nov: "sometimes menu with pause is out of reach"): it stays where
// it first showed while the thing moves, stays on screen near the edges, and lives 300 ms while the pointer crosses the
// gap to it. A moving track, a pulsing dot, a video and a GIF box, one at the right edge, one at the bottom, in WebKit
// and Chrome's engine. Not part of `npm test`. Run: node test/browser/motionreach.mjs (NODE_PATH to a playwright).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { claimPort } from './port.mjs';
import { playwright, engines, tmp, labEnv, startLab, labUp, sleep, check, finish } from './harness.mjs';

const pw = playwright();

const DIR = tmp('labit-reach-');
const PORT = claimPort(7990, 30);
const B = `http://localhost:${PORT}`;
fs.copyFileSync(fileURLToPath(new URL('../../bench/site/media/countdown.webm', import.meta.url)), path.join(DIR, 'v.webm'));
fs.writeFileSync(path.join(DIR, 'index.html'), `<!doctype html><meta charset="utf-8"><title>r</title>
<style>@keyframes slide { to { translate: 240px } } @keyframes pulse { 50% { scale: 1.4 } }
body { margin: 0; font: 16px sans-serif; min-height: 1400px } .row { display: flex; gap: 16px; align-items: center; padding: 20px }
#track { width: 340px; height: 80px; background: #eee } #loop { width: 60px; height: 60px; margin: 10px; background: #333; animation: slide 1.2s linear infinite }
#dot { width: 20px; height: 20px; border-radius: 50%; background: #888; animation: pulse .8s ease-in-out infinite }
video { width: 200px } #edge { position: absolute; right: 0; top: 200px; width: 30px; height: 30px; background: #555; animation: pulse 1s infinite }
#low { position: fixed; left: 300px; bottom: 0; width: 40px; height: 16px; background: #555; animation: pulse 1s infinite }</style>
<div class="row"><div id="track"><div id="loop"></div></div><div id="dot"></div><video id="vid" src="v.webm" muted loop autoplay playsinline></video></div>
<div id="edge"></div><div id="low"></div>`);
const server = startLab(DIR, labEnv(), { port: PORT });
await labUp(B);
const ROOT = "[...document.querySelectorAll('*')].find((n) => n.shadowRoot?.querySelector('.scrim'))?.shadowRoot";
const inRoot = (p, js) => p.evaluate(`(() => { const r = ${ROOT}; return ${js}; })()`);
const ctl = (p) => inRoot(p, "(() => { const c = r?.querySelector('.motion-ctl.on:not(.mini)'); const b = c?.querySelector('.motion-play')?.getBoundingClientRect(); return b && { x: b.left + b.width / 2, y: b.top + b.height / 2, l: b.left, t: b.top, r: b.right, btm: b.bottom }; })()");
const still = (p, id) => p.evaluate((i) => { const e = document.getElementById(i); return e instanceof HTMLVideoElement ? e.paused : e.getAnimations()[0]?.playState === 'paused'; }, id);

try {
  for (const eng of engines()) {
    const browser = await pw[eng].launch();
    try {
      const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
      await ctx.addInitScript(() => localStorage.setItem('lab-name', 'zz-moment'));
      const p = await ctx.newPage();
      await p.goto(B + '/');
      for (let i = 0; i < 30 && !(await inRoot(p, "Boolean(r?.querySelector('.motions'))")); i++) await sleep(100);
      await sleep(800);
      // Each one: ⌥ on it, then the pointer goes to its pause in small steps (the thing keeps moving meanwhile); the
      // control is still there, on screen, and its pause stops that one.
      for (const [id, fx, fy] of [['loop', 0.5, 0.5], ['dot', 0.5, 0.5], ['vid', 0.3, 0.7], ['edge', 0.5, 0.5], ['low', 0.5, 0.5], ['track', 0.95, 0.9]]) {
        const target = id === 'track' ? 'loop' : id;
        const r = await p.evaluate((i) => document.getElementById(i).getBoundingClientRect().toJSON(), id);
        const sx = r.left + r.width * fx, sy = r.top + r.height * fy;
        await p.mouse.move(sx, sy);
        await p.keyboard.down('Alt');
        await p.mouse.move(sx + 1, sy);
        let c = null;
        for (let i = 0; i < 20 && !(c = await ctl(p)); i++) await sleep(50);
        const first = c;
        if (c) {
          for (let k = 1; k <= 8; k++) {
            await p.mouse.move(sx + ((c.x - sx) * k) / 8, sy + ((c.y - sy) * k) / 8);
            await sleep(40);
          }
          c = await ctl(p);
        }
        const onScreen = Boolean(c && c.l >= 0 && c.t >= 0 && c.r <= 1000 && c.btm <= 700);
        const stayed = Boolean(c && first && Math.abs(c.x - first.x) < 2 && Math.abs(c.y - first.y) < 2);
        if (c) await p.mouse.click(c.x, c.y, { modifiers: ['Alt'] });
        await p.keyboard.up('Alt');
        await sleep(300);
        const stopped = await still(p, target);
        check(eng, `${id}: the control stays put, on screen, and its pause stops it`, Boolean(c) && onScreen && stayed && stopped, JSON.stringify({ first, c, stopped }));
        // Play it again for the next one.
        await p.keyboard.press('p');
        await sleep(150);
        if (await still(p, target)) await p.keyboard.press('p');
        await p.mouse.move(5, 650);
        await sleep(300);
      }
      // Running away (Leo, 19 Nov: "option and move cursor makes controls run away"): ⌥ on the loop, then the pointer
      // in the gap between its track and the dot. The row holds them all, but its control (at the row's far corner) doesn't
      // take over: the loop's stays where it was, then fades.
      {
        await p.keyboard.up('Alt');
        await sleep(400);
        const tr = await p.evaluate(() => document.getElementById('track').getBoundingClientRect().toJSON());
        const dt = await p.evaluate(() => document.getElementById('dot').getBoundingClientRect().toJSON());
        await p.mouse.move(tr.left + 20, tr.top + 40);
        await p.keyboard.down('Alt');
        await p.mouse.move(tr.left + 21, tr.top + 40);
        let g0 = null;
        for (let i = 0; i < 20 && !(g0 = await ctl(p)); i++) await sleep(50);
        const gap = [];
        for (let i = 0; i < 6; i++) {
          await p.mouse.move((tr.right + dt.left) / 2, tr.top + 40 + (i % 2));
          await sleep(60);
          gap.push(await ctl(p));
        }
        await p.keyboard.up('Alt');
        await sleep(300);
        check(eng, 'the gap between moving things: the control there stays put, the box around them takes none', Boolean(g0) && gap.every((c) => !c || (Math.abs(c.x - g0.x) < 2 && Math.abs(c.y - g0.y) < 2)), JSON.stringify({ g0, gap }));
      }
      // Jumping (Leo, 19 Nov: "its jumping yeah"): two moving things side by side; ⌥ on the first, the pointer passes
      // over the second on the way to the first's control: the control stays the first's, in one place.
      await p.evaluate(() => {
        const row = document.createElement('div');
        row.style.cssText = 'position:absolute;left:400px;top:300px;display:flex;gap:6px';
        row.innerHTML = '<div id="n1" style="width:36px;height:36px;background:#444;animation:pulse .9s infinite"></div><div id="n2" style="width:36px;height:36px;background:#777;animation:pulse .7s infinite"></div>';
        document.body.append(row);
      });
      await sleep(400);
      const n1 = await p.evaluate(() => document.getElementById('n1').getBoundingClientRect().toJSON());
      const n2 = await p.evaluate(() => document.getElementById('n2').getBoundingClientRect().toJSON());
      await p.mouse.move(n1.left + 8, n1.bottom - 8);
      await p.keyboard.down('Alt');
      await p.mouse.move(n1.left + 9, n1.bottom - 8);
      let a = null;
      for (let i = 0; i < 20 && !(a = await ctl(p)); i++) await sleep(50);
      const seen = [];
      // Over the neighbour and back up to the control, quickly.
      for (const [x, y] of [[n2.left + 10, n2.bottom - 6], [n2.left + 10, n1.top + 4], [a?.x ?? 0, a?.y ?? 0]]) {
        await p.mouse.move(x, y, { steps: 3 });
        await sleep(60);
        seen.push(await ctl(p));
      }
      const steady = Boolean(a) && seen.every((c) => c && Math.abs(c.x - a.x) < 2 && Math.abs(c.y - a.y) < 2);
      const last = seen.at(-1);
      if (last) await p.mouse.click(last.x, last.y, { modifiers: ['Alt'] });
      await p.keyboard.up('Alt');
      await sleep(300);
      check(eng, 'passing over a neighbour keeps one control, in one place, for the first', steady && (await still(p, 'n1')) && !(await still(p, 'n2')), JSON.stringify({ a, seen }));
      await ctx.close();
    } finally {
      await browser.close();
    }
  }
} finally {
  server.kill();
  fs.rmSync(DIR, { recursive: true, force: true });
}
finish();
