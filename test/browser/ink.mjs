// Ink on selected words (src/widget/ink.ts) in real browsers: Safari's engine (WebKit) and Chrome's. A comment on
// selected words shows no pin; the words carry its state as a band under the lower part of each line. The band is the
// browser's own (a highlight per state, painted as a thick underline), so what is checked is which words each state's
// highlight holds, the rules it is painted by, and the pixels under the words.
// Not part of `npm test`; CI runs it in the `browser` job. Run: node test/browser/ink.mjs   (needs playwright;
// NODE_PATH can point at a node_modules that has it; ENGINES=webkit,chromium picks the engines).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (eng, name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${eng.padEnd(8)} ${name}${detail ? ` (${detail})` : ''}`);
};

// A page made to be inked: words in a plain paragraph, with a link, in table cells, in two paragraphs, in a box that
// scrolls, in sticky content, right to left, and sixty short paragraphs for the busy case.
const rows = Array.from({ length: 60 }, (_, i) => `<p id="n${i}">note ${i} has a few words to mark</p>`).join('');
const PAGE = `<!doctype html><meta charset="utf-8"><title>Ink</title><style>
body{margin:30px;font:18px/1.5 Georgia,serif;width:640px} td{padding:0 40px 0 0} #a{width:420px} #box{height:56px;width:260px;overflow:auto;border:1px solid #ccc}
#stk{position:sticky;top:20px;background:#fff;width:300px} #tall{height:900px} ::selection{background-color:rgb(0,0,255)}
</style><body>
<p id="a">Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau</p>
<p id="lnk">one two <a href="#clicked" id="lk">linked words</a> three four</p>
<table><tr><td id="c1">cell one words</td><td id="c2">cell two words</td></tr></table>
<p id="p1">first paragraph here</p><p id="p2">second paragraph here</p>
<div id="box"><p id="bp">box line one is here and goes on past the edge so it wraps onto a second line and then a third line and a fourth line of words to scroll through</p></div>
<div id="stk">sticky words stay here</div>
<p id="rt" dir="rtl">كلمات عربية قصيرة هنا</p>
<p id="long">w000x w001x w002x w003x w004x w005x w006x w007x w008x w009x w010x w011x w012x w013x w014x w015x w016x w017x w018x w019x w020x w021x w022x w023x w024x w025x w026x w027x w028x w029x w030x w031x w032x w033x w034x w035x w036x w037x w038x w039x w040x w041x w042x w043x w044x w045x w046x w047x w048x w049x w050x w051x w052x w053x w054x w055x w056x w057x w058x w059x w060x w061x w062x w063x w064x w065x w066x w067x w068x w069x w070x w071x w072x w073x w074x w075x w076x w077x w078x w079x w080x w081x w082x w083x w084x w085x w086x w087x w088x w089x</p>
<div id="tall"></div><div id="rows">${rows}</div></body>`;

const PAGE_TEXT = {
  a: 'Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau',
  lnk: 'one two linked words three four', p1: 'first paragraph here', p2: 'second paragraph here', rt: 'كلمات عربية قصيرة هنا',
  bp: 'box line one is here and goes on past the edge so it wraps onto a second line and then a third line and a fourth line of words to scroll through',
  c1: 'cell one words', c2: 'cell two words', stk: 'sticky words stay here',
  long: 'w000x w001x w002x w003x w004x w005x w006x w007x w008x w009x w010x w011x w012x w013x w014x w015x w016x w017x w018x w019x w020x w021x w022x w023x w024x w025x w026x w027x w028x w029x w030x w031x w032x w033x w034x w035x w036x w037x w038x w039x w040x w041x w042x w043x w044x w045x w046x w047x w048x w049x w050x w051x w052x w053x w054x w055x w056x w057x w058x w059x w060x w061x w062x w063x w064x w065x w066x w067x w068x w069x w070x w071x w072x w073x w074x w075x w076x w077x w078x w079x w080x w081x w082x w083x w084x w085x w086x w087x w088x w089x',
};
const textOf = (el) => PAGE_TEXT[el] ?? `note ${el.slice(1)} has a few words to mark`;
// What the widget saves for words someone selected: where, and the words with a little either side.
const words = (el, text, extra = {}) => {
  const all = textOf(el);
  const i = all.indexOf(text);
  return { kind: 'text', selector: `#${el}`, x: 0.5, y: 0.5, docX: 0.3, docY: 100, width: 1000, text: all,
    element: `<${/^c\d$/.test(el) ? 'td' : el === 'stk' ? 'div' : 'p'} id="${el}"`,
    quote: { exact: text, prefix: all.slice(Math.max(0, i - 40), i), suffix: all.slice(i + text.length, i + text.length + 40), selected: true }, ...extra };
};

