// The board page: /_lab/board/<name>, a board over the whole window (mount.ts draws it). Loaded by that
// page only, before the widget, which rides on the page as it does on any other. A lab page that links a board opens it
// in its own view instead (overlay.ts); this page stays for direct links.
import { mountBoard } from './mount.ts';

const script = document.currentScript as HTMLScriptElement;
const name = script.dataset.name || '';
const of = new URLSearchParams(location.search).get('of') || ''; // the page this board is about: Esc on an empty board goes back to it

document.head.append(Object.assign(document.createElement('style'), { textContent: 'html,body{margin:0;height:100%;overflow:hidden;overscroll-behavior:none;background:#f7f7f7}@media (prefers-color-scheme:dark){html,body{background:#1b1b1a}}' }));
const root = document.createElement('div');
document.body.append(root);

// Back to the page this board is about. Opened from that page in this tab: the browser's own back, which gives the page
// back where it was (bfcache / scroll restoration; Leo, 19 Nov: "closing board should back me from where i opened").
// Otherwise a plain visit, and the page puts its scroll back from the key it left on its way here (the one a reload uses).
const cameFromOf = () => {
  try {
    const r = document.referrer && new URL(document.referrer);
    const o = new URL(of, location.href);
    return !!r && r.origin === location.origin && r.pathname === o.pathname && history.length > 1;
  } catch {
    return false;
  }
};
const back = () => {
  if (!of) return;
  if (cameFromOf()) history.back();
  else location.href = of;
};
const { api } = mountBoard(root, name, { of, back: of ? back : undefined, hash: true });
Object.assign(window, { __labBoard: api });

// A board you came to from a page has a plain way back, on phones too: "‹ back" at the top left (Leo, 19 Nov: "no way
// back"). ⇧B, Esc on an empty board and the browser's own back still work.
if (of) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = '‹ back';
  b.setAttribute('aria-label', 'back to the page');
  b.style.cssText = 'position:fixed;top:calc(10px + env(safe-area-inset-top, 0px));left:10px;z-index:2147482000;font:500 15px/1 system-ui,-apple-system,sans-serif;border:0;border-radius:999px;padding:10px 14px;background:#141414;color:#fff;box-shadow:0 2px 10px rgba(0,0,0,.18);-webkit-tap-highlight-color:transparent;cursor:pointer';
  b.addEventListener('click', (e) => (e.stopPropagation(), back()));
  b.setAttribute('data-uncommentable', '');
  document.body.append(b);
}
