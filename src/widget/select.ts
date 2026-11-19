// Select mode (flag editText, Leo 19 Nov): V (or E) turns the page's words into things you pick. A click picks the block
// under it in low ink (no pin, no area, no link); Tab and Shift+Tab pick the next and the previous; Enter or a double
// click on the picked block opens it (edit.ts does); Esc lets go of the block, and once more leaves the mode. The
// board reuses this for frames' blocks. Part of the comment widget (src/comments.js bundles it). Uses the widget's own
// parts through W, set once at startup.
import { holdEditing } from './hold.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let W: any;
const T = { on: false, pick: null as HTMLElement | null, open: (_el: HTMLElement, _at?: MouseEvent) => {}, close: () => {} };
const canInk = typeof Highlight === 'function' && Boolean(CSS.highlights);
/** Low ink behind a block's words (CSS Custom Highlight: nothing in the page's DOM is touched): pick, sent, kept. */
export const ink = (name: string, el: HTMLElement | null) => {
  if (!canInk) return;
  if (!el) return void CSS.highlights.delete(name);
  const r = document.createRange();
  r.selectNodeContents(el);
  CSS.highlights.set(name, new Highlight(r));
};
// A block: an element that holds words and nothing but words (no tags inside), and is on screen.
const OUT = 'script, style, noscript, textarea, input, select, svg, [data-lab-comments]';
const isBlock = (e: Element) => !e.childElementCount && Boolean(e.textContent?.trim()) && !e.closest(OUT) && e.getClientRects().length > 0 && !(e as HTMLElement).isContentEditable;
const blockAt = (t: EventTarget | null) => {
  for (let e = t instanceof Element ? t : null, up = 0; e && up < 3; e = e.parentElement, up++) if (isBlock(e)) return e as HTMLElement;
  return null;
};
/** The next (1) or previous (-1) block after the picked one, in reading order. */
export function step(dir: 1 | -1) {
  const all: HTMLElement[] = [];
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const e = n.parentElement;
    if (e && all[all.length - 1] !== e && isBlock(e)) all.push(e);
  }
  const at = T.pick ? all.indexOf(T.pick) : -1;
  return all[at < 0 ? (dir > 0 ? 0 : all.length - 1) : (at + dir + all.length) % all.length] || null;
}
export const picked = () => T.pick;
// Higher and deeper, as in Figma (Leo, 19 Nov): Shift+Enter picks what holds the picked thing (its parent, never the
// body), Enter goes into it (its first child that shows), and on words Enter edits them as before.
const shows = (e: Element) => e.getClientRects().length > 0 && !e.closest(OUT);
const higher = (e: HTMLElement) => {
  for (let p = e.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) if (shows(p) && (p.getBoundingClientRect().height > e.getBoundingClientRect().height + 1 || p.getBoundingClientRect().width > e.getBoundingClientRect().width + 1)) return p;
  return null;
};
const deeper = (e: HTMLElement) => ([...e.children].find((c) => shows(c) && (c.textContent || '').trim()) as HTMLElement) || null;
export const isWords = (e: HTMLElement | null) => Boolean(e) && isBlock(e!);
// The picked block opens the comment box (Leo, 19 Nov: "one action list for pin and select"): the same sheet, chips and
// "…" as a pin, with no pin drawn while it is open; what is sent is a pin on the block. ↑ ↓ and done join its chips line.
const pointOn = (e: HTMLElement) => {
  const r = e.getBoundingClientRect();
  return W.anchorAt(r.left + Math.min(24, r.width / 2), r.top + r.height / 2, false, e);
};
/** ↑ higher, ↓ deeper and done, for the picked block's chips line. */
export const selectChips = () =>
  ([
    ['↑', 'higher: what holds it (Shift+Enter)', () => T.pick && higher(T.pick)],
    ['↓', 'deeper: inside it (Enter)', () => T.pick && !isBlock(T.pick) && deeper(T.pick)],
    ['done', 'leave select', null],
  ] as const).map(([n, say, to]) => {
    const x = W.el('button', { type: 'button', class: 'sel', 'data-a': n, 'aria-label': say, title: say }, n) as HTMLButtonElement;
    x.disabled = Boolean(to && !to());
    x.addEventListener('mousedown', (e: Event) => e.preventDefault());
    x.addEventListener('click', (e: Event) => (e.stopPropagation(), to ? pick(to() || T.pick) : selectMode(false)));
    return x;
  });
