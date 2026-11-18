// "Added since you looked" in real browsers (WebKit and Chrome's engine): the "Added · N" pill and its list of the ids the
// agent added to a page, each a link that goes there; what drops an id off the list (going to it, a second in view);
// no buttons under the list; two names, two devices, a phone's sheet, the lab being down; and what must never count (a changed
// text, a removed id, an id a framework makes up, ids a page's own script makes). Not part of `npm test`; CI runs it
// in the `browser` job.
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
// A page with six ids of its own (a, b, c, d, hid, z) and room: its blocks are far apart, so what comes after them is
// well below the window. `end` is what the agent adds at the bottom.
const sec = (id, title) => `<section id="${id}" style="margin:0 0 300px"><h2>${title}</h2><p>Words of ${title}.</p></section>`;
const page = ({ b = 'The second block talks about cost and price.', c = true, end = '', script = '' } = {}) =>
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>S</title><style>body{margin:30px 80px;font:16px/1.4 serif}p{margin:0 0 300px}</style><body><h1>Plan</h1>` +
  `<p id="a">The first block talks about speed and caching.</p><p id="b">${b}</p>${c ? '<p id="c">The third block will go away soon.</p>' : ''}` +
  `<details id="d"><summary>More</summary><p id="hid">Hidden words inside.</p></details><p id="z">The last block stays as it is.</p>${end}${script}</body>`;
write('labit.json', JSON.stringify({ port: PORT, flags: { sinceLooked: true } }));
write('index.html', page());
// A second lab with the flag left at its default (off): the flag is set in labit.json when a lab starts, nowhere else.
const OFF_DIR = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'labit-since-off-')));
const OFF_PORT = PORT + 300;
const OFF = `http://localhost:${OFF_PORT}`;
fs.writeFileSync(path.join(OFF_DIR, 'labit.json'), JSON.stringify({ port: OFF_PORT }));
fs.writeFileSync(path.join(OFF_DIR, 'flagoff.html'), page());
const server = spawn(process.execPath, [LAB, '--new', '--no-open'], { cwd: DIR, env });
const offServer = spawn(process.execPath, [LAB, '--new', '--no-open'], { cwd: OFF_DIR, env });
for (const base of [B, OFF])
  for (let i = 0; i < 80; i++) {
    try {
      await fetch(base + '/');
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

try {
  for (const eng of (process.env.ENGINES || 'webkit,chromium').split(',')) {
    const browser = await pw[eng].launch();
    const ME = `leo-${eng}`; // each engine is somebody of its own: the lab keeps what it saw
    // Reduced motion for the whole run: a jump is instant, so a step is read the moment it is made.
    const context = (extra = {}) => browser.newContext({ viewport: { width: 1100, height: 700 }, reducedMotion: 'reduce', ...extra });
    const open = async (ctx, file = '/', name = ME, before = () => {}, look = true, base = B) => {
      const p = await ctx.newPage();
      if (name) await p.addInitScript((n) => localStorage.getItem('lab-name') || localStorage.setItem('lab-name', n), name);
      await before(p);
      await p.goto(base + file);
      // The widget starts, and takes the first look 400 ms after the load (a cold browser takes its time).
      await p.waitForFunction(() => [...document.querySelectorAll('*')].some((n) => n.shadowRoot?.querySelector('.scrim')), null, { timeout: 15000 });
      if (look) await p.waitForFunction(() => localStorage.getItem('lab-looked:' + document.querySelector('script[data-page]').dataset.page), null, { timeout: 15000 }).catch(() => {});
      await sleep(400);
      const shadow = (fn, arg) => p.evaluate(([f, a]) => new Function('r', 'a', f)([...document.querySelectorAll('*')].find((n) => n.shadowRoot?.querySelector('.scrim')).shadowRoot, a), [fn.toString().replace(/^[^{]*{|}$/g, ''), arg]);
      // The pill's words ("Added · 2"), or '' while it is hidden.
      const pill = () => shadow(() => { const b = r.querySelector('.since'); return b && !b.hidden ? r.querySelector('.since-count').textContent.trim() : ''; });
      const rows = () => shadow(() => { return [...r.querySelectorAll('.news-item')].map((n) => ({ label: n.querySelector('.news-label')?.textContent || '', id: n.querySelector('.news-id').textContent, href: n.getAttribute('href') })); });
      const listOpen = () => shadow(() => { return !r.querySelector('.since-panel').hidden; });
      const click = (sel) => shadow(() => { r.querySelector(a).click(); }, sel);
      const stored = () => p.evaluate(() => JSON.parse(localStorage.getItem('lab-looked:' + document.querySelector('script[data-page]').dataset.page)));
      // Goes to every item on the list, one after another (the list stays open on a wide screen): all of them seen.
      const seeAll = async () => {
        if (!(await listOpen())) await click('.since-count');
        for (let i = 0; i < 20 && (await shadow(() => { return r.querySelectorAll('.news-item').length; })); i++) {
          await click('.news-item');
          await sleep(150);
        }
      };
      return { p, shadow, pill, rows, listOpen, click, stored, seeAll };
    };
    write('index.html', page());
    const own = await context();
    const L = await open(own);
    const { p, shadow, pill, rows, listOpen, click, stored, seeAll } = L;

    // ---- first visit, then the agent adds a section ----
    check(eng, 'first visit: no pill', (await pill()) === '');
    const first = await stored();
    check(eng, 'the first look is kept in this browser: every id with its label', first.ids.length === 6 && first.ids.some(([id, t]) => id === 'a' && /first block/.test(t)) && first.ids.some(([id, t]) => id === 'd' && t === 'More'), JSON.stringify(first.ids.map((n) => n[0])));
    write('index.html', page({ end: sec('v1', 'Version one') }));
    check(eng, 'a section with an id is added: "Added · 1"', await until(async () => (await pill()) === 'Added · 1'), await pill());
    check(eng, 'the list is closed until it is asked for', !(await listOpen()));
    await click('.since-count');
    const list = await rows();
    check(eng, 'it lists the new one by its heading and its #id, as a link', list.length === 1 && list[0].label === 'Version one' && list[0].id === '#v1' && list[0].href === '#v1', JSON.stringify(list));
    check(eng, 'opening the list puts the keyboard on its first item', await shadow(() => { return r.activeElement?.classList.contains('news-item'); }));
    check(eng, 'none of the old marks: nothing in the margin, no card', (await shadow(() => { return r.querySelectorAll('.chg-mark, .chg-card, .chgs').length; })) === 0);
    check(eng, 'no buttons under the list (no "seen ✓", no "hide"): only its links', (await shadow(() => { return r.querySelectorAll('.since-panel button, .since-foot').length; })) === 0);

    // ---- going to it ----
    const y0 = await p.evaluate(() => Math.round(scrollY));
    await click('.news-item');
    await sleep(200);
    const y1 = await p.evaluate(() => Math.round(scrollY));
    const top = await p.evaluate(() => Math.round(document.getElementById('v1').getBoundingClientRect().top));
    check(eng, 'a tap on it scrolls there (instant, reduced motion) and outlines it for a moment', y0 === 0 && y1 > 1000 && top >= 0 && top < 600 && (await p.evaluate(() => document.getElementById('v1').getAnimations().length)) > 0, `scrollY ${y0} → ${y1}, top ${top}`);
    check(eng, 'and it drops off the list: the pill is gone', (await pill()) === '' && (await shadow(() => { return r.querySelectorAll('.news-item').length; })) === 0);
    check(eng, 'the look keeps it, so a reload shows nothing', (await stored()).ids.some((n) => n[0] === 'v1'));
    await p.evaluate(() => scrollTo(0, 0));

    // ---- ↓ ↑ and Enter ----
    write('index.html', page({ end: sec('v1', 'Version one') + sec('v2', 'Version two') + sec('v3', 'Version three') }));
    await until(async () => (await pill()) === 'Added · 2');
    await click('.since-count');
    const names = async () => shadow(() => { return r.activeElement?.querySelector?.('.news-id')?.textContent || ''; });
    const at0 = await names();
    await p.keyboard.press('ArrowDown');
    const at1 = await names();
    await p.keyboard.press('ArrowDown');
    const at2 = await names();
    await p.keyboard.press('ArrowUp');
    const at3 = await names();
    check(eng, '↓ and ↑ walk the list and wrap', at0 === '#v2' && at1 === '#v3' && at2 === '#v2' && at3 === '#v3', `${at0} ${at1} ${at2} ${at3}`);
    await p.keyboard.press('Enter');
    await sleep(200);
    check(eng, 'Enter goes there and drops it; the other stays, and the keyboard stays on the list', (await pill()) === 'Added · 1' && (await rows()).map((r) => r.id).join() === '#v2' && (await names()) === '#v2' && (await p.evaluate(() => { const t = document.getElementById('v3').getBoundingClientRect().top; return t >= 0 && t < innerHeight; })));
    await p.keyboard.press('Escape');
    check(eng, 'Esc closes the list', !(await listOpen()));
    await p.mouse.click(5, 5);

    // ---- in view for a second ----
    await p.evaluate(() => scrollTo(0, 0));
    await p.evaluate(() => document.getElementById('v2').scrollIntoView({ block: 'center' }));
    await sleep(350);
    check(eng, 'in view for less than a second: still new', (await pill()) === 'Added · 1', await pill());
    check(eng, 'after a second in view it drops off', await until(async () => (await pill()) === '', 2500), await pill());
    check(eng, 'an id seen by being in view is kept', (await stored()).ids.some((n) => n[0] === 'v2'));

    // ---- what is not new ----
    await p.evaluate(() => scrollTo(0, 0));
    write('index.html', page({ b: 'The second block now says something else entirely.', c: false, end: sec('v1', 'Version one') + sec('v2', 'Version two') + sec('v3', 'Version three') }));
    await sleep(3000);
    check(eng, 'changed text and a removed id are not new', (await pill()) === '');
    write('index.html', page({ c: false, end: sec('v1', 'Version one') + sec('v2', 'Version two') + sec('v3', 'Version three') + '<p id=":r4:">made up</p><p id="0123456789abcdef0123">a hash</p><p id="radix-:r5:">radix</p><p id="css-1abc2de">css</p>' }));
    await sleep(3000);
    check(eng, 'ids a framework makes up (:r4:, a long hex, radix-:r5:, css-1abc2de) are not new', (await pill()) === '', await pill());
    write('index.html', page({ c: false, end: sec('v1', 'Version one') + sec('v2', 'Version two') + sec('v3', 'Version three') + '<p id="notes">The first words of this block are its label, cut where they get long, at sixty characters in all.</p>' }));
    await until(async () => (await pill()) === 'Added · 1');
    await click('.since-count');
    const long = (await rows())[0];
    check(eng, 'no heading: the label is its first words, 60 characters at most', long && long.id === '#notes' && long.label.length === 60 && long.label.endsWith('…') && /^The first words of this block/.test(long.label), JSON.stringify(long));

    // ---- going to each one clears the list ----
    await p.keyboard.press('Escape');
    write('index.html', page({ c: false, end: sec('v1', 'Version one') + sec('v2', 'Version two') + sec('v3', 'Version three') + '<p id="notes">notes</p>' + sec('v4', 'Version four') }));
    check(eng, 'something else new joins the list', await until(async () => (await pill()) === 'Added · 2'), await pill());
    await p.evaluate(() => document.activeElement?.blur?.());
    check(eng, 'nothing is open before the key', !(await listOpen()));
    await p.keyboard.press('a');
    check(eng, 'the a key opens the Added list', await until(listOpen, 1500));
    await p.keyboard.press('a');
    check(eng, 'a again goes to the first one, which drops off; the list stays for the next', await until(async () => (await pill()) === 'Added · 1' && (await rows()).length === 1 && (await listOpen()), 2000), await pill());
    await p.keyboard.press('a');
    check(eng, 'a again goes to the next; the list is empty and closed', await until(async () => (await pill()) === '' && !(await listOpen()), 2000), await pill());
    write('index.html', page({ c: false, end: sec('v1', 'Version one') + sec('v2', 'Version two') + sec('v3', 'Version three') + '<p id="notes">notes</p>' + sec('v4', 'Version four') + sec('v5', 'Version five') }));
    await until(async () => (await pill()) === 'Added · 1');
    await seeAll();
    check(eng, 'going to each one clears the pill and the list', (await pill()) === '' && (await rows()).length === 0, await pill());
    await p.reload();
    await sleep(2800);
    check(eng, 'seen stays clear after a reload', (await pill()) === '');
    await own.close();

    // ---- an id that turns up with no save of the file (the page's own script) is not new ----
    write('late.html', page());
    await sleep(2000); // the lab's file watcher has settled: no save of any file is still on its way to the page
    const ctx2 = await context();
    const N = await open(ctx2, '/late');
    await N.p.evaluate(() => {
      const e = document.createElement('p');
      e.id = 'from-script';
      e.textContent = 'made later';
      document.body.append(e);
      dispatchEvent(new StorageEvent('storage', { key: 'lab-looked:/late' })); // the widget looks again
    });
    await sleep(1500);
    check(eng, "an id the page's own script adds, with no save of the file: not new", (await N.pill()) === '');
    write('late.html', page({ end: sec('v1', 'Version one') }));
    check(eng, 'a save that adds a real one counts it', await until(async () => /^Added · \d$/.test(await N.pill()), 8000), await N.pill());
    await ctx2.close();

    // ---- a page with its own scripts reloads; the pill comes after the reload ----
    write('scripted.html', page({ script: '<script>document.title="one"</script>' }));
    const ctx3 = await context();
    const S = await open(ctx3, '/scripted');
    write('scripted.html', page({ script: '<script>document.title="two"</script>', end: sec('v1', 'Version one') }));
    check(eng, 'a page with scripts: the pill after its reload', await until(async () => (await S.pill()) === 'Added · 1'), await S.pill());
    await ctx3.close();

    // ---- the last look lives in the lab, under your name ----
    const lookOf = async (name, file) => (await (await fetch(`${B}/_lab/api/looked?name=${name}&page=/${file}`)).json()).ids;
    write('sync.html', page());
    const mac = await open(await context(), '/sync');
    const phone = await open(await context({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true }), '/sync');
    const mira = await open(await context(), '/sync', `mira-${eng}`);
    const nobody = await open(await context(), '/sync', '');
    const posted = [];
    nobody.p.on('request', (r) => r.method() === 'POST' && /\/_lab\/api\/looked/.test(r.url()) && posted.push(r.url()));
    check(eng, 'the first look reaches the lab, under the name', (await lookOf(ME, 'sync'))?.length === 6 && (await lookOf(ME, 'sync'))[0].length === 2);
    write('sync.html', page({ end: sec('v1', 'Version one') + sec('v2', 'Version two') }));
    await until(async () => (await mac.pill()) === 'Added · 2' && (await phone.pill()) === 'Added · 2' && (await mira.pill()) === 'Added · 2' && (await nobody.pill()) === 'Added · 2', 8000);
    check(eng, 'same name in a second browser: the same list', (await phone.rows()).map((r) => r.id).join() === (await mac.rows()).map((r) => r.id).join() && (await mac.pill()) === 'Added · 2', `${await mac.pill()} · ${await phone.pill()}`);
    const agentLine = async () => (await (await fetch(`${B}/_lab/agent/sync`)).text()).split('\n').filter((l) => /^unseen by /.test(l));
    const seenBy = await agentLine();
    check(eng, 'the agent text says what each name has not seen', seenBy.length === 2 && seenBy.includes(`unseen by ${ME}: #v1, #v2`) && seenBy.includes(`unseen by mira-${eng}: #v1, #v2`), seenBy.join(' | '));

    // On a phone the list is a small sheet at the bottom of the screen.
    await phone.click('.since-count');
    const sheet = await phone.shadow(() => { const s = r.querySelector('.since-panel'); const c = s.getBoundingClientRect(); return { fixed: getComputedStyle(s).position, left: Math.round(c.left), right: Math.round(c.right), bottom: Math.round(c.bottom), w: innerWidth, h: innerHeight, open: !s.hidden, coarse: matchMedia('(pointer: coarse)').matches }; });
    check(eng, 'on a phone the list is a sheet inside the screen, at its bottom', sheet.open && sheet.fixed === 'fixed' && sheet.left >= 0 && sheet.right <= sheet.w && sheet.bottom <= sheet.h && sheet.bottom > sheet.h - 40, JSON.stringify(sheet));
    await phone.click('.news-item');
    await sleep(400);
    check(eng, 'a tap on an item on the phone closes the sheet, goes there, and drops it', (!sheet.coarse || !(await phone.listOpen())) && (await phone.pill()) === 'Added · 1' && (await phone.p.evaluate(() => scrollY)) > 1000, `${await phone.pill()} coarse ${sheet.coarse}`);
    check(eng, "seen on the phone reaches the Mac with the same name, within a second or two; Mira's list is her own", (await until(async () => (await mac.pill()) === 'Added · 1', 4000)) && (await mira.pill()) === 'Added · 2', `${await mac.pill()} · ${await mira.pill()}`);
    await mac.seeAll();
    check(eng, 'seen on one clears the other', await until(async () => (await phone.pill()) === '', 3000), await phone.pill());
    check(eng, "another name keeps its list: Leo's seen leaves Mira's", (await mira.pill()) === 'Added · 2' && (await mira.rows()).length === 2);
    check(eng, 'and the agent text now says only Mira has unseen ids', (await agentLine()).length === 1 && (await agentLine())[0].startsWith(`unseen by mira-${eng}`), (await agentLine()).join(' | '));
    await phone.p.reload();
    await sleep(2500);
    check(eng, 'seen on the Mac stays clear on the phone after a reload', (await phone.pill()) === '');
    await nobody.seeAll();
    await sleep(500);
    check(eng, 'no name: the look stays in the browser, nothing is sent', (await nobody.pill()) === '' && posted.length === 0 && (await lookOf('', 'sync')) === undefined);
    for (const c of [mac, phone, mira, nobody]) await c.p.context().close();

    // The lab refuses the browser's requests for a while (down): seen holds, and is sent with the next check.
    write('down.html', page());
    const late = await context();
    const L2 = await open(late, '/down');
    await late.route('**/_lab/api/looked**', (r) => r.abort());
    write('down.html', page({ end: sec('v1', 'Version one') }));
    await until(async () => (await L2.pill()) === 'Added · 1', 6000);
    await L2.seeAll();
    await sleep(300);
    const held = await L2.stored();
    check(eng, 'lab down: seen holds, and waits to be sent', (await L2.pill()) === '' && held.dirty === 1 && (await lookOf(ME, 'down')).length === 6, `${held.dirty} ${(await lookOf(ME, 'down')).length}`);
    await late.unroute('**/_lab/api/looked**');
    write('down.html', page({ end: sec('v1', 'Version one') + sec('v2', 'Version two') }));
    await sleep(3000);
    check(eng, 'and goes to the lab with the next check, once; the next new one is still new', (await lookOf(ME, 'down')).length === 7 && !(await L2.stored()).dirty && (await L2.pill()) === 'Added · 1', `${(await lookOf(ME, 'down')).length} ids in the lab, badge ${await L2.pill()}`);
    await late.close();

    // A look from before ids (blocks of text, or the first build's plain list) is not "no ids seen": the page's ids now count as seen, nothing floods.
    write('old.html', page({ end: sec('v1', 'Version one') }));
    const ctx7 = await context();
    const O = await open(ctx7, '/old', ME, (pg) => pg.addInitScript(() => localStorage.getItem('lab-looked:/old') || localStorage.setItem('lab-looked:/old', JSON.stringify({ at: 5, files: 'x', blocks: ['Plan', 'Old words'] }))));
    await sleep(1200);
    const cached = await O.stored();
    check(eng, 'an old look (blocks of text) is replaced by the ids now on the page, and nothing is new', (await O.pill()) === '' && Array.isArray(cached.ids) && cached.ids.some((n) => n[0] === 'v1') && (await lookOf(ME, 'old'))?.some((n) => n[0] === 'v1'), `${await O.pill()} ${cached.ids?.length}`);
    await ctx7.close();
    const ctx8 = await context();
    const O2 = await open(ctx8, '/old', ME, (pg) => pg.addInitScript(() => localStorage.setItem('lab-looked:/old', JSON.stringify(['Plan', 'Old list']))));
    await sleep(1500);
    check(eng, "the first build's plain list reads the same way", (await O2.pill()) === '');
    await ctx8.close();

    // ---- the flag off (the other lab, no sinceLooked in its labit.json): no pill, nothing kept ----
    const ctx6 = await context();
    fs.writeFileSync(path.join(OFF_DIR, 'flagoff.html'), page());
    const F = await open(ctx6, '/flagoff', ME, () => {}, false, OFF);
    const asked = [];
    F.p.on('request', (r) => /\/_lab\/api\/looked/.test(r.url()) && asked.push(r.url()));
    fs.writeFileSync(path.join(OFF_DIR, 'flagoff.html'), page({ end: sec('v1', 'Version one') }));
    await sleep(3000);
    check(eng, 'sinceLooked off: no pill, nothing kept, no requests', (await F.pill()) === '' && (await F.p.evaluate(() => localStorage.getItem('lab-looked:/flagoff'))) === null && asked.length === 0);
    await ctx6.close();
    await browser.close();
  }
} finally {
  server.kill();
  offServer.kill();
  fs.rmSync(DIR, { recursive: true, force: true });
  fs.rmSync(OFF_DIR, { recursive: true, force: true });
}
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
