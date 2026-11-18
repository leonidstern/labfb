// Labs & pages (⌘K, or the ⋯ menu): every lab running on this computer and its pages, to go to one; who listens on
// each, to stop it; park a lab and start it again. A guest on a phone sees this lab's pages only. Part of the comment
// widget (src/comments.js bundles it). Leo, 18 Nov (the lab-navigation page, option B).

type Page = { url: string; title: string; file: string; path: string; open: number; done?: number; last?: string | null; edited?: string | null };
type Lab = { name: string; port: number; here: boolean; mode: string; listening: string | null; pages: Page[]; root?: string; unreachable?: boolean; started?: string };
type Parked = { name: string; port: number; root: string; archived?: boolean; at?: string };
type Sort = 'recent' | 'name' | 'pins';
const SORTS: Sort[] = ['recent', 'name', 'pins'];
type Deps = {
  root: ShadowRoot;
  el: (tag: string, attrs?: Record<string, string>, text?: string | Node) => HTMLElement;
  api: string; // /_lab/labs
  admin: string; // this computer's key ('' for a guest)
  page: string; // this page's key
  beforeOpen: () => void; // closes the ⋯ menu and anything else in the way
};

let d: Deps;
let box: HTMLElement;
let input: HTMLInputElement;
let list: HTMLElement;
let data: { labs: Lab[]; parked: Parked[]; guest: boolean } | null = null;
let active = 0;
let toCur = false; // the first list after opening starts on the page you're on, scrolled to it
let armed = ''; // the park or archive button waiting for its second click: "action port"
let showArchived = false;
let sort: Sort = (() => {
  try {
    const v = localStorage.getItem('lab-switch-sort') as Sort;
    return SORTS.includes(v) ? v : 'recent';
  } catch {
    return 'recent';
  }
})();
let sorter: HTMLElement;

const switcherOpen = () => Boolean(box && !box.hidden);

export function bindSwitcher(deps: Deps) {
  d = deps;
  const { el, root } = d;
  box = el('div', { class: 'switch', hidden: '', role: 'dialog', 'aria-label': 'labs and pages' });
  const scrim = el('div', { class: 'sw-scrim' });
  const panel = el('div', { class: 'sw-box' });
  input = el('input', { type: 'search', placeholder: 'Go to a page or a lab', 'aria-label': 'Go to a page or a lab', autocomplete: 'off', spellcheck: 'false' }) as HTMLInputElement;
  list = el('div', { class: 'sw-list', role: 'listbox' });
  sorter = el('div', { class: 'sw-sort', role: 'group', 'aria-label': 'sort' });
  const foot = el('div', { class: 'sw-foot' }, '↑↓ choose · ↵ go · ⌘↵ new tab · ⌥O sort · ⌥S stop listening · ⌥P park · ⌥A archive · ⌥R start · esc close');
  panel.append(input, sorter, list, foot);
  box.append(scrim, panel);
  root.append(box);
  scrim.addEventListener('click', () => closeSwitcher());
  // Phones: with the keyboard up, the sheet takes what the keyboard leaves of the screen, read from the visual
  // viewport (Safari scrolls the layout under it, so fixed bottoms land behind the keyboard). Without: back to its CSS.
  const vv = window.visualViewport;
  const fit = () => {
    if (!vv || box.hidden || !matchMedia('(pointer: coarse)').matches) return;
    const up = innerHeight - vv.height > 120;
    Object.assign(panel.style, up ? { top: `${Math.round(vv.offsetTop + 8)}px`, bottom: 'auto', height: `${Math.round(vv.height - 16)}px`, maxHeight: 'none' } : { top: '', bottom: '', height: '', maxHeight: '' });
  };
  vv?.addEventListener('resize', fit);
  vv?.addEventListener('scroll', fit);
  // A swipe down from the top of the list closes it, as the other sheets do.
  let y0 = -1;
  panel.addEventListener('touchstart', (e) => (y0 = list.scrollTop <= 0 ? e.touches[0].clientY : -1), { passive: true });
  panel.addEventListener('touchend', (e) => {
    if (y0 >= 0 && e.changedTouches[0].clientY - y0 > 90) closeSwitcher();
    y0 = -1;
  }, { passive: true });
  input.addEventListener('input', () => {
    active = 0;
    draw();
  });
  // Keys anywhere in the box (after a click on a sort or fold button too); Enter only from the search, so a focused
  // button still does its own thing.
  panel.addEventListener('keydown', (e) => {
    const rows = [...list.querySelectorAll<HTMLElement>('.sw-row')];
    if (e.key === 'Enter' && e.target !== input) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!rows.length) return;
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
      mark(rows);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      rows[active]?.dispatchEvent(new MouseEvent('click', { metaKey: e.metaKey || e.ctrlKey }));
    } else if (e.altKey && !e.metaKey && !e.ctrlKey && /^Key[OSPAR]$/.test(e.code)) {
      // Option + a letter, read by key position (Option turns the letter into another character on a Mac).
      e.preventDefault();
      if (e.code === 'KeyO') return setSort(SORTS[(SORTS.indexOf(sort) + 1) % SORTS.length]);
      if (data?.guest) return;
      const row = rows[active];
      const port = Number(row?.dataset.port);
      if (!row || !port) return;
      const parked = row.dataset.kind === 'parked';
      const lab = data?.labs.find((l) => l.port === port);
      if (e.code === 'KeyR' && parked) return start(port, row);
      if (e.code === 'KeyA' && parked) return void act(row.dataset.archived ? 'unarchive' : 'archive', port);
      if (parked || !lab) return;
      if (e.code === 'KeyS' && lab.mode !== 'away') return void act('stop', port);
      if (e.code === 'KeyP' || e.code === 'KeyA') {
        const action = e.code === 'KeyP' ? 'park' : 'archive';
        if (armed !== `${action} ${port}`) {
          armed = `${action} ${port}`;
          return draw();
        }
        armed = '';
        void act(action, port);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeSwitcher();
    }
  });
  // ⌘K / Control-K from anywhere but a field of the page's own (where it may mean "add a link").
  document.addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || (e.key || '').toLowerCase() !== 'k') return;
    const typing = e.composedPath().some((n) => n instanceof HTMLElement && (n.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(n.tagName)) && n.getRootNode() !== root);
    if (typing) return;
    e.preventDefault();
    if (switcherOpen()) closeSwitcher();
    else openSwitcher();
  });
}

