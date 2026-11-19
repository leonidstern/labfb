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
// The bar for the picked block (Leo, 19 Nov: "make select tool full"), on phones and computers alike: remove · make like ·
// move · states · variants · pin · done. Each goes to the agent as a pin on the block, worded so it knows what to do. Make like and move ask for a second block first ("tap the one to copy").
let bar: HTMLElement | null = null;
let want: { say: string; act: (other: HTMLElement) => void } | null = null;
const label = (e: HTMLElement) => {
  const t = (e.textContent || '').replace(/\s+/g, ' ').trim();
  return `${e.localName}${e.id ? `#${e.id}` : ''} "${t.length > 50 ? `${t.slice(0, 49)}…` : t}"`;
};
// One tap, one pin (19 Nov: a phone's "states" sent the same pin twice in a second, and once on <body>). The same ask on
// the same block is left alone while it is on its way and for 2s after; the anchor is built onto the block itself, so a
// block scrolled away or under the bar no longer lands on whatever is at that point (body).
const lastAsk = new WeakMap<HTMLElement, { text: string; at: number }>();
const pointOn = (e: HTMLElement) => {
  const r = e.getBoundingClientRect();
  return W.anchorAt(r.left + Math.min(24, r.width / 2), r.top + r.height / 2, false, e);
};
const pinOn = async (e: HTMLElement, text: string) => {
  const was = lastAsk.get(e);
  if (was && was.text === text && Date.now() - was.at < 2000) return void W.say?.('already sent');
  lastAsk.set(e, { text, at: Date.now() });
  const anchor = pointOn(e);
  let name = '';
  try {
    name = (W.store.get('lab-name') || '').trim();
  } catch {}
  try {
    const { comment } = await W.send({ name: name || 'guest', text, anchor });
    W.S.comments.push(comment);
    W.markSeen([comment]);
    W.render();
    W.say?.('sent to the agent');
  } catch {
    lastAsk.delete(e); // not sent: a second tap may try again
    W.say?.("couldn't send it: is the lab running?");
  }
};
const ACTS: Array<[string, () => void]> = [
  ['remove', () => T.pick && pinOn(T.pick, 'Remove this.')],
  ['make like', () => {
    const p = T.pick;
    if (p) want = { say: 'tap the one to copy', act: (o) => pinOn(p, `Make this look like ${label(o)}: same size, spacing, colour and type.`) };
  }],
  ['move', () => {
    const p = T.pick;
    if (p) want = { say: 'tap where it goes: it lands after that', act: (o) => pinOn(p, `Move this to just after ${label(o)}.`) };
  }],
  ['states', () => T.pick && pinOn(T.pick, 'Show this in its states (hover, loading, empty, error) so I can review each one.')],
  ['variants', () => T.pick && pinOn(T.pick, 'Make 3 variants of this, shown in place as a / b / c tabs on it, so I can pick one.')],
  ['pin', () => {
    const p = T.pick;
    if (!p) return;
    const anchor = pointOn(p);
    selectMode(false);
    W.begin(anchor);
  }],
];
const drawBar = () => {
  if (!W) return;
  if (!bar) {
    bar = W.el('div', { class: 'selbar quick', role: 'toolbar', 'aria-label': 'picked block' });
    W.root.append(bar);
  }
  const b = (name: string, act: () => void, off = false) => {
    const x = W.el('button', { type: 'button', 'data-a': name }, name) as HTMLButtonElement;
    x.disabled = off;
    x.addEventListener('click', (e: Event) => (e.stopPropagation(), act(), drawBar()));
    return x;
  };
  if (want) bar!.replaceChildren(W.el('span', { class: 'selsay' }, want.say), b('cancel', () => (want = null)));
  else bar!.replaceChildren(...ACTS.map(([n, a]) => b(n, a, !T.pick)), b(T.pick ? 'done' : 'leave select', () => (T.pick ? pick(null) : selectMode(false))));
  bar!.hidden = !T.on;
};
/** Pick a block (or none). */
function pick(el: HTMLElement | null) {
  T.pick?.removeAttribute('data-lab-picked');
  T.pick = el;
  el?.setAttribute('data-lab-picked', ''); // a green ring as well as the ink, so a phone shows what is picked (Leo, 19 Nov)
  ink('lab-pick', el);
  holdPicked(T.on); // the page's reload waits while select mode is on
  drawBar();
  el?.scrollIntoView({ block: 'nearest' });
}
/** The mode on or off (V, the ⋯ menu's select, C to leave). */
export function selectMode(on = !T.on) {
  if (!on) want = null;
  T.on = on;
  W.S.selecting = on;
  document.documentElement.classList.toggle('lab-selecting', on);
  pick(null);
  drawBar();
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
        const other = want && blockAt(m.target);
        if (want && other && other !== T.pick) {
          const w = want;
          want = null;
          w.act(other);
          return void drawBar();
        }
        pick(blockAt(m.target));
      }
    }, true);
  addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if (!T.on || e.metaKey || e.ctrlKey || e.altKey || e.composedPath().includes(W.host) || /^(INPUT|TEXTAREA|SELECT)$/.test(t?.tagName) || t?.isContentEditable) return;
    if (e.key !== 'Escape' && e.key !== 'Tab') return;
    quiet(e);
    if (e.key === 'Tab') pick(step(e.shiftKey ? -1 : 1));
    else if (want) {
      want = null;
      drawBar();
    }
    else if (T.pick) pick(null);
    else selectMode(false);
  }, true);
}
