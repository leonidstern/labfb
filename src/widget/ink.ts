// Part of the comment widget (src/comments.js bundles it). Uses the widget's own parts through W, set once at startup.
//
// Ink on words: a comment on selected words shows no pin. The words carry its state as low ink, a band under the lower
// part of their line: grey while you write it, the pins' green once sent, green and pulsing while the agent works,
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
import { markQuote, wordsRange } from './anchoring.ts';
import { workState } from './list.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let W: any;
export function bindInk(w: unknown) {
  W = w;
}

type Drawn = { c?: any; r: Range; pin?: HTMLElement };
const html = document.documentElement;
const can = typeof Highlight === 'function' && Boolean(CSS.highlights);
const STATES = ['draft', 'next', 'now', 'asks', 'rest', 'kept', 'done'];
let drawn: Drawn[] = [];
let over: Drawn | null = null; // the one under the mouse: its words light up, the pointer is a hand
let opts: { quiet?: boolean; colors?: Record<string, string> } = {};

// A comment on words someone selected (a click on a word quotes it too, but that is a pin on a point). Older ones,
// from before the flag, count when they quote more than one word.
const selected = (a) => can && W.flag('inkOnText') && a?.kind === 'text' && !a.zw && Boolean(a.quote?.exact) && (a.quote.selected || /\s/.test(a.quote.exact.trim()));
/** The words of a comment that is shown as ink, where they are now; null when it is a pin (or its words are gone). */
export const inkRange = (anchor): Range | null => (selected(anchor) && wordsRange(anchor)) || null;

// The page's rules for the bands (highlights are styled from the page, not from the widget's own root). The band: an
// underline half a letter thick, pulled up under the letters. Safari reads "don't skip the letters" from the words
// themselves, Chrome from the highlight, so both say it. Working and asks move through one number the page animates
// (--lab-ink-a), only while something is working or asking. Dark pages (light words) get the stronger set.
export function inkCss() {
  const ok = Object.entries(opts.colors || {}).filter(([, c]) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c));
  const C = { draft: '#8e8a82', sent: '#24a046', working: '#34c759', asks: '#e08a1a', done: '#24a046', ...Object.fromEntries(ok) };
  const D = { asks: '#f0a040', done: '#34c759', ...Object.fromEntries(ok) };
  const mix = (c: string, pct: string) => `text-decoration-color:color-mix(in srgb,${c} ${pct},transparent)`;
  const band = 'text-decoration-line:underline;text-decoration-skip-ink:none;text-decoration-thickness:.5em;text-underline-offset:-.28em;';
  const beat = opts.quiet ? '' : '*var(--lab-ink-a)';
  const on = (st: string, css: string, dk = '') => `${dk}::highlight(lab-ink-${st}){${css}}`;
  const dk = 'html.lab-ink-dk ';
  return (
    'html.lab-ink-on{text-decoration-skip-ink:none}' +
    '@property --lab-ink-a{syntax:"<number>";inherits:true;initial-value:1}' +
    'html.lab-ink-live{animation:lab-ink-pulse 1.8s ease-in-out infinite}@keyframes lab-ink-pulse{50%{--lab-ink-a:.35}}' +
    on('draft', band + mix(C.draft, '16%')) +
    on('next', band + mix(C.sent, '30%')) +
    on('now', band + mix(C.working, `calc(30%${beat})`)) +
    on('asks', band + mix(C.asks, 'calc(32% + 16%*var(--lab-ink-a))')) +
    on('rest', band + mix(C.asks, '48%')) +
    on('kept', band + mix(C.done, '28%')) +
    on('done', `text-decoration-line:underline;text-decoration-thickness:2px;${mix(C.done, '14%')}`) +
    on('next', mix(C.sent, '45%'), dk) +
    on('now', mix(C.working, `calc(40%${beat})`), dk) +
    on('asks', mix(D.asks, 'calc(30% + 14%*var(--lab-ink-a))'), dk) +
    on('rest', mix(D.asks, '44%'), dk) +
    on('done', mix(D.done, '14%'), dk) +
    // While commenting, the page's own selection paint is clear and the selected words wear the sent ink's band, so
    // selecting looks like the ink they will get (Leo, 18 Nov). Fields keep the green. The quoted words of an open
    // comment or a hovered pin are a fainter green, and so are inked words under the pointer, over their band.
    `html.lab-pinning.lab-ink-on ::selection{background-color:transparent;color:inherit;${band}${mix(C.sent, '30%')}}` +
    'html.lab-ink-on ::highlight(lab-quote){background-color:rgba(52,199,89,.14)}' +
    'html.lab-pinning.lab-ink-on :is(input,textarea)::selection{background-color:rgba(52,199,89,.3);text-decoration-line:none}'
  );
}

// The inks this render draws: [{ c, r, pin }] for comments, [{ r }] for the one being written. Each state's highlight
// takes its notes' ranges. The comment's pin, unseen, still does what it did: a click on the words is a click on it.
export function drawInks(items: Drawn[]) {
  if (!can) return;
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
    live ||= st === 'asks' || (st === 'now' && !opts.quiet);
    (by[st] ||= []).push(r);
  }
  drawn = items.filter((x) => x.c);
  html.classList.toggle('lab-ink-on', W.flag('inkOnText'));
  html.classList.toggle('lab-ink-live', live && !W.still.matches);
  html.classList.toggle('lab-ink-dk', (([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b > 150)((getComputedStyle(document.body).color.match(/[\d.]+/g) || [0, 0, 0]).map(Number)));
  // WebKit paints no highlight set while the text can't be selected (see markQuote in anchoring.ts).
  html.classList.add('lab-lit');
  for (const st of STATES) CSS.highlights.set(`lab-ink-${st}`, new Highlight(...(by[st] || [])));
  requestAnimationFrame(() => requestAnimationFrame(() => html.classList.remove('lab-lit')));
  if (over && !drawn.some((d) => d.c.id === over!.c.id)) hover(null);
}
/** True when some inked words left the page since the last render (their range has nothing in it): the pin is due. */
export const inkGone = () => drawn.some((d) => d.r.collapsed);

const hover = (d: Drawn | null) => {
  over = d;
  html.classList.toggle('lab-ink-over', Boolean(d));
  markQuote(d ? d.c.anchor : W.S.quoted); // the words under the pointer light up, faintly
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

// Before the widget's other page listeners (comments.js), so a click on inked words opens it and places nothing.
// Settings the lab passed (data-ink): quiet stills all but "asks"; a colour replaces a state's, one for light and dark.
export function startInk(data?: string) {
  try {
    opts = JSON.parse(data || '{}');
  } catch {}
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
