// Part of the comment widget (src/comments.js bundles it). Uses the widget's own parts through W, set once at startup.
//
// "Since you looked": when the agent changes a page, you don't hunt for what moved. The page's blocks (paragraphs,
// headings, list items, cells…) are kept as you last looked at them; on load and on every hot update the page is
// compared with that. A badge by the listening pill says how much changed, a mark in the margin sits by each block
// that was added (green), changed (amber) or removed (a red tick where it was), and a tap on a mark shows the old
// and new words. "seen" makes now the new "last looked". A first visit just remembers the page.
// The last look is kept per person in the lab (/_lab/api/looked, by the name you gave), so your Mac and your phone
// agree, and in localStorage (`lab-looked:<page>`, { at, files, blocks }) as a cache that works with the lab down.
// Without a name it stays in the browser. Flag: sinceLooked (lib/flags.ts).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let W: any;
export function bindChanges(w: unknown) {
  W = w;
}

const BLOCK = 'h1,h2,h3,h4,h5,h6,p,li,dt,dd,td,th,pre,blockquote,figcaption,caption,summary,label,legend';
const CUT = 2000;
// One block's words, as they are kept and compared: spacing squeezed. A very long one is cut, with a hash of what was
// cut off, so a change far down in it still counts and the kept copy stays small.
function words(e: Element) {
  const t = (e.textContent || '').replace(/\s+/g, ' ').trim();
  if (t.length <= CUT) return t;
  let h = 0;
  for (let i = CUT; i < t.length; i++) h = (Math.imul(h, 31) + t.charCodeAt(i)) | 0;
  return `${t.slice(0, CUT)}…${(h >>> 0).toString(36)}`;
}

const LABEL = { add: 'new', chg: 'changed', rm: 'removed' };
type Mark = { kind: 'add' | 'chg' | 'rm'; el: Element | null; after?: Element | null; old?: string; now?: string };
// dirty: made here and not yet in the lab.
type Look = { at: number; files: string; blocks: string[]; dirty?: 1 };

// Every block in order: the innermost ones only (a <li> holding a <p> counts as its <p>), with some text. Hidden ones
// stay in (a closed <details>, a collapsed menu): opening one must not read as new words; only the laid-out ones get a mark.
const blocks = (): Element[] => [...document.body.querySelectorAll(BLOCK)].filter((e) => !W.host.contains(e) && !e.closest('[data-lab-comments], script, style, template, noscript') && !e.querySelector(BLOCK) && words(e));

// Which old and new blocks are the same block: the longest common run of two lists (same strings, in order).
function lcs(a: string[], b: string[]): Array<[number, number]> {
  let s = 0;
  while (s < a.length && s < b.length && a[s] === b[s]) s++;
  let e = 0;
  while (e < a.length - s && e < b.length - s && a[a.length - 1 - e] === b[b.length - 1 - e]) e++;
  const A = a.slice(s, a.length - e);
  const B = b.slice(s, b.length - e);
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < s; i++) pairs.push([i, i]);
  const tail = () => {
    for (let k = 0; k < e; k++) pairs.push([a.length - e + k, b.length - e + k]);
    return pairs;
  };
  if (A.length * B.length > 4e6) return tail(); // too big: treat the middle as all changed
  const t = Array.from({ length: A.length + 1 }, () => new Uint16Array(B.length + 1));
  for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--) t[i][j] = A[i] === B[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
  for (let i = 0, j = 0; i < A.length && j < B.length; ) {
    if (A[i] === B[j]) pairs.push([s + i++, s + j++]);
    else if (t[i + 1][j] >= t[i][j + 1]) i++;
    else j++;
  }
  return tail();
}

// How alike two blocks are, by shared words: an edited sentence pairs with its old self; a new one doesn't.
function alike(x: string, y: string) {
  const a = new Set(x.toLowerCase().split(' '));
  const b = y.toLowerCase().split(' ');
  return b.filter((w) => a.has(w)).length / Math.max(a.size, b.length, 1);
}
// The same block with its numbers changed (a clock, a counter), or nearly the same words.
const alikeish = (x: string, y: string) => x.replace(/\d+/g, '#') === y.replace(/\d+/g, '#') || alike(x, y) > 0.34;

