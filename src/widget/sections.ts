// Part of the comment widget (src/comments.js bundles it). Uses the widget's own parts through W, set once at startup.
//
// The section bar: a bar at the top of the page that lists each section (a heading of one level: the highest of h1
// to h3 that occurs twice or more, usually h2; a lone h1 is the page's title; headings inside nav, header, footer and
// aside are not sections; at most 40) with the current one filled, and what you have not read marked:
//   new      no mark for it: a filled blue dot and "new"
//   updated  its text is not what it was when you read it: a ring and "updated"
//   read     nothing
// A section is read after about 3 s as the current one, or when you scroll on from it after a moment (0.8 s), whichever
// is first; a tap on it in the bar reads it too. A first visit counts what is on the page as read.
// What was read is kept per person in the lab (/_lab/api/sections, by the name you gave: your Mac and your phone agree;
// local.mjs, SECTIONS) and in localStorage (`lab-sections:<page>`, { marks, dirty }) as a cache that works with the lab
// down. A mark is a section's key (its id, or its heading's words) and a hash of its text.
// The bar only ever scrolls itself sideways (nav.scrollTo): never scrollIntoView, which dragged the whole page to the top.
// Phones: one line that scrolls sideways, opening at the first section with a status, above the sheets' dimmed page.
// A computer: the page's title on the left, and what does not fit folds into "…". Flag: sectionBar (lib/flags.ts).
import { noisy } from '../../lib/ids.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let W: any;
export function bindSections(w: unknown) {
  W = w;
}

type Sec = { key: string; h: Element; label: string; hash: string };
type Marks = Record<string, string>;

const HEAD = 'h1,h2,h3';
const SKIP = '[data-lab-comments], script, style, template, noscript, svg, nav, header, footer, aside';
const MAX = 40; // a longer list is cut here
const READ_AFTER = 3000; // as the current section
const SCROLL_ON_AFTER = 800; // scrolling on from one this long counts as having read it

const hash = (t: string) => {
  let x = 2166136261;
  for (let i = 0; i < t.length; i++) x = Math.imul(x ^ t.charCodeAt(i), 16777619);
  return (x >>> 0).toString(36);
};
const words = (t: string | null) => (t || '').replace(/\s+/g, ' ').trim();

// The page's sections, in order. A section's text runs from its heading to the next one.
function collect(): Sec[] {
  const heads = [...document.body.querySelectorAll(HEAD)].filter((h) => !h.closest(SKIP) && h.getClientRects().length && words(h.textContent));
  // One level only: the highest that occurs at least twice (a lone h1 is the page's title, never a section).
  const level = [1, 2, 3].find((n) => heads.filter((h) => h.matches(`h${n}`)).length >= 2);
  const list = heads.filter((h) => h.matches(`h${level}`)).slice(0, MAX);
  const used = new Set<string>();
  return list.map((h) => {
    const next = heads.slice(heads.indexOf(h) + 1).find((x) => +x.tagName[1] <= level!); // a smaller heading inside it belongs to it
    let key = '';
    // Its own id, or the nearest element around it that holds no other heading (a <section id>); else its words.
    for (let e: Element | null = h; e && e !== document.body && !key; e = e.parentElement) if (e.id && !noisy(e.id) && e.querySelectorAll(HEAD).length <= 1) key = e.id;
    key ||= `~${words(h.textContent).toLowerCase().slice(0, 60)}`;
    for (let n = 2, k = key; used.has(key); n++) key = `${k}~${n}`;
    used.add(key);
    const r = document.createRange();
    r.setStartBefore(h);
    if (next) r.setEndBefore(next);
    else r.setEndAfter(document.body.lastChild!);
    const label = words(h.textContent);
    return { key, h, label: label.length > 40 ? `${label.slice(0, 39)}…` : label, hash: hash(words(r.toString())) };
  });
}

