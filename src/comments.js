/*!
 * lab comments: click anywhere on a lab page to pin a comment. No login, just a name.
 * https://github.com/leonidstern/labit · PolyForm Small Business 1.0.0
 */
// The lab (local.mjs) puts this script on every page it serves. When comments are on, click anywhere that isn't a
// link or control to pin one (alt/option-click pins on those too); esc or a click outside closes an open comment.
// Dragging (mouse/pen) marks an area instead of a point. data-admin (this computer's browser) may resolve, move and delete.
import styles from './widget/styles.css';
import {
  bindAnchoring,
  anchorAt,
  drawZone,
  foundAt,
  goToBlock,
  inPage,
  ease,
  findTarget,
  markQuote,
  ms,
  nameLine,
  pageEnd,
  position,
  coveredAt,
  readable,
  readComponents,
  openingTag,
  selectorFor,
  short,
  wholeWords,
  zoneAnchor,
  zoneEl,
} from './widget/anchoring.ts';
import { anyWriting, bindComposer, composer } from './widget/composer.ts';
import { momentText } from '../lib/moment.mjs';
import { flushPins, heldPin, holdPin, letPin, newPass, readPins } from './widget/pinhold.ts';
import { bindMessages, stampOf } from './widget/messages.ts';
import { backFromReveal, bindSheets, backCloses, fromTap, holdKeyboard, leave, letGo, revealDraft, slideAway, startSheets, swipeDown } from './widget/sheets.ts';
import { bindList, drawList, goTo, lineOf, lineUp, ord, paintLines, stepMoved, stepNew, workState } from './widget/list.ts';
import { bindChat, drawChat, stamped } from './widget/chat.ts';
import { bindThread, flushPick, grab, openAsk, pickByKey, placeBeside, placeCard, threadCard, tieToPin } from './widget/thread.ts';
import { isTrying, pauseTry, placeAsk, relight } from './widget/trial.ts';
import { bindLive, startLive, MARK_PATHS } from './widget/live.ts';
import { inFrame, startFrame } from './widget/frame.ts';
import { bindSections, startSections } from './widget/sections.ts';
import { holdWhileOpen } from './widget/hold.ts';
import { inkAnchor, inkSvg, liveInk } from './widget/ink.ts';
import { NAME_MAX, SEED } from '../lib/actions.ts';
import { bindActions } from './widget/actions.ts';
import { bindInk, drawInks, inkCss, inkGone, inkRange, startInk } from './widget/wordink.ts';