export function openSwitcher() {
  d.beforeOpen();
  box.hidden = false;
  document.documentElement.classList.add('lab-sheet'); // phones: the page holds still behind it (no scroll under the keyboard)
  input.value = '';
  active = 0;
  toCur = true;
  armed = '';
  showArchived = false;
  draw();
  // A phone: no keyboard until you tap the search (it pushed the sheet up and down as it opened, Leo 18 Nov).
  if (!matchMedia('(pointer: coarse)').matches) input.focus({ preventScroll: true });
  void load();
}

function closeSwitcher() {
  box.hidden = true;
  if (!d.root.host.hasAttribute('data-sheet')) document.documentElement.classList.remove('lab-sheet');
}

/** Ask for the labs ahead, as the ⋯ menu opens, so the box opens with its list. */
export const preloadSwitcher = () => void load();

async function load() {
  try {
    data = await (await fetch(d.api, { cache: 'no-store' })).json();
  } catch {
    data = null;
  }
  if (switcherOpen()) draw();
}

function setSort(s: Sort) {
  sort = s;
  try {
    localStorage.setItem('lab-switch-sort', s);
  } catch {}
  draw();
  keepKeys();
}
// A click on a button that draw() then replaces leaves focus nowhere; back to the search, so the keys keep working.
const keepKeys = () => {
  if (!matchMedia('(pointer: coarse)').matches) input.focus({ preventScroll: true });
};

function start(port: number, row: HTMLElement) {
  (row.querySelector('.sw-m') as HTMLElement).textContent = 'starting…';
  void act('start', port);
}

async function act(action: 'stop' | 'park' | 'archive' | 'unarchive' | 'start', port: number) {
  try {
    await fetch(d.api, { method: 'POST', headers: { 'content-type': 'application/json', 'x-lab-admin': d.admin }, body: JSON.stringify({ action, port }) });
  } catch {}
  // A lab that starts takes a moment to answer; one that parks a moment to go.
  setTimeout(load, action === 'start' ? 1500 : 400);
  if (action === 'start') setTimeout(load, 4000);
}