// Old against new. `els` are the page's blocks now; the gaps between matched blocks hold what was removed and what was
// added, an alike pair counted as one changed block.
function diff(old: string[], els: Element[]): Mark[] {
  const now = els.map(words);
  const lit = els.map((e) => e.getClientRects().length > 0); // laid out: a block that is hidden gets no mark
  const near = (k: number, step: number) => {
    for (; k >= 0 && k < els.length; k += step) if (lit[k]) return els[k];
    return null;
  };
  const marks: Mark[] = [];
  let i = 0;
  let j = 0;
  const gap = (i2: number, j2: number) => {
    const gone = old.slice(i, i2);
    const used = new Set<number>();
    for (let k = j; k < j2; k++) {
      let best = -1;
      let score = 0.34;
      gone.forEach((g, m) => {
        const sc = used.has(m) ? 0 : alike(g, now[k]);
        if (sc > score) {
          best = m;
          score = sc;
        }
      });
      if (best >= 0) used.add(best);
      if (lit[k]) marks.push(best >= 0 ? { kind: 'chg', el: els[k], old: gone[best], now: now[k] } : { kind: 'add', el: els[k], now: now[k] });
    }
    gone.forEach((g, m) => !used.has(m) && marks.push({ kind: 'rm', el: near(j2, 1), after: near(j2 - 1, -1), old: g }));
  };
  for (const [pi, pj] of lcs(old, now)) {
    gap(pi, pj);
    i = pi + 1;
    j = pj + 1;
  }
  gap(old.length, els.length);
  // A block that only moved is a removal and an addition of the same words: neither is a change.
  for (const r of marks.filter((m) => m.kind === 'rm')) {
    const a = marks.findIndex((m) => m.kind === 'add' && m.now === r.old);
    if (a >= 0) {
      marks.splice(a, 1);
      marks.splice(marks.indexOf(r), 1);
    }
  }
  return marks;
}

// Old and new words, side by side: what went struck through in red, what came in green.
function wordDiff(a: string, b: string) {
  const split = (s: string) => s.split(/(\s+)/).filter(Boolean);
  const A = split(a);
  const B = split(b);
  const frag = document.createDocumentFragment();
  let i = 0;
  let j = 0;
  const put = (cls: string, t: string) => {
    const last = frag.lastChild as HTMLElement | null;
    if (last && last.className === cls) last.textContent += t;
    else frag.append(W.el('span', { class: cls }, t));
  };
  for (const [x, y] of lcs(A, B)) {
    while (i < x) put('del', A[i++]);
    while (j < y) put('ins', B[j++]);
    put('same', A[i++]);
    j++;
  }
  while (i < A.length) put('del', A[i++]);
  while (j < B.length) put('ins', B[j++]);
  return frag;
}

