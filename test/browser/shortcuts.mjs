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
  for (const eng of ['webkit', 'chromium']) {
    const browser = await pw[eng].launch();
    try {
      const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
      await ctx.addInitScript(() => localStorage.setItem('lab-name', 'leo'));
      const p = await ctx.newPage();
      await p.goto(B + '/');
      await sleep(1200);
      const start = await look(p);
      await p.keyboard.press('m');
      await sleep(300);
      check(eng, 'the old toggle key (m) does nothing', (await look(p)).on === start.on);
      await p.keyboard.press('h');
      await sleep(300);
      const on = await look(p);
      check(eng, 'the new toggle key (h) shows and hides comments', on.on !== start.on);
      if (!on.on) {
        await p.keyboard.press('h');
        await sleep(300);
      }
      check(eng, 'the chat button shows the new key', /\(x\)/.test((await look(p)).chatWords), (await look(p)).chatWords);
      await p.keyboard.press('c');
      await sleep(400);
      check(eng, 'the old chat key (c) does nothing', !(await look(p)).chat);
      await p.keyboard.press('x');
      await sleep(600);
      check(eng, 'the new chat key (x) opens the chat', (await look(p)).chat);
      // With the bar showing (words selected with Shift-drag), a key that is a shortcut elsewhere is a letter: the
      // changed toggle key (h) starts the comment, it doesn't hide the comments.
      await p.keyboard.press('Escape');
      await sleep(300);
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
      await sleep(700);
      await p.keyboard.press('h');
      await sleep(900);
      const typed = await p.evaluate(() => {
        const r = [...document.querySelectorAll('*')].find((n) => n.shadowRoot?.querySelector('.scrim'))?.shadowRoot;
        return r?.querySelector('.fd textarea')?.value;
      });
      check(eng, 'with the bar showing, the changed toggle key (h) is a letter, not a shortcut', typed === 'h' && (await look(p)).on === onBefore, `${typed}`);
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
