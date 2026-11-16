/*!
 * lab comments: anyone with the link clicks anywhere on a lab page to pin a comment. No login, just a name.
 * https://github.com/leonidstern/labit · MIT
 * Comments are off by default; the bar button or c turns them on (remembered per browser). When on, click anywhere that isn't a link or control to pin one (alt/option-click pins on those too). c (or the bar button) hides
 * and shows them; esc or a click outside closes an open comment. Dragging (mouse/pen) marks an area instead of a point.
 * Include on a page served through your lab domain:
 *   <script src="https://lab.example.com/_lab/comments.js" defer></script>
 * The layer only turns on when the page is opened on the host the script is loaded from (or data-host),
 * so the deployment's own address and local dev stay clean. data-enable="always" turns it on everywhere.
 * Admin (resolve / delete / copy agent link): open any page once with ?lab-admin=<LAB_COMMENTS_ADMIN_TOKEN>; it is kept in this browser.
 */
import styles from './widget/styles.css';
import {
  bindAnchoring,
  DRAFT_MODE,
  anchorAt,
  drafting,
  drawZone,
  inPage,
  markQuote,
  nameLine,
  pageEnd,
  position,
  readable,
  short,
  zoneAnchor,
  zoneEl,
} from './widget/anchoring.ts';
import { bindComposer, composer } from './widget/composer.ts';
import { bindMessages, onWhat, stampOf } from './widget/messages.ts';
import { bindSheets, backCloses, fromTap, holdKeyboard, leave, letGo, revealDraft, slideAway, startSheets, swipeDown } from './widget/sheets.ts';
import { bindList, drawList, goTo, stepNew, workState } from './widget/list.ts';
import { bindChat, drawChat, stamped } from './widget/chat.ts';
import { bindThread, grab, placeBeside, placeCard, threadCard } from './widget/thread.ts';
import { bindLive, startLive } from './widget/live.ts';

