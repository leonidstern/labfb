// Part of the comment widget (src/comments.js bundles it). Uses the widget's own parts through W, set once at startup.
//
// "Since you looked": when the agent changes a page, you don't hunt for what moved. This browser keeps the page's
// blocks (paragraphs, headings, list items, cells…) as you last looked at them; on load and on every hot update the
// page is compared with that. A badge in the bottom-left says how much changed, a mark in the margin sits by each
// block that was added (green), changed (amber) or removed (a red tick where it was), and a tap on a mark shows the
// old and new words. "seen" makes now the new "last looked". A first visit just remembers the page.
// Per browser (localStorage, `lab-looked:<page>`): each device has its own "last looked".

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let W: any;
export function bindChanges(w: unknown) {
  W = w;
}

const BLOCK = 'h1,h2,h3,h4,h5,h6,p,li,dt,dd,td,th,pre,blockquote,figcaption,caption,summary,label,legend';
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

type Mark = { kind: 'add' | 'chg' | 'rm'; el: Element | null; after?: Element | null; old?: string; now?: string };

// The page's blocks in order: the innermost ones only (a <li> holding a <p> counts as its <p>), with some text.
function blocks(): Element[] {
  const all = [...document.body.querySelectorAll(BLOCK)].filter((e) => !W.host.contains(e) && !e.closest('[data-lab-comments], script, style, template, noscript'));
  return all.filter((e) => !e.querySelector(BLOCK) && norm(e.textContent || '') && (e as HTMLElement).offsetParent !== null);
}

// The longest common run of two lists (same strings, in order): which old and new blocks are the same block.
function lcs(a: string[], b: string[]): Array<[number, number]> {
  let s = 0;
  while (s < a.length && s < b.length && a[s] === b[s]) s++;
  let e = 0;
  while (e < a.length - s && e < b.length - s && a[a.length - 1 - e] === b[b.length - 1 - e]) e++;
  const A = a.slice(s, a.length - e);
  const B = b.slice(s, b.length - e);
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < s; i++) pairs.push([i, i]);
  if (A.length * B.length > 4e6) return pairs.concat(Array.from({ length: e }, (_, k) => [a.length - e + k, b.length - e + k]) as Array<[number, number]>); // too big: treat the middle as all changed
  const t = Array.from({ length: A.length + 1 }, () => new Uint16Array(B.length + 1));
  for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--) t[i][j] = A[i] === B[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
  for (let i = 0, j = 0; i < A.length && j < B.length; ) {
    if (A[i] === B[j]) pairs.push([s + i++, s + j++]);
    else if (t[i + 1][j] >= t[i][j + 1]) i++;
    else j++;
  }
  for (let k = 0; k < e; k++) pairs.push([a.length - e + k, b.length - e + k]);
  return pairs;
}

const words = (s: string) => s.split(/(\s+)/).filter(Boolean);
// How alike two blocks are, by shared words: an edited sentence pairs with its old self; a new one doesn't.
function alike(x: string, y: string) {
  const a = new Set(x.toLowerCase().split(' '));
  const b = y.toLowerCase().split(' ');
  return b.filter((w) => a.has(w)).length / Math.max(a.size, b.length, 1);
}

function diff(old: string[], els: Element[]): Mark[] {
  const now = els.map((e) => norm(e.textContent || ''));
  const pairs = lcs(old, now);
  const marks: Mark[] = [];
  let i = 0;
  let j = 0;
  // Each gap between matched blocks: removed old ones and added new ones, an alike pair counted as one changed block.
  const gap = (i2: number, j2: number) => {
    const gone = old.slice(i, i2);
    const added = els.slice(j, j2);
    const used = new Set<number>();
    added.forEach((el, k) => {
      const t = now[j + k];
      let best = -1;
      let score = 0.34;
      gone.forEach((g, m) => {
        if (used.has(m)) return;
        const sc = alike(g, t);
        if (sc > score) ((best = m), (score = sc));
      });
      if (best >= 0) {
        used.add(best);
        marks.push({ kind: 'chg', el, old: gone[best], now: t });
      } else marks.push({ kind: 'add', el, now: t });
    });
    const before = j2 < els.length ? els[j2] : null;
    gone.forEach((g, m) => !used.has(m) && marks.push({ kind: 'rm', el: before, after: j > 0 ? els[j - 1] : null, old: g }));
  };
  for (const [pi, pj] of pairs) {
    gap(pi, pj);
    i = pi + 1;
    j = pj + 1;
  }
  gap(old.length, els.length);
  return marks;
}

