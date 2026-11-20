// A phone pinch-zoomed in: the bar and the chat stay their usual size, inside what the screen shows, and the page between
// them still takes taps (Leo, 19 Nov: "on mobile zooms breaks our windows"). The page starts zoomed in (initial-scale), as
// a pinch leaves it: no engine Playwright drives can pinch. Run: node test/browser/zoom.mjs (needs playwright).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { claimPort } from './port.mjs';

const require = createRequire(import.meta.url);
const pw = (() => {
  try {
    return require('playwright');
  } catch {
    try {
      return require(require.resolve('playwright', { paths: (process.env.NODE_PATH || '').split(path.delimiter) }));
    } catch {
      console.log('playwright is not installed: skipped');
      process.exit(0);
    }
  }
})();

const LAB = fileURLToPath(new URL('../../local.mjs', import.meta.url));
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'labit-zoom-'));
const PORT = String(claimPort(6010, 30));
const B = `http://localhost:${PORT}`;
const ZOOM = 2.5;
const paras = Array.from({ length: 60 }, (_, i) => `<p id="p${i}">paragraph ${i} with some words to read</p>`).join('');
fs.writeFileSync(path.join(DIR, 'index.html'), `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=${ZOOM}"><title>Z</title><body style="margin:20px">${paras}</body>`);
const env = { ...process.env, LABIT_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'labit-home-')), LABIT_NO_UPDATE_CHECK: '1', LABIT_EXIT_WITH_PARENT: '1' };
const server = spawn(process.execPath, [LAB, '.', '--new', '--no-open', '--port', PORT], { cwd: DIR, env });
for (let i = 0; i < 80; i++) {
  try {
    await fetch(B + '/');
    break;
  } catch {
    await new Promise((r) => setTimeout(r, 100));
  }
}
let failed = 0;
const check = (eng, name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${eng.padEnd(8)} ${name}${detail ? ` (${detail})` : ''}`);
};

for (const eng of (process.env.ENGINES || 'webkit,chromium').split(',')) {
  const browser = await pw[eng].launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  await p.goto(B + '/');
  await p.waitForFunction(() => document.querySelector('[data-lab-comments]')?.shadowRoot?.querySelector('.bar button:not([hidden])'), null, { timeout: 5000 }).catch(() => {});
  await p.waitForTimeout(300);
  // A part's box on the screen, in the visual viewport's own frame whichever frame the engine measures boxes in.
  const seen = (sel) => p.evaluate((s) => {
    const v = visualViewport;
    const h = document.querySelector('[data-lab-comments]');
    const n = h.shadowRoot.querySelector(s);
    const r = n.getBoundingClientRect();
    const inside = (x, y) => x >= -1 && y >= -1 && x + r.width <= v.width + 1 && y + r.height <= v.height + 1;
    return { scale: v.scale, zoom: h.hasAttribute('data-zoom'), w: r.width, h: r.height, vw: v.width, vh: v.height, laid: n.offsetWidth,
      inside: inside(r.left - v.offsetLeft, r.top - v.offsetTop) || inside(r.left, r.top) };
  }, sel);
  const bar = await seen('.bar');
  // Playwright's desktop WebKit ignores a page's initial-scale (scale stays 1, on Linux and on a Mac): nothing to check
  // there. Safari in the iOS simulator does zoom (test/phone).
  if (Math.abs(bar.scale - 1) < 0.01 && eng === 'webkit') {
    console.log(`skip ${eng.padEnd(8)} this engine does not zoom a page (scale 1)`);
    await browser.close();
    continue;
  }
  check(eng, 'the page is zoomed in', Math.abs(bar.scale - ZOOM) < 0.05, `scale ${bar.scale}`);
  check(eng, 'the bar keeps its usual size', Math.abs(bar.w * bar.scale - bar.laid) < 2, `${Math.round(bar.w)} px of ${Math.round(bar.vw)} shown, laid out ${bar.laid}`);
  check(eng, 'the bar is inside what the screen shows', bar.inside, JSON.stringify(bar));
  const free = await p.evaluate(() => {
    const e = document.elementFromPoint(visualViewport.width / 2, visualViewport.height / 3);
    return e?.closest('[data-lab-comments]') ? 'widget' : e?.localName;
  });
  check(eng, 'the page between takes taps', free && free !== 'widget', free);
  await p.keyboard.press('t');
  await p.waitForFunction(() => !document.querySelector('[data-lab-comments]').shadowRoot.querySelector('.chatwin').hidden, null, { timeout: 2000 }).catch(() => {});
  await p.waitForTimeout(500);
  const chat = await seen('.chatwin');
  check(eng, 'the chat opens at its usual size, inside what the screen shows', Math.abs(chat.w * chat.scale - chat.laid) < 2 && chat.inside, JSON.stringify(chat));
  await browser.close();
}
server.kill();
fs.rmSync(DIR, { recursive: true, force: true });
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
