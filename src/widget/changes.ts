// Part of the comment widget (src/comments.js bundles it). Uses the widget's own parts through W, set once at startup.
//
// "New since you looked": when the agent adds parts to a page (a section, a version, a card: anything with an id), you
// don't hunt for them. The ids on the page are kept as you last looked at them, each with its label (its heading, or its
// first words); on load and on every hot update the page is compared with that. A "New · 3" pill by the listening pill
// opens a short list of the ids that weren't there, each a link that goes there (as a #id link in a message does).
// One drops off the list when you go to it, or when it has been in view for a second.
// Ids a framework makes up, and the widget's own, don't count. A first visit just remembers the page.
// The last look is kept per person in the lab (/_lab/api/looked, by the name you gave), so your Mac and your phone
// agree, and in localStorage (`lab-looked:<page>`, { at, files, ids }) as a cache that works with the lab down.
// Without a name it stays in the browser. Flag: sinceLooked (lib/flags.ts).
import { noisy } from '../../lib/ids.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let W: any;
export function bindChanges(w: unknown) {
  W = w;
}

type Item = [id: string, label: string];
// dirty: made here and not yet in the lab.
type Look = { at: number; files: string; ids: Item[]; dirty?: 1 };

const HEADING = 'h1,h2,h3,h4,h5,h6,summary,legend,figcaption';
// What an element is called: its heading, else its first words, at most 60 characters.
function label(e: Element) {
  const t = (e.matches(HEADING) ? e : e.querySelector(HEADING) || e).textContent!.replace(/\s+/g, ' ').trim();
  return t.length > 60 ? `${t.slice(0, 59)}…` : t;
}
// The page's ids now, once each, in order: not the widget's, not a script's or a drawing's, not made up by a build.
function items(): Item[] {
  const out: Item[] = [];
  const had = new Set<string>();
  for (const e of document.body.querySelectorAll('[id]')) {
    if (!e.id || had.has(e.id) || noisy(e.id) || W.host.contains(e) || e.closest('[data-lab-comments], script, style, template, noscript, svg')) continue;
    had.add(e.id);
    out.push([e.id, label(e)]);
  }
  return out;
}
export function startChanges() {
  const key = () => `lab-looked:${W.S.page}`;
  // W.el takes one text or node; this one takes any number of nodes.
  const el = (tag: string, attrs: Record<string, string>, ...kids: Array<Node | string>) => {
    const n = W.el(tag, attrs);
    n.append(...kids.filter(Boolean));
    return n;
  };
  const count = el('button', { type: 'button', class: 'since-count', 'aria-expanded': 'false' });
  const rows = el('div', { class: 'news' });
  const panel = el('div', { class: 'since-panel' }, rows);
  panel.hidden = true;
  const badge = el('div', { class: 'since', role: 'status' }, count, panel);
  badge.hidden = true;
  badge.addEventListener('click', (e) => e.stopPropagation()); // a click elsewhere closes the list
  W.root.querySelector('.left').append(badge);
  let news: Item[] = []; // on the page now, not seen yet
  let shown = ''; // the ids the list was drawn for
  let open = false;
  let gen = 0;
  let full = false; // the browser's store has no room: no look can be kept, so nothing is compared

  // What the lab has saved so far, as this page knows it: a new word here means a file was saved (hot saves count in data-hot).
  const saves = () => `${W.script.dataset.lab}.${W.script.dataset.version}.${W.script.dataset.hot || 0}`;
  // A look from before ids (blocks of text) reads as none: the page's ids now are taken as seen (see check).
  const read = (): Look | null => {
    try {
      const v = JSON.parse(W.store.get(key()) || 'null');
      return v && Array.isArray(v.ids) ? v : null;
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
  let later: ReturnType<typeof setTimeout>;
  const push = async () => {
    const look = read();
    const name = who();
    // A very large page stays in this browser: the lab keeps at most 4,000 ids and 400 KB of a look.
    if (!look || !name || pushing || look.ids.length > 4000 || JSON.stringify(look.ids).length > 4e5) return;
    pushing = true;
    try {
      const res = await fetch(api(), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, page: W.S.page, ids: look.ids }) });
      if (res.ok && read()?.at === look.at) write({ ...look, at: (await res.json()).at, dirty: undefined });
    } catch {} // the lab is down: it goes with the next check
    pushing = false;
  };
  // Whichever is newer wins: the lab's copy comes in, or ours goes up. A look from before ids (the lab's has none) is
  // left for check() to replace.
  const sync = async () => {
    const name = who();
    const page = W.S.page;
    if (!name) return;
    try {
      const r = await (await fetch(`${api()}?name=${encodeURIComponent(name)}&page=${encodeURIComponent(page)}`, { cache: 'no-store' })).json();
      if (page !== W.S.page) return;
      const mine = read();
      if (r.ids && !mine?.dirty && (!mine || mine.at < r.at)) write({ at: r.at, files: '', ids: r.ids });
      else if (mine && (!r.ids || mine.dirty || mine.at > r.at)) await push();
      synced = `${page}|${name}`;
    } catch {}
  };
  // Now is your last look: everything on the page is seen.
  const remember = () => {
    write({ at: Date.now(), files: saves(), ids: items(), dirty: 1 });
    push();
  };

  // Gone to, or in view for a second: these are seen. The look gains them, and goes up to the lab a moment later.
  const see = (ids: string[]) => {
    const got = news.filter((n) => ids.includes(n[0]));
    const was = read();
    if (!got.length || !was) return;
    write({ ...was, at: Date.now(), ids: [...was.ids, ...got], dirty: 1 });
    clearTimeout(later);
    later = setTimeout(push, 800);
    news = news.filter((n) => !got.includes(n));
    draw();
  };
  // In view: at least half of it, or half the window when it is taller than that, for a second.
  const waits = new Map<string, ReturnType<typeof setTimeout>>();
  let io: IntersectionObserver | null = null;
  const watch = () => {
    io?.disconnect(); // one that is seen meanwhile is no longer in `news`: its timer finds nothing to do
    waits.forEach(clearTimeout);
    waits.clear();
    if (!news.length || !('IntersectionObserver' in window)) return;
    io = new IntersectionObserver(
      (list) => {
        for (const e of list) {
          const id = e.target.id;
          clearTimeout(waits.get(id));
          if (e.isIntersecting && (e.intersectionRatio >= 0.5 || e.intersectionRect.height >= innerHeight / 2)) waits.set(id, setTimeout(() => !document.hidden && see([id]), 1000));
        }
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    for (const [id] of news) {
      const e = document.getElementById(id);
      if (e) io.observe(e);
    }
  };

  const go = (id: string) => {
    const keys = rows.contains(W.root.activeElement);
    dispatchEvent(new CustomEvent('lab-goto', { detail: id })); // scrolls there and outlines it, as a #id link in a message does
    if (W.coarse) setOpen(false);
    else if (keys) ((rows.firstElementChild || count) as HTMLElement).focus({ preventScroll: true }); // the one gone to has dropped off the list
  };
  const setOpen = (v: boolean) => {
    open = v && news.length > 0;
    panel.hidden = !open;
    count.setAttribute('aria-expanded', String(open));
  };
  const draw = () => {
    badge.hidden = !news.length;
    if (badge.hidden) setOpen(false);
    count.textContent = `New · ${news.length}`;
    const k = news.map((n) => n[0]).join('\n');
    if (k === shown) return;
    shown = k;
    rows.replaceChildren(
      ...news.map(([id, text]) => {
        const a = el('a', { class: 'news-item', href: `#${id}` }, text ? el('span', { class: 'news-label' }, text) : '', el('span', { class: 'news-id' }, `#${id}`));
        a.onclick = (e: Event) => (e.preventDefault(), go(id));
        return a;
      }),
    );
  };
  // The page's nodes may all be new ones after a hot update: what is watched is set again each time.
  const show = (next: Item[]) => {
    news = next;
    watch();
    draw();
  };
  count.onclick = () => {
    setOpen(!open);
    if (open) (rows.firstElementChild as HTMLElement | null)?.focus({ preventScroll: true });
  };
  // ↓ and ↑ walk the list, Enter goes (a link's own click).
  panel.addEventListener('keydown', (e: KeyboardEvent) => {
    const links = [...rows.children] as HTMLElement[];
    const at = links.indexOf(W.root.activeElement);
    const to = e.key === 'ArrowDown' ? at + 1 : e.key === 'ArrowUp' ? at - 1 : null;
    if (to === null || !links.length) return;
    e.preventDefault();
    links[(to + links.length) % links.length].focus({ preventScroll: true });
  });

  const check = async () => {
    const run = ++gen;
    if (!W.S.on || full) return show([]); // comments hidden: no badge; the last look stays
    // The first look here may not be your first: the lab may know one from another device (or have nothing of ours yet).
    if (who() && (synced !== `${W.S.page}|${who()}` || read()?.dirty)) await sync();
    const was = read();
    if (run !== gen) return;
    if (!was) return remember(); // first visit, or a look from before ids: the page as it is now is what you have seen
    if (was.files === saves()) return show([]); // no file was saved since your look: what comes up on its own is the page's
    const had = new Set(was.ids.map((n) => n[0]));
    show(items().filter((n) => !had.has(n[0])));
  };
  W.S.checkChanges = check;
  W.S.syncLooked = () => sync().then(check); // another device made a look
  // After the page's own scripts and fonts have settled, so their first paint doesn't count.
  const first = () => setTimeout(check, 400);
  if (document.readyState === 'complete') first();
  else addEventListener('load', first, { once: true });
  addEventListener('lab-goto', (e) => see([(e as CustomEvent).detail]));
  addEventListener('hashchange', () => see([location.hash.slice(1)])); // (opened at a #id: it is in view, and a second later seen)
  addEventListener('click', () => setOpen(false));
  addEventListener('keydown', (e) => e.key === 'Escape' && open && (setOpen(false), count.focus({ preventScroll: true })));
  addEventListener('storage', (e) => e.key === key() && check()); // seen in another tab of this browser
}
