// Select mode (flag editText, Leo 19 Nov): V (or E) turns the page's words into things you pick. A click picks the block
// under it in low ink (no pin, no area, no link); Tab and Shift+Tab pick the next and the previous; Enter or a double
// click on the picked block opens it (edit.ts does); Esc lets go of the block, and once more leaves the mode. The
// board reuses this for frames' blocks. Part of the comment widget (src/comments.js bundles it). Uses the widget's own
// parts through W, set once at startup.
import { holdEditing } from './hold.ts';
import { selectorFor, short } from './anchoring.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let W: any;
const T = { on: false, pick: null as HTMLElement | null, set: [] as HTMLElement[], open: (_el: HTMLElement, _at?: MouseEvent) => {}, close: () => {} };
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
  const first = (t as Node | null)?.nodeType === 1 ? (t as Element) : null; // a frame's element is of its own window: no instanceof
  for (let e = first, up = 0; e && up < 3; e = e.parentElement, up++) if (isBlock(e)) return e as HTMLElement;
  return null;
};
// On a board (Leo, 19 Nov: "selection doesnt work here"): the blocks are a frame's. Its page draws no widget
// (frame.ts), so the board's reaches into the frame (same origin) and draws the ring over it, in the frame's box.
const onBoard = () => Boolean((window as unknown as { __labBoard?: unknown }).__labBoard);
const frameOf = (e: Element) => (e.ownerDocument === document ? null : (e.ownerDocument.defaultView?.frameElement as HTMLIFrameElement | null));
/** The frame under a screen point and the point inside it, on a board. */
const frameAt = (x: number, y: number) => {
  if (!onBoard()) return null;
  for (const f of [...document.querySelectorAll('#lab-board iframe')].reverse() as HTMLIFrameElement[]) { // the board's own frames, not a page's under its view
    const r = f.getBoundingClientRect();
    if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
    try {
      const d = f.contentDocument;
      const z = r.width / (f.clientWidth || r.width);
      return d?.body ? { d, x: (x - r.left) / z, y: (y - r.top) / z } : null;
    } catch {
      return null;
    }
  }
  return null;
};
const blockIn = (x: number, y: number) => {
  const at = frameAt(x, y);
  return at ? blockAt(at.d.elementFromPoint(at.x, at.y)) : null;
};
/** An element's boxes on this screen (a frame's scaled by the camera). */
const screenRects = (e: Element) => {
  const f = frameOf(e);
  const rs = [...e.getClientRects()];
  if (!f) return rs;
  const r = f.getBoundingClientRect();
  const z = r.width / (f.clientWidth || r.width);
  return rs.map((q) => new DOMRect(r.left + q.left * z, r.top + q.top * z, q.width * z, q.height * z));
};
// The half ink behind every picked block's words, as on words with a comment (feat/ink-on-text, ink.ts): a band under
// the lower 44 % of each line, from 52.6 % down, the pins' green at 30 % (45 % on a dark page, read from the words'
// own colour), corners 3 px (Leo, 19 Nov: "half height yes"). Every picked block, not only the last one (multiselect),
// and a board frame's blocks in the frame's own page. Drawn in a layer of its own over the words' line boxes, translucent
// and letting every pointer through: the page's DOM isn't touched, Safari draws it on words that can't be selected,
// and phones get it as well as the ring.
const lightWords = (color: string) => (([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b > 150)((color.match(/[\d.]+/g) || [0, 0, 0]).map(Number));
type Line = [number, number, number, number];
/** A block's lines in its page's pixels: its text pieces merged by line inside one block, cut to a box that scrolls. */
function lines(el: HTMLElement) {
  const d = el.ownerDocument;
  const w = d.defaultView!;
  const out: Line[] = [];
  const blocks: (Element | null)[] = [];
  const known = new Map<Element, Element | null>();
  const blockOf = (e: Element | null): Element | null => {
    if (!e) return null;
    if (!known.has(e)) known.set(e, /^(inline|contents)$/.test(w.getComputedStyle(e).display) ? blockOf(e.parentElement) : e);
    return known.get(e)!;
  };
  let [x0, y0, x1, y1] = [-1e9, -1e9, 1e9, 1e9];
  for (let e: Element | null = el; e && e !== d.body; e = e.parentElement) {
    if (w.getComputedStyle(e).overflow === 'visible') continue;
    const b = e.getBoundingClientRect();
    [x0, y0, x1, y1] = [Math.max(x0, b.left), Math.max(y0, b.top), Math.min(x1, b.right), Math.min(y1, b.bottom)];
  }
  const walk = d.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let t; (t = walk.nextNode() as Text | null); ) {
    if (!t.data.trim() || t.parentElement?.closest(OUT)) continue;
    const r = d.createRange();
    r.selectNodeContents(t);
    const block = blockOf(t.parentElement);
    for (const b of r.getClientRects()) {
      const mid = (b.top + b.bottom) / 2;
      const [l, tp, rt, bt] = [Math.max(b.left, x0) + w.scrollX, b.top + w.scrollY, Math.min(b.right, x1) + w.scrollX, b.bottom + w.scrollY];
      if (rt - l < 1 || b.height < 1 || mid < y0 || mid > y1) continue;
      // On a line already when they overlap by more than half the shorter's height, in the same block.
      const on = out.find((x, i) => blocks[i] === block && Math.min(x[3], bt) - Math.max(x[1], tp) > Math.min(x[3] - x[1], bt - tp) / 2);
      if (on) [on[0], on[1], on[2], on[3]] = [Math.min(on[0], l), Math.min(on[1], tp), Math.max(on[2], rt), Math.max(on[3], bt)];
      else {
        out.push([l, tp, rt, bt]);
        blocks.push(block);
      }
    }
  }
  return { lines: out, dark: lightWords(w.getComputedStyle(el).color) };
}
const bandsOf = new Map<Document, { layer: HTMLElement; off: () => void }>();
let picksNow: HTMLElement[] = [];
function inkPicks(list: HTMLElement[]) {
  picksNow = list;
  const docs = [...new Set(list.map((e) => e.ownerDocument))];
  for (const [d, b] of bandsOf) {
    if (docs.includes(d)) continue;
    b.off();
    bandsOf.delete(d);
  }
  for (const d of docs) {
    let b = bandsOf.get(d);
    if (!b) {
      const w = d.defaultView!;
      const layer = d.createElement('div');
      layer.setAttribute('data-lab-comments', '');
      layer.setAttribute('data-lab-pick-ink', '');
      layer.setAttribute('aria-hidden', 'true');
      layer.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;z-index:2147482999'; // under the widget (2147483000): its cards and sheets cover the ink
      d.documentElement.append(layer);
      // The words move: a box scrolling, the window resizing, the block's own size, a late web font.
      let queued = 0;
      const again = () => (queued ||= w.requestAnimationFrame(() => ((queued = 0), drawBands(d))));
      const ro = new w.ResizeObserver(again);
      ro.observe(d.documentElement);
      w.addEventListener('scroll', again, { capture: true, passive: true });
      w.addEventListener('resize', again);
      d.fonts?.addEventListener('loadingdone', again);
      b = { layer, off: () => (layer.remove(), ro.disconnect(), w.removeEventListener('scroll', again, true), w.removeEventListener('resize', again), d.fonts?.removeEventListener('loadingdone', again), w.cancelAnimationFrame(queued)) };
      bandsOf.set(d, b);
    }
    drawBands(d);
  }
}
function drawBands(d: Document) {
  const b = bandsOf.get(d);
  if (!b) return;
  const all = picksNow.filter((e) => e.ownerDocument === d && e.isConnected).map(lines); // all read, then all written
  b.layer.replaceChildren(...all.flatMap(({ lines: ls, dark }) => ls.map(([l, t, r, bt]) => {
    const i = d.createElement('i');
    const h = bt - t;
    i.style.cssText = `position:absolute;left:${l}px;top:${t + h * 0.526}px;width:${r - l}px;height:${h * 0.44}px;border-radius:3px;background:rgba(36,160,70,${dark ? 0.45 : 0.3})`;
    return i;
  })));
}
let unring = () => {};
function rings() {
  unring();
  unring = () => {};
  const f = T.set[0] && frameOf(T.set[0]);
  const w = f?.contentWindow;
  if (!f || !w || !f.parentElement) return;
  const layer = f.parentElement.appendChild(document.createElement('div'));
  layer.setAttribute('data-lab-rings', '');
  layer.style.cssText = 'position: absolute; inset: 0; pointer-events: none; overflow: hidden';
  const draw = () => layer.replaceChildren(...T.set.map((e) => {
    const r = e.getBoundingClientRect(); // in the frame: its px are the frame box's own
    const d = document.createElement('div');
    d.style.cssText = `position: absolute; left: ${r.left - 3}px; top: ${r.top - 3}px; width: ${r.width + 6}px; height: ${r.height + 6}px; box-sizing: border-box; border: calc(2px * var(--iz, 1)) solid rgb(52, 199, 89); border-radius: 3px`;
    return d;
  }));
  draw();
  w.addEventListener('scroll', draw, true);
  w.addEventListener('resize', draw);
  unring = () => (layer.remove(), w.removeEventListener('scroll', draw, true), w.removeEventListener('resize', draw));
}
/** The next (1) or previous (-1) block after the picked one, in reading order. */
const blocks = (doc = T.pick?.ownerDocument || document) => {
  const all: HTMLElement[] = [];
  const walk = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const e = n.parentElement;
    if (e && all[all.length - 1] !== e && isBlock(e)) all.push(e);
  }
  return all;
};
export function step(dir: 1 | -1) {
  const all = blocks();
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
  const r = screenRects(e)[0] || e.getBoundingClientRect();
  const a = W.anchorAt(r.left + Math.min(24, r.width / 2), r.top + r.height / 2, false, e);
  // A board pin names the frame (the board's anchor) and the block inside it.
  return frameOf(e) ? { ...a, selector: selectorFor(e), text: short(e.textContent, 80) || undefined } : a;
};
/** ↑ higher, ↓ deeper and done, for the picked block's chips line. */
export const selectChips = () => [
  ...(T.set.length > 1 ? [W.el('span', { class: 'sel', 'data-a': 'n', role: 'status' }, `${T.set.length} picked`) as HTMLElement] : []),
  ...([
    ['↑', 'higher: what holds it (Shift+Enter)', () => T.pick && higher(T.pick)],
    ['↓', 'deeper: inside it (Enter)', () => T.pick && !isBlock(T.pick) && deeper(T.pick)],
    ['done', 'leave select', null],
  ] as const).map(([n, say, to]) => {
    const x = W.el('button', { type: 'button', class: 'sel', 'data-a': n, 'aria-label': say, title: say }, n) as HTMLButtonElement;
    x.disabled = Boolean(to && !to());
    x.addEventListener('mousedown', (e: Event) => e.preventDefault());
    x.addEventListener('click', (e: Event) => (e.stopPropagation(), to ? pick(to() || T.pick) : selectMode(false)));
    return x;
  }),
];
/** The page holds its reloads while a block is picked or being edited. */
export const hold = () => holdEditing(Boolean(T.on || W.S.editing));
/** Pick a block (or none); draw: false from inside the widget's own redraw. */
export const pick = (el: HTMLElement | null, draw = true) => picks(el ? [el] : [], draw);
// Several picked (Leo, 19 Nov: "select should have multiselect"): Shift (or Command/Control) + click adds or drops a
// block, a drag from empty space (or with Shift) boxes the blocks it touches; the last one added holds the sheet.
const toggle = (e: HTMLElement) => picks(T.set.includes(e) ? T.set.filter((x) => x !== e) : [...T.set.filter((x) => x.ownerDocument === e.ownerDocument), e]); // one frame's at a time
function picks(list: HTMLElement[], draw = true) {
  const S = W.S;
  for (const e of T.set) e.removeAttribute('data-lab-picked');
  T.set = [...new Set(list)];
  const el = T.set[T.set.length - 1] || null;
  T.pick = el;
  for (const e of T.set) e.setAttribute('data-lab-picked', ''); // a green ring as well as the ink, so a phone shows what is picked (Leo, 19 Nov)
  inkPicks(S.editing ? [] : T.set);
  rings();
  hold();
  if (el && !frameOf(el)) el.scrollIntoView({ block: 'nearest' }); // a frame's would scroll the board
  if (el && !S.editing) S.draft = S.selDraft = { anchor: pointOn(el), select: true, n: T.set.length };
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
// Delete (or Backspace) hides the picked blocks here at once (the DOM stays, to put back) and sends one pin, so the agent
// takes them out of the file; "undo" (or Command-Z) for 5 s shows them again and takes the pin back. A reload shows them
// until the agent has edited the file. Not the "remove" action, which stays an ordinary chip (Leo, 19 Nov).
async function drop() {
  const list = [...T.set].sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  if (!list.length) return;
  const said = (e: HTMLElement) => {
    const t = (e.textContent || '').replace(/\s+/g, ' ').trim();
    return `${pointOn(e).selector || e.localName} “${t.length > 40 ? `${t.slice(0, 40)}…` : t}”`;
  };
  const anchor = pointOn(list[0]);
  const text = `delete these ${list.length} block${list.length > 1 ? 's' : ''}: ${list.map(said).join(' · ')}`;
  const was = list.map((e) => e.style.display);
  pick(null);
  for (const e of list) e.style.display = 'none';
  let id = '';
  let key = '';
  let undone = false;
  const note = W.el('div', { class: 'hint', role: 'status', style: 'pointer-events: auto; bottom: 108px; display: flex; gap: 12px; align-items: center' }, `removed ${list.length} here; I'll make it real`) as HTMLElement;
  const undo = W.el('button', { class: 'btn', type: 'button' }, 'undo') as HTMLButtonElement;
  const back = async () => {
    if (undone) return;
    undone = true;
    list.forEach((e, i) => (e.style.display = was[i]));
    note.remove();
    if (id) await take();
  };
  const take = async () => {
    await W.send({ action: 'delete', id, ...(key && !W.S.isAdmin ? { edit: key } : {}) }).catch(() => W.say("couldn't take the pin back"));
    W.S.comments = W.S.comments.filter((c: { id: string; parent?: string }) => c.id !== id && c.parent !== id);
    W.render();
  };
  W.placed.push(back);
  undo.onclick = () => (W.placed.includes(back) && W.placed.splice(W.placed.indexOf(back), 1), back());
  note.append(undo);
  W.root.append(note);
  setTimeout(() => note.remove(), 5000);
  const r = await W.send({ page: W.S.page, name: W.store.get('lab-name') || 'me', text, anchor }).catch(() => (W.say("couldn't send it"), null));
  if (!r?.comment) return;
  ({ id } = r.comment);
  key = r.edit || '';
  if (key) W.store.set(`lab-edit:${id}`, key);
  const at = W.placed.indexOf(id); // Command-Z undoes the whole delete (back), not just the pin
  if (at >= 0) W.placed.splice(at, 1);
  if (undone) return void take();
  W.S.comments.push(r.comment);
  W.markSeen([r.comment]);
  W.render();
}
export function bindSelect(w: unknown, open: typeof T.open, close: typeof T.close) {
  W = w;
  [T.open, T.close] = [open, close];
  W.fonts.textContent += '[data-lab-picked] { outline: 2px solid rgb(52, 199, 89); outline-offset: 3px; border-radius: 3px; } html.lab-editing body, html.lab-editing body *:not([data-lab-editing]) { cursor: default !important; }' +
    // In select mode a long tap picks a block, so the page's own text selection and iOS's menu stay off; the block
    // being edited keeps both (Leo, 19 Nov: a long tap called two menus, iOS's and ours). Safari paints no highlight on
    // words that can't be selected, so on a computer (presses are the widget's there: no selection can start) the
    // picked blocks stay selectable and keep their ink; phones keep the ring.
    ' @media (pointer: fine) { html.lab-editing [data-lab-picked] { -webkit-user-select: text; user-select: text; } }' +
    ' html.lab-editing body { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; } html.lab-editing [data-lab-editing], html.lab-editing [data-lab-editing] * { -webkit-user-select: text; user-select: text; -webkit-touch-callout: default; }';
  const quiet = (e: Event) => (e.preventDefault(), e.stopImmediatePropagation());
  const mine = (e: MouseEvent) => T.on && !e.altKey && !e.composedPath().includes(W.host);
  let drag: { x: number; y: number; add: boolean; on: HTMLElement | null; box: HTMLElement | null; doc?: Document } | null = null;
  // Before the page and the pins see them (window, capture): a click picks a block instead of pinning.
  for (const type of ['pointerdown', 'mousedown', 'mouseup', 'click', 'dblclick'])
    addEventListener(type, (e) => {
      const m = e as MouseEvent;
      if (!mine(m) || (W.S.editing && (m.target as Element).closest?.('[data-lab-editing]'))) return; // inside the words being edited: the browser's own
      quiet(m);
      const on = blockIn(m.clientX, m.clientY) || blockAt(m.target);
      const add = m.shiftKey || m.metaKey || m.ctrlKey;
      if (type === 'pointerdown') {
        T.close();
        // A phone: once something is picked, a tap on another block adds it and a tap on a picked one drops it.
        if ((e as PointerEvent).pointerType === 'touch') return void (on && T.set.length ? toggle(on) : pick(on));
        if (on && !add) return void pick(on);
        drag = { x: m.clientX, y: m.clientY, add, on, box: null, doc: frameAt(m.clientX, m.clientY)?.d };
      } else if (type === 'dblclick' && T.pick && T.pick === (blockIn(m.clientX, m.clientY) || blockAt(m.target))) T.open(T.pick, m);
    }, true);
  addEventListener('pointermove', (e) => {
    if (!drag || (!drag.box && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 5)) return;
    drag.box ??= W.root.appendChild(W.el('div', { 'data-lab-box': '', style: 'position: fixed; pointer-events: none; z-index: 2147483647; border: 1px solid rgb(52, 199, 89); background: rgba(52, 199, 89, .08); border-radius: 2px' })) as HTMLElement;
    Object.assign(drag.box.style, { left: `${Math.min(e.clientX, drag.x)}px`, top: `${Math.min(e.clientY, drag.y)}px`, width: `${Math.abs(e.clientX - drag.x)}px`, height: `${Math.abs(e.clientY - drag.y)}px` });
  }, true);
  addEventListener('pointerup', () => {
    const d = drag;
    drag = null;
    if (!d) return;
    if (d.box) {
      const r = d.box.getBoundingClientRect();
      d.box.remove();
      const got = blocks(d.doc || document).filter((b) => screenRects(b).some((q) => q.right > r.left && q.left < r.right && q.bottom > r.top && q.top < r.bottom));
      picks(d.add ? [...T.set.filter((x) => x.ownerDocument === (d.doc || document)), ...got] : got);
    } else if (d.on) toggle(d.on);
    else if (!d.add) pick(null);
  }, true);
  addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if (!T.on || W.S.editing || e.metaKey || e.ctrlKey || e.altKey || e.composedPath().includes(W.host) || /^(INPUT|TEXTAREA|SELECT)$/.test(t?.tagName) || t?.isContentEditable) return;
    const pickOn = T.pick;
    if (e.key === 'Escape' || e.key === 'Tab' || (pickOn && /^(Enter|Delete|Backspace)$/.test(e.key))) quiet(e);
    else return;
    if (e.key === 'Delete' || e.key === 'Backspace') return void drop();
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