// One lab on its own folder and port, with the labit.json it is given.
async function lab(settings) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'labit-ink-'));
  fs.writeFileSync(path.join(dir, 'index.html'), PAGE);
  fs.writeFileSync(path.join(dir, 'dark.html'), PAGE.replace('body{margin:30px;', 'body{background:#111;color:#eee;margin:30px;'));
  if (settings) fs.writeFileSync(path.join(dir, 'labit.json'), JSON.stringify(settings));
  const port = String(5500 + Math.floor(Math.random() * 400));
  const env = { ...process.env, PORT: '', XDG_CONFIG_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'labit-cfg-')), LABIT_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'labit-home-')), LABIT_NO_UPDATE_CHECK: '1' };
  const server = spawn(process.execPath, [LAB, '.', '--new', '--no-open', '--port', port], { cwd: dir, env });
  const base = `http://localhost:${port}`;
  for (let i = 0; i < 80; i++) {
    try {
      await fetch(base + '/');
      break;
    } catch {
      await sleep(100);
    }
  }
  const admin = () => JSON.parse(fs.readFileSync(path.join(dir, '.lab/server.json'), 'utf8')).agent;
  const call = (body, agent) =>
    fetch(`${base}/_lab/api/comments`, { method: 'POST', headers: { 'content-type': 'application/json', origin: base, ...(agent ? { 'x-lab-admin': admin(), 'x-lab-agent': '1' } : { 'x-lab-admin': admin() }) }, body: JSON.stringify(body) }).then((r) => r.json());
  const page = '/index';
  return {
    base, dir, page,
    // Your own note (tester is the name the browser uses: never "new").
    say: async (anchor, text = 'note', on = page) => (await call({ page: on, name: 'tester', text, anchor })).comment,
    // The agent's word on a thread.
    // (a moment after the note: an answer in the same millisecond would not count as later)
    reply: async (id, text, intent) => (await sleep(20), await call({ page, parent: id, name: 'Claude', text, ...(intent ? { intent } : {}) }, true)).comment,
    resolve: (id) => call({ page, action: 'resolve', id }, true),
    drop: (id) => call({ page, action: 'delete', id }, true),
    clear: async () => {
      for (const on of [page, '/dark'])
        for (const c of (await (await fetch(`${base}/_lab/api/comments?page=${on}`)).json()).comments) if (!c.parent) await call({ page: on, action: 'delete', id: c.id }, true);
    },
    read: async () => (await (await fetch(`${base}/_lab/api/comments?page=${page}`)).json()).comments,
    stop: () => (server.kill(), fs.rmSync(dir, { recursive: true, force: true })),
  };
}

// What the page shows of the ink and the pins: each state's highlight and the words in it, and the pins from the
// widget's shadow root (a pin on inked words is there, unseen: no face, no box, no clicks of its own).
const look = (p) =>
  p.evaluate(() => {
    const r = [...document.querySelectorAll('*')].find((n) => n.shadowRoot?.querySelector('.scrim'))?.shadowRoot;
    const html = document.documentElement;
    return {
      inks: [...CSS.highlights].filter(([k]) => k.startsWith('lab-ink-')).flatMap(([k, h]) => [...h].map((range) => ({ st: k.slice(8), text: String(range).replace(/\s+/g, ' ').trim() }))),
      quote: [...(CSS.highlights.get('lab-quote') || [])].map((range) => String(range).replace(/\s+/g, ' ').trim()),
      pins: [...r.querySelectorAll('button.pin')].map((b) => {
        const s = getComputedStyle(b);
        return { label: b.getAttribute('aria-label'), ink: b.classList.contains('on-ink'), seen: !/rgba\(0, 0, 0, 0\)|transparent/.test(s.backgroundColor), taps: s.pointerEvents !== 'none', news: b.classList.contains('new'), dot: getComputedStyle(b, '::after').content !== 'none', open: b.classList.contains('open') };
      }),
      draftPin: r.querySelector('.pin.draft') ? getComputedStyle(r.querySelector('.pin.draft')).visibility : null,
      card: r.querySelector('.card')?.textContent || '',
      html: html.className.split(' ').filter((c) => c.startsWith('lab-ink')),
      beat: getComputedStyle(html).animationName,
    };
  });
// The rules a state's band is painted by, as the browser computed them for the words in #id.
const rules = (p, id, name) =>
  p.evaluate(([id, name]) => {
    const s = getComputedStyle(document.getElementById(id), name);
    return { line: s.textDecorationLine, color: s.textDecorationColor, thick: s.textDecorationThickness, bg: s.backgroundColor };
  }, [id, name]);

