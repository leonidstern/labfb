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
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'labit-keys-'));
const PORT = 7930 + Math.floor(Math.random() * 30);
const B = `http://localhost:${PORT}`;
fs.writeFileSync(path.join(DIR, 'index.html'), '<!doctype html><meta charset="utf-8"><title>k</title><h1>Keys</h1><p>text</p>');
fs.writeFileSync(path.join(DIR, 'ask.html'), '<!doctype html><meta charset="utf-8"><title>a</title><h1 id="h">Pick</h1><p>text</p>');
fs.writeFileSync(path.join(DIR, 'labit.json'), JSON.stringify({ port: PORT, shortcuts: { toggle: 'h', chat: 'x' } }));
const env = { ...process.env, PORT: '', XDG_CONFIG_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'labit-cfg-')), LABIT_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'labit-home-')), LABIT_NO_UPDATE_CHECK: '1' };
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
// Waits on the condition the next step needs; `ms` is the longest it waits, and it never throws (the check after it reports the real failure).
const until = (p, fn, arg, ms) => p.waitForFunction(fn, arg, { timeout: ms, polling: 'raf' }).catch(() => {});
const untilRoot = (p, fn, ms) =>
  until(p, (src) => {
    const r = [...document.querySelectorAll('*')].find((n) => n.shadowRoot?.querySelector('.scrim'))?.shadowRoot;
    return Boolean(r) && new Function('r', `return (${src})(r)`)(r);
  }, fn.toString(), ms);
