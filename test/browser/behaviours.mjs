// Browser checks of how a lab page behaves, in Safari's engine (WebKit) and Chrome's, with Playwright.
// Not part of `npm test`; CI runs it as the `browser` job. Run: node test/browser/behaviours.mjs   (needs the playwright package;
// NODE_PATH can point at a node_modules that has it). Prints one line per check and exits 1 if any fails.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

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
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'labfb-browser-'));
const PORT = String(5100 + Math.floor(Math.random() * 300));
const B = `http://localhost:${PORT}`;
const env = { ...process.env, LABFB_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'labfb-home-')), LABFB_NO_UPDATE_CHECK: '1' };
const paras = Array.from({ length: 80 }, (_, i) => `<p id="p${i}">paragraph ${i} with some words</p>`).join('');
const PAGE = `<!doctype html><meta charset="utf-8"><title>T1</title><link rel="stylesheet" href="s.css"><body>
<div id="top"></div><input id="i" value="typed"><details id="d"><summary>more</summary>inside</details>
<img id="pic" src="pic.svg" width="320" height="42" alt="wide"><p class="cap">a caption under it</p>${paras}</body>`;
const write = (f, t) => fs.writeFileSync(path.join(DIR, f), t);
write('index.html', PAGE);
write('s.css', 'h1{color:rgb(255,0,0)} body{margin:30px}');
write('pic.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="42"><rect width="320" height="42" fill="#cde"/></svg>');

