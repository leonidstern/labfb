// "Since you looked" in real browsers (WebKit and Chrome's engine): the badge and the marks in the margin when a page
// changes under you, the card with old and new words, the jump, seen and hide, and what must never count as a change
// (a moved block, spacing, a clock, an opened <details>). Not part of `npm test`; CI runs it in the `browser` job.
// Run: node test/browser/changes.mjs   (needs the playwright package; NODE_PATH can point at a node_modules that has it).
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
const DIR = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'labit-since-')));
const PORT = 5400 + Math.floor(Math.random() * 300);
const B = `http://localhost:${PORT}`;
const env = { ...process.env, PORT: '', LABIT_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'labit-home-')), XDG_CONFIG_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'labit-cfg-')), LABIT_NO_UPDATE_CHECK: '1' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const write = (f, t) => fs.writeFileSync(path.join(DIR, f), t);
// The page: blocks far apart (so a jump scrolls), a closed <details> with words inside.
const page = ({ b = 'The second block talks about cost and price.', mid = '', c = true, order = 0, a = 'The first block talks about speed and caching.', css = '', script = '' } = {}) =>
  `<!doctype html><meta charset="utf-8"><title>S</title><style>body{margin:30px 80px;font:16px/1.4 serif}p{margin:0 0 300px}${css}</style><body><h1>Plan</h1>` +
  `<p id="a">${a}</p>${mid}${order ? '<p id="z">The last block stays as it is.</p>' : ''}<p id="b">${b}</p>${c ? '<p id="c">The third block will go away soon.</p>' : ''}` +
  `<details id="d"><summary>More</summary><p id="hid">Hidden words inside.</p></details>${order ? '' : '<p id="z">The last block stays as it is.</p>'}${script}</body>`;
write('labit.json', JSON.stringify({ port: PORT, flags: { sinceLooked: true } }));
write('index.html', page());
const server = spawn(process.execPath, [LAB, '--new', '--no-open'], { cwd: DIR, env });
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
const until = async (f, ms = 6000) => {
  for (let t = 0; t < ms; t += 150) {
    if (await f()) return true;
    await sleep(150);
  }
  return false;
};
const agent = JSON.parse(fs.readFileSync(path.join(DIR, '.lab/server.json'), 'utf8')).agent;
const post = (body, who = {}) => fetch(`${B}/_lab/api/comments`, { method: 'POST', headers: { 'content-type': 'application/json', origin: B, 'x-lab-admin': agent, ...who }, body: JSON.stringify(body) }).then((r) => r.json());

