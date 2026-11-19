/*!
 * lab comments: click anywhere on a lab page to pin a comment. No login, just a name.
 * https://github.com/leonidstern/labit · PolyForm Small Business 1.0.0
 * The lab (local.mjs) puts this script on every page it serves. When comments are on, click anywhere that isn't a
 * link or control to pin one (alt/option-click pins on those too); esc or a click outside closes an open comment.
 * Dragging (mouse/pen) marks an area instead of a point. data-admin (this computer's browser) may resolve, move and delete.
 */
import styles from './widget/styles.css';
import {
  bindAnchoring,
  anchorAt,
  drawZone,
  foundAt,
  goToBlock,
  inPage,
  ease,
  markQuote,
  ms,
  nameLine,
  pageEnd,
  position,
  quoteRects,
  rectsOf,
  readable,
  short,
  zoneAnchor,
  zoneEl,
} from './widget/anchoring.ts';
import { anyWriting, bindComposer, composer } from './widget/composer.ts';
import { bindMessages, onWhat, stampOf } from './widget/messages.ts';
import { backFromReveal, bindSheets, backCloses, fromTap, holdKeyboard, leave, letGo, revealDraft, slideAway, startSheets, swipeDown } from './widget/sheets.ts';
import { bindList, drawList, goTo, lineOf, lineUp, ord, paintLines, stepMoved, stepNew, workState } from './widget/list.ts';
import { bindChat, drawChat, stamped } from './widget/chat.ts';
import { bindThread, grab, openAsk, placeBeside, placeCard, threadCard } from './widget/thread.ts';
import { bindLive, startLive } from './widget/live.ts';
import { inFrame, startFrame } from './widget/frame.ts';
import { bindChanges, startChanges } from './widget/changes.ts';
import { holdWhileOpen } from './widget/hold.ts';
import { bindSwitcher, closeSwitcher, openSwitcher, preloadSwitcher, switcherSheet } from './widget/switcher.ts';
import { acts, actButton, actName, bindFluid, fluidBar, fluidDrop, fluidFixed, fluidFollow, fluidHas, fluidKey, fluidOpen, fluidSheet, fluidState, fluidSync } from './widget/fluid.ts';

