// Part of the comment widget (src/comments.js bundles it). Uses the widget's own parts through W, set once at startup.
import { scrollPageTo } from './sheets.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let W: any;
export function bindList(w: unknown) {
  W = w;
}

export const goTo = (c, keys = false) => {
  W.S.stepping = Boolean(W.S.openId);
  W.S.keepKeys = W.S.stepping && (keys || W.root.activeElement?.localName === 'textarea');
  W.S.openId = c.id;
  W.S.draft = null;
  if (W.coarse) W.S.listOpen = false;
  W.render();
  // The pin comes into view: on phones in the middle of what the sheet leaves free above it; on a computer the pin
  // and its open card together, in the middle of the window when they fit, else from the pin down.
  const pinTop = W.position(c.anchor || {}).top;
  let top = pinTop - Math.max(40, W.coarse && W.S.openCard?.isConnected ? (innerHeight - W.S.openCard.offsetHeight) / 2 : innerHeight / 3);
  if (!W.coarse && W.S.openCard?.isConnected) {
    const bottom = W.S.openCard.getBoundingClientRect().bottom + scrollY;
    const tall = bottom - pinTop + 28;
    top = tall <= innerHeight - 80 ? pinTop - 28 - (innerHeight - tall) / 2 : pinTop - 40;
  }
  scrollPageTo(top); // with room below the page's end on phones, for a pin near it
};

export function drawList() {
  const all = W.threads();
  W.listBtn.hidden = !W.S.on || (!W.coarse && !all.length && !W.held().length); // on phones it carries the agent's light
  W.goBtn.hidden = !W.S.on;
  if (!W.goBtn.firstElementChild) W.goBtn.replaceChildren(W.el('span', { class: 'gp' }, 'go'), W.el('kbd', { 'aria-hidden': 'true' }, [W.KEYS.comment, W.KEYS.go, W.KEYS.pointer].join('/')));
  W.goFace();
  W.goBtn.classList.toggle('on', W.S.goMode && !W.S.cursorMode);
  W.goBtn.classList.toggle('cursor', W.S.cursorMode);
  W.goBtn.setAttribute('aria-pressed', String(W.S.goMode && !W.S.cursorMode));
  const freshAll = all.filter((c) => !W.isPage(c)).reduce((n, c) => n + W.unread(c).length, 0); // a new message in a done thread counts too
  W.listBtn.replaceChildren(document.createTextNode(freshAll ? `list · ${freshAll} new` : 'list'), W.el('kbd', { 'aria-hidden': 'true' }, 'l'));
  // ‹ › around it step through the new ones, top to bottom of the page, without opening the list.
  W.newPrev.hidden = W.newNext.hidden = !W.S.on || !all.some((c) => !W.isPage(c) && W.unread(c).length);
  if (!W.LIST_WINDOW) {
    // Without the list window the middle shows how many are new (a click goes to the next one). The pills keep their
    // place whatever the counts: with nothing new or done they stay, quiet and disabled, so nothing in the bar moves.
    W.newPrev.hidden = W.newNext.hidden = true; // no arrows: the pill itself goes to the next new one (J / K step both ways)
    W.listBtn.hidden = !W.S.on;
    {
      W.listBtn.replaceChildren(W.coarse ? 'new' : W.keyLabel('new', W.KEYS.next), W.el('b', { class: `cnt${freshAll ? '' : ' zero'}` }, String(freshAll))); // phones: no keys
      W.listBtn.setAttribute('aria-label', `next new comment, ${freshAll} new`);
      W.listBtn.setAttribute('aria-keyshortcuts', W.KEYS.next);
    }
    W.listBtn.title = 'next new comment: W, or ⌥W while typing (Shift for the one before)';
    W.listBtn.disabled = !freshAll;
    W.listBtn.classList.toggle('quiet', !freshAll);
    const doneCount = all.filter((c) => !W.isPage(c) && (c.resolved || workState(c)[0] === 'done') && !W.unread(c).length).length;
    W.doneBtn.hidden = !W.S.on;
    W.doneBtn.disabled = !doneCount && !W.S.showDone;
    W.doneBtn.classList.toggle('quiet', W.doneBtn.disabled);
    W.doneBtn.replaceChildren(W.S.showDone ? `hide done · ${doneCount}` : `show done · ${doneCount}`, W.el('kbd', { 'aria-hidden': 'true' }, W.KEYS.done));
    W.doneBtn.setAttribute('aria-keyshortcuts', W.KEYS.done);
  }
  W.placeBar();
  // The browser tab shows how many new messages there are, as "(3) Page title".
  const tabNew = all.reduce((n, c) => n + W.unread(c).length, 0);
  if (!W.tabTitle.base || !document.title.startsWith('(')) W.tabTitle.base = document.title.replace(/^\(\d+\) /, '');
  const want = tabNew ? `(${tabNew}) ${W.tabTitle.base}` : W.tabTitle.base;
  if (document.title !== want) document.title = want;
  W.listBtn.classList.toggle('has-new', freshAll > 0);
  const h = W.held().length;
  W.sendBtn.hidden = !h;
  W.sendBtn.textContent = `send ${h} draft${h === 1 ? '' : 's'}`;
  W.listEl.hidden = !W.S.on || !W.S.listOpen;
  if (W.listEl.hidden) return;
  for (const b of (W.listEl.querySelectorAll('[data-f]') as NodeListOf<HTMLElement>)) b.classList.toggle('on', b.dataset.f === W.S.filter);
  const fresh = all.filter((c) => !W.isPage(c) && W.unread(c).length).length; // chat messages count in the chat
  W.listEl.querySelector('[data-f="new"]').textContent = fresh ? `new · ${fresh}` : 'new';
  // Just new and open for now; work, resolved, mine and draft mode stay in the code, hidden.
  for (const f of ['work', 'resolved', 'mine']) W.$(`[data-f="${f}"]`, W.listEl).hidden = true;
  W.holdBtn.hidden = !W.DRAFT_MODE;
  const doneCount = all.filter((c) => !W.isPage(c) && (c.resolved || workState(c)[0] === 'done') && !W.unread(c).length).length;
  W.showDoneBtn.hidden = !doneCount;
  W.showDoneBtn.textContent = W.S.showDone ? `hide done · ${doneCount}` : `show done · ${doneCount}`;
  W.holdBtn.classList.toggle('on', W.drafting());
  if (W.S.filter === 'work') return W.listEl.querySelector('.items').replaceChildren(...workItems());
  const items = W.listed().map((c) => {
    const b = W.el('button', { class: `it${W.S.openId === c.id ? ' cur' : ''}`, type: 'button' });
    b.append(document.createTextNode(`${c.resolved ? '✓' : W.numberOf(c)}  ${c.text.replace(/\s+/g, ' ').slice(0, 70)} `), ...(W.onWhat(c) ? [W.el('span', {}, `on ${W.onWhat(c)} `)] : []), W.el('span', {}, `· ${c.name}${!c.resolved && W.isDone(c) ? ' · ✅ done' : ''}`), ...(W.unread(c).length ? [' ', W.el('span', { class: 'tag' }, `${W.unread(c).length} new`)] : []));
    b.addEventListener('click', () => goTo(c));
    return b;
  });
  W.listEl.querySelector('.items').replaceChildren(...(items.length ? items : [W.el('div', { class: 'none' }, 'nothing here')]));
}

