// Selected words get one comment element (F1, Leo 18 Nov): the actions bar (comment · rewrite · cut · go) at the end of the
// words, with no chip first ("go right into bar", Leo 18 Nov); the box joins it once you type, click comment or press
// Tab / Enter. It comes and goes with the comment card's own motion (the .in / .out classes: lab-in, lab-out; "same as
// the comment one", "rework", Leo 18 Nov): the bar goes out as a card does, the dialog comes in as a card does, and a
// sent dialog leaves as a card does while the pin pops in.
// Part of the comment widget (src/comments.js bundles it). Uses the widget's own parts through W, set once at startup.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let W: any;
export function bindFluid(w: unknown) {
  W = w;
}

// Page coordinates.
type Box = { x: number; y: number; w: number; h: number };
// Words' boxes on screen.
type Rects = DOMRect[];
// state: '' gone (or going out) · bar · picked (the box is asked for) · dlg (the box)
const F = { state: '', draft: null as unknown, gen: 0 };
let fd: HTMLElement;
let bar: HTMLElement;
let dlg: HTMLElement;
let pick: (text?: string, act?: string) => void = () => {};

export const fluidState = () => F.state;
/** The actions: the bar has comment first, which opens the box; the dialog's row has only the others (the box is the
 *  comment). Long quotes (300 characters are kept) have no cut or rewrite. */
export const acts = (quote: number, bar = true) => [...(bar ? ['comment'] : []), ...(quote < 300 ? ['rewrite', 'cut'] : []), 'go'];
export const actButton = (k: string, on: boolean) => W.el('button', { type: 'button', 'data-k': k, class: on ? 'on' : '' }, k);
/** The dialog already holds this draft (a redraw leaves it, and the words typed in it, alone). */
export const fluidHas = (draft: unknown) => F.draft === draft && F.state === 'dlg';

const at = (r: DOMRect) => ({ x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height });
const now = (): Box => at(fd.getBoundingClientRect());
// Where it goes by the words (rects, on screen now): `gap` below their end, or above their start when it would leave the
// screen (or the page's content) below and fits above; across, `x` from their right edge, kept `m` from the screen's sides.
function by(rects: Rects, x: number, w: number, h: number, gap: number, m: number): Box {
  const first = at(rects[0]), end = at(rects[rects.length - 1]);
  const y = end.y + end.h + gap;
  return {
    x: Math.max(scrollX + m, Math.min(end.x + end.w + x, scrollX + document.documentElement.clientWidth - m - w)),
    y: y + h > Math.min(scrollY + innerHeight - 8, W.contentEnd()) && first.y - gap - h > scrollY + 8 ? first.y - gap - h : y,
    w,
    h,
  };
}
const frame = (b: Box) => ({ left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px` });
// Sets the element's rect, moving it there from `from` on the one curve; then runs `then`, unless something else has
// taken the element over meanwhile.
function put(to: Box, from: Box | null, ms: number, then = () => {}) {
  const gen = ++F.gen;
  const end = frame(to);
  Object.assign(fd.style, end);
  const done = () => gen === F.gen && then();
  if (!from || W.still.matches) return done();
  fd.animate([frame(from), end], { duration: ms, easing: 'cubic-bezier(.2, .8, .2, 1)' }).finished.then(done, () => {});
}
const show = (pane: HTMLElement | null, state: string) => {
  F.state = state;
  fd.hidden = false;
  bar.classList.toggle('on', pane === bar);
  dlg.classList.toggle('on', pane === dlg);
};

// The one element, made when first needed (the bar's words).
function make() {
  if (fd) return;
  fd = W.el('div', { class: 'fd', hidden: '' });
  bar = W.el('div', { class: 'pane p-bar quick' });
  dlg = W.el('div', { class: 'pane p-dlg' });
  fd.append(bar, dlg);
  W.root.append(fd);
  bar.addEventListener('click', (e) => {
    const k = (e.target as HTMLElement).dataset?.k;
    if (!k || F.state !== 'bar') return;
    F.state = 'picked';
    pick('', k === 'comment' ? '' : k);
  });
}

/** The actions bar, at the end of the selected words (their client rects), arriving as the comment card does. pick(first letter?,
 *  action?) opens the box: comment (no action), rewrite, cut or go (the dialog's own buttons then run). It lives until
 *  a click, Escape or another selection. quote: how many
 *  characters the words have. */
export function fluidBar(rects: Rects, onPick: (text?: string, act?: string) => void, quote = 0) {
  if (!rects.length) return;
  make();
  pick = onPick;
  bar.replaceChildren(...acts(quote).map((k) => actButton(k, k === 'comment')));
  const was = F.state === 'bar' && now();
  show(bar, 'bar');
  if (!was) {
    // New: the comment card's own arrival (.in, lab-in). Moved (the selection changed, the words moved): it slides there.
    fd.className = 'fd';
    void fd.offsetWidth; // restarts it when the bar comes again straight after one going out
    fd.classList.add('in');
  }
  const h = bar.offsetHeight;
  const to = by(rects, 4, bar.offsetWidth, h, 6, 8);
  put(to, was || null, 160);
}

/** Escape lets the bar go. */
export const fluidKey = (e: KeyboardEvent) => F.state === 'bar' && e.key === 'Escape' && !e.metaKey && !e.ctrlKey && !e.altKey;

/** Computers: the dialog (the actions row and the box, in `float`) comes in as a comment card does (.in), below the words'
 *  end; above them when there is no room below. rects: the quoted
 *  words, now. */
export function fluidOpen(float: HTMLElement, draft: unknown, rects: Rects) {
  make();
  F.draft = draft;
  dlg.replaceChildren(float);
  fd.className = 'fd still'; // the panes swap at once
  show(dlg, 'dlg');
  const w = Math.min(320, document.documentElement.clientWidth - 24);
  dlg.style.width = `${w}px`;
  put(by(rects, -70, w, dlg.offsetHeight, 8, 12), null, 0);
  // Its height follows the box from here on (the name row, an error), as the old box's did.
  fd.classList.add('settled');
  fd.style.height = '';
  void fd.offsetWidth; // the card's arrival, from the start
  fd.classList.add('in');
}

/** Let it go: closed, Escape, a click elsewhere, comments hidden, sent (the pin pops in as it leaves). It goes out as a
 *  comment card does (.out). */
export function fluidDrop() {
  if (!fd || fd.hidden || !F.state) return;
  F.draft = null;
  const was = now();
  F.state = '';
  fd.className = 'fd out';
  put(was, was, 140, hide); // holds its size for lab-out's length (the class does the moving), then goes
}

/** After a redraw: the element lets go of what the widget no longer shows (the draft closed, another one opened,
 *  comments hidden). draft: the draft, or the thread, now open. */
export function fluidSync(draft: unknown, on: boolean) {
  if (F.state === 'bar' ? draft || !on : F.state === 'dlg' && F.draft !== draft) fluidDrop();
}

function hide() {
  fd.hidden = true;
  fd.className = 'fd';
  fd.removeAttribute('style');
  dlg.replaceChildren(); // the box goes: its hold on reloads with it (composer.ts)
}