export function startSections() {
  const el = W.el as (tag: string, attrs?: Record<string, string>, text?: string) => HTMLElement;
  const title = el('span', { class: 'sb-title' });
  const nav = el('nav', { class: 'sb-nav', 'aria-label': 'sections' });
  const more = el('button', { class: 'sb-more', type: 'button', 'aria-expanded': 'false', 'aria-label': 'more sections' }, '…');
  const menu = el('div', { class: 'sb-menu' });
  const bar = el('div', { class: 'sbar' });
  bar.append(title, nav, more, menu);
  bar.hidden = true;
  menu.hidden = more.hidden = true;
  W.root.querySelector('.ui').append(bar);
  bar.addEventListener('click', (e) => e.stopPropagation()); // not a click on the page: no comment starts, nothing closes

  const key = () => `lab-sections:${W.S.page}`;
  const api = () => W.script.dataset.live?.replace(/live$/, 'api/sections') || '';
  const who = () => W.store.get('lab-name').trim();
  const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  let secs: Sec[] = [];
  let marks: Marks | null = null; // null: never read anything here
  let dirty = new Set<string>(); // marks the lab has not got yet
  let ready = false; // the marks are known (the lab's included): nothing is read before
  let current = '';
  let since = 0; // when it became the current one
  let readTimer: ReturnType<typeof setTimeout>;
  let pushTimer: ReturnType<typeof setTimeout>;
  let shown = '';
  let gen = 0;

  const status = (s: Sec) => (!marks || marks[s.key] === s.hash ? '' : marks[s.key] === undefined ? 'new' : 'updated');
  const load = () => {
    try {
      const v = JSON.parse(W.store.get(key()) || 'null');
      marks = v?.marks && typeof v.marks === 'object' ? v.marks : null;
      dirty = new Set(v?.dirty || []);
    } catch {
      marks = null;
      dirty = new Set();
    }
  };
  const save = () => W.store.set(key(), JSON.stringify({ marks, dirty: [...dirty] }));

  // What goes up to the lab: the marks it has not got yet, a moment after the last change.
  const push = async () => {
    const name = who();
    const page = W.S.page;
    if (!api() || !name || !marks || !dirty.size) return;
    const sent = [...dirty];
    try {
      const res = await fetch(api(), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, page, sections: Object.fromEntries(sent.filter((k) => k in marks!).map((k) => [k, marks![k]])) }) });
      if (res.ok && page === W.S.page) {
        sent.forEach((k) => dirty.delete(k));
        save();
      }
    } catch {} // the lab is down: they go with the next one
  };
  const later = () => {
    save();
    clearTimeout(pushTimer);
    pushTimer = setTimeout(push, 800);
  };
  // The lab's marks come in (what is not waiting to go up is theirs); marks of ours it lacks go up.
  const sync = async () => {
    load();
    const name = who();
    const page = W.S.page;
    if (api() && name) {
      try {
        const r = await (await fetch(`${api()}?name=${encodeURIComponent(name)}&page=${encodeURIComponent(page)}`, { cache: 'no-store' })).json();
        if (page !== W.S.page) return false;
        if (r.sections) marks = { ...r.sections, ...Object.fromEntries([...dirty].filter((k) => marks && k in marks).map((k) => [k, marks![k]])) };
        else if (marks) dirty = new Set(Object.keys(marks)); // the lab has none yet: it gets ours
        save();
      } catch {} // the lab is down: the cache stands
    }
    return true;
  };

  const read = (s: Sec) => {
    if (!marks || marks[s.key] === s.hash) return;
    marks[s.key] = s.hash;
    dirty.add(s.key);
    later();
    draw();
  };

  // ---- drawing ----
  const chip = (s: Sec) => {
    const b = el('button', { class: 'sb-chip', type: 'button' });
    b.dataset.s = s.key;
    b.append(el('i', { class: 'sb-dot' }), el('span', { class: 'sb-t' }, s.label), el('span', { class: 'sb-w' }));
    b.onclick = () => {
      read(s);
      menu.hidden = true;
      more.setAttribute('aria-expanded', 'false');
      dispatchEvent(new CustomEvent('lab-goto', { detail: s.h })); // goes there, as a #id link in a message does
    };
    return b;
  };
  const chips = () => [...nav.querySelectorAll<HTMLElement>('.sb-chip')];
  const find = (k: string) => chips().find((c) => c.dataset.s === k);
  // Sideways only: the bar moves, the page does not.
  const glide = (c: HTMLElement | undefined, always = false) => {
    if (!c || (nav.scrollWidth <= nav.clientWidth)) return;
    if (always || c.offsetLeft < nav.scrollLeft || c.offsetLeft + c.offsetWidth > nav.scrollLeft + nav.clientWidth) nav.scrollTo({ left: Math.max(0, c.offsetLeft - 12), behavior: still() ? 'auto' : 'smooth' });
  };
  // Folds what does not fit into "…" (a computer; a phone's line scrolls).
  const fold = () => {
    const wide = !W.coarse;
    const all = chips();
    all.forEach((c) => (c.hidden = false));
    menu.replaceChildren();
    more.hidden = true;
    if (!wide || nav.scrollWidth <= nav.clientWidth) return;
    more.hidden = false;
    const room = nav.clientWidth - more.offsetWidth - 8;
    let used = 0;
    const out: Sec[] = [];
    all.forEach((c) => {
      used += c.offsetWidth + 2;
      c.hidden = used > room;
      if (c.hidden) out.push(secs.find((s) => s.key === c.dataset.s)!);
    });
    menu.append(...out.map((s) => chip(s)));
    paint();
  };
  const paint = () => {
    for (const c of [...chips(), ...menu.querySelectorAll<HTMLElement>('.sb-chip')]) {
      const s = secs.find((x) => x.key === c.dataset.s)!;
      const st = status(s);
      c.dataset.st = st;
      c.querySelector('.sb-w')!.textContent = st && ` ${st}`; // a space before it, for what reads the chip as text
      if (s.key === current) c.setAttribute('aria-current', 'true');
      else c.removeAttribute('aria-current');
    }
    more.dataset.st = [...menu.children].some((c) => (c as HTMLElement).dataset.st) ? '1' : '';
  };
  const place = () => {
    // Under the page's own bar when it has a fixed or sticky one at the top.
    let top = 0;
    for (const e of document.elementsFromPoint(innerWidth / 2, 3)) {
      if (e === W.host) continue;
      for (let n: Element | null = e; n && n !== document.documentElement; n = n.parentElement) {
        const p = getComputedStyle(n).position;
        const r = n.getBoundingClientRect();
        if ((p === 'fixed' || p === 'sticky') && r.top <= 3 && r.height < innerHeight / 3) {
          top = Math.max(0, Math.round(r.bottom));
          break;
        }
      }
      break;
    }
    bar.style.marginTop = `${top}px`;
    // How far down the bar reaches, for the page to scroll a section clear of it (goToBlock), and for the sheets on a phone.
    W.host.style.setProperty('--lab-sbb', bar.hidden ? '0px' : `${top + bar.offsetHeight}px`);
    W.host.toggleAttribute('data-sbar', !bar.hidden);
  };
  const draw = () => {
    bar.hidden = !secs.length || !W.S.on || !ready;
    if (bar.hidden) return place();
    title.textContent = words(document.title);
    const sig = secs.map((s) => `${s.key}\n${s.label}`).join('\n');
    if (sig !== shown) {
      shown = sig;
      nav.replaceChildren(...secs.map(chip));
      paint();
      fold();
    }
    paint();
    place();
  };

  // ---- reading: the current section ----
  const where = () => {
    const line = innerHeight * 0.35;
    let at: Sec | undefined;
    for (const s of secs) if (s.h.getBoundingClientRect().top <= line) at = s;
    if (innerHeight + scrollY >= document.documentElement.scrollHeight - 2) at = secs[secs.length - 1];
    return at?.key || '';
  };
  const watch = (to = true) => {
    if (!ready || bar.hidden) return;
    const now = where();
    if (now === current) return;
    const left = secs.find((s) => s.key === current);
    if (left && Date.now() - since >= SCROLL_ON_AFTER) read(left); // scrolled on after a moment
    current = now;
    since = Date.now();
    clearTimeout(readTimer);
    readTimer = setTimeout(() => {
      const s = secs.find((x) => x.key === current);
      if (s && !document.hidden) read(s);
    }, READ_AFTER);
    paint();
    if (to) glide(find(current));
  };
  let frame = 0;
  const onScroll = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => watch());
  };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', () => (W.coarse ? place() : (fold(), place())));
  more.onclick = (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
    more.setAttribute('aria-expanded', String(!menu.hidden));
  };
  addEventListener('click', () => ((menu.hidden = true), more.setAttribute('aria-expanded', 'false')));
  document.addEventListener('visibilitychange', () => document.hidden && clearTimeout(readTimer));

  // ---- the page now against what was read ----
  const check = async () => {
    const run = ++gen;
    secs = collect();
    if (!W.S.on) {
      ready = false;
      return draw();
    }
    if (!(await sync()) || run !== gen) return;
    if (!marks) {
      // A first visit: what is on the page is read.
      marks = Object.fromEntries(secs.map((s) => [s.key, s.hash]));
      dirty = new Set(secs.map((s) => s.key));
      later();
    }
    const first = !ready;
    const had = new Set(chips().filter((c) => c.dataset.st).map((c) => c.dataset.s));
    ready = true;
    draw();
    // Opens at the first with a status, and glides to one that has just got one.
    const fresh = secs.find((s) => status(s) && (first || !had.has(s.key)));
    if (fresh) glide(find(fresh.key), true);
    current = '';
    watch(!fresh);
  };
  W.S.checkSections = check;
  W.S.syncSections = check; // another device read something
  const first = () => setTimeout(check, 400); // after the page's own scripts and fonts have settled
  if (document.readyState === 'complete') first();
  else addEventListener('load', first, { once: true });
  addEventListener('storage', (e) => e.key === key() && check()); // read in another tab of this browser
}
