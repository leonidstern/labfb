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
/** The page holds its reloads while a block is picked or being edited. */
export const hold = () => holdEditing(Boolean(T.on || W.S.editing));
/** Pick a block (or none). */
export function pick(el: HTMLElement | null) {
  T.pick = el;
  ink('lab-pick', W.S.editing ? null : el);
  hold();
  el?.scrollIntoView({ block: 'nearest' });
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
  W.fonts.textContent += '::highlight(lab-pick) { background-color: rgba(120, 120, 128, .22); color: inherit; } html.lab-editing body, html.lab-editing body *:not([data-lab-editing]) { cursor: default !important; }';
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
    else if (e.key === 'Enter') T.open(pickOn!);
    else pick(step(e.shiftKey ? -1 : 1));
  }, true);
}
