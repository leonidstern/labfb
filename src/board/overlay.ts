// A board in the page it is linked from (Leo, 19 Nov: "can board be part of same page?", "should not have
// separate labit page and controls, should have resizable window tho and share comments with main page"). A part the
// widget loads when a board link is clicked (src/comments.js, part('boardview')): a view over the same page, the board
// drawn in it by mount.ts. No second widget: the page's own one stays on top and its pins on the board's frames are the
// page's comments (anchor kind board, with the board's name). The address gets #board=<name>, so back closes it and a
// reload opens it again; closing leaves the page where it was scrolled. The view's height is kept per page.
//
// The board's own address (/_lab/board/<name>, a direct link) is this same view, by itself: the lab serves a page with
// nothing else on it, and own() below puts the view over all of it (no half, nothing is under it). That is for a board
// with no page of its own to be over; one that is about a page goes there (the lab redirects), so it has one set of pins.
import { mountBoard } from './mount.ts';

type Opts = { page: string; of?: string; push?: boolean; onClose?: () => void; own?: boolean }; // own: the board's own address (own() below)
type Open = { name: string; view: HTMLElement; destroy: () => void; onClose?: () => void; restoration: ScrollRestoration; pushed: boolean };
let cur: Open | null = null;
let lastOpts: Opts | null = null; // a forward to #board=<name> opens it as the last one was

// The view is a shadow host (like the comment widget, src/widget/styles.css): the board, its bar and its frames' labels are
// drawn inside it, so no rule of the page's (div, button, *, all: unset, !important) reaches them. !important on :host beats
// the page's own !important on the host (an inner shadow context wins the important declarations); the height is the
// --bv-h variable, set inline by paintSize. cursor: inherit keeps the page's pin pointer over the board.
const CSS = `
:host{all:initial!important;display:flex!important;flex-direction:column!important;position:fixed!important;left:0!important;right:0!important;bottom:0!important;height:var(--bv-h,100%)!important;zoom:var(--bv-z,1)!important;z-index:2147482000!important;overscroll-behavior:none!important;background:#f7f7f7!important;color:#1d1d1b!important;box-shadow:0 -1px 0 rgba(0,0,0,.12),0 -8px 24px rgba(0,0,0,.08)!important;font:500 13px/1 system-ui,-apple-system,sans-serif!important;direction:ltr!important;cursor:inherit!important}
.bv-bar{position:relative;flex:none;display:flex;align-items:center;gap:6px;height:40px;padding:0 8px;background:inherit;border-bottom:1px solid rgba(0,0,0,.08)}
:host(.full) .bv-bar{height:calc(40px + env(safe-area-inset-top,0px));padding-top:env(safe-area-inset-top,0px)}
.bv-bar button{font:inherit;color:inherit;background:transparent;border:0;border-radius:999px;padding:7px 11px;cursor:pointer}
.bv-bar button:hover{background:rgba(0,0,0,.06)}
.bv-name{flex:1;text-align:center;opacity:.7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:normal}
.bv-grip{position:absolute;left:0;right:0;top:-5px;height:10px;cursor:ns-resize;touch-action:none;z-index:1}
.bv-grip::after{content:"";position:absolute;left:50%;top:7px;width:36px;height:4px;margin-left:-18px;border-radius:2px;background:currentColor;opacity:.25}
:host(.full) .bv-grip{top:env(safe-area-inset-top,0px)}
:host(.full) .bv-grip::after{top:3px}
.bv-box{position:relative;flex:1;min-height:0}
.bv-box #lab-board{position:absolute}
@media (prefers-color-scheme:dark){:host{background:#1b1b1a!important;color:#e9e8e4!important}.bv-bar button:hover{background:rgba(255,255,255,.08)}.bv-bar{border-color:rgba(255,255,255,.08)}}
`;
const MIN = 0.25; // the least of the window it is dragged down to
const sizeKey = (page: string) => `lab-board-size:${page}`;
const readSize = (page: string) => {
  try {
    const v = parseFloat(localStorage.getItem(sizeKey(page)) || '');
    return v >= MIN && v <= 1 ? v : 1;
  } catch {
    return 1;
  }
};
const saveSize = (page: string, v: number) => {
  try {
    localStorage.setItem(sizeKey(page), String(Math.round(v * 1000) / 1000));
  } catch {}
};
const nameInHash = () => /^#board=([a-z0-9][a-z0-9_-]*)/i.exec(location.hash)?.[1] || '';
const moved = () => dispatchEvent(new Event('lab-board-moved')); // the widget draws the pins again (the board's and the page's under it)
// The page scrolled under a half view: the board's pins are held to the screen, the page's own scroll with it, so the
// widget only hides or shows those the view's edge crossed (no redraw per scroll step: the pins flickered; Leo, 19 Nov).
const scrolled = () => dispatchEvent(new CustomEvent('lab-board-moved', { detail: { scroll: true } }));

