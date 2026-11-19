// Part of the comment widget (src/comments.js bundles it). Uses the widget's own parts through W, set once at startup.
//
// The section bar: a bar at the top of the page that lists each section (a heading, h1 to h3; a lone h1 is the page's
// title, not a section) with the current one filled, and what you have not read marked:
//   new      no mark for it: a filled blue dot and "new"
//   updated  its text is not what it was when you read it: a ring and "updated"
//   read     nothing
//   pin      a pin in it has something you have not read (a new pin, a new reply): the same ink, no number; a tap opens
//            the first such pin in it, as "new" in the bottom bar does (Leo, 19 Nov: "in tab bar on top to navigate",
//            "dont show in tab bar number of new pins")
// A section is read after about 3 s as the current one, or when you scroll on from it after a moment (0.8 s), whichever
// is first; a tap on it in the bar reads it too. A first visit counts what is on the page as read.
// What was read is kept per person in the lab (/_lab/api/sections, by the name you gave: your Mac and your phone agree;
// local.mjs, SECTIONS) and in localStorage (`lab-sections:<page>`, { marks, dirty }) as a cache that works with the lab
// down. A mark is a section's key (its id, or its heading's words) and a hash of its text.
// The bar only ever scrolls itself sideways (nav.scrollTo): never scrollIntoView, which dragged the whole page to the top.
// Phones: one line that scrolls sideways, opening at the first section with a status, above the sheets' dimmed page.
// A computer: the page's title on the left, and what does not fit folds into "…". Flag: sectionBar (lib/flags.ts).
// Where it shows (Leo, 19 Nov, the six rules in labit-md-research canvas-proposals #bar-edges):
//   1. by itself only on a lab page: served from the lab's folder (not behind --proxy) and linking /_lab/lab.css;
//   2. <meta name="lab-sections" content="on|off">, or data-lab-sections on <html> or <body>, says so for one page;
//   3. it pushes the page down (the inset) only on a lab page with no top bar of its own and no inner scroller (an app
//      shell); anywhere else it floats over the page, away while you scroll down and back when you scroll up;
//   4. from 3 sections; the "written anew" rule from 5; headings in nav, aside, dialogs and the page's header and
//      footer are not sections;
//   5. sections are looked for again on a route change (history, back/forward, #hash) and when headings change, each
//      route keeping its own marks (behind a proxy, by its real path);
//   6. no bar and no inset in print; the inset comes with scroll-padding-top, so #links land below the bar.
import { noisy } from '../../lib/ids.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let W: any;
export function bindSections(w: unknown) {
  W = w;
}

type Sec = { key: string; h: Element; label: string; hash: string };
type Marks = Record<string, string>;

