// Part of the comment widget (src/comments.js bundles it). Uses the widget's own parts through W, set once at startup.
//
// Zoom comments (3). 3 once: zoom in; 3 again: zoom out; again: in. While it's on, every new comment (a click, a drawn
// area, selected words, a hold on phones) is a zoom comment: the same box, with words or none, sent with `zoom: in` or
// `zoom: out` on its spot and the block it's in (the nearest element with an id). The agent writes one block for it,
// a deeper look or the bigger picture, and the lab places it (lib/zoom.ts). When it lands, the page goes to it.
// 1, 2, 4 or Escape (nothing open) leave zoom. The go button shows it: "zoom +" or "zoom −".
import type { Dir } from '../../lib/zoom.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let W: any;
export function bindZoom(w: unknown) {
  W = w;
}

// The zoom in / zoom out icon: a magnifier with + or −, in the pin, the pointer and the go button.
export function zoomIcon(dir: Dir) {
  const i = document.createElement('span');
  i.className = 'zi';
  i.setAttribute('aria-hidden', 'true');
  i.innerHTML = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="6.8" cy="6.8" r="4.6"/><path d="M10.3 10.3 14 14M4.6 6.8h4.4${dir === 'in' ? 'M6.8 4.6v4.4' : ''}"/></svg>`;
  return i;
}

// Zooms asked from this page and not on it yet: once the lab places one, the page scrolls to it, once.
const asked: { block: string; dir: Dir; at: number }[] = [];
export function zoomAsked(block: string, dir: Dir) {
  asked.push({ block, dir, at: Date.now() });
}
const made = (block: string, dir: Dir) => {
  const e = document.querySelector(`[data-zoom="${dir}"][data-zoom-of="${CSS.escape(block)}"]`);
  return e && !W.host.contains(e) ? e : null;
};

// The block that came back: its heading in view with room above, and outlined for a moment. On the element itself
// (the widget's layer is redrawn as comments arrive, which would drop an outline drawn there).
export function goTo(e: Element) {
  const r = e.getBoundingClientRect();
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  scrollTo({ top: Math.max(0, r.top + scrollY - 24), behavior: still ? 'auto' : 'smooth' });
  const ring = '2px solid rgb(52, 199, 89)';
  e.animate([{ outline: ring, outlineOffset: '4px' }, { outline: ring, outlineOffset: '4px', offset: 0.7 }, { outline: '2px solid transparent', outlineOffset: '4px' }], { duration: 2000 });
}

/** After every redraw, and after the page is patched: a zoom asked for that just landed. */
export function draw() {
  for (let i = asked.length - 1; i >= 0; i--) {
    const a = asked[i];
    const e = made(a.block, a.dir);
    if (e || Date.now() - a.at > 30 * 60_000) asked.splice(i, 1); // landed, or given up after half an hour
    if (e) requestAnimationFrame(() => goTo(e));
  }
}

/** Zoom in, out, or off (''). */
export function setZoom(v: '' | Dir) {
  if (v && W.S.cursorMode) W.setCursor(false); // a click has to place something
  W.S.zoomMode = v;
  try {
    sessionStorage.setItem('lab-zoom', v);
  } catch {}
  W.refreshPinCursor(); // the drawn pointer shows + or −
  W.goFace();
  W.recheck();
  W.render();
}
/** The keys while zoom is on. True when the key was zoom's. */
export function zoomKey(e: KeyboardEvent, _letter?: string): boolean {
  if (e.key === 'Escape') return setZoom(''), true;
  return false;
}

export function startZoom() {
  try {
    const v = sessionStorage.getItem('lab-zoom');
    W.S.zoomMode = v === 'in' || v === 'out' ? v : '';
  } catch {
    W.S.zoomMode = '';
  }
}