/** The board called name in a view over this page. */
export function show(name: string, o: Opts) {
  lastOpts = o;
  if (!document.body) return void addEventListener('DOMContentLoaded', () => show(name, o), { once: true });
  if (cur?.name === name) return;
  if (cur) teardown();
  const pushed = o.push !== false;
  if (pushed) history.pushState({ ...(history.state && typeof history.state === 'object' ? history.state : {}), labBoard: name }, '', `${location.pathname}${location.search}#board=${name}`);
  const restoration = history.scrollRestoration;
  history.scrollRestoration = 'manual'; // back from #board=… keeps the page where it is now, not where it was when the view opened

  const view = document.createElement('div');
  view.setAttribute('data-lab-board-view', name);
  view.setAttribute('role', 'dialog');
  view.setAttribute('aria-label', `board ${name}`);
  const bar = document.createElement('div');
  bar.className = 'bv-bar';
  bar.setAttribute('data-uncommentable', '');
  const btn = (t: string, label: string, fn: () => void) => {
    const b = Object.assign(document.createElement('button'), { type: 'button', textContent: t });
    b.setAttribute('aria-label', label);
    b.addEventListener('click', (e) => (e.stopPropagation(), fn()));
    return b;
  };
  const grip = document.createElement('div');
  grip.className = 'bv-grip';
  grip.setAttribute('aria-hidden', 'true');
  const title = Object.assign(document.createElement('span'), { className: 'bv-name', textContent: `board ${name}` });
  let size = o.own ? 1 : readSize(o.page);
  const toggle = btn('', 'full or half', () => {
    size = size >= 1 ? 0.5 : 1;
    saveSize(o.page, size);
    paintSize();
  });
  toggle.className = 'bv-size';
  const closeBtn = o.own ? btn('‹ back', 'back to the page', () => backTo(o.of || '')) : btn('‹ close', 'close the board', () => close());
  closeBtn.className = 'bv-close';
  // The board's own address: no half (nothing is under it), and the way back only when it says which page it is about.
  if (o.own) bar.append(...(o.of ? [closeBtn] : []), title);
  else bar.append(grip, closeBtn, title, toggle);
  const box = document.createElement('div');
  box.className = 'bv-box';
  const root = document.createElement('div');
  box.append(root);
  view.attachShadow({ mode: 'open' }).append(Object.assign(document.createElement('style'), { textContent: CSS }), bar, box);
  const paintSize = () => {
    view.style.setProperty('--bv-h', size >= 1 ? '100%' : `${size * 100}%`);
    view.classList.toggle('full', size >= 1);
    toggle.textContent = size >= 1 ? 'half' : 'full';
  };
  paintSize();
  // The grip on the top edge: drag it down and the page shows above. The edge follows the pointer, one step a frame;
  // near the top it becomes full only when let go (snapping mid-drag made it jump back and forth at that height).
  grip.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    grip.setPointerCapture?.(e.pointerId);
    let frame = 0;
    const move = (m: PointerEvent) => {
      size = Math.max(MIN, Math.min(1, (innerHeight - m.clientY) / innerHeight));
      frame ||= requestAnimationFrame(() => ((frame = 0), paintSize()));
    };
    const up = () => {
      grip.removeEventListener('pointermove', move);
      cancelAnimationFrame(frame);
      if (size > 0.97) size = 1;
      paintSize();
      saveSize(o.page, size);
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up, { once: true });
    grip.addEventListener('pointercancel', up, { once: true });
  });
  // The view's bar never scrolls the page behind (the board itself pans on the wheel).
  bar.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
  // A page's zoom on <html> or <body> scales what is drawn in the view: it zooms the other way, by what 100 px comes out as
  // (a probe, left in the shadow root).
  document.body.append(view);
  const k = view.shadowRoot!.appendChild(Object.assign(document.createElement('i'), { style: 'position:absolute;width:100px;height:0;visibility:hidden' })).getBoundingClientRect().width / 100;
  if (k > 0 && Math.abs(k - 1) > 0.001) view.style.setProperty('--bv-z', String(Math.min(10, Math.max(0.1, 1 / k))));
  // Where the view is, kept (it is asked for every pin of the page as the page scrolls under a half view). Watched
  // before the board watches its own box, so the board's word of a new size finds this one already right.
  let at = view.getBoundingClientRect();
  const ro = new ResizeObserver(() => (at = view.getBoundingClientRect()));
  ro.observe(view);
  // A board that is about another page lives there (one set of pins): opened from this one, it goes over its own page.
  const home = (key: string, of: string) => {
    const flat = (p: string) => p.replace(/(\.html?|\/)$/i, '');
    if (o.own || key === o.page || flat(new URL(of, location.href).pathname) === flat(location.pathname)) return; // already on it
    history.replaceState(history.state, '', `${location.pathname}${location.search}`);
    location.assign(`${of.split('#')[0]}#board=${name}`);
  };
  const board = mountBoard(root, name, o.own ? { of: o.of, back: o.of ? () => backTo(o.of || '') : undefined, hash: true, clip: true } : { of: o.of, back: () => close(), clip: true, home });
  const covers = (x: number, y: number) => x >= at.left && x <= at.right && y >= at.top && y <= at.bottom;
  Object.assign(window, { __labBoard: { ...board.api, covers } });
  // The page scrolls under a half view: its pins and the board's are drawn again.
  addEventListener('scroll', scrolled, { passive: true });
  cur = { name, view, destroy: () => (ro.disconnect(), board.destroy()), onClose: o.onClose, restoration, pushed };
  moved();
}

