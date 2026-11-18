// Ink on selected words (src/widget/ink.ts) in real browsers: Safari's engine (WebKit) and Chrome's. A comment on
// selected words shows no pin; the words carry its state as a band under the lower part of each line.
// Not part of `npm test`; CI runs it in the `browser` job. Run: node test/browser/ink.mjs   (needs playwright;
// NODE_PATH can point at a node_modules that has it; ENGINES=webkit,chromium picks the engines).
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
body{margin:30px;font:18px/1.5 Georgia,serif;width:640px} td{padding:0 40px 0 0} #box{height:56px;width:260px;overflow:auto;border:1px solid #ccc}
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
    // Your own note (leo is the name the browser uses: never "new").
    say: async (anchor, text = 'note', on = page) => (await call({ page: on, name: 'leo', text, anchor })).comment,
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

// What the page shows of the ink and the pins, read from the widget's shadow root.
const look = (p) =>
  p.evaluate(() => {
    const r = [...document.querySelectorAll('*')].find((n) => n.shadowRoot?.querySelector('.scrim'))?.shadowRoot;
    const rect = (e) => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
    return {
      inks: [...r.querySelectorAll('.ink:not(.sel)')].map((b) => {
        const s = getComputedStyle(b);
        return {
          st: b.dataset.st, calm: b.classList.contains('calm'), k: s.getPropertyValue('--k').trim().toLowerCase(), al: s.getPropertyValue('--al').trim(),
          lines: [...b.querySelectorAll('.ln')].map((l) => {
            const q = getComputedStyle(l, '::before');
            return { ...rect(l), fill: l.classList.contains('fill'), top: parseFloat(q.top), height: parseFloat(q.height), anim: q.animationName, opacity: q.opacity, bg: q.backgroundColor, img: q.backgroundImage, pr: parseFloat(l.style.left) + parseFloat(l.style.width), pb: parseFloat(l.style.top) + parseFloat(l.style.height) };
          }),
          end: b.querySelector('.ink-end') && { ...rect(b.querySelector('.ink-end')), label: b.querySelector('.ink-end').getAttribute('aria-label'), news: b.querySelector('.ink-end').classList.contains('new'), q: Boolean(b.querySelector('.ink-end .q')), open: b.querySelector('.ink-end').classList.contains('open') },
          dk: b.classList.contains('dk'), over: b.classList.contains('over'),
        };
      }),
      pins: [...r.querySelectorAll('button.pin:not(.draft)')].map((b) => ({ label: b.getAttribute('aria-label'), moved: b.classList.contains('moved'), vis: getComputedStyle(b).visibility !== 'hidden' })),
      draftInk: r.querySelector('.ink[data-st=draft]') !== null,
      display: getComputedStyle(r.querySelector('.inks')).display,
    };
  });

