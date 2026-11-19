// Select mode picks several blocks (flag editText) in a real browser: Shift-click adds a second block and the sheet says
// "2 picked", a drag from empty space boxes several, Delete hides them here and sends one pin naming them all, undo
// shows them again and takes the pin back. The lab's comments API is answered by the test (nothing is saved).
// Not part of `npm test`. Run: node test/browser/multiselect.mjs   (NODE_PATH can point at a node_modules with playwright).
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
const DIR = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'labit-multi-')));
const PORT = 7900 + Math.floor(Math.random() * 30);
const B = `http://localhost:${PORT}`;
fs.writeFileSync(path.join(DIR, 'index.html'), `<!doctype html><meta charset="utf-8"><title>m</title><body style="font:20px sans-serif;margin:40px 200px 40px 40px">
<h1 id="a">Alpha heading</h1><p id="b">Bravo words here</p><p id="c">Charlie words here</p><p id="d">Delta words here</p><div style="height:600px"></div>`);
fs.writeFileSync(path.join(DIR, 'labit.json'), JSON.stringify({ port: PORT, flags: { editText: true } }));
const env = { ...process.env, PORT: '', XDG_CONFIG_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'labit-cfg-')), LABIT_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'labit-home-')), LABIT_NO_UPDATE_CHECK: '1', LABIT_EXIT_WITH_PARENT: '1' };
const server = spawn(process.execPath, [LAB, '--new', '--no-open'], { cwd: DIR, env, stdio: 'ignore' });
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

try {
  for (const eng of (process.env.ENGINES || 'chromium').split(',')) {
    const browser = await pw[eng].launch();
    try {
      const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
      await ctx.addInitScript(() => localStorage.setItem('lab-name', 'leo'));
      const posts = [];
      // Writes never reach a lab: comments are answered here, actions (settings) refused.
      await ctx.route('**/_lab/api/comments**', (r) => {
        if (r.request().method() !== 'POST') return r.continue();
        const body = r.request().postDataJSON();
        posts.push(body);
        return r.fulfill({ contentType: 'application/json', body: JSON.stringify(body.action ? { ok: true } : { comment: { id: 'm1', page: '/index', name: body.name, text: body.text, anchor: body.anchor, created: new Date().toISOString(), replies: [] }, edit: 'k1' }) });
      });
      await ctx.route('**/_lab/api/actions**', (r) => (r.request().method() === 'GET' ? r.continue() : r.abort()));
      const p = await ctx.newPage();
      await p.goto(B + '/');
      await sleep(600);
      const picked = () => p.evaluate(() => [...document.querySelectorAll('[data-lab-picked]')].map((e) => e.id).join(','));
      const label = () => p.evaluate(() => [...document.querySelectorAll('*')].map((n) => n.shadowRoot?.querySelector('[data-a=n]')?.textContent).find(Boolean) || '');
      const hidden = () => p.evaluate(() => ['a', 'b', 'c', 'd'].filter((i) => getComputedStyle(document.getElementById(i)).display === 'none').join(','));
      await p.keyboard.press('v');
      await p.locator('#a').click();
      await p.locator('#b').click({ modifiers: ['Shift'] });
      check(eng, 'Shift-click adds a second block', (await picked()) === 'a,b', await picked());
      check(eng, 'the sheet says "2 picked"', (await label()) === '2 picked', await label());
      // The half ink (Leo, 19 Nov: "half height yes"): a band under each picked block's line, the lower 44 % of it.
      const bands = () => p.evaluate(() => [...(document.querySelector('[data-lab-pick-ink]')?.children || [])].map((i) => i.getBoundingClientRect()));
      const lines = await p.evaluate(() => ['a', 'b'].map((i) => document.getElementById(i).getClientRects()[0]).map((r) => ({ top: r.top, height: r.height })));
      const bs = await bands();
      check(eng, 'both picked blocks wear the half ink, under the lower half of their line', bs.length === 2 && bs.every((b, i) => Math.abs(b.top - (lines[i].top + lines[i].height * 0.526)) < 2 && Math.abs(b.height - lines[i].height * 0.44) < 2), JSON.stringify({ bs, lines }));
      await p.locator('#a').click({ modifiers: ['Shift'] });
      check(eng, 'Shift-click on a picked block drops it', (await picked()) === 'b', await picked());
      await p.keyboard.press('Escape');
      check(eng, 'Esc lets go of them all, and of their ink', (await picked()) === '' && (await bands()).length === 0);
      // A box from the empty right margin over b, c, d.
      const bb = await p.locator('#b').boundingBox();
      const db = await p.locator('#d').boundingBox();
      await p.mouse.move(900, bb.y + 4);
      await p.mouse.down();
      await p.mouse.move(600, bb.y + 20, { steps: 4 });
      await p.mouse.move(300, db.y + 10, { steps: 4 });
      await p.mouse.up();
      check(eng, 'a drag from empty space picks the blocks it covers', (await picked()) === 'b,c,d', await picked());
      check(eng, 'the sheet says "3 picked"', (await label()) === '3 picked', await label());
      await p.keyboard.press('Escape');
      await p.locator('#b').click();
      await p.locator('#c').click({ modifiers: ['Shift'] });
      await p.keyboard.press('Delete');
      await sleep(300);
      check(eng, 'Delete hides the picked blocks', (await hidden()) === 'b,c', await hidden());
      const sent = posts.filter((x) => !x.action);
      check(eng, 'one pin is sent, naming both blocks', sent.length === 1 && /^delete these 2 blocks: .*Bravo.*Charlie/.test(sent[0].text) && sent[0].anchor?.selector?.includes('b'), JSON.stringify(sent.map((x) => x.text)));
      const toast = await p.evaluate(() => [...document.querySelectorAll('*')].map((n) => [...(n.shadowRoot?.querySelectorAll('.hint') || [])].find((h) => /removed 2 here/.test(h.textContent))).find(Boolean)?.textContent || '');
      check(eng, 'a note says removed here, with undo', /removed 2 here; I'll make it real/.test(toast) && /undo/.test(toast), toast);
      await p.evaluate(() => [...document.querySelectorAll('*')].map((n) => [...(n.shadowRoot?.querySelectorAll('.hint .btn') || [])].find((b) => b.textContent === 'undo')).find(Boolean).click());
      await sleep(300);
      check(eng, 'undo shows them again', (await hidden()) === '', await hidden());
      check(eng, 'undo takes the pin back', posts.some((x) => x.action === 'delete' && x.id === 'm1'));
    } finally {
      await browser.close();
    }
  }
} finally {
  server.kill();
  fs.rmSync(DIR, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
