// A board in the page it is linked from (flag board; Leo, 19 Nov: "can board be part of same page?", "should not have
// separate labit page and controls, should have resizable window tho and share comments with main page"). A part the
// widget loads when a board link is clicked (src/comments.js, part('boardview')): a view over the same page, the board
// drawn in it by mount.ts. No second widget: the page's own one stays on top and its pins on the board's frames are the
// page's comments (anchor kind board, with the board's name). The address gets #board=<name>, so back closes it and a
// reload opens it again; closing leaves the page where it was scrolled. The view's height is kept per page.
import { mountBoard } from './mount.ts';

type Opts = { page: string; of?: string; push?: boolean; onClose?: () => void };
type Open = { name: string; view: HTMLElement; destroy: () => void; onClose?: () => void; restoration: ScrollRestoration; pushed: boolean };
let cur: Open | null = null;
let lastOpts: Opts | null = null; // a forward to #board=<name> opens it as the last one was

const CSS = `
[data-lab-board-view]{position:fixed;left:0;right:0;bottom:0;height:100%;z-index:2147482000;display:flex;flex-direction:column;background:#e9e8e4;color:#1d1d1b;box-shadow:0 -1px 0 rgba(0,0,0,.12),0 -8px 24px rgba(0,0,0,.08);font:500 13px/1 system-ui,-apple-system,sans-serif}
[data-lab-board-view] .bv-bar{position:relative;flex:none;display:flex;align-items:center;gap:6px;height:40px;padding:0 8px;padding-top:env(safe-area-inset-top,0px);background:inherit;border-bottom:1px solid rgba(0,0,0,.08)}
[data-lab-board-view] .bv-bar button{font:inherit;color:inherit;background:transparent;border:0;border-radius:999px;padding:7px 11px;cursor:pointer}
[data-lab-board-view] .bv-bar button:hover{background:rgba(0,0,0,.06)}
[data-lab-board-view] .bv-name{flex:1;text-align:center;opacity:.7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
[data-lab-board-view] .bv-grip{position:absolute;left:0;right:0;top:-5px;height:10px;cursor:ns-resize;touch-action:none;z-index:1}
[data-lab-board-view] .bv-grip::after{content:"";position:absolute;left:50%;top:7px;width:36px;height:4px;margin-left:-18px;border-radius:2px;background:currentColor;opacity:.25}
[data-lab-board-view].full .bv-grip{top:0}
[data-lab-board-view].full .bv-grip::after{top:3px}
[data-lab-board-view] .bv-box{position:relative;flex:1;min-height:0}
[data-lab-board-view] #lab-board{position:absolute}
@media (prefers-color-scheme:dark){[data-lab-board-view]{background:#1b1b1a;color:#e9e8e4}[data-lab-board-view] .bv-bar button:hover{background:rgba(255,255,255,.08)}[data-lab-board-view] .bv-bar{border-color:rgba(255,255,255,.08)}}
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

/** The board called name in a view over this page. */
export function show(name: string, o: Opts) {
  lastOpts = o;
  if (!document.body) return void addEventListener('DOMContentLoaded', () => show(name, o), { once: true });
  if (cur?.name === name) return;
  if (cur) teardown();
  if (!document.getElementById('lab-board-view-css')) document.head.append(Object.assign(document.createElement('style'), { id: 'lab-board-view-css', textContent: CSS }));
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
  let size = readSize(o.page);
  const toggle = btn('', 'full or half', () => {
    size = size >= 1 ? 0.5 : 1;
    saveSize(o.page, size);
    paintSize();
  });
  toggle.className = 'bv-size';
  const closeBtn = btn('‹ close', 'close the board', () => close());
  closeBtn.className = 'bv-close';
  bar.append(grip, closeBtn, title, toggle);
  const box = document.createElement('div');
  box.className = 'bv-box';
  const root = document.createElement('div');
  box.append(root);
  view.append(bar, box);
  const paintSize = () => {
    view.style.height = size >= 1 ? '100%' : `${size * 100}%`;
    view.classList.toggle('full', size >= 1);
    toggle.textContent = size >= 1 ? 'half' : 'full';
  };
  paintSize();
  // The grip on the top edge: drag it down and the page shows above (it snaps to full near the top).
  grip.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    grip.setPointerCapture?.(e.pointerId);
    const move = (m: PointerEvent) => {
      const f = (innerHeight - m.clientY) / innerHeight;
      size = f > 0.97 ? 1 : Math.max(MIN, Math.min(1, f));
      paintSize();
    };
    const up = () => {
      grip.removeEventListener('pointermove', move);
      saveSize(o.page, size);
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up, { once: true });
    grip.addEventListener('pointercancel', up, { once: true });
  });
  document.body.append(view);
  const board = mountBoard(root, name, { of: o.of, back: () => close(), clip: true });
  const covers = (x: number, y: number) => {
    const r = view.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  };
  Object.assign(window, { __labBoard: { ...board.api, covers } });
  // The page scrolls under a half view: its pins and the board's are drawn again.
  addEventListener('scroll', moved, { passive: true });
  cur = { name, view, destroy: board.destroy, onClose: o.onClose, restoration, pushed };
  moved();
}

function teardown() {
  const c = cur;
  if (!c) return;
  cur = null;
  removeEventListener('scroll', moved);
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
  const want = nameInHash();
  if (cur && want !== cur.name) teardown();
  if (want && !cur && lastOpts) show(want, { ...lastOpts, push: false });
});