// A PNG's pixels (8 bits a channel, as both engines' screenshots are).
function pixels(buf) {
  let [o, w, h, bpp] = [8, 0, 0, 4];
  const idat = [];
  while (o < buf.length) {
    const len = buf.readUInt32BE(o);
    const type = buf.toString('latin1', o + 4, o + 8);
    const data = buf.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') [w, h, bpp] = [data.readUInt32BE(0), data.readUInt32BE(4), data[9] === 6 ? 4 : 3];
    if (type === 'IDAT') idat.push(data);
    o += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const row = w * bpp;
  const px = Buffer.alloc(row * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < row; x++) {
      const a = x >= bpp ? px[y * row + x - bpp] : 0;
      const b = y ? px[(y - 1) * row + x] : 0;
      const c = x >= bpp && y ? px[(y - 1) * row + x - bpp] : 0;
      const [pa, pb, pc] = [Math.abs(b - c), Math.abs(a - c), Math.abs(a + b - 2 * c)];
      px[y * row + x] = (raw[y * (row + 1) + 1 + x] + [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][raw[y * (row + 1)]]) & 255;
    }
  return Array.from({ length: h }, (_, y) => [...px.subarray(y * row, y * row + 3)]);
}
// The space between two words of #id (the character `i` into `text`, found in the element's text): where it is on screen.
const gap = (p, id, text, i = text.length) =>
  p.evaluate(([id, text, i]) => {
    const walk = document.createTreeWalker(document.getElementById(id), NodeFilter.SHOW_TEXT);
    for (let t; (t = walk.nextNode()); ) {
      const at = t.data.indexOf(text);
      if (at < 0) continue;
      const r = document.createRange();
      r.setStart(t, at + i);
      r.setEnd(t, at + i + 1);
      const b = r.getBoundingClientRect();
      return { x: b.left + b.width / 2, t: b.top, h: b.height };
    }
    return null;
  }, [id, text, i]);
// What is painted in that space, from the top of the line box to its foot: where the band starts and how much of the
// line it takes (as shares of the box), and its colour. No glyph is there, so what isn't the page's colour is ink.
async function band(p, at) {
  const col = pixels(await p.screenshot({ clip: { x: Math.round(at.x), y: Math.floor(at.t), width: 1, height: Math.ceil(at.h) + 3 } }));
  const bg = col[0];
  // The longest run of rows that aren't the page's colour; a lone row is a serif of the next letter, not ink.
  let [from, rows] = [0, 0];
  for (let y = 0, start = -1; y <= col.length; y++) {
    const on = y < col.length && col[y].some((v, k) => Math.abs(v - bg[k]) > 6);
    if (on && start < 0) start = y;
    if (!on && start >= 0) {
      if (y - start > rows) [from, rows] = [start, y - start];
      start = -1;
    }
  }
  if (rows < 2) rows = 0;
  return { rows, from: rows ? from / at.h : 1, share: rows / at.h, rgb: rows ? col[from + Math.floor(rows / 2)] : bg, bg };
}
const low = (b) => b.from > 0.35 && b.share > 0.25 && b.share < 0.65; // the lower part of the line, not all of it
const green = (b) => b.rgb[1] > b.rgb[0] + 8 && b.rgb[1] > b.rgb[2] + 8;
const amber = (b) => b.rgb[0] > b.rgb[1] + 8 && b.rgb[1] > b.rgb[2] + 8;
const say = (b) => `from ${b.from.toFixed(2)}, ${b.rows} rows (${b.share.toFixed(2)}), rgb ${b.rgb} on ${b.bg}`;

const rect = (p, sel) => p.$eval(sel, (e) => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, r: b.right, b: b.bottom }; });
const engines = (process.env.ENGINES || 'webkit,chromium').split(',');
const L = await lab({ flags: { inkOnText: true } });
const OFF = await lab();
// "color(srgb 0.14 0.63 0.27 / 0.3)" or "rgba(36, 160, 70, 0.3)" → the alpha.
const alpha = (s) => {
  const n = (s.match(/-?[\d.]+(?:e-?\d+)?/g) || []).map(Number);
  return n[3] ?? 1;
};
const clear = (c) => /rgba\(0, 0, 0, 0\)|transparent|\/ 0\)/.test(c);
const sel = (p, id, from, to) =>
  p.evaluate(([id, from, to]) => {
    const t = document.getElementById(id).firstChild.nodeType === 3 ? document.getElementById(id).firstChild : document.getElementById(id).lastChild;
    const r = document.createRange();
    const i = t.data.indexOf(from);
    r.setStart(t, i);
    r.setEnd(t, i + to.length + (from === to ? 0 : t.data.indexOf(to) - i));
    getSelection().removeAllRanges();
    getSelection().addRange(r);
  }, [id, from, to]);
