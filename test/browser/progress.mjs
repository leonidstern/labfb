// "Never stuck" in real browsers (WebKit and Chrome's engine): the agent's progress line in the connection pill and on a
// working pin's tooltip (no message bubble), the queue ("2 waiting", "1st in line" in a thread's stamp), the ring colours
// (still pale green picked up, turning working, muted waiting, grey when it went quiet, amber when it asks, none when done),
// and the pill going back to normal after an answer.
// Not part of `npm test`; CI runs it in the `browser` job. Run: node test/browser/progress.mjs (needs playwright; NODE_PATH
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'labit-progress-'));
  const port = String(claimPort(6300 + n * 40, 30));
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
    await p.clock.install({ time: Date.now() });
    await p.goto(L.B + '/');
    await until(() => p.evaluate(() => [...document.querySelectorAll('*')].some((n) => n.shadowRoot?.querySelector('.scrim'))), 1200); // not p.waitForFunction: the page's clock is faked
    // In the widget's shadow root. The pins are in the order the threads were made.
    const shadow = (fn, arg) => p.evaluate(([f, a]) => new Function('r', 'a', f)([...document.querySelectorAll('*')].find((n) => n.shadowRoot?.querySelector('.scrim')).shadowRoot, a), [fn.toString().replace(/^[^{]*{|}$/g, ''), arg]);
    const pins = () => shadow(() => { return [...r.querySelectorAll('button.pin')].map((b) => [(/\bgone\b/.test(b.querySelector('.ring')?.className) ? '' : b.querySelector('.ring')?.className.replace(/\s*(come|off)\b/g, '')) || '', b.querySelector('.tip')?.textContent || '']); });
    const ringOf = async (i) => (await pins())[i]?.[0];
    const tipOf = async (i) => (await pins())[i]?.[1];
    const pill = () => shadow(() => { return r.querySelector('.listener .lbl')?.textContent || ''; });
    const pillIs = (re) => until(async () => re.test(await pill()), 8000);
    const ringIs = (i, ring) => until(async () => (await ringOf(i)) === ring);
    // All the rings at once, so the check after it doesn't catch one pin a moment behind another.
    const ringsAre = (want) => until(async () => JSON.stringify((await pins()).map((x) => x[0])) === JSON.stringify(want));

    const ids = [await L.post('make it red', '#a'), await L.post('and bigger', '#b'), await L.post('and blue', '#c')];
    await until(async () => (await pins()).length === 3);
    check(eng, 'sent pins wear no ring', (await pins()).every(([ring]) => ring === ''), JSON.stringify(await pins()));
    // The listening mark: grey when no agent listens (not black), and its tooltip names the state.
    const mark = () => shadow(() => { const w = r.querySelector('.listener'); return { title: w?.title || '', fill: w?.querySelector('.mark') ? getComputedStyle(w.querySelector('.mark')).fill : '' }; });
    await until(async () => /^Away/.test((await mark()).title));
    const away = await mark();
    check(eng, 'away: a grey mark and the tooltip says Away', /^Away/.test(away.title) && /rgba\(/.test(away.fill), JSON.stringify(away));

    // The agent takes all three: the oldest is picked up (pale green, still), the others wait in line (muted, still).
    const heard = await L.cli('wait', '--timeout', '5');
    check(eng, 'the agent got them', ids.every((id) => heard.out.includes(id)));
    await ringsAre(['ring got', 'ring wait', 'ring wait']);
    check(eng, 'picked up: a still pale green ring; the rest wait with a still muted ring', (await ringOf(0)) === 'ring got' && (await ringOf(1)) === 'ring wait' && (await ringOf(2)) === 'ring wait', JSON.stringify(await pins()));
    check(eng, 'the pill counts those waiting', await pillIs(/is working · 2 waiting/), await pill());
    check(eng, 'working: a green mark and the tooltip says Working', /^Working/.test((await mark()).title) && (await mark()).fill === 'rgb(36, 160, 70)', JSON.stringify(await mark()));
    await shadow(() => { [...r.querySelectorAll('button.pin')][1].click(); });
    await until(() => shadow(() => { return !!r.querySelector('.card .stamp'); }));
    const stamp = () => shadow(() => { return r.querySelector('.card .msg.mine .stamp .tm')?.textContent || ''; });
    check(eng, 'a waiting pin says its place in its thread', /^waiting · 1st in line · #2 · /.test(await stamp()), await stamp());
    await p.keyboard.press('Escape');

    // Progress: the ring turns, the pill says what it does, hovering says it too, and no message is added.
    const say = await L.cli('reply', ids[0], '--progress', 'drawing W1–W6 · 2 of 4');
    check(eng, 'labit reply --progress works', say.code === 0 && /Progress noted/.test(say.out), say.out.trim());
    await ringsAre(['ring', 'ring wait', 'ring wait']);
    check(eng, 'working (progress): the green ring turns; the others still wait', (await ringOf(0)) === 'ring' && (await ringOf(1)) === 'ring wait', JSON.stringify(await pins()));
    check(eng, 'the pill reads the line with its age and the queue', await pillIs(/^Claude· drawing W1–W6 · 2 of 4 · just now · 2 waiting/), await pill());
    check(eng, 'hovering the ring shows the same line', (await tipOf(0)) === 'drawing W1–W6 · 2 of 4 · just now', await tipOf(0));
    const got = await L.comments();
    check(eng, 'no message was added, nothing is done', got.length === 3 && got[0].progress?.text === 'drawing W1–W6 · 2 of 4' && !got[0].resolved);
    const width = () => shadow(() => { return Math.round(r.querySelector('.listener').getBoundingClientRect().width); });
    const w1 = await width();
    await L.cli('reply', ids[0], '--progress', 'a different and much longer line about what is being drawn right now, with more words');
    await pillIs(/different and much longer/);
    check(eng, 'a longer line does not make the pill wider (nothing beside it moves)', (await width()) === w1, `${w1} → ${await width()} px`);

    // A question: amber and still, the pill back to normal; then done: no ring, and the next one in line is picked up.
    await L.cli('reply', ids[0], 'green or red?', '--question');
    await ringIs(0, 'ring asks');
    check(eng, 'a question: an amber ring, and the pill has no line', (await ringOf(0)) === 'ring asks' && (await pillIs(/is working · 1 waiting/)) && !/drawing/.test(await pill()), `${await ringOf(0)} | ${await pill()}`);
    check(eng, 'the progress line is gone from the thread (cleared by the answer)', (await L.comments()).find((c) => c.id === ids[0]).progress === undefined);
    await L.cli('reply', ids[0], 'Done: red', '--done');
    await ringsAre(['', 'ring got', 'ring wait']);
    check(eng, 'done: no ring; the next is picked up and the last is first in line', (await ringOf(0)) === '' && (await ringOf(1)) === 'ring got' && (await ringOf(2)) === 'ring wait', JSON.stringify(await pins()));

    // Gone quiet: 6 minutes with no sign → grey still ring; the pill says so and what came last; a new line brings it back.
    await L.cli('reply', ids[1], '--progress', 'drawing W1–W6 · 3 of 4');
    await ringIs(1, 'ring');
    await p.clock.runFor(6.5 * 60 * 1000);
    await ringsAre(['', 'ring stale', 'ring wait']);
    check(eng, 'no sign for 5+ min: a grey still ring (the one waiting behind it is not grey)', (await ringOf(1)) === 'ring stale' && (await ringOf(2)) === 'ring wait', JSON.stringify(await pins()));
    check(eng, 'the pill says how long and what came last', await pillIs(/no update for 6 min · last: drawing W1–W6 · 3 of 4 · 1 waiting/), await pill());
    check(eng, 'the tooltip says it too', /^no update for 6 min · last: drawing W1–W6 · 3 of 4$/.test(await tipOf(1)), await tipOf(1));
    // The next line replaces the old one on the thread (the page's own clock is moved ahead here, the lab's is not, so
    // it would still read as old: the stored line is what's checked).
    await L.cli('reply', ids[1], '--progress', 'drawing W1–W6 · 4 of 4');
    check(eng, 'the next line replaces the last on the thread', (await L.comments()).find((c) => c.id === ids[1]).progress?.text === 'drawing W1–W6 · 4 of 4');
    // A named session: the pill has no name in its words; the name is in its tooltip.
    for (const id of ids) await L.cli('reply', id, 'Done', '--done');
    const named = L.cli('wait', '--name', 'ooze', '--timeout', '4');
    const pillTip = () => shadow(() => { const w = r.querySelector('.listener'); return { words: w?.querySelector('.lbl')?.textContent || '', title: w?.title || '' }; });
    await until(async () => /session: ooze/.test((await pillTip()).title), 3000);
    const nm = await pillTip();
    check(eng, 'a named session: the pill has no name in its words, the tooltip has it', /session: ooze/.test(nm.title) && !/ooze/.test(nm.words), JSON.stringify(nm));
    await named;
    await p.close();
  } finally {
    await browser.close();
    L.stop();
  }
}
process.exit(failed ? 1 : 0);
