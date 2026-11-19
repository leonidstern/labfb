// Selected words get one comment element (F1, Leo 18 Nov). Computers: the dialog opens at the end of the words as soon
// as they are selected ("open this right away"), arriving as the comment card does (.in); a sent dialog leaves as a
// card does while the pin pops in. Phones: the actions bar (comment · rewrite · cut) at the words' end, which grows
// into the bottom sheet (the .in / .out classes: lab-in, lab-out).
// Part of the comment widget (src/comments.js bundles it). Uses the widget's own parts through W, set once at startup.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let W: any;
export function bindFluid(w: unknown) {
  W = w;
}

// x, y: page coordinates (screen ones while it is held to the screen: f, for phones and for words in a fixed or sticky
// part of the page); r: corner radius (left to the stylesheet's own, --_radius, unless it is moving to another shape).
type Box = { x: number; y: number; w: number; h: number; r?: number; f?: boolean };
// Words' boxes on screen, and how they read: right to left (the end is then their left edge), held to the screen.
type Rects = DOMRect[] & { rtl?: boolean; fixed?: boolean };
// state: '' gone (or going out) · bar · picked (the box is asked for) · grow (phones: on its way to the sheet) · dlg (computers: the box)
const F = { state: '', draft: null as unknown, gen: 0, sheet: null as HTMLElement | null };
let fd: HTMLElement;
let bar: HTMLElement;
let dlg: HTMLElement;
let pick: (text?: string, act?: string) => void = () => {};

export const fluidState = () => F.state;
// An action: a built-in name (rewrite, cut, go, remove, fix) or one of your own (labit.json `actions`).
type Act = string | { label: string; send: string };
export const actName = (a: Act) => (typeof a === 'string' ? a : a.label);
/** The actions: the bar has comment first, which opens the box; the dialog's row has only the others (the box is the
 *  comment). Long quotes (300 characters are kept) have no cut or rewrite. */
export const acts = (quote: number, bar = true, list: Act[] = W.actions): Act[] => [...(bar ? ['comment'] : []), ...list.filter((a) => quote < 300 || !/^(rewrite|cut)$/.test(actName(a)))];
export const actButton = (a: Act, on: boolean) => W.el('button', { type: 'button', 'data-k': actName(a), class: on ? 'on' : '' }, actName(a));
/** The dialog already holds this draft (a redraw leaves it, and the words typed in it, alone). */
export const fluidHas = (draft: unknown) => F.draft === draft && /^(dlg|grow)$/.test(F.state);