// Old and new words, side by side: what went struck through in red, what came in green.
function wordDiff(a: string, b: string) {
  const A = words(a);
  const B = words(b);
  const keep = new Set<string>();
  for (const [x, y] of lcs(A, B)) keep.add(`${x},${y}`);
  const frag = document.createDocumentFragment();
  let i = 0;
  let j = 0;
  const put = (cls: string, t: string) => {
    const last = frag.lastChild as HTMLElement | null;
    if (last && last.className === cls) last.textContent += t;
    else frag.append(Object.assign(document.createElement('span'), { className: cls, textContent: t }));
  };
  for (const [x, y] of lcs(A, B)) {
    while (i < x) put('del', A[i++]);
    while (j < y) put('ins', B[j++]);
    put('same', A[i]);
    i++;
    j++;
  }
  while (i < A.length) put('del', A[i++]);
  while (j < B.length) put('ins', B[j++]);
  return frag;
}

export function startChanges() {
  const key = () => `lab-looked:${W.S.page}`;
  const box = document.createElement('div');
  box.className = 'chgs';
  W.root.insertBefore(box, W.root.querySelector('.layer'));
  const badge = document.createElement('div');
  badge.className = 'since';
  badge.hidden = true;
  badge.addEventListener('click', (e) => e.stopPropagation()); // its buttons open a mark; a click elsewhere closes it
  W.root.querySelector('.left').append(badge);
  let marks: Mark[] = [];
  let shown = true;
  let openAt: Mark | null = null;
  let step = 0;

  const remember = () => W.store.set(key(), JSON.stringify(blocks().map((e) => norm(e.textContent || ''))));
  const kept = (): string[] | null => {
    try {
      const v = JSON.parse(W.store.get(key()) || 'null');
      return Array.isArray(v) ? v : null;
    } catch {
      return null;
    }
  };

  // The margin a mark sits in: left of the block, or of its list for a list item (its bullet sits outside it).
  const edge = (el: Element) => (el.localName === 'li' && el.parentElement ? el.parentElement : el).getBoundingClientRect().left;
  const rectOf = (m: Mark) => {
    const r = m.el?.getBoundingClientRect();
    if (m.kind !== 'rm') return r;
    // A removed block: a short tick between the blocks it sat between.
    const a = m.after?.getBoundingClientRect();
    const top = a ? a.bottom : r ? r.top - 8 : 0;
    const left = (m.el ? edge(m.el) : m.after ? edge(m.after) : 30) + 14;
    return { top: top - 2, bottom: top + 10, left, height: 12 } as DOMRect;
  };
  const place = () => {
    if (!marks.length || !shown) return box.replaceChildren();
    const nodes: Node[] = [];
    for (const m of marks) {
      const r = rectOf(m);
      if (!r || (!r.height && m.kind !== 'rm')) continue;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `chg-mark ${m.kind}${openAt === m ? ' open' : ''}`;
      b.setAttribute('aria-label', m.kind === 'add' ? 'added since you looked' : m.kind === 'chg' ? 'changed since you looked: show old and new' : 'removed since you looked: show what it said');
      b.style.left = `${Math.max(2, (m.kind === 'rm' ? r.left : edge(m.el as Element)) - 14) + scrollX}px`;
      b.style.top = `${r.top + scrollY}px`;
      b.style.height = `${Math.max(r.height, 12)}px`;
      b.onclick = (e) => {
        e.stopPropagation();
        openAt = openAt === m ? null : m;
        place();
      };
      nodes.push(b);
      if (openAt === m) {
        const card = document.createElement('div');
        card.className = 'chg-card';
        const head = document.createElement('div');
        head.className = 'chg-head';
        head.textContent = m.kind === 'add' ? 'new since you looked' : m.kind === 'chg' ? 'changed since you looked' : 'removed since you looked';
        const body = document.createElement('div');
        body.className = 'chg-body';
        if (m.kind === 'chg') body.append(wordDiff(m.old || '', m.now || ''));
        else body.append(Object.assign(document.createElement('span'), { className: m.kind === 'rm' ? 'del' : 'ins', textContent: m.kind === 'rm' ? m.old : m.now }));
        card.append(head, body);
        card.style.left = `${Math.min(Math.max(8, r.left - 14) + scrollX, scrollX + innerWidth - 336)}px`;
        card.style.top = `${r.top + scrollY + Math.max(r.height, 12) + 6}px`;
        card.onclick = (e) => e.stopPropagation();
        nodes.push(card);
      }
    }
    box.replaceChildren(...nodes);
  };

  const drawBadge = () => {
    const n = (k: Mark['kind']) => marks.filter((m) => m.kind === k).length;
    badge.hidden = !marks.length;
    if (!marks.length) return;
    const parts = [['add', '+', n('add')], ['chg', '~', n('chg')], ['rm', '−', n('rm')]].filter(([, , c]) => c);
    const count = document.createElement('button');
    count.type = 'button';
    count.className = 'since-count';
    count.title = 'go to the next change';
    count.append(Object.assign(document.createElement('span'), { className: 'since-lbl', textContent: 'since you looked' }));
    for (const [k, sign, c] of parts) count.append(Object.assign(document.createElement('b'), { className: String(k), textContent: `${sign}${c}` }));
    count.onclick = () => {
      if (!shown) ((shown = true), place());
      const visible = marks.filter((m) => rectOf(m));
      if (!visible.length) return;
      const m = visible[step++ % visible.length];
      const r = rectOf(m) as DOMRect;
      scrollTo({ top: r.top + scrollY - innerHeight / 3, behavior: W.still.matches ? 'auto' : 'smooth' });
      openAt = m.kind === 'add' ? null : m;
      place();
    };
    const hide = document.createElement('button');
    hide.type = 'button';
    hide.className = 'since-btn';
    hide.textContent = shown ? 'hide' : 'show';
    hide.onclick = () => {
      shown = !shown;
      openAt = null;
      place();
      drawBadge();
    };
    const seen = document.createElement('button');
    seen.type = 'button';
    seen.className = 'since-btn';
    seen.textContent = 'seen ✓';
    seen.title = 'what you see now becomes "last looked"';
    seen.onclick = () => {
      remember();
      marks = [];
      openAt = null;
      place();
      drawBadge();
    };
    badge.replaceChildren(count, hide, seen);
  };

  const check = () => {
    if (!document.body) return;
    const old = kept();
    if (!old) return remember(); // first visit: nothing to compare yet
    marks = diff(old, blocks());
    if (!marks.length) remember();
    if (openAt && !marks.includes(openAt)) openAt = null;
    place();
    drawBadge();
  };
  W.S.checkChanges = check;
  // After the page's own scripts and fonts have settled, so their first paint doesn't count as a change.
  const first = () => setTimeout(check, 400);
  if (document.readyState === 'complete') first();
  else addEventListener('load', first, { once: true });
  let frame = 0;
  const later = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(place);
  };
  addEventListener('resize', later);
  addEventListener('scroll', later, { capture: true, passive: true });
  if ('ResizeObserver' in window) new ResizeObserver(later).observe(document.body);
  addEventListener('click', () => openAt && ((openAt = null), place()));
}
