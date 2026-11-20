// Edge cases of ink on selected words (the flag inkOnText, src/widget/wordink.ts) when the text re-flows under it:
// the paragraph narrowed so the words wrap, the font grown, the paragraph drawn again by the page (a new text node),
// one inked word wrapped in an element, words added before them, the same words added a second time, a draft's band
// while the text re-flows, and a drawing made over and through inked words.
// Run: NODE_PATH=… ENGINES=chromium node test/browser/edge-draw5.mjs   (also ENGINES=webkit)
import { check, done, drawn, eachEngine, go, lab, look, mark, note, ring, root, said, send, sleep, stroke, until, known } from './edge-draw-kit.mjs';

const TEXT = 'Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau';
const PAGE = `<!doctype html><meta charset="utf-8"><title>Ink</title><style>body{margin:30px;font:18px/1.5 Georgia,serif;width:640px} #a{width:420px;margin:60px 0}</style><body><p id="a">${TEXT}</p><p id="b">Second paragraph with plain words in it</p><div style="height:500px"></div></body>`;
const NAMES = ['wrap', 'size', 'render', 'bold', 'insert', 'twice', 'draft', 'over', 'strike'];
const L = await lab(Object.fromEntries(NAMES.map((n) => [n, PAGE])), { flags: { inkOnText: true } });
const short = (o) => JSON.stringify(o).slice(0, 380);
// What the widget saves for words someone selected in #a.
const words = (text) => {
  const i = TEXT.indexOf(text);
  return { kind: 'text', selector: '#a', x: 0.5, y: 0.5, docX: 0.3, docY: 100, width: 1000, text: TEXT, element: '<p id="a"', quote: { exact: text, prefix: TEXT.slice(Math.max(0, i - 40), i), suffix: TEXT.slice(i + text.length, i + text.length + 40), selected: true } };
};
const say = async (page, text, note = 'a note on words') => (await L.call({ page: `/${page}`, name: 'leo', text: note, anchor: words(text) })).comment;

// The ink as the page has it: each state's highlight with its words, the lines they are on, and the pins.
const ink = (p) =>
  p.evaluate((r) => {
    const R = new Function(`return ${r}`)();
    return {
      inks: [...CSS.highlights].filter(([k]) => k.startsWith('lab-ink-') && k !== 'lab-ink-sel').flatMap(([k, h]) => [...h].map((range) => {
        const rects = [...range.getClientRects()].filter((b) => b.width > 1);
        return { st: k.slice(8), text: String(range).replace(/\s+/g, ' ').trim(), lines: new Set(rects.map((b) => Math.round(b.top))).size, first: rects[0] && [Math.round(rects[0].left + 8), Math.round(rects[0].top + rects[0].height / 2)], last: rects.length ? [Math.round(rects.at(-1).right - 8), Math.round(rects.at(-1).top + rects.at(-1).height / 2)] : null, live: range.startContainer.isConnected, at: range.startOffset };
      })),
      pins: [...R.querySelectorAll('button.pin')].map((b) => ({ ink: b.classList.contains('on-ink'), seen: !/rgba\(0, 0, 0, 0\)|transparent/.test(getComputedStyle(b).backgroundColor), drawing: b.classList.contains('ink') })),
      card: R.querySelector('.card')?.textContent || '',
    };
  }, root);
const one = (s) => (s.inks.length === 1 ? s.inks[0] : { text: `${s.inks.length} inks` });
const unseen = (s) => s.pins.filter((x) => !x.drawing).every((x) => x.ink && !x.seen);

