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

(() => {
  const script = /** @type {HTMLScriptElement | null} */ (document.currentScript);
  const labHost = script?.dataset.host || (script?.src ? new URL(script.src, location.href).hostname : location.hostname);
  const enabled = location.hostname === labHost || script?.dataset.enable === 'always';
  if (!enabled || /** @type {any} */ (window).__labComments) return;
  /** @type {any} */ (window).__labComments = true;

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
  let closeFast = false; // the next redraw that closes a comment fades it out quickly instead of sliding it
  let cardFull = false; // a comment pulled up to full height (the card is drawn anew on each redraw)
  let draft = null; // { anchor, docX, docY }

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
    <div class="hint" role="status" hidden>click to comment · drag to mark an area · shift-drag to quote words · c chat · w new · 1 comment · 2 go · 3 cursor · m hide</div>
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
  // The list window is parked (Leo, 2026-11-15): new comments are stepped through with ‹ N new › in the bar, and
  // done pins are shown or hidden with a pill there. Its code stays; LIST_WINDOW brings it back.
  const LIST_WINDOW = false;
  const tabTitle = { base: '' };
  let showDone = store.get('lab-show-done') === '1';
  const newNext = $('.new-next');
  const sendBtn = $('.send-all');
  const listEl = $('.list');
  const holdBtn = $('.hold', listEl);
  const chatEl = $('.chatwin');
  const chatBtn = /** @type {HTMLElement} */ (root.querySelector('.chat-btn'));
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

  // ---------- anchoring (src/widget/anchoring.ts) ----------
  bindAnchoring({ host, layer, el, store });

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
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      comments = data.comments || [];
      isAdmin = Boolean(data.admin);
      loaded = true;
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
      url.search = String(new URLSearchParams({ page, since: String(since) }));
      const res = await fetch(url, { cache: 'no-store' });
      const data = res.ok ? await res.json() : { full: true };
      if (data.full || !loaded) return load();
      const gone = new Set(data.del);
      const fresh = new Map(data.set.map((c) => [c.id, c]));
      comments = comments.filter((c) => !gone.has(c.id)).map((c) => fresh.get(c.id) || c);
      const had = new Set(comments.map((c) => c.id));
      for (const c of data.set) if (!had.has(c.id)) comments.push(c);
      comments.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    } catch {
      return load();
    }
    shownAgain();
  }
  function shownAgain() {
    if (!typed() && !grabbing) render();
    // Someone is in a box: the open thread gets its new replies in place, the chat its new messages (its box is left
    // alone); everything else shows on the next render.
    else {
      if (openCard?.isConnected) openCard.sync();
      if (chatOpen) drawChat();
      drawList(); // the bar's counts and the tab's "(3)" keep up even while a box has the cursor (a tab left in the background)
    }
  }

  // Go mode (V): every new spot (a click, a drawn area, selected words, a hold on phones) is posted at once as "go",
  // approving what it's on, with no box to type in. In draft mode go pins wait with the other drafts.
  let goMode = store.get('lab-go') === '1';
  // Cursor (3): pins stay shown, but a click is the page's own (follow a link, try a button): nothing is pinned.
  // Option-click still pins. 1 comment and 2 go leave it.
  let cursorMode = store.get('lab-cursor') === '1';
  // Switching only changes the button and the pointer: nothing on the page is redrawn, so nothing flickers.
  const setCursor = (v) => {
    cursorMode = v;
    store.set('lab-cursor', v ? '1' : '');
    goBtn.classList.toggle('cursor', v);
    goBtn.classList.toggle('on', goMode && !v); // cursor replaces go's green at once
    goFace();
    document.documentElement.classList.toggle('lab-pinning', on && !v);
    document.documentElement.classList.toggle('lab-go', on && goMode && !v);
    recheck();
  };
  const setGo = (v) => {
    if (cursorMode) setCursor(false);
    goMode = v;
    queueMicrotask(goFace);
    store.set('lab-go', v ? '1' : '');
    goBtn.classList.toggle('on', v);
    goBtn.setAttribute('aria-pressed', String(v && !cursorMode));
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
  // Sent once the lab answers: while it can't be reached (restarting, the laptop just woke), the message waits and is
  // tried again every 2 s for up to 5 minutes, instead of failing. Only a lab that answers with an error fails it.
  async function send(payload) {
    let res = null;
    // A new comment or reply carries a nonce, so a retry after a lost answer can't save it twice.
    if (!payload.action && !payload.nonce) payload = { ...payload, nonce: Math.random().toString(36).slice(2) + Date.now().toString(36) };
    for (let tries = 0; !res; tries++) {
      try {
        res = await fetch(API, { method: 'POST', headers: headers(), body: JSON.stringify({ page, ...payload }) });
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
    const c = id && comments.find((x) => x.id === id);
    if (!c) return;
    const ownKey = store.get(`lab-edit:${id}`);
    try {
      if (isAdmin) {
        await send({ action: 'delete', id });
        comments = comments.filter((x) => x.id !== id && x.parent !== id);
      } else if (ownKey) {
        const { comment } = await send({ action: 'resolve', id, edit: ownKey });
        Object.assign(c, comment);
      } else return void placed.push(id);
    } catch {
      return void placed.push(id); // not taken back: it stays next in line
    }
    if (openId === id) openId = null;
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
  const threads = () => comments.filter((c) => !c.parent);
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
    // A pin near the page's end can't scroll up into the free part above a phone's sheet: the page gets room below its
    // end while the sheet is open (it went behind the sheet before).
    if (coarse) {
      const de = document.documentElement;
      const had = parseFloat(de.style.getPropertyValue('--lab-room')) || 0;
      const room = Math.max(0, Math.ceil(top + innerHeight - (de.scrollHeight - had)));
      de.style.setProperty('--lab-room', `${room}px`);
      de.classList.toggle('lab-room', room > 0);
    }
    scrollTo({ top: Math.max(0, top), behavior: still.matches ? 'auto' : 'smooth' });
  };
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
    const inMenu = on ? [doneBtn, copyBtn, toggleBtn] : [];
    for (const b of inMenu) if (b.parentNode !== moreMenu) moreMenu.append(b);
    if (!on && toggleBtn.parentNode !== bar) bar.insertBefore(toggleBtn, moreBtn);
    if (!on) root.querySelector('.left').append(copyBtn);
    moreBtn.hidden = !on;
    if (!on && !moreMenu.hidden) setMenu(false);
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
    if (gp) gp.textContent = !goMode && !cursorMode ? initial(store.get('lab-name')) || '+' : 'go';
    // Read out as what a click places, not the letter on it.
    goBtn.setAttribute('aria-label', `a click places: ${cursorMode ? 'nothing (cursor)' : goMode ? 'go' : 'a comment'}`);
    goBtn.setAttribute('aria-keyshortcuts', '1 2 3');
  }
  function drawList() {
    const all = threads();
    listBtn.hidden = !on || (!coarse && !all.length && !held().length); // on phones it carries the agent's light
    goBtn.hidden = !on;
    if (!goBtn.firstElementChild) goBtn.replaceChildren(el('span', { class: 'gp' }, 'go'), el('kbd', { 'aria-hidden': 'true' }, '1/2/3'));
    goFace();
    goBtn.classList.toggle('on', goMode && !cursorMode);
    goBtn.classList.toggle('cursor', cursorMode);
    goBtn.setAttribute('aria-pressed', String(goMode && !cursorMode));
    const freshAll = all.filter((c) => !isPage(c)).reduce((n, c) => n + unread(c).length, 0); // a new message in a done thread counts too
    listBtn.replaceChildren(document.createTextNode(freshAll ? `list · ${freshAll} new` : 'list'), el('kbd', { 'aria-hidden': 'true' }, 'l'));
    // ‹ › around it step through the new ones, top to bottom of the page, without opening the list.
    newPrev.hidden = newNext.hidden = !on || !all.some((c) => !isPage(c) && unread(c).length);
    if (!LIST_WINDOW) {
      // Without the list window the middle shows how many are new (a click goes to the next one). The pills keep their
      // place whatever the counts: with nothing new or done they stay, quiet and disabled, so nothing in the bar moves.
      newPrev.hidden = newNext.hidden = true; // no arrows: the pill itself goes to the next new one (J / K step both ways)
      listBtn.hidden = !on;
      {
        listBtn.replaceChildren(coarse ? 'new' : keyWord('ne', 'w', ''), el('b', { class: `cnt${freshAll ? '' : ' zero'}` }, String(freshAll))); // phones: no keys
        listBtn.setAttribute('aria-label', `next new comment, ${freshAll} new`);
        listBtn.setAttribute('aria-keyshortcuts', 'w');
      }
      listBtn.title = 'next new comment: W, or Control-D while typing (Shift for the one before)';
      listBtn.disabled = !freshAll;
      listBtn.classList.toggle('quiet', !freshAll);
      const doneCount = all.filter((c) => !isPage(c) && (c.resolved || workState(c)[0] === 'done') && !unread(c).length).length;
      doneBtn.hidden = !on;
      doneBtn.disabled = !doneCount && !showDone;
      doneBtn.classList.toggle('quiet', doneBtn.disabled);
      doneBtn.replaceChildren(showDone ? `hide done · ${doneCount}` : `show done · ${doneCount}`, el('kbd', { 'aria-hidden': 'true' }, 'd'));
      doneBtn.setAttribute('aria-keyshortcuts', 'd');
    }
    placeBar();
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
    for (const b of /** @type {NodeListOf<HTMLElement>} */ (listEl.querySelectorAll('[data-f]'))) b.classList.toggle('on', b.dataset.f === filter);
    const fresh = all.filter((c) => !isPage(c) && unread(c).length).length; // chat messages count in the chat
    listEl.querySelector('[data-f="new"]').textContent = fresh ? `new · ${fresh}` : 'new';
    // Just new and open for now; work, resolved, mine and draft mode stay in the code, hidden.
    for (const f of ['work', 'resolved', 'mine']) $(`[data-f="${f}"]`, listEl).hidden = true;
    holdBtn.hidden = !DRAFT_MODE;
    const doneCount = all.filter((c) => !isPage(c) && (c.resolved || workState(c)[0] === 'done') && !unread(c).length).length;
    showDoneBtn.hidden = !doneCount;
    showDoneBtn.textContent = showDone ? `hide done · ${doneCount}` : `show done · ${doneCount}`;
    holdBtn.classList.toggle('on', drafting());
    if (filter === 'work') return listEl.querySelector('.items').replaceChildren(...workItems());
    const items = listed().map((c) => {
      const b = el('button', { class: `it${openId === c.id ? ' cur' : ''}`, type: 'button' });
      b.append(document.createTextNode(`${c.resolved ? '✓' : numberOf(c)}  ${c.text.replace(/\s+/g, ' ').slice(0, 70)} `), ...(onWhat(c) ? [el('span', {}, `on ${onWhat(c)} `)] : []), el('span', {}, `· ${c.name}${!c.resolved && isDone(c) ? ' · ✅ done' : ''}`), ...(unread(c).length ? [' ', el('span', { class: 'tag' }, `${unread(c).length} new`)] : []));
      b.addEventListener('click', () => goTo(c));
      return b;
    });
    listEl.querySelector('.items').replaceChildren(...(items.length ? items : [el('div', { class: 'none' }, 'nothing here')]));
  }
  // The work tab: what the agent is on now (handed to it, not answered yet, or answered "On it"), what's next (sent,
  // not handed yet) and what's done today (resolved, or answered "Done"), from what the lab records on each thread.
  const ago = (iso) => {
    const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    return m < 1 ? 'just now' : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
  };
  // A thread's state for the agent: ['now' | 'next' | 'done' | null, since when].
  const workState = (c) => {
    const thread = [c, ...repliesOf(c.id)];
    const lastPerson = thread.filter((m) => !m.session).map((m) => m.createdAt).sort().at(-1) || '';
    const answer = thread.filter((m) => m.session).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).at(-1);
    const answered = answer && answer.createdAt > lastPerson;
    if (c.resolved || (answered && /^done\b/i.test(answer.text))) return ['done', answered ? answer.createdAt : c.createdAt];
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
  // The time and its mark sit pinned in the bubble's bottom-right corner, as WhatsApp and Telegram do: an invisible
  // copy at the end of the last line keeps room for it there, so it shares that line when it fits and gets a line of
  // its own when it doesn't. Smaller than the words, it sits a touch below their line: a stamp on the bubble.
  const stamped = (bubble, stamp) => {
    const room = stamp.cloneNode(true);
    room.className = 'stamp-room';
    room.setAttribute('aria-hidden', 'true');
    for (const n of room.querySelectorAll('[role]')) n.removeAttribute('role');
    const last = [...bubble.children].reverse().find((n) => n.classList?.contains('p'));
    (last || bubble).append(room);
    bubble.append(stamp);
  };
  const stampOf = (m, root, prefix = '') => {
    const at = new Date(m.createdAt);
    const time = at.toDateString() === new Date().toDateString() ? at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : at.toLocaleDateString([], { day: 'numeric', month: 'short' });
    const stamp = el('span', { class: 'stamp' });
    stamp.append(el('span', { class: 'tm' }, prefix + time));
    if (mine(m) && !m.session) {
      const thread = root ? [root, ...repliesOf(root.id)] : [m];
      const answered = thread.some((x) => x.session && x.createdAt > m.createdAt);
      const latest = !thread.some((x) => !x.session && x.createdAt > m.createdAt);
      // The agent is on this very message (its newest one in the thread): the ring, as on the pin. Answered: green ✓.
      if (!answered && latest && root && workState(root)[0] === 'now') {
        stamp.classList.add('busy');
        stamp.append(el('span', { class: 'ring', role: 'img', 'aria-label': 'the agent is on it' }));
      } else if (answered) {
        stamp.classList.add('ans');
        stamp.append(el('span', { class: 'tick', role: 'img', 'aria-label': 'answered' }, '✓'));
      } else {
        const got = root?.handedAt && root.handedAt >= m.createdAt;
        stamp.append(el('span', { class: `tick${got ? ' got' : ''}`, role: 'img', 'aria-label': got ? 'delivered to the agent' : 'sent' }, got ? '✓✓' : '✓'));
      }
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
    // "chat" with a count (kept in place, grey 0, when there's nothing new); phones the same, without the key letter.
    {
      chatBtn.replaceChildren(coarse ? 'chat' : keyWord('', 'c', 'hat'), el('b', { class: `cnt${fresh ? '' : ' zero'}` }, String(fresh)));
      chatBtn.setAttribute('aria-label', `chat, ${fresh} new`);
      chatBtn.setAttribute('aria-keyshortcuts', 'c');
    }
    chatBtn.classList.toggle('has-new', fresh > 0);
    placeBar(); // the chat button may have just shown: the segment lines follow
    const opening = chatEl.hidden;
    chatEl.hidden = !on || !chatOpen;
    if (chatEl.hidden) chatEl.classList.remove('full'); // opens at its lower height again
    if (chatEl.hidden && chatEl.contains(root.activeElement)) /** @type {HTMLElement} */ (root.activeElement).blur(); // a closed chat keeps no focus, so keys work again
    if (chatEl.hidden) return;
    const box = $('.msgs', chatEl);
    // Opens at the newest; later it follows new messages only while you're at the bottom, not while you read back.
    const atEnd = opening || box.scrollHeight - box.scrollTop - box.clientHeight < 48;
    const before = new Set(opening ? [] : [.../** @type {HTMLCollectionOf<HTMLElement>} */ (box.children)].map((n) => n.dataset.id));
    // A message already on screen that hasn't changed keeps its own node: a redraw for one new message used to rebuild
    // every bubble (a phone showed the chat blink as messages arrived).
    const kept = new Map([.../** @type {HTMLCollectionOf<HTMLElement>} */ (box.children)].filter((n) => n.dataset.id).map((n) => [n.dataset.id, n]));
    const same = (n) => {
      const old = kept.get(n.dataset?.id);
      return old && old.outerHTML.replace(' fresh', '') === n.outerHTML ? old : n;
    };
    patchKids(box, msgs.flatMap((m) => {
      const root = m.parent ? byId.get(m.parent) : m;
      const b = el('div', { class: `msg${mine(m) && !m.session ? ' mine' : ''}${root && replyTo === root.id ? ' to' : ''}${before.size && !before.has(m.id) ? ' fresh' : ''}`, 'data-id': m.id, ...(agentOf(m) ? { 'data-agent': agentOf(m) } : {}) });
      // No done mark by the agent's name (Leo, 15 Nov): your own message's green ✓ already says it was answered, and a
      // "Done" answer closes the thread.
      b.append(nameLine(m.name, false));
      // A reply shows what it answers, as in Telegram: the name and the start of that message; a tap there jumps to it.
      if (m.parent && root) {
        const q = el('div', { class: 'quote' });
        q.append(el('b', {}, String(root.name || '').replace(/\s*·\s*session\s+\S+$/i, '')), document.createTextNode(root.text.replace(/\s+/g, ' ').slice(0, 90)));
        q.addEventListener('click', (e) => {
          e.stopPropagation();
          const box = $('.msgs', chatEl);
          const to = $(`[data-id="${root.id}"]`, box);
          if (!to) return;
          box.scrollTo({ top: to.offsetTop - box.offsetTop - 12, behavior: still.matches ? 'auto' : 'smooth' });
          to.animate?.([{ boxShadow: '0 0 0 2px rgb(52,199,89)' }, { boxShadow: '0 0 0 0 transparent' }], { duration: 900 });
        });
        b.append(q);
      }
      b.append(...readable(m.text));
      stamped(b, stampOf(m, root));
      return m.id === newFrom && m !== msgs[0] ? [el('div', { class: 'newline' }, 'new'), b] : [b];
    }).map(same));
    const strip = $('.replying', chatEl);
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
    chat.querySelector('textarea').placeholder = target ? 'reply' : 'message';
    if (atEnd) box.scrollTop = box.scrollHeight;
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
      shownAgain(); // typed text in an open box stays
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
    // Near the page's end a thread opens above its pin, so it doesn't make the page longer and push things down.
    const h = card.offsetHeight;
    const below = top + 10 + h > contentEnd();
    card.style.top = `${below ? Math.max(scrollY + 8, top - 40 - h) : top + 10}px`; // above: clear of the pin (28 px tall)
    card.style.transformOrigin = below ? '14px 100%' : '';
  }
  // Where the page's own content ends (not the pins' layer): see inPage().
  const contentEnd = () => {
    inPage(0);
    return pageEnd.y;
  };

  // The send arrow is drawn with CSS (a stem and a chevron), no picture.
  const ARROW = '<i class="arr" aria-hidden="true"></i>';

  // One field that grows: a pill while empty, a box with a divider and the name row once you type.
  function composer({ placeholder, onSubmit, autofocus = false }) {
    const wrap = el('div', { class: 'composer' });
    const box = el('div', { class: 'box' });
    // No autofill or suggestion bar on phones: a comment isn't a form to fill.
    const text = el('textarea', { placeholder, maxlength: '2000', rows: '1', 'aria-label': placeholder, enterkeyhint: 'send', autocomplete: 'off', autocorrect: 'off', spellcheck: 'false', writingsuggestions: 'false' });
    const who = el('label', { class: 'who' });
    const as = el('span', {}, 'as');
    const name = el('input', { type: 'text', placeholder: 'your name', maxlength: '60', enterkeyhint: 'send', autocomplete: 'off', autocorrect: 'off', autocapitalize: 'words', spellcheck: 'false', writingsuggestions: 'false', 'data-1p-ignore': '', 'data-lpignore': 'true' });
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
      error.classList.remove('wait');
      // Taking a while (the lab is restarting): say so; it goes as soon as the lab is back.
      const slow = setTimeout(() => {
        error.textContent = 'sending… it goes as soon as the lab is back';
        error.classList.add('wait');
      }, 1500);
      try {
        const result = await onSubmit(name.value.trim(), text.value.trim());
        clearTimeout(slow);
        error.textContent = '';
        error.classList.remove('wait');
        if (result?.keep) {
          text.value = '';
          sync();
        }
      } catch (e) {
        clearTimeout(slow);
        error.classList.remove('wait');
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
    const h = node.offsetHeight;
    const end = contentEnd();
    if (left + 36 + width <= right) {
      node.style.left = `${left + 36}px`;
      node.style.top = `${Math.min(top - 37, end - h - 8)}px`; // never past the page's end
    } else {
      node.style.left = `${Math.max(scrollX + 12, Math.min(left - 14, right - width))}px`;
      node.style.top = `${top + 10 + h > end ? Math.max(scrollY + 8, top - 40 - h) : top + 10}px`;
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
    const prev = /** @type {HTMLElement | null} */ (layer.querySelector('.card:not(.out), .float:not(.out)'));
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
      if (closeFast && !now && prev) {
        closeFast = false;
        prev.inert = true;
        layer.append(prev);
        const gone = () => prev.remove();
        if (still.matches || !prev.animate) gone();
        else prev.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, easing: 'ease-out', fill: 'forwards' }).finished.then(gone, gone);
      } else if (coarse && !now && shown && prev && !still.matches && !prev.style.transform) { // phones slide the sheet away; computers close at once, like the chat // not when it already slid away (phones)
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
      document.createTextNode((on ? 'hide comments' : open ? `comments · ${open}` : 'comments') + (!on && fresh ? ` · ${fresh} new` : '')),
      el('kbd', { 'aria-hidden': 'true' }, 'm'),
    );
    toggleBtn.classList.toggle('secondary', on);
    host.toggleAttribute('data-sheet', Boolean(on && (draft || openId || listOpen || chatOpen))); // phones: the sheet has the screen's bottom
    document.documentElement.classList.toggle('lab-sheet', host.hasAttribute('data-sheet'));
    backCloses();
    refit();
    document.documentElement.classList.toggle('lab-pinning', on && !cursorMode);
    document.documentElement.classList.toggle('lab-go', on && goMode && !cursorMode);
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
          class: `pin${/^go$/i.test(c.text.trim()) ? ' go' : ''}${c.resolved ? ' resolved' : ''}${state === 'done' ? ' done' : ''}${state === 'now' ? ' working' : ''}${news.length ? ' new' : ''}${moved ? ' moved' : ''}${posted === c.id ? ' in' : ''}${movable ? ' grab' : ''}${openId === c.id ? ' open' : ''}`,
          type: 'button',
          title: `${c.resolved ? '' : `${numberOf(c)} · `}${c.name}${moved ? ' · the spot it was pinned to has changed' : ''}${movable ? ' · drag to move' : ''}`,
          // Its state in words too (the ring, the tick and the new dot are only seen).
          'aria-label': `${/^go$/i.test(c.text.trim()) ? 'go' : 'comment'}${c.resolved ? '' : ` ${numberOf(c)}`} by ${c.name}${state === 'now' ? ', agent working on it' : state === 'done' || c.resolved ? ', done' : ''}${news.length ? `, ${news.length} new` : ''}${moved ? ', moved' : ''}`,
        },
        /^go$/i.test(c.text.trim()) ? 'go' : state === 'done' || c.resolved ? '✓' : initial(c.name),
      );
      if (state === 'now') pin.append(el('i', { class: 'ring', 'aria-hidden': 'true' }));
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
        // The reply box takes the cursor on a computer. Phones don't (no keyboard popping up over what you came to read,
        // Leo 15 Nov); a keyboard already up while stepping to the next one stays up.
        const card = threadCard(c, new Set(news.map((x) => x.id)), appear && (coarse ? keepKeys : !stepping || keepKeys));
        openCard = card;
        if (appear && !stepping) card.classList.add('in');
        if (prevHeight) card.style.minHeight = `min(${prevHeight}px, var(--_sheet-max))`;
        stepping = keepKeys = false;
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
        if (coarse && cardFull) card.classList.add('full'); // stays pulled up while you step from comment to comment
        swipeDown(card, () => ((openId = null), (cardFull = false), render()), true);
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
      const box = el('div', { class: `item msg${mine(item) && !item.session ? ' mine' : ''}`, 'data-id': item.id, ...(agentOf(item) ? { 'data-agent': agentOf(item) } : {}) });
      box.append(nameLine(item.name, false), ...readable(item.text));
      stamped(box, stampOf(item, c, item === c && !c.resolved ? `#${numberOf(c)} · ` : ''));
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
          // Resolving closes the comment at once, a quick fade where it is, not the slow slide down (Leo, 15 Nov).
          if (closing && openId === c.id) return (closeFast = true), (openId = null), render();
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
    }
    // Phones: step through the threads from the sheet (J and K on a keyboard).
    if (coarse) {
      // As on a computer: no prev / next, just new · N (the bar's ne(w), which the sheet covers) to the next pin with
      // something new, top to bottom of the page, further down first.
      const topOf = (x) => position(x.anchor || {}).top;
      const here = topOf(c);
      const fresh = threads().filter((x) => !isPage(x) && x.id !== c.id && unread(x).length).map((x) => [x, topOf(x)]);
      fresh.sort((p, q) => (p[1] > here ? 0 : 1) - (q[1] > here ? 0 : 1) || p[1] - q[1]);
      const nav = el('div', { class: 'row nav' });
      if (fresh.length) {
        const b = el('button', { class: 'btn', type: 'button' }, `new · ${fresh.length} ›`);
        b.addEventListener('pointerdown', (e) => e.preventDefault()); // an open keyboard stays open (see goTo)
        b.addEventListener('click', () => goTo(fresh[0][0]));
        nav.append(b);
      }
      // One row on phones: new on the left, reopen / delete on the right, at the top under the handle like a header, so
      // the reply box below stands alone as the chat's does (and the messages fade under it the same way).
      if (actions) nav.append(actions);
      if (nav.firstChild) card.insertBefore(nav, body);
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
          const added = itemEl(comment);
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
    chatOpen = false; // N new from the chat: the chat closes and the new comment opens
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
      if (draft && !/** @type {HTMLTextAreaElement | null} */ (root.querySelector('.float textarea'))?.value.trim()) draft = null;
    }
    hint.hidden = true;
    render();
    // Computers: the cursor goes in the message box (phones wait for a tap, so the keyboard doesn't cover the chat).
    if (chatOpen && !coarse) /** @type {HTMLElement | null} */ (chatEl.querySelector('.chat textarea'))?.focus({ preventScroll: true });
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
    // The widget's own buttons (N new, go, hide…) still do their thing; only a click on the page just closes. Their
    // bar is drawn again only after the click, or the button would be swapped out under it and the click lost.
    if (path.includes(host)) return void addEventListener('click', () => render(), { once: true });
    closingClick = true;
    render();
  }, true);
  addEventListener('click', (e) => {
    if (!closingClick) return;
    closingClick = false;
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);
  for (const b of /** @type {NodeListOf<HTMLElement>} */ (listEl.querySelectorAll('[data-f]'))) b.addEventListener('click', () => ((filter = b.dataset.f), drawList()));
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
    // Control-D goes to the next new comment from anywhere, the reply box too (plain D types a letter there); Shift: back.
    if (on && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && (/^z$/i.test(e.key || '') || (!/^[a-z]$/i.test(e.key || '') && e.code === 'KeyZ')) && !typing(e) && !inOtherWidget && placed.length) {
      e.preventDefault();
      return void undoLast();
    }
    if (on && e.ctrlKey && !e.metaKey && !e.altKey && e.code === 'KeyD' && !(typing(e) && !e.composedPath().includes(host))) {
      e.preventDefault();
      // Words typed in a reply box aren't thrown away: it nudges instead, send or clear them first.
      const typed = /** @type {HTMLTextAreaElement | null} */ (root.querySelector('.card textarea, .float textarea'));
      if (typed?.value.trim()) return typed.closest('.card, .float')?.animate([{ transform: 'none' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'none' }], { duration: 260 });
      return stepNew(e.shiftKey ? -1 : 1);
    }
    // 1 comment, 2 go (like picking a tool); V still switches between them.
    if (on && /^(Digit|Numpad)[123]$/.test(e.code || '') && !e.metaKey && !e.ctrlKey && !e.altKey && !e.repeat && !typing(e) && !inOtherWidget) {
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
    if (on && !typing(e) && !inOtherWidget && !e.metaKey && !e.ctrlKey && !e.altKey && !e.repeat && /^[cwred]$/.test(letter)) {
      const k = letter;
      e.preventDefault();
      if (k === 'c') return chatBtn.click();
      if (k === 'w') return stepNew(e.shiftKey ? -1 : 1);
      if (k === 'd') return showDoneBtn.click();
      if (k === 'r' && openId) /** @type {HTMLElement | null} */ (root.querySelector('.card textarea'))?.focus({ preventScroll: true });
      else if (k === 'e' && openId && isAdmin) [.../** @type {NodeListOf<HTMLElement>} */ (root.querySelectorAll('.card .btn'))].find((b) => /^(resolve|reopen)$/.test(b.textContent))?.click();
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
  // An open new-comment box with nothing typed in it doesn't block drawing an area (a stray click had opened one, and
  // every drag after it silently did nothing until it was closed); one with words in it does, so they aren't lost.
  const draftHasText = () => Boolean(draft) && [.../** @type {NodeListOf<HTMLTextAreaElement>} */ (root.querySelectorAll('.float textarea'))].some((t) => t.value.trim());
  function startDrag(e) {
    // An open card doesn't block a new area: it closes once the area is drawn (a plain click still just closes it).
    if ((!on && !e.altKey) || (cursorMode && !e.altKey) || draftHasText() || e.button !== 0 || e.pointerType === 'touch' || e.metaKey || e.ctrlKey || e.shiftKey) return;
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
      if ((!on && !e.altKey) || (cursorMode && !e.altKey) || draftHasText() || e.button !== 0 || e.pointerType === 'touch' || e.metaKey || e.ctrlKey || e.shiftKey) return;
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
  const selChip = /** @type {HTMLElement} */ (root.querySelector('.sel-chip'));
  const scrim = /** @type {HTMLElement} */ (root.querySelector('.scrim'));
  // The open sheet (phones): a thread, a new comment, the list or the chat.
  /** @returns {HTMLElement | null} */
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
  // A tap on the dimmed page closes the sheet; a pull on it moves the sheet with the finger (see swipeDown), and the
  // click that ends such a pull isn't a tap.
  let sheetDraggedAt = -1e9;
  scrim.addEventListener('click', () => performance.now() - sheetDraggedAt > 300 && closeOrNudge());
  scrim.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false }); // the page stays still behind it
  // Phones: a sheet slides down and away, the dim fading with it, then it closes.
  // After a swipe it goes on at the finger's speed (ms), so it doesn't stop and restart.
  function slideAway(node, close, ms = 0) {
    if (!coarse || !node || still.matches) return close();
    // With the keyboard up, the sheet fills what's above it; letting the keyboard go now would resize the sheet in
    // the middle of its slide. So it slides down behind the keyboard, and the keyboard goes once it's gone.
    if (!host.hasAttribute('data-kb')) /** @type {HTMLElement | null} */ (root.activeElement)?.blur();
    node.style.pointerEvents = 'none'; // not inert: that would take the cursor away, and the keyboard with it, at once
    node.style.transition = ms ? `transform ${ms}ms cubic-bezier(.2, .6, .4, 1)` : 'transform .22s cubic-bezier(.4, 0, 1, 1)';
    scrim.style.transition = `opacity ${ms || 220}ms`;
    node.style.transform = 'translateY(100%)';
    scrim.style.opacity = '0';
    bar.style.transition = `transform ${ms || 220}ms cubic-bezier(.2, .6, .4, 1), opacity ${ms || 220}ms`;
    host.style.setProperty('--lab-p', '1'); // the bar comes up as the sheet goes down
    setTimeout(() => {
      /** @type {HTMLElement | null} */ (root.activeElement)?.blur();
      close();
      node.style.pointerEvents = '';
      node.style.transform = node.style.transition = scrim.style.opacity = scrim.style.transition = bar.style.transition = '';
      host.style.removeProperty('--lab-p');
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
  let backWatcher = null; // CloseWatcher (not in TypeScript's DOM types yet)
  function backCloses() {
    const open = matchMedia('(pointer: coarse)').matches && host.hasAttribute('data-sheet');
    if (!open && backWatcher) {
      const w = backWatcher;
      backWatcher = null;
      w.destroy();
    }
    if (open && !backWatcher && 'CloseWatcher' in window) {
      try {
        const w = new (/** @type {any} */ (window).CloseWatcher)();
        w.onclose = () => {
          if (backWatcher === w) backWatcher = null;
          closeOrNudge();
          backCloses(); // still open (it nudged): back closes it next time
        };
        backWatcher = w;
      } catch {}
    }
  }
  let dbg = null; // ?kbdebug: a line into the phone's log (sheet drags)
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
      if (performance.now() - releasedAt < 200) {
        e.preventDefault();
        e.stopPropagation();
      }
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
    let fromScrim = false; // the touch began on the dimmed page under the sheet: that pulls the sheet too
    const onStart = (e) => {
      fromScrim = e.currentTarget === scrim;
      if (fromScrim && openSheet() !== node) return void (mode = 'off');
      const t = e.touches[0];
      x0 = t.clientX;
      y0 = t.clientY;
      dy = v = raw = 0;
      last = { y: y0, at: e.timeStamp };
      box = fromScrim ? null : scrollerIn(e, node);
      mode = e.touches.length > 1 || box?.localName === 'textarea' ? 'off' : null;
    };
    node.addEventListener('touchstart', onStart, { passive: true });
    scrim.addEventListener('touchstart', onStart, { passive: true });
    const onMove = (e) => {
      if (fromScrim !== (e.currentTarget === scrim)) return;
      const t = e.touches[0];
      // Scrolling the messages up to their top and pulling on in the same move hands the sheet to the finger, as iOS
      // sheets do (it used to take a second swipe). Only while the browser still lets the move be taken over.
      if (mode === 'off' && box && box.localName !== 'textarea' && e.touches.length === 1 && e.cancelable && box.scrollTop <= 0 && t.clientY > last.y + 1) {
        mode = 'drag';
        y0 = t.clientY;
        v = 0;
        last = { y: t.clientY, at: e.timeStamp };
      }
      if (mode === 'off') return void (last = { y: t.clientY, at: e.timeStamp });
      if (mode === 'hold') return e.preventDefault();
      if (!mode) {
        const down = t.clientY - y0;
        const across = t.clientX - x0;
        if (!down && !across) return; // iOS sends moves for pressure changes too
        const sideways = Math.abs(across) > Math.abs(down);
        // The sheet's top quarter pulls it down too, messages and all, as does the dimmed page above it (Leo, 15 Nov);
        // below that a pull scrolls the messages until they reach their top.
        const nearTop = !sideways && down > 0 && y0 - node.getBoundingClientRect().top < node.offsetHeight * 0.25;
        if (fromScrim) mode = sideways ? 'hold' : 'drag';
        else if (grabArea(e.target)) mode = sideways && e.target.closest('.tabs') ? 'off' : 'drag'; // the list's tabs scroll sideways
        else if (nearTop && box?.localName !== 'textarea') mode = 'drag';
        else if (box) mode = !sideways && down > 0 && box.scrollTop <= 0 && performance.now() - scrolledAt > 100 ? 'drag' : 'off';
        else mode = sideways ? 'hold' : 'drag';
        dbg?.(`touch ${String(e.target.className || e.target.localName).slice(0, 20)} at ${Math.round(y0 - node.getBoundingClientRect().top)}/${node.offsetHeight} down${Math.round(down)} → ${mode}${e.cancelable ? '' : ' (not cancelable)'}${box ? ` box${Math.round(box.scrollTop)}` : ''}`);
        if (mode === 'off') return;
        if (mode === 'hold') return e.preventDefault();
      }
      e.preventDefault();
      raw = t.clientY - y0;
      // Up past where it sits: iOS's rubber band (UIScrollView's: offset = (1 − 1 / (pull × 0.55 / size + 1)) × size),
      // so it follows the finger, more and more slowly (it barely moved before: 100 px of pull gave 20 px, now ~50).
      const size = node.offsetHeight || 400;
      dy = raw >= 0 ? raw : -(1 - 1 / ((-raw * 0.55) / size + 1)) * size;
      if (e.timeStamp > last.at) v = 0.8 * ((t.clientY - last.y) / (e.timeStamp - last.at)) + 0.2 * v;
      last = { y: t.clientY, at: e.timeStamp };
      node.style.transition = scrim.style.transition = 'none';
      node.style.transform = `translateY(${dy}px)`;
      scrim.style.opacity = String(Math.min(1, Math.max(0, 1 - dy / 320)));
      bar.style.transition = 'none';
      host.style.setProperty('--lab-p', String(Math.min(1, Math.max(0, dy / (node.offsetHeight || 400)))));
    };
    node.addEventListener('touchmove', onMove, { passive: false });
    scrim.addEventListener('touchmove', onMove, { passive: false });
    const end = (e) => {
      if (fromScrim !== (e.currentTarget === scrim)) return;
      const was = mode;
      mode = null;
      if (was === 'drag') sheetDraggedAt = performance.now();
      if (was !== 'drag') return;
      releasedAt = performance.now();
      if (e.timeStamp - last.at > 80) v = 0; // held still before letting go
      const h = node.offsetHeight || innerHeight;
      const settle = () => {
        node.style.transition = `transform 380ms ${SPRING}, height 380ms ${SPRING}`;
        scrim.style.transition = 'opacity 300ms';
        node.style.transform = scrim.style.opacity = '';
        bar.style.transition = '';
        host.style.removeProperty('--lab-p'); // springing back: the bar goes back down with it
        setTimeout(() => (node.style.transition = scrim.style.transition = ''), 400);
      };
      if (grows && !node.classList.contains('full') && (raw < -40 || v < -0.4)) return node.classList.add('full'), node.classList.contains('card') && (cardFull = true), settle();
      if (grows && node.classList.contains('full') && v < 1.2 && (raw > 60 || v > 0.4)) return node.classList.remove('full'), node.classList.contains('card') && (cardFull = false), settle();
      // Where the sheet would come to rest if let go now, as iOS judges a throw (Apple's "Designing Fluid Interfaces":
      // the distance plus the speed carried on at the normal deceleration, 0.998 a millisecond, so v × 499): past half
      // its height it goes. A short quick flick closes; a slow long drag closes past halfway; a move back up never does.
      const rest = dy + Math.max(0, v) * 499;
      dbg?.(`let go: moved ${Math.round(dy)} speed ${v.toFixed(2)} rest ${Math.round(rest)} of half ${Math.round(h / 2)} → ${v > -0.1 && rest > h / 2 ? 'close' : 'stay'}`);
      if (v > -0.1 && rest > h / 2) return slideAway(node, close, Math.min(320, Math.max(140, (h - dy) / Math.max(v, 1.2))));
      node.style.transition = `transform 380ms ${SPRING}`;
      scrim.style.transition = 'opacity 300ms';
      node.style.transform = scrim.style.opacity = '';
      bar.style.transition = '';
      host.style.removeProperty('--lab-p'); // springing back: the bar goes back down with it
      setTimeout(() => (node.style.transition = scrim.style.transition = ''), 400);
    };
    node.addEventListener('touchend', end);
    scrim.addEventListener('touchend', end);
    scrim.addEventListener('touchcancel', end);
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
    /** @type {(() => void) & { sheet?: HTMLElement | null, top?: number, done?: any, vh?: number, kbUp?: boolean }} */
    const fit = () => {
      const zoomed = Math.abs(vv.scale - 1) > 0.01; // pinch-zoomed: that isn't a keyboard
      const r = probe.getBoundingClientRect();
      // iOS 26.0 can leave offsetTop at 24 px after the keyboard has gone. With nothing to type in focused there is no
      // keyboard and nothing panned (unzoomed), so an offset then is stale and counts as 0.
      const field = /** @type {HTMLElement | null} */ (root.activeElement || document.activeElement);
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
      if (key === fitted) {
        // Nothing to lay out again, but where the open sheet sits now is where the next keyboard slide starts from (it
        // was last read when the chat opened, hidden, at 0: the slide jumped to the screen's top first).
        const open = sheet ? openSheet() : null;
        if (open?.offsetHeight && !open.style.transform) Object.assign(fit, { sheet: open, top: open.getBoundingClientRect().top });
        return;
      }
      fitted = key;
      host.style.setProperty('--lab-kb', `${kb}px`);
      host.style.setProperty('--lab-top', `${Math.round(top)}px`);
      if (vh) host.style.setProperty('--lab-vh', `${vh}px`);
      else host.style.removeProperty('--lab-vh');
      host.toggleAttribute('data-kb', kb > 60);
      strip.style.display = sheet && gap ? 'block' : 'none';
      strip.style.top = `${Math.round(scrollY + r.bottom)}px`;
      strip.style.height = `${gap}px`;
      // The keyboard came or went: the open sheet moves from where it was to its new place instead of jumping there
      // (filling the screen above the keyboard, or resting on the screen's bottom again). Not while a finger drags it.
      // Its place as the browser reports it: on iOS 26 a fixed sheet's box is already where you see it (it rests on
      // the keyboard while Safari pans the page), so subtracting the pan put the slide's start 276 px off (15 Nov,
      // ?kbdebug on Leo's iPhone: the visible height jumps 686 → 410 → 686 in one step each way).
      const open = sheet ? openSheet() : null;
      // Without any slide in progress (its own or the sheet's opening one): the place it is going to, not passing through.
      const slid = (n) => { try { return new DOMMatrixReadOnly(getComputedStyle(n).transform).m42 || 0; } catch { return 0; } };
      const keyboardMoved = Math.abs((fit.vh || vh) - vh) > 60 || fit.kbUp !== kb > 60;
      const sliding = open && open === fit.sheet && keyboardMoved && !open.style.transform && !still.matches;
      // Its own height change (the chat eases its height) jumps to the end first, so the place measured is where it
      // ends up: measured mid-change, the slide started 84 px too high (?kbdebug, 15 Nov).
      if (sliding) {
        open.style.transition = 'none';
        void open.offsetHeight;
      }
      const at = open ? open.getBoundingClientRect().top - slid(open) : null;
      if (sliding && Math.abs(fit.top - at) <= 8) open.style.transition = '';
      if (sliding && Math.abs(fit.top - at) > 8) {
        // Set at once, then eased away: an animate() call waits a frame to start, and that frame showed the sheet at
        // its new place before it jumped back to slide (the flicker a ?kbdebug run on Leo's iPhone showed, 15 Nov).
        open.style.transform = `translateY(${fit.top - at}px)`;
        void open.offsetHeight;
        open.style.transition = `transform 340ms ${SPRING}`;
        open.style.transform = '';
        clearTimeout(fit.done);
        fit.done = setTimeout(() => !open.style.transform && (open.style.transition = ''), 360);
      }
      Object.assign(fit, { vh, kbUp: kb > 60 }, open?.offsetHeight ? { sheet: open, top: at } : { sheet: null }); // a hidden one has no place yet
    };
    refit = fit;
    root.addEventListener('focusin', () => setTimeout(fit, 50));
    root.addEventListener('focusout', () => setTimeout(fit, 50));
    vv.addEventListener('resize', fit);
    vv.addEventListener('scroll', fit);
    fit();
    // ?kbdebug on the page's address: every frame for 1.5 s after the keyboard is asked for or let go, where the open
    // sheet sits on the screen and what Safari reports, sent to the page's chat as "kb-log" 2 s after letting go. For
    // tuning the keyboard slide on a real phone (a simulator's keyboard doesn't move like one).
    // Only with ?kbdebug in the address; nothing runs otherwise.
    if (globalThis.__LAB_DEBUG__ !== false && /[?&]kbdebug\b/.test(location.search)) {
      let lines = [];
      let t0 = performance.now();
      /** @type {any} */
      let sendTimer = 0;
      const row = (what) => {
        const open = openSheet();
        const r = open?.getBoundingClientRect();
        lines.push(`${Math.round(performance.now() - t0)} ${what} h${Math.round(vv.height)} top${Math.round(vv.offsetTop)} in${innerHeight} kb${host.hasAttribute('data-kb') ? 1 : 0}` +
          (r ? ` sheet${Math.round(r.top)}/${Math.round(r.height)}${open.getAnimations().length ? ' anim' : ''}` : '') +
          // What is moving anywhere (the page, the pins, the dimming): for a flicker that isn't the keyboard.
          ` [${[...document.getAnimations(), ...root.getAnimations()].map((a) => /** @type {any} */ (a).animationName || /** @type {any} */ (a).transitionProperty || 'js').slice(0, 6).join(',')}]` +
          ` scrim${getComputedStyle(scrim).opacity.slice(0, 4)} scroll${Math.round(scrollY)}`);
      };
      const watch = (what) => {
        row(what);
        const end = performance.now() + 1500;
        let prev = '';
        const f = () => {
          const before = lines.length;
          row('f');
          const last = lines[lines.length - 1].replace(/^\d+ f /, '');
          if (last === prev) lines.length = before; // only frames where something moved
          prev = last;
          if (performance.now() < end) requestAnimationFrame(f);
        };
        requestAnimationFrame(f);
      };
      root.addEventListener('focusin', () => ((t0 = performance.now()), watch('focus')));
      // Sent 2 s after the last thing that moved (a keyboard, Safari's address bar), so one run is one message.
      const sendSoon = () => {
        clearTimeout(sendTimer);
        sendTimer = setTimeout(async () => {
          const text = lines.join('\n');
          lines = [];
          for (let i = 0; i < text.length; i += 1900) {
            await send({ name: 'kb-log', text: text.slice(i, i + 1900), anchor: { kind: 'page', selector: 'body', x: 0, y: 0, docX: 0, docY: 0, width: innerWidth } }).catch(() => {});
          }
        }, 2000);
      };
      root.addEventListener('focusout', () => {
        lines.push('--- let go');
        t0 = performance.now();
        watch('blur');
        sendSoon();
      });
      dbg = (line) => {
        lines.push(`${Math.round(performance.now() - t0)} ${line}`);
        sendSoon();
      };
      // The address bar growing or shrinking resizes the view too: each resize is followed for 1.5 s like a keyboard.
      vv.addEventListener('resize', () => {
        watch('resize');
        if (lines.length > 1) sendSoon();
      });
    }
  }
  // The chat stays at its newest message while it gets shorter (the keyboard coming up, the reply strip), unless
  // you scrolled back to read.
  const msgsEl = $('.msgs', chatEl);
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
    if (pinnedByHold) /** @type {HTMLElement | null} */ (root.querySelector('.float textarea'))?.focus({ preventScroll: true });
  }, true);
  // The lift after a hold: no click follows it (it would land on the dimmed page and take the cursor away), and the
  // touch's own end puts the cursor in the box, so the phone opens its keyboard.
  document.addEventListener('touchend', (e) => {
    if (!pinnedByHold) return;
    pinnedByHold = false;
    e.preventDefault();
    /** @type {HTMLElement | null} */ (root.querySelector('.float textarea'))?.focus({ preventScroll: true });
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
    if (on && !cursorMode && !draft && e.shiftKey && e.button === 0 && !e.composedPath().includes(host)) setTimeout(commentOnSelection, 0);
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
    if ((!on && !e.altKey) || (cursorMode && !e.altKey) || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
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
  addEventListener('scroll', (e) => e.target !== document && !host.contains(/** @type {Node} */ (e.target)) && reflow(), { capture: true, passive: true });

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
  ptr.append(el('span', { class: 'ini' }, '+'), el('span', { class: 'tick' }, 'go'));
  root.append(ptr);
  // It shows exactly where the system pointer is hidden (cursor: none from the rules above): never two pointers, never
  // none. That's checked on every move, and again when the page scrolls under a still mouse, Shift or Option is pressed,
  // or go or comments are switched.
  let mouse = null; // the last mouse position
  const place = (x, y, target) => {
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
  // Computers, comments on: a click or drag doesn't select the page's text; hold Shift to select (and quote) words.
  // Fields and editable text stay selectable.
  fonts.textContent += `@media (pointer: fine) { html.lab-pinning:not(.lab-shift) body > :not([data-lab-comments]), html.lab-pinning:not(.lab-shift) body > :not([data-lab-comments]) :not(input, textarea, select, [contenteditable], [contenteditable] *) { -webkit-user-select: none; user-select: none; } }`;
  // Letting go of Shift keeps text selectable a moment longer, so a selection made with it isn't dropped before its
  // comment opens.
  /** @type {any} */
  let shiftOff = 0;
  const shiftKey = (e) => {
    clearTimeout(shiftOff);
    if (e.shiftKey) document.documentElement.classList.add('lab-shift');
    else shiftOff = setTimeout(() => (document.documentElement.classList.remove('lab-shift'), recheck()), 400);
  };
  addEventListener('keydown', shiftKey, true);
  addEventListener('keyup', shiftKey, true);
  // A press without Shift is never a selection: drop the Shift state at once, not 400 ms later (a click right after typing
  // a capital letter, or after a screenshot shortcut, used to select the page's text).
  addEventListener('pointerdown', (e) => {
    if (e.shiftKey) return shiftKey(e);
    clearTimeout(shiftOff);
    document.documentElement.classList.remove('lab-shift');
  }, true);
  addEventListener('blur', () => document.documentElement.classList.remove('lab-shift'));
  fonts.textContent += 'html.lab-dragging, html.lab-dragging * { user-select: none !important; -webkit-user-select: none !important; cursor: crosshair !important; }';
  // While a sheet is open, a swipe down is the sheet's, not the browser's pull-to-refresh.
  fonts.textContent += 'html.lab-sheet, html.lab-sheet body { overscroll-behavior-y: none; }';
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
        if (kept.list) {
          listOpen = true;
          filter = ['new', 'open', 'resolved', 'mine'].includes(kept.filter) ? kept.filter : filter;
        }
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
    /** @type {any} */
    let reloadTimer = 0;
    const reload = () => {
      // A tab in the background doesn't reload on every save: it reloads once, when you come back to it.
      if (document.hidden) return void (reloadWhenShown = true);
      if (busy()) {
        if (!reloadTimer) reloadTimer = setTimeout(() => ((reloadTimer = 0), reload()), 500); // one waiting reload, not one per message
        return;
      }
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
    let beat = 0;
    // The status pill says "reconnecting" while the live connection is down; the next message puts it right.
    const showAway = (word) => {
      who.replaceChildren(Object.assign(document.createElement('span'), { textContent: word }));
      who.setAttribute('aria-label', word);
      who.classList.add('idle');
      who.classList.remove('working');
      who.hidden = false;
    };
    let commentsRev = null; // the lab's comments version this page has (not the read marks, `seen`)
    let readsAt = null;
    let hotAt = null;
    // A CSS save: load the new stylesheet next to the old one and drop the old one once it's in, so nothing flashes,
    // moves or closes. The saved file's own <link>s, or every same-site one when it's pulled in another way (@import).
    const swapCss = (files) => {
      // A clone still loading from an earlier save is skipped (its original is swapped instead) and dropped once a newer one is in.
      const links = [.../** @type {NodeListOf<HTMLLinkElement>} */ (document.querySelectorAll('link[rel~="stylesheet"][href]:not([data-lab-swap])'))].filter((l) => new URL(l.href, location.href).origin === location.origin);
      const named = links.filter((l) => files.includes(decodeURIComponent(new URL(l.href, location.href).pathname)));
      for (const link of named.length ? named : links) {
        const url = new URL(link.href, location.href);
        url.searchParams.set('lab-v', Date.now().toString(36));
        const next = /** @type {HTMLLinkElement} */ (link.cloneNode());
        next.href = url.href;
        next.dataset.labSwap = '';
        const path = url.pathname;
        next.addEventListener('load', () => {
          for (const l of /** @type {NodeListOf<HTMLLinkElement>} */ (document.querySelectorAll('link[rel~="stylesheet"][href]'))) if (l !== next && new URL(l.href, location.href).pathname === path) l.remove();
          delete next.dataset.labSwap;
        }, { once: true });
        next.addEventListener('error', () => next.remove(), { once: true });
        link.after(next);
      }
    };
    const fresh = (u) => {
      const url = new URL(u, location.href);
      url.searchParams.set('lab-v', Date.now().toString(36));
      return url.href;
    };
    const samePath = (u, paths) => {
      try {
        const url = new URL(u, location.href);
        return url.origin === location.origin && paths.includes(decodeURIComponent(url.pathname));
      } catch {
        return false;
      }
    };
    // A picture or SVG: every element that shows it gets the new file (img, srcset, poster, SVG image/use, the tab
    // icon). Nothing shows it directly: it's a CSS background, so the stylesheets are swapped.
    const swapImages = (paths) => {
      let hit = 0;
      for (const n of document.querySelectorAll('img, source, video[poster], image, use, link[rel~="icon"]')) {
        if (host.contains(n)) continue;
        for (const attr of ['src', 'href', 'poster', 'xlink:href']) {
          const v = n.getAttribute(attr);
          if (!v || !samePath(v.split('#')[0], paths)) continue;
          // The new file is loaded and decoded first, then shown: the picture never blinks empty.
          const next = fresh(v.split('#')[0]);
          const im = new Image();
          im.src = next;
          (im.decode ? im.decode() : Promise.resolve()).catch(() => {}).finally(() => n.setAttribute(attr, next + (v.includes('#') ? v.slice(v.indexOf('#')) : '')));
          hit++;
        }
        const set = n.getAttribute('srcset');
        if (set && set.split(',').some((c) => samePath(c.trim().split(/\s+/)[0], paths))) {
          n.setAttribute('srcset', set.split(',').map((c) => {
            const [u, ...rest] = c.trim().split(/\s+/);
            return [samePath(u, paths) ? fresh(u) : u, ...rest].join(' ');
          }).join(', '));
          hit++;
        }
      }
      if (!hit) swapCss([]);
    };
    // A font: each @font-face that uses it is loaded again as a new face, which takes over from the old one.
    const reloadFonts = (paths) => {
      for (const sheet of document.styleSheets) {
        let rules;
        try {
          rules = sheet.cssRules;
        } catch {
          continue; // another site's stylesheet
        }
        for (const r of rules || []) {
          if (!(r instanceof CSSFontFaceRule)) continue;
          const src = r.style.getPropertyValue('src');
          const base = sheet.href || location.href;
          if (!/url\(/.test(src) || ![...src.matchAll(/url\(["']?([^"')]+)/g)].some((m) => samePath(new URL(m[1], base).href, paths))) continue;
          const again = src.replace(/url\(["']?([^"')]+)["']?\)/g, (all, u) => (samePath(new URL(u, base).href, paths) ? `url("${fresh(new URL(u, base).href)}")` : all));
          const d = (k) => r.style.getPropertyValue(k) || undefined;
          try {
            const face = new FontFace(d('font-family').replace(/^["']|["']$/g, ''), again, /** @type {any} */ ({ weight: d('font-weight'), style: d('font-style'), stretch: d('font-stretch'), unicodeRange: d('unicode-range'), display: d('font-display') }));
            face.load().then((f) => document.fonts.add(f)).catch(() => {});
          } catch {}
        }
      }
    };
    // An HTML page: fetch it and change only what differs, in place (scroll, open things and typed text stay). A
    // changed script or stylesheet list can't be patched safely: then it's a normal reload.
    const ownStyles = () => new Set([fonts, pinCursorStyle]);
    const scriptsOf = (doc) => [...doc.querySelectorAll('script')].filter((x) => !/\/_lab\/comments\.js/.test(x.getAttribute('src') || '')).map((x) => x.getAttribute('src') || x.textContent);
    const sheetsOf = (doc) => [...doc.querySelectorAll('link[rel~="stylesheet"]')].map((l) => { try { return new URL(l.getAttribute('href'), location.href).pathname; } catch { return ''; } });
    const keepOut = (n) => n === host || (n.nodeType === 1 && n.localName === 'script');
    // Old and new children are paired in order, looking a few ahead, so an added or removed element doesn't shift
    // everything after it (an open <details> further down stays the same element, and stays open).
    const same = (o, n) => o.nodeType === n.nodeType && o.nodeName === n.nodeName && (o.nodeType !== 1 || (o.id || '') === (n.id || ''));
    const alike = (o, n) => same(o, n) && (o.nodeType === 1 ? Boolean(o.id) || o.getAttribute('class') === n.getAttribute('class') : o.nodeType !== 3 || o.data === n.data);
    const morphKids = (a, b) => {
      const olds = [...a.childNodes].filter((n) => !keepOut(n));
      const news = [...b.childNodes].filter((n) => !(n.nodeType === 1 && n.localName === 'script'));
      let j = 0;
      let prev = null;
      const put = (n) => {
        const c = document.importNode(n, true);
        a.insertBefore(c, prev ? prev.nextSibling : olds[j] || a.firstChild);
        return c;
      };
      news.forEach((n, i) => {
        const o = olds[j];
        if (!o) return void (prev = put(n));
        if (alike(o, n)) return void ((prev = morphNode(o, n)), j++);
        // The old one comes back a little later: this new one was added before it.
        if (news.slice(i + 1, i + 8).some((m) => alike(o, m))) return void (prev = put(n));
        // This new one is a little further on among the old ones: the ones before it were removed.
        const k = olds.slice(j + 1, j + 8).findIndex((m) => alike(m, n));
        if (k >= 0) {
          for (const gone of olds.slice(j, j + 1 + k)) gone.remove();
          j += k + 1;
          return void (prev = morphNode(olds[j], n), j++);
        }
        prev = morphNode(o, n);
        j++;
      });
      for (const o of olds.slice(j)) o.remove();
    };
    const morphNode = (o, n) => {
      if (o.nodeType !== n.nodeType || o.nodeName !== n.nodeName || (o.nodeType === 1 && (o.id || '') !== (n.id || ''))) {
        const c = document.importNode(n, true);
        o.replaceWith(c);
        return c;
      }
      if (o.nodeType === 3 || o.nodeType === 8) {
        if (o.data !== n.data) o.data = n.data;
        return o;
      }
      if (o.nodeType !== 1) return o;
      // An opened <details> or <dialog> stays open (you opened it; the file doesn't say so).
      for (const { name } of Array.from(o.attributes)) if (!n.hasAttribute(name) && !(name === 'open' && /^(details|dialog)$/.test(o.localName))) o.removeAttribute(name);
      for (const { name, value } of Array.from(n.attributes)) if (o.getAttribute(name) !== value) o.setAttribute(name, value);
      // What you're typing in, a playing video, a canvas, a web component's insides: left as they are.
      if (o === document.activeElement || o.shadowRoot || /^(iframe|canvas|video|audio|textarea|select|input)$/.test(o.localName)) return o;
      morphKids(o, n);
      return o;
    };
    // A page with scripts of its own is reloaded instead: patching it toward its file would undo what its scripts built.
    const ownScripts = () => scriptsOf(document).length > 0;
    let morphRun = 0;
    const morphPage = async () => {
      if (ownScripts()) return reload();
      const run = ++morphRun;
      try {
        const res = await fetch(location.href, { cache: 'no-store', headers: { accept: 'text/html' } });
        if (!res.ok) return reload();
        const html = await res.text();
        if (run !== morphRun) return; // a newer save is already being fetched: only the latest is applied
        const doc = new DOMParser().parseFromString(html, 'text/html');
        if (scriptsOf(doc).join('\n') !== scriptsOf(document).join('\n') || sheetsOf(doc).join('\n') !== sheetsOf(document).join('\n')) return reload();
        // What you're looking at stays put: an element a third down the window keeps its place on screen. Found before
        // the change (during a cross-fade the page can't be hit-tested).
        let mark = null;
        for (const y of [Math.min(innerHeight / 3, 240), innerHeight / 2, 80]) {
          const e = document.elementFromPoint(innerWidth / 2, y);
          if (e && e !== document.body && e !== document.documentElement && !host.contains(e) && e !== host) {
            mark = e;
            break;
          }
        }
        const markTop = mark?.getBoundingClientRect().top;
        // The browser cross-fades the old page into the new one (View Transitions, Safari 18+ and Chrome; others just swap).
        const apply = () => {
          // The page's own new title, with the "(3)" of new messages kept in front.
          if (doc.title !== tabTitle.base) {
            tabTitle.base = doc.title;
            document.title = doc.title; // drawList puts the "(3)" back in front
            drawList();
          }
          const mine = ownStyles();
          const olds = [...document.head.querySelectorAll('style')].filter((x) => !mine.has(x));
          const news = [...doc.head.querySelectorAll('style')];
          news.forEach((n, i) => (olds[i] ? olds[i].textContent !== n.textContent && (olds[i].textContent = n.textContent) : document.head.append(document.importNode(n, true))));
          for (const o of olds.slice(news.length)) o.remove();
          morphKids(document.body, doc.body);
          if (mark?.isConnected) {
            const moved = mark.getBoundingClientRect().top - markTop;
            if (Math.abs(moved) > 1) scrollBy(0, moved);
          }
          reflow();
        };
        // An error inside the cross-fade would go unseen: any failure falls back to a reload.
        const safe = () => {
          try {
            apply();
          } catch {
            reload();
          }
        };
        if (document.startViewTransition && !still.matches) document.startViewTransition(safe);
        else safe();
      } catch {
        reload();
      }
    };
    const hotUpdate = (files) => {
      const of = (kind) => files.filter((f) => f.kind === kind).map((f) => f.path);
      // Only a save of this page's own file patches it (another page saved in the lab changes nothing here).
      const here = decodeURIComponent(location.pathname).replace(/\/$/, '/index').replace(/\.html?$/i, '');
      if (of('html').some((p) => !p || p.replace(/\.html?$/i, '') === here)) morphPage();
      if (of('css').length) swapCss(of('css'));
      if (of('img').length) swapImages(of('img'));
      if (of('font').length) reloadFonts(of('font'));
    };
    // The server counts open tabs: a tab in the background still counts, and says bye when it closes, so closing
    // the page stops Claude listening.
    const tab = Math.random().toString(36).slice(2, 12);
    // A tab in front keeps one live stream. A tab in the background lets it go after 30 s and asks for the lab's
    // state every 20 s instead (a quick request each time), so its "(3)" title and pins keep up without holding a
    // connection: browsers allow only 6 to one lab at a time, and held ones by background tabs made the rest hang.
    /** @type {any} */
    let pollTimer = 0;
    /** @type {any} */
    let dropTimer = 0;
    const poll = async () => {
      try {
        onState(await (await fetch(`${script.dataset.live.replace(/live$/, 'state')}?tab=${tab}`, { cache: 'no-store' })).json());
      } catch {}
    };
    const toBackground = () => {
      clearTimeout(dropTimer);
      dropTimer = setTimeout(() => {
        stream?.close();
        stream = null;
        clearInterval(pollTimer);
        pollTimer = setInterval(poll, 20000);
      }, 30000);
    };
    const toFront = () => {
      clearTimeout(dropTimer);
      clearInterval(pollTimer);
      pollTimer = 0;
      connect();
    };
    const connect = () => {
      if (stream) return;
      stream = new EventSource(`${script.dataset.live}?tab=${tab}`);
      beat = Date.now();
      stream.addEventListener('beat', () => (beat = Date.now()));
      stream.onerror = () => showAway('reconnecting');
      stream.onmessage = (e) => {
        beat = Date.now();
        onState(JSON.parse(e.data));
      };
    };
    function onState(v) {
      {
        // A new widget script: this page needs it, so it reloads (when it's safe, as always).
        if (v.widget && script.dataset.widget && v.widget !== script.dataset.widget) return reload();
        // The lab restarted (its counters start again): catch up in place instead of reloading. The page is fetched
        // and patched (only if its file changed does anything move), and the comments are loaded again.
        if (v.lab && script.dataset.lab && v.lab !== script.dataset.lab) {
          script.dataset.lab = v.lab;
          script.dataset.version = String(v.files);
          hotAt = v.hot;
          commentsRev = v.comments;
          morphPage();
          load();
        }
        if (String(v.files) !== script.dataset.version) return reload();
        // Missed more than one hot update while away (asleep, offline): patch the page and refresh every stylesheet
        // and picture, instead of only the last batch of files.
        if (hotAt !== null && v.hot !== hotAt) {
          if (v.hot - hotAt > 1) hotUpdate([{ kind: 'html' }, { kind: 'css', path: '' }]);
          else hotUpdate(v.hotFiles || []);
        }
        hotAt = v.hot;
        if (commentsRev !== null && v.comments !== commentsRev) loadChanges(commentsRev); // keeps typed text: it adds replies in place
        commentsRev = v.comments;
        // read on another device with your name
        if (v.reads !== readsAt) {
          readsAt = v.reads;
          syncReads();
        }
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
        if (coarse) chatBtn.title = who.textContent; // phones: the light on the chat button says who's listening
        who.setAttribute('aria-label', who.textContent); // the words stay for screen readers when only the light shows
        if (s?.url && mode !== 'away') Object.assign(who, { href: s.url, target: '_blank' });
        else who.removeAttribute('href');
        // No link, but a resume command (codex resume …): a tap copies it.
        who.dataset.copy = !s?.url && s?.resume && mode !== 'away' ? s.resume : '';
        who.title = mode === 'away' ? 'Ask your agent to run: npx labit wait' : s?.resume ? `${s.resume}${who.dataset.copy ? ' (tap to copy)' : ''}` : '';
        who.hidden = false;
      }
    }
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return toBackground();
      if (reloadWhenShown) return reload();
      toFront(); // back in front: the live stream again, and the first message says what changed meanwhile
    });
    addEventListener('pagehide', () => {
      stream?.close();
      stream = null;
      fetch(script.dataset.live.replace(/live$/, 'bye'), { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tab }) }).catch(() => {});
    });
    addEventListener('pageshow', (e) => e.persisted && connect()); // back from the back-forward cache
    // Back from sleep, or the connection went quiet: connect again at once and catch up on what was missed (the first
    // message after it says what changed). A clock that jumped (the laptop slept) or 40 s without a beat both count.
    let tick = Date.now();
    const freshStream = () => {
      stream?.close();
      stream = null;
      showAway('reconnecting');
      connect();
    };
    // Hidden tabs' timers are slowed to about once a minute, which would look like sleep: only a tab in front checks.
    setInterval(() => {
      const now = Date.now();
      const slept = now - tick > 20000;
      tick = now;
      if (document.hidden) return;
      if (slept || (stream && now - beat > 40000)) freshStream();
    }, 5000);
    addEventListener('online', () => !document.hidden && freshStream());
    connect();
    if (document.hidden) toBackground();
  }
})();
