// Part of the comment widget (src/comments.js bundles it). Uses the widget's own parts through W, set once at startup.
//
// Ink on words: a comment on selected words shows no pin. The words carry its state as low ink, a band under the lower
// part of their line, one piece per line: grey while you write it, the pins' green once sent, green and pulsing while
// the agent works, amber and breathing when the agent answered and it's your turn (a ? when it asked you), and a green hairline
// once done (Leo, 18 Nov). Behind the flag
// inkOnText (lib/flags.ts): with it off, selected words get a pin as before.
// The page's own text is never wrapped or touched: the bands are drawn in the widget's layer over the words' line
// boxes, translucent, and let every pointer through, so the words can still be selected and dragged over. The CSS
// highlight API can't draw a band under part of a line, animate its fill, or take a click, so it isn't used here.
//
// What a pin on words did, and what the ink does instead:
// - click / tap opens its thread (the same card, keys and phone sheet) → a click or tap on the inked words does;
//   the pointer turns to a hand over them. Comments hidden: no ink, and clicks are the page's again.
// - number, author and state in its aria label, focus with Tab → a small button at the end of the words carries
//   the same label and opens it with Enter (the focus ring shows there).
// - new replies: a dot on the pin → the same dot at the end of the words.
// - agent working: a turning ring → the ink pulses.
// - done: a tick, hidden unless "show done" → green while something in it is new, then a hairline that goes faint and
//   stays (also after a reload, and whatever "show done" says) until the thread is archived. A pin on words would
//   have gone; the faint line is the record that something happened here.
// - its words gone or moved (shown faded, beside the content) → the pin comes back, as before, draggable as before.
// - drag to move (author or admin) → not on ink: the words are the spot. A moved one is a pin again, and draggable.
// - hover lit the words → the band lightens a touch. The quoted words of an open one (and of the one being written)
//   wear the band too, not the green.
// - ‹ › / W stepping, goTo and the card's place use the comment's spot (position), which is still on the words.
// - the sent card flies into its new pin (phones) → into the end of its words, and the ink fills as it lands.
import { wholeWords, wordsRange } from './anchoring.ts';
import { workState } from './list.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let W: any;
export function bindInk(w: unknown) {
  W = w;
}

type Line = number[];
type Lines = Line[] & { s?: boolean; r?: boolean; dk?: boolean };
type Drawn = { c?: any; anchor: any; box: HTMLElement; end?: HTMLElement; pin?: HTMLElement; at: string; s?: boolean; lines?: Lines };
const drawn = new Map<string, Drawn>(); // by thread id ('draft' for the one being written)
const seen = new Set<string>(); // drawn since this page loaded: their fill already ran (or they were there at load)
let primed = false; // the comments that were there when the page loaded have been marked seen
let inks: HTMLElement;
let quiet = false; // quietInk: no fill, no sweep, the drain at once
let selInk: Drawn | null = null; // the words selected while commenting, drawn as sent ink
let quoteInk: Drawn | null = null; // the quoted words, where no ink of their own shows them
let over: Drawn | null = null; // the one under the mouse: its band lightens, the pointer is a hand
const hover = (d: Drawn | null) => {
  over?.box.classList.remove('over');
  d?.box.classList.add('over');
  over = d;
  document.documentElement.classList.toggle('lab-ink-over', Boolean(d));
};

// A comment on words someone selected (a click on a word quotes it too, but that is a pin on a point). Older ones,
// from before the flag, count when they quote more than one word.
const selected = (a) => W.flag('inkOnText') && a?.kind === 'text' && !a.zw && Boolean(a.quote?.exact) && (a.quote.selected || /\s/.test(a.quote.exact.trim()));

