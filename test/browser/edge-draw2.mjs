// Edge cases of drawing pins (hold D and drag): strokes that join or don't, D let go and pressed again, D let go
// before the pointer lifts, the one-second wait that ends a drawing and a stroke after it, Escape, a window blur and a
// pointercancel mid-stroke, a 1000-point stroke and ten strokes (what reaches the store), two drawings in a row, and
// a reload with a drawing not sent yet.
// Run: NODE_PATH=… ENGINES=chromium node test/browser/edge-draw2.mjs   (also ENGINES=webkit)
import { box, check, done, drawn, eachEngine, go, lab, letters, look, mark, note, ring, root, said, send, sleep, stroke, until } from './edge-draw-kit.mjs';

const PAGE = '<!doctype html><meta charset="utf-8"><title>d</title><style>body{margin:40px;font:20px/1.5 sans-serif} h1{margin:0 0 80px} p{width:600px;margin:0 0 60px}</style><h1 id="h">Pricing</h1><p id="a">Plans start small and grow with you</p><p id="b">Cancel any time from your account</p><p id="c">Questions go to the team</p>';
const NAMES = ['halves', 'far', 'same', 'again', 'early', 'wait', 'esc', 'blur', 'cancel', 'big', 'ten', 'quick', 'quick2', 'reload', 'reload2'];
const L = await lab(Object.fromEntries(NAMES.map((n) => [n, PAGE])));
const short = (o) => JSON.stringify(o).slice(0, 320);