/** The page holds its reloads while a block is picked or being edited. */
export const hold = () => holdEditing(Boolean(T.on || W.S.editing));
/** Pick a block (or none); draw: false from inside the widget's own redraw. */
export function pick(el: HTMLElement | null, draw = true) {
  const S = W.S;
  T.pick?.removeAttribute('data-lab-picked');
  T.pick = el;
  el?.setAttribute('data-lab-picked', ''); // a green ring as well as the ink, so a phone shows what is picked (Leo, 19 Nov)
  ink('lab-pick', S.editing ? null : el);
  hold();
  el?.scrollIntoView({ block: 'nearest' });
  if (el && !S.editing) S.draft = S.selDraft = { anchor: pointOn(el), select: true };
  else if (S.selDraft) {
    if (S.draft === S.selDraft) S.draft = null;
    S.selDraft = null;
  } else return;
  if (draw) W.render();
}
/** The mode on or off (V, E). */
export function selectMode(on = !T.on) {
  if (!on) T.close();
  T.on = on;
  W.S.selecting = on;
  document.documentElement.classList.toggle('lab-editing', on);
  pick(null);
}
export const selectOn = () => T.on;
export function bindSelect(w: unknown, open: typeof T.open, close: typeof T.close) {
  W = w;
  [T.open, T.close] = [open, close];
  W.fonts.textContent += '::highlight(lab-pick) { background-color: rgba(52, 199, 89, .18); color: inherit; } [data-lab-picked] { outline: 2px solid rgb(52, 199, 89); outline-offset: 3px; border-radius: 3px; } html.lab-editing body, html.lab-editing body *:not([data-lab-editing]) { cursor: default !important; }' +
    // In select mode a long tap picks a block, so the page's own text selection and iOS's menu stay off; the block
    // being edited keeps both (Leo, 19 Nov: a long tap called two menus, iOS's and ours).
    ' html.lab-editing body { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; } html.lab-editing [data-lab-editing], html.lab-editing [data-lab-editing] * { -webkit-user-select: text; user-select: text; -webkit-touch-callout: default; }';
  const quiet = (e: Event) => (e.preventDefault(), e.stopImmediatePropagation());
  const mine = (e: MouseEvent) => T.on && !e.altKey && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.composedPath().includes(W.host);
  // Before the page and the pins see them (window, capture): a click picks a block instead of pinning.
  for (const type of ['pointerdown', 'mousedown', 'mouseup', 'click', 'dblclick'])
    addEventListener(type, (e) => {
      const m = e as MouseEvent;
      if (!mine(m) || (W.S.editing && (m.target as Element).closest?.('[data-lab-editing]'))) return; // inside the words being edited: the browser's own
      quiet(m);
      if (type === 'pointerdown') {
        T.close();
        pick(blockAt(m.target));
      } else if (type === 'dblclick' && T.pick && T.pick === blockAt(m.target)) T.open(T.pick, m);
    }, true);
  addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if (!T.on || W.S.editing || e.metaKey || e.ctrlKey || e.altKey || e.composedPath().includes(W.host) || /^(INPUT|TEXTAREA|SELECT)$/.test(t?.tagName) || t?.isContentEditable) return;
    const pickOn = T.pick;
    if (e.key === 'Escape' || e.key === 'Tab' || (pickOn && e.key === 'Enter')) quiet(e);
    else return;
    if (e.key === 'Escape') {
      if (pickOn) pick(null);
      else selectMode(false);
    }
    else if (e.key === 'Enter' && e.shiftKey) pick(higher(pickOn!) || pickOn);
    else if (e.key === 'Enter') {
      if (isBlock(pickOn!)) T.open(pickOn!);
      else pick(deeper(pickOn!) || pickOn);
    }
    else pick(step(e.shiftKey ? -1 : 1));
  }, true);
}
