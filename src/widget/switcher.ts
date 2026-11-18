// Labs & pages (⌘K, or the ⋯ menu): every lab running on this computer and its pages, to go to one; who listens on
// each, to stop it; park a lab and start it again. A guest on a phone sees this lab's pages only. Part of the comment
// widget (src/comments.js bundles it). Leo, 18 Nov (the lab-navigation page, option B).

type Page = { url: string; title: string; file: string; path: string; open: number };
type Lab = { name: string; port: number; here: boolean; mode: string; listening: string | null; pages: Page[]; root?: string; unreachable?: boolean };
type Parked = { name: string; port: number; root: string };
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
let armed = ''; // the park button waiting for its second click: "lab port"

const switcherOpen = () => Boolean(box && !box.hidden);

export function bindSwitcher(deps: Deps) {
  d = deps;
  const { el, root } = d;
  box = el('div', { class: 'switch', hidden: '', role: 'dialog', 'aria-label': 'labs and pages' });
  const scrim = el('div', { class: 'sw-scrim' });
  const panel = el('div', { class: 'sw-box' });
  input = el('input', { type: 'search', placeholder: 'Go to a page or a lab', 'aria-label': 'Go to a page or a lab', autocomplete: 'off', spellcheck: 'false' }) as HTMLInputElement;
  list = el('div', { class: 'sw-list', role: 'listbox' });
  const foot = el('div', { class: 'sw-foot' }, '↑↓ choose · ↵ go · ⌘↵ new tab · esc close');
  panel.append(input, list, foot);
  box.append(scrim, panel);
  root.append(box);
  scrim.addEventListener('click', () => closeSwitcher());
  input.addEventListener('input', () => {
    active = 0;
    draw();
  });
  input.addEventListener('keydown', (e) => {
    const rows = [...list.querySelectorAll<HTMLElement>('.sw-row')];
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!rows.length) return;
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
      mark(rows);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      rows[active]?.dispatchEvent(new MouseEvent('click', { metaKey: e.metaKey || e.ctrlKey }));
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
  input.value = '';
  active = 0;
  armed = '';
  draw();
  input.focus({ preventScroll: true });
  void load();
}

function closeSwitcher() {
  box.hidden = true;
}

async function load() {
  try {
    data = await (await fetch(d.api, { cache: 'no-store' })).json();
  } catch {
    data = null;
  }
  if (switcherOpen()) draw();
}

async function act(action: 'stop' | 'park' | 'start', port: number) {
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

function draw() {
  const { el } = d;
  const q = input.value.trim().toLowerCase();
  const out: HTMLElement[] = [];
  if (!data) {
    list.replaceChildren(el('div', { class: 'sw-none' }, 'loading…'));
    return;
  }
  const local = !data.guest;
  for (const lab of data.labs) {
    const labHit = hit(q, lab.name, String(lab.port));
    const pages = lab.pages.filter((p) => labHit || hit(q, p.title, p.path, p.file));
    if (q && !pages.length && !labHit) continue;
    // The lab: its name and port, who listens, and what you can do about it (this computer only).
    const head = el('div', { class: 'sw-lab' });
    const [status, tone] = say(lab);
    const left = el('div', { class: 'sw-name' });
    left.append(el('b', {}, lab.name), ` · ${lab.port}${lab.here ? ' · this lab' : ''}`, el('span', { class: `sw-st ${tone}` }, status));
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
      if (lab.mode !== 'away') btn('stop listening', () => act('stop', lab.port), 'end the agent’s wait on this lab; its pins stay');
      else
        btn('get Claude listening', () => {
          const line = `Listen for pins on http://localhost:${lab.port}${lab.here ? d.page : '/'} with labit wait${lab.here ? ` --page ${d.page}` : ''}`;
          navigator.clipboard?.writeText(line).catch(() => {});
          (acts.querySelector('button') as HTMLElement).textContent = 'copied: paste it to Claude';
        }, 'copies one line to paste to your agent');
      const key = `${lab.name} ${lab.port}`;
      const park = btn(armed === key ? (lab.here ? 'park: this page closes' : 'park: sure?') : 'park', () => {
        if (armed !== key) {
          armed = key;
          return draw();
        }
        armed = '';
        void act('park', lab.port);
      }, 'stop this lab; it waits under "parked" to start again');
      if (armed === key) park.classList.add('armed');
      head.append(acts);
    }
    out.push(head);
    for (const p of pages) {
      const row = el('button', { type: 'button', class: `sw-row${lab.here && p.path === d.page ? ' cur' : ''}`, role: 'option' });
      row.append(el('span', { class: 'sw-t' }, short(lab, p)), el('span', { class: 'sw-m' }, p.open ? `${p.open} open` : lab.here && p.path === d.page ? 'you’re here' : ''));
      const url = lab.here ? new URL(p.url, location.href).pathname : p.url;
      row.addEventListener('click', (e: MouseEvent) => {
        if (e.metaKey || e.ctrlKey) window.open(lab.here ? location.origin + url : url, '_blank');
        else location.href = url;
      });
      out.push(row);
    }
    if (!pages.length) out.push(el('div', { class: 'sw-none' }, lab.unreachable ? 'this lab isn’t answering' : 'no pages yet'));
  }
  if (data.guest) out.push(el('div', { class: 'sw-none' }, 'Other labs on that computer need their own link: ask Claude for one.'));
  const parked = data.parked.filter((p) => hit(q, p.name, String(p.port)));
  if (local && parked.length) {
    out.push(el('div', { class: 'sw-group' }, 'parked'));
    for (const p of parked) {
      const head = el('div', { class: 'sw-lab parked' });
      const left = el('div', { class: 'sw-name' });
      left.append(el('b', {}, p.name), ` · ${p.port}`);
      const acts = el('div', { class: 'sw-acts' });
      const b = el('button', { type: 'button' }, 'start');
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        b.textContent = 'starting…';
        void act('start', p.port);
      });
      acts.append(b);
      head.append(left, acts);
      out.push(head);
    }
  }
  if (!out.length) out.push(el('div', { class: 'sw-none' }, 'nothing matches'));
  list.replaceChildren(...out);
  mark([...list.querySelectorAll<HTMLElement>('.sw-row')]);
}

function mark(rows: HTMLElement[]) {
  if (active >= rows.length) active = Math.max(0, rows.length - 1);
  rows.forEach((r, i) => r.classList.toggle('on', i === active));
  rows[active]?.scrollIntoView({ block: 'nearest' });
}
