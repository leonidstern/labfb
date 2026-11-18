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
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'labit-browser-'));
const PORT = String(5100 + Math.floor(Math.random() * 300));
const B = `http://localhost:${PORT}`;
const env = { ...process.env, LABIT_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'labit-home-')), LABIT_NO_UPDATE_CHECK: '1' };
const paras = Array.from({ length: 80 }, (_, i) => `<p id="p${i}">paragraph ${i} with some words</p>`).join('');
const PAGE = `<!doctype html><meta charset="utf-8"><title>T1</title><link rel="stylesheet" href="s.css"><body>
<div id="top"></div><input id="i" value="typed"><details id="d"><summary>more</summary>inside</details>
<img id="pic" src="pic.svg" width="320" height="42" alt="wide"><p class="cap">a caption under it</p>${paras}</body>`;
const write = (f, t) => fs.writeFileSync(path.join(DIR, f), t);
write('index.html', PAGE);
write('s.css', 'h1{color:rgb(255,0,0)} body{margin:30px}');
write('pic.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="42"><rect width="320" height="42" fill="#cde"/></svg>');
write('notes.md', '# notes');
write('data.json', '{"a":1}');

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
  // Done pins show by default: a resolved pin stays on the page, so the go check below needs no reload
  // (a reload would land in the counts the save checks at the end make).
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
  // With wide margins (a centred column on a wide window) it waits beside the content, not at the window's edge.
  write('s.css', 'h1{color:rgb(0,0,255)} body{margin:30px 300px}');
  await sleep(1300);
  const wide = await shadow(() => { return [...r.querySelectorAll('button.pin.moved')].map((b) => b.style.left); });
  check(eng, 'on a page with wide margins it waits beside the content', wide.length > 0 && wide.every((l) => l === '270px'), JSON.stringify(wide));
  write('s.css', 'h1{color:rgb(0,0,255)} body{margin:30px}');
  await sleep(1300);

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

  // A Shift-drag from inside a word to inside another quotes both whole words; one inside a single word keeps its letters.
  const quoteOf = async (id, from, to, text) => {
    const at = await p.evaluate(([id, from, to]) => {
      const t = document.getElementById(id).firstChild;
      const r = document.createRange();
      r.setStart(t, from);
      r.setEnd(t, to);
      const rs = r.getClientRects();
      const a = rs[0], z = rs[rs.length - 1];
      return { x1: a.left + 1, y: a.top + a.height / 2, x2: z.right - 1 };
    }, [id, from, to]);
    // A Shift-press on main stretches whatever selection is left from before (fixed with the fluid dialog): start clean.
    await p.evaluate(() => getSelection().removeAllRanges());
    await p.keyboard.down('Shift');
    await p.mouse.move(at.x1, at.y);
    await p.mouse.down();
    await p.mouse.move(at.x2, at.y, { steps: 6 });
    await p.mouse.up();
    await p.keyboard.up('Shift');
    await sleep(400);
    await p.keyboard.type(text);
    await p.keyboard.press('Enter');
    await sleep(600);
    const all = (await (await fetch(B + '/_lab/api/comments?page=/index')).json()).comments;
    return all.find((c) => c.text === text)?.anchor?.quote?.exact;
  };
  await p.evaluate(() => document.getElementById('p7').scrollIntoView({ block: 'center' }));
  await sleep(300);
  const whole = await quoteOf('p7', 2, 18, 'snap whole'); // "ragraph 7 with s"
  check(eng, 'a Shift-drag from inside a word to inside another quotes both whole words', whole === 'paragraph 7 with some', whole);
  const inside = await quoteOf('p9', 2, 6, 'snap inside'); // "ragr"
  check(eng, '…a Shift-drag inside one word keeps its letters', inside === 'ragr', inside);
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

  // A go pin is a pin like any other: resolved, it wears the tick rather than saying "go" for ever.
  const admin = JSON.parse(fs.readFileSync(path.join(DIR, '.lab/server.json'), 'utf8')).agent;
  const post = (body) =>
    fetch(`${B}/_lab/api/comments`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-lab-admin': admin, 'x-lab-agent': '1' }, body: JSON.stringify(body) }).then((r) => r.json());
  const page = await p.evaluate(() => document.querySelector('script[src*="comments.js"]').dataset.page);
  const placed = await post({ page, name: 'leo', text: 'go', anchor: { kind: 'element', selector: '#p3', x: 0.5, y: 0.5, element: '<p>', text: 'paragraph 3 with some words', section: '' } });
  await sleep(1200);
  const goFace = await shadow(() => { return r.querySelector('.pin.go')?.textContent.trim(); });
  if (!placed.comment) throw new Error(`could not place the go pin: ${JSON.stringify(placed)}`);
  await post({ page, action: 'resolve', id: placed.comment.id });
  await sleep(1500);
  const doneFace = await shadow(() => { return r.querySelector('.pin.go')?.textContent.trim(); });
  check(eng, 'a go pin says go, and wears the tick once it is done', goFace === 'go' && doneFace === '✓', `${goFace} → ${doneFace}`);
  await post({ page, action: 'delete', id: placed.comment.id });
  // Option-click on a pin resolves its thread without opening it; again opens it again
  const elsewhere = async () => (await (await fetch(B + '/_lab/api/comments?page=/index')).json()).comments.find((c) => c.text === 'from elsewhere');
  const optClick = async () => {
    const at = await shadow(() => { const b = [...r.querySelectorAll('button.pin')].find((x) => x.title.includes('Sam') && !x.classList.contains('moved')); if (!b) return null; b.scrollIntoView({ block: 'center' }); const q = b.getBoundingClientRect(); return [q.left + q.width / 2, q.top + q.height / 2]; });
    if (!at) return false;
    await p.keyboard.down('Alt');
    await p.mouse.click(at[0], at[1]);
    await p.keyboard.up('Alt');
    await sleep(500);
    return true;
  };
  const clicked = await optClick();
  const afterOne = await elsewhere();
  const cardOpen = await shadow(() => { return Boolean(r.querySelector('.card')); });
  check(eng, 'option-click on a pin resolves its thread without opening it', clicked && Boolean(afterOne?.resolved) && !cardOpen, JSON.stringify({ clicked, resolved: afterOne?.resolved, cardOpen }));
  await fetch(B + '/_lab/api/comments', { method: 'POST', headers: { 'content-type': 'application/json', origin: B }, body: JSON.stringify({ page: '/index', action: 'reopen', id: afterOne?.id }) });
  await sleep(700);
  // Pin over controls: off, a control keeps its own pointer and the menu says how to pin there once; on, it shows the pin
  const sum = await p.locator('#d summary').boundingBox();
  await p.mouse.move(sum.x + 8, sum.y + 6);
  await p.mouse.move(sum.x + 10, sum.y + 7);
  await sleep(150);
  const overOff = await shadow(() => { return { hint: r.querySelector('.over-btn kbd')?.textContent || '', ctl: document.documentElement.classList.contains('lab-ctl'), over: document.documentElement.classList.contains('lab-over') }; });
  await shadow(() => { r.querySelector('.over-btn').click(); });
  await p.mouse.move(sum.x + 12, sum.y + 8);
  await sleep(150);
  const overOn = await shadow(() => { return { hint: r.querySelector('.over-btn kbd')?.textContent || '', over: document.documentElement.classList.contains('lab-over'), cursor: getComputedStyle(document.querySelector('#d summary')).cursor }; });
  await shadow(() => { r.querySelector('.over-btn').click(); });
  check(eng, 'pin over controls: the menu shows option-click while off, the pin shows over a control while on',
    overOff.hint.endsWith('click') && overOff.ctl && !overOff.over && !overOn.hint && overOn.over && /^(none|crosshair)$/.test(overOn.cursor), JSON.stringify([overOff, overOn]));

  // A pin is one element for as long as its thread is on the page: opening, closing and pointing at it (and away) redraw
  // the widget, but the pin and its running animation carry on, not start again (Leo, 18 Nov).
  const work = await post({ page, name: 'leo', text: 'keep running', anchor: { kind: 'element', selector: '#p9', x: 0.5, y: 0.5, docX: 0.5, docY: 300, width: 1000, element: '<p id="p9">', text: 'paragraph 9 with some words', section: '' } });
  execFileSync(process.execPath, [LAB, 'reply', work.comment.id, '--on-it', 'Looking'], { cwd: DIR, env, stdio: 'ignore' });
  await sleep(1500);
  await p.evaluate(() => scrollTo(0, 0));
  await sleep(200);
  const mine = (tag) => shadow(() => {
    const pin = [...r.querySelectorAll('.pin.working')].find((b) => b.getAttribute('aria-label').includes('keep running') || b.title.includes('leo'));
    if (!pin) return null;
    if (a) pin.__tag = a;
    const ring = pin.querySelector('.ring');
    const turn = ring?.getAnimations({ subtree: true }).find((x) => x.animationName === 'lab-turn');
    if (a) pin.__ring = ring;
    const box = pin.getBoundingClientRect();
    return { same: pin.__tag === 'T' && pin.__ring === ring, time: turn ? turn.currentTime : null, card: Boolean(r.querySelector('.card:not(.out)')), draft: Boolean(r.querySelector('.pin.draft')), x: box.left + 14, y: box.top + 14 };
  }, tag);
  const first = await mine('T');
  check(eng, 'a working pin has its ring turning', Boolean(first) && first.time > 0 && first.y > 0 && first.y < 650, JSON.stringify(first));
  if (first) {
    let last = first.time;
    const steps = [
      ['hover', false, async (at) => p.mouse.move(at.x, at.y)],
      ['click (opens its thread)', true, async (at) => p.mouse.click(at.x, at.y)],
      ['click again (closes it)', false, async (at) => p.mouse.click(at.x, at.y)],
      ['leave', false, async () => p.mouse.move(700, 100)],
      ['a click on the page, which opens a new comment box', false, async () => p.mouse.click(700, 150), true],
      ['closing that box (Escape)', false, async () => p.keyboard.press('Escape')],
      ['a second click on empty page space', false, async () => p.mouse.click(780, 330), true],
      ['closing it with a click on the page', false, async () => p.mouse.click(700, 450)],
      ['Escape with nothing open', false, async () => p.keyboard.press('Escape')],
    ];
    let at = first;
    for (const [name, card, act, draft] of steps) {
      await act(at);
      await sleep(350);
      const now = await mine(null);
      const ok = Boolean(now) && now.same && now.card === card && (!draft || now.draft) && now.time > last + 200;
      check(eng, `a pin keeps its element and its ring's animation across: ${name}`, ok, now ? `same ${now.same}, ring ${Math.round(last)} → ${Math.round(now.time)} ms` : 'pin gone');
      if (!now) break;
      last = now.time;
      at = now;
    }
  }
  await post({ page, action: 'delete', id: work.comment.id });

  // A save the page has nothing to do with leaves it alone; one it may fetch reloads it; a lab restart doesn't.
  // (A page with its own <script> is not used here: such a page never patches in place, it reloads on every HTML
  // save, which is what the checks above cover. Whether a page uses a saved script is tested in hot.test.mjs.)
  // (a reload waits while you've just pressed a key or clicked: give it a moment)
  write('notes.md', '# notes, changed');
  await sleep(3000);
  check(eng, 'a save the page does not use leaves it alone', loads === 1, `loads ${loads}`);
  write('data.json', '{"a":2}');
  await sleep(3000);
  check(eng, 'a save it may fetch reloads the page', loads === 2, `loads ${loads}`);
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