const HEAD = 'h1,h2,h3';
const SKIP = '[data-lab-comments], script, style, template, noscript, svg, nav, aside, dialog, [role=dialog], [role=alertdialog], [inert], [aria-hidden=true]';
const MIN = 3; // sections before the bar shows
const REWRITE_FROM = 5; // sections before "written anew" applies: one of one changed is news, not a rewrite
// The page's own header and footer (not an article's or a section's): its masthead and small print, not sections.
const chrome = (h: Element) => {
  const c = h.closest('header, footer');
  return Boolean(c && !c.parentElement?.closest('article, section, main'));
};
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
  const heads = [...document.body.querySelectorAll(HEAD)].filter((h) => !h.closest(SKIP) && !chrome(h) && h.getClientRects().length && words(h.textContent));
  const all = heads.length === 1 && heads[0].matches('h1') ? [] : heads.filter((h, _, every) => !h.matches('h1') || every.filter((x) => x.matches('h1')).length > 1);
  // One level: the highest the sections use (h2 on most pages), so headings inside a section don't each get a chip.
  const top = ['h1', 'h2', 'h3'].find((t) => all.some((h) => h.matches(t)));
  const list = all.filter((h) => h.matches(top || 'h2'));
  const used = new Set<string>();
  return list.map((h) => {
    const at = heads.indexOf(h);
    let key = '';
    // Its own id, or the nearest element around it that holds no other heading (a <section id>); else its words.
    for (let e: Element | null = h; e && e !== document.body && !key; e = e.parentElement) if (e.id && !noisy(e.id) && e.querySelectorAll(HEAD).length <= 1) key = e.id;
    key ||= `~${words(h.textContent).toLowerCase().slice(0, 60)}`;
    for (let n = 2, k = key; used.has(key); n++) key = `${k}~${n}`;
    used.add(key);
    const r = document.createRange();
    r.setStartBefore(h);
    if (heads[at + 1]) r.setEndBefore(heads[at + 1]);
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
  // A phone's line scrolls: its edges fade where there is more, and a dot sits at an edge when something new or updated
  // is past it (Leo, 19 Nov: "show somehow, super light, that there is new on scroll left or right").
  const edgeL = el('i', { class: 'sb-edge l', 'aria-hidden': 'true' });
  const edgeR = el('i', { class: 'sb-edge r', 'aria-hidden': 'true' });
  const wrap = el('div', { class: 'sb-wrap' });
  wrap.append(nav, edgeL, edgeR);
  bar.append(title, wrap, more, menu);
  const edges = () => {
    const l = nav.scrollLeft, r = l + nav.clientWidth, any = nav.scrollWidth > nav.clientWidth + 1;
    wrap.dataset.l = any && l > 1 ? '1' : '';
    wrap.dataset.r = any && r < nav.scrollWidth - 1 ? '1' : '';
    const past = (side: 'l' | 'r') => chips().some((c) => !c.hidden && c.dataset.st && (side === 'l' ? c.offsetLeft + c.offsetWidth <= l + 4 : c.offsetLeft >= r - 4));
    edgeL.dataset.st = any && past('l') ? '1' : '';
    edgeR.dataset.st = any && past('r') ? '1' : '';
  };
  nav.addEventListener('scroll', () => requestAnimationFrame(edges), { passive: true });
  // A tap on a green edge slides the line to the nearest new or updated chip past it and goes to that section (Leo,
  // 19 Nov: "clicking on green in tabs should scroll to new").
  for (const [edge, side] of [[edgeL, 'l'], [edgeR, 'r']] as const) edge.addEventListener('click', () => {
    if (!edge.dataset.st) return;
    const l = nav.scrollLeft, r = l + nav.clientWidth;
    const past = chips().filter((c) => !c.hidden && c.dataset.st && (side === 'l' ? c.offsetLeft + c.offsetWidth <= l + 4 : c.offsetLeft >= r - 4));
    const c = side === 'l' ? past[past.length - 1] : past[0];
    if (!c) return;
    nav.scrollTo({ left: Math.max(0, c.offsetLeft - 12), behavior: still() ? 'auto' : 'smooth' });
    c.click(); // and the page goes there, as a tap on that chip does (Leo: "also scroll to new as well")
  });
  bar.hidden = true;
  menu.hidden = more.hidden = true;
  W.root.querySelector('.ui').append(bar);
  bar.addEventListener('click', (e) => e.stopPropagation()); // not a click on the page: no comment starts, nothing closes

  // The page: the lab's own name for it, or behind a proxy the route's real path (the widget's page stays the first
  // route's, so every route of an app shared one set of marks), named as the lab names pages (lib/labs.ts keyFor).
  const proxied = W.script?.dataset.proxied === '1';
  const enc = new TextEncoder();
  const pathKey = (p: string) =>
    '/' + (p.replace(/^\/+|\/+$/g, '').replace(/\.html?$/i, '') || 'index').split('/').map((seg) =>
      [...enc.encode(seg.toLowerCase())].map((b, i) => (/[a-z0-9]/.test(String.fromCharCode(b)) || (b === 45 && i) ? String.fromCharCode(b) : `_${b.toString(16)}`)).join('')).join('/');
  const pg = (): string => (proxied ? pathKey(location.pathname) : W.S.page);
  const key = () => `lab-sections:${pg()}`;
  const api = () => W.script.dataset.live?.replace(/live$/, 'api/sections') || '';
  const who = () => W.store.get('lab-name').trim();
  const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const born = performance.now(); // the first placing (a load, a reload) jumps straight there: a slide then reads as the bar glitching

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
  let pushes = 0; // marks the lab has taken: a look at its marks begun before one went up is stale

  const status = (s: Sec) => (!marks || marks[s.key] === s.hash ? '' : marks[s.key] === undefined ? 'new' : 'updated');
  // The pins with something unread in a section, top first (as stepNew in list.ts picks them): a section runs from its
  // heading to the next section's, in page coordinates as the pins are. Board pins and moved ones are in no section.
  const unreadIn = (s: Sec) => {
    const at = secs.findIndex((x) => x.key === s.key); // by key: a chip outlives the look (check) that made its Sec
    if (at < 0 || !W.S.on) return [];
    const y = (h: Element) => h.getBoundingClientRect().top + scrollY;
    const from = y(secs[at].h), to = secs[at + 1] ? y(secs[at + 1].h) : Infinity;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const top = (c: any) => {
      const a = c.anchor || {};
      if (a.kind === 'board') return NaN;
      const p = W.position(a);
      return p.moved ? NaN : p.top;
    };
    return W.threads()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((c: any) => !W.isPage(c) && W.unread(c).length)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((c: any) => ({ c, t: top(c) }))
      .filter((e: { t: number }) => e.t >= from - 1 && e.t < to - 1)
      .sort((a: { t: number }, b: { t: number }) => a.t - b.t)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((e: { c: any }) => e.c);
  };
  // What a chip wears: the section's own status, else "pin" for unread pins in it (one ink when it is both).
  const shows = (s: Sec) => status(s) || (unreadIn(s).length ? 'pin' : '');
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
    const page = pg();
    if (!api() || !name || !marks || !dirty.size) return;
    const sent = [...dirty];
    try {
      const res = await fetch(api(), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, page, sections: Object.fromEntries(sent.filter((k) => k in marks!).map((k) => [k, marks![k]])) }) });
      if (res.ok && page === pg()) {
        sent.forEach((k) => dirty.delete(k));
        pushes++;
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
    const page = pg();
    if (api() && name) {
      const n = pushes;
      try {
        const r = await (await fetch(`${api()}?name=${encodeURIComponent(name)}&page=${encodeURIComponent(page)}`, { cache: 'no-store' })).json();
        if (page !== pg()) return false;
        // Not when marks went up meanwhile: the answer predates them and would light a name just read again (Leo, 19
        // Nov: "remove green as read right after click").
        if (r.sections && n === pushes) marks = { ...r.sections, ...Object.fromEntries([...dirty].filter((k) => marks && k in marks).map((k) => [k, marks![k]])) };
        else if (!r.sections && marks) dirty = new Set(Object.keys(marks)); // the lab has none yet: it gets ours
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
      // An unread pin in it: that pin opens (and the page goes to it, in this section), as "new" in the bottom bar does.
      const pin = unreadIn(s)[0];
      if (pin) {
        W.S.chatOpen = false;
        return W.goTo(pin, !W.coarse);
      }
      dispatchEvent(new CustomEvent('lab-goto', { detail: s.h })); // goes there, as a #id link in a message does
    };
    return b;
  };
  const chips = () => [...nav.querySelectorAll<HTMLElement>('.sb-chip')];
  const find = (k: string) => chips().find((c) => c.dataset.s === k);
  // Sideways only: the bar moves, the page does not.
  const glide = (c: HTMLElement | undefined, always = false) => {
    if (!c || (nav.scrollWidth <= nav.clientWidth)) return;
    if (always || c.offsetLeft < nav.scrollLeft || c.offsetLeft + c.offsetWidth > nav.scrollLeft + nav.clientWidth) nav.scrollTo({ left: Math.max(0, c.offsetLeft - 12), behavior: still() || performance.now() - born < 1500 ? 'auto' : 'smooth' });
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
    title.textContent = words(document.title).replace(/^\(\d+\) /, ''); // not the tab's "(2)" for new comments: no numbers in the bar
    for (const c of [...chips(), ...menu.querySelectorAll<HTMLElement>('.sb-chip')]) {
      const s = secs.find((x) => x.key === c.dataset.s)!;
      const st = shows(s);
      c.dataset.st = st;
      const w = c.querySelector('.sb-w')!;
      if (st) w.textContent = st === 'pin' ? 'unread comment' : st; // gone: the old word stays while it folds away
      w.classList.toggle('off', !st);
      if (s.key === current) c.setAttribute('aria-current', 'true');
      else c.removeAttribute('aria-current');
    }
    more.dataset.st = [...menu.children].some((c) => (c as HTMLElement).dataset.st) ? '1' : '';
    edges();
  };
  // The page's own bar at the top, fixed or sticky, that the bar sits under: its bottom, and whether there is one (then the
  // bar floats: a sticky one would move down with the page). Looked for below the room the bar keeps (inset).
  const pageBar = () => {
    for (const y of inset ? [3, 3 + inset] : [3])
      for (const e of document.elementsFromPoint(innerWidth / 2, y)) {
        if (e === W.host) continue;
        for (let n: Element | null = e; n && n !== document.documentElement; n = n.parentElement) {
          const p = getComputedStyle(n).position;
          const r = n.getBoundingClientRect();
          if ((p === 'fixed' || p === 'sticky') && r.top <= y && r.height < innerHeight / 3) return { bottom: Math.max(0, Math.round(r.bottom)), found: true };
        }
        break;
      }
    return { bottom: 0, found: false };
  };
  // Rules 1-3. Asked for on this page: its own switch, else whether it is a lab page.
  const switchOf = (): boolean | null => {
    const v = (document.querySelector('meta[name="lab-sections"]')?.getAttribute('content') || document.documentElement.dataset.labSections || document.body?.dataset.labSections || '').trim().toLowerCase();
    return v === 'on' ? true : v === 'off' ? false : null;
  };
  const labPage = () =>
    !proxied &&
    [...document.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"][href]')].some((l) => {
      try {
        const u = new URL(l.href, location.href);
        return u.origin === location.origin && u.pathname === '/_lab/lab.css';
      } catch {
        return false;
      }
    });
  const wanted = () => switchOf() ?? labPage();
  // An app shell: the window does not scroll (overflow hidden on html or body), or the sections sit in a scroller of
  // their own. Not while a sheet of ours holds the page still (html.lab-sheet).
  const shell = () => {
    if (document.documentElement.classList.contains('lab-sheet')) return false;
    const held = (e: Element | null) => Boolean(e && /hidden|clip/.test(getComputedStyle(e).overflowY));
    if (held(document.documentElement) || held(document.body)) return true;
    for (let e = (secs[0]?.h || document.body.querySelector(HEAD))?.parentElement; e && e !== document.body && e !== document.documentElement; e = e.parentElement) {
      const o = getComputedStyle(e).overflowY;
      if ((o === 'auto' || o === 'scroll') && e.scrollHeight > e.clientHeight + 1) return true;
    }
    return false;
  };
  let pushable = false; // a lab page that is no app shell: the bar may keep its room (unless the page has a top bar)
  let floating = false; // over the page: away on scroll down, back on scroll up
  // The bar keeps its own room at the top of the page (Leo, 19 Nov: "tab bar overlaying first heading on mobile"): the page
  // is moved down by the bar's height, so at the top nothing of the page is under it. Only on a lab page with no top bar
  // of its own and no app shell (pushable, place). What is in view stays where it is (the bar does not move the page), and a #link
  // lands clear of the bar (scroll-padding).
  // The lab may have kept it already, in the page as served (local.mjs, ROOM): taken over from there.
  const room = document.querySelector<HTMLStyleElement>('style[data-lab="section-bar"]') || Object.assign(document.createElement('style'), { textContent: '' });
  room.dataset.lab = 'section-bar';
  let checked = false; // the page has been looked at once (check): until then the room stays as kept at the start
  let inset = room.isConnected ? parseFloat(getComputedStyle(document.documentElement).paddingTop) || 0 : 0;
  const keep = (px: number, below: number) => {
    // Screens only: a print has neither bar nor room (rule 6).
    const pad = Math.max(px, below);
    const css = px || pad ? `@media screen { html { ${px ? `padding-top: ${px}px !important; ` : ''}scroll-padding-top: ${pad + 8}px; } }` : '';
    if (!room.isConnected) document.head.append(room);
    if (px === inset) {
      if (room.textContent !== css) room.textContent = css;
      return;
    }
    let at: { e: Element; y: number } | undefined;
    if (scrollY > 0) {
      const e = document.elementsFromPoint(innerWidth / 2, innerHeight / 2).find((n) => n !== W.host && n !== document.documentElement && n !== document.body);
      if (e) at = { e, y: e.getBoundingClientRect().top };
    }
    inset = px;
    room.textContent = css;
    if (at) {
      const d = at.e.getBoundingClientRect().top - at.y; // what the browser's own scroll anchoring has not already made up
      if (Math.abs(d) >= 1) scrollBy({ top: d, behavior: 'instant' });
    }
  };
  // The bar's height before it shows (44 on a phone, 38 on a computer), to keep its room from the start: no jump when it comes.
  const height = () => {
    if (!bar.hidden) return bar.offsetHeight;
    bar.style.visibility = 'hidden';
    bar.hidden = false;
    const h = bar.offsetHeight;
    bar.hidden = true;
    bar.style.visibility = '';
    return h;
  };
  const place = () => {
    // Under the page's own bar when it has a fixed or sticky one at the top; then it floats, and the page is not moved.
    let own = pageBar();
    floating = !pushable || own.found;
    if (floating && inset) {
      keep(0, 0); // not a page to push after all: it goes back up, and the bar floats (under the page's own bar)
      own = pageBar();
    }
    if (!floating) bar.removeAttribute('data-away');
    bar.style.marginTop = `${own.bottom}px`;
    // How far down the bar reaches, for the page to scroll a section clear of it (goToBlock), and for the sheets on a phone.
    W.host.style.setProperty('--lab-sbb', bar.hidden ? '0px' : `${own.bottom + bar.offsetHeight}px`);
    W.host.toggleAttribute('data-sbar', !bar.hidden);
    if (bar.hidden && !checked) return; // not drawn yet: the room kept for it stays
    keep(bar.hidden || floating ? 0 : bar.offsetHeight, bar.hidden ? 0 : own.bottom + bar.offsetHeight);
  };
  const draw = () => {
    bar.hidden = secs.length < MIN || !W.S.on || !ready;
    if (bar.hidden) return place();
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
  // Floating (rule 3): away while the page scrolls down, back when it scrolls up or reaches the top. Any scroller: an app
  // shell scrolls an element of its own, and the capture hears it.
  const lastTop = new WeakMap<object, number>();
  const away = (e: Event) => {
    if (!floating || bar.hidden) return;
    const t = e.target instanceof Element ? e.target : document.scrollingElement;
    if (!t) return;
    const y = t.scrollTop, d = y - (lastTop.get(t) ?? y);
    lastTop.set(t, y);
    if (y < 8 || d < -6) bar.removeAttribute('data-away');
    else if (d > 6 && menu.hidden) bar.setAttribute('data-away', '');
  };
  addEventListener('scroll', (e) => (away(e), onScroll()), { passive: true, capture: true });
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
    pushable = labPage() && !shell();
    if (!W.S.on || !wanted() || secs.length < MIN) {
      ready = false;
      checked = true;
      return draw();
    }
    if (!(await sync()) || run !== gen) return;
    if (!marks) {
      // A first visit: what is on the page is read.
      marks = Object.fromEntries(secs.map((s) => [s.key, s.hash]));
      dirty = new Set(secs.map((s) => s.key));
      later();
    } else if (secs.length >= REWRITE_FROM && secs.filter((s) => status(s)).length >= 0.8 * secs.length) {
      // Nearly all of it new or updated at once (80 % or more): a page written anew, not news. Read, as on a first
      // visit, so no name lights up (Leo, 19 Nov: "if all new like page updated dont show it green make it read").
      for (const s of secs) {
        if (!status(s)) continue;
        marks[s.key] = s.hash;
        dirty.add(s.key);
      }
      later();
    }
    const first = !ready;
    const had = new Set(chips().filter((c) => c.dataset.st).map((c) => c.dataset.s));
    ready = true;
    checked = true;
    draw();
    // Opens at the first with a status, and glides to one that has just got one.
    // A reload partway down the page (a live update keeps your place) opens at where you are instead: placing it at
    // the first status and then at the current one a moment later read as the bar jumping (Leo, 19 Nov).
    const fresh = secs.find((s) => status(s) && (first || !had.has(s.key)));
    const jump = fresh && !(first && scrollY > innerHeight / 2);
    if (jump) glide(find(fresh.key), true);
    // A look again that found nothing new (a heading changed, a route's hash) leaves the line where it is.
    if (first || jump || !secs.some((s) => s.key === current)) current = '';
    watch(!jump);
  };
  // The room is kept as soon as it is known the bar will show (comments on, sections on the page), well before the bar
  // itself, which waits for the page to settle and the lab's marks.
  secs = W.S.on && wanted() ? collect() : [];
  pushable = labPage() && !shell();
  const h0 = secs.length >= MIN && pushable && !pageBar().found ? height() : 0;
  keep(h0, h0);
  secs = [];
  W.S.checkSections = check;
  // A pin read or a new one come (comments.js, after the bottom bar is drawn): the chips' ink follows.
  W.S.paintSections = () => {
    if (ready && !bar.hidden) paint();
  };
  W.S.syncSections = check; // another device read something
  // Rule 5: looked at again a moment after a route change or a change to the headings (an app drawing its page late,
  // the agent's edit). A new route starts unread-free: nothing of the old one is read meanwhile, or saved under the new.
  let again: ReturnType<typeof setTimeout>;
  const soon = (ms = 400) => {
    clearTimeout(again);
    again = setTimeout(check, ms);
  };
  let route = location.pathname;
  const routed = (hash = false) => {
    if (location.pathname === route && !hash) return;
    if (location.pathname !== route) {
      route = location.pathname;
      clearTimeout(readTimer);
      ready = false;
      marks = null;
    }
    soon();
  };
  for (const m of ['pushState', 'replaceState'] as const) {
    const original = history[m];
    history[m] = function (this: History, ...args: Parameters<History['pushState']>) {
      const out = original.apply(this, args);
      queueMicrotask(() => routed());
      return out;
    };
  }
  addEventListener('popstate', () => routed());
  addEventListener('hashchange', () => routed(true));
  const heady = (n: Node) => n.nodeType === 1 && ((n as Element).matches(HEAD) || Boolean((n as Element).querySelector(HEAD)));
  new MutationObserver((list) => {
    if (list.some((m) => !W.host.contains(m.target) && (m.type === 'characterData' ? Boolean(m.target.parentElement?.closest(HEAD)) : Boolean((m.target as Element).closest?.(HEAD)) || [...m.addedNodes, ...m.removedNodes].some(heady)))) soon(500);
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  const first = () => setTimeout(check, 400); // after the page's own scripts and fonts have settled
  if (document.readyState === 'complete') first();
  else addEventListener('load', first, { once: true });
  addEventListener('storage', (e) => e.key === key() && check()); // read in another tab of this browser
}