try {
  for (const eng of (process.env.ENGINES || 'webkit,chromium').split(',')) {
    const browser = await pw[eng].launch();
    // Reduced motion for the whole run: the jump is instant, so a step is read the moment it is made.
    const context = (extra = {}) => browser.newContext({ viewport: { width: 1100, height: 700 }, reducedMotion: 'reduce', ...extra });
    const open = async (ctx, file = '/') => {
      const p = await ctx.newPage();
      await p.addInitScript(() => localStorage.getItem('lab-name') || localStorage.setItem('lab-name', 'leo'));
      await p.goto(B + file);
      await sleep(1300); // the first look is taken 400 ms after the load
      const shadow = (fn, arg) => p.evaluate(([f, a]) => new Function('r', 'a', f)([...document.querySelectorAll('*')].find((n) => n.shadowRoot?.querySelector('.scrim')).shadowRoot, a), [fn.toString().replace(/^[^{]*{|}$/g, ''), arg]);
      const badge = () => shadow(() => { const b = r.querySelector('.since'); return b && !b.hidden ? b.textContent.replace(/\s+/g, ' ').trim() : ''; });
      const marks = () => shadow(() => { return [...r.querySelectorAll('.chg-mark')].map((m) => m.className.replace('chg-mark ', '').replace(' open', '')); });
      const click = (sel) => shadow(() => { r.querySelector(a).click(); }, sel);
      return { p, shadow, badge, marks, click };
    };
    const own = await context();
    const L = await open(own);
    const { p, shadow, badge, marks, click } = L;

    // ---- first visit, then added + changed + removed ----
    check(eng, 'first visit: no badge, nothing in the margin', (await badge()) === '' && (await marks()).length === 0);
    check(eng, 'the first look is kept in this browser', await p.evaluate(() => JSON.parse(localStorage.getItem('lab-looked:/index')).blocks.length >= 5));
    write('index.html', page({ b: 'The second block talks about cost and a lower price.', mid: '<p id="n">A brand new block about security.</p>', c: false }));
    const got = await until(async () => /\+1\s*~1\s*−1/.test(await badge()));
    check(eng, 'added, changed, removed: +1 ~1 −1 and three marks', got && (await marks()).length === 3 && (await marks()).join() === 'add,chg,rm', `${await badge()} · ${await marks()}`);
    check(eng, 'the badge is a status with "seen ✓" and "hide"', /since you looked.*hide.*seen ✓/.test(await badge()) && (await shadow(() => { return r.querySelector('.since').getAttribute('role'); })) === 'status');
    const hit = await shadow(() => { return Math.round(r.querySelector('.chg-mark').getBoundingClientRect().width); });
    check(eng, 'a mark is 28px wide to hit with a thumb', hit === 28, `${hit}px`);

    // ---- the card ----
    await click('.chg-mark.chg');
    await sleep(100);
    const card = await shadow(() => { const c = r.querySelector('.chg-card'); return c && { del: c.querySelector('.del')?.textContent, ins: c.querySelector('.ins')?.textContent, head: c.querySelector('.chg-head').textContent, w: Math.round(c.getBoundingClientRect().width) }; });
    check(eng, 'a tap on a changed mark shows old and new words', card && /lower/.test(card.ins || '') && card.head === 'changed since you looked' && card.w <= 320, JSON.stringify(card));
    await p.keyboard.press('Escape');
    check(eng, 'Esc closes the card', (await shadow(() => { return r.querySelectorAll('.chg-card').length; })) === 0);
    await click('.chg-mark.rm');
    check(eng, 'a removed mark shows what the block said', (await shadow(() => { return r.querySelector('.chg-card .del')?.textContent; })) === 'The third block will go away soon.');
    await p.mouse.click(5, 5);
    check(eng, 'a click elsewhere closes the card', (await shadow(() => { return r.querySelectorAll('.chg-card').length; })) === 0);

    // ---- the counts step through the marks ----
    await p.evaluate(() => scrollTo(0, 0));
    const seq = [];
    for (let i = 0; i < 4; i++) {
      await click('.since-count');
      await sleep(80);
      seq.push([await p.evaluate(() => Math.round(scrollY)), await shadow(() => { return r.querySelector('.chg-card .chg-head')?.textContent || ''; })]);
    }
    check(eng, 'the counts step through the marks in page order and wrap', seq[0][0] > 0 && seq[0][0] < seq[1][0] && seq[1][0] < seq[2][0] && seq[3][0] === seq[0][0] && seq[1][1] === 'changed since you looked' && seq[2][1] === 'removed since you looked' && seq[0][1] === '', JSON.stringify(seq));
    check(eng, 'reduced motion: the jump is instant', seq[0][0] > 0, `scrollY ${seq[0][0]} 80 ms after the click`);

    // ---- hide, seen ----
    await click('.since-btn');
    check(eng, 'hide takes the marks away and keeps the badge, with "show"', (await marks()).length === 0 && /show/.test(await badge()) && /\+1/.test(await badge()), `${await badge()}`);
    await click('.since-btn');
    check(eng, 'show brings them back', (await marks()).length === 3);
    await shadow(() => { [...r.querySelectorAll('.since-btn')].find((b) => /seen/.test(b.textContent)).click(); });
    check(eng, 'seen clears the badge and the marks', (await badge()) === '' && (await marks()).length === 0);
    await p.reload();
    await sleep(2800);
    check(eng, 'seen stays clear after a reload', (await badge()) === '' && (await marks()).length === 0);

    // ---- what is not a change ----
    // The last look is the page with the new block and without the third. Now: two blocks swapped, a spacing edit, an
    // opened <details>, in one save.
    await p.evaluate(() => (document.getElementById('d').open = true));
    write('index.html', page({ b: 'The second block   talks about\n   cost and a lower price.', mid: '<p id="n">A brand new block about security.</p>', c: false, order: 1, a: 'The first block talks about speed  and caching.' }));
    await sleep(3500);
    check(eng, 'a moved block, a spacing edit, an opened details: no marks', (await badge()) === '' && (await marks()).length === 0, `${await badge()}`);

    // ---- comments hidden ----
    write('index.html', page({ b: 'The second block talks about cost and another price.', mid: '<p id="n">A brand new block about security.</p>', c: false, order: 1 }));
    await until(async () => (await marks()).length === 1);
    await shadow(() => { [...r.querySelectorAll('button')].find((b) => /hide comments/.test(b.textContent)).click(); });
    check(eng, 'comments hidden: no badge, no marks', (await badge()) === '' && (await marks()).length === 0);
    await shadow(() => { [...r.querySelectorAll('button')].find((b) => /comments/.test(b.textContent)).click(); });
    check(eng, 'comments shown again: the same change is still there', await until(async () => (await marks()).length === 1, 3000));

    // ---- the card names the note ----
    const made = await post({ page: '/index', name: 'leo', text: 'is this price right?', anchor: { kind: 'element', selector: '#b', x: 0.1, y: 0.5, element: '<p id="b">', text: 'The second block' } });
    await post({ page: '/index', parent: made.comment.id, name: 'Claude', text: 'Checked, it was one too high.' }, { 'x-lab-agent': '1' });
    await sleep(1200);
    await click('.chg-mark.chg');
    check(eng, 'the card names the note and who answered since your look', (await shadow(() => { return r.querySelector('.chg-card .chg-head')?.textContent; })) === 'for note 1 · Claude', await shadow(() => { return r.querySelector('.chg-card .chg-head')?.textContent; }));
    await shadow(() => { r.querySelector('.chg-head.note').click(); });
    await sleep(300);
    check(eng, 'a tap on the note opens its thread', await shadow(() => { return Boolean(r.querySelector('.card') || r.querySelector('.thread') || r.querySelector('.sheet')); }));
    await post({ page: '/index', action: 'delete', id: made.comment.id });
    await own.close();

    // ---- a clock and a counter are not changes; the real edit beside them is ----
    const noise = (n, extra) => page({ b: 'The second block talks about cost and price.', mid: `<p id="clock">Updated 0</p>${extra}`, script: '<script>let n=0;setInterval(()=>{document.getElementById("clock").textContent="Updated "+(++n)},300)</script>' });
    write('noise.html', noise(0, ''));
    const ctx2 = await context();
    const N = await open(ctx2, '/noise');
    write('noise.html', noise(0, '').replace('speed and caching', 'speed  and caching')); // a save with no change in the words
    await sleep(3500);
    check(eng, 'a clock that ticks: no marks', (await N.badge()) === '', await N.badge());
    write('noise.html', noise(0, '<p id="new">A real new block.</p>'));
    check(eng, 'a real edit beside the clock marks only the edit', (await until(async () => /\+1/.test(await N.badge()))) && (await N.marks()).join() === 'add', `${await N.badge()} · ${await N.marks()}`);
    await ctx2.close();

    // ---- a page with its own scripts reloads; the marks come after the reload ----
    write('scripted.html', page({ script: '<script>document.title="one"</script>' }));
    const ctx3 = await context();
    const S = await open(ctx3, '/scripted');
    write('scripted.html', page({ b: 'The second block talks about cost and a different price.', script: '<script>document.title="two"</script>' }));
    check(eng, 'a page with scripts: marks after its reload', (await until(async () => /~1/.test(await S.badge()))) && (await S.marks()).join() === 'chg', `${await S.badge()}`);
    await ctx3.close();

    // ---- a dark page gets the dark set, a light one the light set, whatever the OS says ----
    write('dark.html', page({ css: 'body{background:#111;color:#eee}' }));
    const ctx4 = await context({ colorScheme: 'light' });
    const D = await open(ctx4, '/dark');
    write('dark.html', page({ css: 'body{background:#111;color:#eee}', mid: '<p id="n">A brand new block.</p>' }));
    await until(async () => (await D.marks()).length === 1);
    const colour = (X) => X.shadow(() => { return getComputedStyle(r.querySelector('.chg-mark'), '::before').backgroundColor; });
    check(eng, 'a dark page, a light OS: the dark set', (await colour(D)) === 'rgb(69, 196, 134)', await colour(D));
    await ctx4.close();
    const ctx5 = await context({ colorScheme: 'dark' });
    const Lt = await open(ctx5, '/');
    write('index.html', page({ b: 'The second block talks about cost and yet another price.', mid: '<p id="n">A brand new block about security.</p>', c: false, order: 1 }));
    await until(async () => (await Lt.marks()).length >= 1);
    check(eng, 'a light page, a dark OS: the light set', (await colour(Lt)) === 'rgb(224, 138, 26)' || (await colour(Lt)) === 'rgb(31, 154, 91)', await colour(Lt));
    await ctx5.close();

    // ---- the flag off: no badge, nothing kept ----
    await fetch(B + '/_lab/flags', { method: 'POST', headers: { 'content-type': 'application/json', origin: B }, body: JSON.stringify({ flag: 'sinceLooked', on: false }) });
    const ctx6 = await context();
    write('flagoff.html', page());
    const F = await open(ctx6, '/flagoff');
    const asked = [];
    F.p.on('request', (r) => /\/_lab\/api\/looked/.test(r.url()) && asked.push(r.url()));
    write('flagoff.html', page({ b: 'The second block talks about nothing.' }));
    await sleep(3000);
    check(eng, 'sinceLooked off: no badge, nothing kept, no requests', (await F.badge()) === '' && (await F.p.evaluate(() => localStorage.getItem('lab-looked:/flagoff'))) === null && asked.length === 0);
    await ctx6.close();
    await fetch(B + '/_lab/flags', { method: 'POST', headers: { 'content-type': 'application/json', origin: B }, body: JSON.stringify({ flag: 'sinceLooked', on: true }) });
    await browser.close();
  }
} finally {
  server.kill();
  fs.rmSync(DIR, { recursive: true, force: true });
}
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
