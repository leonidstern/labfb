// The agent's status messages ("on it") fold and never count as unread: a thread shows Leo's message, a small muted
// "N updates ›" row (a tap opens them in place), then the answer; before the answer the latest status stays; the pin,
// the chat and the tab title count no status as new.
// Not part of `npm test`; CI runs it in the `browser` job. Run: node test/browser/fold.mjs (needs playwright; NODE_PATH
// can point at a node_modules that has it). One line per check; exits 1 if any fails.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
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
  // On CI a missing browser is a failure: a skip there would pass with nothing run.
  console.log(`playwright is not installed: ${process.env.CI ? 'failed (CI)' : 'skipped'}`);
  process.exit(process.env.CI ? 1 : 0);
})();

const LAB = fileURLToPath(new URL('../../local.mjs', import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (eng, name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${eng.padEnd(8)} ${name}${detail ? ` (${detail})` : ''}`);
};
const until = async (ok, ms = 6000) => {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(60)) if (await ok()) return true;
  return false;
};

// One lab per engine, so each starts with no comments.
async function lab(n) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'labit-fold-'));
  const port = String(claimPort(6700 + n * 40, 30));
  const B = `http://localhost:${port}`;
  const env = { ...process.env, LAB_SETTLE_MS: '0', LABIT_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'labit-home-')), LABIT_NO_UPDATE_CHECK: '1', LABIT_EXIT_WITH_PARENT: '1' };
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><meta charset="utf-8"><title>p</title><body style="margin:40px"><p id="a">first line</p><p id="b">second line</p><p id="c">third line</p></body>');
  const server = spawn(process.execPath, [LAB, '.', '--new', '--no-open', '--port', port], { cwd: dir, env });
  for (let i = 0; i < 80; i++) {
    try {
      await fetch(B + '/');
      break;
    } catch {
      await sleep(100);
    }
  }
  const cli = (...args) => new Promise((done) => execFile(process.execPath, [LAB, ...args], { cwd: dir, env }, (err, out, errOut) => done({ code: err?.code ?? 0, out: out + errOut })));
  const post = (text, sel) =>
    fetch(B + '/_lab/api/comments', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: B },
      body: JSON.stringify({ page: '/index', name: 'Leo', text, anchor: { selector: sel, x: 0.2, y: 0.5, docX: 0.1, docY: 20, width: 1000, element: `<p id="${sel.slice(1)}">` } }),
    }).then((r) => r.json()).then((j) => j.comment.id);
  const comments = () => fetch(B + '/_lab/api/comments?page=/index').then((r) => r.json()).then((j) => j.comments);
  return { B, cli, post, comments, stop: () => (server.kill(), fs.rmSync(dir, { recursive: true, force: true })) };
}