try {
  await eachEngine({}, async ({ eng, p }) => {
    const can = await (async () => { await go(p, L.B, 'wrap'); return p.evaluate(() => typeof Highlight === 'function' && Boolean(CSS.highlights)); })();
    if (!can) return note(eng, 'this browser has no highlights: selected words keep their pins, nothing to check here');

    // 1. The paragraph narrowed: the inked words wrap onto more lines.
    await say('wrap', 'gamma delta epsilon zeta eta');
    await go(p, L.B, 'wrap');
    await sleep(900);
    const w0 = await ink(p);
    await p.evaluate(() => (document.getElementById('a').style.width = '150px'));
    await sleep(900);
    const w1 = await ink(p);
    check(eng, 'the paragraph narrowed, the inked words now on more lines: the ink is on the same words, their pin still unseen', one(w0).lines === 1 && one(w1).text === 'gamma delta epsilon zeta eta' && one(w1).lines >= 2 && unseen(w1), short({ before: w0.inks, after: w1.inks, pins: w1.pins }));
    await p.mouse.click(...(one(w1).last || [1, 1]));
    await until(p, '.card', 2000);
    check(eng, 'after the re-flow a click on the words\' last line (where there was no ink before) opens their thread', (await ink(p)).card.includes('a note on words'), short((await ink(p)).card.slice(0, 80)));
    await p.keyboard.press('Escape');

    // 2. The font grown to twice its size, and the window resized.
    await say('size', 'theta iota kappa lambda');
    await go(p, L.B, 'size');
    await sleep(900);
    await p.evaluate(() => (document.body.style.fontSize = '36px'));
    await p.setViewportSize({ width: 820, height: 640 });
    await sleep(900);
    const s1 = await ink(p);
    await p.mouse.click(...(one(s1).first || [1, 1]));
    await until(p, '.card', 2000);
    const s2 = await ink(p);
    check(eng, 'the font doubled and the window resized: the ink is on the same words, and a click on their new place opens the thread', one(s1).text === 'theta iota kappa lambda' && unseen(s1) && s2.card.includes('a note on words'), short({ inks: s1.inks, card: s2.card.slice(0, 60) }));
    await p.keyboard.press('Escape');
    await p.setViewportSize({ width: 1000, height: 700 });

    // 3. The page draws the paragraph again with the same words (a framework's re-render: a new text node).
    await say('render', 'gamma delta epsilon');
    await go(p, L.B, 'render');
    await sleep(900);
    await p.evaluate(() => { const e = document.getElementById('a'); e.innerHTML = e.textContent; });
    let r1 = await ink(p);
    const t0 = Date.now();
    while (Date.now() - t0 < 8000 && !(one(r1).text === 'gamma delta epsilon' || r1.pins.some((x) => x.seen))) (await sleep(250), (r1 = await ink(p)));
    // Either mark will do: the ink on the new words, or the pin shown instead. Neither is a comment nobody can see.
    known(eng, 'the paragraph drawn again by the page (same words, a new text node, nothing else changes): within 8 s the comment is marked again by itself, as ink on the new words or as its pin', (one(r1).text === 'gamma delta epsilon' && one(r1).live) || r1.pins.some((x) => x.seen), `after ${Date.now() - t0} ms: ${short(r1)}`);
    await p.evaluate(() => dispatchEvent(new Event('resize')));
    await sleep(900);
    const r2 = await ink(p);
    note(eng, 'the same after the window is resized (which makes the widget look again)', short({ inks: r2.inks.map((x) => [x.st, x.text, x.live]), pins: r2.pins }));

    // 4. One of the inked words wrapped in an element (bold) by the page.
    await say('bold', 'gamma delta epsilon');
    await go(p, L.B, 'bold');
    await sleep(900);
    await p.evaluate(() => { const e = document.getElementById('a'); e.innerHTML = e.textContent.replace('delta', '<b>delta</b>'); dispatchEvent(new Event('resize')); });
    await sleep(1500);
    const b1 = await ink(p);
    check(eng, 'one inked word made bold by the page (the words now in three pieces): the ink is on all three words, no pin showing', one(b1).text === 'gamma delta epsilon' && one(b1).live && unseen(b1), short(b1));

    // 5. Words added before the inked ones (the paragraph written again, longer).
    await say('insert', 'gamma delta epsilon');
    await go(p, L.B, 'insert');
    await sleep(900);
    await p.evaluate(() => { const e = document.getElementById('a'); e.textContent = 'Some new words came first. ' + e.textContent; dispatchEvent(new Event('resize')); });
    await sleep(1500);
    const i1 = await ink(p);
    check(eng, 'words added before the inked ones: the ink moves with its words', one(i1).text === 'gamma delta epsilon' && one(i1).live && one(i1).at > 30 && unseen(i1), short(i1));

    // 6. The same words written a second time, earlier in the paragraph: the ink stays on the ones it was made on.
    await say('twice', 'gamma delta');
    await go(p, L.B, 'twice');
    await sleep(900);
    await p.evaluate(() => { const e = document.getElementById('a'); e.textContent = 'First, gamma delta again. ' + e.textContent; dispatchEvent(new Event('resize')); });
    await sleep(1500);
    const t1 = await ink(p);
    check(eng, 'the same words added a second time, earlier: the ink is on the words it was made on (after "Alpha beta"), not on the new copy', one(t1).text === 'gamma delta' && one(t1).at > 30, short(t1.inks));

    // 7. A draft on selected words, the text re-flowed before it is sent.
    await go(p, L.B, 'draft');
    await sleep(600);
    await p.keyboard.down('Shift');
    await p.evaluate(() => { const t = document.getElementById('a').firstChild; const r = document.createRange(); const i = t.data.indexOf('gamma'); r.setStart(t, i); r.setEnd(t, i + 'gamma delta epsilon'.length); getSelection().removeAllRanges(); getSelection().addRange(r); });
    await p.evaluate(() => document.dispatchEvent(new MouseEvent('mouseup', { shiftKey: true, button: 0, bubbles: true })));
    await p.keyboard.up('Shift');
    await sleep(700);
    const d0 = await ink(p);
    await p.evaluate(() => (document.getElementById('a').style.width = '130px'));
    await p.evaluate(() => dispatchEvent(new Event('resize')));
    await sleep(900);
    const d1 = await ink(p);
    check(eng, 'words selected for a comment, the paragraph narrowed before it is sent: the draft\'s band stays on the same words, now on more lines', one(d0).st === 'draft' && one(d1).st === 'draft' && one(d1).text === 'gamma delta epsilon' && one(d1).lines >= 2, short({ before: d0.inks, after: d1.inks }));
    await p.keyboard.type('sent after the re-flow');
    await p.keyboard.press('Enter');
    await sleep(1000);
    const saved = (await L.comments('draft'))[0];
    const d2 = await ink(p);
    const draftText = await L.agent('draft');
    check(eng, 'sent after that re-flow: saved as those selected words, inked, and the agent is given the words', saved?.anchor.quote?.exact === 'gamma delta epsilon' && saved.anchor.quote.selected === true && one(d2).text === 'gamma delta epsilon' && /gamma delta epsilon/.test(draftText) && /sent after the re-flow/.test(draftText), `${short(saved?.anchor.quote)} ${short(d2.inks)}`);
    await p.keyboard.press('Escape');

    // 8. A loop drawn round inked words: both live side by side.
    await say('over', 'gamma delta');
    await go(p, L.B, 'over');
    await sleep(900);
    const o0 = await ink(p);
    const [fx, fy] = one(o0).first || [100, 100];
    const [lx] = one(o0).last || [200];
    const loop = ring((fx + lx) / 2, fy, (lx - fx) / 2 + 34, 30);
    const made = await drawn(p, [loop]);
    if (made.box) await send(p, 'a loop round them');
    const o1 = await ink(p);
    const overText = await L.agent('over');
    check(eng, 'a loop drawn round inked words: a drawing is made and the words keep their ink; the agent gets both, the loop with the words in it', made.box && made.draftInk === 1 && one(o1).text === 'gamma delta' && o1.pins.filter((x) => x.drawing).length === 1 && /drawn: (circled|box)/.test(overText) && /a note on words/.test(overText) && /text in area: "[^"]*gamma delta/.test(overText), `${short(o1.inks.map((x) => [x.st, x.text]))} ${said(overText)}`);
    await p.mouse.click(fx, fy);
    await until(p, '.card', 2000);
    const onWords = (await ink(p)).card;
    await p.keyboard.press('Escape');
    await sleep(300);
    await p.mouse.click(Math.round(loop[6][0]), Math.round(loop[6][1]));
    await until(p, '.card', 2000);
    const onLine = (await ink(p)).card;
    check(eng, 'a click on the inked words inside the loop opens the words\' note; a click on the loop\'s line opens the drawing\'s', onWords.includes('a note on words') && !onWords.includes('a loop round them') && onLine.includes('a loop round them'), short({ onWords: onWords.slice(0, 50), onLine: onLine.slice(0, 50) }));
    await p.keyboard.press('Escape');

    // 9. A line drawn through inked words, starting and ending on them (a press on inked words opens their thread).
    await say('strike', 'gamma delta epsilon');
    await go(p, L.B, 'strike');
    await sleep(900);
    const k0 = await ink(p);
    const [sx, sy] = one(k0).first || [100, 100];
    const [ex] = one(k0).last || [200];
    const k1 = await drawn(p, [[[sx, sy], [ex, sy + 1]]], 10);
    const k2 = await ink(p);
    if (k1.box) await send(p, 'cut these');
    const strikeText = await L.agent('strike');
    check(eng, 'D held, a line through inked words from their first letter to their last: a drawing (crossed out, those words), their own thread does not open', k1.box && k1.draftInk === 1 && !k2.card && /drawn: crossed out/.test(strikeText) && /text in area: "[^"]*gamma delta epsilon/.test(strikeText), `${short({ box: k1.box, draftInk: k1.draftInk, card: k2.card.slice(0, 40) })} ${said(strikeText)}`);
    void look; void mark; void stroke;
  });
} finally {
  L.stop();
}
done();
