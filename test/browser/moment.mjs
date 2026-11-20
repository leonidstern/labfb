// Pause, comment, the moment kept (Leo, 19 Nov): a pin written while the page is paused carries where the paused thing
// stood (a CSS loop's second inside one pass and which pass, a video's time; a GIF how long it had been showing), shows
// it as a chip while written and on the sent pin, the page stays paused after sending, and the chip on a pin takes the
// page back to that moment. In WebKit and Chrome's engine. Not part of `npm test`.
// Run: node test/browser/moment.mjs (needs playwright; NODE_PATH can point at a node_modules that has it).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { claimPort } from './port.mjs';

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
const MEDIA = fileURLToPath(new URL('../../bench/', import.meta.url));
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'labit-moment-'));
const PORT = claimPort(7960, 30);
const B = `http://localhost:${PORT}`;
fs.copyFileSync(path.join(MEDIA, 'site/media/countdown.webm'), path.join(DIR, 'v.webm'));
fs.copyFileSync(path.join(MEDIA, 'situations/media/b2-sync.gif'), path.join(DIR, 'g.gif'));
// As on the lab's page (canvas-proposals#moment): a track holding a 4 s loop, a pulsing dot, a video and a GIF side by
// side in one row, so a pin on each must take its own motion, not its neighbour's.
const PAGE = `<!doctype html><meta charset="utf-8"><title>m</title>
<style>@keyframes slide { to { translate: 200px } } @keyframes pulse { 50% { scale: 1.25 } }
body { margin: 20px; font: 16px sans-serif } .demo { display: flex; flex-wrap: wrap; gap: 16px; align-items: center }
#track { width: 400px; height: 100px; padding: 10px; box-sizing: border-box; background: #eee }
#loop { width: 60px; height: 60px; background: #333; animation: slide 4s linear infinite }
#dot { width: 24px; height: 24px; border-radius: 50%; background: #888; animation: pulse 1.5s ease-in-out infinite }
video, img { display: block; width: 200px }</style>
<h1>Moment</h1><div class="demo"><div id="track"><div id="loop"></div></div><div id="dot"></div><video id="vid" src="v.webm" muted loop autoplay playsinline></video><img id="gif" src="g.gif" alt="gif"></div><p>text</p>`;
// One page per engine: the pins of one never sit under the clicks of the other.
for (const eng of ['webkit', 'chromium']) for (const n of ['', '-b', '-c']) fs.writeFileSync(path.join(DIR, `${eng}${n}.html`), PAGE);
const env = { ...process.env, PORT: '', XDG_CONFIG_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'labit-cfg-')), LABIT_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'labit-home-')), LABIT_NO_UPDATE_CHECK: '1', LABIT_EXIT_WITH_PARENT: '1' };
const server = spawn(process.execPath, [LAB, '--new', '--no-open', '--port', String(PORT)], { cwd: DIR, env });
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
const until = (p, fn, arg, ms) => p.waitForFunction(fn, arg, { timeout: ms, polling: 'raf' }).catch(() => {});
const ROOT = "[...document.querySelectorAll('*')].find((n) => n.shadowRoot?.querySelector('.scrim'))?.shadowRoot";
const inRoot = (p, js) => p.evaluate(`(() => { const r = ${ROOT}; return ${js}; })()`);
let PG = '/webkit';
const comments = async () => (await (await fetch(`${B}/_lab/api/comments?page=${PG}`)).json()).comments;
const loopState = (p) => p.evaluate(() => { const a = document.getElementById('loop').getAnimations()[0]; return { play: a.playState, t: Number(a.currentTime) }; });