const at = (r: DOMRect, dx = scrollX, dy = scrollY) => ({ x: r.left + dx, y: r.top + dy, w: r.width, h: r.height });
const now = (f = fd.style.position === 'fixed'): Box => ({ ...at(fd.getBoundingClientRect(), f ? 0 : scrollX, f ? 0 : scrollY), r: parseFloat(getComputedStyle(fd).borderTopLeftRadius), f });
// Where it goes by the words (rects, on screen now): `gap` below their end, or above their start when it would leave the
// screen (or the page's content) below and fits above; across, `x` from the end (their right edge, or the left one when
// they read right to left, mirrored then), kept `m` from the screen's sides.
function by(rects: Rects, x: number, w: number, h: number, gap: number, m: number): Box {
  const f = Boolean(rects.fixed), [dx, dy] = f ? [0, 0] : [scrollX, scrollY];
  const first = at(rects[0], dx, dy), end = at(rects[rects.length - 1], dx, dy);
  const y = end.y + end.h + gap;
  return {
    x: Math.max(dx + m, Math.min(rects.rtl ? end.x - x - w : end.x + end.w + x, dx + document.documentElement.clientWidth - m - w)),
    y: y + h > Math.min(dy + innerHeight - 8, f ? 1e9 : W.contentEnd()) && first.y - gap - h > dy + 8 ? first.y - gap - h : y,
    w,
    h,
    f,
  };
}
const frame = (b: Box) => ({ left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px`, ...(b.r === undefined ? {} : { borderRadius: `${b.r}px` }) });
// Sets the element's rect, moving it there from `from` on the one curve; then runs `then`, unless something else has
// taken the element over meanwhile.
function put(to: Box, from: Box | null, ms: number, then = () => {}) {
  const gen = ++F.gen;
  const end = frame(to);
  Object.assign(fd.style, end, { position: to.f ? 'fixed' : '' });
  const done = () => gen === F.gen && then();
  if (!from || W.still.matches) return done();
  fd.animate([frame(from), end], { duration: ms, easing: 'cubic-bezier(.2, .8, .2, 1)' }).finished.then(done, () => {});
}
const show = (pane: HTMLElement | null, state: string) => {
  F.state = state;
  fd.hidden = fd.inert = false;
  bar.classList.toggle('on', pane === bar);
  dlg.classList.toggle('on', pane === dlg);
};

// The one element, made when first needed (the bar's words, or a dialog back after a reload).
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
 *  a click, Escape or another selection; on phones as long as the page's own selection (comments.js). quote: how many
 *  characters the words have. Without onPick: the same bar, moved to where its words are now (the window resized, an
 *  inner box scrolled). */
export function fluidBar(rects: Rects, onPick?: (text?: string, act?: string) => void, quote = 0) {
  if (!rects.length) return;
  make();
  if (onPick) {
    pick = onPick;
    bar.replaceChildren(...acts(quote).map((k) => actButton(k, k === 'comment')));
  }
  const was = F.state === 'bar' && now();
  show(bar, 'bar');
  if (!was) {
    // New: the comment card's own arrival (.in, lab-in). Moved (the selection changed, the words moved): it slides there.
    fd.className = 'fd';
    void fd.offsetWidth; // restarts it when the bar comes again straight after one going out
    fd.classList.add('in');
  }
  const h = bar.offsetHeight;
  // Phones: clear of the selection's handle, which hangs below the last line.
  const to = by(rects, 4, bar.offsetWidth, h, W.sheetMode.matches ? 14 : 6, 8);
  put(to, was || null, 160);
}

/** Any letter typed while the bar shows starts the comment with it (F4), Tab or Enter opens it empty, so does the first key
 *  of an input method or a dead key (the page keeps that key: the box takes the rest); Escape lets the bar go. */
export function fluidKey(e: KeyboardEvent) {
  if (F.state !== 'bar' || e.metaKey || e.ctrlKey || e.altKey) return false;
  if (e.key === 'Escape') return true; // the widget lets it go, and its words (comments.js)
  const blank = /^(Dead|Process)$/.test(e.key) || e.keyCode === 229;
  if (e.isComposing && !blank) return false;
  const first = /^(Tab|Enter)$/.test(e.key) || blank ? '' : e.key;
  if (first[1] || first === ' ') return false; // a space scrolls the page, as it always has; other keys do their own thing
  if (!blank) e.preventDefault();
  F.state = 'picked';
  pick(first);
  return true;
}

/** Computers: the dialog (the actions row and the box, in `float`) comes in as a comment card does (.in), below the words'
 *  end; above them when there is no room below; rects: the quoted
 *  words, now. back: it is back after a reload, so no motion. */
export function fluidOpen(float: HTMLElement, draft: unknown, rects: Rects, back = false) {
  make();
  F.draft = draft;
  dlg.replaceChildren(float);
  fd.className = 'fd still'; // the panes swap at once
  show(dlg, 'dlg');
  const w = Math.min(320, document.documentElement.clientWidth - 24);
  dlg.style.width = `${w}px`;
  const h = dlg.offsetHeight;
  put(by(rects, -70, w, h, 8, 12), null, 0);
  // The box settles into its open size a moment later (fonts, the name row): placed again by its real height, so above the
  // words it never overlaps them.
  requestAnimationFrame(() => F.state === 'dlg' && F.draft === draft && Math.abs(dlg.offsetHeight - h) > 1 && put(by(rects, -70, w, dlg.offsetHeight, 8, 12), null, 0));
  // Its height follows the box from here on (the name row, an error), as the old box's did.
  fd.classList.add('settled');
  fd.style.height = '';
  // Its own height now the row and the box are in: where it sits (above the words, on the window's last line) is worked out on that.
  if (Math.abs(fd.offsetHeight - dlg.offsetHeight) > 1 || fd.offsetHeight !== parseFloat(fd.style.height || '0')) {
    const h = fd.offsetHeight;
    put(by(rects, -70, w, h, 8, 12), null, 0);
    fd.style.height = '';
  }
  if (!back) {
    void fd.offsetWidth; // the card's arrival, from the start
    fd.classList.add('in');
  }
}

/** The open dialog stays with its words: the page scrolled or resized, a saved file moved them. Words gone (a save
 *  took them away): it stays where it is, cut and rewrite off. */
export function fluidFollow(rects: Rects) {
  if (F.state !== 'dlg') return;
  fd.classList.toggle('gone', !rects.length);
  if (!rects.length) return;
  const from = now(), to = by(rects, -70, from.w, from.h, 8, 12);
  if (Math.abs(to.x - from.x) < 1 && Math.abs(to.y - from.y) < 1 && to.f === from.f) return;
  put(to, from, 160, () => (fd.style.height = ''));
}
/** Whether the element is held to the screen (words in a fixed or sticky part): the page's scroll moves it then. */
export const fluidFixed = () => Boolean(fd && !fd.hidden && fd.style.position === 'fixed');

/** Phones: the bar grows into the bottom sheet (sheets.ts places it): the element takes the sheet's rect and look,
 *  then the sheet shows in its place and its contents fade in. A sheet drawn again on the way is held back too. */
export function fluidSheet(sheet: HTMLElement) {
  if (F.state === 'grow' && F.sheet) F.sheet = sheet;
  else if (F.state !== 'picked') return fluidDrop();
  else {
    F.sheet = sheet;
    // Held to the screen, as the sheet is: the page may scroll the pin into view under it meanwhile (revealDraft).
    const from = now(true);
    show(null, 'grow');
    put({ ...at(sheet.getBoundingClientRect(), 0, 0), r: parseFloat(getComputedStyle(sheet).borderTopLeftRadius), f: true }, from, 500, () => {
      F.sheet!.style.visibility = '';
      for (const kid of F.sheet!.children) kid.animate([{ opacity: 0 }, { opacity: 1 }], 200);
      hide();
    });
  }
  sheet.style.visibility = 'hidden';
}

/** Let it go: closed, Escape, a click elsewhere, comments hidden, sent (the pin pops in as it leaves). It goes out as a
 *  comment card does (.out). */
export function fluidDrop() {
  if (!fd || fd.hidden || !F.state) return;
  if (F.sheet) F.sheet.style.visibility = '';
  F.sheet = F.draft = null;
  const was = now();
  F.state = '';
  fd.inert = true;
  fd.className = 'fd out';
  put(was, was, 140, hide); // holds its size for lab-out's length (the class does the moving), then goes
}

/** After a redraw: the element lets go of what the widget no longer shows (the draft closed, another one opened,
 *  comments hidden). draft: the draft, or the thread, now open. */
export function fluidSync(draft: unknown, on: boolean) {
  if (F.state === 'bar' ? draft || !on : /^(dlg|grow)$/.test(F.state) && F.draft !== draft && !F.sheet) fluidDrop();
}

function hide() {
  F.state = '';
  F.draft = null;
  fd.hidden = true;
  for (const a of fd.getAnimations()) a.cancel();
  fd.className = 'fd';
  fd.removeAttribute('style');
  dlg.replaceChildren(); // the box goes: its hold on reloads with it (composer.ts)
}
