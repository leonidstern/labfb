// Part of the comment widget (src/comments.js bundles it). Uses the widget's own parts through W, set once at startup.

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

export function grab(pin, c) {
  pin.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
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

export function threadCard(c, fresh = new Set(), focus = false) {
  const card = W.el('div', { class: 'card' });
  // The thread scrolls in .body; the step buttons and the reply box stay put in .foot (phones: the sheet's bottom).
  const body = W.el('div', { class: 'body' });
  const foot = W.el('div', { class: 'foot' });
  card.append(W.el('div', { class: 'handle' }), body, foot);
  card.addEventListener('click', (e) => e.stopPropagation());
  // Messages as in the chat: bubbles (yours on the right), the time and ✓ ✓✓ in the corner, ✅ on a done answer, and
  // a "new" line above the first one you haven't read. The thread's number (as in the agent text) leads its time.
  body.classList.add('msgs');
  const itemEl = (item) => {
    const box = W.el('div', { class: `item msg${W.mine(item) && !item.session ? ' mine' : ''}`, 'data-id': item.id, ...(W.agentOf(item) ? { 'data-agent': W.agentOf(item) } : {}) });
    box.append(W.nameLine(item.name, false), ...W.readable(item.text));
    W.stamped(box, W.stampOf(item, c, item === c && !c.resolved ? `#${W.numberOf(c)} · ` : ''));
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
    for (const r of W.repliesOf(c.id)) {
      if (shown.has(r.id)) continue;
      const items = card.querySelectorAll('.item');
      const added = itemEl(r);
      added.classList.add('fresh');
      items[items.length - 1].after(added);
      shown.add(r.id);
      W.markSeen([r]);
    }
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
      autofocus: focus,
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