try {
  for (const eng of (process.env.ENGINES || 'webkit,chromium').split(',')) {
    PG = `/${eng}`;
    const browser = await pw[eng].launch();
    try {
      const ctx = await browser.newContext({ viewport: { width: 1000, height: 800 } });
      await ctx.addInitScript(() => localStorage.setItem('lab-name', 'zz-moment'));
      const p = await ctx.newPage();
      await p.goto(B + PG);
      await until(p, (src) => Boolean(new Function(`return ${src}`)()?.querySelector('.motions')), ROOT, 3000);
      await until(p, () => document.getElementById('vid').currentTime > 0.5, null, 4000);
      await sleep(1200);
      const videoOk = await p.evaluate(() => document.getElementById('vid').readyState >= 2);
      // A loop that has been going a long while (Leo's 835734 ms): the moment is inside one pass, and which pass.
      await p.evaluate(() => (document.getElementById('loop').getAnimations()[0].currentTime = 835734));
      await p.keyboard.press('p');
      await until(p, () => document.getElementById('loop').getAnimations()[0]?.playState === 'paused', null, 1000);
      // A pin on the loop: the chip while writing, the moment in the payload.
      const pin = async (id, words, fx = 0, fy = 0.75) => {
        const r = await p.evaluate((i) => (document.getElementById(i).scrollIntoView({ block: 'center' }), document.getElementById(i).getBoundingClientRect().toJSON()), id);
        await sleep(300);
        const open = async () => {
          for (let i = 0; i < 20 && !(await inRoot(p, "Boolean(r.querySelector('.float textarea'))")); i++) await sleep(100);
        };
        // A busy machine: a click as the last card goes can be taken by it; click again.
        for (let i = 0; i < 3 && !(await inRoot(p, "Boolean(r.querySelector('.float textarea'))")); i++) {
          if (i) await sleep(500);
          if (await inRoot(p, "Boolean(r.querySelector('.card:not(.out)'))")) { // a card in the way: let it go first
            await inRoot(p, 'r.activeElement?.blur()');
            await p.keyboard.press('Escape');
            await sleep(400);
          }
          await p.mouse.click(fx ? r.left + r.width * fx : r.left + Math.min(20, r.width / 2), r.top + r.height * fy);
          await open();
        }
        const chip = await inRoot(p, "r.querySelector('.float .moment')?.textContent || ''");
        const icon = await inRoot(p, "Boolean(r.querySelector('.float .moment svg'))"); // ⏸: the moment was paused
        await p.keyboard.type(words);
        await p.keyboard.press('Enter');
        let c;
        for (let i = 0; i < 30 && !(c = (await comments()).find((x) => x.text === words)); i++) await sleep(100);
        // The sent card (with its undo) closes on its own after 3 s; the next pin waits for it.
        for (let i = 0; i < 40 && (await inRoot(p, "Boolean(r.querySelector('.card:not(.out)'))")); i++) await sleep(100);
        // Touched meanwhile, it stays open: its pin closes it.
        const openPin = await inRoot(p, "r.querySelector('.pin.open')?.getBoundingClientRect().toJSON()");
        if (openPin && (await inRoot(p, "Boolean(r.querySelector('.card:not(.out)'))"))) await p.mouse.click(openPin.left + openPin.width / 2, openPin.top + openPin.height / 2);
        for (let i = 0; i < 3 && (await inRoot(p, "Boolean(r.querySelector('.card:not(.out)'))")); i++) {
          await inRoot(p, 'r.activeElement?.blur()'); // Escape closes it, once no box holds the keys
          await p.keyboard.press('Escape');
          await sleep(300);
        }
        await sleep(1000); // the card's way out and the undo's end settle before the next press
        return { chip, icon, c };
      };
      const before = await loopState(p);
      const loop = await pin('loop', 'on the loop');
      const m = loop.c?.anchor?.moment;
      const want = (before.t % 4000) / 1000;
      check(eng, 'the box shows the loop\'s moment while paused', /^loop \d+(\.\d)? of 4 s · pass \d+$/.test(loop.chip), loop.chip);
      check(eng, 'the pin carries the loop\'s second inside one pass and its pass', m?.kind === 'loop' && m.of === 4 && Math.abs(m.at - want) < 0.11 && m.pass === Math.floor(before.t / 4000) + 1 && /loop/.test(m.what || ''), JSON.stringify({ m, want, t: before.t }));
      check(eng, 'the page stays paused after sending', (await loopState(p)).play === 'paused');
      // The track's empty end, the dot: each its own motion.
      const track = await pin('track', 'on the track', 0.95, 0.5);
      const tm = track.c?.anchor?.moment;
      check(eng, 'a pin on the track (no motion of its own but the loop inside) takes the loop', tm?.kind === 'loop' && tm.sel === '#loop' && tm.of === 4 && /^loop [\d.]+ of 4 s · pass \d+$/.test(track.chip), JSON.stringify({ tm, chip: track.chip }));
      const dot = await pin('dot', 'on the dot', 0.5, 0.5);
      const dm = dot.c?.anchor?.moment;
      check(eng, 'a pin on the dot takes the dot\'s own loop, not its neighbour\'s', dm?.kind === 'loop' && dm.sel === '#dot' && dm.of === 1.5 && /^loop [\d.]+ of 1\.5 s · pass \d+$/.test(dot.chip), JSON.stringify({ dm, chip: dot.chip }));
      const gif = await pin('gif', 'on the gif');
      check(eng, 'a pin on a GIF says how long it had been showing', gif.c?.anchor?.moment?.kind === 'gif' && /^GIF [\d.]+ s after it showed$/.test(gif.chip), JSON.stringify({ m: gif.c?.anchor?.moment, chip: gif.chip }));
      if (videoOk) {
        const vt = await p.evaluate(() => { const v = document.getElementById('vid'); return { t: v.currentTime, d: v.duration, paused: v.paused }; });
        const vid = await pin('vid', 'on the video');
        const vm = vid.c?.anchor?.moment;
        check(eng, 'a pin on the paused video carries its time and length', vt.paused && vm?.kind === 'video' && Math.abs(vm.at - vt.t) < 0.11 && Math.abs(vm.of - vt.d) < 0.11 && /^video \d:\d\d\.\d of \d:\d\d$/.test(vid.chip), JSON.stringify({ vm, vt, chip: vid.chip }));
      } else console.log(`skip ${eng.padEnd(8)} video (this engine can't play the WebM)`);
      const page = await pin('loop', 'second on the loop');
      check(eng, 'pause, comment, again: the second pin has the same moment', page.c?.anchor?.moment?.at === m?.at, JSON.stringify(page.c?.anchor?.moment));
      // The agent's text says it in words.
      const text = await (await fetch(`${B}/_lab/agent${PG}`)).text();
      check(eng, 'the agent reads the moment in words', /page paused at loop [\d.]+ of 4 s · pass \d+ \(div#loop\)/.test(text), text.split('\n').find((l) => /paused/.test(l)));
      // Play on, then the sent pin's chip takes the page back to that moment.
      await p.keyboard.press('p');
      await until(p, () => document.getElementById('loop').getAnimations()[0]?.playState === 'running', null, 1000);
      await sleep(900);
      await p.reload();
      await until(p, (src) => Boolean(new Function(`return ${src}`)()?.querySelectorAll('.pin').length >= 3), ROOT, 8000);
      await sleep(300);
      const lr = await p.evaluate(() => document.getElementById('loop').getBoundingClientRect().toJSON());
      // The pins nearest the loop, in order: on a busy machine (eight jobs at once) the nearest may still be settling,
      // so a card without the moment chip is closed and the next one tried.
      const boxes = await inRoot(p, `[...r.querySelectorAll('.pin')].map((n) => n.getBoundingClientRect().toJSON()).sort((a, b) => Math.hypot(a.left - ${lr.left + 20}, a.bottom - ${lr.top + lr.height / 2}) - Math.hypot(b.left - ${lr.left + 20}, b.bottom - ${lr.top + lr.height / 2})).slice(0, 4)`);
      for (const pinBox of boxes) {
        await p.mouse.click(pinBox.left + pinBox.width / 2, pinBox.top + pinBox.height / 2);
        if (await until(p, (src) => Boolean(new Function(`return ${src}`)()?.querySelector('.card button.moment')), ROOT, 3000)) break;
        await p.keyboard.press('Escape');
        await sleep(300);
      }
      const shown = await inRoot(p, "r.querySelector('.card button.moment')?.textContent || ''");
      await inRoot(p, "r.querySelector('.card button.moment').click()");
      await sleep(200);
      const after = await loopState(p);
      check(eng, 'the sent pin shows its moment', /^loop [\d.]+ of 4 s · pass \d+$/.test(shown), shown);
      check(eng, 'its chip pauses the page at that moment', after.play === 'paused' && Math.abs(after.t - m.ms) < 20, JSON.stringify({ after, ms: m?.ms }));
      // The other ways (Leo, 19 Nov: "it says only if i pause one"). Nothing paused: a pin on a moving thing still
      // keeps the moment it showed as the pin went down, said "at …", with no ⏸.
      PG = `/${eng}-c`;
      await p.goto(B + PG);
      await until(p, (src) => Boolean(new Function(`return ${src}`)()?.querySelector('.motions')), ROOT, 3000);
      await sleep(1200);
      const cDot = await pin('dot', 'moving dot', 0.5, 0.5);
      const cdm = cDot.c?.anchor?.moment;
      check(eng, 'nothing paused: a pin on the dot keeps its moment, "at …", no ⏸', cdm?.kind === 'loop' && cdm.sel === '#dot' && cdm.playing === true && !cDot.icon && /^at loop [\d.]+ of 1\.5 s · pass \d+$/.test(cDot.chip) && !cDot.c?.anchor?.paused, JSON.stringify({ cdm, chip: cDot.chip, icon: cDot.icon }));
      const cTrack = await pin('track', 'moving track', 0.95, 0.5);
      check(eng, 'nothing paused: a pin on the track keeps the loop\'s moment', cTrack.c?.anchor?.moment?.sel === '#loop' && cTrack.c.anchor.moment.playing === true && cTrack.chip.startsWith('at loop '), JSON.stringify({ m: cTrack.c?.anchor?.moment, chip: cTrack.chip }));
      if (videoOk) {
        const cVid = await pin('vid', 'moving video');
        check(eng, 'nothing paused: a pin on the video keeps its time', cVid.c?.anchor?.moment?.kind === 'video' && cVid.c.anchor.moment.playing === true && /^at video \d:\d\d\.\d of \d:\d\d$/.test(cVid.chip), JSON.stringify({ m: cVid.c?.anchor?.moment, chip: cVid.chip }));
      }
      const text2 = await (await fetch(`${B}/_lab/agent${PG}`)).text();
      check(eng, 'the agent reads a moving moment as such', /moment: at loop [\d.]+ of 1\.5 s · pass \d+ \(div#dot\) \(it was moving/.test(text2), text2.split('\n').find((l) => /moment:/.test(l)));
      // One thing paused with its own control (⌥): a pin on it has its paused moment, a pin on the dot beside it its
      // moving one.
      PG = `/${eng}-b`;
      await p.goto(B + PG);
      await until(p, (src) => Boolean(new Function(`return ${src}`)()?.querySelector('.motions')), ROOT, 3000);
      await sleep(800);
      const lr2 = await p.evaluate(() => document.getElementById('loop').getBoundingClientRect().toJSON());
      await p.mouse.move(lr2.left + 10, lr2.bottom - 10);
      await p.keyboard.down('Alt');
      await p.mouse.move(lr2.left + 11, lr2.bottom - 10);
      await until(p, (src) => Boolean(new Function(`return ${src}`)()?.querySelector('.motion-ctl.on .motion-play')), ROOT, 1500);
      const pb = await inRoot(p, "r.querySelector('.motion-ctl.on .motion-play').getBoundingClientRect().toJSON()");
      await p.mouse.click(pb.left + pb.width / 2, pb.top + pb.height / 2, { modifiers: ['Alt'] });
      await p.keyboard.up('Alt');
      await until(p, () => document.getElementById('loop').getAnimations()[0]?.playState === 'paused', null, 1000);
      await sleep(400);
      const bLoop = await pin('loop', 'one paused loop', 0, 0.85);
      const blm = bLoop.c?.anchor?.moment;
      check(eng, 'one paused: a pin on it has its paused moment, with ⏸', blm?.sel === '#loop' && !blm.playing && bLoop.icon && /^loop [\d.]+ of 4 s · pass \d+$/.test(bLoop.chip), JSON.stringify({ blm, chip: bLoop.chip, icon: bLoop.icon }));
      const bDot = await pin('dot', 'dot beside it', 0.5, 0.5);
      check(eng, 'one paused: a pin on the dot beside it has the dot\'s moving moment', bDot.c?.anchor?.moment?.sel === '#dot' && bDot.c.anchor.moment.playing === true && /^at loop [\d.]+ of 1\.5 s/.test(bDot.chip), JSON.stringify({ m: bDot.c?.anchor?.moment, chip: bDot.chip }));
      await ctx.close();
      const key = JSON.parse(fs.readFileSync(path.join(DIR, '.lab/server.json'), 'utf8')).agent;
      for (const c of (await comments()).filter((c) => !c.parent)) await fetch(B + '/_lab/api/comments', { method: 'POST', headers: { 'content-type': 'application/json', origin: B, 'x-lab-admin': key, 'x-lab-agent': '1' }, body: JSON.stringify({ page: PG, action: 'delete', id: c.id }) });
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