(() => {
  // The widget's state, in one place, so its parts can live in their own files (src/widget/*) and share it.
  const state = { dbg: null }; // dbg: ?kbdebug's line into the phone's log (sheet drags)
  // Debug only (a page, e.g. a test, sets window.__labDebug before this loads): a change to what the page shows that no
  // render() follows within two frames goes into window.__labMissed, with where it was made. From the first render on;
  // a change left unredrawn on purpose says so with quiet(key). Otherwise S is the plain object and this costs nothing.
  const win = /** @type {any} */ (window);
  /** @type {Map<string | symbol, Error> | null} */
  let unseen = null;
  const quiet = (/** @type {string} */ k) => unseen?.delete(k);
  /** @type {any} */
  const S = !win.__labDebug
    ? state
    : new Proxy(state, {
        set(o, k, v) {
          o[k] = v;
          if (unseen && !unseen.has(k) && /^(openId|draft|chatOpen|comments|on|showDone|page|seen|cursorMode|isAdmin)$/.test(String(k))) {
            const e = Error(String(k));
            unseen.set(k, e);
            requestAnimationFrame(() => requestAnimationFrame(() => unseen?.get(k) === e && unseen.delete(k) && (win.__labMissed ||= []).push(e.stack)));
          }
          return true;
        },
      });
  const UNDO_MS = 3000; // a sent pin can be taken back this long (takeBack)
  S.undo = null; // { id, until, text, anchor, touched }: the pin this tab just sent, while undo is on offer
  S.quietOpen = false;
  // What the parts in src/widget/ use from here, read when they use it (getters: nothing is read before it exists).
  const W = {
    paintWho: /** @type {(() => void) | null} */ (null), // set by live.ts: the pill's words, painted again as the agent's work moves on
    get $() { return $; },
    get OFF() { return OFF; },
    get S() { return S; },
    get agentOf() { return agentOf; },
    get anchorAt() { return anchorAt; },
    get begin() { return begin; },
    get bar() { return bar; },
    get chatBtn() { return chatBtn; },
    get chatEl() { return chatEl; },
    get closeOrNudge() { return closeOrNudge; },
    get coarse() { return coarse; },
    get composer() { return composer; },
    get contentEnd() { return contentEnd; },
    get control() { return control; },
    get doneBtn() { return doneBtn; },
    get flag() { return flag; },
    get movedBtn() { return movedBtn; },
    get drawList() { return drawList; },
    get el() { return el; },
    get fonts() { return fonts; },
    get goBtn() { return goBtn; },
    get goFace() { return goFace; },
    get goTo() { return goTo; },
    get host() { return host; },
    get isNew() { return isNew; },
    get isPage() { return isPage; },
    get KEYS() { return KEYS; },
    get keyLabel() { return keyLabel; },
    get layer() { return layer; },
    get listBtn() { return listBtn; },
    get load() { return load; },
    get loadChanges() { return loadChanges; },
    get markSeen() { return markSeen; },
    get ms() { return ms; },
    get ease() { return ease; },
    get mine() { return mine; },
    get nameLine() { return nameLine; },
    get numberOf() { return numberOf; },
    get openSheet() { return openSheet; },
    get patchKids() { return patchKids; },
    get pinCursorStyle() { return pinCursorStyle; },
    get placeBar() { return placeBar; },
    get position() { return position; },
    get readable() { return readable; },
    get reflow() { return reflow; },
    letPin,
    get render() { return render; },
    get repliesOf() { return repliesOf; },
    get root() { return root; },
    get scrim() { return scrim; },
    get script() { return script; },
    get send() { return send; },
    get sheetMode() { return sheetMode; },
    get stampOf() { return stampOf; },
    get stamped() { return stamped; },
    get still() { return still; },
    get store() { return store; },
    get syncReads() { return syncReads; },
    get takeBack() { return takeBack; },
    UNDO_MS,
    get tabTitle() { return tabTitle; },
    get threads() { return threads; },
    get unread() { return unread; },
    get vv() { return vv; },
  };
  bindLive(W);
  bindSections(W);
  bindList(W);
  bindChat(W);
  bindThread(W);
  bindSheets(W);
  bindInk(W);
  const script = /** @type {HTMLScriptElement | null} */ (document.currentScript);
  // In a board's frame the widget draws nothing and binds nothing (src/widget/frame.ts).
  if (inFrame()) return startFrame(script);
  // Parts loaded only when they are used: each is its own file beside this script (scripts/build-widget.mjs), its
  // styles with it. Asked for once; a module that can't load leaves the rest of the widget as it is.
  const parts = {};
  /** @param {string} name */
  const part = (name) => (parts[name] ??= import(new URL(`${name}.js`, script?.src || location.href).href));
  // Shortcuts, action → key: these defaults, with what a project or you changed (labit.json or your settings.json
  // `shortcuts`, passed by the lab as data-keys; docs/settings.md).
  const KEYS = { toggle: 'm', comment: '1', chat: 't', next: 'w', pause: 'p', slow: 's', done: 'd', reply: 'r', resolve: 'e', pin: 'c' };
  try {
    Object.assign(KEYS, JSON.parse(script?.dataset.keys || '{}'));
  } catch {}
  // Your one list of actions (settings.json `actions`, passed as data-actions; lib/actions.ts, docs/settings.md): as many
  // chips as fit, the rest behind "…".
  const actButton = (name) => el('button', { type: 'button', 'data-k': name }, name);
  let LIST = SEED;
  try {
    const l = JSON.parse(script?.dataset.actions || 'null');
    if (Array.isArray(l)) LIST = l;
  } catch {}
  // The key pressed, as the settings name it: a digit by its place (Shift or AZERTY don't matter), a letter as typed
  // when it's Latin (QWERTZ and AZERTY move letters), else by its place (Cyrillic and other layouts).
  const keyOf = (e) => {
    const d = /^(Digit|Numpad)(\d)$/.exec(e.code || '');
    // Shift and a digit is the board's (⇧1 fit, ⇧2 100%, ⇧0): its key shows another character ("!"), which a plain 1 never does.
    if (d) return e.shiftKey && e.key !== d[2] ? '' : d[2];
    return /^[a-z]$/i.test(e.key || '') ? e.key.toLowerCase() : /^Key[A-Z]$/.test(e.code || '') ? e.code.slice(3).toLowerCase() : '';
  };
  const actionOf = (e) => Object.keys(KEYS).find((a) => KEYS[a] === keyOf(e)) || '';
  // A word with its key marked: in it, (c)hat, or after it when it doesn't hold the key, chat (x).
  const keyLabel = (word, key) => {
    const i = word.indexOf(key);
    return i >= 0 ? keyWord(word.slice(0, i), key, word.slice(i + 1)) : keyWord(`${word} `, key, '');
  };
  if (/** @type {any} */ (window).__labComments) return;
  /** @type {any} */ (window).__labComments = true;

  const API = '/_lab/api/comments';
  const pageNow = () => script?.dataset.page || location.pathname.replace(/\/+$/, '') || '/';
  S.page = pageNow();
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

  // Your name lives in localStorage, which is per origin — and every lab has its own port, so a name given to one
  // lab was a stranger to the next. The lab hands it over instead: this computer's remembered name, or, for a guest,
  // the name their one-time link carried. The browser still wins if it already knows one.
  const ME = script?.dataset.me || '';
  if (ME && !store.get('lab-name')) store.set('lab-name', ME);
  // Where to tell the lab a new name, so the next lab on this computer starts out knowing it.
  const MEAPI = script?.dataset.live ? script.dataset.live.replace(/live$/, 'me') : '';
  // What this lab is trying (lib/flags.ts): flag -> { name, on, project }. The ⋯ menu's Experiments list switches them
  // (this computer only, saved in your own settings); one the project's labit.json sets is shown there, not switched.
  const FLAGS = (() => { try { return JSON.parse(script?.dataset.flags || '{}'); } catch { return {}; } })();
  const flag = (name) => FLAGS[name]?.on === true;
  const FLAGSAPI = script?.dataset.live ? script.dataset.live.replace(/live$/, 'flags') : '';
  const ACTSAPI = script?.dataset.live ? script.dataset.live.replace(/live$/, 'api/actions') : ''; // your actions, from the "…" menu
  let meSent = ME;
  const rememberMe = (name) => {
    if (!MEAPI || !name || name === meSent) return;
    meSent = name;
    fetch(MEAPI, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) }).catch(() => {});
  };

  // The lab hands this computer's browser its admin key; a guest's page has none.
  const adminToken = script?.dataset.admin || '';

  S.comments = [];
  S.isAdmin = false;
  // Off by default: the page looks clean until someone turns comments on (button or c); remembered per browser.
  S.on = store.get('lab-on') ? store.get('lab-on') === '1' : script?.dataset.on === '1';
  // A board page (src/board/): a tap selects a frame; 1 (comment mode) pins the board.
  S.board = /^\/_board\/[^/]+$/.test(S.page);
  S.openId = null;
  S.closeFast = false; // the next redraw that closes a comment fades it out quickly instead of sliding it
  S.cardFull = false; // a comment pulled up to full height (the card is drawn anew on each redraw)
  S.draft = null; // { anchor, docX, docY }
  // An unsent comment is kept whole — the words (composer.ts) and the spot they were pinned to — so a page that
  // reloads under you, a dev server rebuilding it most of all, gives both back instead of eating them.
  const spotKey = () => `lab-spot:${S.page}`;
  // Kept with it: whether it is on selected words (the dialog, not the plain box) and the action picked. An older
  // spot, the bare anchor, comes back as a plain box.
  const keepSpot = (anchor) => store.set(spotKey(), anchor ? JSON.stringify({ anchor }) : '');
  // The unsent comment kept (words and spot), as a draft that comes back with no motion; none when nothing was typed.
  const keptDraft = () => {
    try {
      const k = JSON.parse(store.get(spotKey()) || 'null');
      return k && store.get(`lab-typing:${S.page}:new`) ? { ...(k.anchor ? k : { anchor: k }), back: true } : null;
    } catch {
      return null;
    }
  };

  // ---------- DOM ----------
  const host = document.createElement('div');
  host.setAttribute('data-lab-comments', '');
  host.style.cssText = 'position:absolute;top:0;left:0;width:0;height:0;z-index:2147483000;';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>${styles}</style>
    <div class="scrim"></div>
    <div class="layer"></div>
    <div class="motions"></div>
    <div class="ui"><div class="hint" role="status" hidden>click to comment · drag to mark an area · shift-drag to quote words · ${KEYS.chat} chat · ${KEYS.next} new · ${KEYS.comment} comment / pointer · ${KEYS.toggle} hide</div>
    <div class="list chatwin" hidden><div class="tabs"><b>chat</b></div><div class="msgs"></div><div class="chat"></div></div>
    <div class="left"><button class="secondary copy-all" type="button" hidden>copy link</button></div>
    <div class="bar">
      <button class="secondary chat-btn" type="button" hidden title="chat (T)">chat</button>
      <button class="secondary list-btn" type="button" hidden>list</button>
      <button class="secondary done-btn" type="button" hidden title="show or hide done pins on the page"></button>
      <button class="secondary moved-btn" type="button" hidden title="pins whose spot is gone from the page: open one to drop it on a new spot, or close it"></button>
      <button class="secondary over-btn" type="button" aria-pressed="false" title="a click on the page's own links and buttons places a comment too, instead of being theirs (option-click always does)">pin over controls</button>
      <button class="secondary go-btn" type="button" hidden title="1 switches between comment and pointer (clicks are the page's own)">mode</button>
      <button class="toggle" type="button"></button>
      <button class="secondary more" type="button" hidden aria-label="more options" aria-expanded="false" aria-controls="lab-more">⋯</button>
    </div>
    <div class="more-menu" id="lab-more" hidden></div></div>`;
  // The widget's own parts, which are always there: typed as HTML elements.
  /** @param {string} sel @param {ParentNode} [box] */
  const $ = (sel, box = root) => /** @type {HTMLElement} */ (box.querySelector(sel));
  const layer = $('.layer');
  const hint = $('.hint');
  // Leaving: the card's exit (lab-out: fades and sinks 2 px, quick, in curve) for a card closing at once, the ⋯ menu,
  // ⌘K and the hint, as they all come in with lab-in / lab-fade; then `hide`. With reduced motion quick is 0 ms.
  const goOut = (/** @type {HTMLElement | null} */ node, /** @type {() => void} */ hide) => {
    if (!node || node.classList.contains('out')) return;
    if (node.hidden) return hide();
    node.classList.remove('in');
    node.classList.add('out');
    setTimeout(() => {
      if (!node.classList.contains('out')) return; // shown again meanwhile
      node.classList.remove('out');
      hide();
    }, ms('quick'));
  };
  if (matchMedia('(pointer: coarse)').matches) hint.textContent = 'hold to comment';
  const toggleBtn = $('.toggle');
  const bar = /** @type {HTMLElement} */ (root.querySelector('.bar'));
  const moreBtn = $('.more');
  const moreMenu = $('.more-menu');
  const copyBtn = $('.copy-all');
  // The bar's "new" pill: J/K step through the new comments, R replies, E resolves.
  const listBtn = /** @type {HTMLButtonElement} */ ($('.list-btn'));
  const goBtn = $('.go-btn');
  const doneBtn = /** @type {HTMLButtonElement} */ ($('.done-btn'));
  const motions = $('.motions');
  const movedBtn = /** @type {HTMLButtonElement} */ ($('.moved-btn'));
  const overBtn = $('.over-btn');
  const tabTitle = { base: '' };
  // Done pins show unless hidden (Leo, 17 Nov): closed ones are faded on the page, and D hides them.
  S.showDone = store.get('lab-hide-done') !== '1';
  const toggleDone = () => {
    S.showDone = !S.showDone;
    store.set('lab-hide-done', S.showDone ? '' : '1');
    render();
  };
  const chatEl = $('.chatwin');
  const chatBtn = /** @type {HTMLElement} */ (root.querySelector('.chat-btn'));
  S.refit = () => {}; // phones: fit the sheets to the keyboard again (below)
  S.chatOpen = false;

  const el = (tag, attrs = {}, text) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (text instanceof Node) node.append(text); // an icon
    else if (text != null) node.textContent = text;
    return node;
  };

  // ---------- anchoring (src/widget/anchoring.ts) ----------
  bindAnchoring({ host, layer, el });
  // Which component drew what a pin is on (components.ts, React, Vue, Svelte): its own file, loaded once the page shows
  // it was drawn by one of them: at start, at load, or the first element the pointer goes over that says so. A pin
  // reads it at once (anchorAt doesn't wait), so it is there before the first click.
  /** @param {any} n */
  const drawnByFramework = (n) => Boolean(n && (n.__vueParentComponent || n.__svelte_meta || Object.keys(n).some((k) => k.startsWith('__react'))));
  /** @param {Iterable<Element | EventTarget | null>} nodes */
  const lookForFramework = (nodes) => {
    if (S.components) return;
    for (const n of nodes) {
      if (!drawnByFramework(n)) continue;
      removeEventListener('pointerover', overFramework, true);
      S.components = part('components').then((m) => readComponents(m.componentAt), () => (S.components = null));
      return;
    }
  };
  /** @param {PointerEvent} e */
  const overFramework = (e) => lookForFramework([e.target]);
  const scanForFramework = () => lookForFramework([document.body, ...document.querySelectorAll('body > *, body > * > *, body > * > * > *')]);
  // The message box and a message's small pieces (src/widget/composer.ts, messages.ts). Arrows, so helpers defined
  // further down are read when called.
  bindComposer({ el, store, root, ms, ease, refreshPinCursor: () => refreshPinCursor(), syncReads: () => syncReads(), rememberMe, whileWriting: () => setPinning() });
  bindMessages({ el, mine: (c) => mine(c), repliesOf: (id) => repliesOf(id), lineUp, ord });
  startInk(); // comments on selected words show as ink on them, not a pin (src/widget/wordink.ts)

  // Puts `next` into `box` in order, touching only what changed: nodes already in place stay (a node taken out and put
  // back restarts its animations, which showed as a blink), new ones go in where they belong, the rest come out.
  function patchKids(box, next) {
    const keep = new Set(next);
    for (const n of Array.from(box.childNodes)) if (!keep.has(n)) n.remove();
    let at = box.firstChild;
    for (const n of next) {
      if (n === at) at = at.nextSibling;
      else box.insertBefore(n, at);
    }
  }

  // Which agent wrote a message, for its brand colour: the session's kind, else the first word of its name.
  const AGENT_KINDS = ['claude', 'codex', 'cursor', 'gemini', 'antigravity', 'copilot', 'amp', 'opencode'];
  const agentOf = (m) => {
    if (!m?.session) return '';
    const k = String(m.session.kind || m.name || '').trim().split(/\W/)[0].toLowerCase();
    return AGENT_KINDS.includes(k) ? (k === 'antigravity' ? 'gemini' : k) : '';
  };

  // ---------- data ----------
  const headers = () => ({ 'content-type': 'application/json', ...(adminToken ? { 'x-lab-admin': adminToken } : {}) });

  S.loaded = false;
  // A box has the cursor (not a pin: a pin now stays the same element across redraws, so in Chrome, where a clicked
  // button keeps focus, a clicked pin held every later redraw back).
  const typed = () => /^(textarea|input)$/.test(root.activeElement?.localName || '') || Boolean(/** @type {HTMLElement | null} */ (root.activeElement)?.isContentEditable) || [...root.querySelectorAll('textarea')].some((t) => t.value.trim());
  async function load() {
    try {
      const res = await fetch(`${API}?page=${encodeURIComponent(S.page)}`, { headers: headers(), cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      S.comments = data.comments || [];
      S.isAdmin = Boolean(data.admin);
      // A thread you were part-way through writing in opens again: the page may have reloaded under you
      // (a dev server rebuilding) and the words are kept, so the box they belong to comes back with them.
      if (!S.loaded && !S.openId) {
        const half = S.comments.find((c) => !c.parent && store.get(`lab-typing:${S.page}:${c.id}`));
        if (half) S.openId = half.id;
        // A comment that was being written but never sent: its words and its spot both come back.
        else if (!S.draft) S.draft = keptDraft();
      }
      S.loaded = true;
      setTimeout(found, 3000);
    } catch {
      // Keep what is already on screen when a refresh fails.
    }
    shownAgain();
  }
  // A pin found again somewhere else than its saved path (the page changed around it) says where it is now, so the
  // next look and the agent's text start from there. Once per pin and page load, once the page has settled, and only
  // from a browser that may move the pin.
  const looked = new Set();
  const found = () => {
    for (const c of document.readyState === 'complete' ? threads() : []) {
      const edit = store.get(`lab-edit:${c.id}`) || undefined;
      if (c.resolved || looked.has(c.id) || !(S.isAdmin || edit) || !c.anchor?.selector) continue;
      looked.add(c.id);
      const anchor = foundAt(c.anchor);
      if (anchor) send({ action: 'move', id: c.id, found: true, anchor, edit }).then(({ comment }) => Object.assign(c, comment), () => {});
    }
  };
  // Only what changed since comments version `since` (local labs): a reply costs ~1 KB, not the page's whole list.
  // Anything odd (a gap, an error, an old lab) falls back to the whole list.
  async function loadChanges(since) {
    try {
      const url = new URL('/_lab/api/changes', new URL(API, location.href));
      url.search = String(new URLSearchParams({ page: S.page, since: String(since) }));
      const res = await fetch(url, { cache: 'no-store' });
      const data = res.ok ? await res.json() : { full: true };
      if (data.full || !S.loaded) return load();
      const gone = new Set(data.del);
      const fresh = new Map(data.set.map((c) => [c.id, c]));
      S.comments = S.comments.filter((c) => !gone.has(c.id)).map((c) => fresh.get(c.id) || c);
      const had = new Set(S.comments.map((c) => c.id));
      for (const c of data.set) if (!had.has(c.id)) S.comments.push(c);
      S.comments.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    } catch {
      return load();
    }
    shownAgain();
  }
  function shownAgain() {
    if (!typed() && !S.grabbing) render();
    // Someone is in a box: the open thread gets its new replies in place, the chat its new messages (its box is left
    // alone); everything else shows on the next render.
    else {
      quiet('comments'); // drawn on the next render, not under the cursor
      if (S.openCard?.isConnected) S.openCard.sync();
      if (S.chatOpen) drawChat();
      drawList(); // the bar's counts and the tab's "(3)" keep up even while a box has the cursor (a tab left in the background)
      S.paintSections?.(); // and the section bar's ink for unread pins
    }
  }

  // While the agent works on something, every 10 s: the ages in the pill, the sheets' lines and the tooltips move on, and a
  // pin that has gone 5 minutes without a sign turns grey (a pin changing state is drawn again, as with any change).
  const BUSY = new Set(['now', 'got', 'wait', 'stale']);
  setInterval(() => {
    if (document.hidden || !S.on) return;
    S.line = null;
    const now = lineUp();
    if (![...now.values()].some((e) => BUSY.has(e.s))) return;
    if ([...now].some(([id, e]) => pinsById.has(id) && S.rings.get(id) !== e.s)) return shownAgain();
    W.paintWho?.();
    paintLines();
    for (const [id, pin] of pinsById) {
      const tip = pin.querySelector('.tip');
      if (tip) tip.textContent = lineOf(now.get(id));
    }
  }, 10000);

  // Pointer (key 1 switches to it and back): pins stay shown, but a click is the page's own (follow a link, try a button): nothing is pinned.
  // Option-click still pins. 1 comment leaves it.
  S.cursorMode = store.get('lab-cursor') === '1' || S.board; // a board opens as a pointer; 1 is the comment mode, and not remembered
  // The page's own links and buttons keep their clicks, so a demo or a card still works while comments are on
  // (Leo, 16 Nov). With this on they do not: a click there places a comment, as option-click always has.
  S.overControls = store.get('lab-over') === '1';
  // While it is off the item shows how to pin over a control anyway, once: option-click (Leo, 17 Nov).
  const OPTION = /Mac|iP(hone|ad|od)/.test(navigator.platform) ? '⌥' : 'alt';
  const sayOver = () => {
    overBtn.replaceChildren(S.overControls ? 'controls keep clicks' : 'pin over controls', ...(S.overControls ? [] : [el('kbd', { 'aria-hidden': 'true' }, `${OPTION} click`)]));
    overBtn.setAttribute('aria-pressed', String(S.overControls));
  };
  const setOver = (v) => {
    S.overControls = v;
    store.set('lab-over', v ? '1' : '');
    sayOver();
    setPinning(); // the pointer over controls follows the switch (lab-over)
    S.ctlTarget = null; // what the mouse is over is worked out again: the answer has just changed
    S.recheckCtl?.(); // without waiting for the mouse to move
    setPinning();
  };
  sayOver();
  // Switching only changes the button and the pointer: nothing on the page is redrawn, so nothing flickers.
  // Whether a click on the page would place something: comments on, not in cursor mode, and not while you are
  // writing one — mid-sentence the page's own pointer is what you want, not a second pin waiting to be dropped.
  const setPinning = () => {
    const placing = S.on && !S.cursorMode && !anyWriting() && !S.draft; // an open new comment, empty or not, gives the page its own pointer (Leo, 18 Nov)
    document.documentElement.classList.toggle('lab-pinning', placing);
    // "Pin over controls" on: the page's own links, buttons and clickable cards show the pin too, not their hand: a click
    // there pins, so the pointer says so (Leo, 17 Nov: "still controls giving me hand").
    document.documentElement.classList.toggle('lab-over', placing && S.overControls);
    recheck();
  };
  const setCursor = (v) => {
    S.cursorMode = v;
    quiet('cursorMode'); // the button and the pointer change; nothing is redrawn
    if (!S.board) store.set('lab-cursor', v ? '1' : '');
    goBtn.classList.toggle('cursor', v);
    goFace();
    setPinning();
  };
  // A thread or the chat opened at its newest message stays there while its words settle (a phone's sheet grows into
  // place and long messages lay out after the first frame): Leo, 20 Nov, the last message was half hidden. It lets go at
  // the first touch or wheel, or after a second.
  function stayAtEnd(box) {
    let until = performance.now() + 1000;
    const stop = () => (until = 0);
    box.addEventListener('touchstart', stop, { once: true, passive: true });
    box.addEventListener('wheel', stop, { once: true, passive: true });
    const end = () => (performance.now() < until ? (box.scrollTop = box.scrollHeight) : ro?.disconnect());
    const ro = 'ResizeObserver' in window ? new ResizeObserver(end) : null;
    ro?.observe(box);
    for (const k of box.children) ro?.observe(k);
    requestAnimationFrame(() => requestAnimationFrame(end));
    setTimeout(() => ro?.disconnect(), 1100);
  }
  S.stayAtEnd = stayAtEnd;
  function begin(anchor) {
    if (!anchor.moment) {
      const moment = S.momentFor?.(anchor); // the moment as the pin goes down, not as it is sent
      if (moment) anchor = { ...anchor, moment };
    }
    S.draft = { anchor };
    keepSpot(anchor);
    render();
  }
  // Sent once the lab answers: while it can't be reached (restarting, the laptop just woke), the message waits and is
  // tried again every 2 s for up to 5 minutes, instead of failing. Only a lab that answers with an error fails it.
  async function send(payload) {
    let res = null;
    // A new comment or reply carries a nonce, so a retry after a lost answer can't save it twice.
    // Paused when written: the agent is told, with the moment (a loop's pass and second, a video's time, lib/moment.mjs).
    // The page stays paused after (Leo, 19 Nov: "dont need to play again"): pause, pin, pin again, play when you like.
    if (S.paused && payload.anchor && !payload.action) payload = { ...payload, anchor: { ...payload.anchor, paused: true, atMs: msOf(pausedEl(payload.anchor)) } };
    const moment = payload.anchor && !payload.action && !payload.anchor.moment ? momentFor(payload.anchor) : undefined;
    if (moment) payload = { ...payload, anchor: { ...payload.anchor, moment } };
    if ((S.slow || slowEls.size > 0) && payload.anchor && !payload.action) payload = { ...payload, anchor: { ...payload.anchor, slow: true } }; // at ¼ speed
    if (!payload.action && !payload.nonce) payload = { ...payload, nonce: Math.random().toString(36).slice(2) + Date.now().toString(36) };
    for (let tries = 0; !res; tries++) {
      try {
        // A pick (thread.ts) may go as the page is hidden or closed: keepalive lets the request finish.
        res = await fetch(API, { method: 'POST', headers: headers(), body: JSON.stringify({ page: S.page, ...payload }), keepalive: payload.picked !== undefined });
      } catch {
        if (tries >= 150) throw new Error("couldn't reach the lab; your text is still here");
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `could not save (${res.status})`);
    // A new pin or go from this tab can be taken back with Command-Z (the newest first).
    if (data.comment && !payload.parent && !payload.action && payload.anchor?.kind !== 'page') placed.push(data.comment.id);
    return data;
  }
  const placed = [];
  // Undo, 3 s after a new pin is sent (Leo, 19 Nov): its card opens with "undo" in the resolve key's place (thread.ts).
  // A tap deletes it (this computer as admin, anyone else with the pin's own key, which the lab takes for a fresh pin
  // nobody answered) and closes the card: no comment box, no words kept anywhere.
  // An agent may have been handed it already (the lab hands pins after batchSeconds, 2 s): it is gone on its next look.
  async function takeBack(c) {
    const u = S.undo;
    if (!u || u.id !== c.id) return;
    const ownKey = store.get(`lab-edit:${c.id}`);
    await send({ action: 'delete', id: c.id, ...(ownKey && !S.isAdmin ? { edit: ownKey } : {}) });
    S.undo = null;
    S.comments = S.comments.filter((x) => x.id !== c.id && x.parent !== c.id);
    if (ownKey) store.set(`lab-edit:${c.id}`, '');
    const at = placed.indexOf(c.id);
    if (at >= 0) placed.splice(at, 1);
    // Gone for good (Leo, 19 Nov: "undo should not leave text in input"): the card closes, no box, no kept words.
    S.openId = null;
    S.draft = null;
    store.set(`lab-typing:${S.page}:new`, '');
    keepSpot(null);
    render();
  }
  // Command-Z (Control-Z elsewhere), not in a text box: the last pin or go placed from this tab goes away. This
  // computer deletes it; a guest, who can't delete, resolves it (it steps aside).
  async function undoLast() {
    const id = placed.pop();
    const c = id && S.comments.find((x) => x.id === id);
    if (!c) return;
    const ownKey = store.get(`lab-edit:${id}`);
    try {
      if (S.isAdmin) {
        await send({ action: 'delete', id });
        S.comments = S.comments.filter((x) => x.id !== id && x.parent !== id);
      } else if (ownKey) {
        const { comment } = await send({ action: 'resolve', id, edit: ownKey });
        Object.assign(c, comment);
      } else return void placed.push(id);
    } catch {
      return void placed.push(id); // not taken back: it stays next in line
    }
    if (S.openId === id) S.openId = null;
    render();
    say(`took back a pin · ${placed.length ? 'again for the one before' : 'nothing more to take back'}`);
  }
  // Option-click on a pin: its thread is resolved, or opened again, without opening its card (Leo, 17 Nov). For whoever
  // may resolve it, as in the card: this computer, and whoever started the thread (its key is kept in their browser).
  const autoShut = new Set();
  const mayResolve = (c) => S.isAdmin || Boolean(store.get(`lab-edit:${c.id}`));
  function toggleResolved(c) {
    const ownKey = store.get(`lab-edit:${c.id}`);
    const reopen = Boolean(c.resolved);
    send({ action: reopen ? 'reopen' : 'resolve', id: c.id, ...(ownKey ? { edit: ownKey } : {}) }).then(
      ({ comment }) => {
        Object.assign(c, comment);
        if (!reopen && S.openId === c.id) { // as its resolve button closes it
          S.closeFast = true;
          S.openId = null;
        }
        render();
        say(reopen ? 'open again' : 'resolved');
      },
      () => say("couldn't save that, try again"),
    );
  }
  // A short note in the hint strip (an undo, a copied link), then the strip goes back to its own words.
  const said = { was: undefined, t: undefined };
  function say(words) {
    said.was ??= hint.textContent;
    hint.textContent = words;
    hint.classList.remove('out');
    hint.hidden = false;
    clearTimeout(said.t);
    said.t = setTimeout(() => goOut(hint, () => {
      hint.hidden = true;
      hint.textContent = said.was;
      said.was = undefined;
    }), 1800);
  }

  // ---------- copy for an agent ----------
  // The link an agent reads: every open comment on this page as plain text.
  const agentLink = () => new URL('/_lab/agent' + S.page, new URL(API, location.href)).href;

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
    if (moreMenu.contains(button)) return say('link copied'); // the ⋯ menu closes on a pick: say it in the hint strip
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
  // Everyone sees done threads the same way (a guest's resolved pin vanished at once, with the answer in it unread):
  // done ones with nothing new step aside, and show done brings them back.
  // A declaration, not a const: on a board page the live state arrives while the widget is still setting up, and the
  // pill's line reads the threads then (it threw "Cannot access 'threads' before initialization" and the board stopped).
  function threads() { return (S.comments || []).filter((c) => !c.parent); }
  const isPage = (c) => c.anchor?.kind === 'page'; // about the page as a whole: no pin; it lives in the chat
  // prev / next / J / K: the thread swaps in place, no slide; the keyboard stays as it was (up stays up, down stays down).
  S.stepping = false;
  S.keepKeys = false;
  // Done: resolved, or answered "Done: …" by someone other than its author (the agent).
  // Done means the same everywhere (the list, the pins, show done): what workState says.
  // Computers (Leo, 2026-11-15, option 1b): one bar of segments (chat, new, go, ⋯) at the bottom right; the less used
  // ones (show done, copy link, hide) sit in the ⋯ menu. Comments hidden: the bar is just "comments". Phones keep theirs.
  // A word with its key marked inside it, as in menus: (c)hat, ne(w).
  const keyWord = (before, key, after) => {
    const w = el('span', { class: 'kw' });
    w.append(before, el('span', { class: 'mn', 'aria-hidden': 'true' }, `(${key})`), after);
    return w;
  };
  // Which labit this is, at the very foot of the ⋯ menu (the lab passes it as data-labit), so labs on different
  // builds can be told apart at a glance.
  const versionLine = script?.dataset.labit ? el('div', { class: 'labit-version' }, script.dataset.labit) : null;
  // A newer release (a lab from npm, on this computer): "update" in the menu. It asks the agent in the chat, as an
  // action: the agent says what's new and runs labit update. Nothing changes on its own (Leo, 19 Nov).
  let update = null;
  try {
    update = script?.dataset.admin && script.dataset.update ? JSON.parse(script.dataset.update) : null;
  } catch {}
  // A small "update" beside the version line (Leo, 19 Nov), not a menu item of its own.
  const updateBtn = update && versionLine && el('button', { type: 'button', class: 'update-btn', title: `update to labit ${update.version}` }, 'update');
  if (updateBtn) versionLine.append(' · ', updateBtn);
  updateBtn?.addEventListener('click', async () => {
    setMenu(false);
    const act = `update labit to ${update.version}`;
    try {
      const { comment } = await send({ name: store.get('lab-name') || '', text: act, anchor: { kind: 'page', width: innerWidth, height: innerHeight, act } });
      S.comments.push(comment);
      S.chatOpen = true;
      render();
    } catch {}
  });
  // Labs & pages (⌘K, src/widget/switcher.ts): local labs only. The menu opens with which lab this is, then the item.
  const LABS = script?.dataset.live ? script.dataset.live.replace(/live$/, 'labs') : '';
  // Labs & pages is its own file, loaded and set up the first time it is asked for (⌘K, or the ⋯ menu opening); labs:
  // the module, once it is.
  /** @type {any} */
  let labs = null;
  const switcher = () => (S.switcher ??= part('switcher').then((m) => {
    m.bindSwitcher({
      root, el, api: LABS, admin: script?.dataset.admin || '', page: S.page, beforeOpen: () => {
        setMenu(false);
        if (coarse) S.chatOpen = false; // one sheet at a time on a phone
      },
      // Phones: labs & pages is a sheet like the list and the chat (see openSheet); a computer keeps its box over the page.
      sheet: (open) => {
        S.labsOpen = open;
        render();
      },
      swipe: swipeDown,
      leave: goOut,
    });
    return (labs = m);
  }).catch(() => (S.switcher = null))); // couldn't load: nothing opens, and the next ask tries again
  const labHead = LABS ? el('div', { class: 'lab-head' }, `${script?.dataset.labName || 'lab'} · ${location.port || '80'}`) : null;
  const labsBtn = LABS ? el('button', { type: 'button', class: 'labs-btn' }) : null;
  if (labsBtn) {
    labsBtn.append('labs & pages', el('kbd', { 'aria-hidden': 'true' }, navigator.platform.startsWith('Mac') ? '⌘K' : 'ctrl K'));
    // The menu closes without taking the focus back to ⋯ (its own click handler would, after the box opened, and on a
    // phone that blurred the search and bounced the keyboard).
    labsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      setMenu(false);
      void switcher().then((m) => m?.openSwitcher());
    });
  }
  // Experiments (lib/flags.ts) in the ⋯ menu: "experiments" with how many are on; a click turns the menu into the list,
  // a switch a flag with its one line, and a back row at its head. A switch saves in your own settings (every lab you
  // run) and applies at once: the lab tells every open page, which starts what came on and reloads for what went off.
  // A flag the project's labit.json sets wins over yours: shown, not switched. A guest sees the switches, greyed.
  const flagNames = Object.keys(FLAGS);
  const mayFlag = Boolean(adminToken && FLAGSAPI);
  let expOpen = false;
  const expBtn = flagNames.length && script?.dataset.live ? el('button', { type: 'button', class: 'exp-btn', 'aria-haspopup': 'true' }) : null;
  const expBack = el('button', { type: 'button', class: 'exp-back' }, '‹ experiments');
  const expNote = el('div', { class: 'exp-note' }, 'only the computer running the lab switches these');
  const expRows = flagNames.map((name) => {
    const b = /** @type {HTMLButtonElement} */ (el('button', { type: 'button', class: 'exp', role: 'switch', 'data-flag': name }));
    const words = el('span', { class: 'exp-words' }, FLAGS[name].name);
    if (FLAGS[name].project) words.append(el('span', { class: 'exp-why' }, "set by the project's labit.json"));
    b.append(words, el('span', { class: 'exp-sw', 'aria-hidden': 'true' }));
    b.disabled = !mayFlag || Boolean(FLAGS[name].project);
    b.addEventListener('click', async (e) => {
      e.stopPropagation(); // the menu stays open: one pick doesn't close it here
      if (b.disabled) return;
      const on = !flag(name);
      b.setAttribute('aria-checked', String(on)); // at once; FLAGS follows the lab's answer
      try {
        const r = await fetch(FLAGSAPI, { method: 'POST', headers: headers(), body: JSON.stringify({ flag: name, on }) });
        if (!r.ok) throw new Error(await r.text());
        S.syncFlags((await r.json()).flags, () => location.reload());
      } catch {
        drawExperiments();
        say("couldn't switch it: is the lab running?");
      }
    });
    return b;
  });
  function drawExperiments() {
    if (!expBtn) return;
    const n = flagNames.filter(flag).length;
    expBtn.replaceChildren('experiments', el('span', { class: `exp-cnt${n ? '' : ' zero'}` }, String(n)));
    expBtn.setAttribute('aria-label', `experiments, ${n} on`);
    for (const b of expRows) b.setAttribute('aria-checked', String(flag(b.dataset.flag)));
  }
  drawExperiments();
  const showExperiments = (open) => {
    expOpen = open;
    placeBar();
    (open ? expRows.find((b) => !b.disabled) || expBack : expBtn)?.focus({ preventScroll: true });
  };
  expBtn?.addEventListener('click', (e) => (e.stopPropagation(), showExperiments(true)));
  expBack.addEventListener('click', (e) => (e.stopPropagation(), showExperiments(false)));
  // A flag's feature, started once. One that goes off can't be
  // taken back out of a running page: the page reloads (when it's safe) and comes back without it.
  const started = new Set();
  const startFlag = (name) => {
    if (started.has(name) || !host.isConnected) return;
    started.add(name);
    if (name === 'inkOnText' && S.loaded) render(); // switched on from the ⋯ menu: the notes on words turn to ink (wordink.ts)
  };
  // The lab's word on which flags are on (live stream, or the answer to a switch here).
  S.syncFlags = (on, reload) => {
    let gone = false;
    for (const [name, f] of Object.entries(FLAGS)) {
      const now = on.includes(name);
      if (f.on === now) continue;
      f.on = now;
      if (now) startFlag(name);
      else if (started.has(name)) gone = true;
    }
    drawExperiments();
    if (gone) reload();
  };
  function placeBar() {
    const inMenu = !S.on ? []
      : expOpen ? [expBack, ...expRows, ...(mayFlag ? [] : [expNote])]
      : [...(labHead ? [labHead, labsBtn] : []), doneBtn, movedBtn, overBtn, copyBtn, toggleBtn, ...(expBtn ? [expBtn] : []), ...(versionLine ? [versionLine] : [])];
    // In this order every time: a part that came back (hide comments, after showing them again) went to the end, below
    // the version line.
    // The Experiments list swaps the menu's items for its own, so the menu is set whole, not only added to.
    if (S.on && (inMenu.some((b, i) => moreMenu.children[i] !== b) || moreMenu.children.length !== inMenu.length)) moreMenu.replaceChildren(...inMenu);
    if (!S.on && toggleBtn.parentNode !== bar) bar.insertBefore(toggleBtn, moreBtn);
    if (!S.on) root.querySelector('.left').append(copyBtn);
    moreBtn.hidden = !S.on;
    if (!S.on && !moreMenu.hidden) setMenu(false);
    // The first segment shown has no line before it.
    let first = true;
    for (const b of /** @type {HTMLCollectionOf<HTMLElement>} */ (bar.children)) {
      b.classList.toggle('first', first && !b.hidden);
      if (!b.hidden) first = false;
    }
  }
  // The switch shows what a click will place: your comment pin (your initial) or nothing (the pointer); key 1 (or a click) flips it.
  function goFace() {
    const gp = goBtn.querySelector('.gp');
    if (gp) gp.textContent = initial(store.get('lab-name')) || '+';
    // Read out as what a click places, not the letter on it.
    goBtn.setAttribute('aria-label', `a click places: ${S.cursorMode ? 'nothing (pointer)' : 'a comment'}`);
    goBtn.setAttribute('aria-keyshortcuts', KEYS.comment);
  }
  // The work tab: what the agent is on now (handed to it, not answered yet, or answered "On it"), what's next (sent,
  // not handed yet) and what's done today (resolved, or answered "Done"), from what the lab records on each thread.
  S.newFrom = null;
  // Open comments are numbered 1, 2, 3… in order, the same for everyone, admins and the agent text.
  const numberOf = (c) =>
    S.comments
      .filter((x) => !x.parent && !x.resolved)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .indexOf(c) + 1;

  // Unread: comments and replies by someone else that this browser hasn't opened yet (kept per page).
  const seenKey = () => `lab-seen:${S.page}`;
  const readSeen = () => new Set(store.get(seenKey()).split(',').filter(Boolean));
  S.seen = readSeen();
  // Yours is never new: your name (any case or spacing), or a pin this browser started (it keeps its edit key).
  const plain = (n) => String(n || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const mine = (c) => (plain(c.name) && plain(c.name) === plain(store.get('lab-name'))) || Boolean(store.get(`lab-edit:${c.id}`));
  const isNew = (c) => !S.seen.has(c.id) && !mine(c);
  const unread = (c) => [c, ...repliesOf(c.id)].filter(isNew);
  const markSeen = (items) => {
    const fresh = items.filter((item) => !S.seen.has(item.id)).map((item) => item.id);
    for (const item of items) S.seen.add(item.id);
    store.set(seenKey(), [...S.seen].join(','));
    if (fresh.length) shareReads(fresh);
  };
  // On a local lab, what's read is shared by name: your phone and your Mac (the same name) show the same new and read.
  const READS = script?.dataset.live ? script.dataset.live.replace(/live$/, 'api/reads') : '';
  const shareReads = (ids) => {
    const who = store.get('lab-name').trim();
    if (!READS || !who || !ids.length) return;
    fetch(READS, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: who, page: S.page, ids }) }).catch(() => {});
  };
  async function syncReads() {
    const who = store.get('lab-name').trim();
    if (!READS || !who) return;
    const at = S.page;
    try {
      const { ids } = await (await fetch(`${READS}?name=${encodeURIComponent(who)}&page=${encodeURIComponent(at)}`, { cache: 'no-store' })).json();
      if (at !== S.page) return;
      const theirs = new Set(ids);
      const mineOnly = [...S.seen].filter((id) => !theirs.has(id));
      const added = ids.filter((id) => !S.seen.has(id));
      if (mineOnly.length) shareReads(mineOnly); // read here before: the other devices get it too
      if (!added.length) return;
      for (const id of added) S.seen.add(id);
      store.set(seenKey(), [...S.seen].join(','));
      shownAgain(); // typed text in an open box stays
    } catch {}
  }
  const repliesOf = (id) => S.comments.filter((c) => c.parent === id);
  // Pins show who left them: the first letter of the name.
  const initial = (name) => [...String(name || '').trim()][0]?.toUpperCase() || '';
  // A pin the agent left wears labit's own mark — the same one the bar shows while an agent listens — instead of a
  // letter, so you can tell at a glance across a page who asked.
  const agentMark = () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 64 64');
    svg.setAttribute('class', 'agentmark');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = MARK_PATHS;
    return svg;
  };
  // An agent's own comment carries the session it was written in; a person's carries where they wrote it from.
  const byAgent = (c) => Boolean(c.session);
  // Where the page's own content ends (not the pins' layer): see inPage().
  const contentEnd = () => {
    inPage(0);
    return pageEnd.y;
  };

  // What the last render had open (a thread id or a draft), so cards, pins and areas only animate when they
  // appear, not on every re-render, and a card that closes to nothing can fade out.
  S.shown = null;
  S.posted = null;
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  const pinsById = new Map(); // the pins on the layer now, by thread id, for movePins()
  S.faces = new Map(); // each pin's last drawn state, so a change can ease in
  S.rings = new Map(); // and its state with the agent, for the ring
  const RINGS = { now: '', got: ' got', wait: ' wait', stale: ' stale', missed: ' stale', asks: ' asks' }; // the ring each state wears (none: sent, done)
  const SAY = { now: 'agent working on it', got: 'picked up by the agent', wait: 'waiting', stale: 'no update from the agent', missed: 'not answered', asks: 'agent asked a question' };
  // Ends a pin drag's window listener when the layer is redrawn under it (the pin is gone, its pointer events with it).
  S.dropDrag = null;
  // What each pin on the layer was drawn from, so a redraw can keep the pin itself and only update it.
  /** @type {WeakMap<Element, any>} */
  // A link on the page to a board opens it over this same page, its pins this page's (Leo, 19 Nov: "can board be part
  // of same page?"); /_lab/board/<name> itself still works as a link from anywhere else. Any other way to a board keeps
  // the scroll under the page's key, so the board's back lands where you were. A page the browser gives back whole
  // (bfcache) has its scroll already, so the key goes, or a later reload would jump.
  if (!S.board && self === top) {
    const scrollKey = 'lab-scroll:' + location.pathname;
    document.addEventListener('click', (e) => {
      const a = /** @type {HTMLAnchorElement | null} */ (e.target instanceof Element ? e.target.closest('a[href]') : null);
      if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || (a.target && a.target !== '_self')) return;
      try {
        const u = new URL(a.href, location.href);
        const bn = u.origin === location.origin && /^\/_lab\/board\/([a-z0-9][a-z0-9_-]*)\/?$/i.exec(u.pathname)?.[1];
        if (bn) {
          e.preventDefault();
          return void showBoard(bn, u.searchParams.get('of') || '');
        }
        if (u.origin === location.origin && u.pathname.startsWith('/_lab/board/')) sessionStorage.setItem(scrollKey, JSON.stringify({ y: scrollY }));
      } catch {}
    });
    addEventListener('pageshow', (e) => {
      if (!e.persisted) return;
      try {
        sessionStorage.removeItem(scrollKey);
      } catch {}
    });
  }
  const pinData = new WeakMap();
  // A board is held to the screen (its own page, or a view over a page), so what sits on it is too: its pins, an open
  // card, a new comment's box. The page scrolling under a half view then moves none of them, and nothing is put back a
  // frame late (Leo, 19 Nov: "when on half board scrolling pins flickering weirdly"). n was just placed by the page's px.
  // A pin the browser holds (pinhold.ts) is tied to its frame's box and left alone.
  const onBoard = (/** @type {HTMLElement} */ n, /** @type {any} */ a) => {
    if (a?.kind !== 'board' || heldPin(n)) return void (n.style.position && (n.style.position = ''));
    n.style.position = 'fixed';
    n.style.left = `${parseFloat(n.style.left) - scrollX}px`;
    n.style.top = `${parseFloat(n.style.top) - scrollY}px`;
  };
  function render() {
    newPass(); // what pinhold read about the pins' elements is read again (pinhold.ts)
    if (win.__labDebug) unseen = new Map();
    const dragged = S.grabbing;
    S.line = null; // where each thread stands with the agent is worked out again (list.ts lineUp)
    // A question's choice tried in the page (thread.ts): the page's own words are back before anything is read or drawn;
    // the same card drawn again tries the same row again.
    pauseTry(S.on ? S.openId : null);
    // A pick still in its 5 s of undo goes now if its card (or the chat) has closed.
    flushPick(S.on ? S.openId : null, Boolean(S.on && S.chatOpen));
    S.grabbing = false; // a pin being dragged is replaced: its drag ends here
    S.dropDrag?.();
    const prev = /** @type {HTMLElement | null} */ (layer.querySelector('.card:not(.out), .float:not(.out)'));
    const prevHeight = S.stepping && coarse && prev ? prev.offsetHeight : 0; // stepping on a phone: the sheet's top doesn't drop
    // The same thread drawn again (reopened, resolved, a reply came in): it keeps where its messages were scrolled to.
    const prevBody = prev?.querySelector('.body');
    const prevScroll = prevBody ? prevBody.scrollTop : null;
    // …or, read at its newest, stays at its newest, so an answer that just came in is in view (as the chat follows new
    // messages; Leo, 17 Nov: "message scrolled up" on a phone).
    const prevAtEnd = prevBody ? prevBody.scrollHeight - prevBody.scrollTop - prevBody.clientHeight < 48 : false;
    // Every pin's place is read before anything is written, so the page lays out once per render, not once per pin.
    const places = new Map(S.on ? threads().filter((c) => c.anchor?.kind !== 'page').map((c) => [c.id, position(c.anchor || {})]) : []);
    readPins(threads().map((c) => (c.anchor?.kind === 'board' ? frameBox(c.anchor) : c.anchor && c.anchor.kind !== 'page' && !places.get(c.id)?.moved ? findTarget(c.anchor) : null)));
    // A pin that is still there stays the same element, updated in place, so what runs on it (the agent's ring, a pop, a
    // swap, a hover or open transition) carries on instead of starting again (Leo, 18 Nov: clicking or leaving a pin
    // "reloads" its animation). Everything else on the layer (cards, outlines, drafts) is drawn anew, as before; a pin
    // that was being dragged is drawn anew too.
    const old = dragged ? new Map() : new Map(pinsById);
    const keep = new Set(old.values());
    for (const n of Array.from(layer.children)) if (!keep.has(n)) n.remove();
    pinsById.clear();
    const next = []; // what the layer holds when this is drawn, in order
    const add = (n) => (n && next.push(n), n);
    const now = S.on ? S.draft || S.openId : null;
    const appear = now !== S.shown;
    const anim = appear ? ' in' : '';
    let quoted = null;
    const inkNow = []; // comments on selected words: ink on them instead of a pin
    const done = () => {
      drawInks(inkNow);
      patchKids(layer, next); // pins still in place stay; the new ones go in, the gone ones come out
      flushPins(); // the rules of the pins the browser holds, now they are on the page (pinhold.ts)
      if (S.closeFast && !now && prev) {
        S.closeFast = false;
        prev.inert = true;
        layer.append(prev);
        goOut(prev, () => prev.remove());
      } else if (coarse && !now && S.shown && prev && !still.matches && !prev.style.transform) { // phones slide the sheet away; computers close at once, like the chat // not when it already slid away (phones)
        prev.classList.remove('in');
        prev.classList.add('out');
        prev.inert = true;
        layer.append(prev);
        // It shrinks back with the keyboard going (sheets.ts); after a send it slides down and the new pin pops in.
        const newPin = S.posted && pinsById.get(S.posted);
        if (newPin) newPin.style.animationDelay = 'var(--_t-quick)'; // as the card goes (lab option 5)
        const dur = leave(prev, 0, Boolean(newPin));
        setTimeout(() => (prev.remove(), letGo(prev), prev.classList.contains('float') && backFromReveal()), dur); // the page goes back once the card has landed in its pin
      }
      // Phones: a new comment's sheet has gone (dropped, swiped away; a sent one waits for its card above): the page goes
      // back where it was (sheets.ts).
      if (coarse && prev?.classList.contains('float') && !prev.classList.contains('out') && !root.querySelector('.float:not(.out)')) setTimeout(backFromReveal, ms('slow'));
      // Phones: a sheet that opens grows out of what was tapped (sheets.ts).
      if (coarse) {
        const sheet = /** @type {HTMLElement | null} */ (root.querySelector('.card:not(.out), .float:not(.out)')) || (S.chatOpen ? chatEl : null);
        const key = sheet && (S.draft ? 'draft' : S.openId || (S.chatOpen ? 'chat' : ''));
        if (sheet && key !== S.sheetKey) fromTap(sheet);
        S.sheetKey = key;
        if (appear && S.draft) requestAnimationFrame(revealDraft); // its pin above the sheet, before the keyboard
      }
      if (quoted && inkRange(quoted)) quoted = null; // words that wear their own ink are lit already (wordink.ts)
      if (!isTrying()) markQuote(quoted); // a tried choice wears the green itself
      S.quoted = quoted;
      S.shown = now;
      S.posted = null;
    };
    const list = threads();
    const open = list.filter((c) => !c.resolved && c.anchor?.kind !== 'page').length; // chat messages count in the chat
    const fresh = list.filter((c) => !c.resolved && c.anchor?.kind !== 'page').reduce((n, c) => n + unread(c).length, 0); // the chat counts its own
    // New replies are counted on "list" while comments show, on the toggle while they are hidden.
    toggleBtn.replaceChildren(
      document.createTextNode((S.on ? 'hide comments' : open ? `comments · ${open}` : 'comments') + (!S.on && fresh ? ` · ${fresh} new` : '')),
      el('kbd', { 'aria-hidden': 'true' }, KEYS.toggle),
    );
    toggleBtn.classList.toggle('secondary', S.on);
    host.toggleAttribute('data-labs', Boolean(!coarse && S.labsOpen)); // the page dims behind labs & pages (the widget's .scrim)
    host.toggleAttribute('data-sheet', Boolean((coarse && S.labsOpen) || (S.on && (S.draft || S.openId || S.chatOpen)))); // phones: the sheet has the screen's bottom
    if (coarse && appear && now) { // a sheet opening slides in once its first frame is drawn (see data-opening in styles.css)
      host.setAttribute('data-opening', '');
      requestAnimationFrame(() => requestAnimationFrame(() => host.removeAttribute('data-opening')));
    }
    document.documentElement.classList.toggle('lab-sheet', host.hasAttribute('data-sheet'));
    holdWhileOpen(host.hasAttribute('data-sheet')); // a dev server's reload waits until the chat, thread or list is closed
    backCloses();
    S.refit();
    setPinning();
    copyBtn.hidden = !S.on || !S.isAdmin || list.every((c) => c.resolved);
    drawList();
    S.paintSections?.(); // the section bar's ink for unread pins (sections.ts)
    drawChat();
    if (!S.on) return done();
    list.forEach((c) => {
      if (isPage(c)) return; // in the chat, not on the page
      // Done pins with nothing new in them step aside when done ones are hidden (D); an open one stays.
      if (!S.showDone && S.openId !== c.id && (c.resolved || workState(c)[0] === 'done') && !unread(c).length) return;
      const { left, top, moved, zone, clipped, covered } = places.get(c.id) || position(c.anchor || {});
      // A pin whose spot is gone is off the page: the ⋯ menu lists them ("moved · N"); an open one shows, to drop on a
      // new spot (drag) or close. The agent finishing one closes it.
      if (moved) {
        if (!c.resolved && !autoShut.has(c.id) && workState(c)[0] === 'done' && mayResolve(c)) {
          autoShut.add(c.id);
          send({ action: 'resolve', id: c.id, edit: store.get(`lab-edit:${c.id}`) || undefined }).then(({ comment }) => (Object.assign(c, comment), render()), () => {});
        }
        if (S.openId !== c.id) return;
      }
      const ink = zone && c.anchor.ink; // a drawing is its own pin: its lines, no marker (draw.ts)
      const words = !moved && !zone && inkRange(c.anchor); // its words are where they were: ink, the pin unseen at their end (wordink.ts)
      if (S.openId === c.id && !ink) add(drawZone(zone, `saved${anim}`)); // a drawn area shows its outline while open
      const news = unread(c);
      const movable = !zone && (S.isAdmin || store.get(`lab-edit:${c.id}`));
      const sg = lineUp().get(c.id) || { s: null, n: 0, at: '', line: '' }; // where it stands with the agent: sent, got (picked up), now (working), wait, stale, asks or done
      // A question you've read goes back to a plain pin: amber is for one still unread (Leo, 20 Nov: "orange pin after
      // opening should become regular"), as selected words' ink already does (wordink.ts).
      const state = sg.s === 'asks' && !news.length ? null : sg.s;
      const tip = coarse || (state !== 'now' && state !== 'stale') ? '' : lineOf(sg); // hovering a working ring says what it is doing
      const born = !old.has(c.id);
      const pin = old.get(c.id) || el('button', { type: 'button' });
      const info = pinData.get(pin) || {};
      pinData.set(pin, Object.assign(info, { c, zone, hot: info.hot }));
      // Its state as classes and words (the ring, the tick and the new dot are only seen). Set one by one: the
      // classes that carry an animation (.in, .swap) are left as they are, so nothing starts again.
      for (const [cls, on] of Object.entries({
        resolved: c.resolved, done: state === 'done', new: news.length, moved,
        grab: movable, open: S.openId === c.id, dragging: false, 'on-ink': words,
      })) pin.classList.toggle(cls, Boolean(on));
      pin.classList.add('pin');
      if (born && S.posted === c.id) pin.classList.add(coarse ? 'arrive' : 'in');
      if (tip) pin.removeAttribute('title');
      else pin.title = `${c.resolved ? '' : `${numberOf(c)} · `}${c.name}${movable ? ' · drag to move' : ''}${!coarse && mayResolve(c) ? ` · option-click to ${c.resolved ? 'open it again' : 'resolve'}` : ''}`;
      pin.setAttribute('aria-label', `comment${c.resolved ? '' : ` ${numberOf(c)}`} by ${c.name}${c.resolved || state === 'done' ? ', done' : SAY[state] ? `, ${SAY[state]}${state === 'wait' ? ` ${ord(sg.n)} in line` : ''}` : ''}${news.length ? `, ${news.length} new` : ''}`);
      // Done wins over every face: a pin that has been answered or resolved wears the tick.
      const mark = state !== 'done' && !c.resolved && byAgent(c);
      const key = state === 'done' || c.resolved ? '✓' : mark ? '\0mark' : initial(c.name);
      if (info.face !== key) {
        const node = mark ? agentMark() : document.createTextNode(key);
        if (info.node) info.node.replaceWith(node);
        else pin.prepend(node);
        Object.assign(info, { face: key, node });
      }
      // Its face changed since the last drawing (the agent took it, it's done, something new in it): it eases into the
      // new one and the ring fades in or out, instead of a cut (see .swap in styles.css).
      // A new reply read (the dot goes) is no change of face: it doesn't play (Leo, 18 Nov: closing one made it jump).
      const face = `${state}${c.resolved ? ' resolved' : ''}`;
      const was = S.faces.get(c.id);
      S.faces.set(c.id, face);
      const changed = was !== undefined && was !== face && !still.matches;
      if (changed) {
        pin.classList.remove('swap');
        void pin.offsetWidth; // so it plays again if it played before
        pin.classList.add('swap');
      }
      // The ring is the state (src/widget/styles.css): turning green while it works, still pale green when picked up, muted
      // while it waits in line, grey when it went quiet, amber when it asks. Moving between them crossfades; none to one fades in.
      // The pin is kept across redraws, so is its ring: one that stays in its state keeps turning, uninterrupted.
      const before = S.rings.get(c.id);
      S.rings.set(c.id, state);
      const ring = (/** @type {string | null} */ st, extra = '') => el('i', { class: `ring${RINGS[st] ?? ''}${extra}`, 'aria-hidden': 'true' });
      const shifted = changed && before !== state;
      let r = /** @type {HTMLElement | null} */ (pin.querySelector(':scope > .ring:not(.gone)'));
      if (state in RINGS) {
        pin.querySelector(':scope > .ring.gone')?.remove();
        const to = ring(state).className;
        if (!r) {
          r = ring(state, shifted ? (state === 'now' ? ' come' : ' off') : '');
          pin.append(r);
          const nr = r;
          if (shifted && state !== 'now') requestAnimationFrame(() => requestAnimationFrame(() => nr.classList.remove('off')));
        } else if (r.className !== to && !r.classList.contains('come')) {
          const nr = r;
          if (shifted) requestAnimationFrame(() => requestAnimationFrame(() => (nr.className = to)));
          else nr.className = to;
        } else if (r.classList.contains('come') && r.className !== `${to} come`) r.className = to;
      } else if (r) {
        if (shifted) {
          const gone = r;
          gone.classList.add('gone');
          gone.addEventListener('animationend', () => gone.remove(), { once: true });
        } else r.remove();
      }
      const oldTip = pin.querySelector(':scope > .tip');
      if (!tip) oldTip?.remove();
      else if (oldTip) { if (oldTip.textContent !== tip) oldTip.textContent = tip; }
      else pin.append(el('span', { class: 'tip', 'aria-hidden': 'true' }, tip));
      if (coarse && !pin.querySelector(':scope > .hit')) pin.append(el('i', { class: 'hit', 'aria-hidden': 'true' })); // a 44 pt place to tap (styles.css)
      pin.classList.toggle('ink', Boolean(ink));
      if (ink) {
        pin.querySelector(':scope > svg')?.remove();
        pin.append(inkSvg(ink, { left: 0, top: 0, width: zone.width, height: zone.height }));
      }
      const held = placePin(pin, c, ink && zone, left, top, moved);
      // Cut off by a box it's inside (see position; a held pin: the browser), or under a board's view over the page.
      pin.style.visibility = ((clipped && !held) || covered) && S.openId !== c.id ? 'hidden' : '';
      if (born) {
        // Bound once; they read what the pin shows now (pinData), not what it showed when it was made.
        grab(pin, () => pinData.get(pin).c);
        // Hovering a pin shows what it's on, as an open one does: a drawn area its outline, selected words their highlight.
        pin.addEventListener('pointerenter', () => {
          const d = pinData.get(pin);
          d.hot = true;
          if (coarse || S.openId === d.c.id) return;
          if (d.zone && !d.c.anchor.ink) d.shown = drawZone(d.zone, 'saved');
          else if (d.c.anchor?.quote) markQuote(d.c.anchor);
        });
        pin.addEventListener('pointerleave', () => {
          const d = pinData.get(pin);
          d.hot = false;
          d.shown?.remove();
          d.shown = null;
          if (d.zone || !d.c.anchor?.quote) return;
          if (isTrying()) relight(); // a tried choice: its green back
          else markQuote(S.quoted);
        });
        pin.addEventListener('click', (e) => {
          e.stopPropagation();
          const c = pinData.get(pin).c;
          if (pin.dataset.dragged) return;
          if (e.altKey && mayResolve(c)) return toggleResolved(c);
          // Phones: opening it goes through goTo, which moves the page so the pin sits above its sheet, not under it.
          if (coarse && S.openId !== c.id) return goTo(c);
          S.openId = S.openId === c.id ? null : c.id;
          S.draft = null;
          render();
        });
      }
      // Pointing at it while the page is redrawn: what it shows for being pointed at is drawn again with it.
      info.shown = null;
      if (info.hot && !coarse && S.openId !== c.id) {
        if (zone && !ink) info.shown = add(drawZone(zone, 'saved'));
        else if (c.anchor?.quote && !quoted) quoted = c.anchor;
      }
      if (words) inkNow.push({ c, r: words, pin }); // a click on the words is a click on it (wordink.ts)
      next.push(pin);
      pinsById.set(c.id, pin);
      if (S.openId === c.id) {
        // Area comments open below the area, so the card doesn't hide what it is about.
        // Opened by a click: the reply box takes focus (not on touch screens, where it would pop the keyboard).
        // The reply box takes the cursor on a computer. Phones don't (no keyboard popping up over what you came to read,
        // Leo 15 Nov); a keyboard already up while stepping to the next one stays up.
        const card = threadCard(c, new Set(news.map((x) => x.id)), appear && !S.quietOpen && (coarse ? S.keepKeys : !S.stepping || S.keepKeys));
        S.quietOpen = false; // opened by a send, for its undo (takeBack): the cursor stays where it was
        S.openCard = card;
        if (appear && !S.stepping) card.classList.add('in');
        if (prevHeight) card.style.minHeight = `min(${prevHeight}px, var(--_sheet-max))`;
        S.stepping = S.keepKeys = false;
        next.push(card);
        const boardPin = c.anchor?.kind === 'board' && !heldPin(pin); // held to the screen by the script (onBoard), not tied
        placeCard(card, zone ? left + 14 : left, zone ? zone.top + zone.height : top, nativeTie() && !boardPin ? pin : null, zone ? zone.top - 12 : top - 40);
        if (boardPin && !sheetMode.matches) onBoard(card, c.anchor);
        // A question with choices on quoted words: by its quote, in the margin or under it (thread.ts). Drawn again after
        // the pick, it stays where it was instead of jumping back under its pin.
        if (!zone && (openAsk(c) || (!appear && prev?.matches('.margin, .under')))) placeAsk(card, c);
        if (card.matches('.margin, .under')) tieToPin(card, null, 'card'); // by its words, where the script put it
        if (card.tie) next.push(card.tie); // its line to the words (trial.ts), kept by the layer's redraw
        // Opens at the newest message, as the chat does (a short thread doesn't scroll), on phones too (they opened at
        // the first message).
        if (!appear && prevScroll != null) {
          const body = card.querySelector('.body');
          body.scrollTop = prevAtEnd ? body.scrollHeight : prevScroll;
        }
        else if (appear) {
          // Computers: at the first new message when there is one. Phones: already at the end when it shows, the last
          // message in view, as the chat opens (Leo, 15 Nov: no scroll you can see; the sheet's height is fixed now, so
          // nothing grows after it's set).
          const body = card.querySelector('.body');
          // An open question: at the question and its rows, not below them (thread.ts).
          const asks = openAsk(c) ? [...body.querySelectorAll('.msg.asks')].pop() : null;
          const first = asks || (coarse ? null : body.querySelector('.fresh, .newline'));
          body.scrollTop = first ? first.offsetTop - body.offsetTop - 8 : body.scrollHeight;
          if (!first) stayAtEnd(body);
        }
        if (coarse && S.cardFull) card.classList.add('full'); // stays pulled up while you step from comment to comment
        swipeDown(card, () => ((S.openId = null), (S.cardFull = false), render()), true);
        markSeen(news);
        if (news.length) {
          drawList(); // opened is read: the "N new" pill, the tab title and the section bar's ink count it off at once
          S.paintSections?.();
        }
        quoted = zone ? null : c.anchor; // an area's outline says what it's on; only selected words get the highlight
      }
    });

    // Words selected with ink on words (wordink.ts): the band in the draft's grey while you write, the dialog open or not;
    // a plain box's pin stays, unseen, for the sheet to aim at.
    const draftInk = S.draft && !position(S.draft.anchor).zone && inkRange(S.draft.anchor);
    if (draftInk) inkNow.push({ r: draftInk });
    if (S.draft) {
      const draft = S.draft;
      const { anchor } = draft;
      const { left, top, zone } = position(anchor);
      if (zone && anchor.ink) add(inkSvg(anchor.ink, zone)); // a drawing shows its lines, with no draft pin
      else add(drawZone(zone, 'draft'));
      quoted = zone ? null : anchor; // an area lights no single word
      if (!anchor.ink) {
        const pin = el('div', { class: `pin draft${anim}${draftInk ? ' on-ink' : ''}` }, initial(store.get('lab-name')));
        pin.style.left = `${left}px`;
        pin.style.top = `${top}px`;
        onBoard(pin, anchor);
        layer.append(pin);
        next.push(pin);
      }
      const float = el('div', { class: `float${anim}` });
      const box = composer({
        placeholder: anchor.ink ? `${inkSaid(anchor.ink.mark)} · Enter sends, or add words` : S.unheard ? 'add a comment · no agent listening yet' : 'add a comment', // S.unheard: local labs, set from the lab's state
        opened: true, // the comment is already picked and its box open (the actions are one tap away)
        // Made by a hold on a phone: the finger's lift focuses the box (below). Focused before it, Safari could put the
        // cursor in without a keyboard, and the lift's focus then changed nothing (Leo, 19 Nov: "sometimes not in focus").
        autofocus: !S.pinnedByHold,
        draftKey: `lab-typing:${S.page}:new`,
        empty: anchor.ink ? inkSaid(anchor.ink.mark) : '',
        onSubmit: async (name, said) => {
          const { comment, edit } = await send({ name, text: said, anchor });
          if (edit) store.set(`lab-edit:${comment.id}`, edit); // lets this browser drag the pin later
          S.comments.push(comment);
          markSeen([comment]);
          S.draft = null;
          keepSpot(null);
          S.openId = null; // once posted, the card closes and the new pin stays (click it to open)
          // Undo for 3 s (takeBack): its card opens quietly (no reply cursor) with undo in the resolve key's place, and
          // closes when they are up, unless it was touched meanwhile.
          // A tapped action (go, fix, remove…) closes at once, no undo card (Leo, 20 Nov: "if action close it right away";
          // on a phone the card stayed up once touched and had to be closed by hand to get to the next pin). Command-Z
          // still takes it back on a computer.
          if ((S.isAdmin || edit) && !anchor.act) {
            const u = { id: comment.id, until: Date.now() + UNDO_MS, text: said, anchor, touched: false };
            S.undo = u;
            S.openId = comment.id;
            S.quietOpen = true;
            setTimeout(() => {
              if (S.undo !== u) return;
              S.undo = null;
              if (u.touched || S.openId !== u.id) return;
              S.closeFast = true;
              S.openId = null;
              render();
            }, UNDO_MS);
          }
          S.posted = comment.id;
          holdKeyboard(); // the keyboard waits until the card has gone (sheets.ts)
          render();
        },
      });
      float.append(el('div', { class: 'handle' }));
      // Paused: the moment this pin will carry, so you know it is kept (Leo, 19 Nov: "some info in pin where it was").
      if (anchor.moment) float.append(S.momentChip(anchor.moment));
      const row = quickRow(draft, box);
      if (row?.children.length) float.append(row);
      float.append(box);
      swipeDown(float, () => ((S.draft = null), keepSpot(null), render()));
      next.push(float);
      if (zone) placeCard(float, left + 14, zone.top + zone.height);
      else placeBeside(float, left, top, nativeTie() && anchor.kind !== 'board' ? layer.querySelector(':scope > .pin.draft') : null);
      if (!sheetMode.matches) onBoard(float, anchor);
      draft.back = false;
    }
    done();
  }

  // Drag a pin to fix its spot: whoever started the thread (its key is kept in their browser) or an admin.
  // The pin's tip (bottom left) lands where it is dropped; the new spot is saved like a fresh pin.
  S.grabbing = false;

  // The open thread's card. New replies (Claude's too) are added to it in place, so the reply box keeps focus.
  S.openCard = null;
  const coarse = matchMedia('(pointer: coarse)').matches;
  // Where sheets take the screen's bottom (styles.css): a new comment on selected words grows into the sheet there.
  const sheetMode = matchMedia('(pointer: coarse) and (max-width: 560px), (pointer: coarse) and (max-height: 500px)');

  // ---------- events ----------
  const showHint = () => {
    if (store.get('lab-hint-seen') === '1') return;
    hint.classList.remove('out');
    hint.hidden = false;
    store.set('lab-hint-seen', '1');
    setTimeout(() => goOut(hint, () => (hint.hidden = true)), 5000);
  };
  const setOn = (value) => {
    S.on = value;
    if (!S.on) ptr.classList.remove('show'); // comments hidden: the system pointer is back at once
    else recheck();
    store.set('lab-on', S.on ? '1' : '0');
    S.checkSections?.(); // hidden comments: no section bar
    if (S.on) showHint();
    S.draft = S.on ? keptDraft() : null; // hidden, a new comment lets go of the screen; its words wait, and come back when comments do
    S.openId = null;
    render();
    drawMotion(); // the pause / play beside each moving thing goes and comes with the comments
  };
  toggleBtn.addEventListener('click', () => setOn(!S.on));
  // The ⋯ menu is a disclosure: the button says whether it's open; opening puts focus on its first item, and Escape
  // or a pick gives focus back to the button.
  // On a computer the menu is a popover the ⋯ button opens: the browser closes it on a press elsewhere or Esc, gives
  // focus back, and shows it above the page's own dialogs. hidden still says whether it is open.
  const popMenu = !coarse; // phones: the menu stays in the bar (a pinch zoom scales the bar, not the top layer)
  if (popMenu) {
    moreMenu.popover = 'auto';
    /** @type {HTMLButtonElement} */ (moreBtn).popoverTargetElement = moreMenu;
    moreMenu.addEventListener('beforetoggle', (e) => {
      const open = /** @type {ToggleEvent} */ (e).newState === 'open';
      moreMenu.hidden = !open;
      moreBtn.setAttribute('aria-expanded', String(open)); // the browser doesn't write it for its invoker
      if (open) {
        moreMenu.classList.remove('out');
        if (LABS) void switcher().then((m) => m?.preloadSwitcher());
        requestAnimationFrame(() => [...moreMenu.querySelectorAll('button')].find((b) => !b.hidden && !b.disabled)?.focus({ preventScroll: true }));
      } else if (expOpen) {
        expOpen = false;
        placeBar();
      }
    });
  }
  function setMenu(open, refocus = false) {
    if (popMenu) {
      if (open !== moreMenu.matches(':popover-open')) moreMenu[open ? 'showPopover' : 'hidePopover']();
      if (!open && refocus) moreBtn.focus({ preventScroll: true });
      return;
    }
    if (open && LABS) void switcher().then((m) => m?.preloadSwitcher()); // the box and its list, ready by the time it is picked
    if (open) {
      moreMenu.classList.remove('out');
      moreMenu.hidden = false;
    } else if (!moreMenu.hidden) goOut(moreMenu, () => (moreMenu.hidden = true));
    moreBtn.setAttribute('aria-expanded', String(open));
    if (!open && expOpen) {
      expOpen = false; // it opens on its first page again
      placeBar();
    }
    if (open) [...moreMenu.querySelectorAll('button')].find((b) => !b.hidden && !b.disabled)?.focus({ preventScroll: true });
    else if (refocus) moreBtn.focus({ preventScroll: true });
  }
  moreBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!popMenu) setMenu(moreMenu.hidden || moreMenu.classList.contains('out')); // leaving counts as closed (a popover: the browser)
  });
  moreMenu.addEventListener('click', () => setTimeout(() => setMenu(false, true), 0));
  addEventListener('pointerdown', (e) => {
    if (!popMenu && !moreMenu.hidden && !e.composedPath().some((n) => n === moreMenu || n === moreBtn)) setMenu(false);
  }, true);
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !popMenu && !moreMenu.hidden) {
      setMenu(false, true);
      e.stopPropagation();
    }
  }, true);
  goBtn.addEventListener('click', () => setCursor(!S.cursorMode));
  // Pause (Leo, 19 Nov: "not in menu", "maybe with option pressed"): a small control on the moving thing itself, in
  // labit's layer over the page (nothing moves): pause / play · ¼ · its moment in ms, for that element and what is
  // inside it. Computers: on the video or loop under the pointer while ⌥ is held (⌥ is Measure's key too; a click on the
  // control never pins); let go and a paused one keeps a small ▶. Phones: in the top right corner of each one at least
  // half in view, quiet, gone while scrolling or while a sheet is open. P pauses all, S slows all. The widget's own
  // animations keep moving, and a comment on a paused video says which second (anchoring.ts).
  const held = new Set(); // the videos and elements labit paused
  const slowEls = new Set(); // the elements labit slowed to ¼ (S slows all, S.slow)
  let animsNow = null; // one drawMotion's list: asked once per draw, not once per control
  const pageAnims = () => animsNow || document.getAnimations().filter((a) => {
    const t = /** @type {KeyframeEffect | null} */ (a.effect)?.target;
    if (!t || root.contains(t)) return false;
    if (held.has(t)) return true;
    // Only motion that goes on (a loop) gets a pause: a transition, or an animation that ends, is a moment, like the
    // highlight on a heading you just went to (Leo, 19 Nov: "what's with the animation pause thing on headers").
    if (typeof CSSTransition !== 'undefined' && a instanceof CSSTransition) return false;
    const end = a.effect?.getComputedTiming().endTime;
    return !(typeof end === 'number' && Number.isFinite(end));
  });
  const targetOf = (a) => /** @type {KeyframeEffect} */ (a.effect).target;
  // An element's own animations first, then those inside it.
  const animsOf = (el) => pageAnims().filter((a) => el.contains(targetOf(a))).sort((a, b) => Number(targetOf(b) === el) - Number(targetOf(a) === el));
  const videosIn = (el) => (el instanceof HTMLVideoElement ? [el] : [...el.querySelectorAll('video')]);
  const moving = () => [...new Set([...document.querySelectorAll('video'), ...held, ...pageAnims().filter((a) => a.playState === 'running').map(targetOf)])].filter((el) => el?.isConnected);
  // One control for a moving thing and what moves inside it: only the outermost get one.
  const outermost = (els) => els.filter((t) => !els.some((o) => o !== t && o.contains(t)));
  const isStill = (el) => videosIn(el).every((v) => v.paused) && animsOf(el).every((a) => a.playState !== 'running');
  const setItem = (el, stop) => {
    for (const v of videosIn(el)) {
      if (stop) v.pause();
      else v.play?.().catch(() => {});
    }
    for (const a of animsOf(el)) {
      if (stop && a.playState === 'running') a.pause();
      else if (!stop && a.playState === 'paused') a.play();
    }
    if (!stop) for (const h of held) if (el.contains(h)) held.delete(h); // played from around it: what is inside plays too
    held[stop ? 'add' : 'delete'](el);
    S.paused = held.size > 0; // a comment written now says the page was paused
  };
  // The moving thing a pin is about (Leo, 19 Nov: pins on a dot, a video and a GIF all got the loop next to them): the
  // pinned element's own motion wins, the video or animation it is, holds or sits in, and of several the one under
  // the pin's own spot (else the nearest to it). Only a pin with no motion of its own (the page, a heading) takes the
  // paused thing most in view, nearest the screen's middle.
  const ownMotion = (anchor) => {
    let at = null;
    try {
      at = anchor?.selector ? document.querySelector(anchor.selector) : null;
    } catch {}
    if (at === document.body || at === document.documentElement || (at && root.contains(at))) at = null;
    const things = [...new Set([...held, ...document.querySelectorAll('video'), ...pageAnims().map(targetOf)])].filter((el) => el?.isConnected && !root.contains(el));
    const area = (r) => r.width * r.height;
    if (at) {
      const ar = at.getBoundingClientRect();
      const px = ar.left + (Number.isFinite(anchor.x) ? anchor.x : 0.5) * ar.width, py = ar.top + (Number.isFinite(anchor.y) ? anchor.y : 0.5) * ar.height;
      const own = things.filter((el) => at.contains(el) || el.contains(at));
      const box = (el) => el.getBoundingClientRect();
      const under = own.filter((el) => { const r = box(el); return px >= r.left && px <= r.right && py >= r.top && py <= r.bottom; });
      if (under.length) return under.sort((p, q) => area(box(p)) - area(box(q)))[0]; // the smallest under the spot: the thing itself, not what holds it
      const off = (el) => { const r = box(el); return Math.hypot(Math.max(r.left - px, 0, px - r.right), Math.max(r.top - py, 0, py - r.bottom)); };
      if (own.length) return own.sort((p, q) => off(p) - off(q))[0];
    }
    return null;
  };
  // A pin with no motion of its own, while paused: the paused thing most in view, nearest the screen's middle.
  const pausedEl = (anchor) => ownMotion(anchor) || inView();
  const inView = () => {
    const all = [...held].filter((el) => el.isConnected);
    const cx = innerWidth / 2, cy = innerHeight / 2;
    const score = (el) => {
      const r = el.getBoundingClientRect();
      const seen = Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
      return [seen > 0 ? 0 : 1, Math.hypot(r.left + r.width / 2 - cx, r.top + r.height / 2 - cy)];
    };
    return all.map((el) => [el, score(el)]).sort((p, q) => p[1][0] - q[1][0] || p[1][1] - q[1][1])[0]?.[0];
  };
  // A short name for it, as a person would point at it: ".hero video", "#spinner", "div.dot".
  const nameOf = (el) => {
    const own = (n) => n.localName + (n.id ? `#${n.id}` : n.classList[0] ? `.${n.classList[0]}` : '');
    const me = own(el);
    if (el.id || el.classList.length) return me.slice(0, 80);
    const up = el.parentElement?.closest('[id], [class]');
    return (up && up !== document.body ? `${up.id ? `#${up.id}` : `.${up.classList[0]}`} ${me}` : me).slice(0, 80);
  };
  // Where a paused thing stands: a video's second of its length; an animation's second inside one pass and which pass
  // (a loop's total time, 835734 ms, says neither). lib/moment.mjs words it.
  const momentOf = (el) => {
    if (!el) return undefined;
    const what = nameOf(el), sel = selectorFor(el);
    const playing = isStill(el) ? undefined : true; // nothing paused: the moment it was showing as the pin went down
    if (el instanceof HTMLVideoElement) {
      if (!Number.isFinite(el.currentTime)) return undefined;
      return { kind: 'video', at: el.currentTime, of: Number.isFinite(el.duration) ? el.duration : undefined, what, sel, playing };
    }
    const a = animsOf(el)[0];
    const t = a?.effect?.getComputedTiming();
    const dur = Number(t?.duration), local = Number(t?.localTime);
    if (!t || !(dur > 0) || !Number.isFinite(local)) return undefined;
    const pass = Number.isFinite(t.currentIteration) ? t.currentIteration : 0;
    const at = Math.min(Math.max(local - (t.delay || 0) - pass * dur, 0), dur);
    return { kind: t.iterations === Infinity ? 'loop' : 'anim', at: at / 1000, of: dur / 1000, pass: pass + 1, what, sel, ms: Number(a.currentTime), playing };
  };
  // A pin's moment chip: the page pauses and the thing goes back to that moment, to see what was meant. It stays
  // paused; play it again as usual (the control or the pause key).
  const seekMoment = (m) => {
    let el = null;
    try {
      el = m?.sel ? document.querySelector(m.sel) : null;
    } catch {}
    if (!el || m.kind === 'gif') return false;
    setPause(true);
    if (!held.has(el)) setItem(el, true);
    if (el instanceof HTMLVideoElement) el.currentTime = m.at;
    else {
      const a = animsOf(el)[0];
      const t = a?.effect?.getComputedTiming();
      if (!a) return false;
      a.currentTime = Number.isFinite(m.ms) ? m.ms : (t?.delay || 0) + ((m.pass || 1) - 1) * Number(t?.duration) + m.at * 1000;
    }
    drawMotion();
    return true;
  };
  S.seekMoment = seekMoment;
  // The moment, in a small chip: a label in the box being written, a button on a sent pin (back to that moment).
  const PAUSED = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 2h2v8H3zM7 2h2v8H7z"/></svg>';
  const momentChip = (m, seek = false) => {
    const chip = el(seek && m.kind !== 'gif' ? 'button' : 'div', { class: 'moment' });
    chip.innerHTML = m.kind === 'gif' || m.playing ? '' : PAUSED; // ⏸ only for a moment that was paused
    chip.append(el('span', {}, momentText(m)));
    if (chip.localName === 'button') {
      chip.setAttribute('type', 'button');
      chip.title = 'pause the page at this moment';
      chip.addEventListener('click', (e) => (e.stopPropagation(), seekMoment(m)));
    }
    return chip;
  };
  S.momentChip = momentChip;
  // A pin's moment: on a GIF (it can't be paused), how long it had been showing; else, while paused, where the paused
  // thing it is about stood.
  // Every way (Leo, 19 Nov: "it says only if i pause one"): the page paused, one thing paused, or nothing paused, a pin
  // on a moving thing takes that thing's moment as the pin goes down (begin); a pin on still things, while paused, the
  // paused thing most in view.
  const momentFor = (anchor) => {
    if (anchor.shownFor !== undefined) return { kind: 'gif', at: anchor.shownFor };
    const el = ownMotion(anchor) || (S.paused ? inView() : null);
    return el ? momentOf(el) : undefined;
  };
  S.momentFor = momentFor;
  const msOf = (el) => {
    if (!el) return undefined;
    const t = el instanceof HTMLVideoElement ? el.currentTime * 1000 : Number(animsOf(el)[0]?.currentTime);
    return Number.isFinite(t) ? Math.round(t) : undefined;
  };
  // ¼ speed (Leo, 19 Nov): S slows every page animation and video to a quarter of its speed, a control's ¼ only its own
  // element's; a pin made now says so. Motion that starts later is slowed as it starts (and by the 1 s redraw, for
  // script animations).
  const rates = new WeakMap(); // each animation's own rate, to go back to
  const wantSlow = (t) => S.slow || [...slowEls].some((e) => e.isConnected && e.contains(t));
  const slowAll = () => {
    for (const a of document.getAnimations()) {
      const t = /** @type {KeyframeEffect | null} */ (a.effect)?.target;
      if (!t || root.contains(t)) continue;
      const slow = wantSlow(t);
      if (slow && !rates.has(a)) {
        rates.set(a, a.playbackRate);
        a.updatePlaybackRate(a.playbackRate / 4);
      } else if (!slow && rates.has(a)) {
        a.updatePlaybackRate(rates.get(a));
        rates.delete(a);
      }
    }
    for (const v of document.querySelectorAll('video')) v.playbackRate = wantSlow(v) ? 0.25 : 1;
  };
  const setSlow = (on) => {
    S.slow = on;
    if (!on) slowEls.clear();
    slowAll();
    drawMotion();
  };
  for (const type of ['animationstart', 'transitionrun', 'play']) addEventListener(type, () => (S.slow || slowEls.size > 0) && slowAll(), true);
  // The controls: one per element shown, in .motions (page coordinates, like the pins).
  const PLAY = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3.5 2.2v7.6L9.8 6z"/></svg>';
  const PAUSE = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 2h2v8H3zM7 2h2v8H7z"/></svg>';
  const ctls = new Map();
  const ctlFor = (target) => {
    let c = ctls.get(target);
    if (c) return c;
    const play = /** @type {HTMLButtonElement} */ (el('button', { type: 'button', class: 'motion-play' }));
    const slow = /** @type {HTMLButtonElement} */ (el('button', { type: 'button', class: 'motion-slow', 'aria-pressed': 'false' }, '¼'));
    const ms = el('span', { class: 'motion-ms' });
    const box = el('div', { class: 'motion-ctl', role: 'group' });
    box.append(play, slow, ms);
    play.addEventListener('click', (e) => (e.stopPropagation(), setItem(target, !isStill(target)), drawMotion()));
    slow.addEventListener('click', (e) => {
      e.stopPropagation();
      if (slowEls.has(target) || S.slow) slowEls.delete(target);
      else slowEls.add(target);
      if (S.slow && !slowEls.has(target)) S.slow = false; // the page was all slowed: this one goes back, the rest stay slowed
      slowAll();
      drawMotion();
    });
    for (const type of ['pointerdown', 'mousedown', 'touchstart']) box.addEventListener(type, (e) => e.stopPropagation()); // the control's, never a pin or a hold
    motions.append(box);
    c = { box, play, slow, ms, state: '' };
    ctls.set(target, c);
    return c;
  };
  // Its box from its middle and its own size, so a spinning or growing thing's control stays put.
  const boxOf = (t) => {
    const r = t.getBoundingClientRect();
    const w = t instanceof HTMLElement ? t.offsetWidth : r.width;
    const h = t instanceof HTMLElement ? t.offsetHeight : r.height;
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    return { left: x - w / 2, right: x + w / 2, top: y - h / 2, bottom: y + h / 2, w, h };
  };
  let altMotion = false; // computers: ⌥ held
  let pointerAt = null;
  let scrolling = 0; // phones: the time the last scroll ended its quiet wait
  let hot = null; // computers: the one whose full control shows
  let hotSeen = 0; // when the pointer was last on it or its control
  let hotBox = null; // its box when its control showed, in page coordinates
  let cand = null; // a neighbour the pointer is on while still in that box, and since when
  let candSince = 0;
  // An element's box at rest, without its animated transform (a sliding loop, a pulsing dot), on screen: where its
  // control goes and what counts as on it. From the layout offsets; where those can't say (SVG, a transformed or
  // sticky ancestor puts them far off), its drawn box.
  const restBox = (t) => {
    const drawn = boxOf(t);
    if (!(t instanceof HTMLElement) || !t.offsetParent && getComputedStyle(t).position !== 'fixed') return drawn;
    let x = 0, y = 0, fixed = false;
    for (let n = t; n; n = /** @type {HTMLElement | null} */ (n.offsetParent)) {
      x += n.offsetLeft + (n === t ? 0 : n.clientLeft);
      y += n.offsetTop + (n === t ? 0 : n.clientTop);
      if (!n.offsetParent && getComputedStyle(n).position === 'fixed') fixed = true;
    }
    for (let a = t.parentElement; a && a !== document.body && a !== document.documentElement; a = a.parentElement) {
      x -= a.scrollLeft;
      y -= a.scrollTop;
    }
    if (!fixed) {
      x -= scrollX;
      y -= scrollY;
    }
    const w = t.offsetWidth, h = t.offsetHeight;
    const far = Math.max(200, 2 * (w + h));
    if (Math.abs(x + w / 2 - (drawn.left + drawn.w / 2)) > far || Math.abs(y + h / 2 - (drawn.top + drawn.h / 2)) > far) return drawn;
    return { left: x, top: y, right: x + w, bottom: y + h, w, h };
  };
  const under = () => {
    if (!pointerAt) return null;
    // On its control (wider than a small thing, so it can stick out past it): still that one.
    const own = hot && ctls.get(hot)?.box.getBoundingClientRect();
    if (own && hot.isConnected && pointerAt.x >= own.left && pointerAt.x <= own.right && pointerAt.y >= own.top && pointerAt.y <= own.bottom) return hot;
    // Where it was when its control showed (its box at rest, page coordinates): a thing sliding out from under the
    // pointer stays the one, and a neighbour sliding in doesn't take over. A moving thing inside a box that has the
    // control does (Leo, 19 Nov: "still random sometimes": the box between things kept the control from them).
    const was = hot?.isConnected && hotBox;
    const inWas = Boolean(was && pointerAt.x >= was.left - scrollX && pointerAt.x <= was.right - scrollX && pointerAt.y >= was.top - scrollY && pointerAt.y <= was.bottom - scrollY);
    const outer = outermost(moving());
    // The thing under the mouse is a moving one or inside one (the "Buy" text in a pressed button): that one.
    const at = document.elementFromPoint(pointerAt.x, pointerAt.y);
    const page = at && at !== host && at !== document.documentElement && at !== document.body && !root.contains(at) ? at : null;
    let direct = page && outer.find((t) => t.contains(page));
    if (!direct) {
      let best = null;
      for (const t of outer) {
        const b = restBox(t);
        if (!b.w || !b.h || pointerAt.x < b.left || pointerAt.x > b.right || pointerAt.y < b.top || pointerAt.y > b.bottom) continue;
        if (!best || b.w * b.h < best.a) best = { t, a: b.w * b.h };
      }
      direct = best?.t;
    }
    let next = direct;
    if (!next && inWas) next = hot;
    // A gap between things while one has its control: that control stays, then fades (300 ms), and the box around them
    // doesn't take over (its control sits at that box's far corner: Leo, 19 Nov, "option and move cursor makes controls
    // run away"). Without a control showing, the box offers its own.
    if (!next && !hot?.isConnected) {
      // Or it holds moving things (the demo box around a pressed button and its toast):
      // its control, for all that moves inside; not the page's whole body or a box as big as half the screen.
      // A box with one moving thing in it (a track and its loop) is that thing.
      const r = page?.getBoundingClientRect();
      const inside = r && r.width * r.height <= (innerWidth * innerHeight) / 2 ? outer.filter((t) => page.contains(t)) : [];
      // Not from the gap between two of them (one on each side of the pointer): that box's control sits at its far
      // corner, away from the pointer (Leo, 19 Nov: "option and move cursor makes controls run away").
      const between = inside.length > 1 && (() => {
        const bs = inside.map(restBox);
        const { x, y } = pointerAt;
        // Beside them on their row (or column) only: the box's own edge above or beside them all still offers its control.
        const row = bs.filter((b) => b.top <= y && b.bottom >= y), col = bs.filter((b) => b.left <= x && b.right >= x);
        return (row.some((b) => b.right < x) && row.some((b) => b.left > x)) || (col.some((b) => b.bottom < y) && col.some((b) => b.top > y));
      })();
      next = inside.length === 1 ? inside[0] : inside.length && !between ? page : null;
    }
    if (next && hot?.isConnected && next !== hot) {
      // One control at a time: on its way to it the pointer crosses a neighbour (its control can lie over one), or a
      // thing inside the box that has it; another thing takes over only once the pointer rests on it (250 ms).
      const now = performance.now();
      if (cand !== next) {
        cand = next;
        candSince = now;
      }
      return now - candSince >= 250 ? next : hot;
    }
    cand = null;
    return next;
  };
  let motionLoop = 0;
  const drawMotion = () => {
    cancelAnimationFrame(motionLoop);
    animsNow = null;
    animsNow = pageAnims();
    try {
      drawMotionNow();
    } finally {
      animsNow = null;
    }
  };
  const drawMotionNow = () => {
    const vw = document.documentElement.clientWidth;
    const vh = innerHeight;
    /** @type {Map<Element, 'full' | 'mini'>} */
    const want = new Map();
    if (S.on) {
      if (!coarse) {
        // Reachable (Leo, 19 Nov: "sometimes menu with pause is out of reach"): crossing the gap to the control, or the
        // thing moving out from under the pointer, keeps it for 300 ms.
        const next = altMotion ? under() : null;
        const now = performance.now();
        if (next) {
          if (next !== hot) {
            const b = restBox(next);
            hotBox = { left: b.left + scrollX, right: b.right + scrollX, top: b.top + scrollY, bottom: b.bottom + scrollY };
          }
          hot = next;
          hotSeen = now;
        } else if (!(altMotion && hot?.isConnected && now - hotSeen < 300)) hot = null;
            for (const h of outermost([...held].filter((h) => h.isConnected))) want.set(h, 'mini');
        if (hot) want.set(hot, 'full');
      } else if (!scrolling && !host.hasAttribute('data-sheet')) {
        for (const t of outermost(moving())) {
          const b = boxOf(t);
          const seen = Math.max(0, Math.min(b.right, vw) - Math.max(b.left, 0)) * Math.max(0, Math.min(b.bottom, vh) - Math.max(b.top, 0));
          if (b.w && b.h && seen >= (b.w * b.h) / 2) want.set(t, 'full');
        }
      }
    }
    for (const [t, c] of ctls) {
      if (want.has(t)) continue;
      if (!c.box.classList.contains('on')) {
        if (!t.isConnected) {
          c.box.remove();
          ctls.delete(t);
        }
        continue;
      }
      c.spot = null; // shown again later: where the thing is then
      c.box.classList.remove('on'); // fades out, and stays in the layer for next time
    }
    for (const [t, kind] of want) {
      const c = ctlFor(t);
      const stopped = isStill(t);
      const state = `${stopped}${kind}`;
      if (c.state !== state) {
        c.state = state;
        c.play.innerHTML = stopped ? PLAY : PAUSE;
        const what = t instanceof HTMLVideoElement ? 'video' : 'animation';
        c.play.setAttribute('aria-label', (c.play.title = `${stopped ? 'play' : 'pause'} this ${what} (${KEYS.pause.toUpperCase()}: all)`));
        c.box.setAttribute('aria-label', `${what} controls`);
      }
      const slowed = S.slow || slowEls.has(t);
      c.slow.setAttribute('aria-pressed', String(slowed));
      c.slow.setAttribute('aria-label', (c.slow.title = `${slowed ? 'full' : 'quarter'} speed (${KEYS.slow.toUpperCase()}: all)`));
      const ms = msOf(t);
      c.ms.textContent = ms === undefined ? '' : `${ms} ms`;
      c.box.classList.toggle('mini', kind === 'mini');
      c.box.classList.toggle('quiet', coarse);
      const b = kind === 'full' && !coarse ? restBox(t) : boxOf(t); // ⌥: from its box at rest, not where its animation has it
      // A small paused thing (a dot, an icon) would be all under its ▶, so a click to pin it played it instead: its ▶
      // sits just outside, at its top right.
      const small = kind === 'mini' && (b.w < c.box.offsetWidth * 2 || b.h < c.box.offsetHeight * 2);
      // A computer's full control stays where it first showed while the pointer is on it (a moving thing would carry it
      // away from the pointer), in page coordinates; always on screen.
      const keep = !coarse && kind === 'full' && c.spot?.t === t ? c.spot : null;
      const x = keep ? keep.x - scrollX : small ? b.right + 4 + c.box.offsetWidth : b.right - 4;
      const y = keep ? keep.y - scrollY : small ? b.top - 4 : b.top + 4;
      const left = Math.min(Math.max(x, c.box.offsetWidth + 4), vw - 4); // a thing at the screen's edge keeps its control on screen
      const top = Math.min(Math.max(y, 4), vh - c.box.offsetHeight - 4);
      c.spot = kind === 'full' ? { t, x: (keep ? keep.x - scrollX : x) + scrollX, y: (keep ? keep.y - scrollY : y) + scrollY } : null;
      c.box.style.left = `${left + scrollX}px`;
      c.box.style.top = `${top + scrollY}px`;
      if (!c.box.classList.contains('on')) requestAnimationFrame(() => c.box.classList.add('on')); // in the next frame: it fades in
    }
    // The ms and the place follow the motion, every frame, only while a full control shows (⌥, phones). Paused things
    // keep only their ▶, which stays put: no loop (Leo, 19 Nov: "when i paused here its became laggy"); a scroll inside
    // a box, a resize or the 1 s redraw move it.
    if ([...want.values()].includes('full')) motionLoop = requestAnimationFrame(drawMotion);
  };
  const setPause = (on) => {
    for (const el of on ? moving().filter((el) => !isStill(el)) : [...held]) setItem(el, on);
    drawMotion();
  };
  const altMotionSet = (on) => {
    if (altMotion === on) return;
    altMotion = on;
    drawMotion();
  };
  addEventListener('keydown', (e) => e.key === 'Alt' && !coarse && altMotionSet(!e.metaKey && !e.ctrlKey && !e.shiftKey), true);
  addEventListener('keydown', (e) => altMotion && e.key !== 'Alt' && altMotionSet(false), true); // ⌥W, ⌥1…: a shortcut
  addEventListener('keyup', (e) => e.key === 'Alt' && altMotionSet(false), true);
  addEventListener('blur', () => altMotionSet(false));
  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    pointerAt = { x: e.clientX, y: e.clientY };
    if (altMotion && !e.altKey) altMotionSet(false); // its keyup went to another window
    else if (altMotion) drawMotion();
  }, { capture: true, passive: true });
  let scrollQuiet = 0;
  // The browser says when a scroll ended (scrollend); a timer stays as a backstop for a scroll that never says so.
  const scrollOver = () => {
    clearTimeout(scrollQuiet);
    if (scrolling) {
      scrolling = 0;
      drawMotion();
    }
  };
  let motionAgain = 0;
  const redrawMotionSoon = () => motionAgain || (motionAgain = requestAnimationFrame(() => ((motionAgain = 0), drawMotion())));
  addEventListener('resize', () => held.size && redrawMotionSoon(), { passive: true });
  addEventListener('scroll', (e) => {
    if (!coarse) return void (held.size && e.target !== document && redrawMotionSoon()); // a box scrolled: the ▶s in it move
    clearTimeout(scrollQuiet);
    if (!scrolling) {
      scrolling = 1;
      drawMotion();
    }
    scrollQuiet = window.setTimeout(scrollOver, 1500);
  }, { capture: true, passive: true });
  addEventListener('scrollend', () => coarse && scrollOver(), { capture: true, passive: true });
  setInterval(() => ((S.slow || slowEls.size > 0) && slowAll(), drawMotion()), 1000);
  if (coarse) new MutationObserver(() => drawMotion()).observe(host, { attributeFilter: ['data-sheet'] }); // a sheet opens: the controls go
  doneBtn.addEventListener('click', toggleDone);
  movedBtn.addEventListener('click', () => (setMenu(false), stepMoved()));
  overBtn.addEventListener('click', () => setOver(!S.overControls));
  // Option-click (or Option-drag) with comments hidden still pins: comments come back with the new one.
  const showAgain = () => {
    if (S.on) return;
    S.on = true;
    store.set('lab-on', '1');
  };
  copyBtn.addEventListener('click', () => copy(agentLink(), copyBtn));
  // The list opens on "new" each time.
  // A #block link in a message: go to that block on the page. A phone's sheet covers the page, so it closes first.
  addEventListener('lab-goto', (e) => {
    const to = /** @type {CustomEvent} */ (e).detail;
    const target = typeof to === 'string' ? document.getElementById(to) : to; // an id, or the element itself (the section bar's)
    if (!target) return;
    if (coarse) {
      S.openId = null;
      S.chatOpen = false;
      render();
    }
    setTimeout(() => goToBlock(target), coarse ? 60 : 0); // after the sheet has started closing
  });
  listBtn.addEventListener('click', () => stepNew(1));
  chatBtn.addEventListener('click', () => {
    S.chatOpen = !S.chatOpen;
    // On a computer, opening the chat closes an open thread, and a new comment with nothing typed in it.
    if (S.chatOpen && !coarse) {
      S.openId = null;
      if (S.draft && !/** @type {HTMLTextAreaElement | null} */ (root.querySelector('.float textarea'))?.value.trim()) S.draft = null;
    }
    goOut(hint, () => (hint.hidden = true));
    render();
    // Computers: the cursor goes in the message box (phones wait for a tap, so the keyboard doesn't cover the chat).
    if (S.chatOpen && !coarse) /** @type {HTMLElement | null} */ (chatEl.querySelector('.chat textarea'))?.focus({ preventScroll: true });
  });
  // No close cross on the chat: a click outside it, Escape or T closes it (phones: the handle or the dimmed page).
  // On a computer a click outside the chat closes it (phones have the dimmed page for that); what you typed stays.
  // That click only closes: it doesn't start a comment or press what's under it.
  S.closingClick = false;
  document.addEventListener('pointerdown', (e) => {
    S.closingClick = false;
    if (coarse || !S.chatOpen || e.button !== 0) return;
    const path = e.composedPath();
    if (path.includes(chatEl) || path.includes(chatBtn)) return;
    S.chatOpen = false;
    // The widget's own buttons (N new, go, hide…) still do their thing; only a click on the page just closes. Their
    // bar is drawn again only after the click, or the button would be swapped out under it and the click lost.
    if (path.includes(host)) return void addEventListener('click', () => render(), { once: true });
    S.closingClick = true;
    render();
  }, true);
  addEventListener('click', (e) => {
    if (!S.closingClick) return;
    S.closingClick = false;
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);
  const typing = (e) =>
    e.composedPath().some((n) => n instanceof HTMLElement && (n.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(n.tagName)));
  document.addEventListener('keydown', (e) => {
    const inOtherWidget = document.activeElement?.localName.includes('-') && document.activeElement !== host; // e.g. an input in a closed shadow root
    if (actionOf(e) === 'toggle' && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey && !e.repeat && !typing(e) && !inOtherWidget) {
      e.preventDefault();
      setOn(!S.on);
      return;
    }
    // 1 to 6 answer an open question with that choice (thread.ts): before 1 is comment / pointer, which it keeps when no
    // question is open. Not while a text box has the focus.
    if (S.on && !coarse && /^Digit[1-6]$/.test(e.code) && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.repeat && !typing(e) && !inOtherWidget && pickByKey(Number(e.code.slice(5)))) {
      e.preventDefault();
      return;
    }
    if (S.on && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && (/^z$/i.test(e.key || '') || (!/^[a-z]$/i.test(e.key || '') && e.code === 'KeyZ')) && !typing(e) && !inOtherWidget && placed.length) {
      e.preventDefault();
      return void undoLast();
    }
    // ⌥W (Leo 18 Nov: w does nothing in a text box) or Control-D goes to the next new comment from the widget's text boxes
    // too, where a plain W types a letter; Shift: back. By the key's place: Option turns W into ∑ on a Mac.
    const nextKey = (e.altKey && !e.ctrlKey && e.code === 'KeyW') || (e.ctrlKey && !e.altKey && e.code === 'KeyD');
    if (S.on && nextKey && !e.metaKey && !(typing(e) && !e.composedPath().includes(host))) {
      e.preventDefault();
      // Words typed in a reply box aren't thrown away: it nudges instead, send or clear them first.
      const typed = /** @type {HTMLTextAreaElement | null} */ (root.querySelector('.card textarea, .float textarea'));
      if (typed?.value.trim()) return shake(typed.closest('.card, .float'));
      return stepNew(e.shiftKey ? -1 : 1);
    }
    // 1 switches between comment and pointer: once the pointer, again the comment (the key is a setting).
    const act = actionOf(e);
    // C is comment, always (Leo, 19 Nov): out of the pointer, a click pins again. 1 still switches.
    if (S.on && act === 'pin' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.repeat && !typing(e) && !inOtherWidget) {
      e.preventDefault();
      if (S.cursorMode) setCursor(false);
      return;
    }
    if (S.on && act === 'comment' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.repeat && !typing(e) && !inOtherWidget) {
      e.preventDefault();
      setCursor(!S.cursorMode);
      return;
    }
    // The list's keys, with comments shown and nothing typed: L list, T chat, J/K next/previous, R reply, E resolve.
    // By the key's place, not its letter, so the keys work with any layout (Russian, Greek…): the C key is C (keyOf).
    // The keys (Leo, 2026-11-15/16), marked in the bar's words: cha(t) (C was chat until 19 Nov; Leo: C is comment), ne(w) (Shift-W: the one before), 1 comment / pointer,
    // P pause, M hide, D show/hide done. With a thread open: R reply, E resolve.
    // Shift is only for next (Shift-W: the one before); ⇧D, ⇧B and the rest belong to the board.
    if (S.on && !typing(e) && !inOtherWidget && !e.metaKey && !e.ctrlKey && !e.altKey && !e.repeat && ['pause', 'slow', 'chat', 'next', 'done', 'reply', 'resolve'].includes(act) && (act === 'next' || act === 'done' || !e.shiftKey)) { // ⇧D draws too: Shift straightens (below)
      const k = act;
      e.preventDefault();
      if (k === 'pause') return setPause(!S.paused);
      if (k === 'slow') return setSlow(!S.slow);
      if (k === 'chat') return chatBtn.click();
      if (k === 'next') return stepNew(e.shiftKey ? -1 : 1);
      if (k === 'done') return void ((S.dKey = true), (S.dShift = e.shiftKey), (S.drew = false), part('draw')); // on release (below): held, D draws (draw.ts); ⇧D tapped alone stays the board's
      if (k === 'reply' && S.openId) /** @type {HTMLElement | null} */ (root.querySelector('.card textarea'))?.focus({ preventScroll: true });
      else if (k === 'resolve' && S.openId && S.isAdmin) [.../** @type {NodeListOf<HTMLElement>} */ (root.querySelectorAll('.card .btn'))].find((b) => /^(resolve|reopen)$/.test(b.textContent))?.click();
      return;
    }
    // Escape closes the top one: a thread or new comment first, then the chat, then the list (typed chat text stays).
    if (e.key === 'Escape' && (S.draft || S.openId)) {
      // A new comment let go with Escape takes its words and its spot with it (a reload would give a box back that was
      // closed on purpose); a click elsewhere only closes an empty one, and the words wait.
      if (S.draft) {
        store.set(`lab-typing:${S.page}:new`, '');
        keepSpot(null);
      }
      S.draft = null;
      S.openId = null;
      e.preventDefault(); // this press was this one's: whatever listens after (the board's Esc) leaves it
      render();
    } else if (e.key === 'Escape' && S.chatOpen) {
      S.chatOpen = false;
      e.preventDefault();
      render();
    }
  });

  // Always ready to pin: a click on the page (not on a link or control) opens a new comment there.
  // Alt/Option-click pins on links and controls too. With a comment open, the first click outside only closes it.
  const INTERACTIVE =
    'a, button, input, textarea, select, label, summary, video[controls], audio, iframe, [contenteditable], [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="option"], [role="checkbox"], [role="switch"], [tabindex]:not([tabindex="-1"]), [onclick]';
  // The page's own controls: links, buttons and fields, and anything the page gives a hand pointer (a clickable card, a
  // demo you tap to play), or that's inside one. A click there is the page's, as its pointer says; the widget's pointer
  // steps aside over them (lab-ctl). Clicking demos dropped stray pins (Leo, 16 Nov).
  // Whether the thing under the mouse keeps its own click, said in the class the pointer rules read.
  const sayCtl = (t) =>
    document.documentElement.classList.toggle(
      'lab-ctl',
      !S.overControls && !host.contains(/** @type {Node} */ (t)) && t !== host && control(t),
    );
  // Said again without waiting for the mouse to move (the switch in the ⋯ menu changes the answer under it).
  S.recheckCtl = () => S.mouse && sayCtl(document.elementFromPoint(S.mouse.x, S.mouse.y));
  const control = (t) => {
    if (S.overControls) return false; // with the switch on, nothing on the page keeps its click
    const hand = !document.documentElement.classList.contains('lab-ink-over'); // over inked words the hand is ours (wordink.ts)
    for (let n = t instanceof Element ? t : null; n && n !== document.body && n !== document.documentElement; n = n.parentElement)
      if (n.matches(INTERACTIVE) || (hand && getComputedStyle(n).cursor === 'pointer')) return true;
    return false;
  };
  // data-uncommentable: no new pins or areas start inside this part of the page (same attribute as Claude artifacts).
  const OFF = '[data-uncommentable]';
  // Drag (mouse or pen) to mark an area instead of a point. Touch keeps scrolling.
  S.drag = null;
  S.afterDrag = false;
  S.liveZone = null;
  S.zoneFrame = 0;
  // One write per frame, position by transform: the frame follows the pointer without forcing layout in between.
  // The least an area is, each way. A flat drag drew a hairline as wide as the window, which reads as a line
  // across the page rather than as something being marked. The saved area grows to the same (see endDrag).
  const ZONE_MIN = 12;
  const paintZone = () => {
    S.zoneFrame = 0;
    if (!S.drag?.active || !S.liveZone) return;
    const span = (a, b) => {
      const size = Math.max(Math.abs(b - a), ZONE_MIN);
      return { start: (a + b) / 2 - size / 2, size };
    };
    const across = span(S.drag.x0, S.drag.x1);
    const down = span(S.drag.y0, S.drag.y1);
    S.liveZone.style.transform = `translate3d(${across.start + scrollX}px, ${down.start + scrollY}px, 0)`;
    S.liveZone.style.width = `${across.size}px`;
    S.liveZone.style.height = `${down.size}px`;
  };
  // An open new-comment box with nothing typed in it doesn't block drawing an area (a stray click had opened one, and
  // every drag after it silently did nothing until it was closed); one with words in it does, so they aren't lost.
  const draftHasText = () => Boolean(S.draft) && [.../** @type {NodeListOf<HTMLTextAreaElement>} */ (root.querySelectorAll('.float textarea'))].some((t) => t.value.trim());
  function startDrag(e) {
    // An open card doesn't block a new area: it closes once the area is drawn (a plain click still just closes it).
    if ((!S.on && !e.altKey) || (S.cursorMode && !e.altKey) || draftHasText() || e.button !== 0 || e.pointerType === 'touch' || e.metaKey || e.ctrlKey || (e.shiftKey && !S.shiftUp && !S.dKey)) return;
    // Holding D, a press on an earlier drawing's line draws a new one instead of opening it.
    if (e.composedPath().includes(host) && !(S.dKey && e.composedPath().some((n) => n instanceof Element && n.matches('.ink .hit')))) return;
    // Holding D, a press on a link or a button draws too: circling a broken button is the point (sims, 20 Nov).
    if (!e.altKey && !S.dKey && control(e.target)) return;
    if (e.target instanceof Element && e.target.closest(OFF)) return;
    if (S.drag) return; // one pointer at a time: a palm on the glass while the pen draws is not a second stroke
    S.drag = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY, active: false, ink: S.dKey, id: e.pointerId };
    if (S.dKey) clearTimeout(S.inkTimer); // another stroke of the same drawing
  }
  document.addEventListener('pointerdown', (e) => !e.altKey && startDrag(e), true); // Option presses are taken earlier (see optionPress)
  document.addEventListener(
    'pointermove',
    (e) => {
      if (!S.drag || e.pointerId !== S.drag.id) return; // another pointer (a palm) moving
      S.drag.x1 = e.clientX;
      S.drag.y1 = e.clientY;
      if (!S.drag.active && Math.hypot(S.drag.x1 - S.drag.x0, S.drag.y1 - S.drag.y0) > 8) {
        S.drag.active = true;
        getSelection?.()?.removeAllRanges();
        document.documentElement.classList.add('lab-dragging');
        if (S.drag.ink) {
          if (!S.inking && S.draft?.anchor?.ink && S.lastInk && !draftHasText()) {
            layer.append((S.inking = liveInk()).svg);
            S.inking.strokes.push(...S.lastInk.map((q) => q.map((p) => ({ ...p }))));
            S.draft = null;
            keepSpot(null);
            render();
          }
          if (!S.inking) layer.append((S.inking = liveInk()).svg);
          S.inking.strokes.push([{ x: S.drag.x0 + scrollX, y: S.drag.y0 + scrollY }]);
          // Held by the page till the pen lifts: a stroke run into a frame, or off the window, still ends here.
          try {
            document.documentElement.setPointerCapture(e.pointerId);
          } catch {}
        } else layer.append((S.liveZone = zoneEl('draft live')));
      }
      if (!S.drag.active) return;
      e.preventDefault();
      if (S.drag.ink) {
        const st = S.inking.strokes.at(-1);
        const q = st.at(-1);
        const now = e.timeStamp;
        const x = e.clientX + scrollX;
        const y = e.clientY + scrollY;
        const speed = q ? Math.hypot(x - q.x, y - q.y) / Math.max(1, now - (S.inkT || now - 16)) : 0; // px a ms
        S.inkT = now;
        // A pen's pressure sets the width; a mouse or finger draws thinner the faster it moves (Leo's pick 4, 20 Nov).
        const want = e.pointerType === 'pen' && e.pressure > 0 ? 1.5 + e.pressure * 4 : Math.max(1.6, Math.min(5, 5 - speed * 1.8));
        st.push({ x, y, w: q?.w ? (q.w + want) / 2 : want });
        return void S.inking.paint();
      }
      S.zoneFrame ||= requestAnimationFrame(paintZone);
    },
    true,
  );
  const endDrag = (e) => {
    if (!S.drag || e.pointerId !== S.drag.id) return; // another pointer lifting or cancelled (a palm) doesn't end the stroke
    const d = S.drag;
    S.drag = null;
    document.documentElement.classList.remove('lab-dragging');
    cancelAnimationFrame(S.zoneFrame);
    S.zoneFrame = 0;
    S.liveZone?.remove();
    S.liveZone = null;
    if (d.active && d.ink && e.type === 'pointercancel' && S.inking) {
      S.afterDrag = true; // nor is a click that may follow it
      setTimeout(() => (S.afterDrag = false), 0);
      S.drew = true;
      S.inking.strokes.pop(); // a cancelled stroke (the system took the pointer) is not part of the drawing
      if (S.inking.strokes.length) S.inking.paint();
      else {
        S.inking.svg.remove();
        S.inking = null;
      }
      return;
    }
    if (!d.active || e.type === 'pointercancel') return;
    // The click that follows this pointerup belongs to the drag, not a new pin.
    S.afterDrag = true;
    setTimeout(() => (S.afterDrag = false), 0);
    getSelection?.()?.removeAllRanges();
    // A stroke of a drawing: more may follow while D is held. It is done when D is let go, or a second after the last.
    if (d.ink) {
      S.drew = true;
      // Shift held as the pen lifts: a stroke that runs about straight becomes a straight line, flat, upright or at 45°
      // (Leo's pick S1, 20 Nov); a rough box or loop a clean rectangle or ellipse (S2). Anything else stays as drawn.
      const st = S.inking?.strokes.at(-1);
      if (e.shiftKey && st?.length > 1) {
        const [a, b] = [st[0], st.at(-1)];
        const chord = Math.hypot(b.x - a.x, b.y - a.y);
        const run = st.reduce((n, p, i) => (i ? n + Math.hypot(p.x - st[i - 1].x, p.y - st[i - 1].y) : 0), 0);
        if (chord > 12 && run < chord * 1.35) {
          const ang = Math.round(Math.atan2(b.y - a.y, b.x - a.x) / (Math.PI / 4)) * (Math.PI / 4);
          const w = st.reduce((n, p) => n + (p.w || 3), 0) / st.length;
          st.splice(0, st.length, { x: a.x, y: a.y, w }, { x: a.x + chord * Math.cos(ang), y: a.y + chord * Math.sin(ang), w });
          S.inking.paint();
        } else {
          // A rough box or loop comes out neat: a rectangle or an ellipse (Leo's pick S2). The reading part is loaded
          // with D, so this lands well before the drawing is read, a second later.
          const ink = S.inking;
          part('draw').then(({ neaten }) => {
            const neat = neaten?.(st);
            if (!neat || !ink.strokes.includes(st)) return;
            st.splice(0, st.length, ...neat);
            ink.paint();
          }).catch(() => {});
        }
      }
      clearTimeout(S.inkTimer);
      S.inkTimer = setTimeout(endInk, 1000);
      return;
    }
    // A thin drag (a line of text, a small icon) still makes an area: it keeps the size it was drawn at,
    // ZONE_MIN each way around its middle, instead of silently doing nothing.
    for (const [a, b] of [['x0', 'x1'], ['y0', 'y1']]) {
      if (Math.abs(d[b] - d[a]) >= ZONE_MIN) continue;
      const mid = (d[a] + d[b]) / 2;
      d[a] = mid - ZONE_MIN / 2;
      d[b] = mid + ZONE_MIN / 2;
    }
    showAgain();
    S.openId = null;
    begin(zoneAnchor(d));
  };
  S.dKey = false;
  S.inking = null;
  // What a drawing sent with no words says: its mark, without the guess in brackets.
  const inkSaid = (mark = '') => mark.replace(/\s*\(likely:.*\)$/, '') || 'drawing';
  async function endInk() {
    clearTimeout(S.inkTimer);
    const ink = S.inking;
    S.inking = null;
    if (!ink) return;
    const { readInk } = await part('draw').catch(() => ({ readInk: null }));
    ink.svg.remove();
    S.lastInk = ink.strokes; // a stroke drawn while its box is open, empty, joins it (above)
    if (!readInk) return;
    showAgain();
    S.openId = null;
    // An arrow's ends are named with the card or section they are in: "Shared availability" is in two plans (sims, 20 Nov).
    const block = (e) => e.parentElement?.closest('article, section, li, tr, figure, [id]');
    const here = ink.strokes.map((q) => q.map((p) => ({ ...p, x: p.x - scrollX, y: p.y - scrollY }))); // page → window, as the reader looks
    const read = readInk(here, (e) => e && short(`${openingTag(e)} "${short(e.textContent, 40)}"${block(e) ? ` in ${openingTag(block(e))} "${short(block(e).textContent, 30)}"` : ''}`, 200));
    // The box opens with the lines: Enter sends the drawing as it is (its first line is what it reads as), or type a
    // few words first. Sims, 20 Nov: a drawing with 2-3 words was right most often; arrows and X need none.
    begin(inkAnchor(read, ZONE_MIN));
  }
  // D let go: the drawing is done, or, when nothing was drawn, done pins show or hide (KEYS.done).
  addEventListener('keyup', (e) => {
    if (!S.dKey || actionOf(e) !== 'done') return;
    S.dKey = false;
    if (S.inking && !S.drag) endInk();
    else if (!S.drew && !S.drag && !S.dShift) toggleDone(); // the pen still down: it's a drawing, done pins stay as they are; ⇧D alone does nothing here
  }, true);
  addEventListener('blur', () => (S.dKey = false));
  // The drawing's box is open and focused, nothing typed yet: D pressed again types a "d" there. If a stroke starts
  // while it is still held, it was D held to draw on: the "d" goes and the stroke joins the drawing (edge tests, 20 Nov).
  addEventListener('keydown', (e) => {
    if (S.dKey || e.repeat || e.metaKey || e.ctrlKey || e.altKey || actionOf(e) !== 'done' || !S.draft?.anchor?.ink) return;
    const ta = e.composedPath()[0];
    if (ta instanceof HTMLTextAreaElement && !ta.value.trim()) S.dMaybe = ta;
  }, true);
  addEventListener('keyup', (e) => actionOf(e) === 'done' && (S.dMaybe = null), true);
  addEventListener('pointerdown', (e) => { // on the window: before the document's press that starts the stroke
    if (!S.dMaybe || e.button !== 0) return;
    if (S.dMaybe.value.trim().toLowerCase() === 'd') S.dMaybe.value = '';
    S.dMaybe.blur();
    S.dMaybe = null;
    S.dKey = true;
    S.drew = false;
  }, true);
  document.addEventListener('pointerup', endDrag, true);
  document.addEventListener('pointercancel', endDrag, true);
  // Don't let images and videos start a native drag while comments are on: a press there marks an area.
  document.addEventListener(
    'dragstart',
    (e) => {
      const media = S.on && e.target instanceof Element && e.target.closest('img, video') && !e.composedPath().includes(host);
      if (S.drag || media) e.preventDefault();
    },
    true,
  );

  document.addEventListener(
    'click',
    (e) => {
      if (!S.afterDrag) return;
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
    if (!S.afterDrag) onPageClick(e); // the click that ends an Option-drag belongs to the area
  }, true);

  // Whether a click is on one of the page's controls is read as it starts, before the page's own handlers run: a demo
  // that redraws itself on click left its target off the page, which then didn't look like a control (and got pinned).
  S.ctlClick = false;
  addEventListener('click', (e) => (S.ctlClick = control(e.target)), true);
  document.addEventListener('click', (e) => onPageClick(e));

  // Phones. A tap only reads (it closes what's open); holding a finger still for half a second pins, anywhere, links
  // and buttons too (the phone's Option-click). Text selected the phone's way gets the actions bar that pins on it.
  S.lastTouch = 0;
  S.pinnedByHold = false; // a hold just made a pin: the lift that ends it puts the cursor in its box (phones open the keyboard only then)
  const scrim = /** @type {HTMLElement} */ (root.querySelector('.scrim'));
  // The open sheet (phones): a thread, a new comment, the list or the chat.
  /** @returns {HTMLElement | null} */
  const openSheet = () => (S.labsOpen && labs?.switcherSheet()) || root.querySelector('.card:not(.out), .float:not(.out)') || (S.chatOpen ? chatEl : null);
  const closeAll = () => {
    if (S.labsOpen) return labs?.closeSwitcher(); // labs & pages sits over the others: only it goes
    S.draft = null;
    S.openId = null;
    S.chatOpen = false;
    render();
  };
  // Unsent words: the card or sheet shakes sideways ("no") instead of closing, on a computer (⌥W) and a phone alike.
  const shake = (/** @type {Element | null | undefined} */ node) => node?.animate?.([{ transform: 'none' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'none' }], { duration: ms('base'), easing: ease() });
  // Text typed in a thread or a new comment would be lost, so the sheet stays and shakes instead; the chat's box keeps
  // its text when closed, so the chat always closes.
  const closeOrNudge = () => {
    const node = openSheet();
    if (![...root.querySelectorAll('textarea')].some((t) => t.value.trim() && !chatEl.contains(t))) return slideAway(node, closeAll);
    shake(node);
  };
  // A tap on the dimmed page closes the sheet; a pull on it moves the sheet with the finger (see swipeDown), and the
  // click that ends such a pull isn't a tap.
  S.sheetDraggedAt = -1e9;
  scrim.addEventListener('click', () => performance.now() - S.sheetDraggedAt > 300 && closeOrNudge());
  scrim.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false }); // iOS's sheet curve
  // Android's back gesture closes an open sheet first, like a native one, instead of leaving the page (CloseWatcher,
  // Chrome 120+; elsewhere back works as before). With something typed it nudges, as a tap on the dimmed page does.
  S.backWatcher = null;
  // iOS lays fixed things out on the page's full height while the keyboard covers its bottom part (and Safari may
  // pan the view). Measure what is hidden below what the screen shows, from a fixed probe the height of the layout,
  // so the sheets keep their box just above the keyboard and fit the rest (see --lab-kb and --lab-vh in the CSS).
  const vv = window.visualViewport;
  startSheets();
  // The chat stays at its newest message while it gets shorter (the keyboard coming up, the reply strip), unless
  // you scrolled back to read.
  const msgsEl = $('.msgs', chatEl);
  S.stick = true;
  msgsEl.addEventListener('scroll', () => (S.stick = msgsEl.scrollHeight - msgsEl.scrollTop - msgsEl.clientHeight < 48), { passive: true });
  if ('ResizeObserver' in window) new ResizeObserver(() => S.stick && (msgsEl.scrollTop = msgsEl.scrollHeight)).observe(msgsEl);
  swipeDown(chatEl, () => ((S.chatOpen = false), render()), true);
  S.press = null;
  const stopPress = () => S.press && (clearTimeout(S.press.timer), (S.press = null));
  // The page can't be selected while a finger is down on it (see lab-press in the CSS below), and can again a frame
  // after the lift, once iOS has let go of its own long press. Safari doesn't repaint the quoted words' green when the
  // text turns selectable, so the highlight a hold just set is set again, a frame later.
  const pressing = (on) => {
    const html = document.documentElement;
    if (on) return html.classList.add('lab-press');
    if (!html.classList.contains('lab-press')) return;
    requestAnimationFrame(() => {
      html.classList.remove('lab-press');
      const lit = window.CSS?.highlights?.get('lab-quote');
      if (lit) CSS.highlights.set('lab-quote', new Highlight(...lit));
    });
  };
  document.addEventListener(
    'pointerdown',
    (e) => {
      stopPress();
      S.pinnedByHold = false;
      if (e.pointerType === 'touch') S.lastTouch = Date.now();
      if (e.pointerType !== 'touch' || S.draft || !(e.target instanceof Element) || e.composedPath().includes(host) || e.target.closest(OFF)) return;
      const { clientX: x, clientY: y } = e;
      pressing(true);
      S.press = {
        x,
        y,
        timer: setTimeout(() => {
          S.press = null;
          S.pinnedByHold = true;
          navigator.vibrate?.(8);
          getSelection?.()?.removeAllRanges();
          S.afterDrag = true; // the lift that ends the hold isn't a tap on the link
          setTimeout(() => (S.afterDrag = false), 800);
          showAgain();
          S.openId = null;
          begin(anchorAt(x, y));
          // 400 ms: before iOS's own long press (~500 ms), which selects text and cancels the touch. At 500 ms the two
          // raced, and the hold sometimes gave a text selection instead of a pin (iOS 27 simulator, 16 Nov).
        }, 400),
      };
    },
    true,
  );
  document.addEventListener('pointermove', (e) => S.press && Math.hypot(e.clientX - S.press.x, e.clientY - S.press.y) > 10 && stopPress(), true);
  document.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'touch') S.lastTouch = Date.now();
    stopPress();
    pressing(false);
    // A finger's lift is touchend's (one focus, so the keyboard doesn't close and open again).
    if (S.pinnedByHold && e.pointerType !== 'touch') /** @type {HTMLElement | null} */ (root.querySelector('.float textarea'))?.focus({ preventScroll: true });
  }, true);
  // The lift after a hold: no click follows it (it would land on the dimmed page and take the cursor away), and the
  // touch's own end puts the cursor in the box, so the phone opens its keyboard.
  document.addEventListener('touchend', (e) => {
    pressing(false);
    if (!S.pinnedByHold) return;
    S.pinnedByHold = false;
    e.preventDefault();
    const box = /** @type {HTMLElement | null} */ (root.querySelector('.float textarea'));
    if (box && root.activeElement === box) box.blur(); // focused without a keyboard: again from the lift, so it opens
    box?.focus({ preventScroll: true });
  }, { capture: true, passive: false });
  // iOS took the touch (its own long press): no lift comes, and a tap in the box opens the keyboard. The next touch's
  // lift isn't this hold's.
  document.addEventListener('touchcancel', () => (S.pinnedByHold = false), true);
  document.addEventListener('pointercancel', () => (stopPress(), pressing(false)), true);
  addEventListener('scroll', stopPress, { passive: true, capture: true });
  document.addEventListener('contextmenu', (e) => (S.press || S.afterDrag) && e.preventDefault(), true);
  // Selecting words. Computers: Shift + drag (or Shift + double or triple click) selects words; a plain drag marks an area
  // wherever it starts, a click pins, and the page's text can't be selected without Shift (it shows the I-beam cursor,
  // html.lab-shift-cur). Letting go opens the comment card on the words, the cursor in its box. Phones: holding a finger
  // still pins (hold-to-comment); a selection made the phone's way is the page's own.
  // The words selected, as an anchor: pinned at their end, quoting exactly them (a few words either side to find them
  // again), not just the word under the pin.
  const selectionAnchor = () => {
    const sel = getSelection?.();
    const range = sel?.rangeCount && sel.getRangeAt(0).cloneRange(); // a copy: moving the selection's own range would take the cursor from a box being typed in
    if (!range || host.contains(range.commonAncestorContainer)) return;
    // A double-click takes the word's space with it (Chrome): the quote, and the words each side of it, are read from
    // the words alone, or the quote would not be found again.
    /** @param {Node} node @param {number} i @param {number} step */
    const trim = (node, i, step) => {
      while (node.nodeType === 3 && /\s/.test(/** @type {Text} */ (node).data[step < 0 ? i - 1 : i] ?? 'x')) i += step;
      return i;
    };
    range.setEnd(range.endContainer, trim(range.endContainer, range.endOffset, -1));
    range.setStart(range.startContainer, trim(range.startContainer, range.startOffset, 1));
    wholeWords(range); // a drag that starts or ends inside a word takes the whole word (anchoring.ts)
    const exact = String(range).replace(/\s+/g, ' ').trim();
    if (!exact) return;
    // The pin sits on the last selected letter (where the selection ended), when that's in the same element as its
    // first; a selection over several items keeps it on the first, so the pin finds its place again.
    const rects = range.getClientRects();
    const first = rects[0] || range.getBoundingClientRect();
    const last = rects[rects.length - 1] || first;
    const startEl = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
    const endEl = range.endContainer.nodeType === 1 ? range.endContainer : range.endContainer.parentElement;
    const anchor = startEl && (startEl === endEl || startEl.contains(endEl))
      ? anchorAt(Math.max(last.left, last.right - 2), last.top + last.height / 2, false, endEl)
      : anchorAt(first.left + 2, first.top + first.height / 2, false, startEl);
    const at = range.commonAncestorContainer;
    const block = /** @type {Element | null} */ (at.nodeType === 1 ? at : at.parentElement)?.closest('p, li, h1, h2, h3, h4, h5, h6, td, th, figcaption, blockquote, pre, section, article, div') || document.body;
    /** @param {[Node, number]} a @param {[Node, number]} b */
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
      selected: true, // picked by selecting, not the word under a click: shown as ink on the words (wordink.ts)
      // Saved at 300 characters; a longer selection also keeps its last words, so the ink reaches them (anchoring.ts).
      ...(exact.length > 300 && { tail: exact.slice(-40) }),
    };
    sel.removeAllRanges();
    return anchor;
  };
  // Computers, a drag over words let go: the comment card opens at once on the words, the cursor in its box.
  const offerSelection = () => {
    const got = selectionAnchor();
    if (!got) return; // a double-click's first mouse-up asks again, after the second one took the selection: keep that dialog
    if (S.draft) {
      // an empty box a click, or the first click of a double-click, opened gives way
      S.draft = null;
      keepSpot(null);
    }
    showAgain();
    S.openId = null;
    begin(got);
  };
  // The actions row of a new comment (the box is the comment, so no button for it): your own actions (labit.json
  // `actions`), each sending its text at once on a click. They go through the box's own send, so a missing name is asked
  // for there, a lab that can't be reached keeps them. ⌥ + 1…4 runs the nth button (holding ⌥ shows the numbers).
  /** @type {{ i: number, a: { name: string, prompt: string }, until: number } | null} */
  let ACT_GONE = null; // the action just deleted from a "…" list, while its "deleted · undo" is on offer (4 s)
  const quickRow = (draft, box) => {
    const row = el('div', { class: 'quick' });
    const field = /** @type {HTMLTextAreaElement} */ (box.querySelector('textarea'));
    const fill = (v) => ((field.value = v), field.dispatchEvent(new Event('input')));
    const go = (said, prompt = '') => {
      if (prompt) draft.anchor.act = prompt; // the agent reads the whole prompt: "action: …"
      else delete draft.anchor.act;
      fill(said);
      /** @type {HTMLElement} */ (box.querySelector('.send')).click();
    };
    const chip = (a) => {
      const b = actButton(a.name);
      b.title = a.prompt;
      b.addEventListener('mousedown', (e) => e.preventDefault()); // the cursor stays in the box
      b.addEventListener('click', () => go(field.value.trim() ? `${a.name}: ${field.value.trim()}` : a.name, a.prompt));
      return b;
    };
    {
      // Your list, in its order: as many chips as fit on one line (measured), then "…". "…"
      // grows the line into the whole list (tap = use it) and, on this computer, hold or right-click a row to edit it, "+ add"
      // (saved in your settings through the lab, PUT /_lab/api/actions; a new one goes at the end).
      const mayEdit = Boolean(adminToken && ACTSAPI);
      const menu = el('div', { class: 'acts', hidden: '' });
      const dots = el('button', { type: 'button', 'data-k': '…', 'aria-label': 'more actions', 'aria-expanded': 'false' }, '…');
      const chips = LIST.map(chip);
      let shown = LIST.length;
      const quiet = (b) => (b.addEventListener('mousedown', (e) => e.preventDefault()), b);
      const btn = (text, attrs = {}) => el('button', { type: 'button', ...attrs }, text);
      const save = async (next, why) => {
        const r = await fetch(ACTSAPI, { method: 'PUT', headers: headers(), body: JSON.stringify({ actions: next }) }).catch(() => null);
        if (!r?.ok) return void (why.textContent = r ? await r.text() : 'the lab is not answering');
        LIST = (await r.json()).actions;
        editing?.close();
        const top = menu.scrollTop;
        const fresh = quickRow(draft, box); // the line again, measured, with its menu open where it was
        row.replaceWith(fresh);
        menu.remove();
        queueMicrotask(() => {
          const d = /** @type {HTMLElement | null} */ (fresh.querySelector('[data-k="…"]'));
          if (!d) return;
          d.dataset.still = '1'; // open again as it was, no growing
          d.click();
          const m = fresh.nextElementSibling;
          if (m?.classList.contains('acts')) m.scrollTop = top;
        });
        return true;
      };
      // Edit in place (Leo, 19 Nov, "C" of the preset editor page): a held or right-clicked row turns editable where it
      // is, on soft grey, no form and no boxes. The name is plain text (7 letters just stop; "6/7" shows near the end),
      // the prompt under it unfolds to its full length and grows as you type, a muted "delete" sits at the row's end
      // (no confirm: "deleted · undo" stands in its place for 4 s). Enter in the name goes to the prompt, Enter in the
      // prompt saves (Shift+Enter is a new line), Escape or a tap anywhere else cancels. "+ add" opens an empty row the
      // same way, at the end. Phones: the row is kept in view above the keyboard, inside the sheet's list.
      /** @type {{ line: HTMLElement, close: () => void } | null} */
      let editing = null;
      const keepInView = (line) => {
        if (!line.isConnected) return;
        const m = menu.getBoundingClientRect();
        const r = line.getBoundingClientRect();
        const vv = window.visualViewport;
        const bottom = Math.min(m.bottom, vv ? vv.offsetTop + vv.height : innerHeight);
        if (r.bottom > bottom) menu.scrollTop += r.bottom - bottom + 4;
        else if (r.top < m.top) menu.scrollTop -= m.top - r.top;
      };
      const editRow = (line, i, focus = true) => {
        if (editing?.line === line) return null;
        editing?.close();
        const fresh = i >= LIST.length;
        const a = LIST[i] || { name: '', prompt: '' };
        const kept = /** @type {HTMLElement[]} */ ([...line.children]); // hidden while edited: a hold's touch still ends on it
        for (const k of kept) k.hidden = true;
        line.classList.add('act-edit');
        const name = /** @type {HTMLInputElement} */ (el('input', { class: 'nm', maxlength: String(NAME_MAX), placeholder: 'name', 'aria-label': 'name', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'next' }));
        const cnt = el('span', { class: 'cnt', 'aria-live': 'polite' });
        const del = btn('delete', { class: 'del' });
        del.hidden = fresh;
        const prompt = /** @type {HTMLTextAreaElement} */ (el('textarea', { class: 'p', rows: '1', maxlength: '300', placeholder: 'what the agent does', 'aria-label': 'prompt', enterkeyhint: 'done' }));
        const why = el('span', { class: 'why', role: 'status' });
        const fields = el('div', { class: 'act-fields' });
        fields.append(name, cnt, del, prompt, el('span', { class: 'k' }, coarse ? 'return saves · tap outside cancels' : 'Enter saves · Esc cancels'), why);
        line.append(fields);
        name.value = a.name;
        prompt.value = a.prompt;
        const count = () => (cnt.textContent = name.value.length >= NAME_MAX - 1 ? `${name.value.length}/${NAME_MAX}` : '');
        const fit = () => {
          prompt.style.height = 'auto';
          prompt.style.height = `${prompt.scrollHeight}px`;
          keepInView(line);
        };
        name.addEventListener('input', () => ((why.textContent = ''), count()));
        prompt.addEventListener('input', () => ((why.textContent = ''), fit()));
        const commit = () => {
          const next = [...LIST];
          next[i] = { name: name.value.trim(), prompt: prompt.value.trim() };
          if (fresh && !next[i].name && !next[i].prompt) return close();
          if (!fresh && next[i].name === a.name && next[i].prompt === a.prompt) return close();
          save(next, why);
        };
        del.addEventListener('click', async () => {
          ACT_GONE = { i, a, until: Date.now() + 4000 };
          if (!(await save(LIST.filter((_, j) => j !== i), why))) ACT_GONE = null;
        });
        fields.addEventListener('keydown', (e) => {
          if (e.isComposing) return;
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            close();
          } else if (e.key === 'Enter' && e.target === name) {
            e.preventDefault();
            prompt.focus();
          } else if (e.key === 'Enter' && e.target === prompt && !e.shiftKey) {
            e.preventDefault();
            commit();
          }
        });
        fields.addEventListener('focusin', () => requestAnimationFrame(() => keepInView(line)));
        const vv = window.visualViewport;
        const onView = () => keepInView(line);
        vv?.addEventListener('resize', onView);
        // A tap anywhere else cancels, and is only that: a tap on another row (or done, + add) doesn't also use it.
        const eat = (e) => (e.preventDefault(), e.stopPropagation());
        const outside = (e) => {
          if (e.composedPath().includes(line)) return;
          close();
          if (!e.composedPath().includes(menu)) return;
          menu.addEventListener('click', eat, { capture: true, once: true });
          setTimeout(() => menu.removeEventListener('click', eat, true), 800);
        };
        document.addEventListener('pointerdown', outside, true);
        function close() {
          if (editing?.line !== line) return;
          editing = null;
          document.removeEventListener('pointerdown', outside, true);
          vv?.removeEventListener('resize', onView);
          if (fresh) return void line.remove();
          fields.remove();
          line.classList.remove('act-edit');
          for (const k of kept) k.hidden = false;
        }
        editing = { line, close };
        count();
        requestAnimationFrame(fit);
        if (focus) name.focus();
        return name;
      };
      // Growing sheet (Leo, 19 Nov, "c"): "…" grows the line itself into the whole list, in the same sheet or box, the
      // text field staying where it is below it. Each row is the action's name over its prompt on one muted line, tap =
      // use it; holding it (450 ms) or right-clicking it edits it in place, no pencil (Leo, 19 Nov: "i dont like pencil remove it");
      // "+ add" is the last row, "done" (or "…" again) folds it back to the line. Until you have edited once, the bottom
      // line says how, muted, in the room between "+ add" and "done" (so nothing moves when it goes).
      function fill() {
        editing?.close();
        menu.replaceChildren();
        const list = el('div', { class: 'act-list' });
        for (const i of LIST.keys()) {
          const a = LIST[i];
          const line = el('div', { class: 'act' });
          const use = quiet(btn('', { class: 'use', 'data-act': a.name, title: a.prompt }));
          use.append(el('b', {}, a.name), el('span', {}, a.prompt));
          let held = false; // a hold opened the editor: the click that follows the release is not a use
          use.addEventListener('click', () => (held ? (held = false) : (openMenu(false, true), chips[i].click())));
          line.append(use);
          if (mayEdit) {
            /** @type {HTMLInputElement | null} */
            let focusOnLift = null; // a finger's hold: the keyboard comes up on the lift (iOS raises it only for a touch)
            const edit = (focus) => {
              if (!line.isConnected) return;
              store.set('lab-act-edited', '1');
              const name = editRow(line, i, focus);
              if (name && !focus) focusOnLift = name;
            };
            use.addEventListener('contextmenu', (e) => (e.preventDefault(), (held = true), edit(e.pointerType !== 'touch' && !coarse)));
            /** @type {ReturnType<typeof setTimeout> | undefined} */
            let t;
            let at = [0, 0];
            const stop = () => clearTimeout(t);
            use.addEventListener('pointerdown', (e) => {
              if (e.button) return;
              held = false;
              focusOnLift = null;
              at = [e.clientX, e.clientY];
              stop();
              t = setTimeout(() => ((held = true), edit(e.pointerType === 'mouse')), 450);
            });
            use.addEventListener('pointermove', (e) => Math.hypot(e.clientX - at[0], e.clientY - at[1]) > 8 && stop());
            for (const k of ['pointercancel', 'pointerleave']) use.addEventListener(k, stop);
            const lift = () => {
              stop();
              focusOnLift?.focus();
              focusOnLift = null;
            };
            use.addEventListener('pointerup', lift);
            use.addEventListener('touchend', lift);
          }
          list.append(line);
        }
        // Just deleted: "deleted · undo" stands in its place for 4 s; undo puts it back where it was.
        const g = ACT_GONE && ACT_GONE.until > Date.now() ? ACT_GONE : null;
        if (g) {
          const line = el('div', { class: 'act gone' });
          const why = el('span', { class: 'why', role: 'status' });
          const undo = quiet(btn('undo', { class: 'undo' }));
          undo.addEventListener('click', () => {
            if (ACT_GONE !== g) return;
            ACT_GONE = null;
            const next = [...LIST];
            next.splice(Math.min(g.i, next.length), 0, g.a);
            save(next, why);
          });
          line.append(el('span', {}, 'deleted ·'), undo, why);
          list.insertBefore(line, list.children[g.i] || null);
          setTimeout(() => line.remove(), g.until - Date.now());
        }
        const foot = el('div', { class: 'act-foot' });
        if (mayEdit) {
          const add = btn('+ add', { class: 'add' });
          add.addEventListener('click', () => {
            const line = el('div', { class: 'act' });
            list.insertBefore(line, foot);
            editRow(line, LIST.length);
          });
          foot.append(add);
          if (!store.get('lab-act-edited')) foot.append(el('span', { class: 'act-hint' }, coarse ? 'hold to edit' : 'right-click to edit'));
        }
        const fold = quiet(btn('done', { class: 'fold' }));
        fold.addEventListener('click', () => openMenu(false));
        foot.append(fold);
        list.append(foot);
        menu.append(list);
      }
      // The height eases from the line's to the list's (and back) over --_t-base, none with reduced motion; the sheet sits on
      // the bottom on a phone, so it grows upward, and the page under it never moves.
      let anim = null;
      const fit = (from, to, then) => {
        anim?.cancel();
        anim = null;
        if (still.matches || !from || !to || from === to) return void then?.();
        anim = menu.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: ms('base'), easing: ease('out') });
        anim.onfinish = () => ((anim = null), then?.());
      };
      let lineH = 0; // the line's height when it grew, to fold back to
      const openMenu = (open, now = false) => {
        if (open === !menu.hidden) return;
        dots.setAttribute('aria-expanded', String(open));
        if (!open) {
          const shut = () => ((menu.hidden = true), (row.hidden = false));
          return now ? shut() : fit(menu.offsetHeight, lineH, shut);
        }
        lineH = row.offsetHeight;
        fill();
        row.hidden = true;
        menu.hidden = false;
        if (!now) fit(lineH, menu.offsetHeight);
      };
      quiet(dots).addEventListener('click', () => {
        const now = dots.dataset.still === '1';
        delete dots.dataset.still;
        openMenu(menu.hidden, now);
      });
      menu.addEventListener('keydown', (e) => e.key === 'Escape' && !(/** @type {Element} */ (e.target)).closest('.act-edit') && (e.stopPropagation(), openMenu(false)));
      row.append(...chips, dots);
      let tries = 0;
      const measure = () => {
        if (!row.isConnected || !row.clientWidth) return void (tries++ < 10 && requestAnimationFrame(measure));
        row.after(menu);
        const over = () => row.scrollWidth > row.clientWidth + 1;
        while (over() && shown) chips[--shown].remove();
        dots.hidden = shown === LIST.length && !mayEdit;
        [...row.children].forEach((b, n) => b.setAttribute('data-n', String(n + 1)));
      };
      queueMicrotask(measure);
    }
    // ⌥ + 1…4 (by the key's place, so Option's own characters don't matter) runs the nth button; holding ⌥ shows the numbers.
    [...row.children].forEach((b, n) => b.setAttribute('data-n', String(n + 1)));
    const alt = (on) => row.classList.toggle('alt', on);
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Alt') alt(true);
      const n = e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey ? /^Digit([1-4])$/.exec(e.code)?.[1] : '';
      const b = row.isConnected && n ? row.children[+n - 1] : null; // a line saved over (✎) answers no more
      if (!b) return;
      e.preventDefault();
      e.stopPropagation();
      /** @type {HTMLElement} */ (b).click();
    }, true);
    box.addEventListener('keyup', (e) => e.key === 'Alt' && alt(false), true);
    box.addEventListener('focusout', () => alt(false));
    return row;
  };
  // Computers: Shift + drag (or Shift + double or triple click) selects words; letting go opens the comment dialog.
  document.addEventListener('mouseup', (e) => {
    if (S.on && !S.cursorMode && e.shiftKey && !S.shiftUp && e.button === 0 && !draftHasText() && !e.composedPath().includes(host)) setTimeout(offerSelection, 0);
  }, true);
  // A sent pin's card, opened by the send for its undo and not touched since, lets go on a press on the page, at once, so a
  // drag over words it covered still selects them (a4c5ddc). The click that press makes only lets it go (Leo, 19 Nov:
  // "when comment still 'undo' clicking outside opening another comment"): no new pin there; the sent one stays, and the
  // next click pins as usual. A link or the page's own control still acts (onPageClick prevents nothing).
  S.undoLetGo = 0; // when a press let a sent pin's undo card go: that press's click starts no pin
  S.letUndoGo = (e, draw = true) => {
    if (S.draft || !S.undo || S.openId !== S.undo.id || S.undo.touched || e.composedPath().includes(host)) return false;
    S.undo = null;
    S.openId = null;
    if (draw) render();
    return true;
  };
  document.addEventListener('pointerdown', (e) => {
    S.undoLetGo = 0;
    if (S.letUndoGo(e)) S.undoLetGo = Date.now();
  }, true);
  function onPageClick(e) {
    if (e.composedPath().includes(host)) return;
    if (S.undoLetGo && Date.now() - S.undoLetGo < 2000) return void (S.undoLetGo = 0); // this click let a sent pin's undo card go (above)
    if (S.draft || S.openId) {
      // Typed text doesn't keep it open (Leo, 18 Nov): the click closes it and the words stay as a draft (the box saves them as
      // they are typed, and the spot is kept, so it comes back); Escape discards them.
      S.draft = null;
      S.openId = null;
      render();
      return;
    }
    if ((!S.on && !e.altKey) || (S.cursorMode && !e.altKey) || e.button !== 0 || e.metaKey || e.ctrlKey || (e.shiftKey && !S.shiftUp)) return;
    if (S.lastTouch && Date.now() - S.lastTouch < 800) return; // phones: a tap scrolls and reads; holding pins (below)
    if (e.altKey) e.preventDefault();
    else if (e.defaultPrevented || S.ctlClick) return;
    if (e.target instanceof Element && e.target.closest(OFF)) return;
    if (String(getSelection?.() || '').trim()) return;
    showAgain();
    if (S.dKey && S.drew) return; // D held and something drawn (or cancelled): a click is part of that, not a pin
    if (S.dKey) S.drew = true; // a click with D held is a pin: letting D go then doesn't also show or hide done pins
    begin(anchorAt(e.clientX, e.clientY));
  }

  // A pin at its spot; a drawing (draw.ts) over its whole area, its lines stretched to it.
  const inkAt = (pin, zone, left, top) => {
    const svg = zone && pin.querySelector(':scope > svg');
    if (svg) Object.assign(svg.style, { width: `${zone.width}px`, height: `${zone.height}px` });
    pin.style.left = `${zone ? zone.left : left}px`;
    pin.style.top = `${zone ? zone.top : top}px`;
  };
  // ...and held there by the browser (pinhold.ts): tied to its element, so scrolling needs no script. True when it is held.
  // A card or box tied to its pin by the browser (thread.ts tieToPin): on a computer; phones keep their sheets.
  const nativeTie = () => !sheetMode.matches;
  // Held, its place is the browser's: the script writes none (it would make the next pin's reading lay the page out again);
  // a drawing still gets its size.
  // A board pin's frame box, read with the other pins' elements before any pin is written (pinhold.ts readPins).
  const frameBox = (a) => (a.frame && a.fx !== undefined ? /** @type {any} */ (window).__labBoard?.box?.(a.frame) : null) || null;
  const placePin = (pin, c, zone, left, top, moved) => {
    const a = c.anchor || {};
    let held;
    if (a.kind === 'board') {
      // A board pin on a frame: tied to the frame's box by its share of it, so the board's camera carries it (pinhold.ts).
      // Its size from the board, not the box: reading the box after the last pin was written lays the page out again, once per pin.
      const B = /** @type {any} */ (window).__labBoard;
      const box = a.frame && a.fx !== undefined ? B?.box?.(a.frame) : null;
      const size = box && (B.size?.(a.frame) || { w: box.offsetWidth, h: box.offsetHeight });
      const share = size?.w && size.h ? { x: a.fx / size.w, y: (a.fy || 0) / size.h } : null;
      held = holdPin(pin, Boolean(share), share ? box : null, left, top, share || undefined);
    } else {
      const node = moved ? null : findTarget(a);
      held = holdPin(pin, Boolean(node), node, zone ? zone.left : left, zone ? zone.top : top);
    }
    if (!held) inkAt(pin, zone, left, top);
    else if (zone) inkAt(pin, zone, zone.left, zone.top);
    onBoard(pin, a); // a board's pin the browser doesn't hold: held to the screen
    return held;
  };
  // Scrolling an inner box or the page growing only moves the pins: their places are read together, then written.
  // A full redraw happens only when something is open (a card or a composer follows its pin) or the pins changed.
  // After a scroll, the pins the browser holds are left alone.
  const movePins = (scrolled = false) => {
    // An open thread is drawn again with its pin; after a scroll, not when the browser holds the pin and its card.
    const openHeld = () => { const pin = pinsById.get(S.openId); return heldPin(pin) && !pinData.get(pin)?.zone; };
    if (!S.on || inkGone() || (S.openId && !(scrolled && openHeld()))) return render();
    newPass();
    const all = threads().filter((c) => c.anchor?.kind !== 'page');
    const skip = (c) => scrolled && heldPin(pinsById.get(c.id));
    const places = all.filter((c) => !skip(c)).map((c) => [pinsById.get(c.id), position(c.anchor || {}), c]).filter(([, at]) => !at.moved);
    readPins(places.map(([, , c]) => (c.anchor?.kind === 'board' ? frameBox(c.anchor) : findTarget(c.anchor || {}))));
    if (places.length + all.filter(skip).length !== pinsById.size || places.some(([pin]) => !pin)) return render(); // one lost or found its spot
    // A pin whose words show again (back after an edit) turns into ink again.
    if (places.some(([pin, { zone }, c]) => !zone && !pin.classList.contains('on-ink') && inkRange(c.anchor))) return render();
    for (const [pin, { left, top, clipped, covered, zone }, c] of places) {
      const held = placePin(pin, c, pin.classList.contains('ink') && zone, left, top, false);
      pin.style.visibility = (clipped && !held) || covered ? 'hidden' : '';
    }
    flushPins();
  };
  S.frame = 0;
  let reflowAll = false; // something but a scroll asked (a resize, the page's size): every pin is placed again
  const reflow = (scrolled) => {
    reflowAll ||= scrolled !== true;
    cancelAnimationFrame(S.frame);
    S.frame = requestAnimationFrame(() => {
      const scrolledOnly = !reflowAll;
      // Keep an open composer's text: only re-place when nothing is being typed.
      if (S.draft || root.activeElement || S.grabbing || isTrying()) return; // words tried in place: the pins stay put
      reflowAll = false;
      movePins(scrolledOnly);
    });
  };
  addEventListener('resize', reflow);
  // A question's card in the margin (thread.ts) that no longer fits a narrower window goes back where cards go.
  addEventListener('resize', () => {
    const card = layer.querySelector('.card.margin');
    if (card && card.getBoundingClientRect().right > document.documentElement.clientWidth - 12) requestAnimationFrame(render);
  });
  addEventListener('scroll', (e) => e.target !== document && !host.contains(/** @type {Node} */ (e.target)) && reflow(true), { capture: true, passive: true }); // the page's own scroll moves only what is held to the screen

  // Client-side navigation (pushState, back/forward, Astro view transitions): comments follow the new page,
  // and the layer comes back if the page swapped out <body>.
  const navigated = () => {
    if (!host.isConnected && document.body) document.body.append(host);
    if (!fonts.isConnected) document.head.append(fonts);
    if (!pinCursorStyle.isConnected) document.head.append(pinCursorStyle);
    S.routed?.(); // the section bar (sections.ts)
    if (pageNow() === S.page) return;
    S.page = pageNow();
    S.seen = readSeen();
    syncReads();
    S.comments = [];
    S.draft = null;
    S.openId = null;
    render();
    load();
    setTimeout(() => S.checkSections?.(), 400);
  };
  // The Navigation API says when the current entry changed (pushState, replaceState, back and forward alike), so the
  // page's own history is left as it is.
  /** @type {any} */ (window).navigation.addEventListener('currententrychange', () => queueMicrotask(navigated));
  document.addEventListener('astro:after-swap', navigated);
  // Pick up comments others left while this tab was in the background.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !S.draft && !root.activeElement) load();
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
  // It looks like your own pin: the white teardrop with your initial (a + before you've given a name). It points (bottom
  // left) where the click lands.
  // Drawn once into PNGs (1x and 2x): browsers re-decode SVG pointers when the pointer changes, which flickers (Safari
  // most); a PNG pointer stays put. The SVG one shows only for the moment before the PNGs are ready.
  const pinCursorStyle = document.createElement('style');
  // The pointer itself is drawn (an element styled with CSS that follows the mouse), not an image: so it changes
  // smoothly, and fading out where the system pointer takes over (links,
  // fields, the widget, Shift). Mice only; touch and pens keep what they had.
  const ptr = el('div', { class: 'ptr', 'aria-hidden': 'true' });
  ptr.append(el('span', { class: 'ini' }, '+'));
  root.append(ptr);
  // It shows exactly where the system pointer is hidden (cursor: none from the rules above): never two pointers, never
  // none. That's checked on every move, and again when the page scrolls under a still mouse, Shift or Option is pressed,
  // or comments are switched.
  S.mouse = null; // the last mouse position
  const place = (x, y, target) => {
    const show = Boolean(target) && target !== host && !host.contains(target) && getComputedStyle(target).cursor === 'none';
    ptr.classList.toggle('show', show);
    ptr.style.transform = `translate(${x - 1}px, ${y - 27}px)`;
  };
  const recheck = () => S.mouse && requestAnimationFrame(() => S.mouse && place(S.mouse.x, S.mouse.y, document.elementFromPoint(S.mouse.x, S.mouse.y)));
  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    document.documentElement.classList.add('lab-drawn');
    S.mouse = { x: e.clientX, y: e.clientY };
    const t = e.composedPath()[0];
    // Over the page's own controls the widget's pin pointer steps aside (the page's hand shows): a click there is theirs.
    if (t !== S.ctlTarget) {
      S.ctlTarget = t;
      sayCtl(t);
    }
    place(e.clientX, e.clientY, t instanceof Element ? t : null);
  }, { capture: true, passive: true });
  addEventListener('scroll', recheck, { capture: true, passive: true });
  addEventListener('keydown', (e) => (e.key === 'Shift' || e.key === 'Alt') && recheck(), true);
  addEventListener('keyup', (e) => (e.key === 'Shift' || e.key === 'Alt') && recheck(), true);
  document.documentElement.addEventListener('mouseleave', () => ((S.mouse = null), ptr.classList.remove('show')));
  addEventListener('blur', () => ((S.mouse = null), ptr.classList.remove('show')));
  // No pictures: where the drawn pin can't show (an open dialog or full screen draws above it, or before the mouse first
  // moves) the system pointer is a plain crosshair for comments.
  S.cursorKey = '';
  function refreshPinCursor() {
    const ch = (initial(store.get('lab-name')) || '+').replace(/[<>&'"]/g, '');
    if (ch === S.cursorKey) return; // nothing changed: leave the pointers alone
    S.cursorKey = ch;
    ptr.querySelector('.ini').textContent = ch;
    // In a cascade layer, so a page's own pointers (a clickable card) still win over ours.
    const plain = `:not(${INTERACTIVE}, a *, button *, label *, [role="button"] *, [contenteditable], [contenteditable] *, ${OFF}, ${OFF} *, [data-lab-comments])`;
    const top = `dialog, dialog *, [popover], [popover] *, :fullscreen, :fullscreen *`;
    pinCursorStyle.textContent =
      `@layer lab-pointer { html.lab-pinning:not(.lab-shift-cur, .lab-ctl) body, html.lab-pinning:not(.lab-shift-cur, .lab-ctl) body *${plain} { cursor: crosshair; } ` +
      // With the drawn pointer the system one hides over plain parts of the page (not in the top layer, which is above it).
      `html.lab-drawn.lab-pinning:not(.lab-shift-cur, .lab-ctl):not(.lab-dragging) body, html.lab-drawn.lab-pinning:not(.lab-shift-cur, .lab-ctl):not(.lab-dragging) body *${plain}:not(${top}) { cursor: none; } ` +
      // Holding Shift (drag to quote words): the drawn I-beam with a low ink band at its foot (C3, Leo 18 Nov; text where a cursor image isn't drawn) over the page's content, back to the pin when it's let go.
      `html.lab-pinning.lab-shift-cur:not(.lab-dragging) body *${plain}:not(img, svg, video, canvas) { cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24'%3E%3Crect x='5' y='15.5' width='14' height='5' rx='1.5' fill='%23f0b70a' fill-opacity='.6'/%3E%3Cpath d='M9 4h6M12 4v16M9 20h6' stroke='white' stroke-width='4' stroke-linecap='round' fill='none'/%3E%3Cpath d='M9 4h6M12 4v16M9 20h6' stroke='%23141414' stroke-width='1.5' stroke-linecap='round' fill='none'/%3E%3C/svg%3E") 12 12, text; } ` +
      // The pointer is inherited, so places that aren't commented on name theirs: editable text a text cursor, a part
      // marked data-uncommentable the plain arrow (a pin pointer there would promise a comment that won't come).
      `html.lab-pinning body :is([contenteditable], [contenteditable] *) { cursor: text; } html.lab-pinning body :is(${OFF}, ${OFF} *) { cursor: auto; } }` +
      // Holding Option (Alt) pins links and controls too: the drawn pin shows over them (the system pointer hides).
      // The same with "pin over controls" on, without the key (lab-over; not while Shift selects words).
      `html:is(.lab-alt, .lab-over:not(.lab-shift)) body, html:is(.lab-alt, .lab-over:not(.lab-shift)) body *:not([data-lab-comments], [data-lab-comments] *, ${OFF}, ${OFF} *) { cursor: crosshair !important; }` +
      `html.lab-drawn:is(.lab-alt, .lab-over:not(.lab-shift)) body, html.lab-drawn:is(.lab-alt, .lab-over:not(.lab-shift)) body *:not([data-lab-comments], [data-lab-comments] *, ${OFF}, ${OFF} *, ${top}) { cursor: none !important; }`;
  }
  // Computers, comments on: a click or drag doesn't select the page's text; hold Shift to select (and quote) words.
  // Fields and editable text stay selectable. With ink on words (lab-ink-on, wordink.ts) the text stays selectable and only
  // selectstart (below) keeps a drag from selecting: Safari paints a highlight over whole blocks of text that can't be
  // selected, and the ink is a highlight.
  fonts.textContent += `@media (pointer: fine) { html.lab-pinning:not(.lab-shift, .lab-lit, .lab-ink-on) body > :not([data-lab-comments]), html.lab-pinning:not(.lab-shift, .lab-lit, .lab-ink-on) body > :not([data-lab-comments]) :not(input, textarea, select, [contenteditable], [contenteditable] *) { -webkit-user-select: none; user-select: none; } }`;
  // Letting go of Shift keeps text selectable a moment longer, so a selection made with it isn't dropped before its
  // comment opens.
  /** @type {any} */
  S.shiftOff = 0;
  // The Shift cursor (lab-shift-cur) follows the key exactly, with no such wait: let go of Shift and the pin pointer is back
  // at once (Leo, 18 Nov). Browsers repaint a still pointer's cursor only when the page under it changes, so the element
  // under it gets a same-frame style flip.
  const shiftCur = (on) => {
    const de = document.documentElement;
    if (de.classList.contains('lab-shift-cur') === on) return;
    de.classList.toggle('lab-shift-cur', on);
    const t = S.mouse && document.elementFromPoint(S.mouse.x, S.mouse.y);
    if (t instanceof HTMLElement) {
      const was = t.style.cursor;
      t.style.cursor = 'default';
      void t.offsetWidth;
      t.style.cursor = was;
    }
    recheck();
  };
  // Shift's own key events are the truth for "is Shift held": right after a Shift keyup, Linux WebKit can still send the
  // next press with shiftKey set, which kept text selectable for a plain click (a CI-only flake). Shift pressed in
  // another window (no keydown seen here) still counts, as shiftUp stays false.
  S.shiftUp = false;
  const shiftKey = (e) => {
    if (e.key === 'Shift') S.shiftUp = e.type === 'keyup';
    clearTimeout(S.shiftOff);
    shiftCur(e.shiftKey);
    if (e.shiftKey) document.documentElement.classList.add('lab-shift');
    else S.shiftOff = setTimeout(() => (document.documentElement.classList.remove('lab-shift'), recheck()), 400);
  };
  addEventListener('keydown', shiftKey, true);
  addEventListener('keyup', shiftKey, true);
  addEventListener('pointermove', (e) => shiftCur(e.shiftKey && !S.shiftUp), { capture: true, passive: true }); // Shift pressed or let go while another window had focus
  document.addEventListener('visibilitychange', () => shiftCur(false));
  // A press without Shift is never a selection: drop the Shift state at once, not 400 ms later (a click right after typing
  // a capital letter, or after a screenshot shortcut, used to select the page's text).
  addEventListener('pointerdown', (e) => {
    // A Shift press on the page starts new words: the caret a box of the widget leaves (at the widget, the page's end)
    // stretched the selection from there instead, and the next quote after a comment came to nothing.
    if (e.shiftKey && !S.shiftUp) return S.on && !typing(e) && getSelection()?.removeAllRanges(), shiftKey(e);
    clearTimeout(S.shiftOff);
    document.documentElement.classList.remove('lab-shift');
    shiftCur(false);
  }, true);
  addEventListener('blur', () => ((S.shiftUp = false), document.documentElement.classList.remove('lab-shift'), shiftCur(false)));
  // The same, for engines that start a selection before restyling after the press (Linux WebKit kept one now and then):
  // in comment mode, a selection on the page starts only with Shift; fields and the widget select as always.
  addEventListener('selectstart', (e) => {
    const de = document.documentElement;
    const t = /** @type {Element | null} */ (e.target instanceof Element ? e.target : /** @type {Node} */ (e.target)?.parentElement ?? null);
    if (de.classList.contains('lab-pinning') && !de.classList.contains('lab-shift') && !t?.closest('input, textarea, select, [contenteditable], [data-lab-comments]')) e.preventDefault();
  }, true);
  fonts.textContent += 'html.lab-dragging, html.lab-dragging * { user-select: none !important; -webkit-user-select: none !important; cursor: crosshair !important; }';
  // While a sheet is open, a swipe down is the sheet's, not the browser's pull-to-refresh.
  fonts.textContent += 'html.lab-sheet, html.lab-sheet body { overscroll-behavior-y: none; }';
  // Over inked words (a click opens their comment, wordink.ts) the page shows a hand.
  fonts.textContent += 'html.lab-ink-over body, html.lab-ink-over body * { cursor: pointer !important; }';
  // The agent's ring draws its arc in (lab C2): an arc length that can animate has to be registered on the page itself.
  fonts.textContent += '@property --lab-arc { syntax: "<percentage>"; inherits: false; initial-value: 66%; }';
  // The room a phone's sheet made below the page's end (see goTo) stays after the sheet closes, so the page doesn't jump
  // up at the end of the slide; it shrinks away as you scroll back up.
  fonts.textContent += "html.lab-room body::after { content: ''; display: block; height: var(--lab-room, 0px); }";
  addEventListener('scroll', () => {
    const de = document.documentElement;
    const had = parseFloat(de.style.getPropertyValue('--lab-room')) || 0;
    if (!had || host.hasAttribute('data-sheet')) return;
    const room = Math.max(0, Math.ceil(scrollY + innerHeight - (de.scrollHeight - had)));
    if (room >= had) return;
    de.style.setProperty('--lab-room', `${room}px`);
    if (!room) de.classList.remove('lab-room');
  }, { passive: true });
  // Phones: and the page behind stays put, even when the part of the sheet you drag on has nothing to scroll.
  fonts.textContent += '@media (pointer: coarse) { html.lab-sheet, html.lab-sheet body { overflow: hidden; } }';
  // Holding a finger on a link pins it (see Phones above): no link preview while comments are on.
  fonts.textContent += `html.lab-pinning body, html.lab-pinning body * { -webkit-touch-callout: none; }`;
  // Phones: with comments on, a hold is labit's (a pin), not the start of a text selection: iOS would cancel the touch
  // for its selection, and the lift that lets the box open the keyboard would never come. Only while a finger is down
  // (lab-press): Safari paints the quoted words' green (::highlight) over whole blocks of text that can't be selected,
  // so with the page unselectable all the time an open comment tinted half the page (iOS 27 simulator, 17 Nov).
  // Nor the start of a drag: iOS lifts a held link or image to drag it, which cancels the touch the same way.
  fonts.textContent += `@media (pointer: coarse) { html.lab-pinning.lab-press body > :not([data-lab-comments]) { -webkit-user-select: none; user-select: none; } html.lab-pinning body > :not([data-lab-comments]), html.lab-pinning body > :not([data-lab-comments]) * { -webkit-user-drag: none; } }`;
  const setAlt = (down) => document.documentElement.classList.toggle('lab-alt', Boolean(down));
  addEventListener('keydown', (e) => e.key === 'Alt' && setAlt(true), true);
  addEventListener('keyup', (e) => e.key === 'Alt' && setAlt(false), true);
  addEventListener('pointermove', (e) => setAlt(e.altKey), { capture: true, passive: true }); // Option pressed while another window had focus
  addEventListener('blur', () => setAlt(false));

  const start = () => {
    document.head.append(fonts, pinCursorStyle);
    refreshPinCursor();
    if (S.on) showHint();
    document.body.append(host);
    // The page's own selection while commenting (ink on words off), and the quoted words of an open text comment.
    // A soft green, so the quoted words stay readable in the page's own colour, on light and dark pages.
    const paint = 'background-color: rgba(52, 199, 89, .3); color: inherit;';
    fonts.textContent += `html.lab-pinning ::selection { ${paint} } ::highlight(lab-quote) { ${paint} }`;
    fonts.textContent += inkCss(); // ink on words: the bands, and the selection drawn as sent ink (wordink.ts)
    bindActions(W); // data-lab-action buttons leave a pin the agent acts on
    load();
    startSections(); // the section bar: what is new or updated on the page since you read it
    for (const name of flagNames) if (flag(name)) startFlag(name); // (lib/flags.ts)
    scanForFramework();
    if (!S.components) {
      addEventListener('load', scanForFramework, { once: true });
      addEventListener('pointerover', overFramework, { capture: true, passive: true });
    }
  };
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
  // A board page (src/board/): a tap in comment mode puts a pin on the board (anchoring.ts asks the board where a point is
  // and where a pin sits), and the pins move with the camera.
  // A board in this page (src/board/overlay.ts, loaded when one is opened): its link, the address's #board=<name> (a
  // reload, a forward) or a board pin picked in the list opens it. Closing it lets go of a board pin that was open.
  /** @param {string} name @param {string} [of] @param {boolean} [push] */
  const showBoard = (name, of = '', push = true) =>
    part('boardview').then((m) => m.show(name, { page: S.page, of, push, onClose: () => {
      const open = S.comments.find((c) => c.id === S.openId);
      if (open?.anchor?.kind === 'board') S.openId = null;
      if (S.draft?.anchor?.kind === 'board') S.draft = null;
      render();
    } }), () => say("the board couldn't load"));
  if (!S.board && self === top) {
    Object.assign(window, { __labBoardView: { show: showBoard } });
    const bn = /^#board=([a-z0-9][a-z0-9_-]*)/i.exec(location.hash)?.[1];
    if (bn) showBoard(bn, '', false);
  }
  // A tap on the board outside an open comment or the chat closes it, as a click outside one does on a page (onPageClick,
  // and the chat's own press above); the board's surface eats its presses, so it asks here (Leo, 19 Nov). True when
  // something closed: that tap only closes, a sent pin's undo card too (as on a page: the sent pin stays, no new one).
  const dismiss = () => {
    const chat = S.chatOpen && !coarse; // phones close the chat by its handle or the dimmed page
    if (!S.draft && !S.openId && !chat) return false;
    if (S.undo && S.openId === S.undo.id) S.undo = null;
    S.draft = null;
    S.openId = null;
    if (chat) S.chatOpen = false;
    render();
    return true;
  };
  // The board's camera moved (a pinch, a pan) and nothing else: its pins go with it in the same frame, placed by the
  // board's own sums (no read of the page, no redraw of the widget: that took 70 ms a frame on a page with many pins,
  // and ran a frame late, so the pins swam behind the frames; Leo, 19 Nov: "zoom feels weird, slow"). An open card or a
  // new comment's box on the board moves by as much as its pin, as it is (what is typed in it stays). Pins the browser
  // holds move by themselves. False when it can't (a pin being dragged): the caller draws everything again.
  const followCamera = () => {
    if (S.grabbing) return false;
    const by = (/** @type {HTMLElement | null | undefined} */ n, /** @type {number} */ dx, /** @type {number} */ dy) => {
      if (!n?.style.left || !(dx || dy)) return;
      n.style.left = `${parseFloat(n.style.left) + dx}px`;
      n.style.top = `${parseFloat(n.style.top) + dy}px`;
    };
    // Every spot is read first, then every pin written: a spot reads the page's scroll, and reading it after a pin was
    // moved lays the page out again, once per pin (600 pins in a half view: a long task on every frame of a pan).
    const moves = [];
    for (const [id, pin] of pinsById) {
      const a = pinData.get(pin)?.c.anchor;
      if (a?.kind === 'board' && !heldPin(pin)) moves.push([id, pin, position(a)]);
    }
    const [sx, sy] = [scrollX, scrollY];
    for (const [id, pin, at] of moves) {
      const [x, y] = [at.left - sx, at.top - sy]; // held to the screen (onBoard)
      if (S.openId === id && S.openCard?.isConnected) by(S.openCard, x - parseFloat(pin.style.left), y - parseFloat(pin.style.top));
      pin.style.left = `${x}px`;
      pin.style.top = `${y}px`;
      pin.style.visibility = at.clipped && S.openId !== id ? 'hidden' : '';
    }
    if (S.draft?.anchor?.kind === 'board') {
      const pin = /** @type {HTMLElement | null} */ (layer.querySelector('.pin.draft'));
      if (pin) {
        const at = position(S.draft.anchor);
        const [dx, dy] = [at.left - scrollX - parseFloat(pin.style.left), at.top - scrollY - parseFloat(pin.style.top)];
        by(pin, dx, dy);
        by(/** @type {HTMLElement | null} */ (layer.querySelector('.float:not(.out)')), dx, dy);
      }
    }
    return true;
  };
  // The page's own pins under a board's view hide (position, anchoring.ts): as the page scrolls under a half view, or
  // the view is dragged taller, only those that cross its edge are looked at again; nothing else is read or drawn.
  const coverPins = () => {
    for (const [id, pin] of pinsById) {
      const info = pinData.get(pin);
      if (!info || info.c.anchor?.kind === 'board') continue;
      // A pin the browser holds has no place in its style: its spot is read (only in a half view, as it scrolls).
      const at = heldPin(pin) ? position(info.c.anchor || {}) : { left: parseFloat(pin.style.left), top: parseFloat(pin.style.top) };
      const covered = coveredAt(at.left - scrollX, at.top - scrollY);
      if (covered === Boolean(info.covered)) continue;
      info.covered = covered;
      pin.style.visibility = (covered || position(info.c.anchor || {}).clipped) && S.openId !== id ? 'hidden' : '';
    }
  };
  Object.assign(window, { __labBoardWidget: { pinning: () => S.on && !S.cursorMode, holding: () => S.on /* a phone's hold comments in either mode, as on a page */, hold: (/** @type {number} */ x, /** @type {number} */ y) => { if (S.cursorMode) setCursor(false); if (S.draft || S.openId) closeOrNudge(); else begin(anchorAt(x, y)); }, place: (/** @type {number} */ x, /** @type {number} */ y) => (S.draft || S.openId ? closeOrNudge() : begin(anchorAt(x, y))), dismiss } });
  addEventListener('lab-board-moved', (e) => {
    const d = /** @type {CustomEvent} */ (e).detail;
    if (!S.on) return;
    // The camera alone, or the page scrolling under a half view (its own pins scroll with it, the board's are held
    // to the screen): no redraw. With the view's box changing too, the page's pins it covers are hidden or shown.
    if (d?.camera && followCamera()) return void (d.box && coverPins());
    if (d?.scroll && !S.grabbing) return coverPins();
    S.moveFrame ||= requestAnimationFrame(() => ((S.moveFrame = 0), render()));
  });
  startLive();
  // ⌘K / Control-K from anywhere but a field of the page's own (where it may mean "add a link"): the first press loads
  // labs & pages and opens it once it is there.
  if (LABS) document.addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || (e.key || '').toLowerCase() !== 'k') return;
    const typing = e.composedPath().some((n) => n instanceof HTMLElement && (n.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(n.tagName)) && n.getRootNode() !== root);
    if (typing) return;
    e.preventDefault();
    void switcher().then((m) => m && (m.switcherSheet() ? m.closeSwitcher() : m.openSwitcher()));
  });
})();
