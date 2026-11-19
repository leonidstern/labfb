// The section bar in real browsers (WebKit and Chrome's engine): the page's sections along the top, the current one filled,
// "new" and "updated" marked, what reads one (about 3 s in it, scrolling on, a tap), what is kept per person in the lab
// (two devices, two names, the lab's own store and not the looks), the page's own sticky bar, a phone's sideways line above a
// sheet's dimmed page, a computer's "…", and no bar with no sections or no flag. Not part of `npm test`; CI runs it in the
// `browser` job.
// Run: node test/browser/sections.mjs   (needs the playwright package; NODE_PATH can point at a node_modules that has it).
// ENGINES=webkit,chromium picks the engines (both by default).
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
const DIR = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'labit-sections-')));
const OFF_DIR = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'labit-sections-off-')));
const PORT = 5700 + Math.floor(Math.random() * 200);
const B = `http://localhost:${PORT}`;
const OFF = `http://localhost:${PORT + 200}`;
const env = { ...process.env, PORT: '', LABIT_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'labit-home-')), XDG_CONFIG_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'labit-cfg-')), LABIT_NO_UPDATE_CHECK: '1', LABIT_EXIT_WITH_PARENT: '1' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const write = (f, t, dir = DIR) => fs.writeFileSync(path.join(dir, f), t);
// Four sections far apart (each a screen and a half), after a title.
const sec = (id, title, words = `Words of ${title}.`) => `<section id="${id}"><h2>${title}</h2><p>${words}</p></section>`;
const page = ({ head = '', body = '', extra = '', title = 'Plan' } = {}) =>
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{margin:0 30px;font:16px/1.4 serif}h1{margin:50px 0}section{height:1100px}${head}</style><body><h1>${title}</h1>` +
  (body || sec('speed', 'Speed') + sec('cost', 'Cost') + sec('risk', 'Risk') + sec('plan', 'Next steps')) + extra + '</body>';
write('labit.json', JSON.stringify({ port: PORT, flags: { sectionBar: true } }));
write('index.html', page());
write('plain.html', page({ body: '<p>Only words.</p>' }));
write('sticky.html', page({ head: 'h1{display:none}header{position:sticky;top:0;height:60px;background:#eee;z-index:5}', body: '<header>Site</header>' + sec('a', 'Alpha') + sec('b', 'Beta') }));
write('zoomed.html', page().replace('initial-scale=1', 'initial-scale=2.5'));
write('many.html', page({ body: Array.from({ length: 14 }, (_, i) => sec(`m${i}`, `Section number ${i}`)).join('') }));
fs.writeFileSync(path.join(OFF_DIR, 'labit.json'), JSON.stringify({ port: PORT + 200 }));
write('index.html', page(), OFF_DIR);
const server = spawn(process.execPath, [LAB, '--new', '--no-open'], { cwd: DIR, env });
const offServer = spawn(process.execPath, [LAB, '--new', '--no-open'], { cwd: OFF_DIR, env });
for (const base of [B, OFF])
  for (let i = 0; i < 80; i++) {
    try {
      await fetch(base + '/');
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
const until = async (f, ms = 6000) => {
  for (let t = 0; t < ms; t += 150) {
    if (await f()) return true;
    await sleep(150);
  }
  return false;
};

try {
  for (const eng of (process.env.ENGINES || 'webkit,chromium').split(',')) {
    const browser = await pw[eng].launch();
    const ME = `leo-${eng}`;
    const context = (extra = {}) => browser.newContext({ viewport: { width: 1100, height: 700 }, reducedMotion: 'reduce', ...extra });
    const open = async (ctx, file = '/', name = ME, base = B) => {
      const p = await ctx.newPage();
      if (name) await p.addInitScript((n) => localStorage.getItem('lab-name') || localStorage.setItem('lab-name', n), name);
      await p.goto(base + file);
      await p.waitForFunction(() => [...document.querySelectorAll('*')].some((n) => n.shadowRoot?.querySelector('.scrim')), null, { timeout: 15000 });
      await sleep(900); // the widget checks 400 ms after the load
      const shadow = (fn, arg) => p.evaluate(([f, a]) => new Function('r', 'a', f)([...document.querySelectorAll('*')].find((n) => n.shadowRoot?.querySelector('.scrim')).shadowRoot, a), [fn.toString().replace(/^[^{]*{|}$/g, ''), arg]);
      // The bar's chips: label, status word, whether current; [] while the bar is hidden.
      const chips = () => shadow(() => { const b = r.querySelector('.sbar'); return !b || b.hidden ? [] : [...r.querySelectorAll('.sb-nav .sb-chip')].map((c) => ({ t: c.querySelector('.sb-t').textContent, st: c.dataset.st || '', cur: c.hasAttribute('aria-current'), hidden: c.hidden })); });
      const states = async () => (await chips()).map((c) => `${c.t}:${c.st}`).join(' ');
      const tap = (label) => shadow(() => { [...r.querySelectorAll('.sb-chip')].find((c) => c.querySelector('.sb-t').textContent === a).click(); }, label);
      const scrollTo = (y) => p.evaluate((v) => scrollTo(0, v), y);
      return { p, shadow, chips, states, tap, scrollTo };
    };
    write('index.html', page());
    const own = await context();
    const L = await open(own);
    const { p, chips, states, tap, scrollTo, shadow } = L;

    // ---- the first visit: everything is read ----
    check(eng, 'first visit: a bar with four sections, none marked', (await states()) === 'Speed: Cost: Risk: Next steps:', await states());
    check(eng, 'the page title is on the left', await shadow(() => { return r.querySelector('.sb-title').textContent === 'Plan'; }));
    check(eng, 'the lone h1 is the title, not a section', !(await chips()).some((c) => c.t === 'Plan'));

    // ---- the agent adds a section and changes one ----
    write('index.html', page({ body: sec('speed', 'Speed', 'Words of Speed, now longer.') + sec('cost', 'Cost') + sec('risk', 'Risk') + sec('plan', 'Next steps') + sec('extra', 'Appendix') }));
    check(eng, 'an added section is "new" and a changed one "updated"', await until(async () => (await states()) === 'Speed:updated Cost: Risk: Next steps: Appendix:new'), await states());
    check(eng, 'the status words are on the chips', await shadow(() => { return [...r.querySelectorAll('.sb-chip')].filter((c) => c.querySelector('.sb-w').textContent).length === 2; }));
    check(eng, 'the bar did not move the page', (await p.evaluate(() => scrollY)) === 0);

    // ---- what reads a section ----
    await scrollTo(1250); // Cost (its heading is at about 1250 - the line)
    await sleep(600);
    check(eng, 'the current one is filled', (await chips()).find((c) => c.cur)?.t === 'Cost', JSON.stringify((await chips()).map((c) => c.cur)));
    check(eng, 'passed in a flash (under 0.8 s): not read', (await states()).includes('Speed:updated'));
    await scrollTo(0);
    await sleep(1000);
    await scrollTo(1250);
    await sleep(500);
    check(eng, 'scrolling on from a section after a moment reads it', !(await states()).includes('Speed:updated'), await states());
    await scrollTo(99999); // Appendix is last: the bottom
    await sleep(500);
    check(eng, 'Appendix is current but not read yet', (await states()).includes('Appendix:new'), await states());
    await sleep(3300);
    check(eng, 'about 3 s inside a section reads it', !(await states()).includes('Appendix:new'), await states());
    write('index.html', page({ body: sec('speed', 'Speed', 'Words of Speed, now longer.') + sec('cost', 'Cost') + sec('risk', 'Risk', 'Risk changed.') + sec('plan', 'Next steps') + sec('extra', 'Appendix') + sec('z', 'Last words') }));
    await until(async () => (await states()).includes('Last words:new'));
    await scrollTo(0);
    await sleep(500);
    const y = await p.evaluate(() => scrollY);
    await tap('Last words');
    await sleep(800);
    check(eng, 'a tap in the bar reads it and goes there, with the heading clear of the bar', !(await states()).includes('Last words:new') && (await p.evaluate(() => scrollY)) > y, await states());
    const clear = await p.evaluate(() => [...document.querySelectorAll('h2')].find((h) => h.textContent === 'Last words').getBoundingClientRect().top);
    check(eng, 'the heading is not under the bar', clear >= 38, String(clear));
    await tap('Risk');
    await sleep(500);

    // ---- a tap in the bar is not a click on the page ----
    check(eng, 'no comment box came up from a tap in the bar', await shadow(() => { return !r.querySelector('.float, textarea'); }));

    // ---- kept in the lab, per person ----
    await sleep(1500); // pushed 800 ms after the last read
    const lab = await (await fetch(`${B}/_lab/api/sections?name=${ME}&page=/index`)).json();
    check(eng, "the lab has this person's marks", Object.keys(lab.sections || {}).length >= 5, JSON.stringify(lab));
    const other = await (await context()).newPage();
    const phone = await context();
    const D = await open(phone); // another browser, the same name: nothing is marked
    check(eng, 'the same name on another device: what was read is read', !(await D.states()).match(/new|updated/), await D.states());
    const M = await open(await context(), '/', `mira-${eng}`);
    check(eng, 'another name has its own: a first visit reads it all', !(await M.states()).match(/new|updated/), await M.states());
    // The looks are untouched.
    const text = await (await fetch(`${B}/_lab/agent/index`)).text();
    check(eng, "marks are not the agent's looks (no person in its text)", !/looked: /.test(text) && !new RegExp(ME).test(text), text.split('\n').filter((l) => /looked/.test(l)).join('|'));
    // Another device reads something new: this one hears it.
    write('index.html', page({ body: sec('speed', 'Speed', 'Words of Speed, now longer.') + sec('cost', 'Cost') + sec('risk', 'Risk', 'Risk changed.') + sec('plan', 'Next steps') + sec('extra', 'Appendix') + sec('z', 'Last words') + sec('q', 'Questions') }));
    await until(async () => (await D.states()).includes('Questions:new'));
    await until(async () => (await states()).includes('Questions:new'));
    await D.tap('Questions');
    check(eng, 'a section read on one device clears on the other (same name)', await until(async () => !(await states()).includes('Questions:new'), 8000), await states());
    await other.close();

    // ---- the page's own bar, no sections, no flag ----
    const S = await open(await context(), '/sticky');
    const gap = await S.shadow(() => { return r.querySelector('.sbar').getBoundingClientRect().top; });
    check(eng, "under the page's own sticky bar", gap >= 59, String(gap));
    const N = await open(await context(), '/plain');
    check(eng, 'no sections, no bar', (await N.chips()).length === 0 && (await N.shadow(() => { return r.querySelector('.sbar')?.hidden !== false; })));
    const F = await open(await context(), '/', 'leo-off', OFF);
    check(eng, 'flag off: no bar and no request for sections', (await F.shadow(() => { return !r.querySelector('.sbar'); })) && (await F.p.evaluate(() => localStorage.getItem('lab-sections:/index'))) === null);

    // ---- comments hidden: no bar ----
    await p.keyboard.press('m');
    await sleep(500);
    check(eng, 'comments hidden: the bar goes', (await chips()).length === 0);
    await p.keyboard.press('m');
    await sleep(900);
    check(eng, 'and comes back with them', (await chips()).length >= 5);

    // ---- a computer folds what does not fit into "…" ----
    const W2 = await open(await context({ viewport: { width: 700, height: 600 } }), '/many');
    const fold = await W2.shadow(() => { const m = r.querySelector('.sb-more'); return { shown: !m.hidden, hidden: [...r.querySelectorAll('.sb-nav .sb-chip')].filter((c) => c.hidden).length, menu: r.querySelectorAll('.sb-menu .sb-chip').length }; });
    check(eng, 'overflow folds into "…"', fold.shown && fold.hidden > 0 && fold.menu === fold.hidden, JSON.stringify(fold));
    await W2.shadow(() => { r.querySelector('.sb-more').click(); });
    check(eng, '"…" opens the rest, and a tap on one goes there', await W2.shadow(() => { return !r.querySelector('.sb-menu').hidden; }));
    await W2.shadow(() => { r.querySelector('.sb-menu .sb-chip:last-child').click(); });
    await sleep(700);
    check(eng, 'it went to that section', (await W2.p.evaluate(() => scrollY)) > 5000);

    // ---- a phone: one sideways line, above the dimmed page of a sheet, the sheet never over it ----
    const ph = await context({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    write('many.html', page({ body: Array.from({ length: 14 }, (_, i) => sec(`m${i}`, `Section number ${i}`)).join('') }));
    const P = await open(ph, '/many', 'phone-leo');
    write('many.html', page({ body: Array.from({ length: 14 }, (_, i) => sec(`m${i}`, `Section number ${i}`, i === 11 ? 'Changed.' : undefined)).join('') + sec('fresh', 'Fresh') }));
    await until(async () => (await P.states()).includes('Section number 11:updated'));
    await sleep(600);
    const line = await P.shadow(() => { const n = r.querySelector('.sb-nav'); const b = r.querySelector('.sbar').getBoundingClientRect(); return { sideways: n.scrollWidth > n.clientWidth, left: n.scrollLeft, title: getComputedStyle(r.querySelector('.sb-title')).display, more: getComputedStyle(r.querySelector('.sb-more')).display, h: b.height, top: b.top }; });
    check(eng, 'phone: one line that scrolls sideways, no title, no "…"', line.sideways && line.title === 'none' && line.more === 'none', JSON.stringify(line));
    check(eng, 'phone: opened at the first updated section', line.left > 100, JSON.stringify(line));
    check(eng, 'phone: the bar is a tap target', line.h >= 40, String(line.h));
    const sy = await P.p.evaluate(() => scrollY);
    check(eng, 'the bar gliding sideways did not move the page', sy === 0, String(sy));
    await P.shadow(() => { r.querySelector('.chat-btn').hidden = false; r.querySelector('.chat-btn').click(); });
    await sleep(700);
    const sheet = await P.shadow(() => { const c = r.querySelector('.chatwin'); const b = r.querySelector('.sbar'); const all = [...b.querySelectorAll(".sb-chip")].map((c) => c.getBoundingClientRect()); const k = all.find((q) => q.left >= 19 && q.right < innerWidth - 20); if (!k) return { all: all.map((q) => [Math.round(q.left), Math.round(q.right)]), sl: b.querySelector(".sb-nav").scrollLeft }; const hit = r.elementFromPoint(k.x + k.width / 2, k.y + k.height / 2); return { sheetTop: c.getBoundingClientRect().top, barBottom: b.getBoundingClientRect().bottom, open: !c.hidden, scrim: getComputedStyle(r.querySelector('.scrim')).display, hit: hit?.closest('.sbar') ? 'bar' : hit?.className }; });
    check(eng, 'chat sheet open: dimmed page, the bar above it and tappable, the sheet clear of it', sheet.open && sheet.scrim === 'block' && sheet.hit === 'bar' && sheet.sheetTop >= sheet.barBottom, JSON.stringify(sheet));
    await P.p.touchscreen.tap(195, 22);
    await sleep(900);
    const after = await P.shadow(() => { return { open: !r.querySelector('.chatwin').hidden }; });
    check(eng, 'a tap on a chip with the sheet open goes to that section and closes the sheet', (await P.p.evaluate(() => scrollY)) > 0 && !after.open, JSON.stringify(after));
    await ph.close();

    // ---- pinch-zoomed in (as zoom.mjs: the page starts zoomed): the bar keeps its usual size, inside what the screen shows ----
    const Z = await open(await context({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }), '/zoomed', 'zoom-leo');
    const zm = await Z.shadow(() => { const b = r.querySelector('.sbar').getBoundingClientRect(); const v = visualViewport; return { scale: v.scale, zoom: r.host.hasAttribute('data-zoom'), h: b.height * v.scale, left: b.left, right: b.right, vw: v.width, inUi: r.querySelector('.sbar').parentElement.className === 'ui' }; });
    if (Math.abs(zm.scale - 1) < 0.01) console.log(`skip ${eng.padEnd(8)} this engine does not zoom a page (scale 1)`);
    else check(eng, 'zoomed in: the bar keeps its usual size and is inside what the screen shows', zm.inUi && zm.zoom && Math.abs(zm.h - 44) < 3 && zm.left >= -1 && zm.right <= zm.vw + 1, JSON.stringify(zm));
    await browser.close();
  }
} finally {
  server.kill();
  offServer.kill();
  await sleep(100);
  for (const d of [DIR, OFF_DIR]) fs.rmSync(d, { recursive: true, force: true });
}
console.log(failed ? `${failed} failed` : 'all ok');
process.exit(failed ? 1 : 0);
