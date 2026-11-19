// Part of the comment widget (src/comments.js bundles it). Uses the widget's own parts through W, set once at startup.
//
// Ink on words: a comment on selected words shows no pin. The words carry its state as low ink, a band under the lower
// part of their line: the pins' green while you write it and once sent, green and pulsing while the agent works,
// amber and breathing when the agent answered and it's your turn, and a green hairline once done (Leo, 18 Nov).
// Behind the flag inkOnText (lib/flags.ts): with it off, selected words get a pin as before.
//
// The band is the browser's own: each state is a named highlight (CSS Custom Highlight API) holding the notes' ranges,
// painted as a thick underline pulled up under the letters. Nothing is measured or placed, so the ink is on its words
// through scrolling, reflow, sticky content, boxes that scroll and right-to-left text without a redraw, and the page's
// own text is never wrapped or touched. A browser without highlights keeps the pins.
//
// What a pin on words did, and what the ink does instead:
// - click / tap opens its thread → a click or tap on the inked words does (the pointer is a hand over them).
// - its label, Tab and Enter → the pin is still there, unseen at the end of the words: Tab shows it.
// - new replies: a dot on the pin → the same dot, alone, at the end of the words.
// - agent working: a turning ring → the ink pulses.
// - its words gone or moved → the pin comes back, as before.
import { markQuote, wholeWords, wordsRange } from './anchoring.ts';
import { workState } from './list.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let W: any;
export function bindInk(w: unknown) {
  W = w;
}

type Drawn = { c?: any; r: Range; pin?: HTMLElement };
const html = document.documentElement;
// Whether this browser can draw it: highlights, and an underline in them (asked once the page has the rules, inkCss).
let can = false;
const able = () => (can ||= typeof Highlight === 'function' && Boolean(CSS.highlights) && getComputedStyle(html, '::highlight(lab-ink-next)').textDecorationLine === 'underline');
const STATES = ['draft', 'next', 'now', 'asks', 'rest', 'kept', 'done'];
let drawn: Drawn[] = [];
let inked = 0; // how many the last render inked (the draft too)
let over: Drawn | null = null; // the one under the mouse: its words light up, the pointer is a hand

// A comment on words someone selected (a click on a word quotes it too, but that is a pin on a point). Older ones,
// from before the flag, count when they quote more than one word.
const selected = (a) => W.flag('inkOnText') && able() && a?.kind === 'text' && !a.zw && Boolean(a.quote?.exact) && (a.quote.selected || /\s/.test(a.quote.exact.trim()));
/** The words of a comment that is shown as ink, where they are now; null when it is a pin (or its words are gone). */
export const inkRange = (anchor): Range | null => (selected(anchor) && wordsRange(anchor)) || null;

// The page's rules for the bands (highlights are styled from the page, not from the widget's own root). The band: an
// underline half a letter thick, pulled up under the letters. Safari reads "don't skip the letters" from the words
// themselves, Chrome from the highlight, so both say it. Working and asks move through one number the page animates
// (--lab-ink-a), only while something is working or asking. On a dark page (light words) one more number makes the
// greens half as strong again (--lab-ink-k): 30 % reads on white, 45 % on black (Leo, 19 Nov).
export function inkCss() {
  const band = 'text-decoration-line:underline;text-decoration-skip-ink:none;text-decoration-thickness:.5em;text-underline-offset:-.28em;';
  const mix = (c: string, pct: string) => `text-decoration-color:color-mix(in srgb,${c} ${pct},transparent)`;
  const green = (c: string, pct: number, beat = '') => mix(c, `calc(${pct}%*var(--lab-ink-k,1)${beat})`);
  const on = (st: string, css: string) => `::highlight(lab-ink-${st}){${css}}`;
  return (
    'html.lab-ink-on{text-decoration-skip-ink:none}html.lab-ink-dk{--lab-ink-k:1.5}' +
    '@property --lab-ink-a{syntax:"<number>";inherits:true;initial-value:1}' +
    'html.lab-ink-live{animation:lab-ink-pulse 1.8s ease-in-out infinite}@keyframes lab-ink-pulse{50%{--lab-ink-a:.35}}' +
    on('draft', band + green('#24a046', 30)) + // being written: as it was while selecting, nothing changes on letting go (Leo, 19 Nov)
    on('next', band + green('#24a046', 30)) +
    on('now', band + green('#34c759', 30, '*var(--lab-ink-a)')) +
    on('asks', band + mix('#e08a1a', 'calc(32% + 16%*var(--lab-ink-a))')) +
    on('rest', band + mix('#e08a1a', '48%')) +
    on('kept', band + green('#24a046', 28)) +
    on('done', `text-decoration-line:underline;text-decoration-thickness:2px;${green('#24a046', 14)}`) +
    // Words being selected for a comment (Shift-drag) wear the sent ink's band from the first letter, on whole words,
    // as the quote will be; the page's own selection paint is clear meanwhile, whatever the page says (drawSelection).
    on('sel', band + green('#24a046', 30)) +
    'html.lab-ink-sel ::selection{background-color:transparent!important;color:inherit!important}' +
    // The quoted words of an open comment or a hovered pin are a fainter green, and so are inked words under the
    // pointer, over their band.
    'html.lab-ink-on ::highlight(lab-quote){background-color:rgba(52,199,89,.14)}'
  );
}

