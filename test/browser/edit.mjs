// Editing words in place (flag editText) in a real browser: V picks blocks, E and Enter edit one, Esc writes the file,
// Cmd-Z takes it back, keys and clicks stay out of the way. Not part of `npm test`; CI runs it in the `browser` job.
// Run: node test/browser/edit.mjs (needs playwright; NODE_PATH can point at a node_modules that has it).
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
const DIR = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'labit-edit-b-')));
const PORT = 7960 + Math.floor(Math.random() * 30);
const B = `http://localhost:${PORT}`;
const page = (title, body) => `<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font:20px sans-serif">${body}`;
const reset = () => {
  fs.writeFileSync(path.join(DIR, 'index.html'), page('e', '<h1>Ship faster</h1>\n<p>Second block of words</p>\n<div><p>Echo</p></div><div><p>Echo</p></div>\n<a href="/other.html">go away</a>'));
};
reset();
fs.writeFileSync(path.join(DIR, 'other.html'), page('o', '<h1>Other</h1>'));
fs.writeFileSync(path.join(DIR, 'labit.json'), JSON.stringify({ port: PORT, flags: { editText: true } }));
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
const file = () => fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
const until = async (fn, ms = 3000) => {
  for (let t = 0; t < ms; t += 50) {
    if (await fn()) return true;
    await sleep(50);
  }
  return false;
};
let failed = 0;
const check = (eng, name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${eng.padEnd(8)} ${name}${detail ? ` (${detail})` : ''}`);
};
const pins = (p) => fetch(`${B}/_lab/api/comments?page=/index`).then((r) => r.json()).then((d) => (d.comments || []).length);

try {
  for (const eng of (process.env.ENGINES || 'chromium').split(',')) {
    const browser = await pw[eng].launch();
    try {
      reset();
      const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
      await ctx.addInitScript(() => localStorage.setItem('lab-name', 'leo'));
      const p = await ctx.newPage();
      await p.goto(B + '/');
      await sleep(600);
      const h1 = () => p.locator('h1');
      const mode = () => p.evaluate(() => document.documentElement.classList.contains('lab-editing'));
      const picked = () => p.evaluate(() => CSS.highlights.has('lab-pick'));
      await p.keyboard.press('v');
      check(eng, 'V turns select mode on', await mode());
      await h1().click();
      check(eng, 'a click picks the block and drops no pin', (await picked()) && (await pins(p)) === 0);
      await p.locator('a[href="/other.html"]').click();
      check(eng, 'a click on a link picks it, the page does not leave', p.url() === B + '/' && (await picked()));
      await p.keyboard.press('Tab');
      await p.keyboard.press('Shift+Tab');
      await p.keyboard.press('Escape');
      check(eng, 'Esc lets go of the block, the mode stays', !(await picked()) && (await mode()));
      await p.keyboard.press('Escape');
      check(eng, 'Esc again leaves the mode', !(await mode()));
      // E, click, Enter: edit in place, Esc writes the file.
      await p.keyboard.press('e');
      await h1().click();
      await p.keyboard.press('Enter');
      check(eng, 'Enter on the picked block makes it editable', (await h1().getAttribute('contenteditable')) !== null);
      await p.keyboard.press('Control+a');
      await p.keyboard.type('Ship calmer');
      await p.keyboard.press('m');
      check(eng, 'letters type, M and 1 do not toggle anything while editing', (await h1().textContent()) === 'Ship calmerm' && (await mode()));
      await p.keyboard.press('Backspace');
      await p.keyboard.press('Escape');
      check(eng, 'Esc writes the file', await until(() => file().includes('<h1>Ship calmer</h1>')), file().slice(60, 120));
      check(eng, 'the page shows the new words, not editable any more', (await h1().textContent()) === 'Ship calmer' && (await h1().getAttribute('contenteditable')) === null);
      check(eng, 'Esc while editing closed nothing else and the block stays picked', await picked());
      // Cmd-Z outside editing puts the file back.
      await p.keyboard.press('Escape');
      await p.keyboard.press('Escape');
      await p.keyboard.press('Control+z');
      check(eng, 'Cmd-Z takes the edit back in the file and on the page', (await until(() => file().includes('<h1>Ship faster</h1>'))) && (await until(async () => (await h1().textContent()) === 'Ship faster')));
      // Esc cancels nothing silently: unsaved typing then a click elsewhere also saves.
      await p.keyboard.press('e');
      await p.locator('p:not(.x)').first().click();
      await p.keyboard.press('Enter');
      await p.keyboard.press('Control+a');
      await p.keyboard.type('Second block, changed');
      await p.keyboard.press('Tab');
      check(eng, 'Tab saves and opens the next block', await until(() => file().includes('<p>Second block, changed</p>')));
      await p.keyboard.press('Escape');
      // Same words twice: refused, nothing written, the page goes back to the file's words.
      await p.locator('div p').nth(1).click();
      await p.keyboard.press('Enter');
      await p.keyboard.press('Control+a');
      await p.keyboard.type('Different');
      const before = file();
      await p.keyboard.press('Escape');
      await sleep(600);
      check(eng, 'words in two places are not written, the page keeps the file words', file() === before && (await p.locator('div p').nth(1).textContent()) === 'Echo', file() === before ? await p.locator('div p').nth(1).textContent() : 'file changed');
      check(eng, 'no pin was made on its own', (await pins(p)) === 0);
    } finally {
      await browser.close();
    }
  }
} finally {
  server.kill();
  fs.rmSync(DIR, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