const say = (lab: Lab) => {
  const open = lab.pages.reduce((n, p) => n + p.open, 0);
  if (lab.unreachable) return ['not answering', 'warn'];
  if (lab.mode === 'listening') return [`${lab.listening || 'Claude'} listening`, 'ok'];
  if (lab.mode === 'working') return [`${lab.listening || 'Claude'} working`, 'work'];
  return [`nobody listening${open ? ` · ${open} open` : ''}`, open ? 'warn' : ''];
};
const hit = (q: string, ...words: string[]) => !q || words.some((w) => w.toLowerCase().includes(q));
const short = (lab: Lab, p: Page) => p.title || p.path;
/** "now", "5m", "3h", "2d", or a date for anything older than a week. */
const ago = (iso?: string | null) => {
  if (!iso) return '';
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (!(s >= 0)) return '';
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};
const latest = (...d: (string | null | undefined)[]) => d.filter(Boolean).sort().pop() || '';
const touched = (p: Page) => latest(p.last, p.edited);
const labTouched = (lab: Lab) => latest(...lab.pages.map(touched)) || lab.started || '';
const pins = (p: Page) => p.open + (p.done || 0);
const byName = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
const orderPages = (ps: Page[], lab: Lab) =>
  [...ps].sort((a, b) =>
    sort === 'name' ? byName(short(lab, a), short(lab, b)) : sort === 'pins' ? b.open - a.open || pins(b) - pins(a) || touched(b).localeCompare(touched(a)) : touched(b).localeCompare(touched(a)),
  );
// The lab you're in stays first; the rest follow the sort.
const orderLabs = (labs: Lab[]) =>
  [...labs].sort((a, b) =>
    Number(b.here) - Number(a.here) ||
    (sort === 'name'
      ? byName(a.name, b.name)
      : sort === 'pins'
        ? b.pages.reduce((n, p) => n + p.open, 0) - a.pages.reduce((n, p) => n + p.open, 0) || labTouched(b).localeCompare(labTouched(a))
        : labTouched(b).localeCompare(labTouched(a))),
  );

