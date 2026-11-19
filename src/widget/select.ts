// Select mode (flag select, Leo 19 Nov): V turns the page's words into things you pick. A click picks the block under
// it in low ink and a green ring (no pin, no area, no link); Tab and Shift+Tab pick the next and the previous; Esc lets
// go of the block, and once more leaves the mode. Editing the words in place is parked (Leo, 19 Nov).
// Part of the comment widget (src/comments.js bundles it). Uses the widget's own parts through W, set once at startup.
import { holdPicked } from './hold.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let W: any;
const T = { on: false, pick: null as HTMLElement | null };
const canInk = typeof Highlight === 'function' && Boolean(CSS.highlights);
/** Low ink behind a block's words (CSS Custom Highlight: nothing in the page's DOM is touched). */
const ink = (name: string, el: HTMLElement | null) => {
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
function step(dir: 1 | -1) {
  const all: HTMLElement[] = [];
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const e = n.parentElement;
    if (e && all[all.length - 1] !== e && isBlock(e)) all.push(e);
  }
  const at = T.pick ? all.indexOf(T.pick) : -1;
  return all[at < 0 ? (dir > 0 ? 0 : all.length - 1) : (at + dir + all.length) % all.length] || null;
}
// The picked block opens the comment box (Leo, 19 Nov: "one action list for pin and select"): the same sheet, chips and
// "…" as a pin, with no pin drawn while it is open; what is sent is a pin on the block. done (leave select) joins its line.
const pointOn = (e: HTMLElement) => {
  const r = e.getBoundingClientRect();
  return W.anchorAt(r.left + Math.min(24, r.width / 2), r.top + r.height / 2, false, e); // built onto the block itself, not what is at that point
};
/** done, for the picked block's chips line. */
export const selectChips = () => {
  const x = W.el('button', { type: 'button', class: 'sel', 'data-a': 'done', 'aria-label': 'leave select', title: 'leave select' }, 'done') as HTMLButtonElement;
  x.addEventListener('mousedown', (e: Event) => e.preventDefault());
  x.addEventListener('click', (e: Event) => (e.stopPropagation(), selectMode(false)));
  return [x];
};
/** Pick a block (or none); draw: false from inside the widget's own redraw. */
export function pick(el: HTMLElement | null, draw = true) {
  const S = W.S;
  T.pick?.removeAttribute('data-lab-picked');
  T.pick = el;
  el?.setAttribute('data-lab-picked', ''); // a green ring as well as the ink, so a phone shows what is picked (Leo, 19 Nov)
  ink('lab-pick', el);
  holdPicked(T.on); // the page's reload waits while select mode is on
  el?.scrollIntoView({ block: 'nearest' });
  if (el) S.draft = S.selDraft = { anchor: pointOn(el), select: true };
  else if (S.selDraft) {
    if (S.draft === S.selDraft) S.draft = null;
    S.selDraft = null;
  } else return;
  if (draw) W.render();
}
/** The mode on or off (V, the ⋯ menu's select, C to leave). */
export function selectMode(on = !T.on) {
  T.on = on;
  W.S.selecting = on;
  document.documentElement.classList.toggle('lab-selecting', on);
  pick(null);
}
export function bindSelect(w: unknown) {
  W = w;
  W.fonts.textContent += '::highlight(lab-pick) { background-color: rgba(52, 199, 89, .18); color: inherit; } [data-lab-picked] { outline: 2px solid rgb(52, 199, 89); outline-offset: 3px; border-radius: 3px; } html.lab-selecting body, html.lab-selecting body * { cursor: default !important; }' +
    // In select mode a long tap picks a block, so the page's own text selection and iOS's menu stay off (Leo, 19 Nov:
    // a long tap called two menus, iOS's and ours).
    ' html.lab-selecting body { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }';
  const quiet = (e: Event) => (e.preventDefault(), e.stopImmediatePropagation());
  const mine = (e: MouseEvent) => T.on && !e.altKey && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.composedPath().includes(W.host);
  // Before the page and the pins see them (window, capture): a click picks a block instead of pinning.
  for (const type of ['pointerdown', 'mousedown', 'mouseup', 'click', 'dblclick'])
    addEventListener(type, (e) => {
      const m = e as MouseEvent;
      if (!mine(m)) return;
      quiet(m);
      if (type === 'pointerdown') {
        W.S.letUndoGo?.(m, false); // a sent pin's undo card lets go, as on any press on the page (comments.js); the pick redraws
        pick(blockAt(m.target));
      }
    }, true);
  addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if (!T.on || e.metaKey || e.ctrlKey || e.altKey || e.composedPath().includes(W.host) || /^(INPUT|TEXTAREA|SELECT)$/.test(t?.tagName) || t?.isContentEditable) return;
    if (e.key !== 'Escape' && e.key !== 'Tab') return;
    quiet(e);
    if (e.key === 'Tab') pick(step(e.shiftKey ? -1 : 1));
    else if (T.pick) pick(null);
    else selectMode(false);
  }, true);
}
