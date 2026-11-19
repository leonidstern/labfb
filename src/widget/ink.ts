// Part of the comment widget (src/comments.js bundles it). Uses the widget's own parts through W, set once at startup.
//
// Ink on words: a comment on selected words shows no pin. The words carry its state as low ink, a band under the lower
// part of their line: the pins' green while you write it and once sent, green and pulsing while the agent works,
// amber and breathing when the agent answered and it's your turn, and a faint green once done.
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
import { wholeWords, wordsRange } from './anchoring.ts';
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
let over: Drawn | null = null; // the one under the mouse: the pointer is a hand

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
  const hl = (...st: string[]) => st.map((x) => `::highlight(lab-ink-${x})`).join();
  const mix = (c: string, pct: string) => `{text-decoration-color:color-mix(in srgb,${c} ${pct},transparent)}`;
  const k = '*var(--lab-ink-k,1)';
  return (
    'html.lab-ink-on{text-decoration-skip-ink:none}html.lab-ink-dk{--lab-ink-k:1.5}' +
    '@property --lab-ink-a{syntax:"<number>";inherits:true;initial-value:1}' +
    'html.lab-ink-live{animation:lab-ink-pulse 1.8s ease-in-out infinite}@keyframes lab-ink-pulse{50%{--lab-ink-a:.35}}' +
    // One band for every state, and for the words being selected: only the colour says which.
    `${hl(...STATES, 'sel')}{text-decoration-line:underline;text-decoration-skip-ink:none;text-decoration-thickness:.5em;text-underline-offset:-.28em}` +
    // Being selected, being written and sent are one colour: nothing changes on letting go, or on sending (Leo, 19 Nov).
    // A done note with something new in it (kept) wears it too.
    hl('draft', 'sel', 'next', 'kept') + mix('#24a046', `calc(30%${k})`) +
    hl('now') + mix('#34c759', `calc(30%${k}*var(--lab-ink-a))`) +
    hl('asks') + mix('#e08a1a', 'calc(32% + 16%*var(--lab-ink-a))') +
    hl('rest') + mix('#e08a1a', '48%') +
    // Done is the same band, faint: Safari can put no line under the words (below), so no browser gets a hairline.
    hl('done') + mix('#24a046', `calc(8%${k})`) +
    // Safari takes an underline's offset from the words themselves, never from the highlight (as it does "don't skip
    // the letters"): there the page's text carries the offset, and links and other underlined words keep their own
    // (a link under ink gets the offset by name, see lift). Only Safari knows the font named here.
    '@supports (font:-apple-system-body){html.lab-ink-on{text-underline-offset:-.28em}:where(html.lab-ink-on) :where(a,u,ins,abbr){text-underline-offset:auto}}' +
    // Words being selected for a comment (Shift-drag) wear the band from the first letter, on whole words, as the
    // quote will be; the page's own selection paint is clear meanwhile, whatever the page says (drawSelection), and
    // a draft's band from before is gone at once: only one of the two is ever drawn.
    'html.lab-ink-sel ::selection{background-color:transparent!important;color:inherit!important}html.lab-ink-sel ::highlight(lab-ink-draft){text-decoration-line:none}'
  );
}

// The inks this render draws: [{ c, r, pin }] for comments, [{ r }] for the one being written. Each state's highlight
// takes its notes' ranges. The comment's pin, unseen, still does what it did: a click on the words is a click on it.
export function drawInks(items: Drawn[]) {
  html.classList.toggle('lab-ink-on', W.flag('inkOnText') && able());
  if (taking) drawSelection(); // letting go took the selection: its band goes in this same task, as the draft's comes
  if (!items.length && !inked) return; // nothing to ink, nothing to wipe
  inked = items.length;
  inkR = items.map((x) => x.r);
  lift();
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
};

// The comment whose words are under the pointer, if any: of notes on the same words, the latest. None over a link or
// control in them: its click stays the page's, as with pins ("pin over controls" gives it to the ink; option-click
// always pins).
function under(e) {
  if (!W.S.on || W.S.cursorMode || W.control(e.target)) return null;
  let hit: Drawn | null = null;
  for (const d of drawn) for (const b of d.r.getClientRects()) if (e.clientX >= b.left - 2 && e.clientX <= b.right + 2 && e.clientY >= b.top && e.clientY <= b.bottom) hit = d;
  return hit;
}

// Words being selected for a comment: a selection begun with Shift held (or in comment mode), outside a field, while
// comments are on and the pointer pins. It is ours until it is gone: letting go of Shift or a box opening changes
// nothing. Its band is drawn anew on every change of the selection, a frame later; the page's own paint is clear from
// the moment the selection starts (selectstart), so no native blue shows first (Leo, 19 Nov).
let taking = false;
let held = false; // the button is down on a selection we take: its paint stays clear, the pins let the pointer through
let queued = 0;
const takes = () => html.classList.contains('lab-ink-on') && W.S.on && !W.S.cursorMode;
function drawSelection() {
  queued = 0;
  const sel = getSelection();
  const r = sel && !sel.isCollapsed && sel.rangeCount ? sel.getRangeAt(0) : null;
  taking = Boolean(r) && takes() && (taking || html.matches('.lab-shift, .lab-pinning')) && !document.activeElement?.matches('input, textarea') && Boolean(String(r).trim());
  html.classList.toggle('lab-ink-sel', taking || held);
  selR = taking ? wholeWords(r!.cloneRange()) : null;
  CSS.highlights.set('lab-ink-sel', new Highlight(...(selR ? [selR] : [])));
  lift();
}
// Safari takes an underline's offset from the nearest element, so a link under ink needs the offset itself or its
// part of the band sits lower. The page isn't touched: a rule names the links by their address, only while they are
// under ink (then Safari draws no underline of their own under the band anyway). Other browsers skip the rule. The
// rule lives in the widget's own element on the page, so it comes back with it after the page swaps its body.
const links = document.createElement('style');
let inkR: Range[] = [];
let selR: Range | null = null;
function lift() {
  const names = [...document.links].filter((a) => inkR.concat(selR || []).some((r) => r.intersectsNode(a))).map((a) => `a[href="${CSS.escape(a.getAttribute('href')!)}"]`);
  const css = names.length ? `@supports (font:-apple-system-body){${names}{text-underline-offset:-.28em}}` : '';
  if (links.textContent !== css) links.textContent = css;
}

// Before the widget's other page listeners (comments.js), so a click on inked words opens it and places nothing.
export function startInk() {
  W.host.append(links);
  // A selection that grows is drawn once a frame; one that is gone wipes its band at once, not a frame later.
  const redraw = () => able() && (getSelection()?.isCollapsed ? drawSelection() : (queued ||= requestAnimationFrame(drawSelection)));
  document.addEventListener('selectionchange', redraw);
  addEventListener('selectstart', (e) => {
    if (takes() && html.classList.contains('lab-shift') && !e.composedPath().includes(W.host)) {
      held = true;
      html.classList.add('lab-ink-sel');
      // Until the button is up the pins let the pointer through: a pin under it would end the selection at the page's end.
      W.layer.style.pointerEvents = 'none';
      addEventListener('pointerup', () => ((held = false), (W.layer.style.pointerEvents = ''), redraw()), { once: true, capture: true });
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
