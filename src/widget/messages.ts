// Small pieces of a message: what a comment is on, in a few words (the list), and the time and mark in a bubble's
// corner (chat and threads). Part of the comment widget (src/comments.js bundles it).

type Deps = {
  el: (tag: string, attrs?: Record<string, string>, text?: string) => HTMLElement;
  mine: (c: any) => boolean;
  repliesOf: (id: string) => any[];
  workState: (c: any) => string[];
};

// Set once by the widget at startup (bindMessages).
let d: Deps;
export function bindMessages(deps: Deps) {
  d = deps;
}

// What a comment is on, in a few words, so the list reads without the page: the quoted words, else the text of the
// pinned element or, when that says too little ("4", an icon), of the nearest box around it; else its section.
export const onWhat = (c: any): string => {
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

export const stampOf = (m: any, root: any, prefix = ''): HTMLElement => {
  const { el, mine, repliesOf, workState } = d;
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
