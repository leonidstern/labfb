// Labs & pages (⌘K, or the ⋯ menu): every lab running on this computer and its pages, to go to one; who listens on
// each, to stop it; park a lab and start it again. A guest on a phone sees this lab's pages only. Part of the comment
// widget (src/comments.js bundles it). Leo, 18 Nov (the lab-navigation page, option B).

type Page = { url: string; title: string; file: string; path: string; open: number; done?: number; last?: string | null; edited?: string | null; first?: string | null; replies?: number; agent?: number; people?: string[]; opened?: string | null };
type Lab = { name: string; port: number; here: boolean; mode: string; listening: string | null; pages: Page[]; root?: string; unreachable?: boolean; started?: string; created?: string | null };
type Parked = { name: string; port: number; root: string; archived?: boolean; at?: string };
type Deps = {
  root: ShadowRoot;
  el: (tag: string, attrs?: Record<string, string>, text?: string | Node) => HTMLElement;
  api: string; // /_lab/labs
  admin: string; // this computer's key ('' for a guest)
  page: string; // this page's key
  beforeOpen: () => void; // closes the ⋯ menu and anything else in the way
  // Phones: the box is one of the widget's own sheets (the comment and chat drawer, sheets.ts): the shared dimmed page,
  // the handle, the swipe down, the keyboard fit and back closing all come from there. sheet(open) tells the widget.
  sheet: (open: boolean) => void;
  swipe: (node: HTMLElement, close: () => void) => void;
};

let d: Deps;
let box: HTMLElement;
let input: HTMLInputElement;
let list: HTMLElement;
let data: { labs: Lab[]; parked: Parked[]; guest: boolean; local?: { name: string; port: number }[]; self?: string | null } | null = null;
let active = 0;
let toCur = false; // the first list after opening starts on the page you're on, scrolled to it
let armed = ''; // the park or archive button waiting for its second click: "action port"
let showArchived = false;

let panelEl: HTMLElement;
let foot: HTMLElement;
const switcherOpen = () => Boolean(box && !box.hidden);
/** The open box, for the widget's sheets (null when closed). */
export const switcherSheet = () => (switcherOpen() ? panelEl : null);

