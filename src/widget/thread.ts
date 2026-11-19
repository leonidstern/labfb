// Part of the comment widget (src/comments.js bundles it). Uses the widget's own parts through W, set once at startup.
import { stickToEnd } from './stick.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let W: any;
export function bindThread(w: unknown) {
  W = w;
}

export function placeCard(card, left, top) {
  W.layer.append(card);
  const width = card.offsetWidth;
  const maxLeft = scrollX + document.documentElement.clientWidth - width - 12;
  card.style.left = `${Math.max(scrollX + 12, Math.min(left - 14, maxLeft))}px`;
  // Near the page's end a thread opens above its pin, so it doesn't make the page longer and push things down.
  const h = card.offsetHeight;
  const below = top + 10 + h > W.contentEnd();
  card.style.top = `${below ? Math.max(scrollY + 8, top - 40 - h) : top + 10}px`; // above: clear of the pin (28 px tall)
  card.style.transformOrigin = below ? '14px 100%' : '';
}

// Draft composer sits to the right of its pin, like the pin is the avatar; below it when there is no room.
export function placeBeside(node, left, top) {
  W.layer.append(node);
  const width = node.offsetWidth;
  const right = scrollX + document.documentElement.clientWidth - 12;
  const h = node.offsetHeight;
  const end = W.contentEnd();
  if (left + 36 + width <= right) {
    node.style.left = `${left + 36}px`;
    node.style.top = `${Math.min(top - 37, end - h - 8)}px`; // never past the page's end
  } else {
    node.style.left = `${Math.max(scrollX + 12, Math.min(left - 14, right - width))}px`;
    node.style.top = `${top + 10 + h > end ? Math.max(scrollY + 8, top - 40 - h) : top + 10}px`;
  }
}

// `now` gives the thread the pin shows now: the pin is kept across redraws (src/comments.js, render), so it can't hold one.
export function grab(pin, now) {
  pin.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !pin.classList.contains('grab')) return;
    const c = now();
    const r = pin.getBoundingClientRect();
    const tip = { dx: e.clientX - r.left, dy: e.clientY - r.bottom };
    const start = { x: e.clientX, y: e.clientY, sx: scrollX, sy: scrollY, left: parseFloat(pin.style.left), top: parseFloat(pin.style.top) };
    let moving = false;
    let last = e;
    W.S.grabbing = true;
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
    W.S.dropDrag = () => {
      removeEventListener('scroll', scrolled, true);
      W.S.dropDrag = null;
    };
    const up = async (ev) => {
      pin.removeEventListener('pointermove', move);
      pin.removeEventListener('pointerup', up);
      pin.removeEventListener('pointercancel', up);
      pin.removeEventListener('lostpointercapture', up);
      W.S.dropDrag?.();
      if (!W.S.grabbing) return; // already ended (the layer was redrawn mid-drag)
      W.S.grabbing = false;
      if (!moving) return;
      pin.dataset.dragged = '1'; // the click that follows is the drop, not an open
      setTimeout(() => delete pin.dataset.dragged, 0);
      const x = ev.clientX - tip.dx;
      const y = ev.clientY - tip.dy;
      const under = document.elementsFromPoint(x, y).find((n) => n !== W.host);
      if (ev.type === 'pointercancel' || x < 0 || y < 0 || x > innerWidth || y > innerHeight || under?.closest(W.OFF)) return W.render();
      const before = c.anchor;
      c.anchor = W.anchorAt(x, y);
      W.render();
      try {
        const { comment } = await W.send({ action: 'move', id: c.id, anchor: c.anchor, edit: W.store.get(`lab-edit:${c.id}`) || undefined });
        Object.assign(c, comment);
      } catch {
        c.anchor = before; // not saved: back where it was
        W.render();
      }
    };
    pin.addEventListener('pointermove', move);
    pin.addEventListener('pointerup', up);
    pin.addEventListener('pointercancel', up);
    pin.addEventListener('lostpointercapture', up);
  });
}