let server;
const start = () => (server = spawn(process.execPath, [LAB, '.', '--new', '--no-open', '--port', PORT], { cwd: DIR, env }));
const up = async () => {
  for (let i = 0; i < 80; i++) {
    try {
      return await fetch(B + '/');
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error('lab did not start');
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (eng, name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${eng.padEnd(8)} ${name}${detail ? ` (${detail})` : ''}`);
};

start();
await up();
for (const eng of ['webkit', 'chromium']) {
  write('index.html', PAGE);
  write('s.css', 'h1{color:rgb(255,0,0)} body{margin:30px}');
  const browser = await pw[eng].launch();
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  await ctx.addInitScript(() => localStorage.setItem('lab-name', 'leo'));
  const p = await ctx.newPage();
  let loads = 0;
  p.on('load', () => loads++);
  const shadow = (fn, arg) => p.evaluate(([f, a]) => new Function('r', 'a', f)([...document.querySelectorAll('*')].find((n) => n.shadowRoot).shadowRoot, a), [fn.toString().replace(/^[^{]*{|}$/g, ''), arg]);
  await p.goto(B + '/');
  await sleep(1200);

  // Saved files
  await p.fill('#i', 'kept text');
  await p.evaluate(() => (document.querySelector('#d').open = true));
  await p.mouse.move(5, 5);
  await sleep(1700);
  write('s.css', 'h1{color:rgb(0,0,255)} body{margin:30px}');
  await sleep(1200);
  check(eng, 'CSS save swaps the stylesheet, no reload', loads === 1 && (await p.$$eval('link[rel=stylesheet]', (l) => l.some((x) => /lab-v=/.test(x.href)))));
  write('index.html', PAGE.replace('<title>T1', '<title>T2').replace('a caption under it', 'a caption, changed'));
  await sleep(1500);
  const st = await p.evaluate(() => ({ t: document.title.replace(/^\(\d+\) /, ''), // the unread count prefix is the widget's own
    cap: document.querySelector('.cap').textContent, v: document.querySelector('#i').value, open: document.querySelector('#d').open }));
  check(eng, 'HTML save patches in place, no reload', loads === 1 && st.t === 'T2' && st.cap === 'a caption, changed', JSON.stringify(st));
  check(eng, 'typed text and an open section stay', st.v === 'kept text' && st.open);
  await p.evaluate(() => scrollTo(0, 900));
  await sleep(300);
  const under = () => p.evaluate(() => Math.round(document.querySelector('#p30').getBoundingClientRect().top)); // where a paragraph in view sits on screen
  const was = await under();
  write('index.html', PAGE.replace('<title>T1', '<title>T2').replace('a caption under it', 'a caption, changed').replace('<div id="top"></div>', '<div id="top"><p>new</p><p>new</p><p>new</p><p>new</p></div>'));
  await sleep(1600);
  const now = await under();
  check(eng, 'what you look at keeps its place', Math.abs(now - was) <= 2, `paragraph at ${was} px → ${now} px`);
  write('pic.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="42"><rect width="320" height="42" fill="#fdc"/></svg>');
  await sleep(1300);
  check(eng, 'picture save swaps it, no reload', loads === 1 && /lab-v=/.test(await p.$eval('#pic', (i) => i.getAttribute('src'))));

  // Comments arriving
  await p.evaluate(() => scrollTo(0, 0));
  const pinsBefore = await shadow(() => { return r.querySelectorAll('button.pin').length; });
  await fetch(B + '/_lab/api/comments', { method: 'POST', headers: { 'content-type': 'application/json', origin: B }, body: JSON.stringify({ page: '/index', name: 'Sam', text: 'from elsewhere', anchor: { selector: '#p2', x: 0.1, y: 0.5, docX: 0.1, docY: 300, width: 1000, element: '<p id="p2">' } }) });
  await sleep(900);
  check(eng, 'a comment from elsewhere shows up, no reload', loads === 1 && (await shadow(() => { return r.querySelectorAll('button.pin').length; })) === pinsBefore + 1);
  // Pages toggle state classes; a pin stays on its element. One whose element is gone waits on the left edge, at its height.
  await p.evaluate(() => document.querySelector('#p2').classList.add('offscreen'));
  await fetch(B + '/_lab/api/comments', { method: 'POST', headers: { 'content-type': 'application/json', origin: B }, body: JSON.stringify({ page: '/index', name: 'Sam', text: 'gone', anchor: { selector: '#nope', x: 0.5, y: 0.5, docX: 0.6, docY: 400, width: 1000, element: '<p id="nope">' } }) });
  await sleep(900);
  const pins = await shadow(() => { return [...r.querySelectorAll('button.pin')].map((b) => [b.classList.contains('moved'), b.style.left, b.style.top]); });
  check(eng, 'a pin keeps its element when the page adds a class to it', pins.every(([m, l]) => !m || l === '10px'), JSON.stringify(pins));
  check(eng, 'a pin whose element is gone waits on the left edge at its height', pins.some(([m, l, t]) => m && l === '10px' && t === '400px'), JSON.stringify(pins));

  // Areas
  const img = await p.locator('#pic').boundingBox();
  await p.mouse.click(img.x + img.width + 40, img.y + 60); // a stray click opens an empty comment box
  await sleep(300);
  const x = img.x + 10, y = img.y + 10;
  await p.mouse.move(x, y);
  await p.mouse.down();
  for (let i = 1; i <= 12; i++) await p.mouse.move(x + 330 * i / 12, y + 20 * i / 12);
  await p.mouse.up();
  await sleep(300);
  const zone = await shadow(() => { const z = r.querySelector('.zone.draft'); return z ? Math.round(z.getBoundingClientRect().width) + 'x' + Math.round(z.getBoundingClientRect().height) : null; });
  check(eng, 'a narrow area can be drawn, even after a stray click', zone === '330x20', String(zone));
  await p.keyboard.type('narrow strip');
  await p.keyboard.press('Enter');
  await sleep(600);
  const saved = (await (await fetch(B + '/_lab/api/comments?page=/index')).json()).comments.find((c) => c.text === 'narrow strip');
  check(eng, 'an area a little past a picture stays on the picture', /<img/.test(saved?.anchor?.element || ''), saved?.anchor?.element);
  await p.keyboard.press('Escape');

  // Text selection
  const lede = await p.locator('#p5').boundingBox();
  await p.keyboard.down('Shift');
  await p.keyboard.up('Shift');
  await p.mouse.move(lede.x + 10, lede.y + 8);
  await p.mouse.down();
  await p.mouse.move(lede.x + 16, lede.y + 9);
  await p.mouse.up();
  await sleep(100);
  check(eng, 'a click right after Shift selects no text', (await p.evaluate(() => getSelection().toString())) === '');
  await p.keyboard.press('Escape');
  await sleep(200);

  // Keys
  const chatOpen = () => shadow(() => { return !r.querySelector('.chatwin').hidden; });
  await p.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'с', code: 'KeyC', bubbles: true })));
  await sleep(300);
  check(eng, 'C opens the chat, on a Cyrillic layout too', await chatOpen());
  await p.keyboard.press('Escape');
  await sleep(200);
  await p.keyboard.press('2');
  const go = await shadow(() => { return r.querySelector('.go-btn').classList.contains('on'); });
  await p.keyboard.press('3');
  await sleep(100);
  await p.mouse.click(500, 400);
  await sleep(300);
  const pinnedIn3 = await shadow(() => { return Boolean(r.querySelector('.float')); });
  await p.keyboard.press('1');
  check(eng, '2 is go, 3 is cursor (a click pins nothing)', go && !pinnedIn3);

  // A script change reloads; a lab restart doesn't
  // (a reload waits while you've just pressed a key or clicked: give it a moment)
  write('app.js', 'console.log(1)');
  await sleep(3000);
  check(eng, 'a script save reloads the page', loads === 2, `loads ${loads}`);
  await sleep(800);
  server.kill();
  await sleep(600);
  start();
  await up();
  await sleep(5000);
  check(eng, 'a lab restart does not reload the page', loads === 2, `loads ${loads}`);
  await browser.close();
}
server.kill();
fs.rmSync(DIR, { recursive: true, force: true });
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
