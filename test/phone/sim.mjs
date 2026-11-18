// Phone checks in real mobile browsers: Safari in the iOS simulator, and the "Chrome stand-in" app there (a WKWebView
// with Chrome's layout and user agent; real Chrome can't be installed in a simulator). Not part of `npm test` or CI:
// the touches come from outside the page (the simulator's own touch input), one step at a time.
//
//   node test/phone/sim.mjs serve            starts a lab on the test page (:4470) and the recorder's sink (:4471)
//   node test/phone/sim.mjs next [--as NAME]  says what to do next, with the screen point to touch, and starts its clock
//   (touch the simulator as it says)
//   node test/phone/sim.mjs check            checks what the recorder saw since `next`, prints ok / FAIL lines
//   node test/phone/sim.mjs report           all results so far, per browser
//
// The page (test/phone/page) has a recorder (probe.js) that logs, every frame while something happens: scroll, what
// the keyboard covers, what has focus, the selection, the pins and boxes, and where the page's paragraphs sit on screen.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUN = path.join(os.tmpdir(), 'labit-phone');
const STATE = path.join(RUN, 'state.json');
const LOG = path.join(RUN, 'probe.jsonl');
const LAB = 4470, SINK = 4471, B = `http://127.0.0.1:${LAB}`;
const [cmd, ...args] = process.argv.slice(2);
const read = () => (fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : { as: 'safari', step: 0, off: null, results: {} });
const save = (s) => fs.writeFileSync(STATE, JSON.stringify(s, null, 1));
const lines = (as = read().as) => (fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((l) => !as || l.ua === as) : []); // one browser's lines: another one's tab may still be sending
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const comments = async () => (await (await fetch(`${B}/_lab/api/comments?page=/index`)).json()).comments || [];