// What a thread card does, kept as it is when a question with choices is in it (choices only add to it):
// - the thread's messages as chat bubbles (yours on the right), the time and ✓ ✓✓ in the corner, ✅ on a done answer,
//   the "new" line above the first unread one, and opening it marks them read (markSeen);
// - an answer to a later message quotes it (to), and a tap on the quote goes to it;
// - a rule the agent offered (--suggest-rule): "rule?" on your message, kept with a tap, undo on the answer;
// - resolve / reopen (admins and the thread's starter), delete with its in-card question (admins);
// - the reply box (composer) at the foot, its draft kept per thread, focused on a computer when opened by a click;
// - scroll keeping: at the newest it follows new messages and the keyboard; scrolled back, it stays put; sync() adds
//   replies that arrive in place, so the reply box keeps its focus;
// - keys: R reply, E resolve, Escape closes, Ctrl-D / W next new (comments.js);
// - phones: the bottom sheet (drag by its handle, swipe down to close: sheets.ts), "new · N ›" to the next one.
// A question with choices adds its rows in its bubble (choicesEl, below). No keys on its rows: tap, Keep.
export function threadCard(c, fresh = new Set(), focus = false) {
  const asking = openAsk(c);
  const card = W.el('div', { class: `card${asking ? ' asking' : ''}` }); // phones: an open question's sheet is half the screen
  // The thread scrolls in .body; the step buttons and the reply box stay put in .foot (phones: the sheet's bottom).
  const body = W.el('div', { class: 'body' });
  const foot = W.el('div', { class: 'foot' });
  card.append(W.el('div', { class: 'handle' }), body, foot);
  card.addEventListener('click', (e) => e.stopPropagation());
  // Messages as in the chat: bubbles (yours on the right), the time and ✓ ✓✓ in the corner, ✅ on a done answer, and
  // a "new" line above the first one you haven't read. The thread's number (as in the agent text) leads its time.
  body.classList.add('msgs');
  // At its newest it stays at its newest while it gets shorter (the keyboard coming up as you answer), as the chat does;
  // scrolled back to read, it stays put (Leo, 17 Nov: "when I'm answering, the messages scrolled up").
  const end = stickToEnd(body, !asking); // an open question starts at the question and its rows (on a half-height sheet, not at the newest)
  // Going to answer: the last message comes into view, so you write under what you're answering (Leo, 17 Nov).
  foot.addEventListener('focusin', (e) => (e.target as Element).localName === 'textarea' && end.pin());
  // A rule the agent offered on its own (--suggest-rule), from your reply about how it answered: on your own message,
  // where the words came from, "make it a rule" (Leo, 17 Nov). Leaving it is a no.
  const STAR = '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 1.5l1.7 4.8L14.5 8l-4.8 1.7L8 14.5l-1.7-4.8L1.5 8l4.8-1.7z"/></svg>';
  const offerOn = (mine) => {
    const all = [c, ...W.repliesOf(c.id)];
    const ans = all.slice(all.indexOf(mine) + 1).find((x) => x.session);
    if (!ans?.suggest || ans.suggest.state) return null;
    const b = W.el('button', { class: 'btn offer', type: 'button', title: ans.suggest.text });
    // The words where the time is, the star where the tick is, each in their size and colour (Leo, 17 Nov).
    b.append(W.el('span', { class: 'tm' }, 'rule?'));
    const star = W.el('span', { class: 'tick' });
    star.innerHTML = STAR;
    b.append(star);
    b.addEventListener('click', async () => {
      const r = await fetch('/_lab/rule', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ page: W.S.page, id: ans.id, action: 'keep' }) }).catch(() => null);
      if (!r?.ok) return void (b.lastChild!.textContent = 'failed, try again');
      ans.suggest.state = 'kept';
      for (const n of card.querySelectorAll(`.msg[data-id="${mine.id}"] .offering`)) n.classList.remove('offering');
      card.querySelectorAll(`.msg[data-id="${mine.id}"] .offer`).forEach((n) => n.remove()); // and its invisible copy
      card.querySelector(`.msg[data-id="${ans.id}"]`)?.append(ruleLine(ans)); // the rule shows on the agent's answer
    });
    return b;
  };
  const ruleLine = (item) => {
    const line = W.el('span', { class: 'rule' });
    if (item.suggest.state === 'undone') return line.append(W.el('b', {}, 'rule removed')), line;
    const undo = W.el('button', { class: 'btn', type: 'button' }, 'undo');
    undo.addEventListener('click', async () => {
      const r = await fetch('/_lab/rule', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ page: W.S.page, id: item.id }) }).catch(() => null);
      if (!r?.ok) return void (undo.textContent = 'failed, try again');
      item.suggest.state = 'undone';
      line.replaceWith(ruleLine(item));
    });
    line.append(W.el('b', {}, 'rule'), document.createTextNode(item.suggest.text), undo);
    return line;
  };
  const itemEl = (item) => {
    const box = W.el('div', { class: `item msg${W.mine(item) && !item.session ? ' mine' : ''}`, 'data-id': item.id, ...(W.agentOf(item) ? { 'data-agent': W.agentOf(item) } : {}) });
    box.append(W.nameLine(item.name, false));
    // An answer to a later message in the thread quotes it, as the chat does (Leo, 17 Nov: "show what you replied on").
    const to = item.to && W.repliesOf(c.id).find((x) => x.id === item.to);
    if (to) {
      const q = W.el('span', { class: 'quote' });
      q.append(W.el('b', {}, String(to.name || '').replace(/\s*·\s*session\s+\S+$/i, '')), document.createTextNode(to.text.replace(/\s+/g, ' ').slice(0, 90)));
      q.addEventListener('click', () => card.querySelector(`.msg[data-id="${to.id}"]`)?.scrollIntoView({ block: 'center', behavior: W.still.matches ? 'auto' : 'smooth' }));
      box.append(q);
    }
    box.append(...W.readable(item.text));
    if (item.session && Array.isArray(item.choices) && item.choices.length) {
      box.classList.add('asks');
      box.append(choicesEl(c, item));
    }
    if (item.session && /kept|undone/.test(item.suggest?.state)) box.append(ruleLine(item));
    const stamp = W.stampOf(item, c, item === c && !c.resolved ? `#${W.numberOf(c)} · ` : '');
    // The offer sits in your message's corner in place of the time and tick, so the bubble keeps its size (Leo, 17 Nov:
    // 57 + 60, then "it makes bigger row"). Kept or gone, the time comes back.
    const offer = !item.session && offerOn(item);
    if (offer) {
      stamp.classList.add('offering');
      stamp.prepend(offer);
    }
    W.stamped(box, stamp);
    return box;
  };
  const shown = new Set();
  const all = [c, ...W.repliesOf(c.id)];
  const firstNew = all.find((x) => fresh.has(x.id));
  for (const item of all) {
    if (item === firstNew && item !== c) body.append(W.el('div', { class: 'newline' }, 'new'));
    body.append(itemEl(item));
    shown.add(item.id);
  }
  card.sync = () => {
    // A new question with choices, or a pick (from another device): the card is drawn again, so the rows are right.
    if (W.repliesOf(c.id).some((r) => !shown.has(r.id) && (r.choices || r.picked))) return W.render();
    const atEnd = body.scrollHeight - body.scrollTop - body.clientHeight < 48;
    for (const r of W.repliesOf(c.id)) {
      if (shown.has(r.id)) continue;
      const items = card.querySelectorAll('.item');
      const added = itemEl(r);
      added.classList.add('fresh');
      items[items.length - 1].after(added);
      shown.add(r.id);
      W.markSeen([r]);
    }
    if (atEnd) body.scrollTop = body.scrollHeight; // at the newest: the new one comes into view
  };
  // Resolve: admins, and whoever started the thread (its key is kept in their browser). Delete: admins.
  const ownKey = W.store.get(`lab-edit:${c.id}`);
  let actions = null;
  if (W.S.isAdmin || ownKey) {
    actions = W.el('div', { class: 'row acts' });
    const resolve = W.el('button', { class: 'btn', type: 'button' }, c.resolved ? 'reopen' : 'resolve');
    const failed = (btn) => (btn.textContent = 'failed, try again');
    resolve.addEventListener('click', async () => {
      try {
        const closing = !c.resolved; // resolved: the thread is done, so its card closes (reopen keeps it open)
        const { comment } = await W.send({ action: c.resolved ? 'reopen' : 'resolve', id: c.id, ...(ownKey ? { edit: ownKey } : {}) });
        Object.assign(c, comment);
        // Resolving closes the comment at once, a quick fade where it is, not the slow slide down (Leo, 15 Nov).
        if (closing && W.S.openId === c.id) return (W.S.closeFast = true), (W.S.openId = null), W.render();
        W.render();
      } catch {
        failed(resolve);
      }
    });
    const del = W.el('button', { class: 'btn', type: 'button' }, 'delete');
    // Asked in the card itself, not the browser's dialog: the row swaps to the question, same height, nothing moves.
    const yes = W.el('button', { class: 'btn danger', type: 'button' }, 'delete');
    const no = W.el('button', { class: 'btn', type: 'button' }, 'cancel');
    const back = () => {
      actions.replaceChildren(resolve, del);
      del.focus();
    };
    del.addEventListener('click', () => {
      actions.replaceChildren(W.el('span', { class: 'ask' }, W.repliesOf(c.id).length ? 'delete thread?' : 'delete comment?'), yes, no);
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
        await W.send({ action: 'delete', id: c.id }); // the API deletes the replies with it
      } catch {
        return failed(yes);
      }
      W.S.comments = W.S.comments.filter((x) => x.id !== c.id && x.parent !== c.id);
      W.S.openId = null;
      W.render();
    });
    actions.append(...(W.S.isAdmin ? [resolve, del] : [resolve]));
    body.append(actions);
  }
  // Phones: step through the threads from the sheet (J and K on a keyboard).
  if (W.coarse) {
    // As on a computer: no prev / next, just new · N (the bar's ne(w), which the sheet covers) to the next pin with
    // something new, top to bottom of the page, further down first.
    const topOf = (x) => W.position(x.anchor || {}).top;
    const here = topOf(c);
    const fresh = W.threads().filter((x) => !W.isPage(x) && x.id !== c.id && W.unread(x).length).map((x) => [x, topOf(x)]);
    fresh.sort((p, q) => (p[1] > here ? 0 : 1) - (q[1] > here ? 0 : 1) || p[1] - q[1]);
    const nav = W.el('div', { class: 'row nav' });
    if (fresh.length) {
      const b = W.el('button', { class: 'btn', type: 'button' }, `new · ${fresh.length} ›`);
      b.addEventListener('pointerdown', (e) => e.preventDefault()); // an open keyboard stays open (see goTo)
      b.addEventListener('click', () => W.goTo(fresh[0][0]));
      nav.append(b);
    }
    // One row on phones: new on the left, reopen / delete on the right, at the top under the handle like a header, so
    // the reply box below stands alone as the chat's does (and the messages fade under it the same way).
    if (actions) nav.append(actions);
    if (nav.firstChild) card.insertBefore(nav, body);
  }
  foot.append(
    W.composer({
      placeholder: 'reply',
      autofocus: focus, // a question with choices too: its rows have no keys, so the reply box keeps the focus
      draftKey: `lab-typing:${W.S.page}:${c.id}`,
      onSubmit: async (name, text) => {
        const { comment } = await W.send({ name, text, parent: c.id });
        W.S.comments.push(comment);
        W.markSeen([comment]);
        // Writing in a done thread reopens it (the lab does the same): it shows as open at once, pin and buttons.
        if (c.resolved) {
          c.resolved = false;
          W.render();
          // The card is drawn again: keep it where you were, at the newest message, with the cursor in the box.
          const again = W.S.openCard?.querySelector('.body');
          if (again) again.scrollTop = again.scrollHeight;
          W.S.openCard?.querySelector('textarea')?.focus({ preventScroll: true });
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

// ---------- a question with choices (labit reply --choice …) ----------
// V1 "plain list" (Leo, 18 Nov): no bubble, no letters, no tags. The question, then the versions as a plain list of rows
// (the page's own words "· now", a tick on the one shown), then one Keep. Keep sends the pick as a reply, "Picked B: …"
// (the letter is for the agent, who listed them), with picked: { of, n } (lib/schema.mjs). No keys on the card.
// The open question in a thread: the agent's last message with choices that nobody has picked on yet.
const pickOf = (c, ask) => W.repliesOf(c.id).filter((r) => r.picked?.of === ask.id).pop();
export function openAsk(c) {
  const asks = W.repliesOf(c.id).filter((r) => r.session && Array.isArray(r.choices) && r.choices.length);
  const ask = asks[asks.length - 1];
  return ask && !pickOf(c, ask) && !c.resolved ? ask : null;
}
const LETTER = (n: number) => String.fromCharCode(65 + n);
// The rows of a question, under it. Answered (or an older one): the rows as they were, the pick ticked. Open: rows to
// pick, Keep under them.
function choicesEl(c, ask) {
  const box = W.el('div', { class: 'choices' });
  const list = W.el('div', { class: 'rows' });
  box.append(list);
  const pick = pickOf(c, ask);
  const live = !pick && openAsk(c) === ask;
  const rows: { n: number; el: HTMLButtonElement }[] = [];
  const row = (n: number, text: string) => {
    const b = W.el('button', { class: 'choice', type: 'button', 'data-n': String(n), ...(live ? {} : { disabled: '' }) }) as HTMLButtonElement;
    b.append(W.el('span', { class: 'tx', dir: 'auto' }, text));
    if (pick && pick.picked.n === n) b.classList.add('picked');
    rows.push({ n, el: b });
    return b;
  };
  ask.choices.forEach((t, n) => list.append(row(n, t)));
  if (pick && pick.picked.n < 0) box.append(W.el('span', { class: 'note' }, `kept as it was · ${pick.name}`));
  if (!live) return box;

  // The row picked (tapped): the agent's own pick at first.
  let cur = ask.recommend ?? -1;
  // Always "Keep", always on (Leo, 18 Nov: "just keep all the time"); with no row ticked it keeps the words as they are.
  const keep = W.el('button', { class: 'keep', type: 'button' }, 'Keep') as HTMLButtonElement;
  const select = (n: number) => {
    cur = n;
    for (const r of rows) {
      r.el.classList.toggle('on', r.n === n);
      r.el.setAttribute('aria-pressed', String(r.n === n));
    }
    if (!keep.disabled) keep.textContent = 'Keep'; // after "your name first" or "failed, try again"
  };
  for (const r of rows) r.el.addEventListener('click', () => select(r.n));
  box.append(keep);
  keep.addEventListener('click', async () => {
    if (keep.disabled) return;
    const name = String(W.store.get('lab-name') || '').trim();
    if (!name) {
      keep.textContent = 'your name first';
      return void W.S.openCard?.querySelector('textarea')?.focus({ preventScroll: true });
    }
    const n = cur; // -1: the words as they are (a choice that is the same words is picked by its letter)
    const text = n < 0 ? 'Keep as is: none of these.' : `Picked ${LETTER(n)}: ${ask.choices[n]}`;
    keep.disabled = true;
    try {
      const { comment } = await W.send({ name, text, parent: ask.id, to: ask.id, picked: n });
      W.S.comments.push(comment);
      W.markSeen([comment]);
      W.render();
    } catch {
      keep.disabled = false;
      keep.textContent = 'failed, try again';
    }
  });
  select(cur);
  return box;
}