for (const [n, eng] of (process.env.ENGINES || 'webkit,chromium').split(',').entries()) {
  const L = await lab(n);
  const browser = await pw[eng].launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
    await ctx.addInitScript(() => localStorage.setItem('lab-name', 'leo'));
    const p = await ctx.newPage();
    await p.goto(L.B + '/');
    await until(() => p.evaluate(() => [...document.querySelectorAll('*')].some((n) => n.shadowRoot?.querySelector('.scrim'))), 3000);
    const shadow = (fn, arg) => p.evaluate(([f, a]) => new Function('r', 'a', f)([...document.querySelectorAll('*')].find((n) => n.shadowRoot?.querySelector('.scrim')).shadowRoot, a), [fn.toString().replace(/^[^{]*{|}$/g, ''), arg]);
    const card = () => shadow(() => { const b = r.querySelector('.card .body'); return b ? { rows: [...b.children].map((n) => (n.classList.contains('updates') ? `[${n.textContent}]` : n.classList.contains('msg') ? n.textContent.replace(/\s+/g, ' ').trim().slice(0, 40) : '')).filter(Boolean) } : null; });
    const pinNew = () => shadow(() => { return r.querySelector('button.pin')?.classList.contains('new') || false; });

    const id = await L.post('make it red', '#a');
    await until(async () => (await shadow(() => { return r.querySelectorAll('button.pin').length; })) === 1);
    await L.cli('wait', '--timeout', '5');
    await L.cli('reply', id, 'on it, first', '--on-it');
    await L.cli('reply', id, 'on it, second', '--on-it');
    await until(async () => (await L.comments()).filter((c) => c.intent === 'working').length === 2);
    await sleep(600);
    check(eng, 'status messages alone leave no new mark on the pin', (await pinNew()) === false);
    check(eng, 'and the tab title counts none', !/^\(\d+\)/.test(await p.title()), await p.title());
    await shadow(() => { r.querySelector('button.pin').click(); });
    await until(async () => Boolean(await card()));
    let rows = (await card())?.rows || [];
    check(eng, 'before the answer: the older update folds, the latest status still shows', rows.length === 3 && rows[1] === '[1 update ›]' && /on it, second/.test(rows[2]), JSON.stringify(rows));

    await L.cli('reply', id, 'made it red', '--done');
    await until(async () => /made it red/.test(((await card())?.rows || []).join('|')), 4000);
    rows = (await card())?.rows || [];
    check(eng, 'with the answer: Leo, "2 updates ›", then the answer', rows.length === 3 && /make it red/.test(rows[0]) && rows[1] === '[2 updates ›]' && /made it red/.test(rows[2]), JSON.stringify(rows));
    await shadow(() => { r.querySelector('.card .updates').click(); });
    await until(async () => ((await card())?.rows || []).length === 5, 2000);
    rows = (await card())?.rows || [];
    check(eng, 'a tap opens the updates in place, in order', rows.length === 5 && /on it, first/.test(rows[2]) && /on it, second/.test(rows[3]) && /made it red/.test(rows[4]), JSON.stringify(rows));
    await shadow(() => { r.querySelector('.card .updates').click(); });
    await until(async () => ((await card())?.rows || []).length === 3, 2000);
    check(eng, 'and a tap on the row folds them again', ((await card())?.rows || []).length === 3);

    // The chat: a status in it is not counted, and folds after the answer.
    const chatId = await fetch(L.B + '/_lab/api/comments', { method: 'POST', headers: { 'content-type': 'application/json', origin: L.B }, body: JSON.stringify({ page: '/index', name: 'Leo', text: 'whole page note', anchor: { kind: 'page', width: 1000, height: 700, dpr: 1 } }) }).then((r) => r.json()).then((j) => j.comment.id);
    await L.cli('wait', '--timeout', '5');
    await L.cli('reply', chatId, 'on it, chat', '--on-it');
    await until(async () => (await L.comments()).some((c) => c.parent === chatId));
    await sleep(600);
    const count = () => shadow(() => { return r.querySelector('.cnt')?.textContent; });
    check(eng, 'the chat count takes no status as new', (await count()) === '0', await count());
    await p.keyboard.press('Escape');
    await p.keyboard.press('t');
    await until(async () => (await shadow(() => { return !r.querySelector('.chatwin').hidden; })) === true, 2000);
    const chatRows = () => shadow(() => { return [...r.querySelectorAll('.chatwin .msgs > *')].map((n) => (n.classList.contains('updates') ? `[${n.textContent}]` : n.classList.contains('msg') ? n.textContent.replace(/\s+/g, ' ').trim().slice(0, 40) : '')).filter(Boolean); });
    let cr = await chatRows();
    check(eng, 'in the chat the lone status still shows (no answer yet)', cr.some((t) => /on it, chat/.test(t)) && !cr.some((t) => /update/.test(t)), JSON.stringify(cr));
    await L.cli('reply', chatId, 'chat answer', '--done');
    await until(async () => (await chatRows()).some((t) => /chat answer/.test(t)), 3000);
    cr = await chatRows();
    check(eng, 'in the chat the answer folds the status into "1 update ›"', cr.some((t) => t === '[1 update ›]') && !cr.some((t) => /on it, chat/.test(t)), JSON.stringify(cr));
    await p.close();
  } finally {
    await browser.close();
    L.stop();
  }
}
process.exit(failed ? 1 : 0);