function teardown() {
  const c = cur;
  if (!c) return;
  cur = null;
  removeEventListener('scroll', scrolled);
  c.destroy();
  c.view.remove();
  delete (window as unknown as { __labBoard?: unknown }).__labBoard;
  setTimeout(() => (history.scrollRestoration = c.restoration), 0);
  c.onClose?.();
  moved();
}

/** Close the view: back, when it was opened here (the entry it added goes), else the address loses its #board. */
function close() {
  if (!cur) return;
  if (cur.pushed && nameInHash() === cur.name) return history.back(); // popstate (below) takes it down
  try {
    history.replaceState(history.state, '', `${location.pathname}${location.search}`);
  } catch {}
  teardown();
}

// Back and forward: the view follows the address's #board=<name>.
addEventListener('popstate', () => {
  if (lastOpts?.own) return; // the board's own address keeps the camera there instead
  const want = nameInHash();
  if (cur && want !== cur.name) teardown();
  if (want && !cur && lastOpts) show(want, { ...lastOpts, push: false });
});

// Back to the page this board is about, from the board's own address. Opened from that page in this tab: the browser's
// own back, which gives the page back where it was (bfcache / scroll restoration; Leo, 19 Nov: "closing board should
// back me from where i opened"). Otherwise a plain visit, and the page puts its scroll back from the key it left on its
// way here (the one a reload uses).
function backTo(of: string) {
  let came = false;
  try {
    const r = document.referrer && new URL(document.referrer);
    came = !!r && r.origin === location.origin && r.pathname === new URL(of, location.href).pathname && history.length > 1;
  } catch {}
  if (came) history.back();
  else location.href = of;
}

/** The board called name at its own address (/_lab/board/<name>[?of=/page]): the view over the whole of an empty page.
 * ⇧B, Esc on an empty board, "‹ back" and the browser's own back go to the page it is about, when the address names one. */
export function own(name: string) {
  show(name, { page: '', of: new URLSearchParams(location.search).get('of') || '', push: false, own: true });
}