function draw() {
  const { el } = d;
  const q = input.value.trim().toLowerCase();
  const out: HTMLElement[] = [];
  sorter.replaceChildren(
    el('span', {}, 'sort'),
    ...SORTS.map((s) => {
      const b = el('button', { type: 'button', 'aria-pressed': String(s === sort), ...(s === sort ? { class: 'on' } : {}) }, s === 'pins' ? 'open pins' : s);
      b.addEventListener('click', () => setSort(s));
      return b;
    }),
  );
  if (!data) {
    list.replaceChildren(el('div', { class: 'sw-none' }, 'loading…'));
    return;
  }
  const local = !data.guest;
  for (const lab of orderLabs(data.labs)) {
    const labHit = hit(q, lab.name, String(lab.port));
    const pages = orderPages(lab.pages.filter((p) => labHit || hit(q, p.title, p.path, p.file)), lab);
    if (q && !pages.length && !labHit) continue;
    // The lab: its name and port, who listens, its pins, and what you can do about it (this computer only).
    const head = el('div', { class: 'sw-lab' });
    const [status, tone] = say(lab);
    const left = el('div', { class: 'sw-name' });
    const done = lab.pages.reduce((n, p) => n + (p.done || 0), 0);
    const up = ago(lab.started);
    left.append(
      el('b', {}, lab.name),
      ` · ${lab.port}${lab.here ? ' · this lab' : ''}${up ? ` · up ${up === 'now' ? 'just now' : up}` : ''}${done ? ` · ${done} done` : ''}`,
      el('span', { class: `sw-st ${tone}` }, status),
    );
    head.append(left);
    if (local) {
      const acts = el('div', { class: 'sw-acts' });
      const btn = (label: string, fn: () => void, title = '') => {
        const b = el('button', { type: 'button', ...(title ? { title } : {}) }, label);
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          fn();
        });
        acts.append(b);
        return b;
      };
      if (lab.mode !== 'away') btn('stop listening', () => act('stop', lab.port), 'end the agent’s wait on this lab; its pins stay (⌥S)');
      else
        btn('get Claude listening', () => {
          const line = `Listen for pins on http://localhost:${lab.port}${lab.here ? d.page : '/'} with labit wait${lab.here ? ` --page ${d.page}` : ''}`;
          navigator.clipboard?.writeText(line).catch(() => {});
          (acts.querySelector('button') as HTMLElement).textContent = 'copied: paste it to Claude';
        }, 'copies one line to paste to your agent');
      const twice = (action: 'park' | 'archive', label: string, title: string) => {
        const key = `${action} ${lab.port}`;
        const b = btn(armed === key ? (lab.here ? `${action}: this page closes` : `${action}: sure?`) : label, () => {
          if (armed !== key) {
            armed = key;
            draw();
            return keepKeys();
          }
          armed = '';
          void act(action, lab.port);
        }, title);
        if (armed === key) b.classList.add('armed');
      };
      twice('park', 'park', 'stop this lab; it waits under "parked" to start again (⌥P)');
      twice('archive', 'archive', 'stop this lab and fold it away under "archived" (⌥A)');
      head.append(acts);
    }
    out.push(head);
    for (const p of pages) {
      const here = lab.here && p.path === d.page;
      const row = el('button', { type: 'button', class: `sw-row${here ? ' cur' : ''}`, role: 'option', 'data-port': String(lab.port), 'data-kind': 'page' });
      const meta = [p.open ? `${p.open} open` : '', p.done ? `${p.done} done` : '', here ? 'you’re here' : ago(touched(p))].filter(Boolean).join(' · ');
      const when = touched(p);
      row.append(el('span', { class: 'sw-t' }, short(lab, p)), el('span', { class: 'sw-m', ...(when ? { title: new Date(when).toLocaleString() } : {}) }, meta));
      const url = lab.here ? new URL(p.url, location.href).pathname : p.url;
      row.addEventListener('click', (e: MouseEvent) => {
        if (e.metaKey || e.ctrlKey) window.open(lab.here ? location.origin + url : url, '_blank');
        else location.href = url;
      });
      out.push(row);
    }
    if (!pages.length) out.push(el('div', { class: 'sw-none' }, lab.unreachable ? 'this lab isn’t answering' : 'no pages yet'));
  }
  if (data.guest && data.labs.length < 2) out.push(el('div', { class: 'sw-none' }, 'Other labs on that computer are open to this computer only.'));
  if (local) {
    const all = data.parked.filter((p) => hit(q, p.name, String(p.port)));
    const order = (ps: Parked[]) => [...ps].sort((a, b) => (sort === 'name' ? byName(a.name, b.name) : String(b.at || '').localeCompare(String(a.at || ''))));
    const parkedRow = (p: Parked) => {
      const row = el('button', { type: 'button', class: 'sw-row parked', role: 'option', 'data-port': String(p.port), 'data-kind': 'parked', ...(p.archived ? { 'data-archived': '1' } : {}) });
      const t = el('span', { class: 'sw-t' });
      t.append(el('b', {}, p.name), ` · ${p.port}`);
      const m = el('span', { class: 'sw-m' }, `${p.archived ? 'archived' : 'parked'} ${ago(p.at)}`.trim());
      const flip = el('span', { class: 'sw-mini', role: 'button', title: p.archived ? 'back to parked (⌥A)' : 'fold away under archived (⌥A)' }, p.archived ? 'unarchive' : 'archive');
      flip.addEventListener('click', (e) => {
        e.stopPropagation();
        void act(p.archived ? 'unarchive' : 'archive', p.port);
      });
      row.title = 'start it again (↵ or ⌥R)';
      const right = el('span', { class: 'sw-m2' });
      right.append(m, flip);
      row.append(t, right);
      row.addEventListener('click', () => start(p.port, row));
      return row;
    };
    const parked = order(all.filter((p) => !p.archived));
    const archived = order(all.filter((p) => p.archived));
    if (parked.length) out.push(el('div', { class: 'sw-group' }, 'parked · ↵ starts'), ...parked.map(parkedRow));
    if (archived.length) {
      const open = showArchived || Boolean(q);
      const g = el('button', { type: 'button', class: 'sw-group sw-fold', 'aria-expanded': String(open) }, `${open ? '▾' : '▸'} archived · ${archived.length}`);
      g.addEventListener('click', () => {
        showArchived = !showArchived;
        draw();
        keepKeys();
      });
      out.push(g);
      if (open) out.push(...archived.map(parkedRow));
    }
  }
  if (!out.length) out.push(el('div', { class: 'sw-none' }, 'nothing matches'));
  list.replaceChildren(...out);
  const rows = [...list.querySelectorAll<HTMLElement>('.sw-row')];
  if (toCur && rows.length) {
    active = Math.max(0, rows.findIndex((r) => r.classList.contains('cur')));
    toCur = false;
  }
  mark(rows);
}

function mark(rows: HTMLElement[]) {
  if (active >= rows.length) active = Math.max(0, rows.length - 1);
  rows.forEach((r, i) => r.classList.toggle('on', i === active));
  rows[active]?.scrollIntoView({ block: 'nearest' });
}