try {
  await eachEngine({}, async ({ eng, p }) => {
    const inks = async (page) => (await L.comments(page)).filter((x) => x.anchor?.ink);

    // 1. A circle in two halves: the second starts where the first ended, so they are one line.
    await go(p, L.B, 'halves');
    const h = await box(p, 'h');
    const r = [h.cx, h.cy, h.w / 2 + 30, 44];
    await drawn(p, [ring(...r, 0, 180, 14), ring(...r, 180, 360, 14)]);
    await send(p);
    const halves = await L.agent('halves');
    check(eng, 'a circle drawn in two halves (the second starts where the first ended) reads as one circle, both lines kept', /drawn: (circled|box drawn around it)/.test(halves) && (await inks('halves'))[0]?.anchor.ink.pts.length === 2 && /Pricing/.test(halves), said(halves));

    // 2. Two strokes far apart while D is held: one drawing, two lines, not read as anything it isn't.
    await go(p, L.B, 'far');
    const a = await box(p, 'a');
    const c = await box(p, 'c');
    await drawn(p, [[[a.l, a.b + 3], [a.l + 150, a.b + 4]], [[c.l, c.b + 3], [c.l + 150, c.b + 4]]]);
    await send(p);
    const far = await L.agent('far');
    check(eng, 'two strokes far apart while D is held are one drawing with two lines, sent as "2 strokes, unclear"', (far.match(/^## /gm) || []).length === 1 && /drawn: 2 strokes, unclear mark/.test(far) && (far.match(/ M\d| M-\d|: M\d/g) || []).length === 2 && /Questions/.test(far), said(far));

    // 2b. A loop that ends on the very pixel it began (a mouse gives whole pixels, so a neat circle can).
    await go(p, L.B, 'same');
    const hs = await box(p, 'a');
    await drawn(p, [ring(hs.l + 60, hs.cy, 70, 26, 0, 360)]);
    await send(p);
    const same = (await inks('same'))[0]?.anchor;
    const sameText = await L.agent('same');
    const hitW = await p.evaluate((r) => { const b = new Function(`return ${r}`)().querySelector('.pin.ink path.hit')?.getBoundingClientRect(); return b ? Math.round(b.width) : -1; }, root);
    check(eng, 'a loop that ends on the very pixel it began keeps its line: the sent drawing can be seen and clicked, the agent gets the loop', (same?.ink.pts[0].length || 0) > 8 && hitW > 100 && /drawn: (circled|box)/.test(sameText), `${(same?.ink.pts[0].length || 0) / 2} points kept (${JSON.stringify(same?.ink.pts[0])}), the line to click is ${hitW} px wide; ${said(sameText)}`);

    // 3. D let go after one stroke (its box opens), then D pressed and a second stroke drawn.
    await go(p, L.B, 'again');
    const a3 = await box(p, 'a');
    const c3 = await box(p, 'c');
    const first = await drawn(p, [ring(a3.l + 60, a3.cy, 70, 26)]);
    await p.keyboard.down('d');
    const afterD = await look(p);
    await stroke(p, ring(c3.l + 60, c3.cy, 70, 26));
    await p.keyboard.up('d');
    await sleep(1300);
    const second = await look(p);
    const stored = await p.evaluate(() => Object.entries(localStorage).filter(([k]) => /^lab-(typing|spot)/.test(k)).map(([k, v]) => `${k}=${v.slice(0, 30)}`).join(' '));
    check(eng, 'D let go, then pressed again for a second stroke: the first drawing is not lost from the page (still the open draft, or joined by the new stroke)', first.box && second.box && second.draftInk === 1 && second.draftAt.t <= first.draftAt.t + 4 && second.live === 0, short({ first: first.draftAt, afterD: { box: afterD.box, typed: afterD.typed }, afterStroke: { box: second.box, typed: second.typed, draftInk: second.draftInk, at: second.draftAt }, stored }));
    await p.keyboard.press('Escape');

    // 4. D let go before the pointer lifts.
    await go(p, L.B, 'early');
    const e0 = await look(p);
    const a4 = await box(p, 'a');
    const pts = ring(a4.l + 60, a4.cy, 80, 28);
    await p.keyboard.down('d');
    await p.mouse.move(...pts[0]);
    await p.mouse.down();
    for (const q of pts.slice(1, 13)) await p.mouse.move(...q, { steps: 4 });
    await p.keyboard.up('d');
    for (const q of pts.slice(13)) await p.mouse.move(...q, { steps: 4 });
    await p.mouse.up();
    await until(p, '.float textarea', 2500);
    const e1 = await look(p);
    check(eng, 'D let go before the pointer lifts: the stroke is drawn to its end and its box opens', e1.box && e1.draftInk === 1 && e1.draftAt.r - e1.draftAt.l > 140, short(e1.draftAt));
    check(eng, 'D let go before the pointer lifts: done pins are not shown or hidden by it', e0.hideDone === e1.hideDone, `lab-hide-done "${e0.hideDone}" -> "${e1.hideDone}"`);
    await p.keyboard.press('Escape');

    // 5. D held, one stroke, a wait of more than a second (the drawing is done by itself), then another stroke.
    await go(p, L.B, 'wait');
    const w0 = await look(p);
    const a5 = await box(p, 'a');
    const c5 = await box(p, 'c');
    await p.keyboard.down('d');
    await stroke(p, ring(a5.l + 60, a5.cy, 70, 26));
    await sleep(1400);
    const w1 = await look(p);
    check(eng, 'D still held, a second after the stroke: the box opens by itself with the lines', w1.box && w1.draftInk === 1 && w1.live === 0, short({ box: w1.box, draftInk: w1.draftInk, live: w1.live }));
    await stroke(p, ring(c5.l + 60, c5.cy, 70, 26));
    await sleep(1400);
    const w2 = await look(p);
    await p.keyboard.up('d');
    await sleep(300);
    const w3 = await look(p);
    check(eng, 'a stroke drawn after that wait, D never let go: the first stroke is not thrown away (it is in the draft, alone or with the new one)', w2.box && w2.draftInk === 1 && w2.draftAt.t < a5.b && w2.draftAt.b > a5.t, short({ first: w1.draftAt, after: w2.draftAt, strokes: w2.draftStrokes }));
    check(eng, 'letting D go at the end of it flips no done pins and types nothing', w3.hideDone === w0.hideDone && w3.typed === '', short({ hideDone: [w0.hideDone, w3.hideDone], typed: w3.typed }));
    await p.keyboard.press('Escape');

    // 6. Escape in the middle of a stroke.
    await go(p, L.B, 'esc');
    const a6 = await box(p, 'a');
    const ps = ring(a6.l + 60, a6.cy, 80, 28);
    await p.keyboard.down('d');
    await p.mouse.move(...ps[0]);
    await p.mouse.down();
    for (const q of ps.slice(1, 13)) await p.mouse.move(...q, { steps: 4 });
    await p.keyboard.press('Escape');
    const mid = await look(p);
    for (const q of ps.slice(13)) await p.mouse.move(...q, { steps: 4 });
    await p.mouse.up();
    await p.keyboard.up('d');
    await sleep(1400);
    const e6 = await look(p);
    // Either answer is a fair one (Escape drops the stroke, or it is not Escape's to take): never half of each.
    const dropped = !e6.box && !e6.live && !e6.draftInk;
    const kept = e6.box && e6.draftInk === 1 && !e6.live;
    check(eng, 'Escape mid-stroke leaves nothing half done: the stroke is dropped whole or drawn whole, no lines left on the page, nothing stuck', (dropped || kept) && !e6.dragging, short({ mid: { live: mid.live, dragging: mid.dragging }, after: { box: e6.box, live: e6.live, draftInk: e6.draftInk, dragging: e6.dragging, at: e6.draftAt } }));
    note(eng, 'Escape mid-stroke today', dropped ? 'drops the stroke' : kept ? `does nothing: the stroke goes on and its box opens (${e6.draftAt.r - e6.draftAt.l} px wide)` : 'half done');
    await p.keyboard.press('Escape');

    // 7. D held, a stroke, then the window loses the keyboard (another app, a dialog): keyup never comes.
    await go(p, L.B, 'blur');
    const b0 = await look(p);
    const a7 = await box(p, 'a');
    await p.keyboard.down('d');
    await stroke(p, ring(a7.l + 60, a7.cy, 70, 26));
    await p.evaluate(() => window.dispatchEvent(new Event('blur')));
    await sleep(1400);
    const b1 = await look(p);
    check(eng, 'D held, a stroke, then the window loses focus (blur made in the page): the drawing is not lost, its box opens', b1.box && b1.draftInk === 1 && !b1.live, short({ box: b1.box, draftInk: b1.draftInk, live: b1.live }));
    await p.keyboard.up('d'); // the key comes up at last, in the box
    await p.keyboard.press('Escape');
    await sleep(200);
    const b2 = await look(p);
    await stroke(p, [[a7.l, a7.t - 10], [a7.l + 200, a7.b + 10]]);
    await until(p, '.float textarea');
    const b3 = await look(p);
    check(eng, 'after that blur D counts as let go: the next plain drag is a box, not lines, and done pins did not flip', b3.box && b3.zone === 1 && b3.draftInk === 0 && b3.live === 0 && b2.hideDone === b0.hideDone, short({ zone: b3.zone, draftInk: b3.draftInk, hideDone: [b0.hideDone, b2.hideDone] }));
    await p.keyboard.press('Escape');

    // 8. The browser cancels the pointer mid-stroke (pointercancel made in the page: it takes the stroke for a scroll
    //    or a system gesture). The half stroke is nobody's.
    await go(p, L.B, 'cancel');
    const a8 = await box(p, 'a');
    const pc = ring(a8.l + 60, a8.cy, 80, 28);
    await p.keyboard.down('d');
    await p.mouse.move(...pc[0]);
    await p.mouse.down();
    for (const q of pc.slice(1, 10)) await p.mouse.move(...q, { steps: 4 });
    await p.evaluate(([x, y]) => (document.elementFromPoint(x, y) || document.body).dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, pointerType: 'mouse', clientX: x, clientY: y, bubbles: true, composed: true })), pc[9]);
    const c1 = await look(p);
    await p.mouse.up();
    await p.keyboard.up('d');
    await sleep(1400);
    const c2 = await look(p);
    check(eng, 'pointercancel mid-stroke (the only stroke): nothing is left drawn on the page, and no box opens for half a stroke once D is let go', !c2.live && !c2.box && !c2.dragging, short({ atCancel: { live: c1.live, dragging: c1.dragging }, afterD: { box: c2.box, live: c2.live, draftInk: c2.draftInk, at: c2.draftAt } }));
    await p.keyboard.press('Escape');

    // 9. One stroke of 1000 points: a scribble from the left of the page to the right, 125 times up and down.
    await go(p, L.B, 'big');
    let posted = 0;
    const onReq = (q) => q.method() === 'POST' && /_lab\/api\/comments/.test(q.url()) && (posted = Math.max(posted, (q.postData() || '').length));
    p.on('request', onReq);
    const zig = Array.from({ length: 1000 }, (_, i) => [60 + i * 0.85, 250 + 60 * Math.abs(((i / 4) % 2) - 1) * (i % 8 < 4 ? 1 : 1)]);
    await drawn(p, [zig], 1);
    await send(p);
    p.off('request', onReq);
    const big = (await inks('big'))[0]?.anchor;
    const bigText = await L.agent('big');
    const xs = (big?.ink.pts[0] || []).filter((_, i) => i % 2 === 0);
    check(eng, 'a 1000-point scribble is sent small: at most 80 points a line in the store, under 6 kB posted, read as scribbled over', Boolean(big) && big.ink.pts.length === 1 && big.ink.pts[0].length <= 160 && posted > 0 && posted < 6000 && /scribbled over/.test(mark(bigText)), `${(big?.ink.pts[0].length || 0) / 2} points kept, ${posted} bytes posted, ${big?.docW}×${big?.docH} px, ${mark(bigText)}`);
    check(eng, 'the kept line of that scribble still runs to where the stroke ended (thinned out, not cut off part-way)', xs.length > 0 && Math.max(...xs) > 900 && xs[xs.length - 1] > 900, `the area is 0–1000 across; the kept line ends at ${xs[xs.length - 1]}, its furthest point is ${Math.max(...xs)}`);

    // 10. Ten short strokes in one drawing (ticks beside ten things).
    await go(p, L.B, 'ten');
    const ten = Array.from({ length: 10 }, (_, i) => [[80 + i * 70, 300], [100 + i * 70, 330]]);
    await drawn(p, ten);
    const t1 = await look(p);
    await send(p);
    const tenA = (await inks('ten'))[0]?.anchor;
    const tenText = await L.agent('ten');
    const shown = await p.evaluate((r) => new Function(`return ${r}`)().querySelectorAll('.pin.ink path.hit').length, root);
    check(eng, 'ten strokes in one drawing: all ten are kept and drawn on the sent pin, as the agent is told ("10 strokes")', /drawn: 10 strokes/.test(tenText) && tenA?.ink.pts.length === 10 && shown === 10, `agent: "${mark(tenText)}"; lines in the draft ${t1.draftStrokes}, in the store ${tenA?.ink.pts.length}, on the sent pin ${shown}`);

    // 11. Two drawings one right after the other, the second while the first's undo card is still up.
    await go(p, L.B, 'quick');
    const a11 = await box(p, 'a');
    const c11 = await box(p, 'c');
    await drawn(p, [ring(a11.l + 60, a11.cy, 70, 26)]);
    await p.keyboard.type('first');
    await p.keyboard.press('Enter');
    await until(p, '.pin.ink');
    const q1 = await drawn(p, [[[c11.l, c11.b + 3], [c11.l + 150, c11.b + 4]]]);
    await p.keyboard.type('second');
    await p.keyboard.press('Enter');
    await sleep(700);
    const quick = await inks('quick');
    const quickText = await L.agent('quick');
    check(eng, 'two drawings in a row (the second drawn while the first\'s undo card is up): both are saved, each with its own lines and words', quick.length === 2 && q1.box && /first/.test(quickText) && /second/.test(quickText) && /drawn: (circled|box)/.test(quickText) && /drawn: underlined/.test(quickText), `${quick.length} drawings: ${quick.map((x) => `${x.text} = ${x.anchor.ink.mark}`).join('; ')}`);

    // 12. A drawing let go with Escape, and another drawn at once: only the new one's lines.
    await go(p, L.B, 'quick2');
    const a12 = await box(p, 'a');
    const c12 = await box(p, 'c');
    await drawn(p, [ring(a12.l + 60, a12.cy, 70, 26)]);
    await p.keyboard.press('Escape');
    const q2 = await drawn(p, [ring(c12.l + 60, c12.cy, 70, 26)]);
    check(eng, 'a drawing dropped with Escape, the next drawn at once: one draft, the new one, none of the old lines', q2.box && q2.draftInk === 1 && q2.draftStrokes === 1 && q2.draftAt.t > a12.b && q2.live === 0, short(q2.draftAt));
    await p.keyboard.press('Escape');

    // 13. A reload with a drawing not sent yet, some words typed.
    await go(p, L.B, 'reload');
    const a13 = await box(p, 'a');
    const r0 = await drawn(p, [ring(a13.l + 60, a13.cy, 70, 26)]);
    await p.keyboard.type('half a thought');
    await sleep(500);
    await go(p, L.B, 'reload');
    await until(p, '.float textarea', 3000);
    const r1 = await look(p);
    check(eng, 'a reload with an unsent drawing and words typed: the box is back with the words and the lines, where they were', r1.box && r1.typed === 'half a thought' && r1.draftInk === 1 && r1.zone === 0 && Math.abs(r1.draftAt.l - r0.draftAt.l) < 4 && Math.abs(r1.draftAt.t - r0.draftAt.t) < 4, short({ before: r0.draftAt, after: r1.draftAt, typed: r1.typed, draftInk: r1.draftInk, zone: r1.zone, draftPin: r1.draftPin }));
    if (r1.box) {
      await p.locator('.float textarea').focus().catch(() => {});
      await p.keyboard.press('End');
      await send(p, ' sent');
    }
    const reText = await L.agent('reload');
    check(eng, 'sent after the reload it is still a drawing for the agent: circled, with its lines and the words in it', /type: drawing/.test(reText) && /drawn: (circled|box)/.test(reText) && /lines \(px/.test(reText) && /Plans/.test(reText) && /half a thought/.test(reText), said(reText));

    // 14. The same with nothing typed yet.
    await go(p, L.B, 'reload2');
    const a14 = await box(p, 'a');
    await drawn(p, [ring(a14.l + 60, a14.cy, 70, 26)]);
    await sleep(500);
    await go(p, L.B, 'reload2');
    await sleep(900);
    const r2 = await look(p);
    note(eng, 'a reload with an unsent drawing and nothing typed', r2.box ? `the box and ${r2.draftInk} drawing come back` : 'the drawing is gone (a draft with no words is not kept, as with any pin)');
    check(eng, 'a reload with an unsent drawing and nothing typed leaves no stray lines or pins behind', r2.live === 0 && r2.inkPins === 0 && (r2.box ? r2.draftInk === 1 : r2.draftInk === 0), short({ box: r2.box, draftInk: r2.draftInk, live: r2.live }));
  });
} finally {
  L.stop();
}
done();
void letters;
