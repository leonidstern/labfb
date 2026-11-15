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
        --_radius: var(--lab-radius, 12px); --_r-s: 6px /* two corners in all: 6 px small (keys, rows, tabs, text buttons), 12 px boxes and buttons; circles only for dots */;
        /* Washes of black (white in dark mode), four steps: soft, hover, line, muted, as lab.css. */
        --_soft: var(--lab-soft, rgba(0,0,0,.05)); --_hover: var(--lab-hover, rgba(0,0,0,.10)); --_line: var(--lab-line, rgba(0,0,0,.15)); --_muted: var(--lab-muted, rgba(0,0,0,.50));
        --_hair: .5px solid color-mix(in srgb, var(--_fg) 16%, transparent);
        --_shadow: 0 0 0 .5px color-mix(in srgb, var(--_fg) 14%, transparent), 0 1px 2px rgba(0,0,0,.04), 0 8px 28px rgba(0,0,0,.08);
        --_ease: cubic-bezier(.2, .8, .2, 1); }
      @media (prefers-color-scheme: dark) {
        :host { --_bg: var(--lab-bg, #1c1c1e); --_fg: var(--lab-fg, #f4f4f5);
                --_accent: var(--lab-accent, #f4f4f5); --_accent-fg: var(--lab-accent-fg, #141414);
                --_soft: var(--lab-soft, rgba(255,255,255,.05)); --_hover: var(--lab-hover, rgba(255,255,255,.10)); --_line: var(--lab-line, rgba(255,255,255,.15)); --_muted: var(--lab-muted, rgba(255,255,255,.50));
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
      /* Statuses. A go pin: an outline with a green tick when placed, the turning stroke while the agent is on it,
         filled green once done. A comment pin: your initial, the stroke, then a green tick when done. */
      button.pin.go { background: var(--_bg); color: rgb(36, 160, 70); font-size: 14px;
                      box-shadow: inset 0 0 0 1.5px rgb(36, 160, 70), 0 2px 8px rgba(0,0,0,.16); }
      button.pin.go.done { background: rgb(36, 160, 70); color: #fff; box-shadow: 0 0 0 .5px color-mix(in srgb, var(--_fg) 22%, transparent), 0 2px 8px rgba(0,0,0,.16); }
      button.pin.done:not(.go) { color: rgb(36, 160, 70); }
      .pin.moved { opacity: .5; }
      .pin.grab { touch-action: none; }
      button.pin.dragging { cursor: grabbing; transform: scale(1.1); opacity: 1; box-shadow: 0 0 0 .5px color-mix(in srgb, var(--_fg) 30%, transparent), 0 8px 20px rgba(0,0,0,.22); }
      .zone { position: absolute; background: none;
              border-radius: var(--_radius); pointer-events: none; }
      .zone svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
      .zone rect { fill: none; stroke-linecap: round; stroke-dasharray: 0 4; rx: var(--lab-radius, 12px); ry: var(--lab-radius, 12px); }
      /* Green dots, the same green as quoted words, with no dark ring under them. */
      .zone rect.ring { display: none; }
      .zone rect.dots { stroke: rgb(52, 199, 89); stroke-width: 2; }
      .zone.live { left: 0; top: 0; will-change: transform, width, height; animation: lab-fade .12s ease-out; }
      /* The agent is on it: a thin green ring turns around the pin. */
      /* The agent is on it: a green stroke runs round the pin's own teardrop outline (a turning conic gradient, cut to a
         2 px ring; --lab-spin is registered in the page, since @property doesn't work inside a shadow root). */
      .pin.working::before { content: ''; position: absolute; inset: -4px; border-radius: 18px 18px 18px 6px; padding: 2px; pointer-events: none;
                             background: conic-gradient(from var(--lab-spin, 0deg), rgb(52, 199, 89) 0 28%, rgba(52, 199, 89, .22) 28% 100%);
                             -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor;
                             mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0);
                             animation: lab-spin 1.2s linear infinite; }
      @keyframes lab-spin { to { --lab-spin: 360deg; } }
      /* The drawn pointer: your pin, following the mouse (it moves without a transition; only its look eases). */
      .ptr { position: fixed; left: 0; top: 0; width: 28px; height: 28px; border-radius: 14px 14px 14px 2px; corner-shape: round;
             background: var(--_bg); box-shadow: 0 0 0 .5px color-mix(in srgb, var(--_fg) 30%, transparent), 0 2px 6px rgba(0,0,0,.18);
             display: grid; place-items: center; pointer-events: none; z-index: 2147483647; opacity: 0; will-change: transform;
             transition: opacity .12s ease-out, background-color .16s ease-out; }
      .ptr.show { opacity: 1; }
      .ptr span { grid-area: 1 / 1; font-size: 12px; font-weight: 600; line-height: 1; transition: opacity .16s ease-out, transform .16s ease-out; }
      .ptr .tick { opacity: 0; transform: scale(.5); color: #fff; font-size: 14px; }
      .ptr.go { background: rgb(36, 160, 70); }
      .ptr.go .ini { opacity: 0; transform: scale(.5); }
      .ptr.go .tick { opacity: 1; transform: none; }
      .pin.new::after { content: ''; position: absolute; top: -4px; right: -4px; width: 9px; height: 9px; border-radius: 50%;
                        background: var(--_fg); box-shadow: 0 0 0 2px var(--_bg); }
      .dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--_accent); margin: 0 6px 1px 0; }
      .card { position: absolute; width: 320px; max-width: calc(100vw - 24px); background: var(--_bg); border-radius: var(--_radius);
              box-shadow: var(--_shadow); padding: 12px 14px 14px; transform-origin: 14px 0; z-index: 1;
              display: flex; flex-direction: column; max-height: min(460px, 62vh); }
      /* A long thread scrolls inside the card, which keeps one size; the step buttons and the reply box stay put. */
      .card > .body { flex: 0 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; margin-right: -8px; padding-right: 8px; }
      .card > .foot { flex: none; }
      .card.in, .float.in { animation: lab-in .18s var(--_ease); }
      .card.out, .float.out { animation: lab-out .14s ease-in forwards; pointer-events: none; }
      .item { display: grid; row-gap: 3px; }
      .item + .item { margin-top: 14px; }
      .msg.item { display: block; } .msg.item + .msg.item { margin-top: 0; }
      .meta { display: flex; align-items: baseline; gap: .5em; font-size: 12px; color: var(--_muted); margin: 0;
              white-space: nowrap; letter-spacing: .01em; font-variant-numeric: tabular-nums; }
      .meta b { font-weight: 500; font-size: 13px; letter-spacing: .005em; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
      .meta .dot { flex: none; align-self: center; margin: 0; }
      .meta .num { color: var(--_muted); font-variant-numeric: tabular-nums; margin-left: auto; }
      .meta .ago { white-space: nowrap; }
      .text { white-space: pre-wrap; overflow-wrap: anywhere; text-wrap: pretty; }
      .row { display: flex; gap: 12px; justify-content: flex-start; align-items: center; margin-top: 8px; }
      /* A thread's reopen / resolve / delete: small, on the right, out of the reading flow. */
      .card .row:not(.nav) { justify-content: flex-end; gap: 10px; } .card .row:not(.nav) button.btn { font-size: 11.5px; }
      button.btn { border: 0; padding: 2px 0; cursor: pointer; background: none; color: var(--_muted); font-size: 12px;
                   letter-spacing: .01em; border-radius: var(--_r-s); transition: color .12s; }
      button.btn:hover { color: var(--_fg); }
      button.btn.danger, button.btn.danger:hover { color: #e5484d; }
      .row .ask { white-space: nowrap; color: var(--_fg); font-size: 12px; letter-spacing: .01em; padding: 2px 0; animation: lab-fade .12s ease-out; }
      .float { position: absolute; width: 320px; max-width: calc(100vw - 24px); transform-origin: 0 20px; z-index: 1; }
      .card .composer { margin-top: 14px; }
      .box { display: grid; grid-template-columns: 1fr auto; grid-template-areas: "text send"; align-items: center; column-gap: 8px;
             background: var(--_bg); border-radius: var(--_radius); padding: 7px 7px 7px 14px; transition: box-shadow .15s; }
      /* The new comment box: the chat's box (no border), with only a soft shadow so it stands out on any page. */
      .float .box, .float .box:focus-within { box-shadow: 0 1px 2px rgba(0,0,0,.06), 0 8px 26px rgba(0,0,0,.14); }
      .card .box { background: var(--_soft); border-radius: var(--_radius); margin: 0; }
      .card .box, .card .box.open, .card .box:focus-within { box-shadow: none; } /* the same box as the chat's: soft grey, no border */
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
      /* One line once your name is known: text, a quiet "as <name>" (still editable) and the arrow, side by side.
         The text grows upward; the name and arrow stay on its last line. Only a first comment, with no name yet, opens
         the second row to ask for it. */
      .box.one, .box.one.open { grid-template-columns: minmax(0, 1fr) auto auto; grid-template-areas: "text who send"; align-items: end; row-gap: 0; padding: 7px 7px 7px 14px; }
      .box.one .line { display: none !important; }
      .box.one .who { align-self: end; padding-bottom: 5px; max-width: 40%; }
      .box.one .who input { flex: none; field-sizing: content; min-width: 2ch; max-width: 9em; }
      .send { grid-area: send; width: 24px; height: 24px; border-radius: 50%; border: 0; padding: 0; cursor: pointer;
              background: var(--_hover); color: var(--_muted); display: grid; place-items: center; transition: background .15s, color .15s, transform .15s var(--_ease); }
      .send.ready:hover { transform: scale(1.06); }
      .send.ready:active { transform: scale(.94); }
      .send.ready { background: var(--_accent); color: var(--_accent-fg); }
      /* The arrow: three round-ended bars, whole-pixel sizes. The element is the stem; the two arms hang from the
         centre of its top cap and swing out 45°, so all three meet in one round tip (no seam, no blur). */
      /* 1 px lines; left: .5px puts the centred 1 px stem on a whole pixel (it would sit on a half one, and blur). */
      .send .arr { position: relative; left: .5px; display: block; width: 1px; height: 12px; border-radius: .5px; background: currentColor; }
      .send .arr::before, .send .arr::after { content: ''; position: absolute; left: 0; top: 0; width: 1px; height: 7px;
                                              border-radius: .5px; background: currentColor; transform-origin: .5px .5px; }
      .send .arr::before { transform: rotate(45deg); }
      .send .arr::after { transform: rotate(-45deg); }
      .send * { color: inherit; }
      .error { color: #e5484d; font-size: 12px; padding: 6px 8px 0; letter-spacing: .01em; }
      .error:empty { display: none; }
      .bar { position: fixed; right: 16px; bottom: 16px; display: flex; gap: 8px; align-items: center; }
      .bar button { border: 0; border-radius: var(--_radius); padding: 9px 14px; cursor: pointer; background: var(--_bg); color: var(--_fg);
                    box-shadow: var(--_shadow); font-size: 13px; font-weight: 500; display: inline-flex; gap: 8px; align-items: center;
                    letter-spacing: .005em; font-variant-numeric: tabular-nums; white-space: nowrap; transition: color .15s, transform .15s var(--_ease); }
      .bar button:active { transform: scale(.97); }
      /* The list and the chat: a header, a part that scrolls, and (the chat) a box at the bottom that doesn't. */
      .list { position: fixed; right: 16px; bottom: 66px; width: min(340px, calc(100vw - 32px)); max-height: min(60vh, 460px); overflow: hidden;
              display: flex; flex-direction: column; background: var(--_bg); color: var(--_fg); border-radius: var(--_radius); box-shadow: var(--_shadow); font-size: 13px; }
      .list .tabs { display: flex; flex-wrap: wrap; gap: 2px; flex: none; padding: 12px 8px 6px; }
      .list .items, .msgs { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
      .list .items { padding: 0 6px 6px; }
      .list .tabs button { border: 0; border-radius: var(--_r-s); padding: 4px 8px; white-space: nowrap; background: none; color: var(--_muted); cursor: pointer; font: inherit; }
      .list .tabs button.on { background: var(--_fg); color: var(--_bg); }
      .list .tabs .hold { margin-left: auto; }
      .list .it { display: block; width: 100%; text-align: left; border: 0; background: none; color: inherit; padding: 7px 8px; border-radius: var(--_r-s); cursor: pointer; font: inherit; }
      .list .it:hover, .list .it.cur { background: var(--_hover); }
      .list .it { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } /* one line per pin; the rest is in its thread */
      .list .it span, .list .none { color: var(--_muted); }
      .list .it .tag { display: inline-block; padding: 0 7px; border-radius: var(--_r-s); background: var(--_accent); color: var(--_accent-fg);
                       font-size: 11.5px; font-weight: 600; line-height: 18px; vertical-align: 1px; white-space: nowrap; }
      .list .none { padding: 8px; }
      /* Thin scrollbars inside the dialogs (chat, threads, the list), like macOS overlay ones, on a clear track. */
      * { scrollbar-width: thin; scrollbar-color: color-mix(in srgb, var(--_fg) 24%, transparent) transparent; }
      @supports not (scrollbar-width: thin) {
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: color-mix(in srgb, var(--_fg) 24%, transparent); border-radius: 999px; }
      }
      .list .group { font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--_muted); padding: 10px 8px 2px; }
      .pin.held { border: 1.5px dashed var(--_muted); opacity: .85; }
      /* Close: a round, quiet button with a drawn cross (not the ✕ character), darker on hover. */
      .list .tabs .show-done { color: var(--_muted); }
      .chatwin .tabs b { display: none; } /* no "chat" title: the window speaks for itself */
      .list .tabs .x { margin-left: auto; flex: none; width: 26px; height: 26px; padding: 0; border-radius: 50%; display: grid; place-items: center;
                       font-size: 0; color: var(--_muted); background: transparent; }
      /* The cross is drawn with CSS: two thin bars, no picture. */
      .list .tabs .x::before, .list .tabs .x::after { content: ''; grid-area: 1 / 1; width: 12px; height: 1.6px; border-radius: 1px; background: currentColor; transform: rotate(45deg); }
      .list .tabs .x::after { transform: rotate(-45deg); }
      .list .tabs .x:hover { color: var(--_fg); } /* hover: the cross darkens, nothing drawn behind it */
      .list .tabs .x:focus-visible { outline: 2px solid var(--_accent); outline-offset: 1px; }
      .chatwin .chat { flex: none; background: var(--_bg); padding: 6px 6px 8px; }
      .chatwin .replying { flex: none; }
      .chatwin .chat .box { background: var(--_soft); }
      .chatwin .tabs b { padding: 4px 8px; font-weight: 600; margin-right: auto; }
      .msgs { display: flex; flex-direction: column; gap: 8px; padding: 4px 10px 8px; overflow-x: hidden; }
      .msgs > :first-child { margin-top: auto; } /* a short conversation sits by the box, like a chat */
      /* Something just sent eases in; the arrow flies off and comes back. */
      .fresh { animation: lab-rise .2s var(--_ease); }
      .send.sent .arr { animation: lab-fly .32s var(--_ease); }
      @keyframes lab-rise { from { opacity: 0; transform: translateY(6px); } }
      @keyframes lab-fly { 45% { transform: translateY(-9px); opacity: 0; } 46% { transform: translateY(7px); opacity: 0; } }
      .msg { max-width: 85%; padding: 7px 10px; border-radius: var(--_radius); background: var(--_soft); align-self: flex-start; }
      .msg.mine { align-self: flex-end; background: color-mix(in srgb, rgb(52, 199, 89) 15%, var(--_bg)); color: var(--_fg); } /* yours: soft green, dark text */
      .msg b { display: block; font-size: 11.5px; font-weight: 600; opacity: .7; margin-bottom: 1px; }
      .msg.mine b { display: none; }
      .msg { position: relative; } .mark { font-weight: 400; font-size: 11px; color: var(--_muted); margin-left: 6px; white-space: nowrap; } .mark.done { color: rgb(36, 160, 70); font-weight: 600; font-size: 12px; } /* a small green tick, as the ticks on messages */
      .msg .quote { display: block; border-left: 2px solid rgb(52, 199, 89); padding: 1px 0 1px 8px; margin: 3px 0 5px; font-size: 12.5px; line-height: 1.35;
                    color: var(--_muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; }
      .msg .quote b { display: block; font-size: 11.5px; font-weight: 600; color: rgb(36, 160, 70); opacity: 1; margin: 0; } .mine .mark { color: inherit; opacity: .7; } a.link { color: inherit; text-decoration: underline; text-underline-offset: 2px; overflow-wrap: anywhere; } .msg.to { box-shadow: 0 0 0 2px var(--_accent); }
      .msg::after { content: '↩'; position: absolute; right: -28px; top: 50%; translate: 0 -50%; color: var(--_fg); opacity: var(--lab-r, 0); scale: calc(.6 + .4 * var(--lab-r, 0)); }
      .msg .p { display: block; white-space: pre-wrap; overflow-wrap: anywhere; } .msg .p.gap { margin-top: 6px; }
      .msg .p.li { padding-left: 14px; text-indent: -14px; } .msg .p.li .mk { display: inline-block; width: 14px; text-indent: 0; opacity: .6; }
      .msg i { display: block; font-style: normal; font-size: 11.5px; opacity: .7; margin-bottom: 1px; }
      .msg b, .msg i { color: inherit; }
      .box:has(.trap) { position: relative; }
      .trap { position: absolute; top: 8px; left: 14px; width: 1px; height: 1px; opacity: 0; pointer-events: none; font-size: 16px; border: 0; padding: 0; }
      .msg .stamp { color: inherit; float: right; margin: 6px -2px -3px 10px; font-size: 11px; line-height: 1; opacity: .55; font-variant-numeric: tabular-nums; }
      .msg .tick { color: inherit; margin-left: 4px; letter-spacing: -.34em; font-size: 10px; } /* ✓ drawn as tall as the time's digits */
      .msg .tick.got { font-weight: 600; }
      .replying { display: flex; gap: 6px; align-items: center; font-size: 12.5px; color: var(--_muted); padding: 2px 6px; }
      .replying button { border: 0; background: none; color: inherit; cursor: pointer; margin-left: auto; font: inherit; }
      .bar button * { color: inherit; font-weight: inherit; }
      .bar .toggle:not(.secondary)::before { content: ''; width: 7px; height: 7px; border-radius: 50%; background: var(--_accent); }
      .bar button.secondary { color: var(--_muted); }
      .bar button.secondary.has-new { color: var(--_fg); font-weight: 600; }
      .bar button.go-btn.on { color: #fff; background: rgb(36, 160, 70); }
      .bar .new-prev, .bar .new-next { padding: 9px 11px; font-size: 15px; line-height: 1; color: var(--_fg); }
      .bar .list-btn, .bar .done-btn { font-variant-numeric: tabular-nums; min-width: 4.6em; justify-content: center; }
      .bar button.quiet { opacity: .45; cursor: default; box-shadow: var(--_shadow); }
      .bar button.go-btn.on kbd { background: rgba(255, 255, 255, .22); color: #fff !important; }
      .newline { display: flex; align-items: center; gap: 8px; font-size: 11.5px; font-weight: 600; color: var(--_accent); }
      .newline::before, .newline::after { content: ''; flex: 1; height: 1px; background: currentColor; opacity: .35; }
      /* The left side: who's listening, then copy link; the right side is the bar. */
      .left { position: fixed; left: 16px; bottom: 16px; display: flex; gap: 8px; align-items: center; }
      .left .copy-all { border: 0; border-radius: var(--_radius); padding: 9px 14px; cursor: pointer; background: var(--_bg); color: var(--_muted);
                        box-shadow: var(--_shadow); font: inherit; font-size: 13px; font-weight: 500; white-space: nowrap; }
      .listener { display: inline-flex; gap: 6px; align-items: center; padding: 9px 14px; border-radius: var(--_radius);
             background: var(--_bg); color: var(--_fg); box-shadow: var(--_shadow); font-size: 13px; text-decoration: none; white-space: nowrap; }
      .listener::before { content: ''; width: 7px; height: 7px; border-radius: 50%; background: var(--_accent); margin-right: 2px; }
      .listener span { color: var(--_muted); }
      .listener.idle::before { background: var(--_muted); opacity: .5; }
      /* Working: the dot turns green and sends out a soft ring, like a "live" light. */
      .listener.working::before { background: rgb(36, 160, 70); animation: lab-ping 1.6s cubic-bezier(0, 0, .2, 1) infinite; }
      @keyframes lab-ping { 0% { box-shadow: 0 0 0 0 rgba(52, 199, 89, .55); } 80%, 100% { box-shadow: 0 0 0 6px rgba(52, 199, 89, 0); } }
      @keyframes lab-blink { 50% { opacity: .2; } }
      .listener:not([data-copy=""])[data-copy] { cursor: copy; }
      kbd { font-size: 11px; line-height: 17px; min-width: 18px; padding: 0 4px; border-radius: var(--_r-s); text-align: center;
            background: var(--_soft); color: var(--_muted) !important; }
      .hint { position: fixed; left: 50%; bottom: 64px; transform: translateX(-50%); background: var(--_bg); color: var(--_muted);
              box-shadow: var(--_shadow); padding: 8px 14px; border-radius: var(--_radius); font-size: 13px; pointer-events: none; white-space: nowrap;
              letter-spacing: .005em; animation: lab-fade .2s ease-out; }
      /* 16px fields keep iOS from zooming the page when one is focused. */
      @media (pointer: coarse) { .box textarea, .who input { font-size: 16px; letter-spacing: -.006em; } kbd { display: none; } }
      @keyframes lab-fade { from { opacity: 0; } }
      /* Movement only: a page in the background can stall an animation, and a card stalled mid-fade showed the page through it. */
      @keyframes lab-in { from { transform: translateY(4px) scale(.98); } }
      @keyframes lab-sheet-in { from { transform: translateY(100%); } }
      @keyframes lab-sheet-out { to { transform: translateY(100%); } }
      @keyframes lab-fade { from { opacity: 0; } }
      @keyframes lab-out { to { opacity: 0; transform: translateY(2px) scale(.985); } }
      /* Continuous (Apple-style) corners where the browser draws them; plain rounding elsewhere. */
      /* Apple's continuous corners (squircle) where the browser draws them (Safari 26, Chrome): the same three sizes, a
         smooth curve instead of a circle arc (a squircle needs about 1.8 times the radius to look the same size).
         Circles and the pin's teardrop stay as they are. */
      @supports (corner-shape: squircle) {
        :host { --_radius: calc(var(--lab-radius, 12px) * 1.8); --_r-s: 11px; }
        *, *::before, *::after { corner-shape: squircle; }
        button.pin, .pin.working::before, .pin.new::after, .dot, .send, .list .tabs .x, .bar .toggle:not(.secondary)::before,
        .listener::before, .list-btn[data-agent]::before, .chat-btn[data-agent]::before { corner-shape: round; } /* circles stay circles */
      }
      @keyframes lab-pin { from { transform: scale(1.1); } }
      @keyframes lab-halo { from { box-shadow: 0 0 0 0 color-mix(in srgb, var(--_fg) 12%, transparent); }
                            to { box-shadow: 0 0 0 16px color-mix(in srgb, var(--_fg) 0%, transparent); } }
      @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
      @media (max-width: 480px) { kbd { display: none; } }
      .handle { display: none; }
      /* Phones: a thread or a new comment opens as a sheet from the bottom, full width, instead of beside the pin. */
      @media (pointer: coarse) and (max-width: 560px), (pointer: coarse) and (max-height: 500px) { /* phones, upright or on their side */
        /* Sheets fit what the screen shows (--lab-vh, the visible height, and --lab-kb, the keyboard over the page's
           bottom, are kept up to date from visualViewport); their bottom part is solid down past the screen's edge,
           behind the home bar, the keyboard and Safari's toolbar, so nothing of the page shows below the box. */
        :host { --_safe: env(safe-area-inset-bottom, 0px); --_kb: var(--lab-kb, 0px);
                --_sheet-max: calc(min(72dvh, var(--lab-vh, 100dvh) - 24px) + var(--_kb)); --_pb: calc(12px + var(--_safe) + var(--_kb)); }
        :host([data-kb]) { --_safe: 0px; --_kb: 0px; --_pb: 10px; }
        /* Keyboard up: a thread, the list and the chat fill exactly what the screen shows, like a native composer, so iOS
           panning the page can't push it up and nothing of the page shows above or below it. */
        :host([data-kb]) :is(.card, .list:not([hidden])) { top: var(--lab-top, 0px) !important; bottom: auto !important;
          height: var(--lab-vh, 100dvh) !important; max-height: none !important; border-radius: 0; }
        /* A new comment stays small, just above the keyboard, with the page (dimmed) above it: you see what you comment on. */
        :host([data-kb]) .float { top: auto !important; bottom: var(--lab-kb, 0px) !important; height: auto !important; border-radius: var(--_radius) var(--_radius) 0 0; }
        .card, .float { position: fixed; left: 0 !important; right: 0; top: auto !important; bottom: 0; width: auto; max-width: none;
                        max-height: var(--_sheet-max); display: flex; flex-direction: column; border-radius: var(--_radius) var(--_radius) 0 0; padding: 8px 0 0; z-index: 3; }
        .card::after, .float::after, .list::after { content: ''; position: absolute; left: 0; right: 0; top: 100%; height: 100vh; background: var(--_bg); }
        .card > .body { flex: 0 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 0 14px 4px; margin-right: 0; }
        .card > .foot, .float > .composer { flex: none; padding: 0 14px var(--_pb); }
        .card > .foot { margin-top: auto; }
        .card .composer { margin-top: 10px; }
        .card .nav { margin-top: 2px; gap: 20px; }
        .card .nav .btn { font-size: 14px; padding: 8px 0; } /* thumb-sized */
        .card .nav { flex-wrap: wrap; row-gap: 0; } /* too narrow for one row: reopen / delete drop under, on the right */
        .card .nav .acts { margin: 0 0 0 auto; gap: 20px; }
        .box.one .who span { font-size: 16px; } /* "as" the size of the name beside it */ /* reopen / delete share the prev / next row, on the right */
        .card .nav .acts button.btn { font-size: 14px; }
        .float { background: var(--_bg); box-shadow: var(--_shadow); }
        .float .box, .float .box:focus-within { background: var(--_soft); box-shadow: none; } /* the same box as a thread's and the chat's */
        /* The grab handle: the sheet's top strip, where a drag down moves it. The header of the list and the chat does the same. */
        /* 44 px to grab (iOS 44 pt, Android 48 dp), reaching 18 px above the sheet's edge; the bar and the layout stay as they were. */
        .handle { display: block; flex: none; height: 44px; margin-top: -26px; touch-action: none; position: relative;
                background: linear-gradient(color-mix(in srgb, var(--_fg) 18%, transparent) 0 0) center 26px / 36px 4px no-repeat; }
        .list .tabs { touch-action: pan-x; }
        .chatwin .tabs { touch-action: none; }
        .list .items, .msgs, .card > .body { touch-action: pan-y; }
        .list .tabs .x { display: none; } /* the handle, a swipe down or a tap on the dimmed page closes it */

        :host([data-sheet]) :is(.bar, .hint, .listener, .left) { visibility: hidden; }
        /* A sheet stands apart from the page: the page dims behind it (a tap there closes it), and scrolling inside a
           sheet never scrolls the page. */
        :host([data-sheet]) .scrim { display: block; animation: lab-fade .22s ease-out; }
        .card.in, .float.in, .list:not([hidden]) { animation: lab-sheet-in .28s cubic-bezier(.2, .8, .2, 1); }
        .card.out, .float.out { animation: lab-sheet-out .22s cubic-bezier(.4, 0, 1, 1) forwards; }
        .list { left: 0; right: 0; bottom: 0 !important; width: auto; max-height: var(--_sheet-max); overflow: visible; border-radius: var(--_radius) var(--_radius) 0 0;
                font-size: 15px; z-index: 3; }
        /* The chat keeps one height (new messages don't move its top) and opens at the newest. */
        .chatwin { height: var(--_sheet-max); transition: height .38s cubic-bezier(.32, .72, 0, 1); }
        /* Pulled up: the chat takes the whole screen, below the status bar (iOS large / Android expanded). */
        .chatwin.full { height: calc(var(--lab-vh, 100dvh) - env(safe-area-inset-top, 0px) - 10px + var(--_kb)); max-height: none; }
        /* The header is the sheet's top edge, grab handle drawn on it; the list scrolls below it, never under or above it. */
        .list .tabs { flex-wrap: nowrap; overflow-x: auto; padding: 18px 12px 8px; border-radius: var(--_radius) var(--_radius) 0 0;
                      background: linear-gradient(color-mix(in srgb, var(--_fg) 18%, transparent) 0 0) center 8px / 36px 4px no-repeat, var(--_bg); }
        .list .items { padding: 0 12px calc(10px + var(--_safe)); }
        .chatwin .msgs { padding: 4px 12px 8px; }
        .chatwin .tabs { padding: 18px 12px 0; } /* just the grab strip, as tall as a thread's */
        .chatwin .chat { padding: 6px 12px var(--_pb); }
        .list .it { padding: 11px 8px; }
        /* The bar wraps instead of running off the screen's left edge. */
        .bar { left: 16px; flex-wrap: wrap-reverse; justify-content: flex-end; pointer-events: none; }
        .bar button { pointer-events: auto; }
      }
      /* Reaches past the screen's edges, under Safari's status bar and toolbar, so the page is dimmed everywhere. */
      .scrim { cursor: pointer; display: none; position: fixed; inset: -50vh 0; background: rgba(0, 0, 0, .4); z-index: 2; touch-action: none; }
      .sel-chip { position: fixed; transform: translateX(-50%); border: 0; border-radius: var(--_radius); padding: 8px 14px; background: var(--_fg);
                  color: var(--_bg); font: 500 14px/1 var(--_font, inherit); box-shadow: var(--_shadow); z-index: 4; }
      /* Phones: the listening label is a light in the "list" button (steady: listening, blinking: working, grey:
         nobody), the bar goes back to the bottom, and the send button is big enough for a thumb. */
      @media (pointer: coarse) and (max-width: 560px), (pointer: coarse) and (max-height: 500px) { /* phones, upright or on their side */
        .listener { display: none !important; }
        .bar { bottom: 16px !important; }
        .hint { bottom: 64px !important; }
        .chat-btn[data-agent]::before, .list-btn[data-agent]::before { content: ''; display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; vertical-align: 1px; background: var(--_accent); }
        .chat-btn[data-agent=away]::before, .list-btn[data-agent=away]::before { background: var(--_muted); opacity: .5; }
        .chat-btn[data-agent=working]::before, .list-btn[data-agent=working]::before { background: rgb(36, 160, 70); animation: lab-ping 1.6s cubic-bezier(0, 0, .2, 1) infinite; }
        .send { width: 36px; height: 36px; }
        .send .arr { height: 16px; margin: auto; } .send .arr::before, .send .arr::after { height: 9px; }
      }
      /* Narrow screens: the buttons sit a row above the listening label, so neither covers the other. */
      @media (max-width: 560px) { .bar { bottom: 64px; } .hint { bottom: 112px; } .list { bottom: 114px; } }
      [hidden] { display: none !important; }
    </style>
    <div class="scrim"></div>
    <div class="layer"></div>
    <button class="sel-chip" type="button" hidden>Comment</button>
    <div class="hint" hidden>click to comment · drag to mark an area · shift-drag to quote words · c chat · n new · v for go · m to hide</div>
    <div class="list" hidden><div class="tabs"><button type="button" data-f="new">new</button><button type="button" data-f="open">open</button><button type="button" data-f="work">work</button><button type="button" data-f="resolved">resolved</button><button type="button" data-f="mine">mine</button><button type="button" class="show-done" title="show or hide done pins on the page"></button><button type="button" class="hold" title="new pins wait here as drafts; send them together">draft mode</button><button type="button" class="x" aria-label="close">✕</button></div><div class="items"></div></div>
    <div class="list chatwin" hidden><div class="tabs"><b>chat</b></div><div class="msgs"></div><div class="replying" hidden></div><div class="chat"></div></div>
    <div class="left"><button class="secondary copy-all" type="button" hidden>copy link</button></div>
    <div class="bar">
      <button class="secondary send-all" type="button" hidden></button>
      <button class="secondary chat-btn" type="button" hidden title="chat (C)">chat</button>
      <button class="secondary new-prev" type="button" hidden aria-label="previous new comment">‹</button>
      <button class="secondary list-btn" type="button" hidden>list</button>
      <button class="secondary new-next" type="button" hidden aria-label="next new comment">›</button>
      <button class="secondary done-btn" type="button" hidden title="show or hide done pins on the page"></button>
      <button class="secondary go-btn" type="button" hidden title="go mode: every click approves what it's on, no typing (V)">go</button>
      <button class="toggle" type="button"></button>
    </div>`;
  const layer = root.querySelector('.layer');
  const hint = root.querySelector('.hint');
  if (matchMedia('(pointer: coarse)').matches) hint.textContent = 'hold to comment';
  const toggleBtn = root.querySelector('.toggle');
  const copyBtn = root.querySelector('.copy-all');
  // The comments list (new / open / resolved / mine; J/K step, R reply, E resolve, L shows it), and drafts: with
  // "drafts" on, new pins wait in this browser until "send 3 drafts", so nothing starts on pin 1 of 10.
  const listBtn = root.querySelector('.list-btn');
  const goBtn = root.querySelector('.go-btn');
  const newPrev = root.querySelector('.new-prev');
  const showDoneBtn = root.querySelector('.show-done');
  const doneBtn = root.querySelector('.done-btn');
  // The list window is parked (Leo, 2026-11-15): new comments are stepped through with ‹ N new › in the bar, and
  // done pins are shown or hidden with a pill there. Its code stays; LIST_WINDOW brings it back.
  const LIST_WINDOW = false;
  const tabTitle = { base: '' };
  let showDone = store.get('lab-show-done') === '1';
  const newNext = root.querySelector('.new-next');
  const sendBtn = root.querySelector('.send-all');
  const listEl = root.querySelector('.list');
  const holdBtn = listEl.querySelector('.hold');
  const chatEl = root.querySelector('.chatwin');
  const chatBtn = root.querySelector('.chat-btn');
  let listOpen = false;
  let filter = 'open';
  let refit = () => {}; // phones: fit the sheets to the keyboard again (below)
  let chatOpen = false;

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
      eh: Math.round(rect.height), // its height then: a pin on a big container can tell if the page grew under it
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
      // Its words start here (a quote from a selection can run on into the next items); spaces don't count.
      if (anchor.quote?.exact) return (n.textContent || '').replace(/\s+/g, '').includes(anchor.quote.exact.replace(/\s+/g, '').slice(0, 24));
      return true;
    };
    const said = short(anchor.text, 400);
    const saysSame = (n) => !said || anchor.quote?.exact || short(n.textContent, 400).startsWith(said.slice(0, 40));
    const atPath = node && node !== document.body && matches(node) ? node : null;
    if (atPath && saysSame(atPath)) return atPath;
    if (anchor.file && /^(image|video)$/.test(anchor.kind)) {
      return [...document.querySelectorAll('img, video')].find((m) => fileHint(mediaSrc(m)) === anchor.file) || null;
    }
    // The page changed above it (a section added, a list reordered) and the path no longer leads there: look for the
    // same element by what it is and what it says. Among elements with the same tag and classes, the best one has the
    // same words (or the quote), sits under the same heading, and is nearest to where the pin was; a lone exact twin
    // counts too. So the pin lands back on its element, at the same spot inside it, instead of where the page was.
    const tag = /^<([\w-]+)/.exec(anchor.element || '')?.[1];
    if (!tag || tag === 'body' || tag === 'html') return atPath;
    const flat = (t) => short(t, 400);
    const sectionOf = (n) => {
      let heading = null;
      for (const h of document.querySelectorAll('h1, h2, h3')) if (h.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING || h.contains(n)) heading = h;
      return heading ? short(heading.textContent, 100) : '';
    };
    let found = null;
    let best = -1;
    let near = Infinity;
    const twins = [...document.querySelectorAll(tag)].slice(0, 400).filter((n) => !host.contains(n) && openingTag(n) === anchor.element);
    for (const n of twins) {
      const t = flat(n.textContent);
      let score = 0;
      if (anchor.quote?.exact && matches(n)) score += 4;
      if (said && t === said) score += 4;
      else if (said && t.startsWith(said.slice(0, 40))) score += 2;
      if (anchor.section && sectionOf(n) === anchor.section) score += 2;
      if (!score && twins.length > 1) continue;
      const d = Math.abs(n.getBoundingClientRect().top + scrollY - (anchor.docY || 0));
      if (score > best || (score === best && d < near)) [found, best, near] = [n, score, d];
    }
    // Nothing better found (the words were edited, say): the element at the old path, if it's still the same kind.
    return best > 0 || !atPath ? found : atPath;
  }

  // Pin point (the zone's top-left corner for area comments) and, for areas, the zone box, in page coordinates.
  // A pin on a big container (the page's body or main) is placed by a share of its size, which drifts when content is
  // added above. If it was on a word ("…before [word] after…"), find that word again and sit on it; if the word is gone,
  // say so (the pin shows faded as moved) instead of pointing at whatever is there now.
  function wordSpot(anchor) {
    const m = /^(?:…)?(.*?)\[([^\]]+)\](.*?)(?:…)?$/s.exec(anchor.text || '');
    if (!m) return null;
    const before = m[1].replace(/\s+/g, ' ').slice(-24);
    const word = m[2];
    // The page's text, read once per moment and shared by all such pins.
    if (!wordSpot.cache || performance.now() - wordSpot.cache.at > 400) {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: (t) => (host.contains(t.parentNode) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
      let text = '';
      const at = [];
      for (let t; (t = walker.nextNode()); ) {
        const v = t.data.replace(/\s+/g, ' ');
        for (let i = 0; i < v.length; i++) at.push([t, i]);
        text += v;
      }
      wordSpot.cache = { at: performance.now(), text, map: at };
    }
    const { text, map: at } = wordSpot.cache;
    let i = text.indexOf(before + word);
    if (i < 0) return { gone: true };
    i += before.length;
    const range = document.createRange();
    try {
      range.setStart(...at[i]);
      range.setEnd(at[i + word.length - 1][0], at[i + word.length - 1][1] + 1);
    } catch {
      return { gone: true };
    }
    const r = range.getBoundingClientRect();
    return r.width || r.height ? { left: r.left + scrollX + Math.min(6, r.width / 2), top: r.top + scrollY + r.height / 2 } : { gone: true };
  }
  function position(anchor) {
    const node = findTarget(anchor);
    if (node && !anchor.zw && !anchor.docW && /^(html|body|main)$/.test(node.localName) && /\[[^\]]+\]/.test(anchor.text || '')) {
      const spot = wordSpot(anchor);
      if (spot && !spot.gone) return { left: spot.left, top: spot.top, zone: null };
      if (spot?.gone) return { left: anchor.docX * docWidth(), top: anchor.docY, zone: null, moved: true };
    }
    // On a big container with no word to find: if the container's height changed since, the share of it no longer points
    // at the same thing, so the pin keeps its old place and shows faded as moved rather than pointing at something else.
    if (node && anchor.eh && !anchor.zw && !anchor.docW && /^(html|body|main)$/.test(node.localName) && !/\[[^\]]+\]/.test(anchor.text || '')) {
      if (Math.abs(node.getBoundingClientRect().height - anchor.eh) > 40) return { left: anchor.docX * docWidth(), top: anchor.docY, zone: null, moved: true };
    }
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
  // The words are matched with spaces left out, across text pieces, so a quote that runs over several items (Shift +
  // select) is found too; the search widens from the pinned element to the few boxes around it.
  function quoteRange(anchor) {
    const q = anchor?.quote;
    let node = q?.exact ? findTarget(anchor) : null;
    if (!node) return null;
    const want = q.exact.replace(/\s+/g, '');
    const tail = (q.prefix || '').replace(/\s+/g, '').slice(-12);
    for (let up = 0; node && up < 4; node = node.parentElement, up++) {
      let text = '';
      const at = []; // for each letter of text: its text piece and place in it
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      for (let t; (t = walker.nextNode()); )
        for (let i = 0; i < t.data.length; i++) if (!/\s/.test(t.data[i])) (text += t.data[i]), at.push([t, i]);
      let first = null;
      for (let i = text.indexOf(want); i !== -1; i = text.indexOf(want, i + 1)) {
        const range = document.createRange();
        range.setStart(...at[i]);
        const [end, k] = at[i + want.length - 1];
        range.setEnd(end, k + 1);
        if (!tail || text.slice(0, i).endsWith(tail)) return range;
        first ||= range;
      }
      if (first) return first;
    }
    return null;
  }
  // A message's name with its small marks: ↩ replied, ✅ done.
  // A message's name with its small mark: a green ✓ when done. An agent's session id ("Claude · session 8a296ba1") is left off.
  const nameLine = (name, done) => {
    const b = el('b', {}, String(name || '').replace(/\s*·\s*session\s+\S+$/i, ''));
    if (done) b.append(el('span', { class: 'mark done', 'aria-label': 'done' }, '✓'));
    return b;
  };
  // Draft mode is parked for now (Leo, 2026-11-15): its button is hidden and new pins post at once.
  const DRAFT_MODE = false;
  const drafting = () => DRAFT_MODE && store.get('lab-hold') === '1';
  // Messages show web addresses as links that open in a new tab.
  const linked = (text) => {
    const out = [];
    let at = 0;
    for (const m of text.matchAll(/\bhttps?:\/\/[^\s<>"']*[^\s<>"'.,;:!?)\]]/g)) {
      if (m.index > at) out.push(document.createTextNode(text.slice(at, m.index)));
      const a = el('a', { href: m[0], target: '_blank', rel: 'noopener noreferrer', class: 'link' }, m[0]);
      a.addEventListener('click', (e) => e.stopPropagation());
      out.push(a);
      at = m.index + m[0].length;
    }
    if (at < text.length) out.push(document.createTextNode(text.slice(at)));
    return out;
  };
  // Messages read in short blocks: a blank line starts a new paragraph, "- " or "1. " lines are a list, and one long
  // paragraph (as agents tend to write) is broken after every second sentence, so a small window isn't a wall of text.
  const sentences = (t) => t.split(/(?<=[.!?])\s+(?=["'(\[]?[A-Z0-9])/);
  const readable = (text) => {
    const blocks = [];
    for (const [n, para] of String(text || '').trim().split(/\n\s*\n/).entries()) {
      const lines = para.split('\n');
      if (lines.length === 1 && para.length > 240) { // one long paragraph: two sentences a block
        const ss = sentences(para);
        for (let i = 0; i < ss.length; i += 2) blocks.push({ text: ss.slice(i, i + 2).join(' '), gap: n > 0 || i > 0 });
        continue;
      }
      lines.forEach((line, i) => {
        const item = /^\s*(?:[-•*]|\d+[.)])\s+/.exec(line);
        const prev = i > 0 ? blocks.at(-1) : null;
        if (item) blocks.push({ li: /\d/.test(item[0]) ? item[0].trim() : '•', text: line.slice(item[0].length), gap: n > 0 && i === 0 });
        else if (prev && !prev.li) prev.text += `\n${line}`;
        else blocks.push({ text: line, gap: (n > 0 && i === 0) || Boolean(prev) });
      });
    }
    return blocks.map((b) => {
      const node = el('span', { class: `p${b.li ? ' li' : ''}${b.gap ? ' gap' : ''}` });
      if (b.li) node.append(el('span', { class: 'mk' }, b.li));
      node.append(...linked(b.text));
      return node;
    });
  };
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
    return z;
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
    // The middle of an area often lands on one word (a caption under a picture): that word is not what the area is
    // on, so no quote (it lit up green as if it alone was picked); the area's words are in zoneText below.
    if (anchor.kind === 'text') {
      delete anchor.quote;
      anchor.kind = 'element';
    }
    const boxText = box === document.body ? '' : short(box.textContent, 200);
    if (boxText && (box.textContent || '').length < 400) anchor.text = short(boxText, 80);
    else delete anchor.text;
    if (box !== document.body) anchor.looks = looksOf(box);
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
        return short([openingTag(el), t && `"${t}"`, c.component, c.source && `written at ${c.source}`, c.usedAt && `used at ${c.usedAt}`].filter(Boolean).join(' · '), 500);
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
    // Someone is in a box: the open thread gets its new replies in place, the chat its new messages (its box is left
    // alone); everything else shows on the next render.
    else {
      if (openCard?.isConnected) openCard.sync();
      if (chatOpen) drawChat();
    }
  }

  // Go mode (V): every new spot (a click, a drawn area, selected words, a hold on phones) is posted at once as "go",
  // approving what it's on, with no box to type in. In draft mode go pins wait with the other drafts.
  let goMode = store.get('lab-go') === '1';
  // Switching only changes the button and the pointer: nothing on the page is redrawn, so nothing flickers.
  const setGo = (v) => {
    goMode = v;
    store.set('lab-go', v ? '1' : '');
    goBtn.classList.toggle('on', v);
    goBtn.setAttribute('aria-pressed', String(v));
    document.documentElement.classList.toggle('lab-go', on && v);
    ptr.classList.toggle('go', v); // the drawn pointer turns at once, without waiting for the mouse to move
    recheck();
  };
  function begin(anchor) {
    const name = store.get('lab-name').trim();
    if (!goMode || !name) {
      draft = { anchor };
      return render();
    }
    if (drafting()) {
      store.set(heldKey(), JSON.stringify([...held(), { name, text: 'go', anchor }]));
      return render();
    }
    send({ name, text: 'go', anchor })
      .then(({ comment, edit }) => {
        if (edit) store.set(`lab-edit:${comment.id}`, edit);
        comments.push(comment);
        markSeen([comment]);
        posted = comment.id;
        render();
      })
      .catch(() => ((draft = { anchor }), render())); // couldn't post: the usual box, so nothing is lost
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
    // "copied" for a moment in the same box: the button keeps its width, so nothing beside it moves.
    const label = button.textContent;
    button.style.width = `${button.getBoundingClientRect().width}px`;
    button.style.justifyContent = 'center';
    button.textContent = 'copied';
    setTimeout(() => {
      button.textContent = label;
      button.style.width = button.style.justifyContent = '';
    }, 1400);
  }

  // ---------- render ----------
  const threads = () => comments.filter((c) => !c.parent && (isAdmin || !c.resolved));
  const heldKey = () => `lab-held:${page}`;
  const held = () => {
    try {
      return JSON.parse(store.get(heldKey()) || '[]');
    } catch {
      return [];
    }
  };
  // Being worked on: handed to the agent and not answered or resolved since (a comment, a chat message).
  const listed = () =>
    threads()
      .filter((c) => c.anchor?.kind !== 'page')
      .filter((c) => (filter === 'new' ? unread(c).length : filter === 'open' ? !c.resolved : filter === 'resolved' ? c.resolved : mine(c)))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  // What a comment is on, in a few words, so the list reads without the page: the quoted words, else the text of the
  // pinned element or, when that says too little ("4", an icon), of the nearest box around it; else its section.
  const onWhat = (c) => {
    const a = c.anchor || {};
    let w = a.quote?.exact || '';
    let n = null;
    try {
      n = !w && a.selector ? document.querySelector(a.selector) : null;
    } catch {}
    for (let up = 0; n && n !== document.body && up < 5; n = n.parentElement, up++) {
      const t = n.innerText?.replace(/\s+/g, ' ').trim() || '';
      if (t.length >= 12) {
        w = t;
        break;
      }
    }
    w = (w || a.text || a.section || '').replace(/\s+/g, ' ').trim();
    return w ? `"${w.length > 40 ? `${w.slice(0, 39)}…` : w}"` : '';
  };
  const isPage = (c) => c.anchor?.kind === 'page'; // about the page as a whole: no pin; it lives in the chat
  // prev / next / J / K: the thread swaps in place, no slide; the keyboard stays as it was (up stays up, down stays down).
  let stepping = false;
  let keepKeys = false;
  const goTo = (c, keys = false) => {
    stepping = Boolean(openId);
    keepKeys = stepping && (keys || root.activeElement?.localName === 'textarea');
    openId = c.id;
    draft = null;
    if (coarse) listOpen = false;
    render();
    // The pin comes into view: on phones in the middle of what the sheet leaves free above it; on a computer the pin
    // and its open card together, in the middle of the window when they fit, else from the pin down.
    const pinTop = position(c.anchor || {}).top;
    let top = pinTop - Math.max(40, coarse && openCard?.isConnected ? (innerHeight - openCard.offsetHeight) / 2 : innerHeight / 3);
    if (!coarse && openCard?.isConnected) {
      const bottom = openCard.getBoundingClientRect().bottom + scrollY;
      const tall = bottom - pinTop + 28;
      top = tall <= innerHeight - 80 ? pinTop - 28 - (innerHeight - tall) / 2 : pinTop - 40;
    }
    scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  };
  // Done: resolved, fixed by the quick model, or answered "Done: …" by someone other than its author (the agent).
  const isDone = (c) => c.resolved || c.quick === 'done' || repliesOf(c.id).some((r) => r.name !== c.name && /^done\b/i.test(r.text));
  function drawList() {
    const all = threads();
    listBtn.hidden = !on || (!coarse && !all.length && !held().length); // on phones it carries the agent's light
    goBtn.hidden = !on;
    if (!goBtn.firstElementChild) goBtn.replaceChildren(document.createTextNode('go'), el('kbd', {}, 'v'));
    goBtn.classList.toggle('on', goMode);
    goBtn.setAttribute('aria-pressed', String(goMode));
    const freshAll = all.filter((c) => !isPage(c)).reduce((n, c) => n + unread(c).length, 0); // a new message in a done thread counts too
    listBtn.replaceChildren(document.createTextNode(freshAll ? `list · ${freshAll} new` : 'list'), el('kbd', {}, 'l'));
    // ‹ › around it step through the new ones, top to bottom of the page, without opening the list.
    newPrev.hidden = newNext.hidden = !on || !all.some((c) => !isPage(c) && unread(c).length);
    if (!LIST_WINDOW) {
      // Without the list window the middle shows how many are new (a click goes to the next one). The pills keep their
      // place whatever the counts: with nothing new or done they stay, quiet and disabled, so nothing in the bar moves.
      newPrev.hidden = newNext.hidden = true; // no arrows: the pill itself goes to the next new one (J / K step both ways)
      listBtn.hidden = !on;
      listBtn.replaceChildren(document.createTextNode(`${freshAll} new`), el('kbd', {}, 'n'));
      listBtn.title = 'next new comment: N, or Control-N while typing (Shift for the one before)';
      listBtn.disabled = !freshAll;
      listBtn.classList.toggle('quiet', !freshAll);
      const doneCount = all.filter((c) => !isPage(c) && (c.resolved || workState(c)[0] === 'done') && !unread(c).length).length;
      doneBtn.hidden = !on;
      doneBtn.disabled = !doneCount && !showDone;
      doneBtn.classList.toggle('quiet', doneBtn.disabled);
      doneBtn.textContent = showDone ? `hide done · ${doneCount}` : `show done · ${doneCount}`;
    }
    // The browser tab shows how many new messages there are, as "(3) Page title".
    const tabNew = all.reduce((n, c) => n + unread(c).length, 0);
    if (!tabTitle.base || !document.title.startsWith('(')) tabTitle.base = document.title.replace(/^\(\d+\) /, '');
    const want = tabNew ? `(${tabNew}) ${tabTitle.base}` : tabTitle.base;
    if (document.title !== want) document.title = want;
    listBtn.classList.toggle('has-new', freshAll > 0);
    const h = held().length;
    sendBtn.hidden = !h;
    sendBtn.textContent = `send ${h} draft${h === 1 ? '' : 's'}`;
    listEl.hidden = !on || !listOpen;
    if (listEl.hidden) return;
    for (const b of listEl.querySelectorAll('[data-f]')) b.classList.toggle('on', b.dataset.f === filter);
    const fresh = all.filter((c) => !isPage(c) && unread(c).length).length; // chat messages count in the chat
    listEl.querySelector('[data-f="new"]').textContent = fresh ? `new · ${fresh}` : 'new';
    // Just new and open for now; work, resolved, mine and draft mode stay in the code, hidden.
    for (const f of ['work', 'resolved', 'mine']) listEl.querySelector(`[data-f="${f}"]`).hidden = true;
    holdBtn.hidden = !DRAFT_MODE;
    const doneCount = all.filter((c) => !isPage(c) && (c.resolved || workState(c)[0] === 'done') && !unread(c).length).length;
    showDoneBtn.hidden = !doneCount;
    showDoneBtn.textContent = showDone ? `hide done · ${doneCount}` : `show done · ${doneCount}`;
    holdBtn.classList.toggle('on', drafting());
    if (filter === 'work') return listEl.querySelector('.items').replaceChildren(...workItems());
    const items = listed().map((c) => {
      const b = el('button', { class: `it${openId === c.id ? ' cur' : ''}`, type: 'button' });
      b.append(document.createTextNode(`${c.resolved ? '✓' : numberOf(c)}  ${c.text.replace(/\s+/g, ' ').slice(0, 70)} `), ...(onWhat(c) ? [el('span', {}, `on ${onWhat(c)} `)] : []), el('span', {}, `· ${c.name}${c.quick === 'done' ? ' · done by quick' : !c.resolved && isDone(c) ? ' · ✅ done' : ''}`), ...(unread(c).length ? [' ', el('span', { class: 'tag' }, `${unread(c).length} new`)] : []));
      b.addEventListener('click', () => goTo(c));
      return b;
    });
    listEl.querySelector('.items').replaceChildren(...(items.length ? items : [el('div', { class: 'none' }, 'nothing here')]));
  }
  // The work tab: what the agent is on now (handed to it, not answered yet, or answered "On it"), what's next (sent,
  // not handed yet) and what's done today (resolved, or answered "Done"), from what the lab records on each thread.
  const ago = (iso) => {
    const m = Math.max(0, Math.round((Date.now() - new Date(iso)) / 60000));
    return m < 1 ? 'just now' : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
  };
  // A thread's state for the agent: ['now' | 'next' | 'done' | null, since when].
  const workState = (c) => {
    const thread = [c, ...repliesOf(c.id)];
    const lastPerson = thread.filter((m) => !m.session).map((m) => m.createdAt).sort().at(-1) || '';
    const answer = thread.filter((m) => m.session).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).at(-1);
    const answered = answer && answer.createdAt > lastPerson;
    if (c.resolved || c.quick === 'done' || (answered && /^done\b/i.test(answer.text))) return ['done', answered ? answer.createdAt : c.createdAt];
    if (answered && /^on it\b/i.test(answer.text)) return ['now', answer.createdAt];
    if (!answered && c.handedAt && c.handedAt >= lastPerson) return ['now', c.handedAt];
    return answered ? [null, ''] : ['next', lastPerson];
  };
  function workItems() {
    const today = new Date().toDateString();
    const now = [];
    const next = [];
    const done = [];
    for (const c of comments.filter((x) => !x.parent)) {
      const [state, at] = workState(c);
      if (state === 'now') now.push([c, at]);
      else if (state === 'next') next.push([c, at]);
      else if (state === 'done' && new Date(at).toDateString() === today) done.push([c, at]);
    }
    const row = ([c, at], when) => {
      const b = el('button', { class: `it${openId === c.id ? ' cur' : ''}`, type: 'button' });
      b.append(document.createTextNode(`${isPage(c) ? 'chat' : c.resolved ? '✓' : numberOf(c)}  ${c.text.replace(/\s+/g, ' ').slice(0, 70)} `), el('span', {}, `· ${when(at)}`));
      b.addEventListener('click', () => (isPage(c) ? ((chatOpen = true), (listOpen = false), render()) : goTo(c)));
      return b;
    };
    const part = (title, list, when, newest = false) =>
      list.length ? [el('div', { class: 'group' }, `${title} · ${list.length}`), ...list.sort((a, b) => (newest ? -1 : 1) * a[1].localeCompare(b[1])).map((x) => row(x, when))] : [];
    const out = [
      ...part('Now', now, (at) => `on it ${ago(at)}`.replace('on it just now', 'just started')),
      ...part('Next', next, (at) => `sent ${ago(at)} ago`.replace('just now ago', 'just now')),
      ...part('Done today', done, (at) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), true),
    ];
    return out.length ? out : [el('div', { class: 'none' }, 'nothing in progress on this page')];
  }
  // The chat: the page's whole conversation in time order (messages about the page as a whole, pins and every reply;
  // a pin's say what they're on). New messages are about the page; on phones swipe one to answer it instead.
  // The time in a bubble's corner, as in messengers (no hover tooltip over the text), and on yours ✓ sent, ✓✓ handed to
  // the agent (its thread went to the agent at or after you wrote it). Chat and threads alike.
  const stampOf = (m, root, prefix = '') => {
    const at = new Date(m.createdAt);
    const time = at.toDateString() === new Date().toDateString() ? at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : at.toLocaleDateString([], { day: 'numeric', month: 'short' });
    const stamp = el('span', { class: 'stamp' }, prefix + time);
    if (mine(m) && !m.session) {
      const got = root?.handedAt && root.handedAt >= m.createdAt;
      stamp.append(el('span', { class: `tick${got ? ' got' : ''}`, 'aria-label': got ? 'delivered to the agent' : 'sent' }, got ? '✓✓' : '✓'));
    }
    return stamp;
  };
  let replyTo = null;
  let newFrom = null;
  function drawChat() {
    const byId = new Map(comments.map((c) => [c.id, c]));
    // Only the chat's own messages (about the page as a whole) and the replies to them: pins live on the page and in the list.
    const msgs = comments
      .filter((c) => isPage(c) || (c.parent && isPage(byId.get(c.parent) || {})))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(-150);
    if (on && chatOpen && chatEl.hidden) newFrom = msgs.find(isNew)?.id || null; // opening: a "new" line above the first unread
    if (!chatOpen) newFrom = null;
    if (on && chatOpen) markSeen(msgs.filter(isNew)); // open: what's there is read
    const fresh = msgs.filter(isNew).length;
    chatBtn.hidden = !on;
    chatBtn.replaceChildren(document.createTextNode(fresh ? `chat · ${fresh} new` : 'chat'), el('kbd', {}, 'c'));
    chatBtn.classList.toggle('has-new', fresh > 0);
    const opening = chatEl.hidden;
    chatEl.hidden = !on || !chatOpen;
    if (chatEl.hidden) chatEl.classList.remove('full'); // opens at its lower height again
    if (chatEl.hidden && chatEl.contains(root.activeElement)) root.activeElement.blur(); // a closed chat keeps no focus, so keys work again
    if (chatEl.hidden) return;
    const box = chatEl.querySelector('.msgs');
    // Opens at the newest; later it follows new messages only while you're at the bottom, not while you read back.
    const atEnd = opening || box.scrollHeight - box.scrollTop - box.clientHeight < 48;
    const before = new Set(opening ? [] : [...box.children].map((n) => n.dataset.id));
    box.replaceChildren(...msgs.flatMap((m) => {
      const root = m.parent ? byId.get(m.parent) : m;
      const b = el('div', { class: `msg${mine(m) && !m.session ? ' mine' : ''}${root && replyTo === root.id ? ' to' : ''}${before.size && !before.has(m.id) ? ' fresh' : ''}`, 'data-id': m.id });
      // The done mark sits beside the name, not in the words.
      // Done (the thread is resolved, or the message says it made the change): ✅ beside the reply mark.
      const isDone = Boolean(root?.resolved || /^done\b/i.test(m.text));
      b.append(nameLine(m.name, isDone));
      // A reply shows what it answers, as in Telegram: the name and the start of that message; a tap there jumps to it.
      if (m.parent && root) {
        const q = el('div', { class: 'quote' });
        q.append(el('b', {}, String(root.name || '').replace(/\s*·\s*session\s+\S+$/i, '')), document.createTextNode(root.text.replace(/\s+/g, ' ').slice(0, 90)));
        q.addEventListener('click', (e) => {
          e.stopPropagation();
          const box = chatEl.querySelector('.msgs');
          const to = box.querySelector(`[data-id="${root.id}"]`);
          if (!to) return;
          box.scrollTo({ top: to.offsetTop - box.offsetTop - 12, behavior: 'smooth' });
          to.animate?.([{ boxShadow: '0 0 0 2px rgb(52,199,89)' }, { boxShadow: '0 0 0 0 transparent' }], { duration: 900 });
        });
        b.append(q);
      }
      b.append(...readable(m.text));
      b.append(stampOf(m, root));
      const answer = () => {
        replyTo = root ? root.id : null;
        drawChat();
        chatEl.querySelector('.chat textarea')?.focus({ preventScroll: true });
      };
      swipeToAnswer(b, answer); // phones: swipe one to answer it; no tap or click
      return m.id === newFrom && m !== msgs[0] ? [el('div', { class: 'newline' }, 'new'), b] : [b];
    }));
    const strip = chatEl.querySelector('.replying');
    const target = replyTo && byId.get(replyTo);
    strip.hidden = !target;
    if (target) {
      const x = el('button', { type: 'button', title: 'about the page instead' }, '✕');
      x.addEventListener('click', () => ((replyTo = null), drawChat()));
      strip.replaceChildren(document.createTextNode(`↩ ${target.name}: ${target.text.replace(/\s+/g, ' ').slice(0, 40)}`), x);
    }
    if (!box.firstChild) box.append(el('div', { class: 'none' }, 'say something about the page as a whole'));
    const chat = chatEl.querySelector('.chat');
    if (!chat.firstChild)
      chat.append(
        composer({
          placeholder: 'message',
          onSubmit: async (name, text) => {
            const { comment } = await send(
              replyTo ? { name, text, parent: replyTo } : { name, text, anchor: { kind: 'page', width: innerWidth, height: innerHeight, dpr: devicePixelRatio || 1 } },
            );
            const answered = replyTo && comments.find((x) => x.id === replyTo);
            if (answered?.resolved) answered.resolved = false; // writing in a done thread reopens it
            replyTo = null;
            comments.push(comment);
            markSeen([comment]);
            box.scrollTop = box.scrollHeight;
            render();
            return { keep: true }; // the same box stays, with the cursor in it: the phone's keyboard stays up
          },
        }),
      );
    chat.querySelector('textarea').placeholder = target ? 'reply' : msgs.length && coarse ? 'message · swipe one to reply' : 'message';
    if (atEnd) box.scrollTop = box.scrollHeight;
  }
  // Phones: swipe a message left to answer it, as in messengers: it follows the finger, ↩ shows, and past 56 px a tick
  // of the phone says letting go answers it. Up and down stays the chat's scrolling.
  function swipeToAnswer(b, answer) {
    if (!coarse) return;
    let x0 = 0;
    let y0 = 0;
    let dx = 0;
    let mode = null;
    b.addEventListener('touchstart', (e) => {
      x0 = e.touches[0].clientX;
      y0 = e.touches[0].clientY;
      dx = 0;
      mode = e.touches.length > 1 ? 'off' : null;
    }, { passive: true });
    b.addEventListener('touchmove', (e) => {
      const t = e.touches[0];
      const ax = t.clientX - x0;
      const ay = t.clientY - y0;
      if (!mode) {
        if (Math.abs(ax) < 6 && Math.abs(ay) < 6) return;
        mode = ax < 0 && Math.abs(ax) > Math.abs(ay) * 1.5 ? 'answer' : 'off';
      }
      if (mode !== 'answer') return;
      const was = dx;
      dx = Math.max(-80, Math.min(0, ax));
      if (dx <= -56 && was > -56) navigator.vibrate?.(8);
      b.style.transition = 'none';
      b.style.transform = `translateX(${dx}px)`;
      b.style.setProperty('--lab-r', String(Math.min(1, -dx / 56)));
    }, { passive: true });
    const end = () => {
      if (mode === 'answer' && dx <= -56) answer();
      mode = null;
      b.style.transition = 'transform 300ms cubic-bezier(.32,.72,0,1)';
      b.style.transform = '';
      b.style.removeProperty('--lab-r');
    };
    b.addEventListener('touchend', end);
    b.addEventListener('touchcancel', end);
  }
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
  // Yours is never new: your name (any case or spacing), or a pin this browser started (it keeps its edit key).
  const plain = (n) => String(n || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const mine = (c) => (plain(c.name) && plain(c.name) === plain(store.get('lab-name'))) || Boolean(store.get(`lab-edit:${c.id}`));
  const isNew = (c) => !seen.has(c.id) && !mine(c);
  const unread = (c) => [c, ...repliesOf(c.id)].filter(isNew);
  const markSeen = (items) => {
    const fresh = items.filter((item) => !seen.has(item.id)).map((item) => item.id);
    for (const item of items) seen.add(item.id);
    store.set(seenKey(), [...seen].join(','));
    if (fresh.length) shareReads(fresh);
  };
  // On a local lab, what's read is shared by name: your phone and your Mac (the same name) show the same new and read.
  const READS = script?.dataset.live ? script.dataset.live.replace(/live$/, 'api/reads') : '';
  const shareReads = (ids) => {
    const who = store.get('lab-name').trim();
    if (!READS || !who || !ids.length) return;
    fetch(READS, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: who, page, ids }) }).catch(() => {});
  };
  async function syncReads() {
    const who = store.get('lab-name').trim();
    if (!READS || !who) return;
    const at = page;
    try {
      const { ids } = await (await fetch(`${READS}?name=${encodeURIComponent(who)}&page=${encodeURIComponent(at)}`, { cache: 'no-store' })).json();
      if (at !== page) return;
      const theirs = new Set(ids);
      const mineOnly = [...seen].filter((id) => !theirs.has(id));
      const added = ids.filter((id) => !seen.has(id));
      if (mineOnly.length) shareReads(mineOnly); // read here before: the other devices get it too
      if (!added.length) return;
      for (const id of added) seen.add(id);
      store.set(seenKey(), [...seen].join(','));
      render();
    } catch {}
  }
  const repliesOf = (id) => comments.filter((c) => c.parent === id);
  // Pins show who left them: the first letter of the name.
  const initial = (name) => [...String(name || '').trim()][0]?.toUpperCase() || '';

  function placeCard(card, left, top) {
    layer.append(card);
    const width = card.offsetWidth;
    const maxLeft = scrollX + document.documentElement.clientWidth - width - 12;
    card.style.left = `${Math.max(scrollX + 12, Math.min(left - 14, maxLeft))}px`;
    card.style.top = `${top + 10}px`;
  }

  // The send arrow is drawn with CSS (a stem and a chevron), no picture.
  const ARROW = '<i class="arr" aria-hidden="true"></i>';

  // One field that grows: a pill while empty, a box with a divider and the name row once you type.
  function composer({ placeholder, onSubmit, autofocus }) {
    const wrap = el('div', { class: 'composer' });
    const box = el('div', { class: 'box' });
    // No autofill or suggestion bar on phones: a comment isn't a form to fill.
    const text = el('textarea', { placeholder, maxlength: '2000', rows: '1', 'aria-label': placeholder, autocomplete: 'off', autocorrect: 'off', spellcheck: 'false', writingsuggestions: 'false' });
    const who = el('label', { class: 'who' });
    const as = el('span', {}, 'as');
    const name = el('input', { type: 'text', placeholder: 'your name', maxlength: '60', autocomplete: 'off', autocorrect: 'off', autocapitalize: 'words', spellcheck: 'false', writingsuggestions: 'false', 'data-1p-ignore': '', 'data-lpignore': 'true' });
    name.value = store.get('lab-name');
    who.append(as, name);
    const sendBtn = el('button', { class: 'send', type: 'button', 'aria-label': 'send' });
    // Pressing send keeps the cursor in the box: on phones a blur first drops the keyboard, the sheet moves, and the
    // tap misses the button.
    sendBtn.addEventListener('pointerdown', (e) => e.preventDefault());
    sendBtn.addEventListener('mousedown', (e) => e.preventDefault());
    sendBtn.innerHTML = ARROW;
    const error = el('div', { class: 'error' });
    box.append(text, el('div', { class: 'line' }), who, sendBtn);
    wrap.append(box, error);
    // The box is taller than its one line of text: a tap anywhere on it (not the name or send) puts the cursor in, at the end.
    box.addEventListener('click', (e) => {
      if (e.target !== box && !e.target.classList?.contains('line')) return;
      text.focus({ preventScroll: true });
      text.setSelectionRange(text.value.length, text.value.length);
    });

    const sync = () => {
      const open = text.value.length > 0 || root.activeElement === name || !!error.textContent;
      // Opening moves the arrow from the text row to the name row: slide it there while the box grows, no jump.
      const glide = open !== box.classList.contains('open') && !store.get('lab-name') && box.isConnected && !matchMedia('(prefers-reduced-motion: reduce)').matches;
      const from = glide && { arrow: sendBtn.getBoundingClientRect(), height: box.getBoundingClientRect().height };
      const one = Boolean(store.get('lab-name'));
      box.classList.toggle('one', one);
      box.classList.toggle('open', open);
      as.hidden = !name.value.trim();
      if (one && !CSS.supports?.('field-sizing', 'content')) name.style.width = `${Math.max(2, name.value.length + 1)}ch`;
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
      refreshPinCursor(); // the pointer shows your initial
      syncReads();
      sendBtn.classList.remove('sent');
      void sendBtn.offsetWidth; // restart the arrow's flight on a quick second send
      sendBtn.classList.add('sent');
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
    // Right after it's on screen, in the same tap: phones open the keyboard only then.
    // preventScroll: the sheet is still sliding in from below the screen, and the page must not scroll to meet it.
    const focus = () => text.focus({ preventScroll: true });
    if (autofocus) queueMicrotask(() => (text.isConnected ? focus() : setTimeout(focus, 0)));
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
    const prevHeight = stepping && coarse && prev ? prev.offsetHeight : 0; // stepping on a phone: the sheet's top doesn't drop
    // The same thread drawn again (reopened, resolved, a reply came in): it keeps where its messages were scrolled to.
    const prevScroll = prev ? prev.querySelector('.body')?.scrollTop ?? null : null;
    // Every pin's place is read before anything is written, so the page lays out once per render, not once per pin.
    const places = new Map(on ? threads().filter((c) => c.anchor?.kind !== 'page').map((c) => [c.id, position(c.anchor || {})]) : []);
    layer.replaceChildren();
    pinsById.clear();
    const now = on ? draft || openId : null;
    const appear = now !== shown;
    const anim = appear ? ' in' : '';
    let quoted = null;
    const done = () => {
      if (coarse && !now && shown && prev && !still.matches && !prev.style.transform) { // phones slide the sheet away; computers close at once, like the chat // not when it already slid away (phones)
        prev.classList.remove('in');
        prev.classList.add('out');
        prev.inert = true;
        layer.append(prev);
        setTimeout(() => prev.remove(), coarse ? 230 : 150);
      }
      markQuote(quoted);
      shown = now;
      posted = null;
    };
    const list = threads();
    const open = list.filter((c) => !c.resolved && c.anchor?.kind !== 'page').length; // chat messages count in the chat
    const fresh = list.filter((c) => !c.resolved && c.anchor?.kind !== 'page').reduce((n, c) => n + unread(c).length, 0); // the chat counts its own
    // New replies are counted on "list" while comments show, on the toggle while they are hidden.
    toggleBtn.replaceChildren(
      document.createTextNode((on ? 'hide' : open ? `comments · ${open}` : 'comments') + (!on && fresh ? ` · ${fresh} new` : '')),
      el('kbd', {}, 'm'),
    );
    toggleBtn.classList.toggle('secondary', on);
    host.toggleAttribute('data-sheet', Boolean(on && (draft || openId || listOpen || chatOpen))); // phones: the sheet has the screen's bottom
    document.documentElement.classList.toggle('lab-sheet', host.hasAttribute('data-sheet'));
    backCloses();
    refit();
    document.documentElement.classList.toggle('lab-pinning', on);
    document.documentElement.classList.toggle('lab-go', on && goMode);
    copyBtn.hidden = !on || !isAdmin || list.every((c) => c.resolved);
    drawList();
    drawChat();
    if (!on) return done();
    for (const h of held()) {
      const { left, top } = position(h.anchor);
      const p = el('div', { class: 'pin held', title: `${h.name}: ${h.text} · draft, not sent yet` }, initial(h.name));
      p.style.left = `${left}px`;
      p.style.top = `${top}px`;
      layer.append(p);
    }

    list.forEach((c) => {
      if (isPage(c)) return; // in the chat, not on the page
      // Done pins with nothing new in them step aside (the list's "done" button shows them again); an open one stays.
      if (!showDone && openId !== c.id && (c.resolved || workState(c)[0] === 'done') && !unread(c).length) return;
      const { left, top, moved, zone } = places.get(c.id) || position(c.anchor || {});
      if (openId === c.id) drawZone(zone, `saved${anim}`); // a drawn area shows its outline while open
      const news = unread(c);
      const movable = !zone && (isAdmin || store.get(`lab-edit:${c.id}`));
      const [state] = workState(c); // placed (sent), now (the agent is on it) or done
      const pin = el(
        'button',
        {
          class: `pin${/^go$/i.test(c.text.trim()) ? ' go' : ''}${c.resolved ? ' resolved' : ''}${state === 'done' ? ' done' : ''}${state === 'now' ? ' working' : ''}${news.length ? ' new' : ''}${moved ? ' moved' : ''}${posted === c.id ? ' in' : ''}${movable ? ' grab' : ''}`,
          type: 'button',
          title: `${c.resolved ? '' : `${numberOf(c)} · `}${c.name}${moved ? ' · the spot it was pinned to has changed' : ''}${movable ? ' · drag to move' : ''}`,
        },
        state === 'done' || c.resolved || /^go$/i.test(c.text.trim()) ? '✓' : initial(c.name),
      );
      pin.style.left = `${left}px`;
      pin.style.top = `${top}px`;
      if (movable) grab(pin, c);
      // Hovering a pin shows what it's on, as an open one does: a drawn area its outline, selected words their highlight.
      if (!coarse && zone && openId !== c.id) {
        let shown = null;
        pin.addEventListener('pointerenter', () => (shown = drawZone(zone, 'saved')));
        pin.addEventListener('pointerleave', () => (shown?.remove(), (shown = null)));
      } else if (!coarse && c.anchor?.quote && !zone) {
        pin.addEventListener('pointerenter', () => markQuote(c.anchor));
        pin.addEventListener('pointerleave', () => markQuote(quoted));
      }
      pin.addEventListener('click', (e) => {
        e.stopPropagation();
        if (pin.dataset.dragged) return;
        // Phones: opening it goes through goTo, which moves the page so the pin sits above its sheet, not under it.
        if (coarse && openId !== c.id) return goTo(c);
        openId = openId === c.id ? null : c.id;
        draft = null;
        render();
      });
      layer.append(pin);
      pinsById.set(c.id, pin);
      if (openId === c.id) {
        // Area comments open below the area, so the card doesn't hide what it is about.
        // Opened by a click: the reply box takes focus (not on touch screens, where it would pop the keyboard).
        const card = threadCard(c, new Set(news.map((x) => x.id)), appear && (!stepping || keepKeys)); // the reply box takes the cursor, phones too
        openCard = card;
        if (appear && !stepping) card.classList.add('in');
        if (prevHeight) card.style.minHeight = `min(${prevHeight}px, var(--_sheet-max))`;
        stepping = keepKeys = false;
        placeCard(card, zone ? left + 14 : left, zone ? zone.top + zone.height : top);
        // Opens at the newest message, as the chat does (a short thread doesn't scroll).
        if (!appear && prevScroll != null) card.querySelector('.body').scrollTop = prevScroll;
        else if (appear && !coarse) {
          const body = card.querySelector('.body');
          const first = body.querySelector('.fresh, .newline');
          body.scrollTop = first ? first.offsetTop - body.offsetTop - 8 : body.scrollHeight;
        }
        swipeDown(card, () => ((openId = null), render()));
        markSeen(news);
        if (news.length) drawList(); // opened is read: the "N new" pill and the tab title count it off at once
        quoted = zone ? null : c.anchor; // an area's outline says what it's on; only selected words get the highlight
      }
    });

    if (draft) {
      const { anchor } = draft;
      const { left, top, zone } = position(anchor);
      drawZone(zone, 'draft');
      quoted = zone ? null : anchor; // an area lights no single word
      const pin = el('div', { class: `pin draft${anim}` }, initial(store.get('lab-name')));
      pin.style.left = `${left}px`;
      pin.style.top = `${top}px`;
      layer.append(pin);
      const float = el('div', { class: `float${anim}` });
      float.append(
        el('div', { class: 'handle' }),
        composer({
          placeholder: 'add a comment',
          autofocus: true,
          onSubmit: async (name, text) => {
            if (drafting()) {
              store.set(heldKey(), JSON.stringify([...held(), { name, text, anchor }]));
              draft = null;
              return render();
            }
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
      swipeDown(float, () => ((draft = null), render()));
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
    // The thread scrolls in .body; the step buttons and the reply box stay put in .foot (phones: the sheet's bottom).
    const body = el('div', { class: 'body' });
    const foot = el('div', { class: 'foot' });
    card.append(el('div', { class: 'handle' }), body, foot);
    card.addEventListener('click', (e) => e.stopPropagation());
    // Messages as in the chat: bubbles (yours on the right), the time and ✓ ✓✓ in the corner, ✅ on a done answer, and
    // a "new" line above the first one you haven't read. The thread's number (as in the agent text) leads its time.
    body.classList.add('msgs');
    const itemEl = (item) => {
      const box = el('div', { class: `item msg${mine(item) && !item.session ? ' mine' : ''}`, 'data-id': item.id });
      box.append(nameLine(item.name, item !== c && /^done\b/i.test(item.text)), ...readable(item.text), stampOf(item, c, item === c && !c.resolved ? `#${numberOf(c)} · ` : ''));
      return box;
    };
    const shown = new Set();
    const all = [c, ...repliesOf(c.id)];
    const firstNew = all.find((x) => fresh.has(x.id));
    for (const item of all) {
      if (item === firstNew && item !== c) body.append(el('div', { class: 'newline' }, 'new'));
      body.append(itemEl(item));
      shown.add(item.id);
    }
    card.sync = () => {
      for (const r of repliesOf(c.id)) {
        if (shown.has(r.id)) continue;
        const items = card.querySelectorAll('.item');
        const added = itemEl(r);
        added.classList.add('fresh');
        items[items.length - 1].after(added);
        shown.add(r.id);
        markSeen([r]);
      }
    };
    // Resolve: admins, and whoever started the thread (its key is kept in their browser). Delete: admins.
    const ownKey = store.get(`lab-edit:${c.id}`);
    let actions = null;
    if (isAdmin || ownKey) {
      actions = el('div', { class: 'row acts' });
      const resolve = el('button', { class: 'btn', type: 'button' }, c.resolved ? 'reopen' : 'resolve');
      const failed = (btn) => (btn.textContent = 'failed, try again');
      resolve.addEventListener('click', async () => {
        try {
          const closing = !c.resolved; // resolved: the thread is done, so its card closes (reopen keeps it open)
          const { comment } = await send({ action: c.resolved ? 'reopen' : 'resolve', id: c.id, ...(ownKey ? { edit: ownKey } : {}) });
          Object.assign(c, comment);
          if (closing && openId === c.id) return slideAway(openCard, () => ((openId = null), render()));
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
      actions.append(...(isAdmin ? [resolve, del] : [resolve]));
      body.append(actions);
      // A fix the quick model made: keep it (resolves) or put it back (the agent gets the pin). Local labs only.
      if (c.quick === 'done' && !c.resolved) {
        const verdict = el('div', { class: 'row' });
        const keep = el('button', { class: 'btn', type: 'button' }, '👍 keep');
        const back = el('button', { class: 'btn', type: 'button' }, '👎 put back');
        keep.addEventListener('click', () => resolve.click());
        back.addEventListener('click', async () => {
          try {
            const r = await fetch(new URL('/_lab/quick-undo', new URL(API, location.href)), { method: 'POST', headers: headers(), body: JSON.stringify({ page, id: c.id }) });
            const data = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(data.error);
            c.quick = 'rejected';
            render();
          } catch (e) {
            back.textContent = e.message || 'failed, try again';
          }
        });
        verdict.append(keep, back);
        body.append(verdict);
      }
    }
    // Phones: step through the threads from the sheet (J and K on a keyboard).
    if (coarse) {
      const l = listed().length ? listed() : threads();
      const at = l.findIndex((x) => x.id === c.id);
      const fresh = threads().filter((x) => x.id !== c.id && unread(x).length);
      const nav = el('div', { class: 'row nav' });
      const step = (label, to) => {
        const b = el('button', { class: 'btn', type: 'button' }, label);
        b.addEventListener('pointerdown', (e) => e.preventDefault()); // an open keyboard stays open (see goTo)
        b.addEventListener('click', () => goTo(to));
        nav.append(b);
      };
      if (l.length > 1) step('‹ prev', l[(at + l.length - 1) % l.length]), step('next ›', l[(at + 1) % l.length]);
      if (fresh.length) step(`new · ${fresh.length} ›`, fresh[0]);
      // One row on phones: prev / next on the left, reopen / delete on the right, so the sheet keeps its room for messages.
      if (nav.firstChild && actions) nav.append(actions);
      if (nav.firstChild) foot.append(nav);
      // The keyboard's ^ ˅ go to the field before or after the reply box: an invisible one on each side steps to the
      // previous or next thread instead, with the keyboard staying up.
      if (l.length > 1)
        queueMicrotask(() => {
          const box = foot.querySelector('.composer textarea');
          if (!box) return;
          const trap = (to) => {
            const t = el('input', { class: 'trap', type: 'text', 'aria-hidden': 'true', autocomplete: 'off' });
            t.addEventListener('focus', () => goTo(to, true));
            return t;
          };
          box.before(trap(l[(at + l.length - 1) % l.length]));
          box.after(trap(l[(at + 1) % l.length]));
        });
    }
    foot.append(
      composer({
        placeholder: 'reply',
        autofocus: focus,
        onSubmit: async (name, text) => {
          const { comment } = await send({ name, text, parent: c.id });
          comments.push(comment);
          markSeen([comment]);
          // Writing in a done thread reopens it (the lab does the same): it shows as open at once, pin and buttons.
          if (c.resolved) {
            c.resolved = false;
            render();
            // The card is drawn again: keep it where you were, at the newest message, with the cursor in the box.
            const again = openCard?.querySelector('.body');
            if (again) again.scrollTop = again.scrollHeight;
            openCard?.querySelector('textarea')?.focus({ preventScroll: true });
            return { keep: true };
          }
          // Add the reply where it belongs instead of redrawing the card, so nothing on screen blinks
          // and the reply box keeps its focus for the next one.
          shown.add(comment.id);
          const items = card.querySelectorAll('.item');
          const added = itemEl(comment, false);
          added.classList.add('fresh');
          items[items.length - 1].after(added);
          body.scrollTop = body.scrollHeight; // the reply just sent is in view above the box
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
    if (!on) ptr.classList.remove('show'); // comments hidden: the system pointer is back at once
    else recheck();
    store.set('lab-on', on ? '1' : '0');
    if (on) showHint();
    draft = null;
    openId = null;
    render();
  };
  toggleBtn.addEventListener('click', () => setOn(!on));
  goBtn.addEventListener('click', () => setGo(!goMode));
  const stepNew = (dir) => {
    const fresh = threads().filter((c) => !isPage(c) && unread(c).length);
    if (!fresh.length) return;
    const top = (c) => position(c.anchor || {}).top;
    fresh.sort((a, b) => top(a) - top(b));
    // The open one was read when it opened, so it's no longer in the list: step on from where it is on the page.
    const open = openId && threads().find((c) => c.id === openId);
    const here = open ? top(open) : null;
    const after = here == null ? -1 : fresh.findIndex((c) => top(c) > here);
    const at = fresh.findIndex((c) => c.id === openId);
    const next = at >= 0 ? (at + dir + fresh.length) % fresh.length
      : here == null ? (dir > 0 ? 0 : fresh.length - 1)
      : dir > 0 ? (after < 0 ? 0 : after)
      : ((after < 0 ? fresh.length : after) - 1 + fresh.length) % fresh.length;
    goTo(fresh[next], !coarse); // the reply box takes the cursor (not on phones: no keyboard popping up)
  };
  newPrev.addEventListener('click', () => stepNew(-1));
  doneBtn.addEventListener('click', () => showDoneBtn.click());
  showDoneBtn.addEventListener('click', () => {
    showDone = !showDone;
    store.set('lab-show-done', showDone ? '1' : '');
    render();
  });
  newNext.addEventListener('click', () => stepNew(1));
  // Option-click (or Option-drag) with comments hidden still pins: comments come back with the new one.
  const showAgain = () => {
    if (on) return;
    on = true;
    store.set('lab-on', '1');
  };
  copyBtn.addEventListener('click', () => copy(agentLink(), copyBtn));
  // The list opens on "new" each time.
  listBtn.addEventListener('click', () => (LIST_WINDOW ? ((listOpen = !listOpen), listOpen && (filter = 'new'), (chatOpen = false), (hint.hidden = true), render()) : stepNew(1)));
  listEl.querySelector('.x').addEventListener('click', () => slideAway(listEl, () => ((listOpen = false), render())));
  chatBtn.addEventListener('click', () => {
    chatOpen = !chatOpen;
    listOpen = false;
    // On a computer, opening the chat closes an open thread, and a new comment with nothing typed in it.
    if (chatOpen && !coarse) {
      openId = null;
      if (draft && !root.querySelector('.float textarea')?.value.trim()) draft = null;
    }
    hint.hidden = true;
    render();
    // Computers: the cursor goes in the message box (phones wait for a tap, so the keyboard doesn't cover the chat).
    if (chatOpen && !coarse) chatEl.querySelector('.chat textarea')?.focus({ preventScroll: true });
  });
  // No close cross on the chat: a click outside it, Escape or C closes it (phones: the handle or the dimmed page).
  // On a computer a click outside the chat closes it (phones have the dimmed page for that); what you typed stays.
  // That click only closes: it doesn't start a comment or press what's under it.
  let closingClick = false;
  document.addEventListener('pointerdown', (e) => {
    closingClick = false;
    if (coarse || !chatOpen || e.button !== 0) return;
    const path = e.composedPath();
    if (path.includes(chatEl) || path.includes(chatBtn)) return;
    chatOpen = false;
    closingClick = true;
    render();
  }, true);
  addEventListener('click', (e) => {
    if (!closingClick) return;
    closingClick = false;
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);
  for (const b of listEl.querySelectorAll('[data-f]')) b.addEventListener('click', () => ((filter = b.dataset.f), drawList()));
  holdBtn.addEventListener('click', () => (store.set('lab-hold', drafting() ? '' : '1'), drawList()));
  sendBtn.addEventListener('click', async () => {
    const list = held();
    for (let i = 0; i < list.length; i++) {
      try {
        const { comment, edit } = await send(list[i]);
        if (edit) store.set(`lab-edit:${comment.id}`, edit);
        comments.push(comment);
        markSeen([comment]);
        store.set(heldKey(), JSON.stringify(list.slice(i + 1)));
      } catch {
        sendBtn.textContent = 'send failed, try again';
        return;
      }
    }
    render();
  });
  const typing = (e) =>
    e.composedPath().some((n) => n instanceof HTMLElement && (n.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(n.tagName)));
  document.addEventListener('keydown', (e) => {
    if (gone) return;
    const inOtherWidget = document.activeElement?.localName.includes('-') && document.activeElement !== host; // e.g. an input in a closed shadow root
    if ((e.key === 'm' || e.key === 'M' || e.code === 'KeyM') && !e.metaKey && !e.ctrlKey && !e.altKey && !e.repeat && !typing(e) && !inOtherWidget) {
      e.preventDefault();
      setOn(!on);
      return;
    }
    // Control-N goes to the next new comment from anywhere, the reply box too (plain N types a letter there).
    if (on && e.ctrlKey && !e.metaKey && !e.altKey && (e.code === 'KeyN' || e.key === 'n' || e.key === 'N')) {
      e.preventDefault();
      // Words typed in a reply box aren't thrown away: it nudges instead, send or clear them first.
      const typed = root.querySelector('.card textarea, .float textarea');
      if (typed?.value.trim()) return typed.closest('.card, .float')?.animate([{ transform: 'none' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'none' }], { duration: 260 });
      return stepNew(e.shiftKey ? -1 : 1);
    }
    // V switches between go and comment.
    if (on && (e.key === 'v' || e.key === 'V' || e.code === 'KeyV') && !e.metaKey && !e.ctrlKey && !e.altKey && !e.repeat && !typing(e) && !inOtherWidget) {
      e.preventDefault();
      setGo(!goMode);
      return;
    }
    // The list's keys, with comments shown and nothing typed: L list, C chat, J/K next/previous, R reply, E resolve.
    if (on && !typing(e) && !inOtherWidget && !e.metaKey && !e.ctrlKey && !e.altKey && /^[ljkrecn]$/i.test(e.key)) {
      const k = e.key.toLowerCase();
      if (k === 'c') {
        e.preventDefault();
        return chatBtn.click();
      }
      const l = listed();
      const at = l.findIndex((c) => c.id === openId);
      if (!LIST_WINDOW && (k === 'j' || k === 'k' || k === 'n')) stepNew(k === 'k' ? -1 : 1); // N (or J) the next new comment, K the one before
      else if (k === 'l' && !LIST_WINDOW) return;
      else if (k === 'l') ((listOpen = !listOpen), listOpen && (filter = 'new'), drawList());
      else if ((k === 'j' || k === 'k') && l.length) goTo(l[(at + (k === 'j' ? 1 : l.length - 1) + (at < 0 && k === 'k' ? 1 : 0)) % l.length]);
      else if (k === 'r' && openId) root.querySelector('.card textarea')?.focus({ preventScroll: true });
      else if (k === 'e' && openId && isAdmin) [...root.querySelectorAll('.card .btn')].find((b) => /^(resolve|reopen)$/.test(b.textContent))?.click();
      else return;
      e.preventDefault();
      return;
    }
    // Escape closes the top one: a thread or new comment first, then the chat, then the list (typed chat text stays).
    if (e.key === 'Escape' && (draft || openId)) {
      draft = null;
      openId = null;
      render();
    } else if (e.key === 'Escape' && (chatOpen || listOpen)) {
      if (chatOpen) chatOpen = false;
      else listOpen = false;
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
    // A thin drag (a line of text, a small icon) still makes an area: it grows to at least 12 px each way around its middle,
    // instead of silently doing nothing.
    for (const [a, b] of [['x0', 'x1'], ['y0', 'y1']]) {
      if (Math.abs(d[b] - d[a]) >= 12) continue;
      const mid = (d[a] + d[b]) / 2;
      d[a] = mid - 6;
      d[b] = mid + 6;
    }
    showAgain();
    openId = null;
    begin(zoneAnchor(d));
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

  // Phones. A tap only reads (it closes what's open); holding a finger still for half a second pins, anywhere, links
  // and buttons too (the phone's Option-click). Text selected the phone's way gets a "Comment" chip that pins on it.
  let lastTouch = 0;
  let pinnedByHold = false; // a hold just made a pin: the lift that ends it puts the cursor in its box (phones open the keyboard only then)
  const selChip = root.querySelector('.sel-chip');
  const scrim = root.querySelector('.scrim');
  // The open sheet (phones): a thread, a new comment, the list or the chat.
  const openSheet = () => root.querySelector('.card:not(.out), .float:not(.out)') || (listOpen ? listEl : chatOpen ? chatEl : null);
  const closeAll = () => {
    draft = null;
    openId = null;
    listOpen = false;
    chatOpen = false;
    render();
  };
  // Text typed in a thread or a new comment would be lost, so the sheet stays and nudges instead; the chat's box keeps
  // its text when closed, so the chat always closes.
  const closeOrNudge = () => {
    const node = openSheet();
    if (![...root.querySelectorAll('textarea')].some((t) => t.value.trim() && !chatEl.contains(t))) return slideAway(node, closeAll);
    node?.animate?.([{ transform: 'none' }, { transform: 'translateY(12px)' }, { transform: 'none' }], { duration: 260, easing: 'ease-out' });
  };
  scrim.addEventListener('click', closeOrNudge);
  scrim.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false }); // the page stays still behind it
  // A swipe down on the dimmed page closes the sheet too, like a tap there.
  let scrimY = null;
  scrim.addEventListener('touchstart', (e) => (scrimY = e.touches[0].clientY), { passive: true });
  scrim.addEventListener('touchend', (e) => {
    const dy = scrimY === null ? 0 : e.changedTouches[0].clientY - scrimY;
    scrimY = null;
    if (dy > 30) closeOrNudge();
  });
  // Phones: a sheet slides down and away, the dim fading with it, then it closes.
  // After a swipe it goes on at the finger's speed (ms), so it doesn't stop and restart.
  function slideAway(node, close, ms = 0) {
    if (!coarse || !node || still.matches) return close();
    // With the keyboard up, the sheet fills what's above it; letting the keyboard go now would resize the sheet in
    // the middle of its slide. So it slides down behind the keyboard, and the keyboard goes once it's gone.
    if (!host.hasAttribute('data-kb')) root.activeElement?.blur();
    node.style.pointerEvents = 'none'; // not inert: that would take the cursor away, and the keyboard with it, at once
    node.style.transition = ms ? `transform ${ms}ms cubic-bezier(.2, .6, .4, 1)` : 'transform .22s cubic-bezier(.4, 0, 1, 1)';
    scrim.style.transition = `opacity ${ms || 220}ms`;
    node.style.transform = 'translateY(100%)';
    scrim.style.opacity = '0';
    setTimeout(() => {
      root.activeElement?.blur();
      close();
      node.style.pointerEvents = '';
      node.style.transform = node.style.transition = scrim.style.opacity = scrim.style.transition = '';
    }, ms || 220);
  }
  // A sheet follows the finger like a native one: from the handle and the header, from any part that doesn't scroll,
  // and from a list or the messages when they're already at the top and the finger pulls down (any other drag there
  // scrolls them natively; overscroll-behavior keeps the page behind still). Up past where it sits it stretches a
  // little and springs back. Let go fast, or past a third of its height, and it carries on down and away at the
  // finger's speed; else it springs back, the dimmed page fading with it. Text boxes stay the browser's.
  const grabArea = (t) => Boolean(t.closest?.('.handle, .tabs'));
  const scrollerIn = (e, node) =>
    e.composedPath().find((n) => n instanceof HTMLElement && node.contains(n) && (n.localName === 'textarea' || /auto|scroll/.test(getComputedStyle(n).overflowY)));
  const SPRING = 'cubic-bezier(.32,.72,0,1)'; // iOS's sheet curve
  // Android's back gesture closes an open sheet first, like a native one, instead of leaving the page (CloseWatcher,
  // Chrome 120+; elsewhere back works as before). With something typed it nudges, as a tap on the dimmed page does.
  function backCloses() {
    const open = matchMedia('(pointer: coarse)').matches && host.hasAttribute('data-sheet');
    if (!open && backCloses.w) {
      const w = backCloses.w;
      backCloses.w = null;
      w.destroy();
    }
    if (open && !backCloses.w && 'CloseWatcher' in window) {
      try {
        const w = new CloseWatcher();
        w.onclose = () => {
          if (backCloses.w === w) backCloses.w = null;
          closeOrNudge();
          backCloses(); // still open (it nudged): back closes it next time
        };
        backCloses.w = w;
      } catch {}
    }
  }
  function swipeDown(node, close, grows = false) {
    if (!coarse) return;
    // A sheet that grows (the chat) has two heights, as iOS and Android sheets do: pull it up (or flick) to fill the
    // screen, pull it down from there to go back; from the lower one a pull down closes it as before.
    let raw = 0;
    // Right after its content scrolled (a fling up to the top), a pull down scrolls on instead of taking the sheet,
    // and for a moment after letting go of a drag a tap does nothing, so a sheet that springs back under the finger
    // doesn't press what lands there or pop the keyboard (Vaul's 100 ms and 200 ms).
    let scrolledAt = -1e9;
    let releasedAt = -1e9;
    node.addEventListener('scroll', () => (scrolledAt = performance.now()), { capture: true, passive: true });
    node.addEventListener('click', (e) => {
      if (performance.now() - releasedAt < 200) e.preventDefault(), e.stopPropagation();
    }, true);
    node.addEventListener('focusin', (e) => {
      if (performance.now() - releasedAt < 200 && e.target.localName === 'textarea') e.target.blur();
    });
    let x0 = 0;
    let y0 = 0;
    let dy = 0;
    let v = 0; // px/ms, from the last moves
    let last = null;
    let mode = null; // 'drag' the sheet, 'hold' (sideways on a part that doesn't scroll), 'off' (the browser's)
    let box = null; // the scrolling part the touch began in
    node.addEventListener('touchstart', (e) => {
      const t = e.touches[0];
      x0 = t.clientX;
      y0 = t.clientY;
      dy = v = raw = 0;
      last = { y: y0, at: e.timeStamp };
      box = scrollerIn(e, node);
      mode = e.touches.length > 1 || box?.localName === 'textarea' ? 'off' : null;
    }, { passive: true });
    node.addEventListener('touchmove', (e) => {
      if (mode === 'off') return;
      if (mode === 'hold') return e.preventDefault();
      const t = e.touches[0];
      if (!mode) {
        const down = t.clientY - y0;
        const across = t.clientX - x0;
        if (!down && !across) return; // iOS sends moves for pressure changes too
        const sideways = Math.abs(across) > Math.abs(down);
        if (grabArea(e.target)) mode = sideways && e.target.closest('.tabs') ? 'off' : 'drag'; // the list's tabs scroll sideways
        else if (box) mode = !sideways && down > 0 && box.scrollTop <= 0 && performance.now() - scrolledAt > 100 ? 'drag' : 'off';
        else mode = sideways ? 'hold' : 'drag';
        if (mode === 'off') return;
        if (mode === 'hold') return e.preventDefault();
      }
      e.preventDefault();
      raw = t.clientY - y0;
      dy = raw >= 0 ? raw : -12 * Math.log1p(-raw / 24); // up: a short stretch that gets stiffer
      if (e.timeStamp > last.at) v = 0.8 * ((t.clientY - last.y) / (e.timeStamp - last.at)) + 0.2 * v;
      last = { y: t.clientY, at: e.timeStamp };
      node.style.transition = scrim.style.transition = 'none';
      node.style.transform = `translateY(${dy}px)`;
      scrim.style.opacity = String(Math.min(1, Math.max(0, 1 - dy / 320)));
    }, { passive: false });
    const end = (e) => {
      const was = mode;
      mode = null;
      if (was !== 'drag') return;
      releasedAt = performance.now();
      if (e.timeStamp - last.at > 80) v = 0; // held still before letting go
      const h = node.offsetHeight || innerHeight;
      const settle = () => {
        node.style.transition = `transform 380ms ${SPRING}, height 380ms ${SPRING}`;
        scrim.style.transition = 'opacity 300ms';
        node.style.transform = scrim.style.opacity = '';
        setTimeout(() => (node.style.transition = scrim.style.transition = ''), 400);
      };
      if (grows && !node.classList.contains('full') && (raw < -40 || v < -0.4)) return node.classList.add('full'), settle();
      if (grows && node.classList.contains('full') && v < 1.2 && (raw > 60 || v > 0.4)) return node.classList.remove('full'), settle();
      if (v > 0.4 || (dy > h / 3 && v > -0.1)) return slideAway(node, close, Math.min(320, Math.max(140, (h - dy) / Math.max(v, 1.2))));
      node.style.transition = `transform 380ms ${SPRING}`;
      scrim.style.transition = 'opacity 300ms';
      node.style.transform = scrim.style.opacity = '';
      setTimeout(() => (node.style.transition = scrim.style.transition = ''), 400);
    };
    node.addEventListener('touchend', end);
    node.addEventListener('touchcancel', end);
  }
  // iOS lays fixed things out on the page's full height while the keyboard covers its bottom part (and Safari may
  // pan the view). Measure what is hidden below what the screen shows, from a fixed probe the height of the layout,
  // so the sheets keep their box just above the keyboard and fit the rest (see --lab-kb and --lab-vh in the CSS).
  const vv = window.visualViewport;
  if (coarse && vv) {
    const probe = el('i', { style: 'position:fixed;top:0;bottom:0;left:0;width:0;visibility:hidden;pointer-events:none' });
    // Safari 26 with the keyboard up shows the page in a strip above the keyboard, around its address pill, where it
    // draws nothing fixed: the sheet and its dimming stop above it. A block in the page itself (not fixed) covers it.
    const strip = el('i', { style: 'position:absolute;left:0;width:100vw;display:none;background:var(--_bg);z-index:3;pointer-events:none' });
    root.append(probe, strip);
    let fitted = '';
    const fit = () => {
      const zoomed = Math.abs(vv.scale - 1) > 0.01; // pinch-zoomed: that isn't a keyboard
      const r = probe.getBoundingClientRect();
      // iOS 26.0 can leave offsetTop at 24 px after the keyboard has gone. With nothing to type in focused there is no
      // keyboard and nothing panned (unzoomed), so an offset then is stale and counts as 0.
      const field = root.activeElement || document.activeElement;
      const typing = /^(textarea|input|select)$/.test(field?.localName || '') || Boolean(field?.isContentEditable);
      const top = zoomed || !typing ? 0 : vv.offsetTop;
      const seen = top + vv.height; // the bottom of what the screen shows
      const kb = zoomed ? 0 : Math.max(0, Math.round(r.bottom - seen));
      const gap = zoomed ? 0 : Math.max(0, Math.round(seen - r.bottom));
      const vh = zoomed ? 0 : Math.round(vv.height);
      // Safari 26 doesn't count as "keyboard up" here (its fixed layer ends above the keyboard by itself): the sheet stays
      // a half sheet resting on that layer, which sits right, and the strip below it is covered.
      const sheet = host.hasAttribute('data-sheet');
      const key = `${kb} ${vh} ${gap} ${sheet} ${scrollY} ${Math.round(top)}`;
      if (key === fitted) return;
      fitted = key;
      host.style.setProperty('--lab-kb', `${kb}px`);
      host.style.setProperty('--lab-top', `${Math.round(top)}px`);
      if (vh) host.style.setProperty('--lab-vh', `${vh}px`);
      else host.style.removeProperty('--lab-vh');
      host.toggleAttribute('data-kb', kb > 60);
      strip.style.display = sheet && gap ? 'block' : 'none';
      strip.style.top = `${Math.round(scrollY + r.bottom)}px`;
      strip.style.height = `${gap}px`;
    };
    refit = fit;
    root.addEventListener('focusin', () => setTimeout(fit, 50));
    root.addEventListener('focusout', () => setTimeout(fit, 50));
    vv.addEventListener('resize', fit);
    vv.addEventListener('scroll', fit);
    fit();
  }
  // The chat stays at its newest message while it gets shorter (the keyboard coming up, the reply strip), unless
  // you scrolled back to read.
  const msgsEl = chatEl.querySelector('.msgs');
  let stick = true;
  msgsEl.addEventListener('scroll', () => (stick = msgsEl.scrollHeight - msgsEl.scrollTop - msgsEl.clientHeight < 48), { passive: true });
  if ('ResizeObserver' in window) new ResizeObserver(() => stick && (msgsEl.scrollTop = msgsEl.scrollHeight)).observe(msgsEl);
  swipeDown(listEl, () => ((listOpen = false), render()));
  swipeDown(chatEl, () => ((chatOpen = false), render()), true);
  let press = null;
  const stopPress = () => press && (clearTimeout(press.timer), (press = null));
  document.addEventListener(
    'pointerdown',
    (e) => {
      stopPress();
      pinnedByHold = false;
      if (e.pointerType === 'touch') lastTouch = Date.now();
      if (e.pointerType !== 'touch' || draft || !(e.target instanceof Element) || e.composedPath().includes(host) || e.target.closest(OFF)) return;
      const { clientX: x, clientY: y } = e;
      press = {
        x,
        y,
        timer: setTimeout(() => {
          press = null;
          pinnedByHold = true;
          navigator.vibrate?.(8);
          getSelection?.()?.removeAllRanges();
          afterDrag = true; // the lift that ends the hold isn't a tap on the link
          setTimeout(() => (afterDrag = false), 800);
          showAgain();
          openId = null;
          begin(anchorAt(x, y));
        }, 500),
      };
    },
    true,
  );
  document.addEventListener('pointermove', (e) => press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10 && stopPress(), true);
  document.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'touch') lastTouch = Date.now();
    stopPress();
    if (pinnedByHold) root.querySelector('.float textarea')?.focus({ preventScroll: true });
  }, true);
  // The lift after a hold: no click follows it (it would land on the dimmed page and take the cursor away), and the
  // touch's own end puts the cursor in the box, so the phone opens its keyboard.
  document.addEventListener('touchend', (e) => {
    if (!pinnedByHold) return;
    pinnedByHold = false;
    e.preventDefault();
    root.querySelector('.float textarea')?.focus({ preventScroll: true });
  }, { capture: true, passive: false });
  document.addEventListener('pointercancel', stopPress, true);
  addEventListener('scroll', stopPress, { passive: true, capture: true });
  document.addEventListener('contextmenu', (e) => (press || afterDrag) && e.preventDefault(), true);
  let selRect = null;
  document.addEventListener('selectionchange', () => {
    const sel = getSelection?.();
    const range = sel?.rangeCount && sel.getRangeAt(0);
    const text = String(sel || '').trim();
    const inside = range && host.contains(range.commonAncestorContainer);
    selRect = coarse && on && !draft && text && range && !inside ? range.getClientRects()[0] || range.getBoundingClientRect() : null;
    selChip.hidden = !selRect;
    if (!selRect) return;
    const below = selRect.bottom + 52 < innerHeight;
    selChip.style.left = `${Math.min(Math.max(selRect.left + selRect.width / 2, 60), innerWidth - 60)}px`;
    selChip.style.top = `${below ? selRect.bottom + 10 : Math.max(selRect.top - 46, 8)}px`;
  });
  // A comment on the words selected: pinned at their start, quoting exactly them (a few words either side to find them
  // again), not just the word under the pin.
  const commentOnSelection = () => {
    const sel = getSelection?.();
    const range = sel?.rangeCount && sel.getRangeAt(0);
    const exact = String(sel || '').replace(/\s+/g, ' ').trim();
    if (!range || !exact || host.contains(range.commonAncestorContainer)) return false;
    // The pin sits on the last selected letter (where the selection ended), when that's in the same element as its
    // first; a selection over several items keeps it on the first, so the pin finds its place again.
    const rects = range.getClientRects();
    const first = rects[0] || range.getBoundingClientRect();
    const last = rects[rects.length - 1] || first;
    const startEl = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
    const endEl = range.endContainer.nodeType === 1 ? range.endContainer : range.endContainer.parentElement;
    const anchor = startEl && (startEl === endEl || startEl.contains(endEl))
      ? anchorAt(Math.max(last.left, last.right - 2), last.top + last.height / 2)
      : anchorAt(first.left + 2, first.top + first.height / 2);
    const at = range.commonAncestorContainer;
    const block = (at.nodeType === 1 ? at : at.parentElement)?.closest('p, li, h1, h2, h3, h4, h5, h6, td, th, figcaption, blockquote, pre, section, article, div') || document.body;
    const side = (a, b) => {
      const r = document.createRange();
      r.setStart(...a);
      r.setEnd(...b);
      return String(r).replace(/\s+/g, ' ');
    };
    anchor.kind = 'text';
    anchor.quote = {
      exact: short(exact, 300),
      prefix: side([block, 0], [range.startContainer, range.startOffset]).replace(/^\s+/, '').slice(-40),
      suffix: side([range.endContainer, range.endOffset], [block, block.childNodes.length]).replace(/\s+$/, '').slice(0, 40),
    };
    sel.removeAllRanges();
    selChip.hidden = true;
    showAgain();
    openId = null;
    begin(anchor);
    return true;
  };
  selChip.addEventListener('click', (e) => {
    e.stopPropagation();
    if (selRect) commentOnSelection();
  });
  // Computers: Shift + drag selects words (a plain drag marks an area); letting go opens a comment on them.
  document.addEventListener('mouseup', (e) => {
    if (on && !draft && e.shiftKey && e.button === 0 && !e.composedPath().includes(host)) setTimeout(commentOnSelection, 0);
  }, true);
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
    if (lastTouch && Date.now() - lastTouch < 800) return; // phones: a tap scrolls and reads; holding pins (below)
    if (e.altKey) e.preventDefault();
    else if (e.defaultPrevented || (e.target instanceof Element && e.target.closest(INTERACTIVE))) return;
    if (e.target instanceof Element && e.target.closest(OFF)) return;
    if (String(getSelection?.() || '').trim()) return;
    showAgain();
    begin(anchorAt(e.clientX, e.clientY));
  }

  // Scrolling an inner box or the page growing only moves the pins: their places are read together, then written.
  // A full redraw happens only when something is open (a card or a composer follows its pin) or the pins changed.
  const movePins = () => {
    const list = threads().filter((c) => c.anchor?.kind !== 'page');
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
    if (!pinCursorStyle.isConnected) document.head.append(pinCursorStyle);
    if (pageNow() === page) return;
    page = pageNow();
    seen = readSeen();
    syncReads();
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

  // A comment pin as the pointer over everything you can comment on (links and controls keep theirs): the white
  // teardrop with a +, clicking at its point. Holding Shift gives the text cursor back for selecting words.
  // It looks like your own pin: the white teardrop with your initial (a + before you've given a name). Go mode's is
  // the same shape in green with a white tick. Both point (bottom left) where the click lands.
  // Drawn once into PNGs (1x and 2x): browsers re-decode SVG pointers when the pointer changes, which flickers (Safari
  // most); a PNG pointer stays put. The SVG one shows only for the moment before the PNGs are ready.
  const pinCursorStyle = document.createElement('style');
  // The pointer itself is drawn (an element styled with CSS that follows the mouse), not an image: so it changes
  // smoothly, the pin turning green with a tick for go, and fading out where the system pointer takes over (links,
  // fields, the widget, Shift). Mice only; touch and pens keep what they had.
  const ptr = el('div', { class: 'ptr', 'aria-hidden': 'true' });
  ptr.append(el('span', { class: 'ini' }, '+'), el('span', { class: 'tick' }, '✓'));
  root.append(ptr);
  // It shows exactly where the system pointer is hidden (cursor: none from the rules above): never two pointers, never
  // none. That's checked on every move, and again when the page scrolls under a still mouse, Shift or Option is pressed,
  // or go or comments are switched.
  let mouse = null; // the last mouse position
  const place = (x, y, target) => {
    const h = document.documentElement;
    const show = Boolean(target) && target !== host && !host.contains(target) && getComputedStyle(target).cursor === 'none';
    ptr.classList.toggle('show', show);
    ptr.classList.toggle('go', goMode);
    ptr.style.transform = `translate(${x - 1}px, ${y - 27}px)`;
  };
  const recheck = () => mouse && requestAnimationFrame(() => mouse && place(mouse.x, mouse.y, document.elementFromPoint(mouse.x, mouse.y)));
  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    document.documentElement.classList.add('lab-drawn');
    mouse = { x: e.clientX, y: e.clientY };
    const t = e.composedPath()[0];
    place(e.clientX, e.clientY, t instanceof Element ? t : null);
  }, { capture: true, passive: true });
  addEventListener('scroll', recheck, { capture: true, passive: true });
  addEventListener('keydown', (e) => (e.key === 'Shift' || e.key === 'Alt') && recheck(), true);
  addEventListener('keyup', (e) => (e.key === 'Shift' || e.key === 'Alt') && recheck(), true);
  document.documentElement.addEventListener('mouseleave', () => ((mouse = null), ptr.classList.remove('show')));
  addEventListener('blur', () => ((mouse = null), ptr.classList.remove('show')));
  // No pictures: where the drawn pin can't show (an open dialog or full screen draws above it, or before the mouse first
  // moves) the system pointer is a plain crosshair for comments and the copy arrow for go.
  let cursorKey = '';
  function refreshPinCursor() {
    const ch = (initial(store.get('lab-name')) || '+').replace(/[<>&'"]/g, '');
    if (ch === cursorKey) return; // nothing changed: leave the pointers alone
    cursorKey = ch;
    ptr.querySelector('.ini').textContent = ch;
    // In a cascade layer, so a page's own pointers (a clickable card) still win over ours.
    const plain = `:not(${INTERACTIVE}, a *, button *, label *, [role="button"] *, [contenteditable], [contenteditable] *, ${OFF}, ${OFF} *, [data-lab-comments])`;
    const top = `dialog, dialog *, [popover], [popover] *, :fullscreen, :fullscreen *`;
    pinCursorStyle.textContent =
      `@layer lab-pointer { html.lab-pinning:not(.lab-shift) body, html.lab-pinning:not(.lab-shift) body *${plain} { cursor: crosshair; } ` +
      // With the drawn pointer the system one hides over plain parts of the page (not in the top layer, which is above it).
      `html.lab-drawn.lab-pinning:not(.lab-shift):not(.lab-dragging) body, html.lab-drawn.lab-pinning:not(.lab-shift):not(.lab-dragging) body *${plain}:not(${top}) { cursor: none; } ` +
      // The pointer is inherited, so places that aren't commented on name theirs: editable text a text cursor, a part
      // marked data-uncommentable the plain arrow (a pin pointer there would promise a comment that won't come).
      `html.lab-pinning body :is([contenteditable], [contenteditable] *) { cursor: text; } html.lab-pinning body :is(${OFF}, ${OFF} *) { cursor: auto; } }` +
      // Holding Option (Alt) pins links and controls too: the drawn pin shows over them (the system pointer hides).
      `html.lab-alt body, html.lab-alt body *:not([data-lab-comments], [data-lab-comments] *, ${OFF}, ${OFF} *) { cursor: crosshair !important; }` +
      `html.lab-drawn.lab-alt body, html.lab-drawn.lab-alt body *:not([data-lab-comments], [data-lab-comments] *, ${OFF}, ${OFF} *, ${top}) { cursor: none !important; }` +
      `html.lab-go:not(.lab-drawn) body, html.lab-go:not(.lab-drawn) body * { cursor: copy !important; }`;
  }
  fonts.textContent += '@property --lab-spin { syntax: "<angle>"; inherits: false; initial-value: 0deg; }';
  // Computers, comments on: a click or drag doesn't select the page's text; hold Shift to select (and quote) words.
  // Fields and editable text stay selectable.
  fonts.textContent += `@media (pointer: fine) { html.lab-pinning:not(.lab-shift) body > :not([data-lab-comments]), html.lab-pinning:not(.lab-shift) body > :not([data-lab-comments]) :not(input, textarea, select, [contenteditable], [contenteditable] *) { -webkit-user-select: none; user-select: none; } }`;
  // Letting go of Shift keeps text selectable a moment longer, so a selection made with it isn't dropped before its
  // comment opens.
  let shiftOff = 0;
  const shiftKey = (e) => {
    clearTimeout(shiftOff);
    if (e.shiftKey) document.documentElement.classList.add('lab-shift');
    else shiftOff = setTimeout(() => (document.documentElement.classList.remove('lab-shift'), recheck()), 400);
  };
  addEventListener('keydown', shiftKey, true);
  addEventListener('keyup', shiftKey, true);
  addEventListener('pointerdown', shiftKey, true);
  addEventListener('blur', () => document.documentElement.classList.remove('lab-shift'));
  fonts.textContent += 'html.lab-dragging, html.lab-dragging * { user-select: none !important; -webkit-user-select: none !important; cursor: crosshair !important; }';
  // While a sheet is open, a swipe down is the sheet's, not the browser's pull-to-refresh.
  fonts.textContent += 'html.lab-sheet, html.lab-sheet body { overscroll-behavior-y: none; }';
  // Phones: and the page behind stays put, even when the part of the sheet you drag on has nothing to scroll.
  fonts.textContent += '@media (pointer: coarse) { html.lab-sheet, html.lab-sheet body { overflow: hidden; } }';
  // Holding a finger on a link pins it (see Phones above): no link preview while comments are on.
  fonts.textContent += `html.lab-pinning body, html.lab-pinning body * { -webkit-touch-callout: none; }`;
  // Phones: with comments on, a hold is labfb's (a pin), not the start of a text selection: iOS would cancel the touch
  // for its selection, and the lift that lets the box open the keyboard would never come.
  // Nor the start of a drag: iOS lifts a held link or image to drag it, which cancels the touch the same way.
  fonts.textContent += `@media (pointer: coarse) { html.lab-pinning body > :not([data-lab-comments]) { -webkit-user-select: none; user-select: none; } html.lab-pinning body > :not([data-lab-comments]), html.lab-pinning body > :not([data-lab-comments]) * { -webkit-user-drag: none; } }`;
  const setAlt = (down) => document.documentElement.classList.toggle('lab-alt', Boolean(down));
  addEventListener('keydown', (e) => e.key === 'Alt' && setAlt(true), true);
  addEventListener('keyup', (e) => e.key === 'Alt' && setAlt(false), true);
  addEventListener('pointermove', (e) => setAlt(e.altKey), { capture: true, passive: true }); // Option pressed while another window had focus
  addEventListener('blur', () => setAlt(false));

  const start = () => {
    document.head.append(fonts, pinCursorStyle);
    refreshPinCursor();
    if (on) showHint();
    document.body.append(host);
    // The page's own selection while commenting, and the quoted words of an open text comment.
    // A soft green, so the quoted words stay readable in the page's own colour, on light and dark pages.
    const paint = 'background-color: rgba(52, 199, 89, .3); color: inherit;';
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
        if (kept.list) (listOpen = true), (filter = ['new', 'open', 'resolved', 'mine'].includes(kept.filter) ? kept.filter : filter);
        if (kept.chat) chatOpen = true;
        addEventListener('load', () => scrollTo(0, +(kept.y ?? kept)));
      }
    } catch {}
    // Hold a reload while anything is open (a thread, a new comment, the list) or a box has focus or text: the page
    // reloads once you close it, where you were.
    // A newer version reloads the page when it's safe: not while you read a thread, the list or the chat (it waits
    // until they're closed, so nothing moves under you), type, have words in a box, place a new comment, have a phone's
    // keyboard up or have just touched the page.
    let touchedAt = 0;
    for (const t of ['pointerdown', 'keydown', 'wheel', 'touchstart']) addEventListener(t, () => (touchedAt = performance.now()), { capture: true, passive: true });
    const busy = () =>
      draft || grabbing || openId || chatOpen || listOpen || (coarse && /^(textarea|input)$/.test(root.activeElement?.localName || '')) ||
      [...root.querySelectorAll('textarea')].some((t) => t.value.trim()) || performance.now() - touchedAt < 1500;
    let reloadWhenShown = false;
    const reload = () => {
      // A tab in the background doesn't reload on every save: it reloads once, when you come back to it.
      if (document.hidden) return void (reloadWhenShown = true);
      if (busy()) return setTimeout(reload, 500);
      try {
        sessionStorage.setItem(key, JSON.stringify({ y: scrollY, open: openId, list: listOpen, filter, chat: chatOpen }));
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
    root.querySelector('.left').prepend(who);
    let stream = null;
    let seen = null;
    let readsAt = null;
    // The server counts open tabs: a tab in the background still counts, and says bye when it closes, so closing
    // the page stops Claude listening.
    const tab = Math.random().toString(36).slice(2, 12);
    const connect = () => {
      if (stream) return; // background tabs stay connected too, so their title count and pins keep up
      stream = new EventSource(`${script.dataset.live}?tab=${tab}`);
      stream.onmessage = (e) => {
        const v = JSON.parse(e.data);
        if (String(v.files) !== script.dataset.version) return reload();
        if (seen !== null && v.comments !== seen) load(); // load() keeps typed text: it adds replies in place
        seen = v.comments;
        if (v.reads !== readsAt) (readsAt = v.reads), syncReads(); // read on another device with your name
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
        who.classList.toggle('working', mode === 'working');
        listBtn.dataset.agent = mode;
        chatBtn.dataset.agent = mode; // phones: with the list parked, the chat button carries the agent's light
        listBtn.title = who.textContent;
        who.setAttribute('aria-label', who.textContent); // the words stay for screen readers when only the light shows
        if (s?.url && mode !== 'away') Object.assign(who, { href: s.url, target: '_blank' });
        else who.removeAttribute('href');
        // No link, but a resume command (codex resume …): a tap copies it.
        who.dataset.copy = !s?.url && s?.resume && mode !== 'away' ? s.resume : '';
        who.title = mode === 'away' ? 'Ask your agent to run: npx @leonidstern/labfb wait' : s?.resume ? `${s.resume}${who.dataset.copy ? ' (tap to copy)' : ''}` : '';
        who.hidden = false;
      };
    };
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;
      if (reloadWhenShown) return reload();
      connect(); // back in front: reconnect if the browser dropped it meanwhile
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
