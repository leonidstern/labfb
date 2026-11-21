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
import * as move from '../widget/sheetmove.ts';

type Opts = { page: string; of?: string; push?: boolean; onClose?: () => void; own?: boolean }; // own: the board's own address (own() below)
type Open = { name: string; view: HTMLElement; destroy: () => void; onClose?: () => void; restoration: ScrollRestoration; pushed: boolean };
let cur: Open | null = null;
let lastOpts: Opts | null = null; // a forward to #board=<name> opens it as the last one was

// The view is a shadow host (like the comment widget, src/widget/styles.css): the board, its bar and its frames' labels are
// drawn inside it, so no rule of the page's (div, button, *, all: unset, !important) reaches them. !important on :host beats
// the page's own !important on the host (an inner shadow context wins the important declarations); the height is the
// --bv-h variable, set inline by paintSize. cursor: inherit keeps the page's pin pointer over the board.
const CSS = `
:host{all:initial!important;opacity:var(--bv-o,1)!important;translate:var(--bv-y,none)!important;transition:translate var(--bv-t,0ms) var(--bv-e,cubic-bezier(.32,.72,0,1))!important;display:flex!important;flex-direction:column!important;position:fixed!important;left:0!important;right:0!important;bottom:0!important;height:var(--bv-h,100%)!important;zoom:var(--bv-z,1)!important;z-index:2147482000!important;overscroll-behavior:none!important;background:#f7f7f7!important;color:#1d1d1b!important;box-shadow:0 -1px 0 rgba(0,0,0,.12),0 -8px 24px rgba(0,0,0,.08)!important;font:500 13px/1 system-ui,-apple-system,sans-serif!important;direction:ltr!important;cursor:inherit!important}
.bv-bar{position:relative;flex:none;touch-action:none;display:flex;align-items:center;gap:6px;height:40px;padding:0 8px;background:inherit;border-bottom:1px solid rgba(0,0,0,.08)}
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
@media (pointer:coarse){.bv-bar{z-index:1}.bv-bar button{position:relative;z-index:2;min-width:44px}.bv-bar button::before{content:"";position:absolute;left:0;right:0;top:-9px;bottom:-12px}}
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
// The view came to rest after a slide (the board read its box again, board.resized): every pin on the board is placed
// again where its frame now is, as after a camera move (a plain redraw kept a pin where it was put mid-slide, off the screen).
const rested = () => dispatchEvent(new CustomEvent('lab-board-moved', { detail: { camera: true, box: true } }));
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
    // One step, so fitted in this same frame: where the view is is read now (it is asked for by the board's pins), and the
    // board fits to the new size before anything is drawn (not 200 ms on, once the box rests, as a dragged edge does).
    at = view.getBoundingClientRect();
    board.resized();
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
  // The grip on the top edge, or the bar itself off its keys: drag it down and the page shows above. The edge follows the
  // pointer, one step a frame; near the top it becomes full only when let go (snapping mid-drag made it jump back and
  // forth at that height). Pulled on below the least height, it goes down with the finger, and let go there (or flicked
  // down) it slides away and closes, as the comment drawer does (Leo, 21 Nov: "board drawer also behave weird not like
  // comment drawer").
  // A finger is followed by its touch events, as the comment drawer's is (sheets.ts swipeDown): Safari on a phone let a
  // pointer drag go now and then (the first drag after opening did nothing, iOS 27 simulator, 21 Nov). A mouse or a pen
  // by its pointer events.
  const pulling = (y0: number, t0: number) => {
    let frame = 0;
    let below = 0; // px pulled past the least height
    const moves = [{ t: t0, y: y0 }];
    const to = (y: number, t: number) => {
      const want = (innerHeight - y) / innerHeight;
      size = Math.max(MIN, Math.min(1, want));
      below = Math.max(0, (MIN - want) * innerHeight);
      moves.push({ t, y });
      while (moves.length > 2 && t - moves[0].t > 200) moves.shift();
      frame ||= requestAnimationFrame(() => {
        frame = 0;
        paintSize();
        if (below) view.style.setProperty('--bv-t', '0ms'), view.style.setProperty('--bv-y', `0 ${below}px`);
        else ['--bv-t', '--bv-y'].forEach((k) => view.style.removeProperty(k));
      });
    };
    const end = (t: number, done: boolean) => {
      cancelAnimationFrame(frame);
      paintSize();
      const v = move.speedOf(moves, t);
      // At its least height, let go as the comment drawer is (move.goes): it goes on down at the finger's speed and closes.
      if (done && size <= MIN + 0.01 && move.goes(below, v, view.offsetHeight)) return void close(Math.max(0, v));
      if (below) setTimeout(() => ((at = view.getBoundingClientRect()), board.resized(), rested()), slide(view, true, Math.max(0, -v)) + 20);
      if (size > 0.97) size = 1;
      paintSize();
      saveSize(o.page, size);
    };
    return { to, end };
  };
  const drag = (e: PointerEvent) => {
    if (e.pointerType === 'touch' || (e.target as Element).closest?.('button') || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const on = e.currentTarget as HTMLElement;
    on.setPointerCapture?.(e.pointerId);
    const p = pulling(e.clientY, e.timeStamp);
    const pull = (m: PointerEvent) => p.to(m.clientY, m.timeStamp);
    const up = (u: PointerEvent) => {
      on.removeEventListener('pointermove', pull);
      on.removeEventListener('pointerup', up);
      on.removeEventListener('pointercancel', up);
      p.end(u.timeStamp, u.type === 'pointerup');
    };
    on.addEventListener('pointermove', pull);
    on.addEventListener('pointerup', up);
    on.addEventListener('pointercancel', up);
  };
  let held: ReturnType<typeof pulling> | null = null;
  const touchStart = (e: TouchEvent) => {
    if (e.touches.length !== 1 || (e.target as Element).closest?.('button')) return void (held = null);
    e.stopPropagation();
    held = pulling(e.touches[0].clientY, e.timeStamp);
  };
  const touchMove = (e: TouchEvent) => {
    if (!held) return;
    e.stopPropagation(); // the grip is in the bar: one move, once
    if (e.cancelable) e.preventDefault();
    held.to(e.touches[0].clientY, e.timeStamp);
  };
  const touchEnd = (e: TouchEvent) => {
    e.stopPropagation();
    const h = held;
    held = null;
    h?.end(e.timeStamp, e.type === 'touchend');
  };
  for (const n of o.own ? [grip] : [grip, bar]) {
    n.addEventListener('pointerdown', drag);
    n.addEventListener('touchstart', touchStart, { passive: true });
    n.addEventListener('touchmove', touchMove, { passive: false });
    n.addEventListener('touchend', touchEnd);
    n.addEventListener('touchcancel', touchEnd);
  }
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
  // Reduced motion: it fades in (started once the board is mounted: that blocks the page for a while) (Apple: a crossfade, not a pop of the whole window). Its opacity is !important in :host (all: initial),
  // which an animation or a transition can't beat, so --bv-o is stepped here, one frame at a time.
  // It comes up from the bottom, as the comment drawer does (not the board's own address: that is the whole page).
  // Where it is (at) and its pins are read again once it rests: a move is no resize, so the watch below misses it.
  if (!o.own && !matchMedia('(prefers-reduced-motion: reduce)').matches) setTimeout(() => cur?.view === view && ((at = view.getBoundingClientRect()), board.resized(), rested()), slide(view, true) + 20);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const v = /^\s*([\d.]+)(m?s)\s*$/.exec(getComputedStyle(document.documentElement).getPropertyValue('--lab-t-calm')); // lab.css is served minified: .12s
    const d = v ? parseFloat(v[1]) * (v[2] === 's' ? 1000 : 1) : 120;
    let t0 = 0;
    const fade = (now: number) => {
      const k = Math.min(1, ((t0 ||= now) === now ? 0 : now - t0) / d);
      if (k < 1) {
        view.style.setProperty('--bv-o', String(k));
        requestAnimationFrame(fade);
      } else view.style.removeProperty('--bv-o');
    };
    view.style.setProperty('--bv-o', '0');
    requestAnimationFrame(fade);
  }
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
// The view's slide, by the comment drawer's rules (../widget/sheetmove.ts): up into place (in: from below the screen, or
// back from where a finger left it, at `speed` px/ms toward its place), or down off the screen at the finger's speed
// (a tap on close: from rest, easing in). Its length in ms. No move is left on it once it rests (a moved box holds what
// is fixed inside it, the board's own layers).
function slide(view: HTMLElement, into: boolean, speed = 0) {
  const [quick, base, slow] = ['quick', 'base', 'slow'].map(token);
  const h = view.getBoundingClientRect().height;
  const off = /\s([\d.]+)px$/.exec(view.style.getPropertyValue('--bv-y'))?.[1];
  const now = off ? parseFloat(off) : into ? h + 8 : 0; // how far down it is now
  if (into && !off) {
    view.style.setProperty('--bv-t', '0ms');
    view.style.setProperty('--bv-y', `0 ${now}px`);
    void view.offsetHeight;
  }
  const way = into ? now : h + 8 - now;
  const [ms, curve] = into ? move.glide(way, speed, slow, quick) : speed > 0 ? move.carry(way, speed, slow, quick) : [base, 'cubic-bezier(.4, 0, 1, 1)'];
  view.style.setProperty('--bv-e', curve);
  view.style.setProperty('--bv-t', `${ms}ms`);
  view.style.setProperty('--bv-y', `0 ${into ? 0 : h + 8}px`);
  if (into) setTimeout(() => ['--bv-t', '--bv-y', '--bv-e'].forEach((k) => view.style.removeProperty(k)), ms);
  return ms;
}
// A motion token of lab.css (--lab-t-quick, -base, -slow) in ms, as the comment widget has them.
const token = (k: string) => {
  const v = /^\s*([\d.]+)(m?s)\s*$/.exec(getComputedStyle(document.documentElement).getPropertyValue(`--lab-t-${k}`));
  return v ? parseFloat(v[1]) * (v[2] === 's' ? 1000 : 1) : ({ quick: 120, base: 200, slow: 300 } as Record<string, number>)[k];
};
let closing = false;
/** Close the view: it slides down, then back, when it was opened here (the entry it added goes), else the address loses
 * its #board. The browser's own back takes it down at once (its own gesture is the motion). */
function close(speed = 0) {
  if (!cur || closing) return;
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches && !lastOpts?.own) {
    closing = true;
    return void setTimeout(() => ((closing = false), now()), slide(cur.view, false, speed));
  }
  now();
}
function now() {
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

// A board as a section of the page (<lab-board name>, put there by +board, src/widget/boardcam.ts): a strip of what is on it, the page itself
// left out. A tap opens the board over the page. Outside the lab the tag is an empty element, and shows nothing.
// In the page's own colours (its text colour; borders and fills from it), so it reads on a dark page as on a light one;
// straight under <body> it keeps off the screen's edges (in the shadow: what is on <lab-board> itself is the file's).
const STRIP = `:host{display:block!important;box-sizing:border-box!important;margin:16px 0!important;font:13px/1.35 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:inherit;cursor:pointer}
.edge{margin:0 16px}
.box{border:1px solid color-mix(in srgb,currentColor 16%,transparent);border-radius:12px;padding:10px;background:color-mix(in srgb,rgb(52,199,89) 7%,transparent)}
.top{display:flex;align-items:center;gap:8px;margin:0 2px 8px}
.top b{font-weight:600}.top span{opacity:.65;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.top button{font:inherit;border:0;border-radius:999px;padding:4px 11px;cursor:pointer;background:rgba(52,199,89,.18);color:inherit}
.row{display:flex;gap:8px;overflow-x:auto;scrollbar-width:thin}
.row>*{flex:none;height:120px;border-radius:8px;background:color-mix(in srgb,currentColor 6%,transparent)}
img{display:block;max-width:240px;object-fit:cover}
.page{width:160px;padding:10px;box-sizing:border-box;overflow:hidden;opacity:.8}
.none{opacity:.65;padding:4px 2px}`;
const el = (tag: string, props: object = {}, ...kids: (Node | string)[]) => {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...kids);
  return n;
};
/** A board as a section of the page: <lab-board name> (src/widget/boardcam.ts), filled with a strip of what is on the board. */
export const section = async (host: HTMLElement, o: { page: string; about: (name: string) => string }) => {
  const name = host.getAttribute('name') || '';
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(name)) return;
  const root = host.shadowRoot || host.attachShadow({ mode: 'open' });
  const b = await fetch(`/_lab/api/board?name=${name}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null), () => null);
  const frames = (b?.frames || []).filter((f: { state?: string; src: string }) => f.state !== 'archived' && f.src.split(/[?#]/)[0] !== o.page);
  const thumb = (f: { kind?: string; src: string; label?: string; id: string }) => (f.kind === 'image' ? el('img', { src: f.src, alt: f.label || '', loading: 'lazy' }) : el('div', { className: 'page' }, f.label || (f.src.startsWith('/_lab/board/') ? `variant ${f.id}` : f.src)));
  const said = o.about(name);
  root.replaceChildren(
    el('style', {}, STRIP),
    el('div', { className: host.parentElement === document.body ? 'box edge' : 'box' },
      el('div', { className: 'top' }, el('b', {}, 'Board'), el('span', {}, b ? `${frames.length || 'nothing'} on it${said && said !== '+board' ? ` · ${said.slice(0, 60)}` : ''}` : 'not found'), el('button', {}, 'Open')),
      frames.length ? el('div', { className: 'row' }, ...frames.map(thumb)) : el('div', { className: 'none' }, 'Open it to add pictures and pages for the agent.'),
    ),
  );
};
