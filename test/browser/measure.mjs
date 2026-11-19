// Measure (flag measure) in real browsers (WebKit and Chrome's engine): G, a click on one thing and the mouse on
// another give the gap (or the four insides) and the size, checked against the page's own geometry: the CSS each case
// sets, and the hovered thing's layout size. Scale and zoom above them are taken out; a token is named only on an exact
// match, the page's own --space-* when it has them. Enter makes a pin that carries the measure to the agent; a phone
// starts it from the ⋯ menu and measures with two taps. Not part of `npm test`; CI runs it in the `browser` job.
// Run: node test/browser/measure.mjs (needs playwright; NODE_PATH can point at a node_modules that has it).
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
  console.log(`playwright is not installed: ${process.env.CI ? 'failed (CI)' : 'skipped'}`);
  process.exit(process.env.CI ? 1 : 0);
})();

const LAB = fileURLToPath(new URL('../../local.mjs', import.meta.url));
const env = { ...process.env, PORT: '', XDG_CONFIG_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'labit-cfg-')), LABIT_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'labit-home-')), LABIT_NO_UPDATE_CHECK: '1', LABIT_EXIT_WITH_PARENT: '1' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TOK = { 4: 'space-1', 8: 'space-2', 12: 'space-3', 16: 'space-4', 24: 'space-6', 32: 'space-8' };
const B = 'background:#ccc;';
const box = (m, st = '', inner = '') => `<div id="${m}" style="${B}${st}">${inner}</div>`;
// From the method's bench: [title, html, first, second, what the CSS says (CSS px), or 'overlap'].
const CASES = [
  ['siblings, gap 8', `<div style="display:flex;gap:8px">${box('a1', 'width:50px;height:30px')}${box('b1', 'width:50px;height:30px')}</div>`, 'a1', 'b1', [8]],
  ['siblings, gap 10.5', `<div style="display:flex;gap:10.5px">${box('a2', 'width:50px;height:30px')}${box('b2', 'width:50px;height:30px')}</div>`, 'a2', 'b2', [10.5]],
  ['stacked, margin 12.4', `${box('a3', 'height:30px;width:80px')}${box('b3', 'height:30px;width:80px;margin-top:12.4px')}`, 'a3', 'b3', [12.4]],
  ['margins collapse 16/24', `${box('a4', 'height:30px;width:80px;margin-bottom:16px')}${box('b4', 'height:30px;width:80px;margin-top:24px')}`, 'a4', 'b4', [24]],
  ['bordered siblings, gap 16', `<div style="display:flex;gap:16px">${box('a5', 'width:50px;height:30px;border:3px solid #000')}${box('b5', 'width:50px;height:30px;border:3px solid #000')}</div>`, 'a5', 'b5', [16]],
  ['diagonal 16 × 8', `<div style="position:relative;height:60px">${box('a6', 'position:absolute;left:0;top:0;width:40px;height:20px')}${box('b6', 'position:absolute;left:56px;top:28px;width:40px;height:20px')}</div>`, 'a6', 'b6', [16, 8]],
  ['nested, padding 16 + border 2', box('a7', 'padding:16px;border:2px solid #000;width:120px', box('b7', 'height:20px')), 'a7', 'b7', [16, 16, 16, 16]],
  ['nested, padding 12/24, child picked first', box('b8', 'padding:12px 24px;border:1px solid #000;width:120px', box('a8', 'height:20px')), 'a8', 'b8', [24, 24, 12, 12]],
  ['nested, border 4 + child margin 12', box('a9', 'border:4px solid #000;width:120px', box('b9', 'height:20px;margin:12px')), 'a9', 'b9', [12, 12, 12, 12]],
  ['scaled parent ×1.25, gap 12', `<div style="transform:scale(1.25);transform-origin:0 0;height:40px"><div style="display:flex;gap:12px">${box('a10', 'width:50px;height:30px')}${box('b10', 'width:50px;height:30px')}</div></div>`, 'a10', 'b10', [12]],
  ['zoomed ×1.5, gap 8', `<div style="zoom:1.5"><div style="display:flex;gap:8px">${box('a11', 'width:50px;height:30px')}${box('b11', 'width:50px;height:30px')}</div></div>`, 'a11', 'b11', [8]],
  ['shadow does not count, gap 8', `<div style="display:flex;gap:8px">${box('a12', 'width:50px;height:30px;box-shadow:0 0 0 4px #000')}${box('b12', 'width:50px;height:30px')}</div>`, 'a12', 'b12', [8]],
  ['overlap (−8 margin)', `<div style="display:flex">${box('a13', 'width:50px;height:30px')}${box('b13', 'width:50px;height:30px;margin-left:-8px;margin-top:6px')}</div>`, 'a13', 'b13', 'overlap'],
];
const page = (head = '') => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>m</title>${head}<body style="margin:0;padding:40px 24px 400px;font:14px system-ui">` +
  CASES.map(([t, html]) => `<section style="margin:0 0 56px;width:420px"><p style="margin:0 0 8px">${t}</p>${html}</section>`).join('') + '</body>';
// The page's own tokens: 10 is space-md here, 8 is none.
const TOKPAGE = `<!doctype html><meta charset="utf-8"><title>t</title><style>:root { --space-xs: 6px; --space-md: 0.625rem; }</style><body style="margin:40px">` +
  `<div style="display:flex;gap:10px">${box('t1', 'width:50px;height:30px')}${box('t2', 'width:50px;height:30px')}</div><div style="display:flex;gap:8px;margin-top:40px">${box('t3', 'width:50px;height:30px')}${box('t4', 'width:50px;height:30px')}</div></body>`;

const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'labit-measure-')));
const port = 7400 + Math.floor(Math.random() * 400);
fs.writeFileSync(path.join(dir, 'index.html'), page());
fs.writeFileSync(path.join(dir, 'tok.html'), TOKPAGE);
fs.writeFileSync(path.join(dir, 'labit.json'), JSON.stringify({ port, flags: { measure: true } }));
const server = spawn(process.execPath, [LAB, '--new', '--no-open'], { cwd: dir, env });
const L = `http://localhost:${port}`;
for (let i = 0; i < 80; i++) {
  try {
    await fetch(L + '/');
    break;
  } catch {
    await sleep(100);
  }
}
let failed = 0;
const check = (eng, name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${eng.padEnd(10)} ${name}${detail ? ` (${detail})` : ''}`);
};
// A point on the screen where the element itself is the top thing (not a child, not the bar).
const pointOn = (p, id) => p.evaluate((id) => {
  const e = document.getElementById(id);
  e.scrollIntoView({ block: 'center' });
  const r = e.getBoundingClientRect();
  for (let y = r.top + 1; y < r.bottom; y += 2) for (let x = r.left + 1; x < r.right; x += 2) if (document.elementFromPoint(x, y) === e) return [x, y];
  return null;
}, id);
const said = (p) => p.evaluate(() => [...document.querySelectorAll('[data-lab-comments]')].map((n) => n.shadowRoot?.querySelector('.mzbar span')?.textContent).find((v) => v !== undefined) ?? null);
// Numbers and tokens out of the words: "gap 10.5 px, no token (8 or 12)", "left 16 px, space-4".
const parse = (s) => [...(s || '').matchAll(/(?:gap|left|right|top|bottom) (-?[\d.]+) px, (space-[\w-]+|no token)/g)].map((m) => ({ v: +m[1], tok: m[2] === 'no token' ? null : m[2] }));
const size = (s) => (/the second is ([\d.]+) × ([\d.]+) px/.exec(s || '') || []).slice(1).map(Number);
const measureOn = async (p, phone) => {
  if (!phone) return p.keyboard.press('g');
  await p.evaluate(() => [...document.querySelectorAll('[data-lab-comments]')].map((n) => n.shadowRoot?.querySelector('.more')).find(Boolean)?.click());
  await sleep(300);
  await p.evaluate(() => [...document.querySelectorAll('[data-lab-comments]')].flatMap((n) => [...(n.shadowRoot?.querySelectorAll('.more-menu button') || [])]).find((b) => (b.textContent || '').startsWith('measure'))?.click());
};

try {
  for (const eng of (process.env.ENGINES || 'webkit,chromium').split(',')) {
    const browser = await pw[eng].launch();
    try {
      for (const phone of [false, true]) {
        const tag = phone ? `${eng}/phone` : eng;
        const ctx = await browser.newContext(phone ? { ...pw.devices['iPhone 13'], defaultBrowserType: undefined } : { viewport: { width: 1000, height: 700 } });
        await ctx.addInitScript(() => (localStorage.setItem('lab-name', 'zz'), localStorage.setItem('lab-on', '1'), localStorage.setItem('lab-hint-seen', '1')));
        const p = await ctx.newPage();
        await p.goto(L + '/');
        await sleep(2500);
        await measureOn(p, phone);
        await sleep(600);
        check(tag, 'measure starts, its bar shows', /one thing/i.test((await said(p)) || ''), String(await said(p)));
        for (const [title, , a, b, truth] of phone ? CASES.slice(0, 3) : CASES) {
          const pa = await pointOn(p, a);
          await (phone ? p.touchscreen.tap(...pa) : p.mouse.click(...pa));
          await sleep(100);
          const pb = await pointOn(p, b);
          await (phone ? p.touchscreen.tap(...pb) : p.mouse.move(...pb));
          await sleep(150);
          const s = await said(p);
          if (truth === 'overlap') check(tag, title, /they overlap/.test(s || ''), s);
          else {
            const got = parse(s).sort((x, y) => x.v - y.v), want = [...truth].sort((x, y) => x - y);
            const ok = got.length === want.length && got.every((g, i) => Math.abs(g.v - want[i]) <= 0.05 && g.tok === (TOK[want[i]] || null));
            check(tag, title, ok, ok ? '' : `${s} vs ${want.join(', ')}`);
          }
          // The size against the hovered thing's layout box (offsetWidth is CSS px, before any scale; ±1 for its rounding).
          const [w, h] = size(s), lw = await p.evaluate((id) => [document.getElementById(id).offsetWidth, document.getElementById(id).offsetHeight], b);
          check(tag, `${title}: size`, Math.abs(w - lw[0]) <= 1 && Math.abs(h - lw[1]) <= 1, `${w}×${h} vs ${lw.join('×')}`);
          await p.keyboard.press('Escape');
          if (phone) await p.touchscreen.tap(...pa).then(() => p.touchscreen.tap(...pa)); // a phone has no Esc: tapping the first twice lets go
          await sleep(50);
        }
        if (!phone) {
          // A pin made while measuring carries it.
          const pa = await pointOn(p, 'a2');
          await p.mouse.click(...pa);
          await p.mouse.move(...(await pointOn(p, 'b2')));
          await sleep(150);
          await p.keyboard.press('Enter');
          await sleep(500);
          await p.keyboard.type('too wide');
          const sent = p.waitForRequest((r) => r.url().endsWith('/_lab/api/comments') && r.method() === 'POST');
          await p.evaluate(() => [...document.querySelectorAll('[data-lab-comments]')].map((n) => n.shadowRoot?.querySelector('.float .send, .card .send')).find(Boolean)?.click());
          const body = (await sent).postDataJSON();
          check(tag, 'the pin carries the measure', /#a2 → #b2: across gap 10\.5 px, no token \(8 or 12\)/.test(body.anchor?.measure || ''), body.anchor?.measure);
          await sleep(500);
          const agent = await (await fetch(`${L}/_lab/agent${body.page}`)).text();
          check(tag, 'the agent reads it', /measured: #a2 → #b2: across gap 10\.5 px, no token \(8 or 12\)/.test(agent), agent.slice(0, 200));
          // The page's own --space-*: 10 px is space-md there, 8 px none.
          await p.goto(L + '/tok.html');
          await sleep(2000);
          await p.keyboard.press('g');
          await sleep(500);
          for (const [a, b, re] of [['t1', 't2', /gap 10 px, space-md/], ['t3', 't4', /gap 8 px, no token \(6 or 10\)/]]) {
            await p.mouse.click(...(await pointOn(p, a)));
            await p.mouse.move(...(await pointOn(p, b)));
            await sleep(150);
            check(tag, `page tokens: ${re.source}`, re.test((await said(p)) || ''), await said(p));
            await p.keyboard.press('Escape');
          }
          await p.keyboard.press('Escape');
          await sleep(100);
          check(tag, 'Esc twice leaves measure', (await said(p)) === null || !(await p.evaluate(() => document.documentElement.classList.contains('lab-measuring'))));
        }
        await ctx.close();
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  server.kill();
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