let failed = 0;
const check = (eng, name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${eng.padEnd(8)} ${name}${detail ? ` (${detail})` : ''}`);
};
// What the bar shows: comments on or off, the chat open or not, and the chat button's words.
const look = (p) =>
  p.evaluate(() => {
    const r = [...document.querySelectorAll('*')].find((n) => n.shadowRoot?.querySelector('.scrim'))?.shadowRoot;
    const chat = r?.querySelector('.chatwin');
    return {
      on: [...(r?.querySelectorAll('button') || [])].some((b) => /hide comments/.test(b.textContent || '')),
      chat: Boolean(chat && !chat.hidden && chat.offsetHeight),
      chatWords: [...(r?.querySelectorAll('button') || [])].map((b) => b.textContent || '').find((t) => /chat/.test(t)) || '',
    };
  });

try {
  for (const eng of (process.env.ENGINES || 'webkit,chromium').split(',')) {
    const browser = await pw[eng].launch();
    try {
      const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
      await ctx.addInitScript(() => localStorage.setItem('lab-name', 'leo'));
      const p = await ctx.newPage();
      await p.goto(B + '/');
      await untilRoot(p, () => true, 1200);
      const start = await look(p);
      await p.keyboard.press('m');
      await sleep(250);
      check(eng, 'the old toggle key (m) does nothing', (await look(p)).on === start.on);
      await p.keyboard.press('h');
      await until(p, ([src, on]) => { const r = [...document.querySelectorAll('*')].find((n) => n.shadowRoot?.querySelector('.scrim'))?.shadowRoot; return Boolean(r) && [...r.querySelectorAll('button')].some((b) => /hide comments/.test(b.textContent || '')) !== on; }, [0, start.on], 300);
      const on = await look(p);
      check(eng, 'the new toggle key (h) shows and hides comments', on.on !== start.on);
      if (!on.on) {
        await p.keyboard.press('h');
        await untilRoot(p, (r) => [...r.querySelectorAll('button')].some((b) => /hide comments/.test(b.textContent || '')), 300);
      }
      check(eng, 'the chat button shows the new key', /\(x\)/.test((await look(p)).chatWords), (await look(p)).chatWords);
      await p.keyboard.press('c');
      await sleep(250);
      check(eng, 'the old chat key (c) does nothing', !(await look(p)).chat);
      await p.keyboard.press('x');
      await untilRoot(p, (r) => { const c = r.querySelector('.chatwin'); return Boolean(c && !c.hidden && c.offsetHeight); }, 600);
      check(eng, 'the new chat key (x) opens the chat', (await look(p)).chat);
      // With the bar showing (words selected with Shift-drag), a key that is a shortcut elsewhere is a letter: the
      // changed toggle key (h) starts the comment, it doesn't hide the comments.
      await p.keyboard.press('Escape');
      await untilRoot(p, (r) => { const c = r.querySelector('.chatwin'); return !c || c.hidden || !c.offsetHeight; }, 300);
      const word = await p.evaluate(() => {
        const t = document.querySelector('p').firstChild;
        const r = document.createRange();
        r.setStart(t, 0);
        r.setEnd(t, 4);
        return r.getBoundingClientRect().toJSON();
      });
      const onBefore = (await look(p)).on;
      await p.keyboard.down('Shift');
      await p.mouse.move(word.left + 1, word.top + word.height / 2);
      await p.mouse.down();
      await p.mouse.move(word.right - 1, word.top + word.height / 2, { steps: 6 });
      await p.mouse.up();
      await p.keyboard.up('Shift');
      await untilRoot(p, (r) => Boolean(r.querySelector('.fd .p-bar.on')) && r.querySelector('.fd').getAnimations().length === 0, 700);
      await p.keyboard.press('h');
      await untilRoot(p, (r) => r.querySelector('.fd textarea')?.value === 'h', 900);
      const typed = await p.evaluate(() => {
        const r = [...document.querySelectorAll('*')].find((n) => n.shadowRoot?.querySelector('.scrim'))?.shadowRoot;
        return r?.querySelector('.fd textarea')?.value;
      });
      check(eng, 'with the bar showing, the changed toggle key (h) is a letter, not a shortcut', typed === 'h' && (await look(p)).on === onBefore, `${typed}`);
      // A question's rows (src/widget/thread.ts, V1 plain list): no keys on the card. J K, the arrows, 1 to 6 and Enter move
      // nothing and keep nothing; a tap picks a row and Keep sends it.
      const key = JSON.parse(fs.readFileSync(path.join(DIR, '.lab/server.json'), 'utf8')).agent;
      const send = (body, agent) => fetch(B + '/_lab/api/comments', { method: 'POST', headers: { 'content-type': 'application/json', origin: B, ...(agent ? { 'x-lab-admin': key, 'x-lab-agent': '1' } : {}) }, body: JSON.stringify({ page: '/ask', ...body }) }).then((r) => r.json());
      const asked = (await send({ name: 'leo', text: 'which?', anchor: { kind: 'element', selector: '#h', x: 0.5, y: 0.5, docX: 0.1, docY: 20, width: 1000, element: '<h1 id="h">' } })).comment;
      const q = (await send({ name: 'Claude', text: 'Which?', parent: asked.id, choices: ['one', 'two', 'three'], recommend: 1 }, true)).comment;
      const a = await ctx.newPage();
      await a.goto(B + '/ask');
      await sleep(1200);
      const sh = (fn) => a.evaluate((f) => new Function('r', f)([...document.querySelectorAll('*')].find((n) => n.shadowRoot?.querySelector('.scrim')).shadowRoot), fn);
      const row = () => sh('return [...r.querySelectorAll(".choice")].findIndex((x) => x.classList.contains("on"))');
      const picks = async () => (await (await fetch(`${B}/_lab/api/comments?page=/ask`)).json()).comments.filter((c) => c.picked);
      await sh('r.querySelector("button.pin").click()');
      await sleep(600);
      check(eng, 'a question with no quoted words opens on its pick, the reply box focused (no keys on its rows)', (await row()) === 1 && (await sh('return r.activeElement?.localName === "textarea"')));
      // In the reply box they type as usual and move nothing.
      await a.keyboard.type('jk26');
      await a.keyboard.press('Enter');
      await sleep(300);
      const sent = (await (await fetch(`${B}/_lab/api/comments?page=/ask`)).json()).comments.some((c) => c.text === 'jk26' && !c.picked);
      check(eng, 'in the reply box J, K, 2 and 6 are typed, and Enter sends the words, not a pick', sent && (await row()) === 1 && (await picks()).length === 0);
      await sh('r.querySelectorAll(".choice")[1].focus()'); // the focus on a row: still no keys
      for (const k of ['j', 'k', 'ArrowDown', 'ArrowUp', '3', '1']) await a.keyboard.press(k);
      await sleep(300);
      check(eng, 'J K, the arrows and 1 to 6 do nothing on the card', (await row()) === 1 && (await picks()).length === 0, String(await row()));
      await sh('r.querySelectorAll(".choice")[2].click()');
      await sleep(150);
      check(eng, 'a tap ticks its row; Keep reads Keep and is on', (await row()) === 2 && (await sh('const k = r.querySelector("button.keep"); return k.textContent === "Keep" && !k.disabled')));
      await sh('r.querySelector("button.keep").click()');
      await sleep(800);
      const got = await picks();
      check(eng, 'Keep sends the row ticked', got.length === 1 && got[0].picked.n === 2 && got[0].picked.of === q.id, JSON.stringify(got.map((c) => c.picked)));
      await a.close();
      for (const c of (await (await fetch(`${B}/_lab/api/comments?page=/ask`)).json()).comments.filter((c) => !c.parent)) await fetch(B + '/_lab/api/comments', { method: 'POST', headers: { 'content-type': 'application/json', origin: B, 'x-lab-admin': key, 'x-lab-agent': '1' }, body: JSON.stringify({ page: '/ask', action: 'delete', id: c.id }) });
      await p.goto('about:blank');
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