// A thread's state for the agent: ['now' | 'next' | 'done' | null, since when].
export const workState = (c) => {
  const thread = [c, ...W.repliesOf(c.id)];
  const lastPerson = thread.filter((m) => !m.session).map((m) => m.createdAt).sort().at(-1) || '';
  const answer = thread.filter((m) => m.session).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).at(-1);
  const answered = answer && answer.createdAt > lastPerson;
  // What the answer is: its intent (labit reply --done / --on-it / --question; the lab reads it from the first words
  // of an answer that doesn't say).
  const said = answered && answer.intent;
  if (c.resolved || said === 'done') return ['done', answered ? answer.createdAt : c.createdAt];
  if (said === 'working') return ['now', answer.createdAt];
  if (!answered && c.handedAt && c.handedAt >= lastPerson) return ['now', c.handedAt];
  return answered ? [null, ''] : ['next', lastPerson];
};

function workItems() {
  const today = new Date().toDateString();
  const now = [];
  const next = [];
  const done = [];
  for (const c of W.S.comments.filter((x) => !x.parent)) {
    const [state, at] = workState(c);
    if (state === 'now') now.push([c, at]);
    else if (state === 'next') next.push([c, at]);
    else if (state === 'done' && new Date(at).toDateString() === today) done.push([c, at]);
  }
  const row = ([c, at], when) => {
    const b = W.el('button', { class: `it${W.S.openId === c.id ? ' cur' : ''}`, type: 'button' });
    b.append(document.createTextNode(`${W.isPage(c) ? 'chat' : c.resolved ? '✓' : W.numberOf(c)}  ${c.text.replace(/\s+/g, ' ').slice(0, 70)} `), W.el('span', {}, `· ${when(at)}`));
    b.addEventListener('click', () => (W.isPage(c) ? ((W.S.chatOpen = true), (W.S.listOpen = false), W.render()) : goTo(c)));
    return b;
  };
  const part = (title, list, when, newest = false) =>
    list.length ? [W.el('div', { class: 'group' }, `${title} · ${list.length}`), ...list.sort((a, b) => (newest ? -1 : 1) * a[1].localeCompare(b[1])).map((x) => row(x, when))] : [];
  const out = [
    ...part('Now', now, (at) => `on it ${W.ago(at)}`.replace('on it just now', 'just started')),
    ...part('Next', next, (at) => `sent ${W.ago(at)} ago`.replace('just now ago', 'just now')),
    ...part('Done today', done, (at) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), true),
  ];
  return out.length ? out : [W.el('div', { class: 'none' }, 'nothing in progress on this page')];
}

export const stepNew = (dir) => {
  const fresh = W.threads().filter((c) => !W.isPage(c) && W.unread(c).length);
  if (!fresh.length) return;
  const top = (c) => W.position(c.anchor || {}).top;
  fresh.sort((a, b) => top(a) - top(b));
  // The open one was read when it opened, so it's no longer in the list: step on from where it is on the page.
  const open = W.S.openId && W.threads().find((c) => c.id === W.S.openId);
  const here = open ? top(open) : null;
  const after = here == null ? -1 : fresh.findIndex((c) => top(c) > here);
  const at = fresh.findIndex((c) => c.id === W.S.openId);
  const next = at >= 0 ? (at + dir + fresh.length) % fresh.length
    : here == null ? (dir > 0 ? 0 : fresh.length - 1)
    : dir > 0 ? (after < 0 ? 0 : after)
    : ((after < 0 ? fresh.length : after) - 1 + fresh.length) % fresh.length;
  W.S.chatOpen = false; // N new from the chat: the chat closes and the new comment opens
  goTo(fresh[next], !W.coarse); // the reply box takes the cursor (not on phones: no keyboard popping up)
};