export function startChanges() {
  const key = () => `lab-looked:${W.S.page}`;
  const box = W.el('div', { class: 'chgs' });
  W.root.insertBefore(box, W.root.querySelector('.layer'));
  const badge = W.el('div', { class: 'since', role: 'status' });
  badge.hidden = true;
  badge.addEventListener('click', (e) => e.stopPropagation()); // its buttons open a mark; a click elsewhere closes it
  W.root.querySelector('.left').append(badge);
  let marks: Mark[] = [];
  let shown = true;
  let openAt: Mark | null = null;
  let step = 0;
  let gen = 0;
  let timer: ReturnType<typeof setTimeout>;
  let full = false; // the browser's store has no room: no look can be kept, so nothing is compared

  // What the lab has saved so far, as this page knows it: a new word here means a file was saved (hot saves count in data-hot).
  const saves = () => `${W.script.dataset.lab}.${W.script.dataset.version}.${W.script.dataset.hot || 0}`;
  const read = (): Look | null => {
    try {
      const v = JSON.parse(W.store.get(key()) || 'null');
      // The first build kept a plain list of blocks, with no time or saves.
      return Array.isArray(v) ? { at: 0, files: '', blocks: v } : v && Array.isArray(v.blocks) ? v : null;
    } catch {
      return null;
    }
  };
  const write = (look: Look) => {
    const s = JSON.stringify(look);
    W.store.set(key(), s);
    full = W.store.get(key()) !== s;
  };

  // The lab keeps each person's last look, by name: your phone and your Mac agree. The lab's clock stamps it (a phone's
  // can be minutes off), so a look made here waits as `dirty` until the lab has it, and wins over the lab's copy.
  const api = () => W.script.dataset.live.replace(/live$/, 'api/looked');
  const who = () => W.store.get('lab-name').trim();
  let pushing = false;
  let synced = '';
  const push = async () => {
    const look = read();
    const name = who();
    // A very large page stays in this browser: the lab keeps at most 4,000 blocks and 400 KB of a look.
    if (!look || !name || pushing || look.blocks.length > 4000 || JSON.stringify(look.blocks).length > 4e5) return;
    pushing = true;
    try {
      const res = await fetch(api(), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, page: W.S.page, blocks: look.blocks }) });
      if (res.ok && read()?.at === look.at) write({ ...look, at: (await res.json()).at, dirty: undefined });
    } catch {} // the lab is down: it goes with the next check
    pushing = false;
  };
  // Whichever is newer wins: the lab's copy comes in, or ours goes up. A browser's old plain list (at 0) goes up
  // when the lab has nothing, and gives way to the lab's copy when it has one.
  const sync = async () => {
    const name = who();
    const page = W.S.page;
    if (!name) return;
    try {
      const r = await (await fetch(`${api()}?name=${encodeURIComponent(name)}&page=${encodeURIComponent(page)}`, { cache: 'no-store' })).json();
      if (page !== W.S.page) return;
      const mine = read();
      if (r.blocks && !mine?.dirty && (!mine || mine.at < r.at)) write({ at: r.at, files: '', blocks: r.blocks });
      else if (mine && (!r.blocks || mine.dirty || mine.at > r.at)) await push();
      synced = `${page}|${name}`;
    } catch {}
  };
  // Now is your last look.
  const remember = () => {
    write({ at: Date.now(), files: saves(), blocks: blocks().map(words), dirty: 1 });
    push();
  };

  // The margin a mark sits in: left of the block, or of its list for a list item (its bullet sits outside it).
  const edge = (el: Element) => (el.localName === 'li' && el.parentElement ? el.parentElement : el).getBoundingClientRect().left;
  const rectOf = (m: Mark) => {
    const r = m.el?.getBoundingClientRect();
    if (m.kind !== 'rm') return r;
    // A removed block: a short tick between the blocks it sat between.
    const a = m.after?.getBoundingClientRect();
    const top = a ? a.bottom : r ? r.top - 8 : 0;
    const left = m.el ? edge(m.el) : m.after ? edge(m.after) : 30;
    return { top: top - 2, bottom: top + 10, left, height: 12 } as DOMRect;
  };
  // Marks follow the page's own words, not the OS: a light page gets the light set, a dark page the dark one.
  const dark = () => {
    const [r, g, b] = (getComputedStyle(document.body).color.match(/[\d.]+/g) || []).map(Number);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 128;
  };
  // The thread whose pin sits in a block, if any, so the card can say whose note it is.
  const noteIn = (el: Element | null) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return W.threads().find((c) => {
      if (c.resolved || c.anchor?.kind === 'page') return false;
      const p = W.position(c.anchor || {});
      return p.top >= r.top + scrollY - 2 && p.top <= r.bottom + scrollY + 2 && p.left >= r.left + scrollX - 2 && p.left <= r.right + scrollX + 2;
    });
  };
  const place = () => {
    box.classList.toggle('dk', dark());
    if (!marks.length || !shown) return box.replaceChildren();
    const nodes: Node[] = [];
    for (const m of marks) {
      const r = rectOf(m);
      if (!r || (!r.height && m.kind !== 'rm')) continue;
      const b = W.el('button', { type: 'button', class: `chg-mark ${m.kind}${openAt === m ? ' open' : ''}`, 'aria-label': `${LABEL[m.kind]} since you looked` });
      const bar = Math.max(2, (m.kind === 'rm' ? r.left : edge(m.el as Element)) - 14); // the bar, 14px left of the block and never off the screen
      b.style.left = `${bar - 20 + scrollX}px`; // the button reaches 20px further left than the bar: a thumb can hit it
      b.style.top = `${r.top + scrollY}px`;
      b.style.height = `${Math.max(r.height, 12)}px`;
      b.onclick = (e) => {
        e.stopPropagation();
        openAt = openAt === m ? null : m;
        place();
      };
      nodes.push(b);
      if (openAt === m) {
        const note = noteIn(m.el || m.after || null);
        const since = new Date(read()?.at || 0).getTime();
        const answer = note && W.repliesOf(note.id).find((x) => x.session && Date.parse(x.createdAt) > since);
        const head = note ? W.el('button', { type: 'button', class: 'chg-head note' }, `for note ${W.numberOf(note)}${answer ? ` · ${answer.name}` : ''}`) : W.el('div', { class: 'chg-head' }, `${LABEL[m.kind]} since you looked`);
        if (note) head.onclick = () => W.goTo(note);
        const body = W.el('div', { class: 'chg-body' });
        if (m.kind === 'chg') body.append(wordDiff(m.old || '', m.now || ''));
        else body.append(W.el('span', { class: m.kind === 'rm' ? 'del' : 'ins' }, m.kind === 'rm' ? m.old : m.now));
        const card = W.el('div', { class: 'chg-card' });
        card.append(head, body);
        const w = Math.min(320, innerWidth - 16);
        card.style.left = `${Math.min(Math.max(8, bar), innerWidth - w - 8) + scrollX}px`;
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
    const count = W.el('button', { type: 'button', class: 'since-count', title: 'go to the next change' });
    count.append(W.el('span', { class: 'since-lbl' }, 'since you looked'));
    for (const [k, sign] of [['add', '+'], ['chg', '~'], ['rm', '−']]) if (n(k as Mark['kind'])) count.append(W.el('b', { class: k }, `${sign}${n(k as Mark['kind'])}`));
    count.onclick = () => {
      if (!shown) {
        shown = true;
        place();
      }
      // In page order, round and round: a changed or removed block opens its card as it is reached.
      const order = marks.filter((m) => rectOf(m)).sort((a, b) => (rectOf(a)?.top ?? 0) - (rectOf(b)?.top ?? 0));
      if (!order.length) return;
      const m = order[step++ % order.length];
      scrollTo({ top: (rectOf(m)?.top ?? 0) + scrollY - innerHeight / 3, behavior: W.still.matches ? 'auto' : 'smooth' });
      openAt = m.kind === 'add' ? null : m;
      place();
    };
    const button = (text: string, onclick: () => void) => {
      const b = W.el('button', { type: 'button', class: 'since-btn' }, text);
      b.onclick = onclick;
      return b;
    };
    badge.replaceChildren(
      count,
      button(shown ? 'hide' : 'show', () => {
        shown = !shown;
        openAt = null;
        place();
        drawBadge();
      }),
      button('seen ✓', () => {
        remember();
        show([]);
      }),
    );
  };

  const show = (next: Mark[]) => {
    // The open card stays open across a new check when its change is still there.
    const was = openAt;
    marks = next;
    openAt = (was && next.find((m) => m.kind === was.kind && m.old === was.old && m.now === was.now)) || null;
    place();
    drawBadge();
  };

  const check = async () => {
    const run = ++gen;
    clearTimeout(timer);
    if (!document.body || !W.S.on || full) return show([]); // comments hidden: no badge, no marks; the last look stays
    // The first look here may not be your first: the lab may know one from another device (or have nothing of ours yet).
    if (who() && (synced !== `${W.S.page}|${who()}` || read()?.dirty)) await sync();
    const was = read();
    if (run !== gen) return;
    if (!was) return remember(); // first visit: nothing to compare yet
    if (was.files === saves()) return show([]); // no file was saved since your look: whatever moves on the page is the page's own
    // Words that change by themselves (a clock, a counter) are not an edit: the page is read twice, a second apart, and
    // a block that differs between the two is never marked.
    const first = blocks().map(words);
    timer = setTimeout(() => {
      if (run !== gen) return;
      const els = blocks();
      const loud = first.length === els.length ? els.filter((e, i) => words(e) !== first[i]) : [];
      const said = loud.map(words);
      show(diff(was.blocks.filter((t) => !said.some((l) => alikeish(t, l))), els.filter((e) => !loud.includes(e))));
    }, 1000);
  };
  W.S.checkChanges = check;
  W.S.syncLooked = () => sync().then(check); // another device made a look
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
  addEventListener('keydown', (e) => e.key === 'Escape' && openAt && ((openAt = null), place()));
  addEventListener('storage', (e) => e.key === key() && check()); // seen in another tab of this browser
}