(() => {
  // The widget's state, in one place, so its parts can live in their own files (src/widget/*) and share it.
  /** @type {any} */
  const S = { dbg: null }; // dbg: ?kbdebug's line into the phone's log (sheet drags)
  // What the parts in src/widget/ use from here, read when they use it (getters: nothing is read before it exists).
  const W = {
    paintWho: /** @type {(() => void) | null} */ (null), // set by live.ts: the pill's words, painted again as the agent's work moves on
    get $() { return $; },
    get OFF() { return OFF; },
    get S() { return S; },
    get agentOf() { return agentOf; },
    get ago() { return ago; },
    get anchorAt() { return anchorAt; },
    get bar() { return bar; },
    get chatBtn() { return chatBtn; },
    get chatEl() { return chatEl; },
    get closeOrNudge() { return closeOrNudge; },
    get coarse() { return coarse; },
    get composer() { return composer; },
    get contentEnd() { return contentEnd; },
    get doneBtn() { return doneBtn; },
    get movedBtn() { return movedBtn; },
    get drawList() { return drawList; },
    get el() { return el; },
    get fonts() { return fonts; },
    get goBtn() { return goBtn; },
    get goFace() { return goFace; },
    get goTo() { return goTo; },
    get host() { return host; },
    get isDone() { return isDone; },
    get isNew() { return isNew; },
    get isPage() { return isPage; },
    get keyWord() { return keyWord; },
    get KEYS() { return KEYS; },
    get keyLabel() { return keyLabel; },
    get layer() { return layer; },
    get listBtn() { return listBtn; },
    get load() { return load; },
    get loadChanges() { return loadChanges; },
    get ease() { return ease; },
    get markSeen() { return markSeen; },
    get ms() { return ms; },
    get mine() { return mine; },
    get nameLine() { return nameLine; },
    get actions() { return ACTIONS.words; },
    get newNext() { return newNext; },
    get newPrev() { return newPrev; },
    get numberOf() { return numberOf; },
    get onWhat() { return onWhat; },
    get openSheet() { return openSheet; },
    get patchKids() { return patchKids; },
    get pinCursorStyle() { return pinCursorStyle; },
    get placeBar() { return placeBar; },
    get position() { return position; },
    get readable() { return readable; },
    get reflow() { return reflow; },
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
    get tabTitle() { return tabTitle; },
    get threads() { return threads; },
    get unread() { return unread; },
    get vv() { return vv; },
  };
  bindLive(W);
  bindChanges(W);
  bindList(W);
  bindChat(W);
  bindThread(W);
  bindSheets(W);
  bindFluid(W);
  const script = /** @type {HTMLScriptElement | null} */ (document.currentScript);
  // In a board's frame the widget draws nothing and binds nothing (src/widget/frame.ts).
  if (inFrame()) return startFrame(script);
  // Shortcuts, action → key: these defaults, with what a project or you changed (labit.json or your settings.json
  // `shortcuts`, passed by the lab as data-keys; docs/settings.md).
  const KEYS = { toggle: 'm', comment: '1', chat: 'c', next: 'w', pause: 'p', done: 'd', reply: 'r', resolve: 'e', added: 'a' };
  try {
    Object.assign(KEYS, JSON.parse(script?.dataset.keys || '{}'));
  } catch {}
  // The actions on selected words, beside the comment itself (labit.json or your settings.json `actions`, passed as
  // data-actions; docs/settings.md): the built-in rewrite, cut, go, remove and fix, and your own { label, send }. `words`
  // is the selected words' dialog, `spot` the regular dialog on a spot or an area.
  const ACTIONS = { words: ['rewrite', 'cut', 'go'], spot: ['go', 'remove', 'fix'] };
  try {
    Object.assign(ACTIONS, JSON.parse(script?.dataset.actions || '{}'));
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
  // What this lab is trying (lib/flags.ts): flag -> on. Set in labit.json's `flags`, never from the page.
  const FLAGS = (() => { try { return JSON.parse(script?.dataset.flags || '{}'); } catch { return {}; } })();
  const flag = (name) => FLAGS[name]?.on === true;
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
  // A board page (src/board/): pins on a board come later, so comments stay off here and its clicks are the board's.
  S.board = /^\/_board\/[^/]+$/.test(S.page);
  if (S.board) S.on = false;
  S.openId = null;
  S.closeFast = false; // the next redraw that closes a comment fades it out quickly instead of sliding it
  S.cardFull = false; // a comment pulled up to full height (the card is drawn anew on each redraw)
  S.draft = null; // { anchor, docX, docY }
  // An unsent comment is kept whole — the words (composer.ts) and the spot they were pinned to — so a page that
  // reloads under you, a dev server rebuilding it most of all, gives both back instead of eating them.
  const spotKey = () => `lab-spot:${S.page}`;
  // Kept with it: whether it is on selected words (the dialog, not the plain box) and the action picked. An older
  // spot, the bare anchor, comes back as a plain box.
  const keepSpot = (anchor, d) => store.set(spotKey(), anchor ? JSON.stringify({ anchor, fluid: d?.fluid || undefined }) : '');
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
    <div class="ui"><div class="hint" role="status" hidden>click to comment · drag to mark an area · shift-drag to quote words · ${KEYS.chat} chat · ${KEYS.next} new${flag('sinceLooked') ? ` · ${KEYS.added} added` : ''} · ${KEYS.comment} comment / pointer · ${KEYS.toggle} hide</div>
    <div class="list chatwin" hidden><div class="tabs"><b>chat</b></div><div class="msgs"></div><div class="replying" hidden></div><div class="chat"></div></div>
    <div class="left"><button class="secondary copy-all" type="button" hidden>copy link</button></div>
    <div class="bar">
      <button class="secondary chat-btn" type="button" hidden title="chat (C)">chat</button>
      <button class="secondary new-prev" type="button" hidden aria-label="previous new comment">‹</button>
      <button class="secondary list-btn" type="button" hidden>list</button>
      <button class="secondary new-next" type="button" hidden aria-label="next new comment">›</button>
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
  if (matchMedia('(pointer: coarse)').matches) hint.textContent = 'hold to comment';
  const toggleBtn = $('.toggle');
  const bar = /** @type {HTMLElement} */ (root.querySelector('.bar'));
  const moreBtn = $('.more');
  const moreMenu = $('.more-menu');
  const copyBtn = $('.copy-all');
  // The bar's "new" pill: J/K step through the new comments, R replies, E resolves.
  const listBtn = /** @type {HTMLButtonElement} */ ($('.list-btn'));
  const goBtn = $('.go-btn');
  const newPrev = $('.new-prev');
  const doneBtn = /** @type {HTMLButtonElement} */ ($('.done-btn'));
  const motions = $('.motions');
  const movedBtn = /** @type {HTMLButtonElement} */ ($('.moved-btn'));
  const overBtn = $('.over-btn');
  if (S.board) toggleBtn.style.display = overBtn.style.display = 'none'; // no pins on a board yet
  const tabTitle = { base: '' };
  // Done pins show unless hidden (Leo, 17 Nov): closed ones are faded on the page, and D hides them.
  S.showDone = store.get('lab-hide-done') !== '1';
  const toggleDone = () => {
    S.showDone = !S.showDone;
    store.set('lab-hide-done', S.showDone ? '' : '1');
    render();
  };
  const newNext = $('.new-next');
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
  // The message box and a message's small pieces (src/widget/composer.ts, messages.ts). Arrows, so helpers defined
  // further down are read when called.
  bindComposer({ el, store, root, ms, ease, refreshPinCursor: () => refreshPinCursor(), syncReads: () => syncReads(), rememberMe, whileWriting: () => setPinning() });
  bindMessages({ el, mine: (c) => mine(c), repliesOf: (id) => repliesOf(id), lineUp, ord });

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
      if (S.openCard?.isConnected) S.openCard.sync();
      if (S.chatOpen) drawChat();
      drawList(); // the bar's counts and the tab's "(3)" keep up even while a box has the cursor (a tab left in the background)
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
  S.cursorMode = store.get('lab-cursor') === '1';
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
    store.set('lab-cursor', v ? '1' : '');
    goBtn.classList.toggle('cursor', v);
    goFace();
    setPinning();
  };
  // fluid: words that were selected; their box is the one element that grew out of the bar (fluid.ts). act: the bar's
  // button that was pressed (rewrite, cut, go: run once the dialog's row is there).
  function begin(anchor, fluid = false, act = '') {
    S.draft = { anchor, fluid, act };
    keepSpot(anchor, S.draft);
    render();
  }
  // Sent once the lab answers: while it can't be reached (restarting, the laptop just woke), the message waits and is
  // tried again every 2 s for up to 5 minutes, instead of failing. Only a lab that answers with an error fails it.
  async function send(payload) {
    let res = null;
    // A new comment or reply carries a nonce, so a retry after a lost answer can't save it twice.
    if (S.paused && payload.anchor && !payload.action) payload = { ...payload, anchor: { ...payload.anchor, paused: true } }; // paused when written: the agent is told
    if (!payload.action && !payload.nonce) payload = { ...payload, nonce: Math.random().toString(36).slice(2) + Date.now().toString(36) };
    for (let tries = 0; !res; tries++) {
      try {
        res = await fetch(API, { method: 'POST', headers: headers(), body: JSON.stringify({ page: S.page, ...payload }) });
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
    hint.hidden = false;
    clearTimeout(said.t);
    said.t = setTimeout(() => {
      hint.hidden = true;
      hint.textContent = said.was;
      said.was = undefined;
    }, 1800);
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
  const threads = () => S.comments.filter((c) => !c.parent);
  const isPage = (c) => c.anchor?.kind === 'page'; // about the page as a whole: no pin; it lives in the chat
  // prev / next / J / K: the thread swaps in place, no slide; the keyboard stays as it was (up stays up, down stays down).
  S.stepping = false;
  S.keepKeys = false;
  // Done: resolved, or answered "Done: …" by someone other than its author (the agent).
  // Done means the same everywhere (the list, the pins, show done): what workState says.
  const isDone = (c) => c.resolved || workState(c)[0] === 'done';
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
  // Labs & pages (⌘K, src/widget/switcher.ts): local labs only. The menu opens with which lab this is, then the item.
  const LABS = script?.dataset.live ? script.dataset.live.replace(/live$/, 'labs') : '';
  const labHead = LABS ? el('div', { class: 'lab-head' }, `${script?.dataset.labName || 'lab'} · ${location.port || '80'}`) : null;
  const labsBtn = LABS ? el('button', { type: 'button', class: 'labs-btn' }) : null;
  if (labsBtn) {
    labsBtn.append('labs & pages', el('kbd', { 'aria-hidden': 'true' }, navigator.platform.startsWith('Mac') ? '⌘K' : 'ctrl K'));
    // The menu closes without taking the focus back to ⋯ (its own click handler would, after the box opened, and on a
    // phone that blurred the search and bounced the keyboard).
    labsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      setMenu(false);
      openSwitcher();
    });
  }
  function placeBar() {
    const inMenu = S.on ? [...(labHead ? [labHead, labsBtn] : []), doneBtn, movedBtn, overBtn, copyBtn, toggleBtn, ...(versionLine ? [versionLine] : [])] : [];
    // In this order every time: a part that came back (hide comments, after showing them again) went to the end, below
    // the version line.
    if (inMenu.some((b, i) => moreMenu.children[i] !== b)) moreMenu.append(...inMenu);
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
  const ago = (iso) => {
    const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    return m < 1 ? 'just now' : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
  };
  S.replyTo = null;
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
    svg.innerHTML =
      '<g transform="translate(-1 -.5)" fill="currentColor">' +
      '<path d="M18.9 24.67L24.4 3h11.5L31.28 21.2A22.8 22.8 0 0 0 18.9 24.67Z"/>' +
      '<path d="M37.07 22.02L41.9 3h11.5L47.1 27.85A22.8 22.8 0 0 0 37.07 22.02Z"/>' +
      '<path d="M31 26a18 18 0 0 1 18 18 18 18 0 0 1-18 18H15.57a2.57 2.57 0 0 1-2.57-2.57V44A18 18 0 0 1 31 26Z"/>' +
      '<circle cx="31" cy="45" r="6.2" fill="var(--_bg)"/></g>';
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
  const pinData = new WeakMap();
  function render() {
    const dragged = S.grabbing;
    S.line = null; // where each thread stands with the agent is worked out again (list.ts lineUp)
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
    // Stepping a question's rows with the keys when it is drawn again (a reply or a pick came in): the keys keep working.
    const prevRows = Boolean(prev && root.activeElement?.closest?.('.choices') && prev.contains(root.activeElement));
    // Every pin's place is read before anything is written, so the page lays out once per render, not once per pin.
    const places = new Map(S.on ? threads().filter((c) => c.anchor?.kind !== 'page').map((c) => [c.id, position(c.anchor || {})]) : []);
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
    const done = () => {
      patchKids(layer, next); // pins still in place stay; the new ones go in, the gone ones come out
      if (S.closeFast && !now && prev) {
        S.closeFast = false;
        prev.inert = true;
        layer.append(prev);
        const gone = () => prev.remove();
        if (still.matches || !prev.animate) gone();
        else prev.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms('quick'), easing: ease('out'), fill: 'forwards' }).finished.then(gone, gone);
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
      fluidSync(S.draft || S.openId, S.on); // here, so hiding comments (which draws nothing more) lets the bar go too; so does a thread opening
      markQuote(quoted);
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
    drawChat();
    if (!S.on) return done();
    list.forEach((c) => {
      if (isPage(c)) return; // in the chat, not on the page
      // Done pins with nothing new in them step aside when done ones are hidden (D); an open one stays.
      if (!S.showDone && S.openId !== c.id && (c.resolved || workState(c)[0] === 'done') && !unread(c).length) return;
      const { left, top, moved, zone } = places.get(c.id) || position(c.anchor || {});
      // A pin whose spot is gone is off the page: the ⋯ menu lists them ("moved · N"); an open one shows, to drop on a
      // new spot (drag) or close. The agent finishing one closes it.
      if (moved) {
        if (!c.resolved && !autoShut.has(c.id) && workState(c)[0] === 'done' && mayResolve(c)) {
          autoShut.add(c.id);
          send({ action: 'resolve', id: c.id, edit: store.get(`lab-edit:${c.id}`) || undefined }).then(({ comment }) => (Object.assign(c, comment), render()), () => {});
        }
        if (S.openId !== c.id) return;
      }
      if (S.openId === c.id) add(drawZone(zone, `saved${anim}`)); // a drawn area shows its outline while open
      const news = unread(c);
      const movable = !zone && (S.isAdmin || store.get(`lab-edit:${c.id}`));
      const sg = lineUp().get(c.id) || { s: null, n: 0, at: '', line: '' }; // where it stands with the agent: sent, got (picked up), now (working), wait, stale, asks or done
      const state = sg.s;
      const tip = coarse || (state !== 'now' && state !== 'stale') ? '' : lineOf(sg); // hovering a working ring says what it is doing
      const born = !old.has(c.id);
      const pin = old.get(c.id) || el('button', { type: 'button' });
      const info = pinData.get(pin) || {};
      pinData.set(pin, Object.assign(info, { c, zone, hot: info.hot }));
      // Its state as classes and words (the ring, the tick and the new dot are only seen). Set one by one: the
      // classes that carry an animation (.in, .swap) are left as they are, so nothing starts again.
      for (const [cls, on] of Object.entries({
        resolved: c.resolved, done: state === 'done', new: news.length, moved,
        grab: movable, open: S.openId === c.id, dragging: false,
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
      pin.style.left = `${left}px`;
      pin.style.top = `${top}px`;
      if (born) {
        // Bound once; they read what the pin shows now (pinData), not what it showed when it was made.
        grab(pin, () => pinData.get(pin).c);
        // Hovering a pin shows what it's on, as an open one does: a drawn area its outline, selected words their highlight.
        pin.addEventListener('pointerenter', () => {
          const d = pinData.get(pin);
          d.hot = true;
          if (coarse || S.openId === d.c.id) return;
          if (d.zone) d.shown = drawZone(d.zone, 'saved');
          else if (d.c.anchor?.quote) markQuote(d.c.anchor);
        });
        pin.addEventListener('pointerleave', () => {
          const d = pinData.get(pin);
          d.hot = false;
          d.shown?.remove();
          d.shown = null;
          if (!d.zone && d.c.anchor?.quote) markQuote(S.quoted);
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
        if (zone) info.shown = add(drawZone(zone, 'saved'));
        else if (c.anchor?.quote && !quoted) quoted = c.anchor;
      }
      next.push(pin);
      pinsById.set(c.id, pin);
      if (S.openId === c.id) {
        // Area comments open below the area, so the card doesn't hide what it is about.
        // Opened by a click: the reply box takes focus (not on touch screens, where it would pop the keyboard).
        // The reply box takes the cursor on a computer. Phones don't (no keyboard popping up over what you came to read,
        // Leo 15 Nov); a keyboard already up while stepping to the next one stays up.
        const card = threadCard(c, new Set(news.map((x) => x.id)), appear && (coarse ? S.keepKeys : !S.stepping || S.keepKeys));
        S.openCard = card;
        if (appear && !S.stepping) card.classList.add('in');
        if (prevHeight) card.style.minHeight = `min(${prevHeight}px, var(--_sheet-max))`;
        S.stepping = S.keepKeys = false;
        next.push(card);
        placeCard(card, zone ? left + 14 : left, zone ? zone.top + zone.height : top);
        if (!appear && prevRows) {
          const rows = card.querySelector('.choices[role="listbox"]');
          /** @type {HTMLElement | null} */ (rows?.querySelector('.choice.on') || rows?.querySelector('.choice') || rows)?.focus({ preventScroll: true });
        }
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
        }
        if (coarse && S.cardFull) card.classList.add('full'); // stays pulled up while you step from comment to comment
        swipeDown(card, () => ((S.openId = null), (S.cardFull = false), render()), true);
        markSeen(news);
        if (news.length) drawList(); // opened is read: the "N new" pill and the tab title count it off at once
        quoted = zone ? null : c.anchor; // an area's outline says what it's on; only selected words get the highlight
      }
    });

    // Selected words (fluid.ts): on a computer the box is the one element the bar is, drawn once per draft
    // so a redraw leaves it and its words alone, with no draft pin (the dialog sits at the words; the pin pops in as it
    // goes out). Phones: the usual sheet, which the bar grows into, with no keyboard until the box is tapped.
    const rects = S.draft?.fluid && !sheetMode.matches && quoteRects(S.draft.anchor);
    const fluid = Boolean(rects?.length); // words not found: the plain box
    if (S.draft && fluidHas(S.draft)) {
      quoted = S.draft.anchor; // the words stay lit while it is open
      if (rects) fluidFollow(rects); // and it stays with them (a saved file moved them); gone, it stays, cut and rewrite off
    } else if (S.draft) {
      const draft = S.draft;
      const { anchor } = draft;
      const { left, top, zone } = position(anchor);
      add(drawZone(zone, 'draft'));
      quoted = zone ? null : anchor; // an area lights no single word
      if (!fluid) {
        const pin = el('div', { class: `pin draft${anim}` }, initial(store.get('lab-name')));
        pin.style.left = `${left}px`;
        pin.style.top = `${top}px`;
        layer.append(pin);
        next.push(pin);
      }
      const float = el('div', { class: `float${draft.fluid ? '' : anim}` });
      const box = composer({
        placeholder: S.unheard ? 'add a comment · no agent listening yet' : 'add a comment', // S.unheard: local labs, set from the lab's state
        empty: '',
        nameFirst: false,
        opened: true, // the comment is already picked and its box open (the actions are one tap away)
        autofocus: !(draft.fluid && coarse),
        draftKey: `lab-typing:${S.page}:new`,
        onSubmit: async (name, said) => {
          const { comment, edit } = await send({ name, text: said, anchor });
          if (edit) store.set(`lab-edit:${comment.id}`, edit); // lets this browser drag the pin later
          S.comments.push(comment);
          markSeen([comment]);
          S.draft = null;
          keepSpot(null);
          S.openId = null; // once posted, the card closes and the new pin stays (click it to open)
          S.posted = comment.id;
          if (fluid) fluidDrop(); // goes out as a card does, as the pin pops in
          holdKeyboard(); // the keyboard waits until the card has gone (sheets.ts)
          render();
        },
      });
      float.append(el('div', { class: 'handle' }));
      const row = quickRow(draft, box);
      if (row?.children.length) float.append(row);
      const act = draft.act;
      draft.act = '';
      if (act) queueMicrotask(() => /** @type {HTMLElement | null} */ (float.querySelector(`[data-k="${CSS.escape(act)}"]`))?.click()); // the bar's rewrite, cut or go
      float.append(box);
      swipeDown(float, () => ((S.draft = null), keepSpot(null), render()));
      if (fluid) fluidOpen(float, draft, rects, draft.back); // the float lives in the bar's dialog, not on the layer
      else {
        next.push(float);
        if (zone) placeCard(float, left + 14, zone.top + zone.height);
        else placeBeside(float, left, top);
      }
      // Phones: the sheet the bar grows into. Computers whose words can't be found again: the plain box, the bar lets go.
      if (draft.fluid && !fluid) (sheetMode.matches ? fluidSheet : fluidDrop)(float);
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
    hint.hidden = false;
    store.set('lab-hint-seen', '1');
    setTimeout(() => (hint.hidden = true), 5000);
  };
  const setOn = (value) => {
    S.on = value && !S.board;
    if (!S.on) ptr.classList.remove('show'); // comments hidden: the system pointer is back at once
    else recheck();
    store.set('lab-on', S.on ? '1' : '0');
    S.checkChanges?.(); // hidden comments: no "New" pill
    if (S.on) showHint();
    S.draft = S.on ? keptDraft() : null; // hidden, a new comment lets go of the screen; its words wait, and come back when comments do
    S.openId = null;
    render();
    drawMotion(); // the pause / play beside each moving thing goes and comes with the comments
  };
  toggleBtn.addEventListener('click', () => setOn(!S.on));
  // The ⋯ menu is a disclosure: the button says whether it's open; opening puts focus on its first item, and Escape
  // or a pick gives focus back to the button.
  function setMenu(open, refocus = false) {
    if (open && LABS) preloadSwitcher();
    moreMenu.hidden = !open;
    moreBtn.setAttribute('aria-expanded', String(open));
    if (open) [...moreMenu.querySelectorAll('button')].find((b) => !b.hidden && !b.disabled)?.focus({ preventScroll: true });
    else if (refocus) moreBtn.focus({ preventScroll: true });
  }
  moreBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    setMenu(moreMenu.hidden);
  });
  moreMenu.addEventListener('click', () => setTimeout(() => setMenu(false, true), 0));
  addEventListener('pointerdown', (e) => {
    if (!moreMenu.hidden && !e.composedPath().some((n) => n === moreMenu || n === moreBtn)) setMenu(false);
  }, true);
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !moreMenu.hidden) {
      setMenu(false, true);
      e.stopPropagation();
    }
  }, true);
  goBtn.addEventListener('click', () => setCursor(!S.cursorMode));
  newPrev.addEventListener('click', () => stepNew(-1));
  // Pause (Leo, 19 Nov): each video and each moving thing on the page has its own pause / play just beyond its top right
  // corner, over the page (nothing moves), shown with the comments; P pauses them all, or plays what labit paused.
  // The widget's own animations keep moving, and a comment on a paused video says which second (anchoring.ts).
  const held = new Set(); // the videos and elements labit paused
  const pageAnims = () => document.getAnimations().filter((a) => {
    const t = /** @type {KeyframeEffect | null} */ (a.effect)?.target;
    return t && !root.contains(t);
  });
  const animsOf = (el) => pageAnims().filter((a) => /** @type {KeyframeEffect} */ (a.effect).target === el);
  const moving = () => [...new Set([...document.querySelectorAll('video'), ...held, ...pageAnims().filter((a) => a.playState === 'running').map((a) => /** @type {KeyframeEffect} */ (a.effect).target)])].filter((el) => el?.isConnected);
  const isStill = (el) => (el instanceof HTMLVideoElement ? el.paused : animsOf(el).every((a) => a.playState !== 'running'));
  const setItem = (el, stop) => {
    if (el instanceof HTMLVideoElement) {
      if (stop) el.pause();
      else el.play?.().catch(() => {});
    } else {
      for (const a of animsOf(el)) {
        if (stop && a.playState === 'running') a.pause();
        else if (!stop && a.playState === 'paused') a.play();
      }
    }
    held[stop ? 'add' : 'delete'](el);
    S.paused = held.size > 0; // a comment written now says the page was paused
  };
  const shown = new Map();
  const drawMotion = () => {
    const now = S.on ? moving() : [];
    for (const [el, b] of shown) if (!now.includes(el)) { b.remove(); shown.delete(el); }
    for (const el of now) {
      const r = el.getBoundingClientRect();
      let b = shown.get(el);
      if (!b) {
        b = document.createElement('button');
        b.type = 'button';
        b.className = 'motion';
        b.addEventListener('click', () => (setItem(el, !isStill(el)), drawMotion()));
        motions.append(b);
        shown.set(el, b);
      }
      const stopped = isStill(el);
      const what = el instanceof HTMLVideoElement ? 'video' : 'animation';
      if (b.dataset.state !== String(stopped)) {
        b.dataset.state = String(stopped);
        b.innerHTML = stopped ? '<svg viewBox="0 0 12 12"><path d="M3.5 2.2v7.6L9.8 6z"/></svg>' : '<svg viewBox="0 0 12 12"><path d="M3 2h2v8H3zM7 2h2v8H7z"/></svg>';
        b.setAttribute('aria-label', b.title = `${stopped ? 'play' : 'pause'} this ${what} (P: all)`);
      }
      // From its middle and its own size, so a spinning or growing thing's control stays put.
      const w = el instanceof HTMLElement ? el.offsetWidth : r.width;
      const h = el instanceof HTMLElement ? el.offsetHeight : r.height;
      b.hidden = !w || !h;
      b.style.left = `${Math.min(r.left + (r.width + w) / 2 + 6, document.documentElement.clientWidth - 30) + scrollX}px`;
      b.style.top = `${r.top + (r.height - h) / 2 + scrollY}px`;
    }
  };
  const setPause = (on) => {
    for (const el of on ? moving().filter((el) => !isStill(el)) : [...held]) setItem(el, on);
    drawMotion();
  };
  setInterval(drawMotion, 1000);
  addEventListener('scroll', () => requestAnimationFrame(drawMotion), { capture: true, passive: true });
  doneBtn.addEventListener('click', toggleDone);
  movedBtn.addEventListener('click', () => (setMenu(false), stepMoved()));
  overBtn.addEventListener('click', () => setOver(!S.overControls));
  newNext.addEventListener('click', () => stepNew(1));
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
    const target = document.getElementById(/** @type {CustomEvent} */ (e).detail);
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
    hint.hidden = true;
    render();
    // Computers: the cursor goes in the message box (phones wait for a tap, so the keyboard doesn't cover the chat).
    if (S.chatOpen && !coarse) /** @type {HTMLElement | null} */ (chatEl.querySelector('.chat textarea'))?.focus({ preventScroll: true });
  });
  // No close cross on the chat: a click outside it, Escape or C closes it (phones: the handle or the dimmed page).
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
    // A letter typed while the bar shows starts the comment with it (F4); Escape lets the bar and its words go.
    // Not while typing in a field of the page or the widget (the chat), nor in another widget.
    if (!typing(e) && !inOtherWidget && fluidKey(e)) return void (S.draft || dropOffer());
    if (actionOf(e) === 'toggle' && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey && !e.repeat && !typing(e) && !inOtherWidget) {
      e.preventDefault();
      setOn(!S.on);
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
      if (typed?.value.trim()) return typed.closest('.card, .float')?.animate([{ transform: 'none' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'none' }], { duration: ms('base'), easing: ease() });
      return stepNew(e.shiftKey ? -1 : 1);
    }
    // 1 switches between comment and pointer: once the pointer, again the comment (the key is a setting).
    const act = actionOf(e);
    if (S.on && act === 'comment' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.repeat && !typing(e) && !inOtherWidget) {
      e.preventDefault();
      setCursor(!S.cursorMode);
      return;
    }
    // The list's keys, with comments shown and nothing typed: L list, C chat, J/K next/previous, R reply, E resolve.
    // By the key's place, not its letter, so the keys work with any layout (Russian, Greek…): the C key is C (keyOf).
    // The keys (Leo, 2026-11-15/16), marked in the bar's words: (c)hat, ne(w) (Shift-W: the one before), 1 comment / pointer,
    // P pause, M hide, D show/hide done. With a thread open: R reply, E resolve.
    // Shift is only for next (Shift-W: the one before); ⇧D, ⇧B and the rest belong to the board.
    if (S.on && !typing(e) && !inOtherWidget && !e.metaKey && !e.ctrlKey && !e.altKey && !e.repeat && ['pause', 'chat', 'next', 'done', 'reply', 'resolve', 'added'].includes(act) && (act === 'next' || !e.shiftKey)) {
      const k = act;
      e.preventDefault();
      if (k === 'pause') return setPause(!S.paused);
      if (k === 'chat') return chatBtn.click();
      if (k === 'next') return stepNew(e.shiftKey ? -1 : 1);
      if (k === 'added') return dispatchEvent(new CustomEvent('lab-added')); // the Added list (changes.ts, flag sinceLooked)
      if (k === 'done') return toggleDone();
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
    for (let n = t instanceof Element ? t : null; n && n !== document.body && n !== document.documentElement; n = n.parentElement)
      if (n.matches(INTERACTIVE) || getComputedStyle(n).cursor === 'pointer') return true;
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
    if ((!S.on && !e.altKey) || (S.cursorMode && !e.altKey) || draftHasText() || e.button !== 0 || e.pointerType === 'touch' || e.metaKey || e.ctrlKey || (e.shiftKey && !S.shiftUp)) return;
    if (e.composedPath().includes(host)) return;
    if (!e.altKey && control(e.target)) return;
    if (e.target instanceof Element && e.target.closest(OFF)) return;
    S.drag = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY, active: false };
  }
  document.addEventListener('pointerdown', (e) => !e.altKey && startDrag(e), true); // Option presses are taken earlier (see optionPress)
  document.addEventListener(
    'pointermove',
    (e) => {
      if (!S.drag) return;
      S.drag.x1 = e.clientX;
      S.drag.y1 = e.clientY;
      if (!S.drag.active && Math.hypot(S.drag.x1 - S.drag.x0, S.drag.y1 - S.drag.y0) > 8) {
        S.drag.active = true;
        getSelection?.()?.removeAllRanges();
        document.documentElement.classList.add('lab-dragging');
        S.liveZone = zoneEl('draft live');
        layer.append(S.liveZone);
      }
      if (!S.drag.active) return;
      e.preventDefault();
      S.zoneFrame ||= requestAnimationFrame(paintZone);
    },
    true,
  );
  const endDrag = (e) => {
    if (!S.drag) return;
    const d = S.drag;
    S.drag = null;
    document.documentElement.classList.remove('lab-dragging');
    cancelAnimationFrame(S.zoneFrame);
    S.zoneFrame = 0;
    S.liveZone?.remove();
    S.liveZone = null;
    if (!d.active || e.type === 'pointercancel') return;
    // The click that follows this pointerup belongs to the drag, not a new pin.
    S.afterDrag = true;
    setTimeout(() => (S.afterDrag = false), 0);
    getSelection?.()?.removeAllRanges();
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
  const openSheet = () => (S.labsOpen && switcherSheet()) || root.querySelector('.card:not(.out), .float:not(.out)') || (S.chatOpen ? chatEl : null);
  const closeAll = () => {
    if (S.labsOpen) return closeSwitcher(); // labs & pages sits over the others: only it goes
    S.draft = null;
    S.openId = null;
    S.chatOpen = false;
    render();
  };
  // Text typed in a thread or a new comment would be lost, so the sheet stays and nudges instead; the chat's box keeps
  // its text when closed, so the chat always closes.
  const closeOrNudge = () => {
    const node = openSheet();
    if (![...root.querySelectorAll('textarea')].some((t) => t.value.trim() && !chatEl.contains(t))) return slideAway(node, closeAll);
    node?.animate?.([{ transform: 'none' }, { transform: 'translateY(12px)' }, { transform: 'none' }], { duration: ms('base'), easing: ease('out') });
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
    if (S.pinnedByHold) /** @type {HTMLElement | null} */ (root.querySelector('.float [data-first]') || root.querySelector('.float textarea'))?.focus({ preventScroll: true });
  }, true);
  // The lift after a hold: no click follows it (it would land on the dimmed page and take the cursor away), and the
  // touch's own end puts the cursor in the box, so the phone opens its keyboard.
  document.addEventListener('touchend', (e) => {
    pressing(false);
    if (!S.pinnedByHold) return;
    S.pinnedByHold = false;
    e.preventDefault();
    /** @type {HTMLElement | null} */ (root.querySelector('.float [data-first]') || root.querySelector('.float textarea'))?.focus({ preventScroll: true });
  }, { capture: true, passive: false });
  document.addEventListener('pointercancel', () => (stopPress(), pressing(false)), true);
  addEventListener('scroll', stopPress, { passive: true, capture: true });
  document.addEventListener('contextmenu', (e) => (S.press || S.afterDrag) && e.preventDefault(), true);
  // Selecting words, and what it did before the one fluid element (fluid.ts) — all of it kept:
  //  1. Computers: Shift + drag (or Shift + double or triple click) selects words; a plain drag marks an area wherever it
  //     starts, a click pins, and the page's text can't be selected without Shift (it shows the I-beam cursor, html.lab-shift-cur).
  //     Letting go opens the dialog at the words' end at once, the cursor in its box (Leo 18 Nov); rewrite and cut
  //     go as they do in the box.
  //  2. Phones: words selected the phone's way got a "Comment" chip (selChip); a tap pinned on them. Kept: the bar is
  //     the fluid element, below the words' end, gone with the selection; comment grows it into the usual bottom sheet
  //     (sheets.ts: fromTap / revealDraft / leave all as before), with no keyboard until the box is tapped.
  //  3. Phones: holding a finger still pins (hold-to-comment): untouched, it never makes a selection.
  //  4. The anchor: pinned on the last selected letter, quoting exactly the words with a few either side (below).
  //  5. keepSpot: the spot and the typed words are kept while writing, so a reload gives them back (as a plain box).
  //  6. Keys (KEYS): all as before, except while the bar shows, when a letter is the comment's first letter; Escape
  //     lets the bar go; a click elsewhere only lets it go (as with an open comment).
  //  7. The hint's words ("shift-drag to quote words", phones "hold to comment"): unchanged.
  const dropOffer = () => {
    fluidDrop();
    markQuote(null);
  };
  document.addEventListener('selectionchange', () => {
    const sel = getSelection?.();
    const range = sel?.rangeCount && sel.getRangeAt(0);
    const text = String(sel || '').trim();
    const inside = range && host.contains(range.commonAncestorContainer);
    clearTimeout(S.selWait);
    if (!(coarse && S.on && !S.draft && text && range && !inside)) return coarse && fluidState() === 'bar' && fluidDrop(); // gone with the selection
    // The handles change it many times a second as they are dragged: the bar comes once the selection is still.
    S.selWait = setTimeout(() => fluidBar(rectsOf(range), (first, act) => (first && store.set(`lab-typing:${S.page}:new`, first), commentOnSelection(act)), text.length), 250);
  });
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
    // A drag that starts or ends inside a word takes the whole word (as most editors do; Leo, 18 Nov), so a note is on
    // "Send … carry", not "nd … ca". A drag that stays inside one word keeps exactly its letters.
    /** @param {Node} node @param {number} i @param {number} step */
    const grow = (node, i, step) => {
      const d = node.nodeType === 3 ? /** @type {Text} */ (node).data : '';
      while (/[\p{L}\p{N}\p{M}'’_]/u.test(d[step < 0 ? i - 1 : i] ?? ' ')) i += step;
      return i;
    };
    if (/\s/.test(String(range).trim())) {
      range.setStart(range.startContainer, grow(range.startContainer, range.startOffset, -1));
      range.setEnd(range.endContainer, grow(range.endContainer, range.endOffset, 1));
    }
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
      ? anchorAt(Math.max(last.left, last.right - 2), last.top + last.height / 2)
      : anchorAt(first.left + 2, first.top + first.height / 2);
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
    };
    sel.removeAllRanges();
    return anchor;
  };
  // Phones (the bar's comment): straight to the comment on the words.
  const commentOnSelection = (act = '') => {
    const anchor = selectionAnchor();
    if (!anchor) return;
    showAgain();
    S.openId = null;
    begin(anchor, true, act);
  };
  // Computers, a drag over words let go: the dialog opens at once at the words' end, the cursor in its box (Leo 18 Nov).
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
    begin(got, true);
  };
  // The actions row of a comment on selected words or a spot (the box is the comment, so no button for it): every button sends at
  // once on a click, nothing to type: rewrite sends `Rewrite: “…”` (the agent proposes the new wording), cut sends
  // `Cut: “…”`, go is an ordinary comment that says "go", and your own (labit.json `actions`) send their text. They go
  // through the box's own send, so a missing name is asked for there, a lab that can't be reached keeps them. ⌥ + 1…4 runs the nth button (holding ⌥ shows the numbers). Long quotes (the first 300 characters are kept)
  // have no cut or rewrite: the words said aren't all there; nor do words the page no longer has (the row is dimmed then).
  const quickRow = (draft, box) => {
    const row = el('div', { class: 'quick' });
    const field = /** @type {HTMLTextAreaElement} */ (box.querySelector('textarea'));
    const exact = draft.anchor.quote?.exact || '';
    const fill = (v) => ((field.value = v), field.dispatchEvent(new Event('input')));
    for (const a of acts(draft.fluid ? exact.length : 1e9, false, draft.fluid ? ACTIONS.words : ACTIONS.spot)) {
      const k = actName(a);
      const b = actButton(a, false);
      b.addEventListener('mousedown', (e) => e.preventDefault()); // the cursor stays in the box
      b.addEventListener('click', () => {
        if (/^(rewrite|cut)$/.test(k) && !quoteRects(draft.anchor).length) return;
        const typed = field.value.trim();
        const own = typeof a === 'string' ? null : a;
        const said = own ? `${own.send}${typed ? ` ${typed}` : ''}` : k === 'rewrite' ? `Rewrite: “${exact}”` : k === 'cut' ? `Cut: “${exact}”` : k === 'go' ? 'go' : k === 'remove' ? 'Remove this' : 'Fix this';
        fill(said);
        /** @type {HTMLElement} */ (box.querySelector('.send')).click();
      });
      row.append(b);
    }
    // ⌥ + 1…4 (by the key's place, so Option's own characters don't matter) runs the nth button; holding ⌥ shows the numbers.
    const buttons = [...row.children];
    buttons.forEach((b, n) => b.setAttribute('data-n', String(n + 1)));
    const alt = (on) => row.classList.toggle('alt', on);
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Alt') alt(true);
      const n = e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey ? /^Digit([1-4])$/.exec(e.code)?.[1] : '';
      if (!n || !buttons[+n - 1]) return;
      e.preventDefault();
      e.stopPropagation();
      buttons[+n - 1].click();
    }, true);
    box.addEventListener('keyup', (e) => e.key === 'Alt' && alt(false), true);
    box.addEventListener('focusout', () => alt(false));
    return row;
  };
  // Computers: Shift + drag (or Shift + double or triple click) selects words; letting go opens the comment dialog.
  document.addEventListener('mouseup', (e) => {
    if (S.on && !S.cursorMode && e.shiftKey && !S.shiftUp && e.button === 0 && !draftHasText() && !e.composedPath().includes(host)) setTimeout(offerSelection, 0);
  }, true);
  function onPageClick(e) {
    if (e.composedPath().includes(host)) return;
    if (fluidState() === 'bar' && !(e.shiftKey && !S.shiftUp)) return dropOffer(); // the first click elsewhere only lets the bar go
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
    begin(anchorAt(e.clientX, e.clientY));
  }

  // Scrolling an inner box or the page growing only moves the pins: their places are read together, then written.
  // A full redraw happens only when something is open (a card or a composer follows its pin) or the pins changed.
  const movePins = () => {
    if (!S.on || S.openId) return render();
    const places = threads().filter((c) => c.anchor?.kind !== 'page').map((c) => [pinsById.get(c.id), position(c.anchor || {})]).filter(([, at]) => !at.moved);
    if (places.length !== pinsById.size || places.some(([pin]) => !pin)) return render(); // one lost or found its spot
    for (const [pin, { left, top }] of places) {
      pin.style.left = `${left}px`;
      pin.style.top = `${top}px`;
    }
  };
  S.frame = 0;
  const reflow = () => {
    cancelAnimationFrame(S.frame);
    S.frame = requestAnimationFrame(() => {
      if (fluidState() === 'dlg' && S.draft) fluidFollow(quoteRects(S.draft.anchor)); // so does the open dialog
      // Keep an open composer's text: only re-place when nothing is being typed.
      if (S.draft || root.activeElement || S.grabbing) return;
      movePins();
    });
  };
  addEventListener('resize', reflow);
  addEventListener('scroll', (e) => (e.target !== document || fluidFixed()) && !host.contains(/** @type {Node} */ (e.target)) && reflow(), { capture: true, passive: true }); // the page's own scroll moves only what is held to the screen

  // Client-side navigation (pushState, back/forward, Astro view transitions): comments follow the new page,
  // and the layer comes back if the page swapped out <body>.
  const navigated = () => {
    if (!host.isConnected && document.body) document.body.append(host);
    if (!fonts.isConnected) document.head.append(fonts);
    if (!pinCursorStyle.isConnected) document.head.append(pinCursorStyle);
    if (pageNow() === S.page) return;
    S.page = pageNow();
    S.seen = readSeen();
    syncReads();
    S.comments = [];
    S.draft = null;
    S.openId = null;
    render();
    load();
    setTimeout(() => S.checkChanges?.(), 400);
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
  // Fields and editable text stay selectable.
  fonts.textContent += `@media (pointer: fine) { html.lab-pinning:not(.lab-shift, .lab-lit) body > :not([data-lab-comments]), html.lab-pinning:not(.lab-shift, .lab-lit) body > :not([data-lab-comments]) :not(input, textarea, select, [contenteditable], [contenteditable] *) { -webkit-user-select: none; user-select: none; } }`;
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
    // The page's own selection while commenting, and the quoted words of an open text comment.
    // A soft green, so the quoted words stay readable in the page's own colour, on light and dark pages.
    const paint = 'background-color: rgba(52, 199, 89, .3); color: inherit;';
    fonts.textContent += `html.lab-pinning ::selection { ${paint} } ::highlight(lab-quote) { ${paint} }`;
    load();
    if (script?.dataset.live && flag('sinceLooked')) startChanges(); // the ids added since you looked (local labs, where pages change under you)
  };
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
  startLive();
  if (LABS) bindSwitcher({
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
    });
})();