if (cmd === 'serve') {
  fs.rmSync(RUN, { recursive: true, force: true });
  const dir = path.join(RUN, 'site');
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(path.join(HERE, 'page'))) fs.copyFileSync(path.join(HERE, 'page', f), path.join(dir, f));
  save(read());
  // Ink on selected words is behind a flag: on here, with one note on the first words of the intro for the tap step.
  fs.writeFileSync(path.join(dir, 'labit.json'), JSON.stringify({ flags: { inkOnText: true } }));
  const env = { ...process.env, LABIT_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'labit-phone-home-')), LABIT_NO_UPDATE_CHECK: '1' };
  const lab = spawn(process.execPath, [path.join(HERE, '../../local.mjs'), '.', '--new', '--no-open', '--port', String(LAB)], { cwd: dir, env, stdio: 'inherit' });
  http.createServer((req, res) => {
    res.setHeader('access-control-allow-origin', '*');
    if (req.url === '/ask') { const f = path.join(RUN, 'ask.js'); const js = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : ''; fs.rmSync(f, { force: true }); return res.end(js); }
    if (req.method !== 'POST') return res.end();
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try {
        const { ua, lines: ls } = JSON.parse(body);
        fs.appendFileSync(LOG, ls.map((l) => JSON.stringify({ ...l, ua: /CriOS/.test(ua) ? 'chrome' : /Safari/.test(ua) ? 'safari' : ua.slice(0, 30) })).join('\n') + '\n');
      } catch {}
      res.end();
    });
  }).listen(SINK, '0.0.0.0', () => console.log(`lab ${B}/  sink :${SINK}  log ${LOG}`));
  (async () => {
    for (let i = 0; i < 80; i++) if (await fetch(B + '/').then(() => true, () => false)) break; else await sleep(100);
    const text = "A long page to hold, tap, scroll and type on.";
    await fetch(`${B}/_lab/api/comments`, { method: 'POST', headers: { 'content-type': 'application/json', origin: B },
      body: JSON.stringify({ page: '/index', name: 'Ink', text: 'a note on words', anchor: { kind: 'text', selector: '#intro', x: 0.2, y: 0.2, docX: 0.1, docY: 80, width: 390, text, element: '<p id="intro"', quote: { exact: 'A long page to hold, tap,', prefix: '', suffix: 'scroll and type on.', selected: true } } }) });
  })();
  process.on('SIGTERM', () => (lab.kill(), process.exit(0)));
  process.on('SIGINT', () => (lab.kill(), process.exit(0)));
} else {
  // ---- helpers over the recorder's lines ----
  const kb = (s) => s.ih - s.vh; // what the keyboard (or anything else) covers at the bottom
  // Where a paragraph sits on the screen. Safari on iOS 27 gives client rects from the top of what the screen shows (the
  // visual viewport): with the keyboard up and the view panned, scrollY and vv.offsetTop both move, rects follow scrollY.
  const vis = (s, id) => (s.t[id] ? s.t[id].y : null);
  const st = read();
  const pt = (s, id, fx = 0.5, fy = 0.5) => {
    const r = s.t[id];
    if (!r || !st.off) return null;
    return { x: Math.round(r.x + r.w * fx + st.off.x), y: Math.round(r.y + r.h * fy + st.off.y) };
  };
  const dev = (s, x, y) => ({ x: Math.round(x + st.off.x), y: Math.round(y + st.off.y) });
  // The paragraph nearest a share of the visible height (for a hold low on the screen, where the keyboard will come).
  const at = (s, share) => Object.keys(s.t).filter((k) => /^p\d+$/.test(k)).map((k) => [k, Math.abs(vis(s, k) + s.t[k].h / 2 - s.vh * share)]).sort((a, b) => a[1] - b[1])[0]?.[0];
  const firstEv = (ss, type) => ss.find((s) => s.ev?.type === type);
  const range = (ss, f) => { const v = ss.map(f).filter((x) => x != null); return v.length ? [Math.min(...v), Math.max(...v)] : [0, 0]; };
  const spikes = (ss, id) => { // a jump of the paragraph you look at that comes back the next frames: a one-frame flash
    let n = 0, big = 0;
    for (let i = 1; i < ss.length - 1; i++) {
      const a = vis(ss[i - 1], id), b = vis(ss[i], id), c = vis(ss[i + 1], id);
      if (a == null || b == null || c == null) continue;
      if (Math.abs(b - a) > 30 && Math.abs(c - a) < 6) (n++, (big = Math.max(big, Math.abs(b - a))));
    }
    return { n, big };
  };
  const steady = (ss, s0, id, tol = 4) => {
    const [lo, hi] = range(ss, (s) => vis(s, id));
    const d = Math.max(Math.abs(lo - vis(s0, id)), Math.abs(hi - vis(s0, id)));
    return [`what you look at (${id}) stays put on screen`, d <= tol, `moved up to ${d}px`];
  };
  const noScroll = (ss, s0, tol = 2) => { const [lo, hi] = range(ss, (s) => s.sy); const d = Math.max(Math.abs(lo - s0.sy), Math.abs(hi - s0.sy)); return ['the page does not scroll', d <= tol, `scrollY ${s0.sy} → ${lo}..${hi}`]; };
  const inFloat = (s) => /textarea/.test(s.inner || '') && /@float/.test(s.inner || '');
  const fits = (s, box) => s[box] && s[box].y >= -1 && s[box].y + s[box].h <= s.vh + 1;
  const kbUp = (s) => kb(s) > 150;
  const kbDown = (s) => kb(s) < 60;
  // Safari paints a CSS highlight over whole blocks when its text can't be selected (17 Nov): the quoted words of an
  // open comment must sit on selectable text once the finger is up.
  const quoteOk = (ss) => { const end = ss.at(-1); return ['the quoted words are lit on selectable text (else Safari tints whole blocks)', end.quoteOnUnselectable !== true, end.quoteOnUnselectable == null ? 'nothing quoted' : end.quoteOnUnselectable ? 'unselectable' : 'selectable']; };
  // After a new comment is sent or dropped, the page goes back to where it was before the hold scrolled it (17 Nov).
  const back = (ss) => { const end = ss.at(-1); return ['the page goes back to where it was before the hold', st.before == null || Math.abs(end.sy - st.before) <= 2, `scrollY ${st.before} before, ${end.sy} now`]; };
  const pinShown = (ss, s0, box) => {
    st.before = s0.sy;
    const end = ss.at(-1), d = firstEv(ss, 'pointerdown');
    const want = d && { x: d.ev.cx, y: d.ev.cy - (end.sy - d.sy) };
    // The open thread's pin or the new one's; else the one nearest the finger.
    const pin = end.pins.find((p) => /\b(open|draft)\b/.test(p.c)) || (want && end.pins.map((p) => [p, Math.hypot(p.x + p.w / 2 - want.x, p.y + p.h - want.y)]).sort((a, b) => a[1] - b[1])[0]?.[0]);
    const b = end[box];
    return [
      ['the pin stays in view, above the ' + (box === 'card' ? 'thread' : 'box'), Boolean(pin && pin.y >= 0 && (!b || pin.y + pin.h <= b.y + 2)), pin ? `pin ${pin.y}..${pin.y + pin.h}, ${box} from ${b?.y}` : 'no pin near the finger'],
      ['the page moves only to show the pin', true, `moved ${end.sy - s0.sy}px`],
    ];
  };
  const top = (s) => dev(s, s.iw / 2, Math.max(70, (s.float?.y ?? s.card?.y ?? 200) - 110)); // the dimmed page above the box

  // ---- the steps ----
  const steps = [
    { name: 'calibrate', say: () => 'tap at (200, 330)', expect: (ss) => {
      const d = firstEv(ss, 'pointerdown');
      if (d) st.off = { x: 200 - d.ev.cx, y: 330 - d.ev.cy };
      return [['the tap reached the page', Boolean(d), d ? `client ${d.ev.cx},${d.ev.cy} → offset ${st.off.x},${st.off.y}` : 'no pointerdown seen'], ['a tap on the page makes no comment box', !ss.some((s) => s.float)]];
    } },
    // Words with a note on them wear ink, not a pin: a tap on them opens the thread, as a tap on a pin does.
    { name: 'tap-ink', say: (s) => `tap ${fmt(pt(s, 'intro', 0.18, 0.12))} (the first words of the intro, inked)`, expect: (ss, s0) => {
      const end = ss.at(-1);
      return [
        ['the thread opens', Boolean(end.card), JSON.stringify(end.card)],
        ['no keyboard just for reading', kbDown(end), `covers ${kb(end)}px`],
        ['the thread fits on the screen', fits(end, 'card'), JSON.stringify({ card: end.card, vt: end.vt, vh: end.vh })],
        ['no comment box from that tap', !ss.some((s) => s.float)],
        ['a tap on words selects no text', ss.every((s) => !s.sel)],
      ];
    } },
    { name: 'close-ink', say: (s) => `tap ${fmt(top(s))} (the dimmed page above the thread)`, expect: (ss, s0) => {
      const end = ss.at(-1);
      return [['the thread closes', !end.card], ['focus leaves the widget', !end.inner, end.inner], ['no new box from that tap', !end.float], noScroll(ss, s0)];
    } },
    { name: 'tap-no-pin', say: (s) => { st.tapId = at(s, 0.45); return `tap ${fmt(pt(s, st.tapId, 0.7))} (paragraph ${st.tapId})`; }, expect: (ss, s0) => [
      ['a short tap makes no comment box', !ss.some((s) => s.float)],
      ['a short tap selects no text', ss.every((s) => !s.sel)],
      noScroll(ss, s0),
    ] },
    { name: 'hold-link', say: (s) => `hold 0.8 s on ${fmt(pt(s, 'lnk', 0.15, 0.75))} (the link)`, expect: (ss, s0) => {
      const end = ss.at(-1);
      st.before = s0.sy;
      return [
        ['holding a link makes a comment box', ss.some((s) => s.float)],
        ['holding a link does not follow it', ss.every((s) => s.load === s0.load && s.href === s0.href), `${s0.href} → ${end.href}`],
        ['no link preview or callout (no contextmenu)', !firstEv(ss, 'contextmenu')],
        ['no click on the link after the hold', !ss.some((s) => s.ev?.type === 'click' && /a#lnk/.test(s.ev.on || ''))],
        quoteOk(ss),
        ['the cursor is in the new box', inFloat(end), end.inner || end.ae],
        ['the keyboard is up', kbUp(end), `covers ${kb(end)}px`],
        ['the box sits above the keyboard', fits(end, 'float'), JSON.stringify({ float: end.float, vt: end.vt, vh: end.vh })],
        noScroll(ss, s0),
        steady(ss, s0, 'intro'),
      ];
    } },
    { name: 'cancel-empty', say: (s) => `tap ${fmt(top(s))} (the dimmed page, clear of the grab zone above the box)`, expect: async (ss, s0) => {
      const end = ss.at(-1);
      return [
        ['an empty box closes on a tap outside', !end.float],
        ['the keyboard goes down', kbDown(end), `covers ${kb(end)}px`],
        ['focus leaves the widget', !end.inner, end.inner],
        ['no comment was saved', (await comments()).length === st.count0, `${(await comments()).length} comments`],
        ['the tap made no new box', !ss.slice(-5).some((s) => s.float)],
        back(ss),
      ];
    } },
    { name: 'hold-pin', say: (s) => { st.pinId = at(s, 0.5); return `hold 0.8 s on ${fmt(pt(s, st.pinId, 0.5))} (paragraph ${st.pinId})`; }, expect: (ss, s0) => {
      const end = ss.at(-1);
      const d = firstEv(ss, 'pointerdown');
      const shown = ss.find((s) => s.float);
      st.hold = { x: d?.ev.cx, y: d?.ev.cy, sy: d?.sy };
      st.base5 = vis(s0, st.pinId);
      return [
        ['a comment box opens', Boolean(shown), shown && d ? `after ${shown.at - d.at} ms` : ''],
        ['the cursor is in it', inFloat(end), end.inner || end.ae],
        ['the keyboard is up', kbUp(end), `covers ${kb(end)}px`],
        ['the box sits above the keyboard', fits(end, 'float'), JSON.stringify({ float: end.float, vt: end.vt, vh: end.vh })],
        ['no text got selected', ss.every((s) => !s.sel), ss.find((s) => s.sel)?.sel],
        ['no callout (no contextmenu)', !firstEv(ss, 'contextmenu')],
        ...pinShown(ss, s0, 'float'),
        quoteOk(ss),
        ((sp) => [`no one-frame jumps of what you look at`, sp.n === 0, `${sp.n} jumps, biggest ${sp.big}px`])(spikes(ss, st.pinId)),
      ];
    } },
    { name: 'type-send', say: () => 'type "phone check" then press return', expect: async (ss, s0) => {
      const end = ss.at(-1);
      const cs = await comments();
      const c = cs.find((x) => /^phone check$/i.test(x.text)); // iOS capitalises the first letter
      const pin = end.pins.map((p) => Math.hypot(p.x + p.w / 2 - st.hold.x, p.y + p.h / 2 - (st.hold.y - (end.sy - st.hold.sy)))).sort((a, b) => a - b)[0]; // on the page: the finger's spot, moved by any scroll since
      return [
        ['the comment was saved', Boolean(c)],
        ['the box closes', !end.float],
        ['the keyboard goes down', kbDown(end), `covers ${kb(end)}px`],
        ['focus leaves the widget', !end.inner, end.inner],
        ['the pin is where the finger was', pin != null && pin <= 24, `${Math.round(pin)}px away`],
        ['the dimming is gone', end.scrimOn === undefined ? true : !end.scrimOn, `scrim ${end.scrimOn ? 'shown' : 'hidden'}`],
        ((m) => ['the page waits for the card to land in its pin before going back', !m || !m.float, m ? `first move ${m.at - ss[0].at} ms in, card ${m.float ? 'still there' : 'gone'}` : 'no move'])(ss.find((x) => x.sy !== s0.sy)),
        back(ss),
        [`the page goes back to where it was before the hold`, Math.abs(vis(end, st.pinId) - st.base5) <= 4, `${st.pinId} at ${st.base5} before, ${vis(end, st.pinId)} after`],
        ((sp) => [`no one-frame jumps of what you look at`, sp.n === 0, `${sp.n} jumps, biggest ${sp.big}px`])(spikes(ss, st.pinId)),
      ];
    } },
    { name: 'tap-pin', say: (s) => { const p = s.pins.at(-1); return p ? `tap ${fmt(dev(s, p.x + p.w / 2, p.y + p.h / 2))} (the new pin)` : 'no pin on screen'; }, expect: (ss, s0) => {
      const end = ss.at(-1);
      return [
        ['the thread opens', Boolean(end.card), JSON.stringify(end.card)],
        ['no keyboard just for reading', kbDown(end), `covers ${kb(end)}px`],
        ['the thread fits on the screen', fits(end, 'card'), JSON.stringify({ card: end.card, vt: end.vt, vh: end.vh })],
        ...pinShown(ss, s0, 'card'),
        quoteOk(ss),
      ];
    } },
    { name: 'close-thread', say: (s) => `tap ${fmt(top(s))} (the dimmed page above the thread)`, expect: (ss, s0) => {
      const end = ss.at(-1);
      return [['the thread closes', !end.card], ['focus leaves the widget', !end.inner, end.inner], ['no new box from that tap', !end.float], noScroll(ss, s0), steady(ss, s0, st.pinId)];
    } },
    { name: 'hold-low', say: (s) => { st.low = at(s, 0.75); return `hold 0.8 s on ${fmt(pt(s, st.low, 0.3))} (paragraph ${st.low}, low on the screen, where the keyboard comes)`; }, expect: (ss, s0) => {
      const end = ss.at(-1);
      return [
        ['a comment box opens', ss.some((s) => s.float)],
        ['the cursor is in it', inFloat(end), end.inner || end.ae],
        ['the keyboard is up', kbUp(end), `covers ${kb(end)}px`],
        ['the box sits above the keyboard', fits(end, 'float'), JSON.stringify({ float: end.float, vt: end.vt, vh: end.vh })],
        ...pinShown(ss, s0, 'float'),
        ((sp) => [`no one-frame jumps of what you look at`, sp.n === 0, `${sp.n} jumps, biggest ${sp.big}px`])(spikes(ss, st.low)),
      ];
    } },
    { name: 'cancel-low', say: (s) => `tap ${fmt(top(s))} (the dimmed page, clear of the grab zone above the box)`, expect: async (ss, s0) => {
      const end = ss.at(-1);
      return [['the box closes', !end.float], ['the keyboard goes down', kbDown(end), `covers ${kb(end)}px`], ['nothing new was saved', (await comments()).length === st.count0 + 1], back(ss)];
    } },
    { name: 'page-field', say: (s) => `tap ${fmt(pt(s, 'field', 0.5))} (the page's own text field)`, expect: (ss) => {
      const end = ss.at(-1);
      return [
        ['the page\'s field gets the cursor', end.ae === 'input#field', end.ae],
        ['the widget does not take it', !end.inner, end.inner],
        ['no comment box', !ss.some((s) => s.float)],
        ['the keyboard is up', kbUp(end), `covers ${kb(end)}px`],
      ];
    } },
    { name: 'hold-while-typing', say: (s) => { st.mid = 'pic'; return `hold 0.8 s on ${fmt(pt(s, 'pic', 0.3))} (the picture, while the page's field has the keyboard)`; }, expect: (ss, s0) => {
      const end = ss.at(-1);
      return [
        ['a comment box opens', ss.some((s) => s.float)],
        ['the cursor moves into it', inFloat(end), end.inner || end.ae],
        ['the keyboard stays up', kbUp(end), `covers ${kb(end)}px`],
        ['the box sits above the keyboard', fits(end, 'float'), JSON.stringify({ float: end.float, vt: end.vt, vh: end.vh })],
        ...pinShown(ss, s0, 'float'),
      ];
    } },
    { name: 'cancel-mid', say: (s) => `tap ${fmt(top(s))} (the dimmed page, clear of the grab zone above the box)`, expect: (ss) => {
      const end = ss.at(-1);
      return [['the box closes', !end.float], ['the keyboard goes down', kbDown(end), `covers ${kb(end)}px`], ['focus does not jump back into the page\'s field', end.ae !== 'input#field', end.ae], back(ss)];
    } },
    { name: 'swipe-no-pin', say: () => 'swipe up: touch_path (200,650) → (200,300) over ~0.5 s', expect: (ss, s0) => {
      const end = ss.at(-1);
      return [['scrolling makes no comment box', !ss.some((s) => s.float)], ['the page scrolled', end.sy - s0.sy > 100, `scrollY ${s0.sy} → ${end.sy}`], ['no text got selected', ss.every((s) => !s.sel)]];
    } },
    // New since you looked: a section with an id is added to the page's file (the lab patches the open page), the pill
    // comes up by the bar, a tap on it opens the list as a small sheet that fits the screen, a tap on its item goes there.
    { name: 'tap-new', say: async () => {
      const file = path.join(RUN, 'site', 'index.html');
      fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('</body>', '<section id="v9"><h2>Version nine</h2><p>The agent added this.</p></section></body>'));
      await sleep(3000); // the patch, then the check
      const s = lines().at(-1);
      return s.pill ? `tap ${fmt(dev(s, s.pill.x + s.pill.w / 2, s.pill.y + s.pill.h / 2))} (the "New · 1" pill above the bar)` : 'no pill came up (was the page opened before the edit?)';
    }, expect: (ss) => {
      const end = ss.at(-1);
      const sh = end.sheet;
      return [
        ['the pill is big enough to hit', ss.some((s) => s.pill && s.pill.h >= 32)],
        ['a tap on it opens the list with the new one', end.news === 1, `${end.news} items`],
        ['the sheet fits the screen', Boolean(sh) && sh.x >= 0 && sh.x + sh.w <= end.iw && sh.y + sh.h <= end.ih, JSON.stringify(sh)],
      ];
    } },
    { name: 'go-new', say: (s) => (s.item ? `tap ${fmt(dev(s, s.item.x + s.item.w / 2, s.item.y + s.item.h / 2))} (the item in the sheet)` : 'no item on screen'), expect: (ss, s0) => {
      const end = ss.at(-1);
      return [['the sheet closes and the page goes to the section', !end.sheet && end.sy > s0.sy, `scrollY ${s0.sy} → ${end.sy}`], ['it drops off the list: no pill', !end.pill]];
    } },
  ];
  const fmt = (p) => (p ? `(${p.x}, ${p.y})` : '(not on screen)');

  if (cmd === 'next') {
    const as = args.includes('--as') ? args[args.indexOf('--as') + 1] : null;
    if (as && as !== st.as) Object.assign(st, { as, step: 0, off: null });
    const step = steps[st.step];
    if (!step) { console.log('all steps done: node test/phone/sim.mjs report'); process.exit(0); }
    await sleep(400);
    const s = lines().at(-1);
    if (!s) { console.log('the recorder has sent nothing yet: open the page first'); process.exit(1); }
    if (st.step === 0) st.count0 = (await comments()).length;
    st.mark = Date.now();
    console.log(`${st.as} · step ${st.step + 1}/${steps.length} ${step.name}: ${await step.say(s)}`);
    save(st);
  } else if (cmd === 'check') {
    const step = steps[st.step];
    await sleep(700);
    const all = lines();
    const s0 = all.filter((l) => l.at < st.mark).at(-1);
    const ss = all.filter((l) => l.at >= st.mark);
    if (!ss.length) { console.log('nothing recorded since `next`'); process.exit(1); }
    const out = await step.expect(ss, s0);
    st.results[st.as] ||= {};
    st.results[st.as][step.name] = out.map(([n, ok, d]) => ({ n, ok: Boolean(ok), d: d ?? '' }));
    for (const r of st.results[st.as][step.name]) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${step.name}: ${r.n}${r.d ? ` (${r.d})` : ''}`);
    if (!args.includes('--again')) st.step++;
    save(st);
  } else if (cmd === 'report') {
    for (const [as, byStep] of Object.entries(st.results)) {
      const all = Object.values(byStep).flat();
      console.log(`\n${as}: ${all.filter((r) => r.ok).length}/${all.length} ok`);
      for (const [name, rs] of Object.entries(byStep)) for (const r of rs) if (!r.ok || args.includes('--all')) console.log(`  ${r.ok ? 'ok  ' : 'FAIL'} ${name}: ${r.n}${r.d ? ` (${r.d})` : ''}`);
    }
  } else if (cmd === 'ask') {
    const from = Date.now();
    fs.writeFileSync(path.join(RUN, 'ask.js'), args.join(' '));
    for (let i = 0; i < 20; i++) { await sleep(300); const a = lines().find((l) => l.why === 'answer' && l.at >= from); if (a) { console.log(a.answer); process.exit(0); } }
    console.log('no answer (is the page open?)');
  } else if (cmd === 'back') { st.step = Math.max(0, st.step - 1); save(st); console.log(`back to step ${st.step + 1}: ${steps[st.step].name}`); }
  else console.log('serve | next [--as safari|chrome] | check [--again] | report [--all] | back');
}
