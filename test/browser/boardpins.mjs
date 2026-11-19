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
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'labit-boardpins-'));
const PORT = 8260 + Math.floor(Math.random() * 30);
const B = `http://localhost:${PORT}`;
fs.writeFileSync(path.join(DIR, 'pricing.html'), '<!doctype html><meta charset="utf-8"><title>Pricing</title><h1>Pricing one</h1><p>Plan two</p><div style="height:3000px"></div>');
fs.writeFileSync(path.join(DIR, 'checkout.html'), '<!doctype html><meta charset="utf-8"><title>Checkout</title><h1>Checkout</h1>');
fs.writeFileSync(path.join(DIR, 'index.html'), '<!doctype html><meta charset="utf-8"><title>k</title><h1>Keys</h1><p>text</p>');
fs.writeFileSync(path.join(DIR, 'labit.json'), JSON.stringify({ port: PORT, flags: { board: true, editText: true } }));
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
try {
  for (const eng of (process.env.ENGINES || 'webkit,chromium').split(',')) {
    const browser = await pw[eng].launch();
    try {
      const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
      await ctx.addInitScript(() => { localStorage.setItem('lab-name', 'leo'); localStorage.setItem('lab-on', '1'); });
      const p = await ctx.newPage();
      p.on('pageerror', (e) => console.log('pageerror', e.message));
      await p.goto(B + '/_lab/board/pins');
      await p.waitForFunction(() => [...document.querySelectorAll('*')].some((n) => n.shadowRoot?.querySelector('.scrim')), null, { timeout: 5000 });
      await sleep(2000);
      const sh = (fn) => p.evaluate((f) => new Function('r', f)([...document.querySelectorAll('*')].find((n) => n.shadowRoot?.querySelector('.scrim')).shadowRoot), fn);
      const rect = (id) => p.evaluate((i) => { const r = document.querySelector(`#lab-board .f[data-id="${i}"]`).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width }; }, id);
      const a = await rect('a');
      await p.keyboard.press('Digit1'); // a board opens as a pointer; 1 is the comment mode
      await sleep(200);
      // a tap in comment mode on frame a, 100 px right and 150 px down of its corner (screen px)
      await p.mouse.click(a.x + 100, a.y + 150);
      await p.waitForFunction(() => { const r = [...document.querySelectorAll('*')].find((n) => n.shadowRoot?.querySelector('.scrim')).shadowRoot; return Boolean(r.querySelector('textarea')); }, null, { timeout: 4000 }).catch(() => {});
      check(eng, 'a tap in comment mode opens the new-comment box on the board', await sh('return Boolean(r.querySelector("textarea"))'));
      await p.keyboard.type('too tight here');
      await p.keyboard.press('Enter');
      let saved;
      for (let i = 0; i < 30 && !saved; i++) { await sleep(150); saved = (await (await fetch(`${B}/_lab/api/comments?page=/_board/pins`)).json()).comments?.[0]; }
      const an = saved?.anchor;
      check(eng, 'the pin is stored under the board key with kind board, its frame and px from its corner', an?.kind === 'board' && an.frame === 'a' && Math.abs(an.fx - 100 / (a.w / 390)) < 2 && an.board === 'pins', JSON.stringify(an));
      // the pin's tip is its lower left corner: its middle sits half its size up and right of the spot
      const text = await (await fetch(`${B}/_lab/agent/_board/pins`)).text();
      check(eng, 'the agent reads it as on the board, near that frame', /near: frame a/.test(text) && /on: the board/.test(text), text.slice(0, 200));
      const pinAt = () => sh('const b = r.querySelector("button.pin"); const q = b.getBoundingClientRect(); return { x: q.x + q.width / 2 - q.width / 2, y: q.y + q.height / 2 + q.height / 2, w: q.width }');
      await sleep(500);
      const p1 = await pinAt();
      check(eng, 'the pin sits where the tap was', Math.abs(p1.x - (a.x + 100)) < 14 && Math.abs(p1.y - (a.y + 150)) < 14, JSON.stringify([p1, a]));
      // zoom: the pin stays on its spot and stays the same size
      await p.keyboard.press('Shift+Digit2');
      await sleep(700);
      const a2 = await rect('a');
      const p2 = await pinAt();
      const want = { x: a2.x + an.fx * (a2.w / 390), y: a2.y + an.fy * (a2.w / 390) };
      check(eng, 'at 100% the pin is still on its spot, the same size on screen', Math.abs(p2.x - want.x) < 14 && Math.abs(p2.y - want.y) < 14 && Math.abs(p2.w - p1.w) < 1, JSON.stringify([p2, want, p1.w]));
      // it follows its frame when the frame moves
      await p.keyboard.press('Shift+Digit1');
      await sleep(500);
      const a3 = await rect('a');
      await p.mouse.click(a3.x + 20, a3.y + 20); // comment mode: a tap pins; close that box
      await sleep(300);
      await p.keyboard.press('Escape');
      await sleep(200);
      await p.keyboard.press('Digit1'); // pointer mode: taps select
      await sleep(200);
      await p.mouse.click(a3.x + 300 * (a3.w / 390) / 3, a3.y + 300);
      await sleep(200);
      await p.keyboard.press('Shift+ArrowRight');
      await sleep(1800);
      const a4 = await rect('a');
      const p3 = await pinAt();
      const want4 = { x: a4.x + an.fx * (a4.w / 390), y: a4.y + an.fy * (a4.w / 390) };
      check(eng, 'a pin follows its frame when the frame is moved', a4.x > a3.x + 10 && Math.abs(p3.x - want4.x) < 14 && Math.abs(p3.y - want4.y) < 14, JSON.stringify([a3.x, a4.x, p3, want4]));
      await ctx.close();
      // Select mode on the board (Leo, 19 Nov: "selection doesnt work here"): V, a click picks a block of frame a's page,
      // a green ring sits over it in the frame's box, ⇧-click adds one, Delete sends one pin naming frame a and the blocks.
      const sctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
      await sctx.addInitScript(() => { localStorage.setItem('lab-name', 'leo'); localStorage.setItem('lab-on', '1'); });
      const posts = [];
      await sctx.route('**/_lab/api/comments**', (r) => {
        if (r.request().method() !== 'POST') return r.continue();
        const body = r.request().postDataJSON();
        posts.push(body);
        return r.fulfill({ contentType: 'application/json', body: JSON.stringify(body.action ? { ok: true } : { comment: { id: 's1', page: body.page, name: body.name, text: body.text, anchor: body.anchor, created: new Date().toISOString(), replies: [] }, edit: 'k1' }) });
      });
      await sctx.route('**/_lab/api/actions**', (r) => (r.request().method() === 'GET' ? r.continue() : r.abort()));
      const s = await sctx.newPage();
      s.on('pageerror', (e) => console.log('pageerror', e.message));
      await put(`sel${eng}`, [{ id: 'a', src: '/pricing', w: 390, h: 844, x: 0, y: 0 }, { id: 'b', src: '/checkout', w: 390, h: 844, x: 500, y: 0 }]);
      await s.goto(`${B}/_lab/board/sel${eng}`);
      await s.waitForFunction(() => document.querySelector('#lab-board .f[data-id="a"] iframe')?.dataset.ready === '1', null, { timeout: 8000 });
      await sleep(800);
      const inA = (sel) => s.evaluate((q) => { const f = document.querySelector('#lab-board .f[data-id="a"] iframe'); const r = f.getBoundingClientRect(); const z = r.width / f.clientWidth; const e = f.contentDocument.querySelector(q).getBoundingClientRect(); return { x: r.left + (e.left + Math.min(20, e.width / 2)) * z, y: r.top + (e.top + e.height / 2) * z }; }, sel);
      const rings = () => s.evaluate(() => [...document.querySelectorAll('#lab-board .f[data-id="a"] [data-lab-rings] > div')].map((d) => { const r = d.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width }; }));
      await s.keyboard.press('v');
      await sleep(200);
      const h = await inA('h1');
      await s.mouse.click(h.x, h.y);
      await sleep(300);
      const r1 = await rings();
      check(eng, 'select mode: a click in frame a picks its block and rings it over the frame', r1.length === 1 && Math.abs(r1[0].y - h.y) < 40 && r1[0].x < h.x, JSON.stringify([r1, h]));
      const sheet = await s.evaluate(() => [...document.querySelectorAll('*')].map((n) => n.shadowRoot?.querySelector('textarea')).some(Boolean));
      check(eng, 'the action sheet opens for the picked block', sheet);
      const pp = await inA('p');
      await s.keyboard.down('Shift');
      await s.mouse.click(pp.x, pp.y);
      await s.keyboard.up('Shift');
      await sleep(300);
      check(eng, 'shift-click adds a second block of the frame', (await rings()).length === 2, JSON.stringify(await rings()));
      await s.keyboard.press('Escape');
      check(eng, 'Esc lets go of them', (await rings()).length === 0);
      await s.mouse.move(pp.x + 200, pp.y + 120);
      await s.mouse.down();
      await s.mouse.move(pp.x + 100, pp.y, { steps: 4 });
      await s.mouse.move(h.x + 10, h.y, { steps: 4 });
      await s.mouse.up();
      await sleep(300);
      check(eng, 'a drag box inside frame a picks the blocks it covers', (await rings()).length === 2, JSON.stringify(await rings()));
      await s.keyboard.press('Delete');
      for (let i = 0; i < 20 && !posts.some((x) => !x.action); i++) await sleep(100);
      const sent = posts.find((x) => !x.action);
      const hid = await s.evaluate(() => { const d = document.querySelector('#lab-board .f[data-id="a"] iframe').contentDocument; return ['h1', 'p'].filter((q) => getComputedStyle(d.querySelector(q)).display === 'none').join(','); });
      check(eng, 'Delete hides them in the frame and sends one board pin naming frame a and the selectors', hid === 'h1,p' && sent?.anchor?.kind === 'board' && sent.anchor.frame === 'a' && /h1/.test(sent.anchor.selector) && /Pricing one/.test(sent.text) && /Plan two/.test(sent.text), JSON.stringify([hid, sent]));
      check(eng, 'the rings go with the picks', (await rings()).length === 0);
      await sctx.close();
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