// Opens a fresh page in a context (the name the notes were written under).
async function open(browser, url, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 }, ...opts });
  await ctx.addInitScript(() => localStorage.setItem('lab-name', 'tester'));
  const p = await ctx.newPage();
  await p.goto(url);
  await sleep(1200);
  return [ctx, p];
}
const shadow = (p, fn, arg) => p.evaluate(([f, a]) => new Function('r', 'a', f)([...document.querySelectorAll('*')].find((n) => n.shadowRoot?.querySelector('.scrim')).shadowRoot, a), [fn.toString().replace(/^[^{]*{|}$/g, ''), arg]);
// The middle of a word of #id, to point at or click.
const word = async (p, id, text) => { const g = await gap(p, id, text, 1); return [g.x, g.t + g.h / 2]; };

try {
  for (const eng of engines) {
    const browser = await pw[eng].launch();
    await L.clear();

    // ---- Seed: one note in each state, a clicked word, and a read done one
    await L.say(words('a', 'delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi'), 'sent');
    const working = await L.say(words('p1', 'paragraph here'), 'working');
    await L.reply(working.id, 'on it', 'working');
    const asks = await L.say(words('p2', 'second paragraph'), 'asks');
    await L.reply(asks.id, 'here is a plain answer');
    const asked = await L.say(words('lnk', 'one two'), 'asked');
    await L.reply(asked.id, 'which one do you mean?', 'question'); // a question is one the agent marks (--question)
    const kept = await L.say(words('c1', 'cell one'), 'kept');
    await L.reply(kept.id, 'changed it', 'done');
    await L.resolve(kept.id);
    const done = await L.say(words('c2', 'cell two'), 'done');
    await L.resolve(done.id);
    await L.say({ ...words('a', 'Alpha'), quote: { exact: 'Alpha', prefix: '', suffix: 'beta gamma' } }, 'one word');
    const [ctx, p] = await open(browser, L.base + '/');
    // The "done" one is read; the "kept" one has the agent's reply nobody opened yet.
    const v = await look(p);
    const st = (w, text) => w.inks.find((i) => i.text.startsWith(text))?.st;
    const inked = v.pins.filter((x) => x.ink);
    check(eng, 'selected words: ink, their pins unseen; a clicked word keeps its pin', v.inks.length === 6 && inked.length === 6 && inked.every((x) => !x.seen && !x.taps) && v.pins.filter((x) => !x.ink).length === 1 && v.pins.find((x) => !x.ink).seen, `${v.inks.length} inks, ${JSON.stringify(v.pins.map((x) => [x.ink, x.seen, x.taps]))}`);
    const sentBand = await band(p, await gap(p, 'a', 'epsilon'));
    check(eng, 'the band is painted under the lower part of the line, in the pins\' green', low(sentBand) && green(sentBand), say(sentBand));
    const off = await band(p, await gap(p, 'a', 'sigma'));
    check(eng, 'no ink beside the words', off.rows === 0, say(off));
    const sent = await rules(p, 'a', '::highlight(lab-ink-next)');
    check(eng, 'sent: an underline half a letter thick, 30% green on a light page', st(v, 'delta epsilon') === 'next' && /underline/.test(sent.line) && Math.abs(parseFloat(sent.thick) - 9) < 0.6 && Math.abs(alpha(sent.color) - 0.3) < 0.03, JSON.stringify(sent));
    check(eng, 'working: its own highlight, and the page beats while it works', st(v, 'paragraph here') === 'now' && v.html.includes('lab-ink-live') && v.beat === 'lab-ink-pulse', `${st(v, 'paragraph here')} ${v.html} ${v.beat}`);
    const askBand = await band(p, await gap(p, 'p2', 'second'));
    check(eng, 'asks: amber, for a plain answer not read yet and for a question', st(v, 'second paragraph') === 'asks' && st(v, 'one two') === 'asks' && low(askBand) && amber(askBand), `${st(v, 'second paragraph')} ${st(v, 'one two')} ${say(askBand)}`);
    const keptBand = await band(p, await gap(p, 'c1', 'cell'));
    check(eng, 'unread done is a green band', st(v, 'cell one') === 'kept' && low(keptBand) && green(keptBand), say(keptBand));
    const doneBand = await band(p, await gap(p, 'c2', 'cell'));
    const hair = await rules(p, 'c2', '::highlight(lab-ink-done)');
    check(eng, 'read done is a hairline at the foot, faint, with "show done" off too', st(v, 'cell two') === 'done' && hair.thick === '2px' && doneBand.rows > 0 && doneBand.rows <= 3 && doneBand.from > 0.6, `${JSON.stringify(hair)} ${say(doneBand)}`);

    // ---- A word in a link keeps its seam out of the band
    {
      const c = await L.say(words('lnk', 'two linked words three'), 'link');
      await sleep(1200);
      const [before, after] = [await band(p, await gap(p, 'lnk', 'two')), await band(p, await gap(p, 'lnk', ' three', 0))];
      check(eng, 'no seam at a link: the band runs through the spaces either side', low(before) && low(after), `${say(before)} | ${say(after)}`);
      await L.drop(c.id);
      await sleep(600);
    }

    // ---- Click, selection, link
    const first = await word(p, 'a', 'epsilon');
    await p.mouse.move(...first);
    await sleep(300);
    const over = await look(p);
    const hand = await p.evaluate(() => getComputedStyle(document.getElementById('a')).cursor);
    check(eng, 'pointing at inked words: a hand, and the words light up faintly', over.html.includes('lab-ink-over') && hand === 'pointer' && over.quote.some((q) => q.startsWith('delta epsilon')), `${over.html} ${hand} ${JSON.stringify(over.quote)}`);
    await p.mouse.move(900, 600);
    await sleep(300);
    const away = await look(p);
    check(eng, 'pointing away: the page\'s own pointer, nothing lit', !away.html.includes('lab-ink-over') && away.quote.length === 0, `${away.html} ${JSON.stringify(away.quote)}`);
    await p.mouse.click(...first);
    await sleep(400);
    check(eng, 'a click opens the thread', (await look(p)).card.includes('sent'));
    await p.keyboard.press('Escape');
    await sleep(300);
    // With words selected over the ink, a click is for the selection.
    await p.keyboard.down('Shift'); // the page lets words be selected while Shift is down
    await sel(p, 'a', 'delta', 'delta');
    await p.evaluate(([x, y]) => document.elementFromPoint(x, y).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, button: 0 })), first);
    await sleep(300);
    check(eng, 'with words selected a click opens nothing', !(await look(p)).card);
    await p.evaluate(() => getSelection().removeAllRanges());
    await p.keyboard.up('Shift');
    // Selecting words while commenting shows the ink they will get: the sent band, from the page's own selection,
    // whose usual paint is clear then. Off comment mode the page's selection is its own.
    {
      await p.evaluate(() => document.documentElement.classList.add('lab-shift'));
      await sel(p, 'long', 'w001x', 'w004x');
      await sleep(200);
      const [own, drawn] = [await rules(p, 'long', '::selection'), await band(p, await gap(p, 'long', 'w002x'))];
      check(eng, 'selecting while commenting: the page\'s paint is clear, the words wear the sent band', clear(own.bg) && /underline/.test(own.line) && low(drawn) && green(drawn), `${JSON.stringify(own)} ${say(drawn)}`);
      await p.evaluate(() => document.documentElement.classList.remove('lab-pinning'));
      const plain = await rules(p, 'long', '::selection');
      check(eng, 'off comment mode the page keeps its own selection, no band', /0, 0, 255/.test(plain.bg) && !/underline/.test(plain.line), JSON.stringify(plain));
      await p.evaluate(() => (getSelection().removeAllRanges(), document.documentElement.classList.add('lab-pinning'), document.documentElement.classList.remove('lab-shift')));
    }
    const c3 = await L.say(words('lnk', 'two linked words three'), 'link');
    await sleep(1200);
    const lk = await rect(p, '#lk');
    await p.mouse.click(lk.x + lk.w / 2, lk.y + lk.h / 2);
    await sleep(400);
    check(eng, 'a link inside keeps its click', (await p.evaluate(() => location.hash)) === '#clicked' && !(await look(p)).card);
    await L.drop(c3.id);

    // ---- Keyboard: the pin, unseen at the end of the words, takes Tab and shows itself
    await p.evaluate(() => (location.hash = '', document.activeElement?.blur(), scrollTo(0, 0)));
    let reached = null;
    for (let i = 0; i < 80 && !reached; i++) {
      await p.keyboard.press('Tab');
      reached = await shadow(p, () => { const el = r.activeElement; return el?.classList.contains('on-ink') ? { label: el.getAttribute('aria-label'), bg: getComputedStyle(el).backgroundColor } : null; });
    }
    check(eng, 'Tab reaches the pin of inked words; it shows while it has the focus', Boolean(reached) && /^comment/.test(reached.label) && !clear(reached.bg), JSON.stringify(reached));
    await p.keyboard.press('Enter');
    await sleep(400);
    check(eng, 'Enter opens the thread', Boolean((await look(p)).card));
    await p.keyboard.press('Escape');
    await sleep(300);

    // ---- A new reply: the pin's dot shows, alone
    const vq = await look(p);
    const dots = vq.pins.filter((x) => x.ink && x.news);
    check(eng, 'new reply: a dot at the end of the words, the pin still unseen', dots.length >= 2 && dots.every((x) => x.dot && !x.seen), JSON.stringify(vq.pins.map((x) => [x.news, x.dot, x.seen])));
    // Read, a plain answer rests; the question still asks.
    await p.evaluate(() => scrollTo(0, 0));
    await p.mouse.click(...(await word(p, 'p2', 'second')));
    await sleep(500);
    await p.keyboard.press('Escape');
    await sleep(500);
    const after = await look(p);
    check(eng, 'a read, plain answer rests; the question asks on', st(after, 'second paragraph') === 'rest' && st(after, 'one two') === 'asks', `${st(after, 'second paragraph')} ${st(after, 'one two')}`);
    // Comments hidden: no ink, and the words are the page's again.
    await p.keyboard.press('m');
    await sleep(500);
    const hidden = await look(p);
    const none = await band(p, await gap(p, 'a', 'epsilon'));
    await p.mouse.move(...first);
    await sleep(200);
    check(eng, 'comments hidden: no ink, no hand', hidden.inks.length === 0 && none.rows === 0 && !(await look(p)).html.includes('lab-ink-over'), `${hidden.inks.length} inks, ${say(none)}`);
    await ctx.close();

    // ---- A hairline and the states survive a reload
    {
      const [c2, q] = await open(browser, L.base + '/');
      const r2 = await look(q);
      check(eng, 'a done hairline is there after a reload', st(r2, 'cell two') === 'done' && r2.inks.length === 6, `${r2.inks.length} inks`);
      // A note arriving while the page is open is inked without a reload.
      const fresh = await L.say(words('a', 'Alpha beta gamma'), 'fresh');
      await sleep(1200);
      check(eng, 'a note that arrives while open is inked', st(await look(q), 'Alpha beta gamma') === 'next');
      await L.drop(fresh.id);
      await c2.close();
    }

    // ---- Words removed: no ink, the note is off the page in the ⋯ menu ("moved · 1", as any pin whose spot is gone); restored: ink again
    {
      const [c2, q] = await open(browser, L.base + '/');
      await q.evaluate(() => { const e = document.getElementById('p1'); window.__p1 = e; e.replaceWith(document.createComment('gone')); });
      await sleep(1500);
      const gone = await look(q);
      const movedBtn = await q.evaluate(() => [...document.querySelectorAll('*')].find((n) => n.shadowRoot?.querySelector('.scrim')).shadowRoot.querySelector('.moved-btn')?.textContent);
      check(eng, 'words removed: no ink, the ⋯ menu lists it as moved', movedBtn === 'moved · 1' && !st(gone, 'paragraph here'), `${movedBtn} ${JSON.stringify(gone.inks)}`);
      await q.evaluate(() => { const c = [...document.body.childNodes].find((n) => n.nodeType === 8 && n.data === 'gone'); c.replaceWith(window.__p1); });
      await sleep(1500);
      const back = await look(q);
      check(eng, 'words restored: ink again', st(back, 'paragraph here') === 'now' && back.pins.filter((x) => !x.ink).length === 1);
      // The words rewritten in place (the element stays): the pin shows again, by itself.
      await q.evaluate(() => { document.getElementById('c2').textContent = 'something else'; dispatchEvent(new Event('resize')); });
      await sleep(1500);
      const rewritten = await look(q);
      check(eng, 'words rewritten: no ink, the pin is back', !st(rewritten, 'cell two') && rewritten.pins.filter((x) => !x.ink && x.seen).length === 2, JSON.stringify(rewritten.pins.map((x) => [x.ink, x.seen])));
      await c2.close();
    }

    // ---- Two cells, two paragraphs, a box that scrolls, sticky words, right to left: the browser's work, no code of ours
    {
      await L.clear();
      await L.say(words('c1', 'cell one words', { quote: { exact: 'cell one words cell two words', prefix: '', suffix: '', selected: true } }), 'two cells');
      await L.say(words('p1', 'paragraph here', { quote: { exact: 'paragraph here second paragraph', prefix: 'first', suffix: 'here', selected: true } }), 'two paragraphs');
      await L.say(words('bp', 'box line one is here and goes on past the edge so it wraps onto a second line and then a third line and a fourth'), 'box');
      await L.say(words('stk', 'sticky words stay'), 'sticky');
      await L.say(words('rt', 'كلمات عربية'), 'rtl');
      const [c2, q] = await open(browser, L.base + '/');
      const w = await look(q);
      const [in1, in2] = [await band(q, await gap(q, 'c1', 'cell')), await band(q, await gap(q, 'c2', 'cell'))];
      const c1 = await rect(q, '#c1');
      const gutter = await band(q, { x: c1.r - 20, t: c1.y, h: c1.h });
      check(eng, 'two cells: a band in each, none across the gutter', w.inks.length === 5 && low(in1) && low(in2) && gutter.rows === 0, `${say(in1)} | ${say(in2)} | gutter ${gutter.rows}`);
      const [r1, r2] = [await rect(q, '#p1'), await rect(q, '#p2')];
      const [pa, pb] = [await band(q, await gap(q, 'p1', 'paragraph')), await band(q, await gap(q, 'p2', 'second'))];
      const between = await band(q, { x: r1.x + 40, t: r1.b + 2, h: r2.y - r1.b - 4 });
      check(eng, 'two paragraphs: bands in both, none between', low(pa) && low(pb) && between.rows === 0, `${say(pa)} | ${say(pb)} | between ${between.rows}`);
      const box = await rect(q, '#box');
      // Its inked lines run on below what the box shows: nothing of them is painted on the lines under the box.
      const rt = await rect(q, '#rt');
      const [inBox, under, lower] = [await band(q, await gap(q, 'bp', 'line')), await band(q, await gap(q, 'stk', 'stay')), await band(q, { x: box.x + 60, t: rt.y, h: rt.h })];
      check(eng, 'scroll box: ink inside it, none under it', low(inBox) && under.rows === 0 && lower.rows === 0, `${say(inBox)} | under ${under.rows}, ${lower.rows}`);
      const rtl = await band(q, await gap(q, 'rt', 'كلمات'));
      check(eng, 'right to left: inked', st(w, 'كلمات') === 'next' && rtl.rows > 0, say(rtl));
      await q.evaluate(() => scrollTo(0, 400));
      await sleep(600);
      const stuck = await band(q, await gap(q, 'stk', 'sticky'));
      check(eng, 'sticky words: the ink stays on them as the page scrolls', low(stuck) && green(stuck), say(stuck));
      await c2.close();
    }

    // ---- Reduced motion: nothing beats
    {
      const w0 = await L.say(words('a', 'Alpha beta gamma'), 'fresh');
      await L.reply(w0.id, 'on it', 'working');
      const [c2, q] = await open(browser, L.base + '/', { reducedMotion: 'reduce' });
      const w = await look(q);
      check(eng, 'reduced motion: working is inked, the page does not beat', st(w, 'Alpha beta gamma') === 'now' && !w.html.includes('lab-ink-live') && w.beat === 'none', `${w.html} ${w.beat}`);
      await L.drop(w0.id);
      await c2.close();
    }

    // ---- A dark page: the stronger set, by the page's own text colour, not the computer's setting
    {
      await L.clear();
      await L.say(words('a', 'gamma delta epsilon'), 'on dark', '/dark');
      await L.say(words('a', 'gamma delta epsilon'), 'on light');
      const [c2, q] = await open(browser, L.base + '/dark', { colorScheme: 'light' });
      const [onDark, darkRule, darkBand] = [await look(q), await rules(q, 'a', '::highlight(lab-ink-next)'), await band(q, await gap(q, 'a', 'gamma'))];
      const [c3, q3] = await open(browser, L.base + '/', { colorScheme: 'dark' });
      const [onLight, lightRule] = [await look(q3), await rules(q3, 'a', '::highlight(lab-ink-next)')];
      check(eng, 'light or dark follows the page, not the computer', onDark.html.includes('lab-ink-dk') && !onLight.html.includes('lab-ink-dk') && Math.abs(alpha(darkRule.color) - 0.45) < 0.03 && Math.abs(alpha(lightRule.color) - 0.3) < 0.03, `dark ${darkRule.color}, light ${lightRule.color}`);
      check(eng, 'a dark page: the band is painted, green', low(darkBand) && green(darkBand), say(darkBand));
      await c2.close();
      await c3.close();
    }

    // ---- Real flow: select words (the dialog opens at once; the words wear the draft's grey band), type, send: the sent
    // note is green ink, saved as selected words
    {
      await L.clear();
      const [c2, q] = await open(browser, L.base + '/');
      await q.keyboard.down('Shift');
      await sel(q, 'a', 'gamma delta', 'gamma delta');
      await q.evaluate(() => document.dispatchEvent(new MouseEvent('mouseup', { shiftKey: true, button: 0, bubbles: true })));
      await q.keyboard.up('Shift');
      await sleep(600);
      const d = await look(q);
      const grey = await band(q, await gap(q, 'a', 'gamma'));
      check(eng, 'selecting words: the words wear the draft band, no pin', st(d, 'gamma delta') === 'draft' && d.pins.length === 0 && d.draftPin !== 'visible' && low(grey) && !green(grey), `${JSON.stringify(d.inks)} ${d.pins.length} pins, draft pin ${d.draftPin}, ${say(grey)}`);
      check(eng, 'the draft\'s words wear one band: the quote\'s green stays off them', d.quote.length === 0, JSON.stringify(d.quote));
      await q.keyboard.type('a note on words');
      await q.keyboard.press('Enter');
      await sleep(1000);
      const saved = (await L.read())[0];
      const w = await look(q);
      check(eng, 'sent: green ink, the pin unseen, saved as selected words', saved?.anchor.quote.selected === true && w.inks.length === 1 && w.inks[0].st === 'next' && w.pins.length === 1 && !w.pins[0].seen, JSON.stringify(saved?.anchor.quote));
      await c2.close();
    }

    // ---- With ink on, the page's text stays selectable (Safari paints a highlight wrongly on text that can't be), so
    // a plain drag must still select nothing: it marks an area, as with ink off.
    {
      await L.clear();
      const [c2, q] = await open(browser, L.base + '/');
      const from = await word(q, 'a', 'gamma');
      const to = await word(q, 'lnk', 'three');
      await q.mouse.move(...from);
      await q.mouse.down();
      await q.mouse.move(from[0] + 40, from[1] + 10, { steps: 4 });
      await q.mouse.move(...to, { steps: 8 });
      await sleep(150);
      const picked = await q.evaluate(() => String(getSelection()));
      const zone = await shadow(q, () => { return Boolean(r.querySelector('.zone')); });
      await q.mouse.up();
      await sleep(300);
      check(eng, 'a plain drag selects no words: it marks an area', picked === '' && zone, `selected "${picked}", area ${zone}`);
      await q.keyboard.press('Escape');
      await c2.close();
    }

    // ---- A real Shift-drag with the mouse: the band shows while dragging (the selection's), and once let go the words
    // keep the low band (the draft's grey), with no full-height green on them.
    {
      await L.clear();
      const [c2, q] = await open(browser, L.base + '/');
      const at = await q.evaluate(() => {
        const t = document.getElementById('a').firstChild;
        const r = document.createRange();
        const box = (from, to) => (r.setStart(t, from), r.setEnd(t, to), r.getBoundingClientRect());
        const [g, d] = [box(t.data.indexOf('gamma'), t.data.indexOf('gamma') + 1), box(t.data.indexOf('delta') + 4, t.data.indexOf('delta') + 5)];
        return [g.left + 1, g.top + g.height / 2, d.right - 1, d.top + d.height / 2];
      });
      await q.keyboard.down('Shift');
      await q.mouse.move(at[0], at[1]);
      await q.mouse.down();
      await q.mouse.move(at[2], at[3], { steps: 8 });
      await sleep(200);
      const during = await band(q, await gap(q, 'a', 'gamma'));
      await q.mouse.up();
      await q.keyboard.up('Shift');
      await sleep(600);
      const [after, own, lit, kept2] = [await look(q), await rules(q, 'a', '::selection'), await rules(q, 'a', '::highlight(lab-quote)'), await band(q, await gap(q, 'a', 'gamma'))];
      check(eng, 'Shift-drag: the band shows while dragging', low(during) && green(during), say(during));
      check(eng, 'Shift-drag let go: no full-height green on the words (selection or quote)', !/52, 199, 89|0\.2\d* 0\.78\d* 0\.3/.test(own.bg) && after.quote.length === 0 && alpha(lit.bg) < 0.2, `selection ${own.bg}, quote ${lit.bg}, quote set ${JSON.stringify(after.quote)}`);
      check(eng, 'Shift-drag let go: the words keep the low band (the draft: grey), one band', st(after, 'gamma delta') === 'draft' && after.inks.length === 1 && low(kept2), `${JSON.stringify(after.inks)} ${say(kept2)}`);
      await c2.close();
    }

    // ---- Whole words, as the quote takes them (comments.js): a Shift-drag from inside a word to inside another
    // quotes both whole words, and the draft's band is on them; a drag inside one word keeps its letters.
    {
      const where = (q) => q.evaluate(() => {
        const t = document.getElementById('a').firstChild;
        const r = document.createRange();
        const at = (i) => (r.setStart(t, i), r.setEnd(t, i + 1), r.getBoundingClientRect());
        const g = t.data.indexOf('gamma');
        const d = t.data.indexOf('delta');
        const mid = (b) => [b.left + b.width / 2, b.top + b.height / 2];
        return { g1: { xy: mid(at(g + 1)), i: g + 1 }, g3: { xy: mid(at(g + 3)), i: g + 3 }, d2: { xy: mid(at(d + 2)), i: d + 2 } };
      });
      // Chrome's engine starts no selection on a Shift-press inside a word when there is none yet (a plain page does
      // the same under Playwright), so there the drag's selection is set by hand between the same letters; the
      // lab's part (the quote and its band) is what is checked.
      const drag = async (q, from, to) => {
        await q.keyboard.down('Shift');
        if (eng === 'chromium') {
          await q.evaluate(([f, t]) => {
            const n = document.getElementById('a').firstChild;
            getSelection().setBaseAndExtent(n, f, n, t);
          }, [from.i, to.i]);
        } else {
          await q.mouse.move(...from.xy);
          await q.mouse.down();
          await q.mouse.move(...to.xy, { steps: 8 });
        }
        await sleep(150);
        const letters = await q.evaluate(() => String(getSelection()));
        if (eng === 'chromium') await q.evaluate(() => document.dispatchEvent(new MouseEvent('mouseup', { shiftKey: true, button: 0, bubbles: true })));
        else await q.mouse.up();
        await q.keyboard.up('Shift');
        await sleep(400);
        return letters;
      };
      for (const [name, from, to, want] of [['mid-word to mid-word', 'g1', 'd2', 'gamma delta'], ['mid-word back to mid-word', 'd2', 'g1', 'gamma delta'], ['inside one word', 'g1', 'g3', null]]) {
        await L.clear();
        const [c2, q] = await open(browser, L.base + '/');
        const w = await where(q);
        const letters = await drag(q, w[from], w[to]);
        const draft = (await look(q)).inks.find((i) => i.st === 'draft')?.text;
        if (want) check(eng, `whole words, ${name}: the draft's band is on the whole words`, draft === want, `${draft} (dragged "${letters}")`);
        await q.keyboard.type('whole words');
        await q.keyboard.press('Enter');
        await sleep(1000);
        const saved = (await L.read())[0];
        check(eng, `whole words, ${name}: the saved quote is ${want ? 'the whole words' : 'the letters'}`, saved?.anchor.quote.exact === (want || letters), JSON.stringify(saved?.anchor.quote.exact));
        await c2.close();
      }
    }

    // ---- Overlapping notes: both are inked, and a click finds the right one
    {
      await L.clear();
      await L.say(words('a', 'delta epsilon zeta eta theta'), 'older');
      await L.say(words('a', 'epsilon zeta'), 'inside');
      const [c2, q] = await open(browser, L.base + '/');
      const w = await look(q);
      check(eng, 'overlapping notes: both inked', w.inks.length === 2 && w.pins.every((x) => x.ink), JSON.stringify(w.inks));
      // On the shared words a click opens the one on the fewest; on the others' alone, that one.
      await q.mouse.click(...(await word(q, 'a', 'zeta')));
      await sleep(400);
      const open1 = (await look(q)).card;
      check(eng, 'a click on shared words opens the note on the fewest', open1.includes('inside'), open1.slice(0, 60));
      await q.keyboard.press('Escape');
      await sleep(300);
      await q.mouse.click(...(await word(q, 'a', 'delta')));
      await sleep(400);
      const open2 = (await look(q)).card;
      check(eng, 'a click on the older note\'s own words opens it', open2.includes('older'), open2.slice(0, 60));
      await q.keyboard.press('Escape');
      await c2.close();
    }

    // ---- Notes on the very same words: a click opens the newest, and Tab reaches each
    {
      await L.clear();
      for (let i = 1; i <= 5; i++) await L.say(words('a', 'epsilon zeta eta'), `same ${i}`);
      const [c2, q] = await open(browser, L.base + '/');
      const w3 = await look(q);
      check(eng, 'identical notes: all inked', w3.inks.length === 5 && w3.pins.length === 5 && w3.pins.every((x) => x.ink), `${w3.inks.length} inks`);
      await q.mouse.click(...(await word(q, 'a', 'zeta')));
      await sleep(400);
      const opened = (await look(q)).card;
      check(eng, 'identical notes: a click opens the newest', opened.includes('same 5'), opened.slice(0, 60));
      await q.keyboard.press('Escape');
      await sleep(300);
      await q.evaluate(() => document.activeElement?.blur());
      const got = new Set();
      for (let i = 0; i < 80; i++) {
        await q.keyboard.press('Tab');
        const label = await shadow(q, () => { return r.activeElement?.classList.contains('on-ink') ? r.activeElement.getAttribute('aria-label') : null; });
        if (label) got.add(label);
      }
      check(eng, 'identical notes: Tab reaches each one', got.size === 5, `${got.size} pins`);
      await c2.close();
    }

    // ---- A long selection: saved cut at 300 characters with its last words; the ink runs to the end
    {
      await L.clear();
      const [c2, q] = await open(browser, L.base + '/');
      await q.keyboard.down('Shift');
      await q.evaluate(() => { const r = document.createRange(); r.selectNodeContents(document.getElementById('long')); getSelection().removeAllRanges(); getSelection().addRange(r); });
      await q.evaluate(() => document.dispatchEvent(new MouseEvent('mouseup', { shiftKey: true, button: 0, bubbles: true })));
      await q.keyboard.up('Shift');
      await sleep(600);
      await q.keyboard.type('a long one');
      await q.keyboard.press('Enter');
      await sleep(1000);
      const saved = (await L.read())[0];
      const now = (await look(q)).inks[0];
      check(eng, 'a long selection: cut at 300 characters, with its last words kept', saved?.anchor.quote.exact.length >= 290 && saved.anchor.quote.exact.length <= 300 && saved.anchor.quote.tail?.endsWith('w089x') && saved.anchor.quote.tail.length <= 40, JSON.stringify(saved?.anchor.quote.tail));
      check(eng, 'a long selection: the ink reaches the last word', now?.st === 'next' && now.text.startsWith('w000x') && now.text.endsWith('w089x'), now && `${now.text.slice(0, 12)} … ${now.text.slice(-12)}`);
      await q.reload();
      await sleep(1200);
      const again = (await look(q)).inks[0];
      check(eng, 'a long selection: the same after a reload', again?.text === now?.text, again && again.text.slice(-12));
      await c2.close();
    }

    // ---- Busy page: sixty notes, each inked, each found under the pointer
    {
      await L.clear();
      for (let i = 0; i < 60; i++) await L.say(words(`n${i}`, 'has a few words'), `note ${i}`);
      const [c2, q] = await open(browser, L.base + '/');
      await q.evaluate(() => document.getElementById('n30').scrollIntoView({ block: 'center' }));
      await sleep(900);
      const n = (await look(q)).inks.length;
      for (let i = 0; i < 40; i++) await q.mouse.move(40 + (i * 7) % 500, 60 + (i * 13) % 600);
      await q.mouse.click(...(await word(q, 'n30', 'few')));
      await sleep(400);
      const opened = (await look(q)).card;
      check(eng, 'sixty notes: all inked, a click opens the one under it', n === 60 && opened.includes('note 30'), `${n} inks, opened ${opened.slice(0, 40)}`);
      await c2.close();
    }

    await browser.close();
  }

  // ---- With the flag off, selected words get a pin, as before
  for (const eng of engines) {
    const browser = await pw[eng].launch();
    await OFF.clear();
    await OFF.say(words('a', 'gamma delta epsilon'), 'pin please');
    const [c2, q] = await open(browser, OFF.base + '/');
    const w = await look(q);
    const none = await band(q, await gap(q, 'a', 'gamma'));
    check(eng, 'inkOnText off: selected words get a pin, no ink', w.inks.length === 0 && w.html.length === 0 && none.rows === 0 && w.pins.length === 1 && !w.pins[0].ink && w.pins[0].seen, `${w.inks.length} inks, ${JSON.stringify(w.pins)}, ${w.html}`);
    await c2.close();
    await browser.close();
  }
} finally {
  L.stop();
  OFF.stop();
}
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
