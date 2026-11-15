/*
 * lab comments: anyone with the link clicks anywhere on a lab page to pin a comment. No login, just a name.
 * https://github.com/leonidstern/labfb · MIT
 * Comments are off by default; the bar button or c turns them on (remembered per browser). When on, click anywhere that isn't a link or control to pin one (alt/option-click pins on those too). c (or the bar button) hides
 * and shows them; esc or a click outside closes an open comment. Dragging (mouse/pen) marks an area instead of a point.
 * Include on a page served through your lab domain:
 *   <script src="https://lab.example.com/_lab/comments.js" defer></script>
 * The layer only turns on when the page is opened on the host the script is loaded from (or data-host),
 * so the deployment's own address and local dev stay clean. data-enable="always" turns it on everywhere.
 * Admin (resolve / delete / copy agent link): open any page once with ?lab-admin=<LAB_COMMENTS_ADMIN_TOKEN>; it is kept in this browser.
 */
(() => {
  const script = document.currentScript;
  const labHost = script?.dataset.host || (script?.src ? new URL(script.src, location.href).hostname : location.hostname);
  const enabled = location.hostname === labHost || script?.dataset.enable === 'always';
  if (!enabled || window.__labComments) return;
  window.__labComments = true;

  const API = script?.dataset.api || '/_lab/api/comments';
  const pageNow = () => script?.dataset.page || location.pathname.replace(/\/+$/, '') || '/';
  let page = pageNow();
  const store = {
    get: (k) => {
      try {
        return localStorage.getItem(k) || '';
      } catch {
        return '';
      }
    },
    set: (k, v) => {
      try {
        localStorage.setItem(k, v);
      } catch {}
    },
  };

  // Admin keys are kept per lab (name.scope.sig), so one browser can hold links for /anna and /mira at once.
  // The owner token has no scope and works everywhere.
  const scopeOf = (key) => (key.split('.').length === 3 ? key.split('.')[1] : '');
  // Admin links carry the key after # (never sent to the server, so it stays out of the member site's logs); ?lab-admin= still works.
  const adminParam = new URLSearchParams(location.hash.slice(1)).get('lab-admin') || new URLSearchParams(location.search).get('lab-admin');
  if (adminParam) {
    const scope = scopeOf(adminParam);
    store.set(scope ? `lab-admin:${scope}` : 'lab-admin', adminParam);
    const url = new URL(location.href);
    url.searchParams.delete('lab-admin');
    if (/lab-admin=/.test(url.hash)) url.hash = '';
    history.replaceState(null, '', url);
  }
  const adminToken = script?.dataset.admin || store.get(`lab-admin:${page.split('/')[1] || ''}`) || store.get('lab-admin:*') || store.get('lab-admin');

  let comments = [];
  let isAdmin = false;
  // Off by default: the page looks clean until someone turns comments on (button or c); remembered per browser.
  let on = store.get('lab-on') ? store.get('lab-on') === '1' : script?.dataset.on === '1';
  let openId = null;
  let draft = null; // { anchor, docX, docY }

  // ---------- DOM ----------
  const host = document.createElement('div');
  host.setAttribute('data-lab-comments', '');
  host.style.cssText = 'position:absolute;top:0;left:0;width:0;height:0;z-index:2147483000;';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      /* Theme: set --lab-accent, --lab-accent-fg, --lab-bg, --lab-fg, --lab-radius, --lab-font or --lab-font-features on the
         [data-lab-comments] element (or on :root). Everything else is mixed from those. */
      :host { all: initial;
        --_bg: var(--lab-bg, #fff); --_fg: var(--lab-fg, #141414);
        --_accent: var(--lab-accent, #141414); --_accent-fg: var(--lab-accent-fg, #fff);
        --_radius: var(--lab-radius, 12px);
        --_muted: color-mix(in srgb, var(--_fg) 60%, var(--_bg));
        --_line: color-mix(in srgb, var(--_fg) 13%, var(--_bg));
        --_soft: color-mix(in srgb, var(--_fg) 6%, var(--_bg));
        --_hair: .5px solid color-mix(in srgb, var(--_fg) 16%, transparent);
        --_shadow: 0 0 0 .5px color-mix(in srgb, var(--_fg) 14%, transparent), 0 1px 2px rgba(0,0,0,.04), 0 8px 28px rgba(0,0,0,.08);
        --_ease: cubic-bezier(.2, .8, .2, 1); }
      @media (prefers-color-scheme: dark) {
        :host { --_bg: var(--lab-bg, #1c1c1e); --_fg: var(--lab-fg, #f4f4f5);
                --_accent: var(--lab-accent, #f4f4f5); --_accent-fg: var(--lab-accent-fg, #141414);
                --_shadow: 0 0 0 1px color-mix(in srgb, var(--_fg) 16%, transparent), 0 10px 32px rgba(0,0,0,.5); }
      }
      * { box-sizing: border-box; font-family: var(--lab-font, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif);
          font-size: 14px; line-height: 1.4; font-weight: 400; color: var(--_fg); letter-spacing: 0;
          font-feature-settings: var(--lab-font-features, normal); font-synthesis: none; font-optical-sizing: auto;
          -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; text-rendering: optimizeLegibility;
          caret-color: var(--_accent); -webkit-tap-highlight-color: transparent; }
      ::selection { background: color-mix(in srgb, var(--_accent) 38%, transparent); color: var(--_fg); }
      button:focus-visible { outline: 2px solid var(--_accent); outline-offset: 2px; }
      .layer { position: absolute; top: 0; left: 0; width: 0; height: 0; }
      .pin { position: absolute; width: 28px; height: 28px; margin: -28px 0 0 0; border-radius: 14px 14px 14px 2px;
             background: var(--_bg); border: 0; box-shadow: 0 0 0 .5px color-mix(in srgb, var(--_fg) 22%, transparent), 0 2px 8px rgba(0,0,0,.16);
             display: grid; place-items: center; cursor: pointer; padding: 0; color: var(--_fg); font-size: 12.5px; font-weight: 500;
             font-variant-numeric: tabular-nums; letter-spacing: .01em; transform-origin: 0 100%;
             transition: transform .16s var(--_ease), box-shadow .16s var(--_ease), opacity .16s; }
      button.pin:hover { transform: scale(1.08); box-shadow: 0 0 0 .5px color-mix(in srgb, var(--_fg) 30%, transparent), 0 4px 14px rgba(0,0,0,.2); }
      button.pin:active { transform: scale(.96); }
      .pin.in { animation: lab-pin .26s var(--_ease); }
      /* A new comment lands with one faint halo from its pin. */
      button.pin.in::before { content: ''; position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
                        animation: lab-halo .9s cubic-bezier(.2, .7, .3, 1) forwards; }
      .pin.resolved { color: var(--_muted); }
      .pin.moved { opacity: .5; }
      .pin.grab { touch-action: none; }
      button.pin.dragging { cursor: grabbing; transform: scale(1.1); opacity: 1; box-shadow: 0 0 0 .5px color-mix(in srgb, var(--_fg) 30%, transparent), 0 8px 20px rgba(0,0,0,.22); }
      .zone { position: absolute; background: color-mix(in srgb, var(--_accent) 5%, transparent);
              border-radius: var(--_radius); pointer-events: none; }
      .zone svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
      .zone rect { fill: none; stroke-linecap: round; stroke-dasharray: 0 4; rx: var(--_radius); ry: var(--_radius); }
      /* Light dots on a dark ring: the outline shows on black pages and white ones, whatever the system theme. */
      .zone rect.ring { stroke: rgba(0,0,0,.5); stroke-width: 2.5; }
      .zone rect.dots { stroke: #fff; stroke-width: 1; }
      .zone.live { left: 0; top: 0; will-change: transform, width, height; animation: lab-fade .12s ease-out; }
      .zone.saved { background: color-mix(in srgb, var(--_accent) 3%, transparent); }
      .zone.saved.in { animation: lab-settle .36s var(--_ease); }
      .pin.new::after { content: ''; position: absolute; top: -4px; right: -4px; width: 9px; height: 9px; border-radius: 50%;
                        background: var(--_fg); box-shadow: 0 0 0 2px var(--_bg); }
      .dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--_accent); margin: 0 6px 1px 0; }
      .card { position: absolute; width: 320px; max-width: calc(100vw - 24px); background: var(--_bg); border-radius: var(--_radius);
              box-shadow: var(--_shadow); padding: 12px 14px 14px; transform-origin: 14px 0; z-index: 1; }
      .card.in, .float.in { animation: lab-in .18s var(--_ease); }
      .card.out, .float.out { animation: lab-out .14s ease-in forwards; pointer-events: none; }
      .item { display: grid; row-gap: 3px; }
      .item + .item { margin-top: 14px; }
      .meta { display: flex; align-items: baseline; gap: .5em; font-size: 12px; color: var(--_muted); margin: 0;
              white-space: nowrap; letter-spacing: .01em; font-variant-numeric: tabular-nums; }
      .meta b { font-weight: 500; font-size: 13px; letter-spacing: .005em; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
      .meta .dot { flex: none; align-self: center; margin: 0; }
      .meta .num { color: var(--_muted); font-variant-numeric: tabular-nums; margin-left: auto; }
      .meta .ago { white-space: nowrap; }
      .text { white-space: pre-wrap; overflow-wrap: anywhere; text-wrap: pretty; }
      .row { display: flex; gap: 12px; justify-content: flex-start; align-items: center; margin-top: 8px; }
      button.btn { border: 0; padding: 2px 0; cursor: pointer; background: none; color: var(--_muted); font-size: 12px;
                   letter-spacing: .01em; border-radius: 4px; transition: color .12s; }
      button.btn:hover { color: var(--_fg); }
      button.btn.danger, button.btn.danger:hover { color: #e5484d; }
      .row .ask { white-space: nowrap; color: var(--_fg); font-size: 12px; letter-spacing: .01em; padding: 2px 0; animation: lab-fade .12s ease-out; }
      .float { position: absolute; width: 320px; max-width: calc(100vw - 24px); transform-origin: 0 20px; z-index: 1; }
      .card .composer { margin-top: 14px; }
      .box { display: grid; grid-template-columns: 1fr auto; grid-template-areas: "text send"; align-items: center; column-gap: 8px;
             background: var(--_bg); border-radius: var(--_radius); padding: 7px 7px 7px 14px; transition: box-shadow .15s; }
      .float .box { box-shadow: var(--_shadow); }
      .float .box:focus-within { box-shadow: var(--_shadow), 0 0 0 .5px color-mix(in srgb, var(--_fg) 28%, transparent); }
      .card .box { background: var(--_soft); border-radius: max(calc(var(--_radius) - 2px), 0px); margin: 0; }
      .card .box.open { box-shadow: inset 0 0 0 .5px color-mix(in srgb, var(--_fg) 22%, transparent); }
      .card .box:focus-within { box-shadow: inset 0 0 0 .5px color-mix(in srgb, var(--_fg) 28%, transparent); }
      /* Same top and right padding open or closed: the text and the arrow's column stay put while the box grows. */
      .box.open { grid-template-areas: "text text" "line line" "who send"; row-gap: 8px; padding: 7px 7px 8px 14px; }
      .box textarea { grid-area: text; width: 100%; border: 0; background: none; padding: 4px 0; margin: 0; resize: none;
                      min-height: 0; max-height: 200px; overflow-y: auto; outline: none; display: block; }
      .box textarea::placeholder, .who input::placeholder { color: var(--_muted); opacity: 1; }
      .line { grid-area: line; height: 0; border-top: var(--_hair); margin: 0 -7px 0 -14px; display: none; }
      .who { grid-area: who; display: none; align-items: baseline; gap: 4px; min-width: 0; font-size: 13px; color: var(--_muted); letter-spacing: .005em; }
      .who * { font-size: 13px; }
      .who span { color: var(--_muted); }
      .who input { flex: 1; min-width: 0; border: 0; background: none; padding: 0; margin: 0; outline: none; color: var(--_muted); text-overflow: ellipsis; }
      .who input:focus { color: var(--_fg); }
      .box.open .line { display: block; animation: lab-fade .16s ease-out; }
      .box.open .who { display: flex; animation: lab-fade .16s ease-out; }
      .send { grid-area: send; width: 24px; height: 24px; border-radius: 50%; border: 0; padding: 0; cursor: pointer;
              background: var(--_line); color: var(--_muted); display: grid; place-items: center; transition: background .15s, color .15s, transform .15s var(--_ease); }
      .send.ready:hover { transform: scale(1.06); }
      .send.ready:active { transform: scale(.94); }
      .send.ready { background: var(--_accent); color: var(--_accent-fg); }
      .send svg { display: block; }
      .send * { color: inherit; }
      .error { color: #e5484d; font-size: 12px; padding: 6px 8px 0; letter-spacing: .01em; }
      .error:empty { display: none; }
      .bar { position: fixed; right: 16px; bottom: 16px; display: flex; gap: 8px; align-items: center; }
      .bar button { border: 0; border-radius: 999px; padding: 9px 14px; cursor: pointer; background: var(--_bg); color: var(--_fg);
                    box-shadow: var(--_shadow); font-size: 13px; font-weight: 500; display: inline-flex; gap: 8px; align-items: center;
                    letter-spacing: .005em; font-variant-numeric: tabular-nums; white-space: nowrap; transition: color .15s, transform .15s var(--_ease); }
      .bar button:active { transform: scale(.97); }
      .bar button * { color: inherit; font-weight: inherit; }
      .bar .toggle:not(.secondary)::before { content: ''; width: 7px; height: 7px; border-radius: 50%; background: var(--_accent); }
      .bar button.secondary { color: var(--_muted); }
      .listener { position: fixed; left: 16px; bottom: 16px; display: inline-flex; gap: 6px; align-items: center; padding: 9px 14px; border-radius: 999px;
             background: var(--_bg); color: var(--_fg); box-shadow: var(--_shadow); font-size: 13px; text-decoration: none; white-space: nowrap; }
      .listener::before { content: ''; width: 7px; height: 7px; border-radius: 50%; background: var(--_accent); margin-right: 2px; }
      .listener span { color: var(--_muted); }
      .listener.idle::before { background: var(--_muted); opacity: .5; }
      .listener:not([data-copy=""])[data-copy] { cursor: copy; }
      kbd { font-size: 11px; line-height: 17px; min-width: 18px; padding: 0 4px; border-radius: 4px; text-align: center;
            background: var(--_soft); color: var(--_muted) !important; }
      .hint { position: fixed; left: 50%; bottom: 64px; transform: translateX(-50%); background: var(--_bg); color: var(--_muted);
              box-shadow: var(--_shadow); padding: 8px 14px; border-radius: 999px; font-size: 13px; pointer-events: none; white-space: nowrap;
              letter-spacing: .005em; animation: lab-fade .2s ease-out; }
      /* 16px fields keep iOS from zooming the page when one is focused. */
      @media (pointer: coarse) { .box textarea, .who input { font-size: 16px; letter-spacing: -.006em; } kbd { display: none; } }
      @keyframes lab-fade { from { opacity: 0; } }
      /* Movement only: a page in the background can stall an animation, and a card stalled mid-fade showed the page through it. */
      @keyframes lab-in { from { transform: translateY(4px) scale(.98); } }
      @keyframes lab-out { to { opacity: 0; transform: translateY(2px) scale(.985); } }
      /* Continuous (Apple-style) corners where the browser draws them; plain rounding elsewhere. */
      @supports (corner-shape: squircle) { .card, .float .box, .card .box { corner-shape: squircle; border-radius: calc(var(--_radius) * 1.8); } }
      @keyframes lab-pin { from { transform: scale(1.1); } }
      @keyframes lab-halo { from { box-shadow: 0 0 0 0 color-mix(in srgb, var(--_fg) 12%, transparent); }
                            to { box-shadow: 0 0 0 16px color-mix(in srgb, var(--_fg) 0%, transparent); } }
      @keyframes lab-settle { from { background: color-mix(in srgb, var(--_accent) 16%, transparent);
                                     box-shadow: 0 0 0 5px color-mix(in srgb, var(--_accent) 18%, transparent); }
                              to { box-shadow: 0 0 0 0 color-mix(in srgb, var(--_accent) 0%, transparent); } }
      @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
      @media (max-width: 480px) { kbd { display: none; } }
      [hidden] { display: none !important; }
    </style>
    <div class="layer"></div>
    <div class="hint" hidden>click to comment · drag to mark an area · c to hide</div>
    <div class="bar">
      <button class="secondary copy-all" type="button" hidden>copy link</button>
      <button class="toggle" type="button"></button>
    </div>`;
  const layer = root.querySelector('.layer');
  const hint = root.querySelector('.hint');
  if (matchMedia('(pointer: coarse)').matches) hint.textContent = 'tap to comment';
  const toggleBtn = root.querySelector('.toggle');
  const copyBtn = root.querySelector('.copy-all');

  const el = (tag, attrs = {}, text) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (text != null) node.textContent = text;
    return node;
  };

  // ---------- anchoring ----------
  function selectorFor(node) {
    const parts = [];
    while (node && node.nodeType === 1 && node !== document.body && node !== document.documentElement) {
      if (node.id && document.querySelectorAll(`#${CSS.escape(node.id)}`).length === 1) {
        parts.unshift(`#${CSS.escape(node.id)}`);
        break;
      }
      const tag = node.localName;
      let index = 1;
      for (let sib = node.previousElementSibling; sib; sib = sib.previousElementSibling) if (sib.localName === tag) index++;
      parts.unshift(`${tag}:nth-of-type(${index})`);
      node = node.parentElement;
    }
    return parts.length ? (parts[0].startsWith('#') ? '' : 'body > ') + parts.join(' > ') : 'body';
  }

  const docWidth = () => Math.max(document.documentElement.scrollWidth, 1);

  const clamp01 = (v) => Math.min(Math.max(v, 0), 1);
  const short = (v, n) => (v || '').replace(/\s+/g, ' ').trim().slice(0, n);

  // A source-file hint from a (possibly proxied, hashed or optimised) image URL: "hero-1" from
  // /_astro/hero-1.Bx3kd9_Z.webp, /_image?href=..., /_vercel/image?url=..., /media/<id>/w800.webp.
  function fileHint(url) {
    if (!url || url.startsWith('data:')) return '';
    try {
      const u = new URL(url, location.href);
      const inner = u.searchParams.get('href') || u.searchParams.get('url');
      if (inner && /\/_(image|vercel\/image|next\/image)/.test(u.pathname)) return fileHint(inner);
      const parts = u.pathname.split('/').filter(Boolean).map(decodeURIComponent);
      let name = parts.pop() || '';
      if (/^w?\d+(x\d+)?\.\w+$/i.test(name) && parts.length) name = parts.pop();
      return name.replace(/\.(avif|webp|jpe?g|png|gif|svg|mp4|webm|mov)$/i, '').replace(/[._-][A-Za-z0-9_-]{8}$/, '');
    } catch {
      return '';
    }
  }

  const mediaSrc = (m) => {
    const src = m.currentSrc || m.getAttribute('src') || '';
    if (src && !src.startsWith('data:')) return new URL(src, location.href).href;
    const lazy = m.dataset?.src || (m.getAttribute('srcset') || m.dataset?.srcset || '').split(/\s+/)[0];
    return lazy ? new URL(lazy, location.href).href : '';
  };

  // Where the click is inside the original image/video, taking object-fit and object-position into account.
  function naturalSpot(m, rect, cx, cy, nw, nh) {
    if (!nw || !nh || !rect.width || !rect.height) return null;
    const cs = getComputedStyle(m);
    const fit = cs.objectFit || 'fill';
    const pos = (cs.objectPosition || '50% 50%').split(/\s+/).map((v) =>
      v.endsWith('%') ? parseFloat(v) / 100 : { left: 0, top: 0, right: 1, bottom: 1 }[v] ?? 0.5,
    );
    const sx = rect.width / nw;
    const sy = rect.height / nh;
    const scale = { cover: Math.max(sx, sy), contain: Math.min(sx, sy), none: 1, 'scale-down': Math.min(1, sx, sy) }[fit];
    const dw = nw * (scale ?? sx);
    const dh = nh * (scale ?? sy);
    const ox = (rect.width - dw) * (pos[0] ?? 0.5);
    const oy = (rect.height - dh) * (pos[1] ?? pos[0] ?? 0.5);
    return { fit, nw, nh, imgX: clamp01((cx - rect.left - ox) / dw), imgY: clamp01((cy - rect.top - oy) / dh) };
  }

  // The picture file's own size. With srcset, naturalWidth is the size in CSS pixels, not the file's: read the width
  // descriptor of the candidate the browser picked ("photo-1600.jpg 1600w"), or scale by its density ("2x").
  function fileSize(img) {
    let nw = img.naturalWidth;
    let nh = img.naturalHeight;
    const sets = [img.srcset, ...[...(img.closest('picture')?.querySelectorAll('source') || [])].map((s) => s.srcset)].filter(Boolean);
    for (const set of sets) {
      for (const part of set.split(/,\s+/)) {
        const [url, d = '1x'] = part.trim().split(/\s+/);
        let abs = '';
        try {
          abs = new URL(url, location.href).href;
        } catch {}
        if (!url || abs !== img.currentSrc || !nw) continue;
        const v = parseFloat(d);
        if (d.endsWith('w') && v) return { nw: Math.round(v), nh: Math.round((v * nh) / nw) };
        if (d.endsWith('x') && v) return { nw: Math.round(nw * v), nh: Math.round(nh * v) };
      }
    }
    return { nw, nh };
  }

  // Which component drew an element and where, from a framework's dev build (React, Vue 3, Svelte); production
  // builds keep none of it. A small cut of Census's reader (github.com/leonidstern/census).
  const PLAIN_NAME = /^[A-Z][A-Za-z0-9]{2,}$/;
  const PLUMBING = /(Provider|Context|Consumer|Boundary|Slot|Portal|Fragment|Presence|Scope|Trap|Root)$/;
  const variantOf = (p) =>
    ['variant', 'size', 'tone', 'intent', 'kind']
      .flatMap((k) => ((typeof p?.[k] === 'string' || typeof p?.[k] === 'number') && /^[\w.-]{1,20}$/.test(String(p[k])) ? [`${k}=${p[k]}`] : []))
      .join(' ');
  // A served module's address as a repo path: Vite serves /src/x.tsx, webpack and Next say webpack-internal:///./src/x.tsx.
  const repoPath = (url) => !/^[a-z-]+:\/\//i.test(url) ? url : decodeURIComponent(url.replace(/^[a-z-]+:\/\/\/?(\.\/)?/i, '/').replace(/^\/[^/]*:\d+/, '').split('?')[0]).replace(/^\/(@fs)?/, '').replace(/^\(app-pages-browser\)\/\.?\/?/, '');
  function componentAt(el) {
    const name = (t, d = 0) => (d > 3 ? '' : typeof t === 'function' ? t.displayName || t.name || '' : t && typeof t === 'object' ? t.displayName || name(t.render || t.type, d + 1) : '');
    const plain = (n) => PLAIN_NAME.test(n) && !PLUMBING.test(n);
    // React 18 writes the JSX's file and line; React 19 only the stack where the element was made.
    const srcOf = (f) => {
      const d = f?._debugSource;
      if (d?.fileName) return `${repoPath(String(d.fileName))}:${d.lineNumber || 0}`;
      const st = f?._debugStack?.stack;
      if (typeof st !== 'string') return '';
      for (const line of st.split('\n').slice(1)) {
        const m = /((?:https?|webpack-internal|file):\/\/[^\s()]+?):(\d+):\d+\)?\s*$/.exec(line);
        if (m && !/node_modules|react-dom|react-jsx|jsx-dev-runtime|react-server|scheduler/.test(m[1])) return `${repoPath(m[1])} (line ${m[2]} as served, may differ from the source)`;
      }
      return '';
    };
    const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
    if (key) {
      const host = el[key];
      const parts = [];
      let usedAt = '';
      // Up through the plain elements around it (a <span> in a <td> in a <tr>…) to the component that rendered it.
      for (let f = host?.return, i = 0; f && parts.length < 2 && i < 80; f = f.return, i++) {
        if (typeof f.type === 'string') continue;
        const n = name(f.type);
        if (!plain(n)) continue;
        if (!parts.length) usedAt = srcOf(f);
        const v = variantOf(f.memoizedProps);
        parts.push(v ? `${n} ${v}` : n);
      }
      if (!parts.length) return srcOf(host) ? { source: srcOf(host) } : {};
      return { component: parts.length > 1 ? `${parts[0]} (in ${parts[1]})` : parts[0], source: srcOf(host) || undefined, usedAt: usedAt || undefined };
    }
    const vue = el.__vueParentComponent;
    if (vue?.type) {
      const n = vue.type.name || vue.type.__name || (vue.type.__file || '').replace(/^.*\//, '').replace(/\.vue$/, '');
      const parent = vue.parent?.type;
      const pn = parent && (parent.name || parent.__name);
      const v = variantOf(vue.props);
      return { component: `${n}${v ? ' ' + v : ''}${pn ? ` (in ${pn})` : ''}`, source: vue.type.__file ? repoPath(vue.type.__file) : undefined, usedAt: parent?.__file ? repoPath(parent.__file) : undefined };
    }
    const loc = el.__svelte_meta?.loc;
    if (loc?.file) return { component: loc.file.replace(/^.*\//, '').replace(/\.svelte$/, ''), source: `${repoPath(loc.file)}:${loc.line ?? 0}` };
    return {};
  }

  // How the element looks: fill, text colour, size and weight, corners. A colour that a CSS variable on :root
  // holds is named by it (the page's own tokens).
  function looksOf(el) {
    const cs = getComputedStyle(el);
    const names = new Map();
    // A variable that isn't a colour (a radius, a gap) leaves the probe with its parent's colour, one no page uses:
    // those are skipped, so "--radius-sm" never names a text colour.
    const NONE = 'rgb(1, 2, 3)';
    const wrap = document.createElement('i');
    wrap.style.cssText = `display:none;color:${NONE}`;
    const probe = wrap.appendChild(document.createElement('i'));
    document.body.append(wrap);
    for (const prop of [...getComputedStyle(document.documentElement)].filter((p) => p.startsWith('--')).slice(0, 400)) {
      probe.style.color = '';
      probe.style.color = `var(${prop})`;
      const v = getComputedStyle(probe).color;
      if (v && v !== NONE && !names.has(v)) names.set(v, prop);
    }
    wrap.remove();
    const say = (v) => (names.has(v) ? `${names.get(v)} ${v}` : v);
    const out = [];
    if (!/^(transparent|rgba\(0, 0, 0, 0\))$/.test(cs.backgroundColor)) out.push(`fill ${say(cs.backgroundColor)}`);
    out.push(`text ${say(cs.color)} ${cs.fontSize}/${cs.fontWeight}`);
    if (parseFloat(cs.borderTopLeftRadius)) out.push(`radius ${cs.borderTopLeftRadius}`);
    return short(out.join(', '), 200);
  }

  // A point on an element turned, scaled or skewed by its own CSS transform, in the element's untransformed box.
  function untransform(el, cx, cy) {
    const t = getComputedStyle(el).transform;
    if (!t || t === 'none') return null;
    const m = new DOMMatrix(t);
    if (m.isIdentity) return null;
    const w = el.offsetWidth || el.getBoundingClientRect().width;
    const h = el.offsetHeight || el.getBoundingClientRect().height;
    const [ox, oy] = getComputedStyle(el).transformOrigin.split(' ').map(parseFloat);
    const at = (x, y) => m.transformPoint(new DOMPoint(x - ox, y - oy));
    const corners = [at(0, 0), at(w, 0), at(0, h), at(w, h)];
    const r = el.getBoundingClientRect();
    // Where the transform origin is on screen: the drawn box's top left, minus how far the corners reach.
    const origin = { x: r.left - Math.min(...corners.map((p) => p.x)), y: r.top - Math.min(...corners.map((p) => p.y)) };
    const q = m.inverse().transformPoint(new DOMPoint(cx - origin.x, cy - origin.y));
    return { rect: { left: 0, top: 0, width: w, height: h }, x: q.x + ox, y: q.y + oy };
  }

  // A picture inside an SVG (<image>): its file size, and preserveAspectRatio (default: fit inside, centred).
  function svgImageSpot(el, anchor, cx, cy) {
    const r = el.getBoundingClientRect();
    const keep = (el.getAttribute('preserveAspectRatio') || 'xMidYMid meet').split(/\s+/);
    const fill = (iw, ih) => {
      if (!iw || !ih || !r.width || !r.height) return;
      let [dw, dh] = [r.width, r.height];
      if (keep[0] !== 'none') {
        const k = (keep[1] === 'slice' ? Math.max : Math.min)(r.width / iw, r.height / ih);
        [dw, dh] = [iw * k, ih * k];
      }
      const align = (v, room) => (v === 'Min' ? 0 : v === 'Max' ? room : room / 2);
      const ox = keep[0] === 'none' ? 0 : align(keep[0].slice(1, 4), r.width - dw);
      const oy = keep[0] === 'none' ? 0 : align(keep[0].slice(5, 8), r.height - dh);
      Object.assign(anchor, { nw: iw, nh: ih, imgX: clamp01((cx - r.left - ox) / dw), imgY: clamp01((cy - r.top - oy) / dh) });
    };
    const probe = new Image();
    probe.onload = () => fill(probe.naturalWidth, probe.naturalHeight);
    probe.src = anchor.src;
    if (probe.complete) fill(probe.naturalWidth, probe.naturalHeight);
  }

  // Where the click is inside a CSS background picture: its file size (loaded once, usually from the cache),
  // background-size (cover, contain, auto, lengths) and background-position. Fills the anchor when known.
  function backgroundSpot(n, url, anchor, cx, cy) {
    const r = n.getBoundingClientRect();
    const cs = getComputedStyle(n);
    // Layers are comma lists (a gradient on top of the photo is common): use the photo's own layer.
    const layers = (v) => v.split(/,(?![^(]*\))/).map((x) => x.trim());
    const at = Math.max(0, layers(cs.backgroundImage).findIndex((l) => l.includes(url)));
    const pick = (v) => {
      const l = layers(v);
      return l[at % l.length];
    };
    const fill = (iw, ih) => {
      if (!iw || !ih || !r.width || !r.height) return;
      const size = pick(cs.backgroundSize);
      let dw = iw;
      let dh = ih;
      if (size === 'cover' || size === 'contain') {
        const k = (size === 'cover' ? Math.max : Math.min)(r.width / iw, r.height / ih);
        dw = iw * k;
        dh = ih * k;
      } else if (size !== 'auto' && size !== 'auto auto') {
        const [w, h = 'auto'] = size.split(/\s+/);
        const len = (v, of) => (v.endsWith('%') ? (parseFloat(v) / 100) * of : parseFloat(v));
        dw = w === 'auto' ? NaN : len(w, r.width);
        dh = h === 'auto' ? NaN : len(h, r.height);
        if (Number.isNaN(dw) && Number.isNaN(dh)) [dw, dh] = [iw, ih];
        else if (Number.isNaN(dw)) dw = (dh * iw) / ih;
        else if (Number.isNaN(dh)) dh = (dw * ih) / iw;
      }
      const [px = '50%', py = '50%'] = pick(cs.backgroundPosition).split(/\s+/);
      const off = (v, room) => (v.endsWith('%') ? (parseFloat(v) / 100) * room : parseFloat(v) || 0);
      const ox = off(px, r.width - dw);
      const oy = off(py, r.height - dh);
      Object.assign(anchor, { nw: iw, nh: ih, fit: `background ${size}`, imgX: clamp01((cx - r.left - ox) / dw), imgY: clamp01((cy - r.top - oy) / dh) });
    };
    const probe = new Image();
    probe.onload = () => fill(probe.naturalWidth, probe.naturalHeight);
    probe.src = url;
    if (probe.complete) fill(probe.naturalWidth, probe.naturalHeight);
  }

  // A click on empty space: the blocks just above and below it inside the element, by heading or first words.
  function between(target, cy) {
    const kids = [...target.children].filter((k) => k !== host && k.getBoundingClientRect().height > 0);
    let above = null;
    let below = null;
    for (const k of kids) {
      const kr = k.getBoundingClientRect();
      if (kr.bottom <= cy) above = k;
      else if (kr.top >= cy && !below) below = k;
      else if (kr.top < cy && kr.bottom > cy) return null; // inside a block, not between two
    }
    const say = (k) => {
      if (!k) return undefined;
      const h = k.matches('h1, h2, h3, h4, h5, h6') ? k : k.querySelector('h1, h2, h3, h4, h5, h6');
      return short(`${openingTag(k)} "${short((h || k).textContent, 60)}"`, 160);
    };
    return above || below ? { above: say(above), below: say(below) } : null;
  }

  // Light or dark where the pin is: the first background colour behind it that isn't transparent.
  function schemeAt(target) {
    for (let n = target; n; n = n.parentElement) {
      const m = getComputedStyle(n).backgroundColor.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/);
      if (!m || (m[4] !== undefined && parseFloat(m[4]) < 0.5)) continue;
      const [r, g, b] = [m[1], m[2], m[3]].map(Number);
      const hex = '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
      return { scheme: 0.2126 * r + 0.7152 * g + 0.0722 * b < 128 ? 'dark' : 'light', background: hex };
    }
    return { scheme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light' };
  }

  // The word under the click plus ~40 characters either side, so an agent can grep the source.
  function quoteAt(cx, cy, shadowRoots = []) {
    let node = null;
    let offset = 0;
    if (document.caretPositionFromPoint) {
      // Open shadow roots under the click are passed in, so text inside a web component is found too.
      const p = shadowRoots.length ? document.caretPositionFromPoint(cx, cy, { shadowRoots }) : document.caretPositionFromPoint(cx, cy);
      if (p) (node = p.offsetNode), (offset = p.offset);
    } else if (document.caretRangeFromPoint) {
      const r = document.caretRangeFromPoint(cx, cy);
      if (r) (node = r.startContainer), (offset = r.startOffset);
    }
    if (!node || node.nodeType !== 3 || !node.data.trim()) return null;
    // Only when the click is really on the text, not in empty space next to it.
    const range = document.createRange();
    range.selectNodeContents(node);
    const hit = [...range.getClientRects()].some((r) => cx >= r.left - 4 && cx <= r.right + 4 && cy >= r.top - 4 && cy <= r.bottom + 4);
    if (!hit) return null;
    const text = node.data;
    let a = offset;
    let b = offset;
    // Chinese, Japanese, Korean and Thai don't put spaces between words: ask the browser where the word is.
    const seg = /[\u0e00-\u0e7f\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af\uf900-\ufaff]/.test(text) && typeof Intl !== 'undefined' && Intl.Segmenter
      ? new Intl.Segmenter(node.parentElement?.closest('[lang]')?.lang || undefined, { granularity: 'word' })
      : null;
    if (seg) {
      for (const w of seg.segment(text)) {
        if (offset >= w.index && offset <= w.index + w.segment.length && w.segment.trim()) {
          a = w.index;
          b = w.index + w.segment.length;
          if (offset < b) break;
        }
      }
    } else {
      while (a > 0 && /\S/.test(text[a - 1])) a--;
      while (b < text.length && /\S/.test(text[b])) b++;
    }
    const block = node.parentElement?.closest('p, li, h1, h2, h3, h4, h5, h6, td, th, figcaption, blockquote, a, button, label, span, div') || node.parentElement;
    const full = block?.textContent || text;
    const before = full.slice(0, full.indexOf(text) + a);
    const after = full.slice(full.indexOf(text) + b);
    const squash = (v) => v.replace(/\s+/g, ' ');
    const quote = {
      exact: short(text.slice(a, b), 80),
      prefix: squash(before.slice(-80)).replace(/^\s+/, '').slice(-40),
      suffix: squash(after.slice(0, 80)).replace(/\s+$/, '').slice(0, 40),
    };
    // Code (or any preformatted text): the whole line, its number in the block, and the block's label
    // (a figcaption, data-file, title or aria-label nearby), so an agent can open the file at that line.
    const pre = node.parentElement?.closest('pre, [data-file]') ||
      (/^pre/.test(getComputedStyle(node.parentElement).whiteSpace) ? node.parentElement : null);
    // A table of code with its own line numbers (one row per line) counts as a block too.
    const codeTable = !pre && node.parentElement?.closest('table[data-file], table[class*="code" i]');
    if (pre || codeTable) {
      const box = pre || codeTable;
      const r = document.createRange();
      r.setStart(box, 0);
      r.setEnd(node, offset);
      let upto = r.toString();
      let all = box.textContent;
      // Lines drawn as elements (a <br> or a row per line, no newline characters): count those instead.
      const breaks = [...box.querySelectorAll('br, tr')];
      // A code table counts its rows, whatever line breaks its markup has.
      if ((box.localName === 'table' || !all.includes('\n')) && breaks.length) {
        const ends = box.querySelectorAll('br').length ? [...box.querySelectorAll('br')] : [...box.querySelectorAll('tr')].slice(0, -1);
        const before = ends.filter((e) => e.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING && !e.contains(node)).length;
        const lineRange = document.createRange();
        if (before) lineRange.setStartAfter(ends[before - 1]);
        else lineRange.setStart(box, 0);
        if (ends[before]) lineRange.setEndBefore(ends[before]);
        else lineRange.setEnd(box, box.childNodes.length);
        // Rows are the lines themselves; with <br> a line is what lies between two of them.
        const row = box.querySelectorAll('br').length ? null : node.parentElement?.closest('tr');
        quote.line = short((row ? row.textContent : lineRange.toString()).trim(), 200);
        quote.lineNo = before + 1;
        quote.lines = ends.length + (box.querySelectorAll('br').length ? 0 : 1);
      } else {
        const from = upto.lastIndexOf('\n') + 1;
        const to = all.indexOf('\n', upto.length);
        quote.line = short(all.slice(from, to < 0 ? undefined : to).trim(), 200);
        quote.lineNo = upto.split('\n').length;
        quote.lines = all.replace(/\n$/, '').split('\n').length;
      }
      // The page's own line number, when it shows one (a number cell, or data-line on the row or cell).
      const row = node.parentElement?.closest('tr, [data-line], [data-line-number]');
      if (row) {
        const cell = row.matches('[data-line], [data-line-number]') ? row : row.querySelector('[data-line], [data-line-number]');
        const n = cell?.getAttribute('data-line') || cell?.getAttribute('data-line-number') || [...row.children].map((c) => c.textContent.trim()).find((t) => /^\d+$/.test(t));
        if (n && /^\d+$/.test(n)) quote.pageLineNo = Number(n);
      }
      // The block's label: data-file, a caption, or a title bar next to the block (Docusaurus, Expressive Code).
      let label = box.closest('[data-file]')?.getAttribute('data-file') || box.getAttribute('title') || box.getAttribute('aria-label') || '';
      for (let el = box.parentElement, i = 0; !label.trim() && el && el !== document.body && i < 3; el = el.parentElement, i++) {
        label = el.querySelector(':scope > figcaption, :scope > [class*="title" i]')?.textContent || '';
      }
      if (label.trim()) quote.label = short(label.trim(), 120);
    }
    return quote;
  }

  function openingTag(node) {
    const attrs = [...node.attributes]
      .filter((a) => /^(id|class|alt|role|aria-label|href|data-[\w-]+)$/.test(a.name))
      .map((a) => `${a.name}="${short(a.value, 60)}"`);
    return `<${node.localName}${attrs.length ? ` ${attrs.join(' ')}` : ''}>`.slice(0, 200);
  }

  function anchorAt(clientX, clientY) {
    let stack = document.elementsFromPoint(clientX, clientY).filter((n) => n !== host && n !== document.documentElement);
    // Inside open web components: follow the click into each shadow root.
    const shadowRoots = [];
    let shadowHost = null;
    for (let top = stack[0]; top?.shadowRoot && !host.contains(top) && shadowRoots.length < 5; top = stack[0]) {
      shadowHost ||= top;
      shadowRoots.push(top.shadowRoot);
      const inner = top.shadowRoot.elementsFromPoint(clientX, clientY).filter((n) => n !== top);
      if (!inner.length) break;
      stack = [...inner, ...stack];
    }
    // data-comment-target: a click anywhere inside snaps to that element (same attribute as Claude artifacts).
    const target = stack[0]?.closest('[data-comment-target]') || stack[0] || document.body;
    const rect = target.getBoundingClientRect();
    const anchor = {
      selector: selectorFor(target),
      x: rect.width ? (clientX - rect.left) / rect.width : 0,
      y: rect.height ? (clientY - rect.top) / rect.height : 0,
      docX: (clientX + scrollX) / docWidth(),
      docY: clientY + scrollY,
      width: innerWidth,
      height: innerHeight,
      dpr: Math.round((devicePixelRatio || 1) * 100) / 100,
      element: openingTag(target),
    };
    const own = short(target.textContent, 200);
    if (own && target !== document.body && (target.textContent || '').length < 400) anchor.text = short(own, 80);
    const inside = target.parentElement?.closest('[id], [data-lab]');
    if (inside) anchor.inside = inside.dataset.lab ? `[data-lab="${inside.dataset.lab}"]` : `#${inside.id}`;
    let heading = null;
    for (const h of document.querySelectorAll('h1, h2, h3')) {
      if (h.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING || h.contains(target)) heading = h;
    }
    if (heading) anchor.section = short(heading.textContent, 100);
    if (shadowHost) anchor.shadow = openingTag(shadowHost);
    for (const [k, v] of Object.entries(componentAt(target))) if (v) anchor[k] = short(v, 200);
    if (target !== document.body) anchor.looks = looksOf(target);
    // A <select>: which option is chosen (its text is every option in a row).
    const select = target.closest?.('select');
    if (select && select.selectedIndex >= 0) {
      anchor.chosen = short(`${select.selectedIndex + 1} of ${select.options.length}: "${select.options[select.selectedIndex].text}"`, 120);
    }
    // Text that CSS adds with ::before / ::after content (a badge, a label): it isn't in the HTML.
    for (const el of [target, target.parentElement]) {
      if (!el || el === document.body) continue;
      for (const which of ['::before', '::after']) {
        const c = getComputedStyle(el, which).content;
        const m = c && c.match(/^"(.+)"$/);
        if (m && m[1].trim()) {
          anchor.cssText = short(`"${m[1]}" from ${which} of ${openingTag(el)}`, 160);
          break;
        }
      }
      if (anchor.cssText) break;
    }
    const build = document.querySelector('meta[name="lab-build"]')?.content;
    if (build) anchor.build = short(build, 40);

    // What the pin sits on: media first (even under a transparent overlay), then text, then a background image.
    const media = stack.slice(0, 5).find((n) => /^(img|video|canvas|svg|image)$/.test(n.localName) && !host.contains(n));
    if (media?.localName === 'image' && media.namespaceURI === 'http://www.w3.org/2000/svg') {
      // A picture placed inside an SVG with <image href>: a picture file, not a drawing.
      anchor.kind = 'image';
      anchor.src = new URL(media.getAttribute('href') || media.getAttribute('xlink:href') || '', location.href).href;
      anchor.file = fileHint(anchor.src);
      svgImageSpot(media, anchor, clientX, clientY);
    } else if (media) {
      const r = media.getBoundingClientRect();
      anchor.kind = media.localName === 'img' ? 'image' : media.localName;
      if (media.localName === 'img' || media.localName === 'video') {
        anchor.src = mediaSrc(media);
        anchor.file = fileHint(anchor.src);
        if (media.alt) anchor.alt = short(media.alt, 120);
        // Turned or skewed by a CSS transform: undo it, so the spot is measured on the picture itself.
        const local = untransform(media, clientX, clientY);
        const [box, px, py] = local ? [local.rect, local.x, local.y] : [r, clientX, clientY];
        const spot = media.localName === 'img'
          ? naturalSpot(media, box, px, py, fileSize(media).nw, fileSize(media).nh)
          : naturalSpot(media, box, px, py, media.videoWidth, media.videoHeight);
        if (spot) Object.assign(anchor, spot);
        if (local) anchor.transform = short(getComputedStyle(media).transform, 80);
        // An animated picture (GIF, WebP, APNG): how long it had been showing, to find the frame.
        if (media.localName === 'img' && /\.(gif|webp|apng)(\?|#|$)/i.test(media.currentSrc || media.src)) {
          const entry = performance.getEntriesByName(media.currentSrc || media.src)[0];
          const since = entry ? (performance.now() - entry.responseEnd) / 1000 : performance.now() / 1000;
          anchor.shownFor = Math.round(since * 10) / 10;
        }
        if (media.localName === 'video') {
          anchor.time = Math.round(media.currentTime * 10) / 10;
          if (Number.isFinite(media.duration)) anchor.duration = Math.round(media.duration * 10) / 10;
          if (!anchor.file && media.poster) anchor.file = fileHint(media.poster);
        }
      } else {
        // canvas / svg animation: when it was, and where inside it.
        anchor.time = Math.round(performance.now() / 100) / 10;
        anchor.imgX = clamp01((clientX - r.left) / (r.width || 1));
        anchor.imgY = clamp01((clientY - r.top) / (r.height || 1));
        anchor.nw = Math.round(r.width);
        anchor.nh = Math.round(r.height);
      }
    } else {
      const quote = quoteAt(clientX, clientY, shadowRoots);
      if (quote) {
        anchor.kind = 'text';
        anchor.quote = quote;
      } else {
        for (let n = target, i = 0; n && n !== document.documentElement && i < 4; n = n.parentElement, i++) {
          const bg = getComputedStyle(n).backgroundImage.match(/url\(["']?(.+?)["']?\)/);
          if (bg) {
            anchor.kind = 'background';
            anchor.src = new URL(bg[1], location.href).href;
            anchor.file = fileHint(anchor.src);
            backgroundSpot(n, anchor.src, anchor, clientX, clientY);
            break;
          }
        }
        anchor.kind ||= 'element';
        if (anchor.kind === 'element') {
          const gap = between(target, clientY);
          if (gap) Object.assign(anchor, { gapAbove: gap.above, gapBelow: gap.below });
        }
      }
    }
    Object.assign(anchor, schemeAt(target));
    return anchor;
  }

  // The stored selector can point at a different element after a redeploy; check it against the
  // file / text fingerprint, look for the right one, and otherwise fall back to the page position.
  function findTarget(anchor) {
    let node = null;
    try {
      node = anchor.selector ? document.querySelector(anchor.selector) : null;
    } catch {}
    const matches = (n) => {
      if (!n) return false;
      if (anchor.file && /^(image|video)$/.test(anchor.kind)) {
        const m = n.closest?.('img, video') || n;
        return fileHint(mediaSrc(m)) === anchor.file;
      }
      if (anchor.element && openingTag(n) !== anchor.element) return false;
      if (anchor.quote?.exact) return (n.textContent || '').includes(anchor.quote.exact);
      return true;
    };
    if (node && node !== document.body && matches(node)) return node;
    if (anchor.file && /^(image|video)$/.test(anchor.kind)) {
      return [...document.querySelectorAll('img, video')].find((m) => fileHint(mediaSrc(m)) === anchor.file) || null;
    }
    return null;
  }

  // Pin point (the zone's top-left corner for area comments) and, for areas, the zone box, in page coordinates.
  function position(anchor) {
    const node = findTarget(anchor);
    if (node) {
      const rect = node.getBoundingClientRect();
      if (rect.width || rect.height) {
        const left = rect.left + scrollX + anchor.x * rect.width;
        const top = rect.top + scrollY + anchor.y * rect.height;
        const zone = anchor.zw ? { left, top, width: anchor.zw * rect.width, height: anchor.zh * rect.height } : null;
        return { left, top, zone };
      }
    }
    const left = anchor.docX * docWidth();
    const top = anchor.docY;
    const zone = anchor.docW ? { left, top, width: anchor.docW, height: anchor.docH } : null;
    // Anchored to the page itself (a margin, or an area wider than any element): nothing has moved.
    return { left, top, zone, moved: Boolean(anchor.selector) && anchor.selector !== 'body' };
  }

  // The quoted words of a text comment, found again in the page, for the highlight (CSS Custom Highlight API:
  // nothing in the page's DOM is touched).
  function quoteRange(anchor) {
    const q = anchor?.quote;
    const node = q?.exact ? findTarget(anchor) : null;
    if (!node) return null;
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    const tail = (q.prefix || '').slice(-12);
    let first = null;
    for (let t; (t = walker.nextNode()); ) {
      for (let i = t.data.indexOf(q.exact); i !== -1; i = t.data.indexOf(q.exact, i + 1)) {
        const range = document.createRange();
        range.setStart(t, i);
        range.setEnd(t, i + q.exact.length);
        if (!tail || t.data.slice(0, i).replace(/\s+/g, ' ').endsWith(tail)) return range;
        first ||= range;
      }
    }
    return first;
  }
  const canMark = typeof Highlight === 'function' && Boolean(CSS.highlights);
  const markQuote = (anchor) => {
    if (!canMark) return;
    const range = anchor && quoteRange(anchor);
    if (range) CSS.highlights.set('lab-quote', new Highlight(range));
    else CSS.highlights.delete('lab-quote');
  };

  // The area's outline: round dots with room between them (CSS dotted borders can't space their dots).
  const zoneEl = (cls) => {
    const z = el('div', { class: `zone ${cls}` });
    z.innerHTML = '<svg aria-hidden="true"><rect class="ring" width="100%" height="100%"/><rect class="dots" width="100%" height="100%"/></svg>';
    return z;
  };
  const drawZone = (box, cls) => {
    if (!box) return;
    const z = zoneEl(cls);
    Object.assign(z.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` });
    layer.append(z);
  };

  // An area comment: facts come from the middle of the zone; the anchor element is the smallest one that
  // contains the whole zone, so the zone is stored as fractions of it and follows it like a pin.
  function zoneAnchor({ x0, y0, x1, y1 }) {
    const left = Math.min(x0, x1);
    const top = Math.min(y0, y1);
    const right = Math.max(x0, x1);
    const bottom = Math.max(y0, y1);
    const anchor = anchorAt((left + right) / 2, (top + bottom) / 2);
    let box = document.elementsFromPoint((left + right) / 2, (top + bottom) / 2).find((n) => n !== host && !host.contains(n));
    const contains = (r) => r.left <= left + 2 && r.top <= top + 2 && r.right >= right - 2 && r.bottom >= bottom - 2;
    while (box && box !== document.body && !contains(box.getBoundingClientRect())) box = box.parentElement;
    box ||= document.body;
    const r = box.getBoundingClientRect();
    Object.assign(anchor, {
      selector: box === document.body ? 'body' : selectorFor(box),
      element: openingTag(box),
      x: r.width ? (left - r.left) / r.width : 0,
      y: r.height ? (top - r.top) / r.height : 0,
      zw: r.width ? Math.min((right - left) / r.width, 1) : 0,
      zh: r.height ? Math.min((bottom - top) / r.height, 1) : 0,
      docX: (left + scrollX) / docWidth(),
      docY: top + scrollY,
      docW: Math.round(right - left),
      docH: Math.round(bottom - top),
    });
    Object.assign(anchor, schemeAt(box));
    // Text inside the zone: the words whose middle falls inside it, in reading order. (Reading it like a selection
    // between the zone's corners took the whole paragraph whenever a corner sat above or below a line of text.)
    const words = [];
    const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let n = walker.nextNode(); n && words.length < 80; n = walker.nextNode()) {
      if (host.contains(n)) continue;
      const pr = n.parentElement?.getBoundingClientRect();
      if (!pr || pr.bottom < top || pr.top > bottom || pr.right < left || pr.left > right) continue;
      for (const m of n.data.matchAll(/\S+/g)) {
        range.setStart(n, m.index);
        range.setEnd(n, m.index + m[0].length);
        const w = range.getBoundingClientRect();
        const cx = (w.left + w.right) / 2;
        const cy = (w.top + w.bottom) / 2;
        if (w.width && cx >= left && cx <= right && cy >= top && cy <= bottom) words.push(m[0]);
      }
    }
    const text = short(words.join(' '), 300);
    if (text) anchor.zoneText = text;
    // What the area holds: the outermost elements that sit wholly inside it (two cards, not the page around them),
    // each with its text and, on a dev build, the component and line that wrote it.
    const inArea = [];
    const all = box.querySelectorAll('*');
    for (let i = 0; i < all.length && i < 3000; i++) {
      const el = all[i];
      if (host.contains(el) || inArea.some((x) => x.contains(el))) continue;
      const er = el.getBoundingClientRect();
      if (er.width < 8 || er.height < 8 || er.left < left - 4 || er.right > right + 4 || er.top < top - 4 || er.bottom > bottom + 4) continue;
      inArea.push(el);
    }
    if (inArea.length) {
      anchor.zoneItems = inArea.slice(0, 5).map((el) => {
        const c = componentAt(el);
        const t = short(el.textContent, 50);
        return short([openingTag(el), t && `"${t}"`, c.component, c.source && `written at ${c.source}`, c.usedAt && `used at ${c.usedAt}`].filter(Boolean).join(' · '), 300);
      });
      if (inArea.length > 5) anchor.zoneItems.push(`and ${inArea.length - 5} more`);
    }
    // The same area inside the original image or video file, when the zone is on one.
    if (/^(img|video)$/.test(box.localName)) {
      const nw = box.localName === 'img' ? fileSize(box).nw : box.videoWidth;
      const nh = box.localName === 'img' ? fileSize(box).nh : box.videoHeight;
      const a = naturalSpot(box, r, left, top, nw, nh);
      const b = naturalSpot(box, r, right, bottom, nw, nh);
      if (a && b) Object.assign(anchor, { imgX: a.imgX, imgY: a.imgY, imgX2: b.imgX, imgY2: b.imgY });
    } else if (anchor.kind === 'image' || anchor.kind === 'video') {
      // Zone is bigger than the media it is centred on: drop the single-point spot, keep the file.
      delete anchor.imgX;
      delete anchor.imgY;
    }
    return anchor;
  }

  // ---------- data ----------
  const headers = () => ({ 'content-type': 'application/json', ...(adminToken ? { 'x-lab-admin': adminToken } : {}) });

  // The API answers 404 anywhere but on the lab host. A script loaded with a relative src can't tell the
  // lab host from the deployment's own address, so the first answer decides: no API here, no layer.
  let gone = false;
  let loaded = false;
  let retried = false;
  const typed = () => Boolean(root.activeElement) || [...root.querySelectorAll('textarea')].some((t) => t.value.trim());
  async function load() {
    try {
      const res = await fetch(`${API}?page=${encodeURIComponent(page)}`, { headers: headers(), cache: 'no-store' });
      if (res.status === 404 && !loaded && script?.dataset.enable !== 'always') {
        if (!retried) {
          retried = true;
          setTimeout(load, 1500);
          return;
        }
        gone = true;
        on = false;
        document.documentElement.classList.remove('lab-pinning');
        host.remove();
        fonts.remove();
        return;
      }
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      comments = data.comments || [];
      isAdmin = Boolean(data.admin);
      loaded = true;
    } catch {
      // Keep what is already on screen when a refresh fails.
    }
    if (!typed() && !grabbing) render();
    // Someone is in a box: the open thread gets its new replies in place; everything else shows on the next render.
    else if (openCard?.isConnected) openCard.sync();
  }

  async function send(payload) {
    const res = await fetch(API, { method: 'POST', headers: headers(), body: JSON.stringify({ page, ...payload }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `could not save (${res.status})`);
    return data;
  }

  // ---------- copy for an agent ----------
  // The link an agent reads: every open comment on this page as plain text.
  const agentLink = () => new URL('/_lab/agent' + page, new URL(API, location.href)).href;

  async function copy(textPromise, button) {
    const textValue = await textPromise;
    try {
      await navigator.clipboard.writeText(textValue);
    } catch {
      const area = document.createElement('textarea');
      area.value = textValue;
      area.style.cssText = 'position:fixed;opacity:0;';
      document.body.append(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    const label = button.textContent;
    button.textContent = 'copied';
    setTimeout(() => (button.textContent = label), 1400);
  }

  // ---------- render ----------
  const threads = () => comments.filter((c) => !c.parent && (isAdmin || !c.resolved));
  // Open comments are numbered 1, 2, 3… in order, the same for everyone, admins and the agent text.
  const numberOf = (c) =>
    comments
      .filter((x) => !x.parent && !x.resolved)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .indexOf(c) + 1;

  // Unread: comments and replies by someone else that this browser hasn't opened yet (kept per page).
  const seenKey = () => `lab-seen:${page}`;
  const readSeen = () => new Set(store.get(seenKey()).split(',').filter(Boolean));
  let seen = readSeen();
  const isNew = (c) => !seen.has(c.id) && c.name !== store.get('lab-name');
  const unread = (c) => [c, ...repliesOf(c.id)].filter(isNew);
  const markSeen = (items) => {
    for (const item of items) seen.add(item.id);
    store.set(seenKey(), [...seen].join(','));
  };
  const repliesOf = (id) => comments.filter((c) => c.parent === id);
  // Pins show who left them: the first letter of the name.
  const initial = (name) => [...String(name || '').trim()][0]?.toUpperCase() || '';
  const ago = (iso) => {
    const s = Math.max(0, (Date.now() - new Date(iso)) / 1000);
    const [n, unit] = s < 60 ? [0, ''] : s < 3600 ? [s / 60, 'minute'] : s < 86400 ? [s / 3600, 'hour'] : s < 2592000 ? [s / 86400, 'day'] : s < 31536000 ? [s / 2592000, 'month'] : [s / 31536000, 'year'];
    if (!unit) return 'just now';
    const k = Math.floor(n);
    return `${k} ${unit}${k === 1 ? '' : 's'} ago`;
  };
  const when = (iso) =>
    new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  function placeCard(card, left, top) {
    layer.append(card);
    const width = card.offsetWidth;
    const maxLeft = scrollX + document.documentElement.clientWidth - width - 12;
    card.style.left = `${Math.max(scrollX + 12, Math.min(left - 14, maxLeft))}px`;
    card.style.top = `${top + 10}px`;
  }

  const ARROW =
    '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M8 13V3.5M3.5 8 8 3.5 12.5 8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  // One field that grows: a pill while empty, a box with a divider and the name row once you type.
  function composer({ placeholder, onSubmit, autofocus }) {
    const wrap = el('div', { class: 'composer' });
    const box = el('div', { class: 'box' });
    const text = el('textarea', { placeholder, maxlength: '2000', rows: '1', 'aria-label': placeholder });
    const who = el('label', { class: 'who' });
    const as = el('span', {}, 'as');
    const name = el('input', { type: 'text', placeholder: 'your name', maxlength: '60', autocomplete: 'name' });
    name.value = store.get('lab-name');
    who.append(as, name);
    const sendBtn = el('button', { class: 'send', type: 'button', 'aria-label': 'send' });
    sendBtn.innerHTML = ARROW;
    const error = el('div', { class: 'error' });
    box.append(text, el('div', { class: 'line' }), who, sendBtn);
    wrap.append(box, error);

    const sync = () => {
      const open = text.value.length > 0 || root.activeElement === name || !!error.textContent;
      // Opening moves the arrow from the text row to the name row: slide it there while the box grows, no jump.
      const glide = open !== box.classList.contains('open') && box.isConnected && !matchMedia('(prefers-reduced-motion: reduce)').matches;
      const from = glide && { arrow: sendBtn.getBoundingClientRect(), height: box.getBoundingClientRect().height };
      box.classList.toggle('open', open);
      as.hidden = !name.value.trim();
      sendBtn.classList.toggle('ready', Boolean(text.value.trim() && name.value.trim()));
      text.style.height = 'auto';
      text.style.height = `${text.scrollHeight}px`;
      if (glide) {
        const to = sendBtn.getBoundingClientRect();
        const timing = { duration: 220, easing: 'cubic-bezier(.2, .7, .3, 1)' };
        sendBtn.animate([{ transform: `translate(${from.arrow.left - to.left}px, ${from.arrow.top - to.top}px)` }, { transform: 'none' }], timing);
        box.style.overflow = 'hidden';
        box.animate([{ height: `${from.height}px` }, { height: `${box.getBoundingClientRect().height}px` }], timing).onfinish = () => (box.style.overflow = '');
      }
    };
    let busy = false;
    const go = async () => {
      if (busy) return;
      if (!text.value.trim()) return text.focus();
      if (!name.value.trim()) {
        box.classList.add('open');
        return name.focus();
      }
      store.set('lab-name', name.value.trim());
      busy = true;
      error.textContent = '';
      try {
        const result = await onSubmit(name.value.trim(), text.value.trim());
        if (result?.keep) {
          text.value = '';
          sync();
        }
      } catch (e) {
        error.textContent = e.message;
        sync();
      }
      busy = false;
    };
    const onKey = (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        go();
      }
    };
    text.addEventListener('input', sync);
    name.addEventListener('input', sync);
    name.addEventListener('blur', () => setTimeout(sync, 0));
    text.addEventListener('keydown', onKey);
    name.addEventListener('keydown', onKey);
    sendBtn.addEventListener('click', go);
    // Keep focus in the field when the send button is pressed.
    sendBtn.addEventListener('mousedown', (e) => e.preventDefault());
    requestAnimationFrame(sync);
    if (autofocus) setTimeout(() => text.focus(), 0);
    return wrap;
  }

  // Draft composer sits to the right of its pin, like the pin is the avatar; below it when there is no room.
  function placeBeside(node, left, top) {
    layer.append(node);
    const width = node.offsetWidth;
    const right = scrollX + document.documentElement.clientWidth - 12;
    if (left + 36 + width <= right) {
      node.style.left = `${left + 36}px`;
      node.style.top = `${top - 37}px`;
    } else {
      node.style.left = `${Math.max(scrollX + 12, Math.min(left - 14, right - width))}px`;
      node.style.top = `${top + 10}px`;
    }
  }

  // What the last render had open (a thread id or a draft), so cards, pins and areas only animate when they
  // appear, not on every re-render, and a card that closes to nothing can fade out.
  let shown = null;
  let posted = null;
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  const pinsById = new Map(); // the pins on the layer now, by thread id, for movePins()
  // Ends a pin drag's window listener when the layer is redrawn under it (the pin is gone, its pointer events with it).
  let dropDrag = null;
  function render() {
    grabbing = false; // a pin being dragged is replaced: its drag ends here
    dropDrag?.();
    const prev = layer.querySelector('.card:not(.out), .float:not(.out)');
    // Every pin's place is read before anything is written, so the page lays out once per render, not once per pin.
    const places = new Map(on ? threads().map((c) => [c.id, position(c.anchor || {})]) : []);
    layer.replaceChildren();
    pinsById.clear();
    const now = on ? draft || openId : null;
    const appear = now !== shown;
    const anim = appear ? ' in' : '';
    let quoted = null;
    const done = () => {
      if (!now && shown && prev && !still.matches) {
        prev.classList.remove('in');
        prev.classList.add('out');
        prev.inert = true;
        layer.append(prev);
        setTimeout(() => prev.remove(), 150);
      }
      markQuote(quoted);
      shown = now;
      posted = null;
    };
    const list = threads();
    const open = list.filter((c) => !c.resolved).length;
    const fresh = list.filter((c) => !c.resolved).reduce((n, c) => n + unread(c).length, 0);
    toggleBtn.replaceChildren(
      document.createTextNode(
        (on ? 'hide comments' : open ? `comments · ${open}` : 'comments') + (fresh ? ` · ${fresh} new` : ''),
      ),
      el('kbd', {}, 'c'),
    );
    toggleBtn.classList.toggle('secondary', on);
    document.documentElement.classList.toggle('lab-pinning', on);
    copyBtn.hidden = !on || !isAdmin || list.every((c) => c.resolved);
    if (!on) return done();

    list.forEach((c) => {
      const { left, top, moved, zone } = places.get(c.id) || position(c.anchor || {});
      if (openId === c.id) drawZone(zone, `saved${anim}`);
      const news = unread(c);
      const movable = !zone && (isAdmin || store.get(`lab-edit:${c.id}`));
      const pin = el(
        'button',
        {
          class: `pin${c.resolved ? ' resolved' : ''}${news.length ? ' new' : ''}${moved ? ' moved' : ''}${posted === c.id ? ' in' : ''}${movable ? ' grab' : ''}`,
          type: 'button',
          title: `${c.resolved ? '' : `${numberOf(c)} · `}${c.name}${moved ? ' · the spot it was pinned to has changed' : ''}${movable ? ' · drag to move' : ''}`,
        },
        c.resolved ? '✓' : initial(c.name),
      );
      pin.style.left = `${left}px`;
      pin.style.top = `${top}px`;
      if (movable) grab(pin, c);
      pin.addEventListener('click', (e) => {
        e.stopPropagation();
        if (pin.dataset.dragged) return;
        openId = openId === c.id ? null : c.id;
        draft = null;
        render();
      });
      layer.append(pin);
      pinsById.set(c.id, pin);
      if (openId === c.id) {
        // Area comments open below the area, so the card doesn't hide what it is about.
        // Opened by a click: the reply box takes focus (not on touch screens, where it would pop the keyboard).
        const card = threadCard(c, new Set(news.map((x) => x.id)), appear && !coarse);
        openCard = card;
        if (appear) card.classList.add('in');
        placeCard(card, zone ? left + 14 : left, zone ? zone.top + zone.height : top);
        markSeen(news);
        quoted = c.anchor;
      }
    });

    if (draft) {
      const { anchor } = draft;
      const { left, top, zone } = position(anchor);
      drawZone(zone, 'draft');
      quoted = anchor;
      const pin = el('div', { class: `pin draft${anim}` }, initial(store.get('lab-name')));
      pin.style.left = `${left}px`;
      pin.style.top = `${top}px`;
      layer.append(pin);
      const float = el('div', { class: `float${anim}` });
      float.append(
        composer({
          placeholder: 'add a comment',
          autofocus: true,
          onSubmit: async (name, text) => {
            const { comment, edit } = await send({ name, text, anchor });
            if (edit) store.set(`lab-edit:${comment.id}`, edit); // lets this browser drag the pin later
            comments.push(comment);
            markSeen([comment]);
            draft = null;
            openId = null; // like Figma: once posted, the card closes and the new pin stays (click it to open)
            posted = comment.id;
            render();
          },
        }),
      );
      if (zone) placeCard(float, left + 14, zone.top + zone.height);
      else placeBeside(float, left, top);
    }
    done();
  }

  // Drag a pin to fix its spot: whoever started the thread (its key is kept in their browser) or an admin.
  // The pin's tip (bottom left) lands where it is dropped; the new spot is saved like a fresh pin.
  let grabbing = false;
  function grab(pin, c) {
    pin.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const r = pin.getBoundingClientRect();
      const tip = { dx: e.clientX - r.left, dy: e.clientY - r.bottom };
      const start = { x: e.clientX, y: e.clientY, sx: scrollX, sy: scrollY, left: parseFloat(pin.style.left), top: parseFloat(pin.style.top) };
      let moving = false;
      let last = e;
      grabbing = true;
      pin.setPointerCapture(e.pointerId);
      // Page coordinates, so the pin stays under the pointer when the page scrolls mid-drag.
      const place = () => {
        pin.style.left = `${start.left + last.clientX - start.x + scrollX - start.sx}px`;
        pin.style.top = `${start.top + last.clientY - start.y + scrollY - start.sy}px`;
      };
      const move = (ev) => {
        last = ev;
        if (!moving && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 5) return;
        moving = true;
        pin.classList.add('dragging');
        place();
      };
      const scrolled = () => moving && place();
      addEventListener('scroll', scrolled, true);
      dropDrag = () => {
        removeEventListener('scroll', scrolled, true);
        dropDrag = null;
      };
      const up = async (ev) => {
        pin.removeEventListener('pointermove', move);
        pin.removeEventListener('pointerup', up);
        pin.removeEventListener('pointercancel', up);
        pin.removeEventListener('lostpointercapture', up);
        dropDrag?.();
        if (!grabbing) return; // already ended (the layer was redrawn mid-drag)
        grabbing = false;
        if (!moving) return;
        pin.dataset.dragged = '1'; // the click that follows is the drop, not an open
        setTimeout(() => delete pin.dataset.dragged, 0);
        const x = ev.clientX - tip.dx;
        const y = ev.clientY - tip.dy;
        const under = document.elementsFromPoint(x, y).find((n) => n !== host);
        if (ev.type === 'pointercancel' || x < 0 || y < 0 || x > innerWidth || y > innerHeight || under?.closest(OFF)) return render();
        const before = c.anchor;
        c.anchor = anchorAt(x, y);
        render();
        try {
          const { comment } = await send({ action: 'move', id: c.id, anchor: c.anchor, edit: store.get(`lab-edit:${c.id}`) || undefined });
          Object.assign(c, comment);
        } catch {
          c.anchor = before; // not saved: back where it was
          render();
        }
      };
      pin.addEventListener('pointermove', move);
      pin.addEventListener('pointerup', up);
      pin.addEventListener('pointercancel', up);
      pin.addEventListener('lostpointercapture', up);
    });
  }

  // The open thread's card. New replies (Claude's too) are added to it in place, so the reply box keeps focus.
  let openCard = null;
  const coarse = matchMedia('(pointer: coarse)').matches;
  function threadCard(c, fresh = new Set(), focus = false) {
    const card = el('div', { class: 'card' });
    card.addEventListener('click', (e) => e.stopPropagation());
    const itemEl = (item, isNew = fresh.has(item.id)) => {
      const box = el('div', { class: 'item' });
      const meta = el('div', { class: 'meta' });
      meta.append(el('b', {}, item.name), el('span', { class: 'ago', title: when(item.createdAt) }, ago(item.createdAt)));
      if (isNew) meta.append(el('span', { class: 'dot', title: 'new' }));
      // The number the agent text uses for this thread.
      if (item === c && !c.resolved) meta.append(el('span', { class: 'num', title: 'comment number, as in the agent link' }, String(numberOf(c))));
      box.append(meta, el('div', { class: 'text' }, item.text));
      return box;
    };
    const shown = new Set();
    for (const item of [c, ...repliesOf(c.id)]) {
      card.append(itemEl(item));
      shown.add(item.id);
    }
    card.sync = () => {
      for (const r of repliesOf(c.id)) {
        if (shown.has(r.id)) continue;
        const items = card.querySelectorAll('.item');
        items[items.length - 1].after(itemEl(r, true));
        shown.add(r.id);
        markSeen([r]);
      }
    };
    if (isAdmin) {
      const actions = el('div', { class: 'row' });
      const resolve = el('button', { class: 'btn', type: 'button' }, c.resolved ? 'reopen' : 'resolve');
      const failed = (btn) => (btn.textContent = 'failed, try again');
      resolve.addEventListener('click', async () => {
        try {
          const { comment } = await send({ action: c.resolved ? 'reopen' : 'resolve', id: c.id });
          Object.assign(c, comment);
          render();
        } catch {
          failed(resolve);
        }
      });
      const del = el('button', { class: 'btn', type: 'button' }, 'delete');
      // Asked in the card itself, not the browser's dialog: the row swaps to the question, same height, nothing moves.
      const yes = el('button', { class: 'btn danger', type: 'button' }, 'delete');
      const no = el('button', { class: 'btn', type: 'button' }, 'cancel');
      const back = () => {
        actions.replaceChildren(resolve, del);
        del.focus();
      };
      del.addEventListener('click', () => {
        actions.replaceChildren(el('span', { class: 'ask' }, repliesOf(c.id).length ? 'delete thread?' : 'delete comment?'), yes, no);
        no.focus();
      });
      no.addEventListener('click', back);
      actions.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && yes.isConnected) {
          e.stopPropagation();
          back();
        }
      });
      yes.addEventListener('click', async () => {
        try {
          await send({ action: 'delete', id: c.id }); // the API deletes the replies with it
        } catch {
          return failed(yes);
        }
        comments = comments.filter((x) => x.id !== c.id && x.parent !== c.id);
        openId = null;
        render();
      });
      actions.append(resolve, del);
      card.append(actions);
    }
    card.append(
      composer({
        placeholder: 'reply',
        autofocus: focus,
        onSubmit: async (name, text) => {
          const { comment } = await send({ name, text, parent: c.id });
          comments.push(comment);
          markSeen([comment]);
          // Add the reply where it belongs instead of redrawing the card, so nothing on screen blinks
          // and the reply box keeps its focus for the next one.
          shown.add(comment.id);
          const items = card.querySelectorAll('.item');
          items[items.length - 1].after(itemEl(comment, false));
          return { keep: true };
        },
      }),
    );
    return card;
  }

  // ---------- events ----------
  const showHint = () => {
    if (store.get('lab-hint-seen') === '1') return;
    hint.hidden = false;
    store.set('lab-hint-seen', '1');
    setTimeout(() => (hint.hidden = true), 5000);
  };
  const setOn = (value) => {
    on = value;
    store.set('lab-on', on ? '1' : '0');
    if (on) showHint();
    draft = null;
    openId = null;
    render();
  };
  toggleBtn.addEventListener('click', () => setOn(!on));
  // Option-click (or Option-drag) with comments hidden still pins: comments come back with the new one.
  const showAgain = () => {
    if (on) return;
    on = true;
    store.set('lab-on', '1');
  };
  copyBtn.addEventListener('click', () => copy(agentLink(), copyBtn));
  const typing = (e) =>
    e.composedPath().some((n) => n instanceof HTMLElement && (n.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(n.tagName)));
  document.addEventListener('keydown', (e) => {
    if (gone) return;
    const inOtherWidget = document.activeElement?.localName.includes('-') && document.activeElement !== host; // e.g. an input in a closed shadow root
    if ((e.key === 'c' || e.key === 'C' || e.code === 'KeyC') && !e.metaKey && !e.ctrlKey && !e.altKey && !e.repeat && !typing(e) && !inOtherWidget) {
      e.preventDefault();
      setOn(!on);
      return;
    }
    if (e.key === 'Escape' && (draft || openId)) {
      draft = null;
      openId = null;
      render();
    }
  });

  // Always ready to pin: a click on the page (not on a link or control) opens a new comment there.
  // Alt/Option-click pins on links and controls too. With a comment open, the first click outside only closes it.
  const INTERACTIVE =
    'a, button, input, textarea, select, label, summary, video[controls], audio, iframe, [contenteditable], [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="option"], [role="checkbox"], [role="switch"], [tabindex]:not([tabindex="-1"]), [onclick]';
  // data-uncommentable: no new pins or areas start inside this part of the page (same attribute as Claude artifacts).
  const OFF = '[data-uncommentable]';
  // Drag (mouse or pen) to mark an area instead of a point. Touch keeps scrolling.
  let drag = null;
  let afterDrag = false;
  let liveZone = null;
  let zoneFrame = 0;
  // One write per frame, position by transform: the frame follows the pointer without forcing layout in between.
  const paintZone = () => {
    zoneFrame = 0;
    if (!drag?.active || !liveZone) return;
    const x = Math.min(drag.x0, drag.x1) + scrollX;
    const y = Math.min(drag.y0, drag.y1) + scrollY;
    liveZone.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    liveZone.style.width = `${Math.abs(drag.x1 - drag.x0)}px`;
    liveZone.style.height = `${Math.abs(drag.y1 - drag.y0)}px`;
  };
  function startDrag(e) {
    // An open card doesn't block a new area: it closes once the area is drawn (a plain click still just closes it).
    if ((!on && !e.altKey) || draft || e.button !== 0 || e.pointerType === 'touch' || e.metaKey || e.ctrlKey || e.shiftKey) return;
    if (e.composedPath().includes(host)) return;
    if (!e.altKey && e.target instanceof Element && e.target.closest(INTERACTIVE)) return;
    if (e.target instanceof Element && e.target.closest(OFF)) return;
    drag = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY, active: false };
  }
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (e.altKey) return; // Option presses are taken earlier (see optionPress)
      // An open card doesn't block a new area: it closes once the area is drawn (a plain click still just closes it).
      if ((!on && !e.altKey) || draft || e.button !== 0 || e.pointerType === 'touch' || e.metaKey || e.ctrlKey || e.shiftKey) return;
      if (e.composedPath().includes(host)) return;
      if (!e.altKey && e.target instanceof Element && e.target.closest(INTERACTIVE)) return;
      if (e.target instanceof Element && e.target.closest(OFF)) return;
      drag = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY, active: false };
    },
    true,
  );
  document.addEventListener(
    'pointermove',
    (e) => {
      if (!drag) return;
      drag.x1 = e.clientX;
      drag.y1 = e.clientY;
      if (!drag.active && Math.hypot(drag.x1 - drag.x0, drag.y1 - drag.y0) > 8) {
        drag.active = true;
        getSelection?.()?.removeAllRanges();
        document.documentElement.classList.add('lab-dragging');
        liveZone = zoneEl('draft live');
        layer.append(liveZone);
      }
      if (!drag.active) return;
      e.preventDefault();
      zoneFrame ||= requestAnimationFrame(paintZone);
    },
    true,
  );
  const endDrag = (e) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    document.documentElement.classList.remove('lab-dragging');
    cancelAnimationFrame(zoneFrame);
    zoneFrame = 0;
    liveZone?.remove();
    liveZone = null;
    if (!d.active || e.type === 'pointercancel') return;
    // The click that follows this pointerup belongs to the drag, not a new pin.
    afterDrag = true;
    setTimeout(() => (afterDrag = false), 0);
    getSelection?.()?.removeAllRanges();
    if (Math.abs(d.x1 - d.x0) < 12 || Math.abs(d.y1 - d.y0) < 12) return;
    showAgain();
    openId = null;
    draft = { anchor: zoneAnchor(d) };
    render();
  };
  document.addEventListener('pointerup', endDrag, true);
  document.addEventListener('pointercancel', endDrag, true);
  // Don't let images and videos start a native drag while comments are on: a press there marks an area.
  document.addEventListener(
    'dragstart',
    (e) => {
      const media = on && e.target instanceof Element && e.target.closest('img, video') && !e.composedPath().includes(host);
      if (drag || media) e.preventDefault();
    },
    true,
  );

  document.addEventListener(
    'click',
    (e) => {
      if (!afterDrag) return;
      e.preventDefault();
      e.stopPropagation();
    },
    true,
  );

  // Option (Alt) presses are for commenting: the page never sees them, so a menu item or a button doesn't run
  // and close itself before the pin lands on it.
  const optionPress = (e) => e.altKey && !e.metaKey && !e.ctrlKey && e.button === 0 && !e.composedPath().includes(host) &&
    !(e.target instanceof Element && e.target.closest(OFF));
  for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) {
    addEventListener(type, (e) => {
      if (!optionPress(e)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (type === 'pointerdown') startDrag(e);
      if (type === 'pointerup') endDrag(e);
    }, true);
  }
  addEventListener('click', (e) => {
    if (!optionPress(e)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!afterDrag) onPageClick(e); // the click that ends an Option-drag belongs to the area
  }, true);

  document.addEventListener('click', (e) => onPageClick(e));
  function onPageClick(e) {
    if (e.composedPath().includes(host)) return;
    if (draft || openId) {
      if ([...root.querySelectorAll('textarea')].some((t) => t.value.trim())) return; // typed text stays; Escape discards it
      draft = null;
      openId = null;
      render();
      return;
    }
    if ((!on && !e.altKey) || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    if (e.altKey) e.preventDefault();
    else if (e.defaultPrevented || (e.target instanceof Element && e.target.closest(INTERACTIVE))) return;
    if (e.target instanceof Element && e.target.closest(OFF)) return;
    if (String(getSelection?.() || '').trim()) return;
    showAgain();
    draft = { anchor: anchorAt(e.clientX, e.clientY) };
    render();
  }

  // Scrolling an inner box or the page growing only moves the pins: their places are read together, then written.
  // A full redraw happens only when something is open (a card or a composer follows its pin) or the pins changed.
  const movePins = () => {
    const list = threads();
    if (!on || openId || list.length !== pinsById.size) return render();
    const places = list.map((c) => [pinsById.get(c.id), position(c.anchor || {})]);
    if (places.some(([pin]) => !pin)) return render();
    for (const [pin, { left, top, moved }] of places) {
      pin.style.left = `${left}px`;
      pin.style.top = `${top}px`;
      pin.classList.toggle('moved', Boolean(moved));
    }
  };
  let frame = 0;
  const reflow = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      // Keep an open composer's text: only re-place when nothing is being typed.
      if (draft || root.activeElement || grabbing) return;
      movePins();
    });
  };
  addEventListener('resize', reflow);
  addEventListener('scroll', (e) => e.target !== document && !host.contains(e.target) && reflow(), { capture: true, passive: true });

  // Client-side navigation (pushState, back/forward, Astro view transitions): comments follow the new page,
  // and the layer comes back if the page swapped out <body>.
  const navigated = () => {
    if (gone) return;
    if (!host.isConnected && document.body) document.body.append(host);
    if (!fonts.isConnected) document.head.append(fonts);
    if (pageNow() === page) return;
    page = pageNow();
    seen = readSeen();
    comments = [];
    draft = null;
    openId = null;
    render();
    load();
  };
  for (const m of ['pushState', 'replaceState']) {
    const original = history[m];
    history[m] = function (...args) {
      const out = original.apply(this, args);
      queueMicrotask(navigated);
      return out;
    };
  }
  addEventListener('popstate', navigated);
  document.addEventListener('astro:after-swap', navigated);
  // Pick up comments others left while this tab was in the background.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !draft && !root.activeElement) load();
  });
  if ('ResizeObserver' in window) new ResizeObserver(reflow).observe(document.body);

  // Font: the system's own (San Francisco, Segoe UI, Roboto…), so nothing downloads. A site can pick its own with
  // --lab-font on the host element, data-font="Name" (a font the page already loads) or data-font-url (a woff2).
  // @font-face is ignored inside a shadow root, so a data-font-url face goes in the document.
  const fonts = document.createElement('style');
  if (script?.dataset.fontUrl)
    fonts.textContent = `@font-face{font-family:'lab comments';font-display:swap;src:url('${new URL(script.dataset.fontUrl, script.src || location.href)}') format('woff2');}`;
  const fontName = script?.dataset.fontUrl ? 'lab comments' : script?.dataset.font;
  if (fontName) host.style.setProperty('--lab-font', `'${fontName.replace(/'/g, '')}', system-ui, sans-serif`);

  // A pin-shaped cursor over everything you can comment on (links and controls keep theirs).
  const PIN_CURSOR =
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='26' height='26'%3E%3Cpath d='M3 23V12.5a9.5 9.5 0 1 1 9.5 9.5H4z' fill='black' stroke='white' stroke-width='2'/%3E%3C/svg%3E\") 3 23, crosshair";
  fonts.textContent += 'html.lab-dragging, html.lab-dragging * { user-select: none !important; -webkit-user-select: none !important; cursor: crosshair !important; }';
  fonts.textContent += `html.lab-pinning body, html.lab-pinning body *:not(${INTERACTIVE}, a *, button *, label *, [role="button"] *, [data-lab-comments]) { cursor: ${PIN_CURSOR}; }`;
  // Holding Option (Alt) shows the pin cursor on links and controls too, since Option-click pins there.
  fonts.textContent += `html.lab-alt body, html.lab-alt body *:not([data-lab-comments], [data-lab-comments] *, ${OFF}, ${OFF} *) { cursor: ${PIN_CURSOR} !important; }`;
  const setAlt = (down) => document.documentElement.classList.toggle('lab-alt', Boolean(down));
  addEventListener('keydown', (e) => e.key === 'Alt' && setAlt(true), true);
  addEventListener('keyup', (e) => e.key === 'Alt' && setAlt(false), true);
  addEventListener('pointermove', (e) => setAlt(e.altKey), { capture: true, passive: true }); // Option pressed while another window had focus
  addEventListener('blur', () => setAlt(false));

  const start = () => {
    document.head.append(fonts);
    if (on) showHint();
    document.body.append(host);
    // The page's own selection while commenting, and the quoted words of an open text comment.
    // These rules live in the document, so the colours are read from the layer once it is in the page.
    const cs = getComputedStyle(host);
    // A soft tint of the accent, so the quoted words stay readable in the page's own colour.
    const paint = `background-color: color-mix(in srgb, ${cs.getPropertyValue('--_accent').trim() || '#141414'} 16%, transparent); color: inherit;`;
    fonts.textContent += `html.lab-pinning ::selection { ${paint} } ::highlight(lab-quote) { ${paint} }`;
    load();
  };
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);

  // Local mode (local.mjs sets data-live): one event stream while the tab is visible, so many tabs don't use up
  // the browser's connections. The page reloads when its files change, keeping the scroll position, and the
  // comments refresh when someone else, like an agent, changes them. A label says which Claude session listens.
  if (script?.dataset.live) {
    const key = 'lab-scroll:' + location.pathname;
    try {
      // The scroll position and the open thread come back after a reload, so an answer shows where you left it.
      const kept = JSON.parse(sessionStorage.getItem(key) || 'null');
      if (kept !== null) {
        sessionStorage.removeItem(key);
        if (kept.open) openId = kept.open;
        addEventListener('load', () => scrollTo(0, +(kept.y ?? kept)));
      }
    } catch {}
    // Hold a reload while a comment is being started or text is typed; a focused, empty reply box doesn't count.
    const busy = () => draft || [...root.querySelectorAll('textarea')].some((t) => t.value.trim());
    const reload = () => {
      if (busy()) return setTimeout(reload, 500);
      try {
        sessionStorage.setItem(key, JSON.stringify({ y: scrollY, open: openId }));
      } catch {}
      location.reload();
    };
    const who = document.createElement('a');
    who.className = 'listener';
    who.addEventListener('click', async () => {
      const text = who.dataset.copy;
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        const was = [...who.childNodes];
        who.replaceChildren('copied');
        setTimeout(() => who.textContent === 'copied' && who.replaceChildren(...was), 1200);
      } catch {}
    });
    who.hidden = true;
    root.append(who);
    let stream = null;
    let seen = null;
    // The server counts open tabs: a tab in the background still counts, and says bye when it closes, so closing
    // the page stops Claude listening.
    const tab = Math.random().toString(36).slice(2, 12);
    const connect = () => {
      if (stream || document.hidden) return;
      stream = new EventSource(`${script.dataset.live}?tab=${tab}`);
      stream.onmessage = (e) => {
        const v = JSON.parse(e.data);
        if (String(v.files) !== script.dataset.version) return reload();
        if (seen !== null && v.comments !== seen) load(); // load() keeps typed text: it adds replies in place
        seen = v.comments;
        // listening: a wait is open · working: Claude got comments and is on them · away: nobody will hear a comment now.
        const s = v.session;
        const mode = s ? v.mode || 'listening' : 'away';
        const span = (t) => Object.assign(document.createElement('span'), { textContent: t });
        // "Codex is working (ooze)": the agent first, the session's name after it in brackets.
        const agent = s?.agent || 'Claude';
        const tag = s && s.name !== agent ? [span(`(${s.name})`)] : [];
        if (mode === 'listening') who.replaceChildren(span('talking to'), agent, ...tag);
        else if (mode === 'working') who.replaceChildren(agent, span('is working'), ...tag);
        else who.replaceChildren(span('no agent listening'));
        who.classList.toggle('idle', mode === 'away');
        if (s?.url && mode !== 'away') Object.assign(who, { href: s.url, target: '_blank' });
        else who.removeAttribute('href');
        // No link, but a resume command (codex resume …): a tap copies it.
        who.dataset.copy = !s?.url && s?.resume && mode !== 'away' ? s.resume : '';
        who.title = mode === 'away' ? 'Ask your agent to run: npx @leonidstern/labfb wait' : s?.resume ? `${s.resume}${who.dataset.copy ? ' (tap to copy)' : ''}` : '';
        who.hidden = false;
      };
    };
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) return connect();
      stream?.close();
      stream = null;
    });
    addEventListener('pagehide', () => {
      stream?.close();
      stream = null;
      fetch(script.dataset.live.replace(/live$/, 'bye'), { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tab }) }).catch(() => {});
    });
    addEventListener('pageshow', (e) => e.persisted && connect()); // back from the back-forward cache
    connect();
  }
})();