// The inks this render draws: [{ c, r, pin }] for comments, [{ r }] for the one being written. Each state's highlight
// takes its notes' ranges. The comment's pin, unseen, still does what it did: a click on the words is a click on it.
export function drawInks(items: Drawn[]) {
  html.classList.toggle('lab-ink-on', W.flag('inkOnText') && able());
  if (!items.length && !inked) return; // nothing to ink, nothing to wipe
  inked = items.length;
  const by: Record<string, Range[]> = {};
  let live = false;
  for (const { c, r } of items) {
    // Its state, what the pin's face said (list.ts): draft, next (sent), now (the agent on it), asks (answered: your
    // turn) or done; a done one with something new in it is "kept", green while it waits to be read. Picked up
    // (handed over, nothing from the agent yet) inks as working; an answer that isn't done is "asks".
    const [work] = c ? workState(c) : ['draft'];
    const news = c ? W.unread(c).length : 0;
    let st = work === 'done' && news ? 'kept' : work === 'got' ? 'now' : work || 'asks';
    // Breathing says "answer me": while the answer is unread, or while it asks you something; a plain answer you have
    // read just rests.
    if (st === 'asks' && work !== 'asks' && !news) st = 'rest';
    live ||= st === 'asks' || st === 'now';
    (by[st] ||= []).push(r);
  }
  drawn = items.filter((x) => x.c);
  html.classList.toggle('lab-ink-live', live && !W.still.matches);
  // A dark page is one with light words: the green of the body's text colour says so (rgb(238, 238, 238) → 238).
  html.classList.toggle('lab-ink-dk', +getComputedStyle(document.body).color.split(',')[1] > 128);
  // (Safari paints a highlight wrongly on text that can't be selected: with lab-ink-on the page's text can be, comments.js.)
  for (const st of STATES) CSS.highlights.set(`lab-ink-${st}`, new Highlight(...(by[st] || [])));
  if (over && !drawn.some((d) => d.c.id === over!.c.id)) hover(null);
}
/** True when some inked words left the page since the last render (their range has nothing in it): the pin is due. */
export const inkGone = () => drawn.some((d) => d.r.collapsed);

const hover = (d: Drawn | null) => {
  over = d;
  html.classList.toggle('lab-ink-over', Boolean(d));
  if (!W.S.openId && !W.S.draft) markQuote(d?.c.anchor); // the words under the pointer light up, faintly (not over an open note's own)
};

// The comment whose words are under the pointer, if any: of notes on the same words, the one on the fewest (a note
// inside another's words), then the latest. None over a link or control in them: its click stays the page's, as with
// pins ("pin over controls" gives it to the ink; option-click always pins).
function under(e) {
  if (!W.S.on || W.S.cursorMode || W.control(e.target)) return null;
  let hit: Drawn | null = null;
  let least = 1e9;
  for (const d of drawn) {
    let size = 0;
    let on = false;
    for (const b of d.r.getClientRects()) {
      size += b.width;
      on ||= e.clientX >= b.left - 2 && e.clientX <= b.right + 2 && e.clientY >= b.top && e.clientY <= b.bottom;
    }
    if (on && size <= least) [hit, least] = [d, size];
  }
  return hit;
}

// Words being selected for a comment: a selection begun with Shift held (or in comment mode), outside a field, while
// comments are on and the pointer pins. It is ours until it is gone: letting go of Shift or a box opening changes
// nothing. Its band is drawn anew on every change of the selection, a frame later; the page's own paint is clear from
// the moment the selection starts (selectstart), so no native blue shows first (Leo, 19 Nov).
let taking = false;
let queued = 0;
const takes = () => html.classList.contains('lab-ink-on') && W.S.on && !W.S.cursorMode;
function drawSelection() {
  queued = 0;
  const sel = getSelection();
  const r = sel && !sel.isCollapsed && sel.rangeCount ? sel.getRangeAt(0) : null;
  taking = Boolean(r) && takes() && (taking || html.matches('.lab-shift, .lab-pinning')) && !document.activeElement?.matches('input, textarea') && Boolean(String(r).trim());
  html.classList.toggle('lab-ink-sel', taking);
  CSS.highlights.set('lab-ink-sel', new Highlight(...(taking ? [wholeWords(r!.cloneRange())] : [])));
}

// Before the widget's other page listeners (comments.js), so a click on inked words opens it and places nothing.
export function startInk() {
  const redraw = () => able() && (queued ||= requestAnimationFrame(drawSelection));
  document.addEventListener('selectionchange', redraw);
  addEventListener('selectstart', (e) => {
    if (takes() && html.classList.contains('lab-shift') && !e.composedPath().includes(W.host) && !(e.target as Element).closest?.('input, textarea, [contenteditable]')) {
      html.classList.add('lab-ink-sel');
      // Until the button is up the pins let the pointer through: a pin under it would end the selection at the page's end.
      W.layer.style.pointerEvents = 'none';
      addEventListener('pointerup', () => (W.layer.style.pointerEvents = ''), { once: true, capture: true });
    }
    redraw();
  }, true);
  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const now = e.composedPath().includes(W.host) || e.shiftKey || e.altKey ? null : under(e);
    if (now?.c.id !== over?.c.id) hover(now);
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
