// Shortcuts from labit.json in real browsers (WebKit and Chrome's engine): the changed keys work, the old ones don't,
// and the bar shows the new key. Not part of `npm test`; CI runs it in the `browser` job.
// Run: node test/browser/shortcuts.mjs (needs playwright; NODE_PATH can point at a node_modules that has it).
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
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'labit-keys-'));
const PORT = claimPort(7930, 30);
const B = `http://localhost:${PORT}`;
fs.writeFileSync(path.join(DIR, 'index.html'), '<!doctype html><meta charset="utf-8"><title>k</title><h1>Keys</h1><p>text</p>');
fs.writeFileSync(path.join(DIR, 'ask.html'), '<!doctype html><meta charset="utf-8"><title>a</title><h1 id="h">Pick</h1><p>text</p>');
// canvas-proposals' "Pause and ¼ speed": a looping press with its word inside and a toast, in a box (Measure off here).
fs.writeFileSync(path.join(DIR, 'press.html'), '<!doctype html><meta charset="utf-8"><title>p</title><h1>Press</h1><div id="demo" style="position:relative;padding:40px;width:400px;height:120px;background:#eee"><span id="press" style="display:inline-block;padding:6px 12px;background:#141414;color:#fff"><b id="word">Buy</b></span><div id="toast" style="position:absolute;right:12px;bottom:12px">Order placed</div></div><script>for (const id of ["press", "toast"]) document.getElementById(id).animate([{ transform: "scale(1)" }, { transform: "scale(.94)" }, { transform: "scale(1)" }], { duration: 1200, iterations: Infinity });</script>');
fs.writeFileSync(path.join(DIR, 'anim.html'), '<!doctype html><meta charset="utf-8"><title>m</title><style>@keyframes spin { to { rotate: 1turn } } #s, #t { width: 40px; height: 40px; background: red; animation: spin 2s linear infinite }</style><h1>Moving</h1><div id="s"></div><div id="t"></div><p>text</p>');
fs.writeFileSync(path.join(DIR, 'labit.json'), JSON.stringify({ port: PORT, shortcuts: { toggle: 'h', chat: 'x' } }));
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
      await ctx.addInitScript(() => localStorage.setItem('lab-name', 'tess'));
      // How many MutationObservers are watching now (observe adds one, disconnect takes it away): a comment box that has
      // closed must stop watching the page.
      await ctx.addInitScript(() => {
        const Real = window.MutationObserver;
        const live = new Set();
        window.__watching = () => live.size;
        window.MutationObserver = class extends Real {
          observe(...a) { live.add(this); return super.observe(...a); }
          disconnect() { live.delete(this); return super.disconnect(); }
        };
      });
      const p = await ctx.newPage();
      await p.goto(B + '/');
      await untilRoot(p, () => true, 1200);
      const start = await look(p);
      await p.keyboard.press('m');
      await sleep(250);
      check(eng, 'the old toggle key (m) does nothing', (await look(p)).on === start.on);
      await p.keyboard.press('h');
      await until(p, ([_src, on]) => { const r = [...document.querySelectorAll('*')].find((n) => n.shadowRoot?.querySelector('.scrim'))?.shadowRoot; return Boolean(r) && [...r.querySelectorAll('button')].some((b) => /hide comments/.test(b.textContent || '')) !== on; }, [0, start.on], 300);
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
      // Pause: no ⋯ menu row; holding ⌥ over a moving thing shows its control (pause · ¼ · ms) in its top right corner,
      // which stops only that one and never pins; let go and a paused one keeps a ▶. P stops them all, a comment written
      // while paused tells the agent so (anchor.paused, atMs); P again plays. S slows all to ¼.
      await p.evaluate(() => localStorage.removeItem('lab-cursor')); // the steps above leave the pointer on (key 1 toggles it)
      await p.goto(B + '/anim');
      await untilRoot(p, (r) => Boolean(r.querySelector('.motions')), 2500);
      // A long comment scrolls inside its box: the scrollbar sits at the box's right edge, not left of the name and arrow.
      const h2 = await p.evaluate(() => document.querySelector('h1').getBoundingClientRect().toJSON());
      await p.mouse.click(h2.left + 20, h2.top + h2.height / 2);
      await untilRoot(p, (r) => Boolean(r.querySelector('textarea')), 900);
      await p.keyboard.insertText(Array.from({ length: 14 }, (_, i) => `line ${i} of a long comment`).join('\n'));
      await sleep(300);
      const sb = await p.evaluate(() => { const deep = (root) => { for (const n of root.querySelectorAll('*')) { if (n.localName === 'textarea') return n; const f = n.shadowRoot && deep(n.shadowRoot); if (f) return f; } return null; }; const t = deep(document); const b = t.closest('.box').getBoundingClientRect(); const x = t.getBoundingClientRect(); return { scrolls: t.scrollHeight > t.clientHeight, gap: Math.round(b.right - x.right), tall: t.closest('.box').classList.contains('tall') }; });
      check(eng, 'a long comment scrolls with its scrollbar at the box\'s right edge', sb.scrolls && sb.tall && sb.gap <= 16, JSON.stringify(sb));
      await p.keyboard.press('Escape');
      // Opening and closing a comment box again and again leaves no observers behind.
      const watching = () => p.evaluate(() => window.__watching());
      const before = await watching();
      for (let i = 0; i < 5; i++) {
        await p.mouse.click(h2.left + 20, h2.top + h2.height / 2);
        await untilRoot(p, (r) => Boolean(r.querySelector('textarea')), 900);
        await p.keyboard.insertText('x');
        await p.keyboard.press('Escape');
        await sleep(150);
      }
      const after = await watching();
      check(eng, 'boxes opened and closed again leave no observers behind', after - before <= 1, `${before} → ${after}`);
      const shadow = "[...document.querySelectorAll('*')].find((n) => n.shadowRoot?.querySelector('.scrim')).shadowRoot";
      const pause = () => p.evaluate(() => {
        const r = [...document.querySelectorAll('*')].find((n) => n.shadowRoot?.querySelector('.scrim'))?.shadowRoot;
        const on = [...(r?.querySelectorAll('.motion-ctl.on') || [])];
        const c = on[0];
        const s = document.getElementById('s').getBoundingClientRect();
        const at = c?.getBoundingClientRect();
        return { shown: on.length, mini: on.filter((n) => n.classList.contains('mini')).length, row: Boolean(r?.querySelector('.motion-row')), words: c?.querySelector('.motion-play')?.getAttribute('aria-label'), ms: c?.querySelector('.motion-ms')?.textContent,
          corner: Boolean(at && Math.abs(at.right - Math.max(s.left + s.width / 2 + 20 - 4, at.width + 4)) < 3 && Math.abs(at.top - (s.top + s.height / 2 - 20 + 4)) < 3),
          anim: document.getElementById('s').getAnimations()[0]?.playState, other: document.getElementById('t').getAnimations()[0]?.playState };
      });
      const first = await pause();
      check(eng, 'no motion row in the ⋯ menu and no control without ⌥', !first.row && first.shown === 0, JSON.stringify(first));
      const sr = await p.evaluate(() => document.getElementById('s').getBoundingClientRect().toJSON());
      await p.mouse.move(sr.left + sr.width / 2, sr.top + sr.height / 2 + 10);
      await p.keyboard.down('Alt');
      await p.mouse.move(sr.left + sr.width / 2 + 1, sr.top + sr.height / 2 + 10);
      await untilRoot(p, (r) => r.querySelectorAll('.motion-ctl.on').length === 1, 1500);
      const alt = await pause();
      check(eng, '⌥ over a moving thing shows its control in its top right corner', alt.shown === 1 && alt.corner && alt.words === 'pause this animation (P: all)' && /^\d+ ms$/.test(alt.ms), JSON.stringify(alt));
      const pb = await p.evaluate(`${shadow}.querySelector('.motion-ctl.on .motion-play').getBoundingClientRect().toJSON()`);
      await p.mouse.click(pb.left + pb.width / 2, pb.top + pb.height / 2, { modifiers: ['Alt'] });
      await until(p, () => document.getElementById('s').getAnimations()[0]?.playState === 'paused', null, 600);
      await sleep(300);
      const one = await pause();
      const noPin = await p.evaluate(`!${shadow}.querySelector('textarea')`);
      check(eng, 'its pause stops only that one, says play, and drops no pin', one.anim === 'paused' && one.other === 'running' && one.words === 'play this animation (P: all)' && noPin, JSON.stringify({ one, noPin }));
      await p.keyboard.up('Alt');
      await untilRoot(p, (r) => r.querySelectorAll('.motion-ctl.on.mini').length === 1, 1000);
      const let_ = await pause();
      check(eng, 'letting go of ⌥ leaves only a ▶ on the paused one', let_.shown === 1 && let_.mini === 1 && let_.anim === 'paused', JSON.stringify(let_));
      const mb = await p.evaluate(`${shadow}.querySelector('.motion-ctl.on .motion-play').getBoundingClientRect().toJSON()`);
      await p.mouse.click(mb.left + mb.width / 2, mb.top + mb.height / 2);
      await until(p, () => document.getElementById('s').getAnimations()[0]?.playState === 'running', null, 600);
      await untilRoot(p, (r) => !r.querySelector('.motion-ctl.on'), 1000);
      check(eng, 'the ▶ plays it and goes', (await pause()).shown === 0);
      await p.keyboard.press('s');
      await until(p, () => ['s', 't'].every((id) => document.getElementById(id).getAnimations()[0]?.playbackRate === 0.25), null, 1200);
      check(eng, 'S slows everything to ¼', await p.evaluate(() => document.getElementById('t').getAnimations()[0]?.playbackRate === 0.25));
      await p.keyboard.press('s');
      await until(p, () => document.getElementById('s').getAnimations()[0]?.playbackRate === 1, null, 600);
      await p.keyboard.press('p');
      await until(p, () => document.getElementById('s').getAnimations()[0]?.playState === 'paused', null, 600);
      await untilRoot(p, (r) => r.querySelectorAll('.motion-ctl.on.mini').length === 2, 1000);
      const paused = await pause();
      check(eng, 'P pauses all the page\'s animations and each keeps a ▶', paused.anim === 'paused' && paused.other === 'paused' && paused.mini === 2, JSON.stringify(paused));
      const h = await p.evaluate(() => document.querySelector('h1').getBoundingClientRect().toJSON());
      await p.mouse.click(h.left + 20, h.top + h.height / 2);
      await untilRoot(p, (r) => Boolean(r.querySelector('textarea')), 900);
      await p.keyboard.type('still');
      await p.keyboard.press('Enter');
      const pinned = async () => (await (await fetch(`${B}/_lab/api/comments?page=/anim`)).json()).comments.find((c) => c.text === 'still');
      for (let i = 0; i < 20 && !(await pinned()); i++) await sleep(100);
      check(eng, 'a comment written while paused says so, with the moment', (await pinned())?.anchor?.paused === true && Number.isFinite((await pinned())?.anchor?.atMs), JSON.stringify((await pinned())?.anchor));
      await p.keyboard.press('Escape');
      await p.keyboard.press('p');
      await until(p, () => document.getElementById('s').getAnimations()[0]?.playState === 'running', null, 600);
      const played = await pause();
      check(eng, 'P again plays them and the ▶s go', played.anim === 'running' && played.other === 'running' && played.shown === 0, JSON.stringify(played));
      await p.keyboard.press('p');
      await untilRoot(p, (r) => r.querySelectorAll('.motion-ctl.on.mini').length === 2, 1500);
      await p.keyboard.press('h'); // hide comments (this lab's toggle key): the controls go with them
      await untilRoot(p, (r) => !r.querySelector('.motion-ctl.on'), 1500);
      check(eng, 'hidden comments hide the motion controls too', !(await pause()).shown);
      await p.keyboard.press('p');
      await p.keyboard.press('h'); // comments back
      // ⌥ on the moving thing, inside it, or on the box holding it shows its control, ⌥ first or the mouse first.
      await p.goto(B + '/press');
      await untilRoot(p, (r) => Boolean(r.querySelector('.motions')), 2500);
      await sleep(500);
      const ctlOn = () => p.evaluate(() => [...document.querySelectorAll('*')].find((n) => n.shadowRoot?.querySelector('.scrim')).shadowRoot.querySelectorAll('.motion-ctl.on').length);
      const spot = (id, dx, dy) => p.evaluate(([id, dx, dy]) => { const r = document.getElementById(id).getBoundingClientRect(); return [r.left + r.width * dx, r.top + r.height * dy]; }, [id, dx, dy]);
      for (const [where, id, dx, dy] of [['on the moving thing', 'press', 0.08, 0.5], ['inside it', 'word', 0.5, 0.5], ['on the box holding it', 'demo', 0.6, 0.1]]) {
        for (const altFirst of [true, false]) {
          await p.mouse.move(5, 5);
          if (altFirst) await p.keyboard.down('Alt');
          await p.mouse.move(...(await spot(id, dx, dy)), { steps: 3 });
          if (!altFirst) await p.keyboard.down('Alt');
          await untilRoot(p, (r) => r.querySelectorAll('.motion-ctl.on').length === 1, 1000);
          check(eng, `⌥ ${where} (${altFirst ? '⌥ first' : 'mouse first'}) shows its control`, (await ctlOn()) === 1);
          await p.keyboard.up('Alt');
          await sleep(100);
        }
      }
      for (const c of (await (await fetch(`${B}/_lab/api/comments?page=/anim`)).json()).comments.filter((c) => !c.parent)) await fetch(B + '/_lab/api/comments', { method: 'POST', headers: { 'content-type': 'application/json', origin: B, 'x-lab-admin': key, 'x-lab-agent': '1' }, body: JSON.stringify({ page: '/anim', action: 'delete', id: c.id }) });
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