// The words' boxes, one per line, in page pixels: the text pieces in the range, merged by line, so the spaces between
// words and the edges of a link or <em> inside them leave no seams. Pieces merge only inside one block (a paragraph,
// a list item, a table cell): two cells on the same row are two bands, never one across the gutter. Null when the
// words can't be found.
// Words in a box that scrolls (overflow) are cut to what it shows, as the page cuts them: a line scrolled out of it
// draws nothing, never a band over the text around the box. Words in fixed or sticky content say so (s), so the ink
// follows them as the page scrolls; right-to-left words (r) fill from the right and end at the left. Light words
// (dk) mean a dark page, whatever the computer's own setting says: the strengths are picked from the words' colour.
const lightWords = (color: string) => (([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b > 150)((color.match(/[\d.]+/g) || [0, 0, 0]).map(Number));
// While commenting with ink on words (lab-ink-on), the page's own selection paint is clear, before, during and after
// a drag: the selected words get the sent ink's band instead (drawSelection), so selecting looks like the ink they
// will get (Leo, 18 Nov). Fields keep the green. The caret and handles stay native.
// The quoted words of an open comment (or a hovered pin) the same: the ink's band (drawQuote), not the soft green
// highlight, which then paints nothing (Leo, 18 Nov: "on click with comment it still has full green selection").
export const inkSelectionCss = () =>
  'html.lab-pinning.lab-ink-on ::selection { background-color: transparent; color: inherit; } ' +
  'html.lab-pinning.lab-ink-on :is(input, textarea)::selection { background-color: rgba(52, 199, 89, .3); } ' +
  'html.lab-ink-on ::highlight(lab-quote) { background-color: transparent; color: inherit; }';
let redrawSel = () => 0;
// After the quoted words change (anchoring.ts markQuote): their band is drawn on the next frame.
export const inkQuote = () => redrawSel();
const blockOf = (e: Element | null, known: Map<Element, Element | null>): Element | null => {
  if (!e) return null;
  if (!known.has(e)) known.set(e, /^(inline|contents)$/.test(getComputedStyle(e).display) ? blockOf(e.parentElement, known) : e);
  return known.get(e)!;
};
export function inkLines(anchor): Lines | null {
  const range = selected(anchor) && wordsRange(anchor);
  return range ? rangeLines(range) : null;
}
function rangeLines(range: Range): Lines | null {
  const at = range.commonAncestorContainer;
  const top = (at.nodeType === 3 ? at.parentNode : at) as Element;
  const walk = document.createTreeWalker(top, NodeFilter.SHOW_TEXT);
  const lines: Lines = []; // [left, top, right, bottom]
  const blocks: (Element | null)[] = []; // the block each line is in
  const known = new Map<Element, Element | null>();
  let [x0, y0, x1, y1] = [-1e9, -1e9, 1e9, 1e9];
  for (let e = top; e && e !== document.body; e = e.parentElement) {
    const s = getComputedStyle(e);
    lines.r ??= s.direction === 'rtl';
    if (e === top) lines.dk = lightWords(s.color);
    if (/fixed|sticky/.test(s.position)) lines.s = true;
    if (s.overflow === 'visible') continue;
    const b = e.getBoundingClientRect();
    [x0, y0, x1, y1] = [Math.max(x0, b.left), Math.max(y0, b.top), Math.min(x1, b.right), Math.min(y1, b.bottom)];
  }
  for (let t; (t = walk.nextNode() as Text | null); ) {
    if (!range.intersectsNode(t)) continue;
    const r = document.createRange();
    r.setStart(t, t === range.startContainer ? range.startOffset : 0);
    r.setEnd(t, t === range.endContainer ? range.endOffset : t.length);
    const block = blockOf(t.parentElement, known);
    for (const b of r.getClientRects()) {
      const mid = (b.top + b.bottom) / 2;
      const [l, t2, rt, bt] = [Math.max(b.left, x0) + scrollX, b.top + scrollY, Math.min(b.right, x1) + scrollX, b.bottom + scrollY];
      if (rt - l < 1 || b.height < 1 || mid < y0 || mid > y1) continue;
      // On a line already when they overlap by more than half the shorter's height, in the same block.
      const on = lines.find((x, i) => blocks[i] === block && Math.min(x[3], bt) - Math.max(x[1], t2) > Math.min(x[3] - x[1], bt - t2) / 2);
      if (on) [on[0], on[1], on[2], on[3]] = [Math.min(on[0], l), Math.min(on[1], t2), Math.max(on[2], rt), Math.max(on[3], bt)];
      else {
        lines.push([l, t2, rt, bt]);
        blocks.push(block);
      }
    }
  }
  return lines.length ? lines.sort((a, b) => a[1] - b[1] || a[0] - b[0]) : null;
}

// The line pieces, placed. The fill runs once, in reading order: each line after the ones before it, at about the
// mock's pace (300 ms a word, the next word 38 ms later), a long line taking longer than a short one.
function lay(d: Drawn, lines: Lines, fill: boolean, wait = 0) {
  d.s = lines.s;
  d.lines = lines; // where a pointer is tested against, without asking the page's layout again
  d.box.classList.toggle('dk', Boolean(lines.dk));
  const at = lines.map((l) => l.map(Math.round).join()).join(' ');
  if (at !== d.at || fill) {
    d.at = at;
    let delay = wait;
    const pieces = lines.map((l) => {
      const ln = W.el('i', { class: `ln${fill ? ' fill' : ''}`, 'aria-hidden': 'true' });
      ln.style.cssText = `left:${l[0]}px;top:${l[1]}px;width:${l[2] - l[0]}px;height:${l[3] - l[1]}px`;
      if (fill) {
        const run = Math.min(0.7 * (l[2] - l[0]), 700);
        ln.style.animationDuration = `${300 + run}ms`;
        ln.style.animationDelay = `${delay}ms`;
        if (lines.r) ln.style.transformOrigin = '100%';
        delay += run + 38;
      }
      return ln;
    });
    d.box.replaceChildren(...pieces, ...(d.end ? [d.end] : []));
    const [left, top, right] = lines[lines.length - 1];
    if (d.end) d.end.style.cssText = lines.r ? `left:${left}px;top:${top}px;translate:-100%` : `left:${right}px;top:${top}px`;
  }
}

// The inks this render draws: [{ c, lines, pin }] for comments, [{ anchor, lines }] for the one being written. Kept
// from one render to the next, so a state change eases (sent to working, the drain to a hairline) instead of a cut.
// The comment's pin, made but not shown, still does what it did: a click on the words or their end is a click on it
// (its thread opens, on phones through goTo), and its label is theirs.
export function drawInks(items: { c?: any; anchor?: any; lines: Lines; pin?: HTMLElement }[]) {
  // The notes that were there when the page loaded already ran their fill, in an earlier visit: no fill again.
  if (!primed && W.S.loaded) {
    primed = true;
    for (const { c } of items) if (c) seen.add(c.id);
  }
  // Each note's newer neighbours' lines: the draft counts as newest, then by when each was written.
  const newer = new Map<string, Line[]>();
  const age = (x: { c?: any }) => (x.c ? x.c.createdAt : '\uffff');
  for (const x of items) newer.set(x.c ? x.c.id : 'draft', items.filter((y) => age(y) > age(x)).flatMap((y) => y.lines));
  const boxes = items.map(({ c, anchor, lines, pin }) => {
    const id = c ? c.id : 'draft';
    let d = drawn.get(id);
    if (!d) {
      d = { c, anchor, box: W.el('div', { class: 'ink' }), at: '' };
      if (c) {
        d.end = W.el('button', { class: 'ink-end', type: 'button' });
        d.end.addEventListener('click', (e) => (e.stopPropagation(), drawn.get(id)?.pin?.click()));
      }
      drawn.set(id, d);
    }
    d.pin = pin;
    d.c = c; // the comments are read anew from the lab now and then: the same thread, a new object
    d.anchor = c ? c.anchor : anchor;
    // Its state, what the pin's face said (list.ts): draft, next (sent), now (the agent on it), asks (answered: your
    // turn) or done; a done one with something new in it is "kept", green while it waits to be read.
    const [work] = c ? workState(c) : ['draft'];
    const news = c ? W.unread(c).length : 0;
    // Picked up (handed over, nothing from the agent yet) inks as working; an answer that isn't done is "asks".
    const st = work === 'done' && news ? 'kept' : work === 'got' ? 'now' : work || 'asks';
    d.box.dataset.st = st;
    // The agent's latest word is a question to you (--question): the ink gets a small ?.
    const q = work === 'asks';
    // Breathing says "answer me": while the answer is unread, or while it asks you something; a plain answer you have
    // read just rests.
    d.box.classList.toggle('calm', st === 'asks' && !q && !news);
    if (c && d.end) {
      d.end.classList.toggle('new', news > 0);
      d.end.classList.toggle('open', W.S.openId === c.id);
      d.end.setAttribute('aria-label', `${pin!.getAttribute('aria-label')}${st === 'asks' ? ', answered' : ''}, on "${c.anchor.quote.exact.slice(0, 60)}"`);
      if (q !== Boolean(d.end.firstChild)) d.end.replaceChildren(...(q ? [W.el('b', { class: 'q', 'aria-hidden': 'true' }, '?')] : []));
    }
    const fill = Boolean(c) && !seen.has(id) && !W.still.matches && !quiet;
    if (c) seen.add(id);
    // A comment just sent from a phone: its card flies into the words first (sheets.ts), then the ink runs.
    lay(d, lines, fill, W.coarse && W.S.posted === id ? 300 : 0);
    // On words newer notes ink too: this one steps under them as a hairline, 3 px apart (at most three), so every note
    // shows and can be reached; the newest keeps its band.
    const n = Math.max(...lines.map((l) => newer.get(id)!.filter((t) => Math.abs(t[1] - l[1]) < 4 && t[0] < l[2] && l[0] < t[2]).length));
    d.box.style.setProperty('--l', String(Math.min(3, n)));
    d.box.classList.toggle('under', n > 0);
    return d.box;
  });
  for (const id of drawn.keys()) if (!items.some((x) => (x.c ? x.c.id : 'draft') === id)) drawn.delete(id);
  W.patchKids(inks, boxes);
  if (over && !boxes.includes(over.box)) hover(null);
}

// Scrolling or the page reflowing: the ink follows its words. False when some words are gone (the pin comes back).
export function moveInks(stuck?) {
  // All read, then all written: a write between two reads would lay the page out again for each note.
  const all = [...drawn].filter(([id, d]) => id !== 'draft' && (!stuck || d.s)).map(([, d]) => [d, inkLines(d.anchor)] as const);
  if (all.some(([, l]) => !l)) return false;
  for (const [d, l] of all) lay(d, l!, false);
  return true;
}
export const inkCount = () => drawn.size - (drawn.has('draft') ? 1 : 0);
export const inkEnd = (id) => drawn.get(id)?.end;

// The comment whose words are under the pointer, if any: of notes on the same words, the one on the fewest (a note
// inside another's words), then the latest. None over a link or control in them: its click stays the page's, as with
// pins ("pin over controls" gives it to the ink; option-click always pins).
// Tested against the boxes kept when the ink was placed (page pixels), so a pointer move asks the page for no layout.
function under(e) {
  if (!W.S.on || W.S.cursorMode) return null;
  let hit: Drawn | null = null;
  let least = 1e9;
  for (const d of drawn.values()) {
    if (!d.c || !d.lines) continue;
    let size = 0;
    let on = false;
    for (const [l, t, r, b] of d.lines) {
      size += r - l;
      on ||= e.pageX >= l - 2 && e.pageX <= r + 2 && e.pageY >= t && e.pageY <= b;
    }
    if (on && (size < least || (size === least && d.c.createdAt >= hit!.c.createdAt))) [hit, least] = [d, size];
  }
  return hit && !W.control(e.target) ? hit : null;
}

// Before the widget's other page listeners (comments.js), so a click on inked words opens it and places nothing.
export function startInk(data?: string) {
  inks = W.el('div', { class: 'layer inks' });
  // Settings the lab passed (data-ink): quiet stills all but "asks"; a colour replaces a state's, one for light and dark.
  let opts: { quiet?: boolean; colors?: Record<string, string> } = {};
  try {
    opts = JSON.parse(data || '{}');
  } catch {}
  quiet = Boolean(opts.quiet);
  inks.classList.toggle('quiet', quiet);
  for (const [state, c] of Object.entries(opts.colors || {})) if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c)) inks.style.setProperty(`--u-${state}`, c);
  W.layer.before(inks);
  // Words selected while commenting: drawn as sent ink, the same band (lay), on the same words; gone with the
  // selection or comment mode. Not in a field (its own selection is the page's).
  selInk = { anchor: null, box: W.el('div', { class: 'ink sel', 'data-st': 'next' }), at: '' };
  const selLayer = W.el('div', { class: 'layer inks' });
  selLayer.style.cssText = inks.style.cssText; // the lab's own colours, as on the inks
  quoteInk = { anchor: null, box: W.el('div', { class: 'ink sel quote', 'data-st': 'draft' }), at: '' };
  selLayer.append(quoteInk.box, selInk.box);
  inks.after(selLayer);
  let queued = 0;
  const redraw = () => (queued ||= requestAnimationFrame(drawSelection));
  redrawSel = redraw;
  document.addEventListener('selectionchange', redraw);
  addEventListener('scroll', () => (selInk!.at || quoteInk!.at) && redraw(), { capture: true, passive: true });
  addEventListener('resize', () => (selInk!.at || quoteInk!.at) && redraw());
  new MutationObserver(redraw).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  function drawSelection() {
    queued = 0;
    const html = document.documentElement;
    const sel = getSelection();
    const range = sel && !sel.isCollapsed && sel.rangeCount ? sel.getRangeAt(0) : null;
    const field = document.activeElement?.matches('input, textarea');
    const lines = W.flag('inkOnText') && html.classList.contains('lab-pinning') && range && !field && range.toString().trim() ? rangeLines(wholeWords(range.cloneRange())) : null; // whole words, as the quote will be
    if (html.classList.contains('lab-ink-sel') !== Boolean(lines)) html.classList.toggle('lab-ink-sel', Boolean(lines));
    show(selInk!, lines);
    // The quoted words: a band in the draft's grey while writing, else the sent green. Words that carry an ink of
    // their own (the draft on selected words, an open note on words) already show it: nothing drawn over it.
    const flag = W.flag('inkOnText');
    if (html.classList.contains('lab-ink-on') !== flag) html.classList.toggle('lab-ink-on', flag);
    const lit = flag ? (CSS as any).highlights?.get('lab-quote') : null;
    const q: Range | undefined = lit ? [...lit][0] : undefined;
    let ql = q && !q.collapsed ? rangeLines(q) : null;
    const key = ql && ql.map((l) => l.map(Math.round).join()).join(' ');
    if (key && [...drawn.values()].some((d) => d.at === key)) ql = null;
    quoteInk!.box.dataset.st = W.S.draft ? 'draft' : 'next';
    show(quoteInk!, ql);
  }
  function show(d: Drawn, lines: Lines | null) {
    if (lines) lay(d, lines, false);
    else if (d.at) {
      d.at = '';
      d.box.replaceChildren();
    }
  }
  // Ink on fixed or sticky words keeps up with the page's scroll; a web font arriving late moves the words under it.
  addEventListener('scroll', (e) => e.target === document && [...drawn.values()].some((d) => d.s) && !moveInks(1) && W.reflow(), { passive: true });
  // (Safari never says loadingdone: each load's end is read from ready.)
  const fonts = document.fonts;
  const late = () => fonts.ready.then(() => W.reflow());
  fonts?.addEventListener('loading', late);
  if (fonts) late();
  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const now = e.composedPath().includes(W.host) || e.shiftKey || e.altKey ? null : under(e);
    if (now !== over) hover(now);
  }, { capture: true, passive: true });
  addEventListener('click', (e) => {
    if (e.button !== 0 || e.altKey || e.metaKey || e.ctrlKey || e.shiftKey || W.S.afterDrag || e.composedPath().includes(W.host)) return;
    if (String(getSelection?.() || '').trim()) return; // words selected over the ink: a new comment, not this one
    const d = under(e);
    if (!d) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    d.pin!.click();
  }, true);
}
