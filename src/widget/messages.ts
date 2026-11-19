// Small pieces of a message: what a comment is on, in a few words (the list), and the time and mark in a bubble's
// corner (chat and threads). Part of the comment widget (src/comments.js bundles it).

type Deps = {
  el: (tag: string, attrs?: Record<string, string>, text?: string) => HTMLElement;
  mine: (c: any) => boolean;
  repliesOf: (id: string) => any[];
  lineUp: () => Map<string, { s: string; n: number }>;
  ord: (n: number) => string;
};

// Set once by the widget at startup (bindMessages).
let d: Deps;
export function bindMessages(deps: Deps) {
  d = deps;
}

export const stampOf = (m: any, root: any, prefix = ''): HTMLElement => {
  const { el, mine, repliesOf, lineUp, ord } = d;
  const at = new Date(m.createdAt);
  const time = at.toDateString() === new Date().toDateString() ? at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : at.toLocaleDateString([], { day: 'numeric', month: 'short' });
  const stamp = el('span', { class: 'stamp' });
  stamp.append(el('span', { class: 'tm' }, prefix + time));
  if (mine(m) && !m.session) {
    const thread = root ? [root, ...repliesOf(root.id)] : [m];
    const latest = !thread.some((x) => !x.session && x.createdAt > m.createdAt);
    // Answered: a reply from the agent after it, or the thread done with nothing after it, as a plain "go" is (the
    // agent resolves it without a word: one green ✓ where the grey ✓✓ was, Leo 17 Nov).
    const answered = thread.some((x) => x.session && x.createdAt > m.createdAt) || Boolean(root?.resolved && latest);
    // The agent is on this very message (its newest one in the thread): the ring, as on the pin (grey once it has gone
    // quiet). Answered: green ✓. Handed over but behind another: its place in line.
    const sg = !answered && latest && root ? lineUp().get(root.id) : null;
    if (sg?.s === 'now' || sg?.s === 'stale') {
      stamp.classList.add('busy');
      stamp.append(el('span', { class: `ring${sg.s === 'stale' ? ' stale' : ''}`, role: 'img', 'aria-label': sg.s === 'stale' ? 'no sign from the agent for a while' : 'the agent is on it' }));
    } else if (answered) {
      stamp.classList.add('ans');
      stamp.append(el('span', { class: 'tick', role: 'img', 'aria-label': 'answered' }, '✓'));
    } else {
      const got = root?.handedAt && root.handedAt >= m.createdAt;
      stamp.append(el('span', { class: `tick${got ? ' got' : ''}`, role: 'img', 'aria-label': got ? 'delivered to the agent' : 'sent' }, got ? '✓✓' : '✓'));
      if (sg?.s === 'wait') stamp.firstChild!.textContent = `waiting · ${ord(sg.n)} in line · ${prefix}${time}`;
    }
  }
  return stamp;
};