export function bindSwitcher(deps: Deps) {
  d = deps;
  const { el, root } = d;
  box = el('div', { class: 'switch', hidden: '', role: 'dialog', 'aria-label': 'labs and pages' });
  const panel = el('div', { class: 'sw-box' });
  panelEl = panel;
  input = el('input', { type: 'search', placeholder: 'Go to a page or a lab', 'aria-label': 'Go to a page or a lab', autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false' }) as HTMLInputElement;
  list = el('div', { class: 'sw-list', role: 'listbox' });
  foot = el('div', { class: 'sw-foot' });
  panel.append(el('div', { class: 'handle' }), input, list, foot);
  box.append(panel);
  root.append(box);
  d.swipe(panel, () => closeSwitcher());
  input.addEventListener('input', () => {
    active = 0;
    draw();
  });
  // Keys anywhere in the box (after a click on a fold button too); Enter only from the search, so a focused
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
    } else if (e.altKey && !e.metaKey && !e.ctrlKey && /^Key[SPAR]$/.test(e.code)) {
      // Option + a letter, read by key position (Option turns the letter into another character on a Mac).
      e.preventDefault();
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
  d.sheet(true);
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

export function closeSwitcher() {
  if (box.hidden) return;
  box.hidden = true;
  d.sheet(false);
}

/** Ask for the labs ahead, as the ⋯ menu opens, so the box opens with its list. */
export const preloadSwitcher = () => void load();

async function load() {
  try {
    data = await (await fetch(`${d.api}?page=${encodeURIComponent(d.page)}`, { cache: 'no-store' })).json();
  } catch {
    data = null;
  }
  if (switcherOpen()) draw();
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
  // Who listens, in words, for the lab's hover (Leo 18 Nov: an agent session's own name confused).
  if (lab.unreachable) return ['not answering'];
  if (lab.mode === 'listening') return ['Claude listening'];
  if (lab.mode === 'working') return ['Claude working'];
  return [`no agent listening${open ? `, ${open} open pins waiting` : ''}`];
};
const hit = (q: string, ...words: string[]) => !q || words.some((w) => (w || '').toLowerCase().includes(q));
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
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
/** A page's pins, always both numbers, and when it was last opened (Leo 18 Nov): "2 open · 0 closed · opened 3m ago". */
const pinFacts = (open: number, done: number, when: string) =>
  d.el('span', { class: 'sw-m' }, [`${open} open`, `${done} closed`, when].filter(Boolean).join(' · '));
/** The last comment's time as the rows show it: "just now", "4m ago", "Nov 3". */
const since = (iso?: string | null) => {
  const a = ago(iso);
  return !a ? '' : a === 'now' ? 'just now' : /\d[mhd]$/.test(a) ? `${a} ago` : a;
};
const latest = (...d: (string | null | undefined)[]) => d.filter(Boolean).sort().pop() || '';
const touched = (p: Page) => latest(p.opened, p.last); // newest first: last opened or commented on
const labTouched = (lab: Lab) => latest(...lab.pages.map(touched)) || lab.started || '';
// One order (Leo 18 Nov: no sorting): the lab you're in first, then the others, last written on first; pages likewise.
const orderPages = (ps: Page[]) => [...ps].sort((a, b) => touched(b).localeCompare(touched(a)));
const orderLabs = (labs: Lab[]) => [...labs].sort((a, b) => Number(b.here) - Number(a.here) || labTouched(b).localeCompare(labTouched(a)));

// The lab's name goes to its home (/, its pages), as a page's row goes to the page (Leo 18 Nov: "no way to go" there).
function home(lab: Lab) {
  const to = lab.here ? '/' : data?.guest ? `/_lab/hop?port=${lab.port}&to=%2F` : `http://localhost:${lab.port}/`;
  const a = d.el('a', { class: 'sw-home', href: to, title: `${lab.name}: all its pages` }, lab.name);
  a.addEventListener('click', (e) => e.stopPropagation());
  return a;
}

function draw() {
  const { el } = d;
  const q = input.value.trim().toLowerCase();
  const out: HTMLElement[] = [];
  if (!data) {
    list.replaceChildren(el('div', { class: 'sw-none' }, 'loading…'));
    return;
  }
  const local = !data.guest;
  // The lab keys only where they work: a guest can go to pages, not stop, park or start labs (they did nothing, silently).
  foot.textContent = `↑↓ choose · ↵ go · ⌘↵ new tab${local ? ' · ⌥S stop listening · ⌥P park · ⌥A archive · ⌥R start' : ''} · esc close`;
  if (data.self) {
    const note = el('div', { class: 'sw-none' }, 'This is your computer, opened through its wifi address, so it sees what a phone sees. ');
    note.append(el('a', { href: data.self }, 'Open it on localhost'), ' for every lab and the lab keys.');
    out.push(note);
  }
  for (const lab of orderLabs(data.labs)) {
    const labHit = hit(q, lab.name, String(lab.port));
    const pages = orderPages(lab.pages.filter((p) => labHit || hit(q, p.title, p.path, p.file)));
    if (q && !pages.length && !labHit) continue;
    // The lab: its name and port, who listens, its pins, and what you can do about it (this computer only).
    const head = el('div', { class: 'sw-lab' });
    const [status] = say(lab);
    const left = el('div', { class: 'sw-name' });
    // Just the lab's name, a heading over its pages (Leo 18 Nov: "focus on pages"); the lab's totals, who listens, when
    // it was made and how long it has run are on hover.
    const sum = (f: (p: Page) => number) => lab.pages.reduce((n, p) => n + f(p), 0);
    const open = sum((p) => p.open);
    const done = sum((p) => p.done || 0);
    const replies = sum((p) => p.replies || 0);
    const agent = sum((p) => p.agent || 0);
    const people = [...new Map(lab.pages.flatMap((p) => p.people || []).map((n) => [n.toLowerCase(), n] as const)).values()]; // "Leo" and "leo" are one
    const last = latest(...lab.pages.map((p) => p.last));
    left.append(home(lab), el('span', { class: 'sw-port' }, `:${lab.port}`));
    left.title = [
      status,
      open + done ? `${open} open, ${done} closed` : 'no pins yet',
      replies ? `${replies} replies${agent ? `, ${agent} from Claude` : ''}` : '',
      people.length ? `by ${people.join(', ')}` : '',
      last ? `last comment ${new Date(last).toLocaleString()}` : '',
      lab.created ? `created ${day(lab.created)}` : '',
      lab.started ? `running since ${new Date(lab.started).toLocaleString()}` : '',
      lab.listening ? `agent session: ${lab.listening}` : '',
    ].filter(Boolean).join('\n');
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
      // Open pins (filled dot) and closed (hollow), who commented, and the last comment's time.
      const meta = pinFacts(p.open, p.done || 0, here ? 'you’re here' : p.opened ? `opened ${since(p.opened)}` : 'never opened');
      // The time is the last comment's (Leo 18 Nov: file times were all the same after a copy); the file's is on hover.
      const tip = [p.first ? `first pin ${new Date(p.first).toLocaleString()}` : '', p.last ? `last comment ${new Date(p.last).toLocaleString()}` : '',
        p.replies ? `${p.replies} replies${p.agent ? `, ${p.agent} from Claude` : ''}` : '', p.people?.length ? `by ${p.people.join(', ')}` : '', p.edited ? `file changed ${new Date(p.edited).toLocaleString()}` : ''].filter(Boolean).join('\n');
      if (tip) meta.title = tip;
      // The title, and the page's path beside it (Leo 18 Nov: "Getting around your labs" didn't say it was /lab-navigation).
      const t = el('span', { class: 'sw-t' }, short(lab, p));
      if (p.title) t.append(el('span', { class: 'sw-path' }, ` ${p.path}`));
      row.append(t, meta);
      const url = lab.here ? new URL(p.url, location.href).pathname : p.url;
      row.addEventListener('click', (e: MouseEvent) => {
        if (e.metaKey || e.ctrlKey) window.open(lab.here ? location.origin + url : url, '_blank');
        else location.href = url;
      });
      out.push(row);
    }
    if (!pages.length) out.push(el('div', { class: 'sw-none' }, lab.unreachable ? 'this lab isn’t answering' : 'no pages yet'));
  }
  // A phone: the labs it can't open (not on the wifi, or an older labit), named so none seems missing (Leo 18 Nov).
  const away = (data.local || []).filter((l) => hit(q, l.name, String(l.port)));
  if (data.guest && away.length) {
    out.push(el('div', { class: 'sw-group' }, `on the computer only · ${away.length}`));
    for (const l of away) {
      const r = el('div', { class: 'sw-lab parked' });
      const n = el('div', { class: 'sw-name' });
      n.append(el('span', { class: 'sw-port' }, `${l.name} :${l.port}`)); // grey: nothing to tap here
      r.append(n);
      out.push(r);
    }
    out.push(el('div', { class: 'sw-none' }, 'They open here once they run the newest labit with --wifi.'));
  }
  if (local) {
    const all = data.parked.filter((p) => hit(q, p.name, String(p.port)));
    const order = (ps: Parked[]) => [...ps].sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
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
      row.addEventListener('click', (e) => {
        // The archive/unarchive chip sits inside the row: its click mustn't also start the lab.
        if (e.composedPath().some((n) => n instanceof HTMLElement && n.classList.contains('sw-mini'))) return;
        start(p.port, row);
      });
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