const rect = (p, sel) => p.$eval(sel, (e) => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, r: b.right, b: b.bottom }; });
const engines = (process.env.ENGINES || 'webkit,chromium').split(',');
const L = await lab({ flags: { inkOnText: true } });
const OFF = await lab();
const Q = await lab({ flags: { inkOnText: true }, quietInk: true, inkColors: { sent: '#ff0000' } });
// "color(srgb 0.94 0.72 0.04 / 0.34)" or "rgba(240, 183, 10, 0.34)" → [r, g, b] in 0-255 and the alpha.
const colour = (s) => {
  const n = (s.match(/-?[\d.]+(?:e-?\d+)?/g) || []).map(Number);
  const k = /^color\(/.test(s) ? 255 : 1;
  return { rgb: n.slice(0, 3).map((v) => v * k), a: n[3] ?? 1 };
};
const is = (s, hex, alpha, tol = 0.03) => {
  const c = colour(s);
  const want = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return c.rgb.every((v, i) => Math.abs(v - want[i]) < 4) && Math.abs(c.a - alpha) < tol;
};
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
// Words selected in #id (from … to), with comment mode on or off: the page's own ::selection paint and the band
// drawn for the selection (the .ink.sel box in the widget's layer), read as the inks are.
const selDrawn = async (p, id, from, to, on) => {
  await p.evaluate((on) => document.documentElement.classList.toggle('lab-pinning', on), on);
  await sel(p, id, from, to);
  await sleep(150); // selectionchange, then a frame
  const out = await p.evaluate((id) => {
    const r = [...document.querySelectorAll('*')].find((n) => n.shadowRoot?.querySelector('.scrim')).shadowRoot;
    const lines = [...r.querySelectorAll('.ink.sel .ln')].map((l) => {
      const b = l.getBoundingClientRect();
      const q = getComputedStyle(l, '::before');
      return { l: b.left, t: b.top, w: b.width, h: b.height, top: parseFloat(q.top), height: parseFloat(q.height), radius: q.borderTopLeftRadius, bg: q.backgroundColor };
    });
    return { native: getComputedStyle(document.getElementById(id), '::selection').backgroundColor, lines, st: r.querySelector('.ink.sel')?.dataset.st };
  }, id);
  await p.evaluate(() => getSelection().removeAllRanges());
  await sleep(150);
  out.after = await p.evaluate(() => [...document.querySelectorAll('*')].find((n) => n.shadowRoot?.querySelector('.scrim')).shadowRoot.querySelectorAll('.ink.sel .ln').length);
  return out;
};
// The selection's band against an ink's: the same pieces, boxes, band offset and height, radius and colour.
const sameBand = (a, ink) => a.lines.length > 0 && a.lines.length === ink.lines.length && a.lines.every((l, i) => {
  const k = ink.lines[i];
  return Math.abs(l.l - k.l) < 1 && Math.abs(l.t - k.t) < 1 && Math.abs(l.w - k.w) < 1 && Math.abs(l.h - k.h) < 1 && Math.abs(l.top - k.top) < 0.5 && Math.abs(l.height - k.height) < 0.5 && l.bg === k.bg;
});
const bandText = (a) => a.lines.map((l) => `${l.l.toFixed(1)},${l.t.toFixed(1)} ${l.w.toFixed(1)}x${l.h.toFixed(1)} ${l.top.toFixed(1)}/${l.height.toFixed(1)} ${l.bg}`).join(' | ');
// Opens a fresh page in a context (the name the notes were written under).
async function open(browser, url, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 }, ...opts });
  await ctx.addInitScript(() => localStorage.setItem('lab-name', 'leo'));
  const p = await ctx.newPage();
  await p.goto(url);
  await sleep(1200);
  return [ctx, p];
}
const middle = (l) => [(l.l + l.r) / 2, (l.t + l.b) / 2];
const shadow = (p, fn, arg) => p.evaluate(([f, a]) => new Function('r', 'a', f)([...document.querySelectorAll('*')].find((n) => n.shadowRoot?.querySelector('.scrim')).shadowRoot, a), [fn.toString().replace(/^[^{]*{|}$/g, ''), arg]);

try {
  for (const eng of engines) {
    const browser = await pw[eng].launch();
    await L.clear();

    // ---- Seed: one note in each state, a clicked word, and a read done one
    const sent = await L.say(words('a', 'delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi'), 'sent');
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
    const by = (label) => v.inks.find((i) => i.end?.label.includes(label));

    check(eng, 'selected words: ink, no pin; a clicked word keeps its pin', v.inks.length === 6 && v.pins.length === 1 && v.pins[0].vis, `${v.inks.length} inks, ${v.pins.length} pins`);
    const sentInk = by('delta epsilon');
    check(eng, 'the band is the lower 44%, one per line', sentInk.lines.length >= 2 && sentInk.lines.every((l) => Math.abs(l.height / l.h - 0.44) < 0.03 && l.top / l.h > 0.5), sentInk.lines.map((l) => `${(l.top / l.h).toFixed(2)}/${(l.height / l.h).toFixed(2)}`).join(' '));

    check(eng, 'sent: the pins\' green', sentInk.st === 'next' && (is(sentInk.lines[0].bg, '#24a046', 0.3) || is(sentInk.lines[0].bg, '#24a046', 0.45)), sentInk.lines[0].bg);
    const now = by('paragraph here');
    check(eng, 'working: the working ring\'s green, pulsing (no sweep)', now.st === 'now' && (is(now.lines[0].bg, '#34c759', 0.3) || is(now.lines[0].bg, '#34c759', 0.4)) && /lab-ink-pulse/.test(now.lines[0].anim || ''), JSON.stringify([now.lines[0].bg, now.lines[0].anim]));
    const ask = by('second paragraph');
    check(eng, 'asks amber, breathing until read', ask.st === 'asks' && !ask.calm && (is(ask.lines[0].bg, '#e08a1a', 0.48) || is(ask.lines[0].bg, '#f0a040', 0.44)) && /breath/.test(ask.lines[0].anim), `${ask.lines[0].bg} ${ask.lines[0].anim}`);
    const keptInk = by('cell one');
    check(eng, 'unread done is green, still', keptInk.st === 'kept' && (is(keptInk.lines[0].bg, '#24a046', 0.28) || is(keptInk.lines[0].bg, '#34c759', 0.28)) && keptInk.lines[0].anim === 'none', `${keptInk.st} ${keptInk.lines[0].bg}`);
    const doneInk = by('cell two');
    const dl = doneInk.lines[0];
    check(eng, 'read done is a hairline at the foot, faint, there at once', doneInk.st === 'done' && Math.abs(dl.height - 2) < 0.5 && Math.abs(dl.top + dl.height - dl.h) < 1 && Math.abs(dl.opacity - 0.35) < 0.03, `${dl.top}/${dl.height}/${dl.h} opacity ${dl.opacity}`);
    check(eng, 'a done note stays with "show done" off, and loads with no fill', v.inks.every((i) => i.lines.every((l) => !l.fill)));

    // ---- A word in a link keeps its seam out of the band
    check(eng, 'no seam at a link: one piece for the line', by('one two') && (await (async () => {
      const c = await L.say(words('lnk', 'two linked words three'), 'link');
      await sleep(1200);
      const w = (await look(p)).inks.find((i) => i.end?.label.includes('two linked'));
      await L.drop(c.id);
      return w?.lines.length === 1;
    })()));

    // ---- Click, selection, link
    const first = by('delta epsilon').lines[0];
    await p.mouse.move(...middle(first));
    await sleep(800);
    const over = (await look(p)).inks.find((i) => i.over);
    check(eng, 'hovering only lightens the band: it stays low (no rise)', Boolean(over) && over.lines.every((l) => l.top > 1 && l.height < l.h * .6 && Number(l.opacity) < 1), over && `${over.lines[0].top}/${over.lines[0].height}/${over.lines[0].opacity}`);
    await p.mouse.click(...middle(first));
    await sleep(400);
    check(eng, 'a click opens the thread', (await look(p)).inks.some((i) => i.end?.open && i.end.label.includes('delta epsilon')));
    await p.keyboard.press('Escape');
    await sleep(300);
    // With words selected over the ink, a click is for the selection.
    await p.keyboard.down('Shift'); // the page lets words be selected while Shift is down
    await sel(p, 'a', 'delta', 'delta');
    await p.evaluate(([x, y]) => document.elementFromPoint(x, y).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, button: 0 })), middle(first));
    await sleep(300);
    check(eng, 'with words selected a click opens nothing', !(await look(p)).inks.some((i) => i.end?.open));
    await p.evaluate(() => getSelection().removeAllRanges());
    await p.keyboard.up('Shift');
    // Selecting words while commenting draws the ink they will get: the sent band, low on each line, on the same
    // words; the page's own selection paint is clear then. Off comment mode the page's selection is its own.
    await p.mouse.move(5, 5);
    await sleep(400);
    const pinning = await p.evaluate(() => document.documentElement.classList.contains('lab-pinning'));
    const sentNow = (await look(p)).inks.find((i) => i.end?.label.includes('delta epsilon'));
    const selOn = await selDrawn(p, 'a', 'delta', 'pi', true);
    const selOff = await selDrawn(p, 'a', 'delta', 'pi', false);
    await p.evaluate((on) => document.documentElement.classList.toggle('lab-pinning', on), pinning);
    check(eng, 'selecting while commenting draws the sent ink band on the words (light page)', selOn.st === 'next' && sameBand(selOn, sentNow) && is(selOn.lines[0].bg, '#24a046', 0.3), `${bandText(selOn)} vs ink ${bandText(sentNow)}`);
    check(eng, 'the native selection paint is clear while commenting; the band goes with the selection', /rgba\(0, 0, 0, 0\)|transparent|\/ 0\)/.test(selOn.native) && selOn.after === 0, `${selOn.native}, ${selOn.after} left`);
    check(eng, 'off comment mode the page keeps its own selection, no band', is(selOff.native, '#0000ff', 1) && selOff.lines.length === 0, `${selOff.native}, ${selOff.lines.length} lines`);
    // A link inside inked words keeps its own click.
    const c3 = await L.say(words('lnk', 'two linked words three'), 'link');
    await sleep(1200);
    const lk = await rect(p, '#lk');
    await p.mouse.click(lk.x + lk.w / 2, lk.y + lk.h / 2);
    await sleep(400);
    check(eng, 'a link inside keeps its click', (await p.evaluate(() => location.hash)) === '#clicked' && !(await look(p)).inks.some((i) => i.end?.open));
    await L.drop(c3.id);

    // ---- Keyboard: the button at the end of the words
    await p.evaluate(() => (location.hash = '', document.activeElement?.blur(), scrollTo(0, 0)));
    let reached = null;
    for (let i = 0; i < 80 && !reached; i++) {
      await p.keyboard.press('Tab');
      reached = await shadow(p, () => { return r.activeElement?.classList.contains('ink-end') ? r.activeElement.getAttribute('aria-label') : null; });
    }
    check(eng, 'Tab reaches the end button; its label names the words', Boolean(reached) && /on "/.test(reached), reached);
    await p.keyboard.press('Enter');
    await sleep(400);
    check(eng, 'Enter opens the thread', (await look(p)).inks.some((i) => i.end?.open));
    await p.keyboard.press('Escape');

    // ---- A new reply: a dot; a question: a ?
    const vq = await look(p);
    const asked1 = vq.inks.find((i) => i.end?.label.includes('one two'));
    const plain = vq.inks.find((i) => i.end?.label.includes('second paragraph'));
    check(eng, 'new reply: a dot; question: a ?', asked1.end.news && asked1.end.q && plain.end.news && !plain.end.q, `${asked1.end.news} ${asked1.end.q} ${plain.end.news} ${plain.end.q}`);
    // Read, a plain answer rests; the question still breathes.
    await p.evaluate(() => scrollTo(0, 0));
    const plainLine = (await look(p)).inks.find((i) => i.end?.label.includes('second paragraph')).lines[0];
    await p.mouse.click(...middle(plainLine));
    await sleep(500);
    await p.keyboard.press('Escape');
    await sleep(500);
    const after = await look(p);
    check(eng, 'a read, plain answer stops breathing; the question breathes on', after.inks.find((i) => i.end?.label.includes('second paragraph')).calm && !after.inks.find((i) => i.end?.label.includes('one two')).calm);
    await ctx.close();

    // ---- A hairline and the states survive a reload, with no fill
    {
      const [c2, q] = await open(browser, L.base + '/');
      const r2 = await look(q);
      const d2 = r2.inks.find((i) => i.end?.label.includes('cell two'));
      check(eng, 'a done hairline is there after a reload, with no fill', d2?.st === 'done' && d2.lines.every((l) => !l.fill) && r2.inks.length === 6, `${r2.inks.length} inks`);
      await c2.close();
    }

    // ---- A note arriving while the page is open fills
    {
      const [c2, q] = await open(browser, L.base + '/');
      const fresh = await L.say(words('a', 'alpha'.replace('alpha', 'Alpha beta gamma')), 'fresh');
      let filled = false;
      for (let i = 0; i < 20 && !filled; i++) {
        await sleep(60);
        filled = (await look(q)).inks.some((i) => i.end?.label.includes('Alpha beta') && i.lines.some((l) => l.fill));
      }
      check(eng, 'a note that arrives while open fills line by line', filled);
      await L.drop(fresh.id);
      await c2.close();
    }

    // ---- Words removed: the pin comes back; restored: ink again
    {
      const [c2, q] = await open(browser, L.base + '/');
      await q.evaluate(() => { const e = document.getElementById('p1'); window.__p1 = e; e.replaceWith(document.createComment('gone')); window.__hole = document.body.childNodes; });
      await sleep(1500);
      const gone = await look(q);
      check(eng, 'words removed: the pin is back', gone.pins.some((x) => x.moved) && !gone.inks.some((i) => i.end?.label.includes('paragraph here')), JSON.stringify(gone.pins));
      await q.evaluate(() => { const c = [...document.body.childNodes].find((n) => n.nodeType === 8 && n.data === 'gone'); c.replaceWith(window.__p1); });
      await sleep(1500);
      const back = await look(q);
      check(eng, 'words restored: ink again', back.inks.some((i) => i.end?.label.includes('paragraph here')) && back.pins.length === 1);
      await c2.close();
    }

    // ---- Two cells, two paragraphs, a box that scrolls, sticky words, right to left
    {
      await L.clear();
      await L.say(words('c1', 'cell one words', { quote: { exact: 'cell one words cell two words', prefix: '', suffix: '', selected: true } }), 'two cells');
      await L.say(words('p1', 'paragraph here', { quote: { exact: 'paragraph here second paragraph', prefix: 'first', suffix: 'here', selected: true } }), 'two paragraphs');
      await L.say(words('bp', 'box line one is here and goes on past the edge so it wraps onto a second line and then a third line and a fourth'), 'box');
      await L.say(words('stk', 'sticky words stay'), 'sticky');
      await L.say(words('rt', 'كلمات عربية'), 'rtl');
      const [c2, q] = await open(browser, L.base + '/');
      const w = await look(q);
      const cells = w.inks.find((i) => i.end?.label.includes('cell one words cell'));
      const c1 = await rect(q, '#c1');
      const c2r = await rect(q, '#c2');
      check(eng, 'two cells: two bands, none across the gutter', cells?.lines.length === 2 && cells.lines[0].r <= c1.r + 1 && cells.lines[1].l >= c2r.x - 1, cells && cells.lines.map((l) => `${Math.round(l.l)}-${Math.round(l.r)}`).join(' '));
      const paras = w.inks.find((i) => i.end?.label.includes('paragraph here second'));
      const [r1, r2] = [await rect(q, '#p1'), await rect(q, '#p2')];
      check(eng, 'two paragraphs: bands in both, none between', paras?.lines.length === 2 && paras.lines[0].b <= r1.b + 1 && paras.lines[1].t >= r2.y - 1, paras && paras.lines.map((l) => `${Math.round(l.t)}-${Math.round(l.b)}`).join(' '));
      const box = await rect(q, '#box');
      const bi = w.inks.find((i) => i.end?.label.includes('box line one'));
      check(eng, 'scroll box: no band outside it', bi?.lines.length > 0 && bi.lines.every((l) => l.t >= box.y - 1 && l.b <= box.b + 1), bi && `${bi.lines.length} lines in ${Math.round(box.y)}-${Math.round(box.b)}`);
      // Scrolled in the box, the bands cut to what it shows after the page notices.
      const ri = w.inks.find((i) => i.end?.label.includes('كلمات'));
      check(eng, 'rtl: the end button is at the left', ri && ri.end.r <= Math.min(...ri.lines.map((l) => l.l)) + 2, ri && `${ri.end.r} vs ${Math.min(...ri.lines.map((l) => l.l))}`);
      await q.evaluate(() => scrollTo(0, 400));
      await sleep(600);
      const st = (await look(q)).inks.find((i) => i.end?.label.includes('sticky words'));
      const sr = await q.evaluate(() => { const r = document.createRange(); r.selectNodeContents(document.getElementById('stk')); return r.getBoundingClientRect().top; });
      check(eng, 'sticky words: the ink follows', st && Math.abs(st.lines[0].t - sr) < 2, st && `${st.lines[0].t} vs ${sr}`);
      await c2.close();
    }

    // ---- Reduced motion and print
    {
      const [c2, q] = await open(browser, L.base + '/', { reducedMotion: 'reduce' });
      const fresh = await L.say(words('a', 'Alpha beta gamma'), 'fresh');
      await sleep(900);
      const w = await look(q);
      const f = w.inks.find((i) => i.end?.label.includes('Alpha beta'));
      const stills = w.inks.every((i) => i.lines.every((l) => !l.fill && l.anim === 'none'));
      check(eng, 'reduced motion: no fill, sweep or breathing; the ? and the dot stay', Boolean(f) && stills, JSON.stringify(w.inks.map((i) => i.lines.map((l) => [l.fill, l.anim]))));
      await q.emulateMedia({ media: 'print' });
      check(eng, 'print: no ink', (await look(q)).display === 'none');
      await L.drop(fresh.id);
      await c2.close();
    }

    // ---- Dark page on a light computer: strengths chosen from the words' own colour
    {
      await L.clear();
      await L.say(words('a', 'gamma delta'), 'on dark', '/dark');
      await L.say(words('a', 'gamma delta'), 'on light');
      const [c2, q] = await open(browser, L.base + '/dark', { colorScheme: 'light' });
      const [c3, q2] = await open(browser, L.base + '/', { colorScheme: 'dark' });
      const [onDark, onLight] = [await look(q), await look(q2)];
      const darkSel = await selDrawn(q, 'a', 'gamma', 'delta', true);
      check(eng, 'selecting while commenting draws the sent ink band (dark page)', sameBand(darkSel, onDark.inks[0]) && is(darkSel.lines[0].bg, '#24a046', 0.45), `${bandText(darkSel)} vs ink ${onDark.inks[0] && bandText(onDark.inks[0])}`);
      check(eng, 'light or dark follows the page, not the computer', onDark.inks[0]?.dk === true && onLight.inks[0]?.dk === false, `dark page ${onDark.inks[0]?.dk}, light page ${onLight.inks[0]?.dk}`);
      await c2.close();
      await c3.close();
    }

    // ---- Real flow: select words (the actions bar shows; the words wear the sent ink's band), type, send: the sent
    // note is yellow ink, nothing saved but the words
    {
      await L.clear();
      const [c2, q] = await open(browser, L.base + '/');
      await q.keyboard.down('Shift');
      await sel(q, 'a', 'gamma delta', 'gamma delta');
      await q.evaluate(() => document.dispatchEvent(new MouseEvent('mouseup', { shiftKey: true, button: 0, bubbles: true })));
      await q.keyboard.up('Shift');
      await sleep(600);
      const d = await look(q);
      const bar = await q.evaluate(() => [...document.querySelectorAll('*')].find((n) => n.shadowRoot?.querySelector('.scrim')).shadowRoot.querySelector('.ink.sel.quote[data-st=next] .ln'));
      check(eng, 'selecting words: the bar shows, the words wear the sent band, no pin', Boolean(bar) && d.inks.length === 0 && d.pins.length === 0, `${d.inks.length} inks, ${d.pins.length} pins`);
      await q.keyboard.type('a note on words');
      await q.keyboard.press('Enter');
      await sleep(1000);
      const saved = (await L.read())[0];
      const w = await look(q);
      check(eng, 'sent: yellow ink, no pin, saved as selected words', saved?.anchor.quote.selected === true && w.inks.length === 1 && w.inks[0].st === 'next' && w.pins.length === 0, JSON.stringify(saved?.anchor.quote));
      await c2.close();
    }

    // ---- A real Shift-drag with the mouse, let go: the words keep the low band (no full-height green), in the ink's
    // look, after the drag ends and Shift's grace (400 ms) is over, and with the comment box open on them.
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
      const during = await q.evaluate(() => [...document.querySelectorAll('*')].find((n) => n.shadowRoot?.querySelector('.scrim')).shadowRoot.querySelectorAll('.ink.sel:not(.quote) .ln').length);
      await q.mouse.up();
      await q.keyboard.up('Shift');
      await sleep(600);
      const after = await q.evaluate(() => {
        const r = [...document.querySelectorAll('*')].find((n) => n.shadowRoot?.querySelector('.scrim')).shadowRoot;
        const a = document.getElementById('a');
        const paint = (pseudo) => { try { return getComputedStyle(a, pseudo).backgroundColor; } catch { return 'n/a'; } };
        const bands = [...r.querySelectorAll('.ink .ln')].map((l) => {
          const b = l.getBoundingClientRect();
          const q = getComputedStyle(l, '::before');
          return { st: l.parentElement.dataset.st, h: b.height, height: parseFloat(q.height), bg: q.backgroundColor };
        });
        return { sel: paint('::selection'), quote: paint('::highlight(lab-quote)'), lit: Boolean(CSS.highlights?.get('lab-quote')?.size), bands, draft: Boolean(r.querySelector('.card textarea, .card [contenteditable]')) };
      });
      const green = (c) => is(c, '#34c759', 0.3);
      check(eng, 'Shift-drag: the band shows while dragging', during > 0, `${during} pieces`);
      check(eng, 'Shift-drag let go: no full-height green on the words (selection or quote)', !green(after.sel) && !green(after.quote), `selection ${after.sel}, quote ${after.quote}, quote set ${after.lit}`);
      check(eng, 'Shift-drag let go: the words keep the low band in the ink look (the bar: sent green)', after.bands.length > 0 && after.bands.every((b) => Math.abs(b.height / b.h - 0.44) < 0.03) && after.bands.some((b) => b.st === 'next' && (is(b.bg, '#24a046', 0.3) || is(b.bg, '#24a046', 0.45))), JSON.stringify(after.bands));
      check(eng, 'Shift-drag let go: one band on the words, not two stacked', after.bands.length === 1, `${after.bands.length} bands`);
      await c2.close();
    }

    // ---- Whole words, as the quote takes them (anchoring.ts wholeWords): a Shift-drag from inside a word to inside
    // another draws its band on both whole words and quotes them; a drag inside one word keeps its letters.
    {
      const where = (q) => q.evaluate(() => {
        const t = document.getElementById('a').firstChild;
        const r = document.createRange();
        const at = (i) => (r.setStart(t, i), r.setEnd(t, i + 1), r.getBoundingClientRect());
        const box = (w) => (r.setStart(t, t.data.indexOf(w)), r.setEnd(t, t.data.indexOf(w) + w.length), r.getBoundingClientRect());
        const g = t.data.indexOf('gamma');
        const d = t.data.indexOf('delta');
        const mid = (b) => [b.left + b.width / 2, b.top + b.height / 2];
        return { g1: { xy: mid(at(g + 1)), i: g + 1 }, g3: { xy: mid(at(g + 3)), i: g + 3 }, d2: { xy: mid(at(d + 2)), i: d + 2 }, gd: [box('gamma delta').left, box('gamma delta').right], g: [box('gamma').left, box('gamma').right] };
      });
      const shown = (q) => q.evaluate(() => {
        const r = [...document.querySelectorAll('*')].find((n) => n.shadowRoot?.querySelector('.scrim')).shadowRoot;
        const ln = [...r.querySelectorAll('.ink.sel:not(.quote) .ln')].map((l) => l.getBoundingClientRect());
        const sel = getSelection();
        const own = sel.rangeCount ? sel.getRangeAt(0).getBoundingClientRect() : null;
        return { text: String(sel), own: own && [own.left, own.right], band: ln.length ? [Math.min(...ln.map((b) => b.left)), Math.max(...ln.map((b) => b.right))] : null };
      });
      // Chrome's engine starts no selection on a Shift-press inside a word when there is none yet (a plain page does
      // the same under Playwright), so there the drag's selection is set by hand between the same letters; the
      // lab's part (the band and the quote) is what is checked.
      const drag = async (q, from, to, shiftAtUp) => {
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
        const live = await shown(q);
        if (!shiftAtUp) await q.keyboard.up('Shift'); // Shift's grace keeps the words selectable; no comment opens
        if (eng === 'chromium') await q.evaluate((shift) => document.dispatchEvent(new MouseEvent('mouseup', { shiftKey: shift, button: 0, bubbles: true })), shiftAtUp);
        else await q.mouse.up();
        if (shiftAtUp) await q.keyboard.up('Shift');
        await sleep(120);
        return [live, await shown(q)];
      };
      const near = (a, b) => a && b && Math.abs(a[0] - b[0]) < 1.5 && Math.abs(a[1] - b[1]) < 1.5;
      for (const [name, from, to, want, box] of [['mid-word to mid-word', 'g1', 'd2', 'gamma delta', 'gd'], ['mid-word back to mid-word', 'd2', 'g1', 'gamma delta', 'gd'], ['inside one word', 'g1', 'g3', null, null]]) {
        await L.clear();
        const [c2, q] = await open(browser, L.base + '/');
        const w = await where(q);
        const [live] = await drag(q, w[from], w[to], false);
        const letters = !want && live.text; // inside one word: exactly the letters selected
        check(eng, `whole words, ${name}: the band ${want ? 'snaps to the whole words' : 'keeps the letters'} while dragging`, near(live.band, box ? w[box] : live.own), `${JSON.stringify(live.band)} vs ${JSON.stringify(box ? w[box] : live.own)}`);
        await q.evaluate(() => getSelection().removeAllRanges());
        await sleep(500);
        await drag(q, w[from], w[to], true);
        await sleep(400);
        await q.keyboard.type('whole words');
        await q.keyboard.press('Enter');
        await sleep(1000);
        const saved = (await L.read())[0];
        check(eng, `whole words, ${name}: the saved quote is the words shown`, saved?.anchor.quote.exact === (want || letters), JSON.stringify(saved?.anchor.quote.exact));
        await c2.close();
      }
    }

    // ---- Overlapping notes: the newest keeps its band, the others are hairlines under it
    {
      await L.clear();
      const older = await L.say(words('a', 'delta epsilon zeta eta theta'), 'older');
      const newer = await L.say(words('a', 'epsilon zeta'), 'inside');
      const [c2, q] = await open(browser, L.base + '/');
      const w = await look(q);
      const [o, n] = [w.inks.find((i) => i.end?.label.includes('delta epsilon')), w.inks.find((i) => i.end?.label.includes('on "epsilon zeta"'))];
      const hair = o.lines[0].top - o.lines[0].h;
      check(eng, 'overlapping notes: the newer keeps its band, the older is a hairline under it', Math.abs(n.lines[0].height / n.lines[0].h - 0.44) < 0.03 && Math.abs(o.lines[0].height - 2) < 0.5 && Math.abs(hair - 1) < 0.6, `band ${n.lines[0].height}, hairline ${o.lines[0].height} at +${hair}`);
      // On the shared words a click opens the one on the fewest; on the others' alone, that one.
      const shared = [(n.lines[0].l + n.lines[0].r) / 2, (n.lines[0].t + n.lines[0].b) / 2];
      await q.mouse.click(...shared);
      await sleep(400);
      const open1 = (await look(q)).inks.find((i) => i.end?.open);
      check(eng, 'a click on shared words opens the note on the fewest', open1?.end.label.includes('on "epsilon zeta"'), open1?.end.label);
      await q.keyboard.press('Escape');
      await sleep(300);
      await q.mouse.click(o.lines[0].l + 3, (o.lines[0].t + o.lines[0].b) / 2);
      await sleep(400);
      const open2 = (await look(q)).inks.find((i) => i.end?.open);
      check(eng, 'a click on the older note\'s own words opens it', open2?.end.label.includes('delta epsilon zeta eta theta'), open2?.end.label);
      await q.keyboard.press('Escape');
      await c2.close();
      // Identical quotes: one stack, three hairlines at most 3 px apart; a click opens the newest; Tab reaches each.
      await L.clear();
      for (let i = 0; i < 5; i++) await L.say(words('p2', 'second paragraph'), `same ${i}`);
      const [c3, q3] = await open(browser, L.base + '/');
      const w3 = await look(q3);
      const tops = w3.inks.map((i) => Math.round((i.lines[0].top - i.lines[0].h) * 10) / 10).sort((x, y) => x - y);
      const bands = w3.inks.filter((i) => i.lines[0].height > 5).length;
      check(eng, 'identical notes: one band, at most three hairlines 3px apart', w3.inks.length === 5 && bands === 1 && JSON.stringify(tops.filter((t) => t > 0)) === JSON.stringify([1, 4, 7, 7]), `${bands} band, tops ${tops}`);
      const line = w3.inks[0].lines[0];
      await q3.mouse.click(...middle(line));
      await sleep(400);
      const opened = (await look(q3)).inks.find((i) => i.end?.open);
      check(eng, 'identical notes: a click opens the newest', opened?.end.label.startsWith('comment 5'), opened?.end.label);
      await q3.keyboard.press('Escape');
      await q3.evaluate(() => (document.activeElement?.blur(), scrollTo(0, 0)));
      const got = new Set();
      for (let i = 0; i < 90 && got.size < 5; i++) {
        await q3.keyboard.press('Tab');
        const l = await shadow(q3, () => { return r.activeElement?.classList.contains('ink-end') ? r.activeElement.getAttribute('aria-label') : null; });
        if (l) got.add(l);
      }
      check(eng, 'identical notes: Tab reaches each one', got.size === 5, `${got.size} buttons`);
      await c3.close();
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
      const lastLine = async (page) => page.evaluate(() => { const r = document.createRange(); r.selectNodeContents(document.getElementById('long')); const b = [...r.getClientRects()].at(-1); return { r: b.right, b: b.bottom }; });
      const lastWords = await lastLine(q);
      // The box as laid out, not as the fill's scale shows it (a long fill takes seconds).
      const draw = async (page) => { const i = (await look(page)).inks[0]; return i && { n: i.lines.length, r: i.lines.at(-1).pr, b: i.lines.at(-1).pb, st: i.st }; };
      const now = await draw(q);
      check(eng, 'a long selection: cut at 300 characters, with its last words kept', saved?.anchor.quote.exact.length >= 290 && saved.anchor.quote.exact.length <= 300 && saved.anchor.quote.tail?.endsWith('w089x') && saved.anchor.quote.tail.length <= 40, JSON.stringify(saved?.anchor.quote.tail));
      check(eng, 'a long selection: the ink reaches the last line, on send and after a reload', Boolean(now) && Math.abs(now.r - lastWords.r) < 2 && Math.abs(now.b - lastWords.b) < 2, JSON.stringify(now) + JSON.stringify(lastWords));
      await q.reload();
      await sleep(1200);
      const again = await draw(q);
      check(eng, 'a long selection: the same after a reload', Boolean(again) && again.n === now.n && Math.abs(again.r - lastWords.r) < 2, JSON.stringify(again));
      await c2.close();
    }

    // ---- Quiet ink and colours (labit.json: quietInk, inkColors)
    {
      await Q.clear();
      const w1 = await Q.say(words('p1', 'paragraph here'), 'working');
      await Q.reply(w1.id, 'on it', 'working');
      const a1 = await Q.say(words('p2', 'second paragraph'), 'asks');
      await Q.reply(a1.id, 'an answer');
      await Q.say(words('a', 'gamma delta'), 'sent');
      const d1 = await Q.say(words('c2', 'cell two'), 'done');
      await Q.resolve(d1.id);
      const [c2, q] = await open(browser, Q.base + '/');
      const fresh = await Q.say(words('lnk', 'one two'), 'arrives');
      await sleep(250);
      const w = await look(q);
      const work = w.inks.find((i) => i.st === 'now');
      check(eng, 'quietInk: working is a still tint, nothing moves', work.lines.every((l) => l.anim === 'none' && !/gradient/.test(l.img)) && (is(work.lines[0].bg, '#34c759', 0.3) || is(work.lines[0].bg, '#34c759', 0.4)), `${work.lines[0].anim} ${work.lines[0].img}`);
      check(eng, 'quietInk: a note that arrives does not fill', w.inks.length === 5 && w.inks.every((i) => i.lines.every((l) => !l.fill)), `${w.inks.length} inks`);
      const asks = w.inks.find((i) => i.st === 'asks');
      check(eng, 'quietInk: asks still breathes', /breath/.test(asks.lines[0].anim), asks.lines[0].anim);
      const done = await q.evaluate(() => { const r = [...document.querySelectorAll('*')].find((n) => n.shadowRoot?.querySelector('.scrim')).shadowRoot; return getComputedStyle(r.querySelector('.ink[data-st=done] .ln'), '::before').transitionDuration; });
      check(eng, 'quietInk: the drain is at once', /^(0s,? ?)+$/.test(done), done);
      const sent = w.inks.find((i) => i.st === 'next');
      check(eng, 'inkColors.sent recolours the band (one colour, strengths stay)', is(sent.lines[0].bg, '#ff0000', 0.3) || is(sent.lines[0].bg, '#ff0000', 0.45), sent.lines[0].bg);
      const other = w.inks.find((i) => i.st === 'asks');
      check(eng, 'inkColors: the other states keep theirs', is(other.lines[0].bg, '#e08a1a', 0.48) || is(other.lines[0].bg, '#f0a040', 0.44), other.lines[0].bg);
      void fresh;
      await c2.close();
    }

    // ---- Busy page: sixty notes, and a pointer move reads no layout
    {
      await L.clear();
      for (let i = 0; i < 60; i++) await L.say(words(`n${i}`, 'has a few words'), `note ${i}`);
      const [c2, q] = await open(browser, L.base + '/');
      await q.evaluate(() => scrollTo(0, 1100));
      await sleep(900);
      const n = (await look(q)).inks.length;
      await q.evaluate(() => {
        window.__reads = 0;
        for (const [o, m] of [[Element.prototype, 'getBoundingClientRect'], [Element.prototype, 'getClientRects'], [Range.prototype, 'getBoundingClientRect'], [Range.prototype, 'getClientRects']]) {
          const f = o[m];
          o[m] = function (...a) { window.__reads++; return f.apply(this, a); };
        }
      });
      for (let i = 0; i < 80; i++) await q.mouse.move(40 + (i * 7) % 500, 60 + (i * 13) % 600);
      await sleep(200);
      const reads = await q.evaluate(() => window.__reads);
      check(eng, `${n > 50 ? n : 60} notes: a pointer move reads no layout`, n === 60 && reads === 0, `${n} inks, ${reads} reads`);
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
    check(eng, 'inkOnText off: selected words get a pin', w.inks.length === 0 && w.pins.length === 1 && w.pins[0].vis, `${w.inks.length} inks, ${w.pins.length} pins`);
    await c2.close();
    await browser.close();
  }
} finally {
  L.stop();
  OFF.stop();
  Q.stop();
}
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