(() => {
  // The widget's state, in one place, so its parts can live in their own files (src/widget/*) and share it.
  /** @type {any} */
  const S = { dbg: null }; // dbg: ?kbdebug's line into the phone's log (sheet drags)
  // What the parts in src/widget/ use from here, read when they use it (getters: nothing is read before it exists).
  const W = {
    get $() { return $; },
    get DRAFT_MODE() { return DRAFT_MODE; },
    get LIST_WINDOW() { return LIST_WINDOW; },
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
    get drafting() { return drafting; },
    get drawList() { return drawList; },
    get el() { return el; },
    get fonts() { return fonts; },
    get goBtn() { return goBtn; },
    get goFace() { return goFace; },
    get goTo() { return goTo; },
    get held() { return held; },
    get holdBtn() { return holdBtn; },
    get host() { return host; },
    get isDone() { return isDone; },
    get isNew() { return isNew; },
    get isPage() { return isPage; },
    get keyWord() { return keyWord; },
    get layer() { return layer; },
    get listBtn() { return listBtn; },
    get listEl() { return listEl; },
    get listed() { return listed; },
    get load() { return load; },
    get loadChanges() { return loadChanges; },
    get markSeen() { return markSeen; },
    get mine() { return mine; },
    get nameLine() { return nameLine; },
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
    get sendBtn() { return sendBtn; },
    get showDoneBtn() { return showDoneBtn; },
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
  bindList(W);
  bindChat(W);
  bindThread(W);
  bindSheets(W);
  const script = /** @type {HTMLScriptElement | null} */ (document.currentScript);
  const labHost = script?.dataset.host || (script?.src ? new URL(script.src, location.href).hostname : location.hostname);
  const enabled = location.hostname === labHost || script?.dataset.enable === 'always';
  if (!enabled || /** @type {any} */ (window).__labComments) return;
  /** @type {any} */ (window).__labComments = true;

  const API = script?.dataset.api || '/_lab/api/comments';
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
  const adminToken = script?.dataset.admin || store.get(`lab-admin:${S.page.split('/')[1] || ''}`) || store.get('lab-admin:*') || store.get('lab-admin');

  S.comments = [];
  S.isAdmin = false;
  // Off by default: the page looks clean until someone turns comments on (button or c); remembered per browser.
  S.on = store.get('lab-on') ? store.get('lab-on') === '1' : script?.dataset.on === '1';
  S.openId = null;
  S.closeFast = false; // the next redraw that closes a comment fades it out quickly instead of sliding it
  S.cardFull = false; // a comment pulled up to full height (the card is drawn anew on each redraw)
  S.draft = null; // { anchor, docX, docY }

  // ---------- DOM ----------
  const host = document.createElement('div');
  host.setAttribute('data-lab-comments', '');
  host.style.cssText = 'position:absolute;top:0;left:0;width:0;height:0;z-index:2147483000;';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>${styles}</style>
    <div class="scrim"></div>
    <div class="layer"></div>
    <button class="sel-chip" type="button" hidden>Comment</button>
    <div class="hint" role="status" hidden>click to comment · drag to mark an area · shift-drag to quote words · c chat · w new · 1 comment · 2 go · 3 cursor · p pause · m hide</div>
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
      <button class="secondary pause-btn" type="button" aria-pressed="false" title="stop everything that moves on the page, to pin a moment (p)">pause motion</button>
      <button class="secondary go-btn" type="button" hidden title="1 comment · 2 go: every click approves what it's on · 3 cursor: clicks are the page's own">go</button>
      <button class="toggle" type="button"></button>
      <button class="secondary more" type="button" hidden aria-label="more options" aria-expanded="false" aria-controls="lab-more">⋯</button>
    </div>
    <div class="more-menu" id="lab-more" hidden></div>`;
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
  // The comments list (new / open / resolved / mine; J/K step, R reply, E resolve, L shows it), and drafts: with
  // "drafts" on, new pins wait in this browser until "send 3 drafts", so nothing starts on pin 1 of 10.
  const listBtn = /** @type {HTMLButtonElement} */ ($('.list-btn'));
  const goBtn = $('.go-btn');
  const newPrev = $('.new-prev');
  const showDoneBtn = $('.show-done');
  const doneBtn = /** @type {HTMLButtonElement} */ ($('.done-btn'));
  const pauseBtn = $('.pause-btn');
  // The list window is parked (Leo, 2026-11-15): new comments are stepped through with ‹ N new › in the bar, and
  // done pins are shown or hidden with a pill there. Its code stays; LIST_WINDOW brings it back.
  const LIST_WINDOW = false;
  const tabTitle = { base: '' };
  S.showDone = store.get('lab-show-done') === '1';
  const newNext = $('.new-next');
  const sendBtn = $('.send-all');
  const listEl = $('.list');
  const holdBtn = $('.hold', listEl);
  const chatEl = $('.chatwin');
  const chatBtn = /** @type {HTMLElement} */ (root.querySelector('.chat-btn'));
  S.listOpen = false;
  S.filter = 'open';
  S.refit = () => {}; // phones: fit the sheets to the keyboard again (below)
  S.chatOpen = false;

  const el = (tag, attrs = {}, text) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (text != null) node.textContent = text;
    return node;
  };

  // ---------- anchoring (src/widget/anchoring.ts) ----------
  bindAnchoring({ host, layer, el, store });
  // The message box and a message's small pieces (src/widget/composer.ts, messages.ts). Arrows, so helpers defined
  // further down are read when called.
  bindComposer({ el, store, root, refreshPinCursor: () => refreshPinCursor(), syncReads: () => syncReads() });
  bindMessages({ el, mine: (c) => mine(c), repliesOf: (id) => repliesOf(id), workState: (c) => workState(c) });

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

  // The API answers 404 anywhere but on the lab host. A script loaded with a relative src can't tell the
  // lab host from the deployment's own address, so the first answer decides: no API here, no layer.
  S.gone = false;
  S.loaded = false;
  S.retried = false;
  const typed = () => Boolean(root.activeElement) || [...root.querySelectorAll('textarea')].some((t) => t.value.trim());
  async function load() {
    try {
      const res = await fetch(`${API}?page=${encodeURIComponent(S.page)}`, { headers: headers(), cache: 'no-store' });
      if (res.status === 404 && !S.loaded && script?.dataset.enable !== 'always') {
        if (!S.retried) {
          S.retried = true;
          setTimeout(load, 1500);
          return;
        }
        S.gone = true;
        S.on = false;
        document.documentElement.classList.remove('lab-pinning');
        host.remove();
        fonts.remove();
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      S.comments = data.comments || [];
      S.isAdmin = Boolean(data.admin);
      S.loaded = true;
    } catch {
      // Keep what is already on screen when a refresh fails.
    }
    shownAgain();
  }
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

  // Go mode (V): every new spot (a click, a drawn area, selected words, a hold on phones) is posted at once as "go",
  // approving what it's on, with no box to type in. In draft mode go pins wait with the other drafts.
  S.goMode = store.get('lab-go') === '1';
  // Cursor (3): pins stay shown, but a click is the page's own (follow a link, try a button): nothing is pinned.
  // Option-click still pins. 1 comment and 2 go leave it.
  S.cursorMode = store.get('lab-cursor') === '1';
  // Switching only changes the button and the pointer: nothing on the page is redrawn, so nothing flickers.
  const setCursor = (v) => {
    S.cursorMode = v;
    store.set('lab-cursor', v ? '1' : '');
    goBtn.classList.toggle('cursor', v);
    goBtn.classList.toggle('on', S.goMode && !v); // cursor replaces go's green at once
    goFace();
    document.documentElement.classList.toggle('lab-pinning', S.on && !v);
    document.documentElement.classList.toggle('lab-go', S.on && S.goMode && !v);
    recheck();
  };
  const setGo = (v) => {
    if (S.cursorMode) setCursor(false);
    S.goMode = v;
    queueMicrotask(goFace);
    store.set('lab-go', v ? '1' : '');
    goBtn.classList.toggle('on', v);
    goBtn.setAttribute('aria-pressed', String(v && !S.cursorMode));
    document.documentElement.classList.toggle('lab-go', S.on && v);
    ptr.classList.toggle('go', v); // the drawn pointer turns at once, without waiting for the mouse to move
    recheck();
  };
  function begin(anchor) {
    const name = store.get('lab-name').trim();
    // Go with no name yet (a guest's first): the card asks only the name; the go is implied (Leo, 16 Nov).
    if (!S.goMode || !name) {
      S.draft = { anchor, go: S.goMode };
      return render();
    }
    if (drafting()) {
      store.set(heldKey(), JSON.stringify([...held(), { name, text: 'go', anchor }]));
      return render();
    }
    send({ name, text: 'go', anchor })
      .then(({ comment, edit }) => {
        if (edit) store.set(`lab-edit:${comment.id}`, edit);
        S.comments.push(comment);
        markSeen([comment]);
        S.posted = comment.id;
        render();
      })
      .catch(() => ((S.draft = { anchor }), render())); // couldn't post: the usual box, so nothing is lost
  }
  // Sent once the lab answers: while it can't be reached (restarting, the laptop just woke), the message waits and is
  // tried again every 2 s for up to 5 minutes, instead of failing. Only a lab that answers with an error fails it.
  async function send(payload) {
    let res = null;
    // A new comment or reply carries a nonce, so a retry after a lost answer can't save it twice.
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
    say(`took back ${/^go$/i.test(c.text.trim()) ? 'a go' : 'a pin'} · ${placed.length ? 'again for the one before' : 'nothing more to take back'}`);
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
  const heldKey = () => `lab-held:${S.page}`;
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
      .filter((c) => (S.filter === 'new' ? unread(c).length : S.filter === 'open' ? !c.resolved : S.filter === 'resolved' ? c.resolved : mine(c)))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
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
  function placeBar() {
    const inMenu = S.on ? [doneBtn, pauseBtn, copyBtn, toggleBtn] : [];
    for (const b of inMenu) if (b.parentNode !== moreMenu) moreMenu.append(b);
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
  // The switch shows what a click will place: 1 your comment pin (your initial), 2 a go pin, 3 nothing ("off").
  function goFace() {
    const gp = goBtn.querySelector('.gp');
    if (gp) gp.textContent = !S.goMode && !S.cursorMode ? initial(store.get('lab-name')) || '+' : 'go';
    // Read out as what a click places, not the letter on it.
    goBtn.setAttribute('aria-label', `a click places: ${S.cursorMode ? 'nothing (cursor)' : S.goMode ? 'go' : 'a comment'}`);
    goBtn.setAttribute('aria-keyshortcuts', '1 2 3');
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
  // Ends a pin drag's window listener when the layer is redrawn under it (the pin is gone, its pointer events with it).
  S.dropDrag = null;
  function render() {
    S.grabbing = false; // a pin being dragged is replaced: its drag ends here
    S.dropDrag?.();
    const prev = /** @type {HTMLElement | null} */ (layer.querySelector('.card:not(.out), .float:not(.out)'));
    const prevHeight = S.stepping && coarse && prev ? prev.offsetHeight : 0; // stepping on a phone: the sheet's top doesn't drop
    // The same thread drawn again (reopened, resolved, a reply came in): it keeps where its messages were scrolled to.
    const prevScroll = prev ? prev.querySelector('.body')?.scrollTop ?? null : null;
    // Every pin's place is read before anything is written, so the page lays out once per render, not once per pin.
    const places = new Map(S.on ? threads().filter((c) => c.anchor?.kind !== 'page').map((c) => [c.id, position(c.anchor || {})]) : []);
    layer.replaceChildren();
    pinsById.clear();
    const now = S.on ? S.draft || S.openId : null;
    const appear = now !== S.shown;
    const anim = appear ? ' in' : '';
    let quoted = null;
    const done = () => {
      if (S.closeFast && !now && prev) {
        S.closeFast = false;
        prev.inert = true;
        layer.append(prev);
        const gone = () => prev.remove();
        if (still.matches || !prev.animate) gone();
        else prev.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, easing: 'ease-out', fill: 'forwards' }).finished.then(gone, gone);
      } else if (coarse && !now && S.shown && prev && !still.matches && !prev.style.transform) { // phones slide the sheet away; computers close at once, like the chat // not when it already slid away (phones)
        prev.classList.remove('in');
        prev.classList.add('out');
        prev.inert = true;
        layer.append(prev);
        // It shrinks back with the keyboard going (sheets.ts): after a send, into the new pin.
        const newPin = S.posted && pinsById.get(S.posted);
        const sent = newPin?.getBoundingClientRect();
        if (newPin) newPin.style.animationDelay = '250ms'; // it pops in as the card arrives (lab B2)
        const dur = leave(prev, 0, sent && { x: sent.left + sent.width / 2, y: sent.top + sent.height / 2 });
        setTimeout(() => (prev.remove(), letGo(prev)), dur);
      }
      // Phones: a sheet that opens grows out of what was tapped (sheets.ts).
      if (coarse) {
        const sheet = /** @type {HTMLElement | null} */ (root.querySelector('.card:not(.out), .float:not(.out)')) || (S.listOpen ? listEl : S.chatOpen ? chatEl : null);
        const key = sheet && (S.draft ? 'draft' : S.openId || (S.listOpen ? 'list' : S.chatOpen ? 'chat' : ''));
        if (sheet && key !== S.sheetKey) fromTap(sheet);
        S.sheetKey = key;
        if (appear && S.draft) requestAnimationFrame(revealDraft); // its pin above the sheet, before the keyboard
      }
      markQuote(quoted);
      S.shown = now;
      S.posted = null;
    };
    const list = threads();
    const open = list.filter((c) => !c.resolved && c.anchor?.kind !== 'page').length; // chat messages count in the chat
    const fresh = list.filter((c) => !c.resolved && c.anchor?.kind !== 'page').reduce((n, c) => n + unread(c).length, 0); // the chat counts its own
    // New replies are counted on "list" while comments show, on the toggle while they are hidden.
    toggleBtn.replaceChildren(
      document.createTextNode((S.on ? 'hide comments' : open ? `comments · ${open}` : 'comments') + (!S.on && fresh ? ` · ${fresh} new` : '')),
      el('kbd', { 'aria-hidden': 'true' }, 'm'),
    );
    toggleBtn.classList.toggle('secondary', S.on);
    host.toggleAttribute('data-sheet', Boolean(S.on && (S.draft || S.openId || S.listOpen || S.chatOpen))); // phones: the sheet has the screen's bottom
    if (coarse && appear && now) { // a sheet opening slides in once its first frame is drawn (see data-opening in styles.css)
      host.setAttribute('data-opening', '');
      requestAnimationFrame(() => requestAnimationFrame(() => host.removeAttribute('data-opening')));
    }
    document.documentElement.classList.toggle('lab-sheet', host.hasAttribute('data-sheet'));
    backCloses();
    S.refit();
    document.documentElement.classList.toggle('lab-pinning', S.on && !S.cursorMode);
    document.documentElement.classList.toggle('lab-go', S.on && S.goMode && !S.cursorMode);
    copyBtn.hidden = !S.on || !S.isAdmin || list.every((c) => c.resolved);
    drawList();
    drawChat();
    if (!S.on) return done();
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
      if (!S.showDone && S.openId !== c.id && (c.resolved || workState(c)[0] === 'done') && !unread(c).length) return;
      const { left, top, moved, zone } = places.get(c.id) || position(c.anchor || {});
      if (S.openId === c.id) drawZone(zone, `saved${anim}`); // a drawn area shows its outline while open
      const news = unread(c);
      const movable = !zone && (S.isAdmin || store.get(`lab-edit:${c.id}`));
      const [state] = workState(c); // placed (sent), now (the agent is on it) or done
      const pin = el(
        'button',
        {
          class: `pin${/^go$/i.test(c.text.trim()) ? ' go' : ''}${c.resolved ? ' resolved' : ''}${state === 'done' ? ' done' : ''}${state === 'now' ? ' working' : ''}${news.length ? ' new' : ''}${moved ? ' moved' : ''}${S.posted === c.id ? (coarse ? ' arrive' : ' in') : ''}${movable ? ' grab' : ''}${S.openId === c.id ? ' open' : ''}`,
          type: 'button',
          title: `${c.resolved ? '' : `${numberOf(c)} · `}${c.name}${moved ? ' · the spot it was pinned to has changed' : ''}${movable ? ' · drag to move' : ''}`,
          // Its state in words too (the ring, the tick and the new dot are only seen).
          'aria-label': `${/^go$/i.test(c.text.trim()) ? 'go' : 'comment'}${c.resolved ? '' : ` ${numberOf(c)}`} by ${c.name}${state === 'now' ? ', agent working on it' : state === 'done' || c.resolved ? ', done' : ''}${news.length ? `, ${news.length} new` : ''}${moved ? ', moved' : ''}`,
        },
        /^go$/i.test(c.text.trim()) ? 'go' : state === 'done' || c.resolved ? '✓' : initial(c.name),
      );
      // Its face changed since the last drawing (the agent took it, it's done, something new in it): it eases into the
      // new one and the ring fades in or out, instead of a cut (see .swap in styles.css).
      const face = `${state}${c.resolved ? ' resolved' : ''}${news.length ? ' new' : ''}`;
      const was = S.faces.get(c.id);
      S.faces.set(c.id, face);
      const changed = was !== undefined && was !== face && !still.matches;
      if (changed) pin.classList.add('swap');
      if (state === 'now') pin.append(el('i', { class: `ring${changed && !was.startsWith('now') ? ' come' : ''}`, 'aria-hidden': 'true' }));
      else if (changed && was.startsWith('now')) pin.append(el('i', { class: 'ring gone', 'aria-hidden': 'true' }));
      if (coarse) pin.append(el('i', { class: 'hit', 'aria-hidden': 'true' })); // a 44 pt place to tap (styles.css)
      pin.style.left = `${left}px`;
      pin.style.top = `${top}px`;
      if (movable) grab(pin, c);
      // Hovering a pin shows what it's on, as an open one does: a drawn area its outline, selected words their highlight.
      if (!coarse && zone && S.openId !== c.id) {
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
        if (coarse && S.openId !== c.id) return goTo(c);
        S.openId = S.openId === c.id ? null : c.id;
        S.draft = null;
        render();
      });
      layer.append(pin);
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
        placeCard(card, zone ? left + 14 : left, zone ? zone.top + zone.height : top);
        // Opens at the newest message, as the chat does (a short thread doesn't scroll), on phones too (they opened at
        // the first message).
        if (!appear && prevScroll != null) card.querySelector('.body').scrollTop = prevScroll;
        else if (appear) {
          // Computers: at the first new message when there is one. Phones: already at the end when it shows, the last
          // message in view, as the chat opens (Leo, 15 Nov: no scroll you can see; the sheet's height is fixed now, so
          // nothing grows after it's set).
          const body = card.querySelector('.body');
          const first = coarse ? null : body.querySelector('.fresh, .newline');
          body.scrollTop = first ? first.offsetTop - body.offsetTop - 8 : body.scrollHeight;
        }
        if (coarse && S.cardFull) card.classList.add('full'); // stays pulled up while you step from comment to comment
        swipeDown(card, () => ((S.openId = null), (S.cardFull = false), render()), true);
        markSeen(news);
        if (news.length) drawList(); // opened is read: the "N new" pill and the tab title count it off at once
        quoted = zone ? null : c.anchor; // an area's outline says what it's on; only selected words get the highlight
      }
    });

    if (S.draft) {
      const { anchor } = S.draft;
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
          placeholder: S.draft.go ? 'go' : 'add a comment',
          empty: S.draft.go ? 'go' : '',
          nameFirst: Boolean(S.draft.go),
          autofocus: true,
          onSubmit: async (name, text) => {
            if (drafting()) {
              store.set(heldKey(), JSON.stringify([...held(), { name, text, anchor }]));
              S.draft = null;
              return render();
            }
            const { comment, edit } = await send({ name, text, anchor });
            if (edit) store.set(`lab-edit:${comment.id}`, edit); // lets this browser drag the pin later
            S.comments.push(comment);
            markSeen([comment]);
            S.draft = null;
            S.openId = null; // like Figma: once posted, the card closes and the new pin stays (click it to open)
            S.posted = comment.id;
            holdKeyboard(); // the keyboard waits until the card has flown into its pin (sheets.ts)
            render();
          },
        }),
      );
      swipeDown(float, () => ((S.draft = null), render()));
      if (zone) placeCard(float, left + 14, zone.top + zone.height);
      else placeBeside(float, left, top);
    }
    done();
  }

  // Drag a pin to fix its spot: whoever started the thread (its key is kept in their browser) or an admin.
  // The pin's tip (bottom left) lands where it is dropped; the new spot is saved like a fresh pin.
  S.grabbing = false;

  // The open thread's card. New replies (Claude's too) are added to it in place, so the reply box keeps focus.
  S.openCard = null;
  const coarse = matchMedia('(pointer: coarse)').matches;

  // ---------- events ----------
  const showHint = () => {
    if (store.get('lab-hint-seen') === '1') return;
    hint.hidden = false;
    store.set('lab-hint-seen', '1');
    setTimeout(() => (hint.hidden = true), 5000);
  };
  const setOn = (value) => {
    S.on = value;
    if (!S.on) ptr.classList.remove('show'); // comments hidden: the system pointer is back at once
    else recheck();
    store.set('lab-on', S.on ? '1' : '0');
    if (S.on) showHint();
    S.draft = null;
    S.openId = null;
    render();
  };
  toggleBtn.addEventListener('click', () => setOn(!S.on));
  // The ⋯ menu is a disclosure: the button says whether it's open; opening puts focus on its first item, and Escape
  // or a pick gives focus back to the button.
  function setMenu(open, refocus = false) {
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
  goBtn.addEventListener('click', () => setGo(!S.goMode));
  newPrev.addEventListener('click', () => stepNew(-1));
  doneBtn.addEventListener('click', () => showDoneBtn.click());
  // Pause motion (p): everything that moves on the page stops where it is, to pin a moment of an animation (Leo,
  // 16 Nov); again to play on. Animations that start while paused stop too (checked every 100 ms). The widget moves on.
  S.paused = null;
  const pageAnim = (a) => { const t = a.effect?.target; return Boolean(t) && t.getRootNode() !== root; };
  const freeze = () => {
    for (const a of document.getAnimations()) {
      if (!pageAnim(a) || a.playState !== 'running') continue;
      a.pause();
      S.paused.anims.add(a);
    }
    for (const v of document.querySelectorAll('video')) {
      if (v.paused) continue;
      v.pause();
      S.paused.videos.add(v);
    }
  };
  pauseBtn.addEventListener('click', () => {
    if (S.paused) {
      clearInterval(S.paused.timer);
      for (const a of S.paused.anims) a.play();
      for (const v of S.paused.videos) v.play().catch(() => {});
      S.paused = null;
    } else {
      S.paused = { anims: new Set(), videos: new Set(), timer: setInterval(freeze, 100) };
      freeze();
    }
    pauseBtn.textContent = S.paused ? 'play motion' : 'pause motion';
    pauseBtn.setAttribute('aria-pressed', String(Boolean(S.paused)));
  });
  showDoneBtn.addEventListener('click', () => {
    S.showDone = !S.showDone;
    store.set('lab-show-done', S.showDone ? '1' : '');
    render();
  });
  newNext.addEventListener('click', () => stepNew(1));
  // Option-click (or Option-drag) with comments hidden still pins: comments come back with the new one.
  const showAgain = () => {
    if (S.on) return;
    S.on = true;
    store.set('lab-on', '1');
  };
  copyBtn.addEventListener('click', () => copy(agentLink(), copyBtn));
  // The list opens on "new" each time.
  listBtn.addEventListener('click', () => (LIST_WINDOW ? ((S.listOpen = !S.listOpen), S.listOpen && (S.filter = 'new'), (S.chatOpen = false), (hint.hidden = true), render()) : stepNew(1)));
  listEl.querySelector('.x').addEventListener('click', () => slideAway(listEl, () => ((S.listOpen = false), render())));
  chatBtn.addEventListener('click', () => {
    S.chatOpen = !S.chatOpen;
    S.listOpen = false;
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
  for (const b of /** @type {NodeListOf<HTMLElement>} */ (listEl.querySelectorAll('[data-f]'))) b.addEventListener('click', () => ((S.filter = b.dataset.f), drawList()));
  holdBtn.addEventListener('click', () => (store.set('lab-hold', drafting() ? '' : '1'), drawList()));
  sendBtn.addEventListener('click', async () => {
    const list = held();
    for (let i = 0; i < list.length; i++) {
      try {
        const { comment, edit } = await send(list[i]);
        if (edit) store.set(`lab-edit:${comment.id}`, edit);
        S.comments.push(comment);
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
    if (S.gone) return;
    const inOtherWidget = document.activeElement?.localName.includes('-') && document.activeElement !== host; // e.g. an input in a closed shadow root
    if ((e.key === 'm' || e.key === 'M' || e.code === 'KeyM') && !e.metaKey && !e.ctrlKey && !e.altKey && !e.repeat && !typing(e) && !inOtherWidget) {
      e.preventDefault();
      setOn(!S.on);
      return;
    }
    // Control-D goes to the next new comment from anywhere, the reply box too (plain D types a letter there); Shift: back.
    if (S.on && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && (/^z$/i.test(e.key || '') || (!/^[a-z]$/i.test(e.key || '') && e.code === 'KeyZ')) && !typing(e) && !inOtherWidget && placed.length) {
      e.preventDefault();
      return void undoLast();
    }
    if (S.on && e.ctrlKey && !e.metaKey && !e.altKey && e.code === 'KeyD' && !(typing(e) && !e.composedPath().includes(host))) {
      e.preventDefault();
      // Words typed in a reply box aren't thrown away: it nudges instead, send or clear them first.
      const typed = /** @type {HTMLTextAreaElement | null} */ (root.querySelector('.card textarea, .float textarea'));
      if (typed?.value.trim()) return typed.closest('.card, .float')?.animate([{ transform: 'none' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'none' }], { duration: 260 });
      return stepNew(e.shiftKey ? -1 : 1);
    }
    // 1 comment, 2 go (like picking a tool); V still switches between them.
    if (S.on && /^(Digit|Numpad)[123]$/.test(e.code || '') && !e.metaKey && !e.ctrlKey && !e.altKey && !e.repeat && !typing(e) && !inOtherWidget) {
      e.preventDefault();
      if (e.code.endsWith('3')) setCursor(true);
      else setGo(e.code.endsWith('2'));
      return;
    }
    // The list's keys, with comments shown and nothing typed: L list, C chat, J/K next/previous, R reply, E resolve.
    // By the key's place, not its letter, so the keys work with any layout (Russian, Greek…): the C key is C.
    // The letter typed when it's Latin (QWERTZ and AZERTY move letters), else the key's place (Cyrillic and others).
    const letter = /^[a-z]$/i.test(e.key || '') ? e.key.toLowerCase() : /^Key[A-Z]$/.test(e.code || '') ? e.code.slice(3).toLowerCase() : '';
    // The keys (Leo, 2026-11-15), marked in the bar's words: (c)hat, ne(w) (Shift-W: the one before), 1 comment, 2 go,
    // 3 cursor, M hide, D show/hide done. With a thread open: R reply, E resolve.
    if (S.on && !typing(e) && !inOtherWidget && !e.metaKey && !e.ctrlKey && !e.altKey && !e.repeat && /^[cwredp]$/.test(letter)) {
      const k = letter;
      e.preventDefault();
      if (k === 'p') return pauseBtn.click();
      if (k === 'c') return chatBtn.click();
      if (k === 'w') return stepNew(e.shiftKey ? -1 : 1);
      if (k === 'd') return showDoneBtn.click();
      if (k === 'r' && S.openId) /** @type {HTMLElement | null} */ (root.querySelector('.card textarea'))?.focus({ preventScroll: true });
      else if (k === 'e' && S.openId && S.isAdmin) [.../** @type {NodeListOf<HTMLElement>} */ (root.querySelectorAll('.card .btn'))].find((b) => /^(resolve|reopen)$/.test(b.textContent))?.click();
      return;
    }
    // Escape closes the top one: a thread or new comment first, then the chat, then the list (typed chat text stays).
    if (e.key === 'Escape' && (S.draft || S.openId)) {
      S.draft = null;
      S.openId = null;
      render();
    } else if (e.key === 'Escape' && (S.chatOpen || S.listOpen)) {
      if (S.chatOpen) S.chatOpen = false;
      else S.listOpen = false;
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
  const control = (t) => {
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
  const paintZone = () => {
    S.zoneFrame = 0;
    if (!S.drag?.active || !S.liveZone) return;
    const x = Math.min(S.drag.x0, S.drag.x1) + scrollX;
    const y = Math.min(S.drag.y0, S.drag.y1) + scrollY;
    S.liveZone.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    S.liveZone.style.width = `${Math.abs(S.drag.x1 - S.drag.x0)}px`;
    S.liveZone.style.height = `${Math.abs(S.drag.y1 - S.drag.y0)}px`;
  };
  // An open new-comment box with nothing typed in it doesn't block drawing an area (a stray click had opened one, and
  // every drag after it silently did nothing until it was closed); one with words in it does, so they aren't lost.
  const draftHasText = () => Boolean(S.draft) && [.../** @type {NodeListOf<HTMLTextAreaElement>} */ (root.querySelectorAll('.float textarea'))].some((t) => t.value.trim());
  function startDrag(e) {
    // An open card doesn't block a new area: it closes once the area is drawn (a plain click still just closes it).
    if ((!S.on && !e.altKey) || (S.cursorMode && !e.altKey) || draftHasText() || e.button !== 0 || e.pointerType === 'touch' || e.metaKey || e.ctrlKey || e.shiftKey) return;
    if (e.composedPath().includes(host)) return;
    if (!e.altKey && control(e.target)) return;
    if (e.target instanceof Element && e.target.closest(OFF)) return;
    S.drag = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY, active: false };
  }
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (e.altKey) return; // Option presses are taken earlier (see optionPress)
      // An open card doesn't block a new area: it closes once the area is drawn (a plain click still just closes it).
      if ((!S.on && !e.altKey) || (S.cursorMode && !e.altKey) || draftHasText() || e.button !== 0 || e.pointerType === 'touch' || e.metaKey || e.ctrlKey || e.shiftKey) return;
      if (e.composedPath().includes(host)) return;
      if (!e.altKey && control(e.target)) return;
      if (e.target instanceof Element && e.target.closest(OFF)) return;
      S.drag = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY, active: false };
    },
    true,
  );
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
    // A thin drag (a line of text, a small icon) still makes an area: it grows to at least 12 px each way around its middle,
    // instead of silently doing nothing.
    for (const [a, b] of [['x0', 'x1'], ['y0', 'y1']]) {
      if (Math.abs(d[b] - d[a]) >= 12) continue;
      const mid = (d[a] + d[b]) / 2;
      d[a] = mid - 6;
      d[b] = mid + 6;
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
  // and buttons too (the phone's Option-click). Text selected the phone's way gets a "Comment" chip that pins on it.
  S.lastTouch = 0;
  S.pinnedByHold = false; // a hold just made a pin: the lift that ends it puts the cursor in its box (phones open the keyboard only then)
  const selChip = /** @type {HTMLElement} */ (root.querySelector('.sel-chip'));
  const scrim = /** @type {HTMLElement} */ (root.querySelector('.scrim'));
  // The open sheet (phones): a thread, a new comment, the list or the chat.
  /** @returns {HTMLElement | null} */
  const openSheet = () => root.querySelector('.card:not(.out), .float:not(.out)') || (S.listOpen ? listEl : S.chatOpen ? chatEl : null);
  const closeAll = () => {
    S.draft = null;
    S.openId = null;
    S.listOpen = false;
    S.chatOpen = false;
    render();
  };
  // Text typed in a thread or a new comment would be lost, so the sheet stays and nudges instead; the chat's box keeps
  // its text when closed, so the chat always closes.
  const closeOrNudge = () => {
    const node = openSheet();
    if (![...root.querySelectorAll('textarea')].some((t) => t.value.trim() && !chatEl.contains(t))) return slideAway(node, closeAll);
    node?.animate?.([{ transform: 'none' }, { transform: 'translateY(12px)' }, { transform: 'none' }], { duration: 260, easing: 'ease-out' });
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
  swipeDown(listEl, () => ((S.listOpen = false), render()));
  swipeDown(chatEl, () => ((S.chatOpen = false), render()), true);
  S.press = null;
  const stopPress = () => S.press && (clearTimeout(S.press.timer), (S.press = null));
  document.addEventListener(
    'pointerdown',
    (e) => {
      stopPress();
      S.pinnedByHold = false;
      if (e.pointerType === 'touch') S.lastTouch = Date.now();
      if (e.pointerType !== 'touch' || S.draft || !(e.target instanceof Element) || e.composedPath().includes(host) || e.target.closest(OFF)) return;
      const { clientX: x, clientY: y } = e;
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
    if (S.pinnedByHold) /** @type {HTMLElement | null} */ (root.querySelector('.float [data-first]') || root.querySelector('.float textarea'))?.focus({ preventScroll: true });
  }, true);
  // The lift after a hold: no click follows it (it would land on the dimmed page and take the cursor away), and the
  // touch's own end puts the cursor in the box, so the phone opens its keyboard.
  document.addEventListener('touchend', (e) => {
    if (!S.pinnedByHold) return;
    S.pinnedByHold = false;
    e.preventDefault();
    /** @type {HTMLElement | null} */ (root.querySelector('.float [data-first]') || root.querySelector('.float textarea'))?.focus({ preventScroll: true });
  }, { capture: true, passive: false });
  document.addEventListener('pointercancel', stopPress, true);
  addEventListener('scroll', stopPress, { passive: true, capture: true });
  document.addEventListener('contextmenu', (e) => (S.press || S.afterDrag) && e.preventDefault(), true);
  S.selRect = null;
  document.addEventListener('selectionchange', () => {
    const sel = getSelection?.();
    const range = sel?.rangeCount && sel.getRangeAt(0);
    const text = String(sel || '').trim();
    const inside = range && host.contains(range.commonAncestorContainer);
    S.selRect = coarse && S.on && !S.draft && text && range && !inside ? range.getClientRects()[0] || range.getBoundingClientRect() : null;
    selChip.hidden = !S.selRect;
    if (!S.selRect) return;
    const below = S.selRect.bottom + 52 < innerHeight;
    selChip.style.left = `${Math.min(Math.max(S.selRect.left + S.selRect.width / 2, 60), innerWidth - 60)}px`;
    selChip.style.top = `${below ? S.selRect.bottom + 10 : Math.max(S.selRect.top - 46, 8)}px`;
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
    selChip.hidden = true;
    showAgain();
    S.openId = null;
    begin(anchor);
    return true;
  };
  selChip.addEventListener('click', (e) => {
    e.stopPropagation();
    if (S.selRect) commentOnSelection();
  });
  // Computers: Shift + drag selects words (a plain drag marks an area); letting go opens a comment on them.
  document.addEventListener('mouseup', (e) => {
    if (S.on && !S.cursorMode && !S.draft && e.shiftKey && e.button === 0 && !e.composedPath().includes(host)) setTimeout(commentOnSelection, 0);
  }, true);
  function onPageClick(e) {
    if (e.composedPath().includes(host)) return;
    if (S.draft || S.openId) {
      if ([...root.querySelectorAll('textarea')].some((t) => t.value.trim())) return; // typed text stays; Escape discards it
      S.draft = null;
      S.openId = null;
      render();
      return;
    }
    if ((!S.on && !e.altKey) || (S.cursorMode && !e.altKey) || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
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
    const list = threads().filter((c) => c.anchor?.kind !== 'page');
    if (!S.on || S.openId || list.length !== pinsById.size) return render();
    const places = list.map((c) => [pinsById.get(c.id), position(c.anchor || {})]);
    if (places.some(([pin]) => !pin)) return render();
    for (const [pin, { left, top, moved }] of places) {
      pin.style.left = `${left}px`;
      pin.style.top = `${top}px`;
      pin.classList.toggle('moved', Boolean(moved));
    }
  };
  S.frame = 0;
  const reflow = () => {
    cancelAnimationFrame(S.frame);
    S.frame = requestAnimationFrame(() => {
      // Keep an open composer's text: only re-place when nothing is being typed.
      if (S.draft || root.activeElement || S.grabbing) return;
      movePins();
    });
  };
  addEventListener('resize', reflow);
  addEventListener('scroll', (e) => e.target !== document && !host.contains(/** @type {Node} */ (e.target)) && reflow(), { capture: true, passive: true });

  // Client-side navigation (pushState, back/forward, Astro view transitions): comments follow the new page,
  // and the layer comes back if the page swapped out <body>.
  const navigated = () => {
    if (S.gone) return;
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
  // It looks like your own pin: the white teardrop with your initial (a + before you've given a name). Go mode's is
  // the same shape in green with a white tick. Both point (bottom left) where the click lands.
  // Drawn once into PNGs (1x and 2x): browsers re-decode SVG pointers when the pointer changes, which flickers (Safari
  // most); a PNG pointer stays put. The SVG one shows only for the moment before the PNGs are ready.
  const pinCursorStyle = document.createElement('style');
  // The pointer itself is drawn (an element styled with CSS that follows the mouse), not an image: so it changes
  // smoothly, the pin turning green with a tick for go, and fading out where the system pointer takes over (links,
  // fields, the widget, Shift). Mice only; touch and pens keep what they had.
  const ptr = el('div', { class: 'ptr', 'aria-hidden': 'true' });
  ptr.append(el('span', { class: 'ini' }, '+'), el('span', { class: 'tick' }, 'go'));
  root.append(ptr);
  // It shows exactly where the system pointer is hidden (cursor: none from the rules above): never two pointers, never
  // none. That's checked on every move, and again when the page scrolls under a still mouse, Shift or Option is pressed,
  // or go or comments are switched.
  S.mouse = null; // the last mouse position
  const place = (x, y, target) => {
    const show = Boolean(target) && target !== host && !host.contains(target) && getComputedStyle(target).cursor === 'none';
    ptr.classList.toggle('show', show);
    ptr.classList.toggle('go', S.goMode);
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
      document.documentElement.classList.toggle('lab-ctl', !host.contains(/** @type {Node} */ (t)) && t !== host && control(t));
    }
    place(e.clientX, e.clientY, t instanceof Element ? t : null);
  }, { capture: true, passive: true });
  addEventListener('scroll', recheck, { capture: true, passive: true });
  addEventListener('keydown', (e) => (e.key === 'Shift' || e.key === 'Alt') && recheck(), true);
  addEventListener('keyup', (e) => (e.key === 'Shift' || e.key === 'Alt') && recheck(), true);
  document.documentElement.addEventListener('mouseleave', () => ((S.mouse = null), ptr.classList.remove('show')));
  addEventListener('blur', () => ((S.mouse = null), ptr.classList.remove('show')));
  // No pictures: where the drawn pin can't show (an open dialog or full screen draws above it, or before the mouse first
  // moves) the system pointer is a plain crosshair for comments and the copy arrow for go.
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
      `@layer lab-pointer { html.lab-pinning:not(.lab-shift, .lab-ctl) body, html.lab-pinning:not(.lab-shift, .lab-ctl) body *${plain} { cursor: crosshair; } ` +
      // With the drawn pointer the system one hides over plain parts of the page (not in the top layer, which is above it).
      `html.lab-drawn.lab-pinning:not(.lab-shift, .lab-ctl):not(.lab-dragging) body, html.lab-drawn.lab-pinning:not(.lab-shift, .lab-ctl):not(.lab-dragging) body *${plain}:not(${top}) { cursor: none; } ` +
      // The pointer is inherited, so places that aren't commented on name theirs: editable text a text cursor, a part
      // marked data-uncommentable the plain arrow (a pin pointer there would promise a comment that won't come).
      `html.lab-pinning body :is([contenteditable], [contenteditable] *) { cursor: text; } html.lab-pinning body :is(${OFF}, ${OFF} *) { cursor: auto; } }` +
      // Holding Option (Alt) pins links and controls too: the drawn pin shows over them (the system pointer hides).
      `html.lab-alt body, html.lab-alt body *:not([data-lab-comments], [data-lab-comments] *, ${OFF}, ${OFF} *) { cursor: crosshair !important; }` +
      `html.lab-drawn.lab-alt body, html.lab-drawn.lab-alt body *:not([data-lab-comments], [data-lab-comments] *, ${OFF}, ${OFF} *, ${top}) { cursor: none !important; }` +
      `html.lab-go:not(.lab-drawn) body, html.lab-go:not(.lab-drawn) body * { cursor: copy !important; }`;
  }
  // Computers, comments on: a click or drag doesn't select the page's text; hold Shift to select (and quote) words.
  // Fields and editable text stay selectable.
  fonts.textContent += `@media (pointer: fine) { html.lab-pinning:not(.lab-shift) body > :not([data-lab-comments]), html.lab-pinning:not(.lab-shift) body > :not([data-lab-comments]) :not(input, textarea, select, [contenteditable], [contenteditable] *) { -webkit-user-select: none; user-select: none; } }`;
  // Letting go of Shift keeps text selectable a moment longer, so a selection made with it isn't dropped before its
  // comment opens.
  /** @type {any} */
  S.shiftOff = 0;
  const shiftKey = (e) => {
    clearTimeout(S.shiftOff);
    if (e.shiftKey) document.documentElement.classList.add('lab-shift');
    else S.shiftOff = setTimeout(() => (document.documentElement.classList.remove('lab-shift'), recheck()), 400);
  };
  addEventListener('keydown', shiftKey, true);
  addEventListener('keyup', shiftKey, true);
  // A press without Shift is never a selection: drop the Shift state at once, not 400 ms later (a click right after typing
  // a capital letter, or after a screenshot shortcut, used to select the page's text).
  addEventListener('pointerdown', (e) => {
    if (e.shiftKey) return shiftKey(e);
    clearTimeout(S.shiftOff);
    document.documentElement.classList.remove('lab-shift');
  }, true);
  addEventListener('blur', () => document.documentElement.classList.remove('lab-shift'));
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
    if (S.on) showHint();
    document.body.append(host);
    // The page's own selection while commenting, and the quoted words of an open text comment.
    // A soft green, so the quoted words stay readable in the page's own colour, on light and dark pages.
    const paint = 'background-color: rgba(52, 199, 89, .3); color: inherit;';
    fonts.textContent += `html.lab-pinning ::selection { ${paint} } ::highlight(lab-quote) { ${paint} }`;
    load();
  };
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
  startLive();
})();
