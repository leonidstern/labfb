// Measure (flag measure, Leo 19 Nov): G (for gauge; M hides comments) or "measure" in the ⋯ menu. Click or tap one
// thing (green ring), then hover (computer) or tap (phone) another (blue ring): lines with the px between them and the
// space token, red when it is none, and the other's size. Border edge to border edge between two things; the inner
// border edges when one holds the other (all four sides). One decimal, CSS px (a zoom or scale above both is taken out
// with a 100 px probe), a token named only on an exact match: the page's own --space-* if it has them, else 4/8/12/16/
// 24/32 = space-1…space-8. Enter or "pin" leaves a pin on it carrying what was measured. Esc lets go, then leaves.
// A part loaded the first time it is used (scripts/build-widget.mjs PARTS); the widget's own parts come in through W.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let W: any;
const M = { on: false, sel: null as Element | null, hov: null as Element | null, locked: false, text: '', k: 1, tok: new Map<number, string>(), box: null as HTMLElement | null, bar: null as HTMLElement | null, words: null as HTMLElement | null, raf: 0 };
const GREEN = 'rgb(52, 199, 89)', BLUE = '#0a84ff', RED = '#ff3b30';
const CSS = `.mz { position: fixed; inset: 0; pointer-events: none; z-index: 4; font: 500 11px/1 system-ui, sans-serif; }
.mz i { position: absolute; display: block; box-sizing: border-box; }
.mz .ln { background: ${BLUE}; } .mz .ln.bad { background: ${RED}; }
.mz .tg { padding: 3px 5px; border-radius: 4px; background: ${BLUE}; color: #fff; white-space: nowrap; transform: translate(-50%, -50%); font-style: normal; }
.mz .tg.bad { background: ${RED}; } .mz .tg.sz { background: #141414; transform: translate(-50%, 4px); }
.mz .bx { outline: 1.5px solid ${BLUE}; } .mz .bx.sel { outline: 2px solid ${GREEN}; }
.mzbar { position: fixed; left: 16px; right: 16px; bottom: calc(80px + env(safe-area-inset-bottom, 0px)); width: fit-content; max-width: 560px; margin: 0 auto; box-sizing: border-box;
  display: flex; align-items: center; gap: 8px; padding: 6px 6px 6px 12px; background: var(--_bg); color: var(--_fg); border-radius: var(--_radius); box-shadow: var(--_shadow);
  font: 13px/1.3 var(--lab-font, system-ui, sans-serif); pointer-events: auto; }
.mzbar span { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.mzbar button { all: unset; cursor: pointer; padding: 5px 9px; border-radius: var(--_r-s); background: var(--_soft); white-space: nowrap; }
.mzbar button:hover { background: var(--_hover); } .mzbar button:disabled { opacity: .4; cursor: default; }`;
// 4/8/12/16/24/32 → space-1…space-8, unless the page has its own --space-* (read from its stylesheets, sized by a probe).
const DEF: [number, string][] = [[4, 'space-1'], [8, 'space-2'], [12, 'space-3'], [16, 'space-4'], [24, 'space-6'], [32, 'space-8']];
function tokens() {
  const names = new Set<string>();
  const walk = (rules: CSSRuleList) => {
    for (const r of rules) {
      const st = (r as CSSStyleRule).style;
      if (st) for (let i = 0; i < st.length; i++) if (st[i].startsWith('--space-')) names.add(st[i]);
      if ((r as CSSGroupingRule).cssRules) walk((r as CSSGroupingRule).cssRules);
    }
  };
  for (const s of document.styleSheets) {
    try {
      walk(s.cssRules);
    } catch {} // another site's sheet: not readable
  }
  const m = new Map<number, string>();
  const p = document.createElement('i');
  p.style.cssText = 'position:absolute;visibility:hidden;height:0';
  document.body.append(p);
  for (const n of names) {
    p.style.width = `var(${n})`;
    const v = +parseFloat(getComputedStyle(p).width).toFixed(1);
    if (v > 0 && !m.has(v)) m.set(v, n.slice(2));
  }
  p.remove();
  return m.size ? m : new Map(DEF);
}
// Screen px → CSS px: a 100 px probe in the shared parent shows any zoom or scale above it.
const scaleOf = (el: Element) => {
  const p = document.createElement('i');
  p.style.cssText = 'position:absolute;width:100px;height:0;visibility:hidden';
  el.appendChild(p);
  const s = p.getBoundingClientRect().width / 100;
  p.remove();
  return s || 1;
};
const common = (a: Element, b: Element) => {
  let x: Element | null = a;
  while (x && !x.contains(b)) x = x.parentElement;
  return x || document.body;
};
const fmt = (px: number) => +(px / M.k).toFixed(1);
const tokenOf = (v: number) => M.tok.get(v) || '';
// "no token (8 or 12)": the tokens either side.
const near = (v: number) => {
  const all = [...M.tok.keys()].sort((a, b) => a - b);
  const lo = all.filter((t) => t < v).pop(), hi = all.find((t) => t > v);
  return lo !== undefined && hi !== undefined ? `no token (${lo} or ${hi})` : `no token (nearest ${lo ?? hi})`;
};
const said = (v: number) => (v ? `${v} px, ${tokenOf(v) || near(v)}` : '0 px');
const desc = (e: Element) => {
  const c = typeof e.className === 'string' ? e.className.trim().split(/\s+/)[0] : '';
  // Its own words, when it has some and no id: two buttons of one class are told apart.
  const words = e.id || e.childElementCount ? '' : (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 24);
  return (e.id ? `#${e.id}` : e.localName + (c ? `.${c}` : '')) + (words ? ` "${words}"` : '');
};
const add = (cls: string, st: Partial<Record<string, string>>, text = '') => {
  const d = document.createElement('i');
  d.className = cls;
  Object.assign(d.style, st);
  if (text) d.textContent = text;
  M.box!.append(d);
};
const line = (x1: number, y1: number, x2: number, y2: number, px: number) => {
  if (px <= 0) return;
  const v = fmt(px), t = tokenOf(v), bad = t ? '' : ' bad';
  add('ln' + bad, { left: `${Math.min(x1, x2)}px`, top: `${Math.min(y1, y2)}px`, width: `${Math.max(1, Math.abs(x2 - x1))}px`, height: `${Math.max(1, Math.abs(y2 - y1))}px` });
  // Beside its line, not on it: what is measured stays in sight.
  add('tg' + bad, { left: `${(x1 + x2) / 2}px`, top: `${(y1 + y2) / 2}px`, transform: y1 === y2 ? 'translate(-50%, calc(-100% - 4px))' : 'translate(6px, -50%)' }, `${v} px · ${t || 'no token'}`);
};
const ring = (r: DOMRect, cls: string) => add(cls, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });

/** What is measured now, as words: on the bar and in a pin. */
function draw() {
  M.raf = 0;
  if (!M.box) return;
  M.box.replaceChildren();
  const { sel, hov } = M;
  const coarse = W.coarse;
  if (sel) ring(sel.getBoundingClientRect(), 'bx sel');
  let text = '';
  if (!hov) {
    say(sel ? `${desc(sel)}: now ${coarse ? 'tap' : 'hover'} another` : `${coarse ? 'Tap' : 'Click'} one thing, then ${coarse ? 'tap' : 'hover'} another`);
    return;
  }
  const h = hov.getBoundingClientRect();
  M.k = scaleOf(sel && sel !== hov ? common(sel, hov) : hov.parentElement || hov);
  const size = `${fmt(h.width)} × ${fmt(h.height)}`;
  ring(h, 'bx');
  add('tg sz', { left: `${(h.left + h.right) / 2}px`, top: `${h.bottom}px` }, size);
  const zoom = Math.abs(M.k - 1) > 0.001 ? ` (CSS px; on screen ×${+M.k.toFixed(2)})` : '';
  if (!sel || sel === hov) text = `${desc(hov)} ${size} px${zoom}`;
  else {
    const a = sel.getBoundingClientRect();
    const inside = (o: DOMRect, i: DOMRect) => i.left >= o.left - 0.5 && i.right <= o.right + 0.5 && i.top >= o.top - 0.5 && i.bottom <= o.bottom + 0.5;
    const out: string[] = [];
    if (inside(h, a) || inside(a, h)) {
      const hOut = inside(h, a);
      const [O, i] = hOut ? [h, a] : [a, h];
      const cs = getComputedStyle(hOut ? hov : sel), bw = (s: string) => parseFloat(cs.getPropertyValue(s)) * M.k || 0;
      const o = { l: O.left + bw('border-left-width'), r: O.right - bw('border-right-width'), t: O.top + bw('border-top-width'), b: O.bottom - bw('border-bottom-width') };
      const my = (i.top + i.bottom) / 2, mx = (i.left + i.right) / 2;
      line(o.l, my, i.left, my, i.left - o.l);
      line(i.right, my, o.r, my, o.r - i.right);
      line(mx, o.t, mx, i.top, i.top - o.t);
      line(mx, i.bottom, mx, o.b, o.b - i.bottom);
      out.push(`inside: left ${said(fmt(i.left - o.l))}; right ${said(fmt(o.r - i.right))}; top ${said(fmt(i.top - o.t))}; bottom ${said(fmt(o.b - i.bottom))}`);
    } else {
      const my = (Math.max(a.top, h.top) + Math.min(a.bottom, h.bottom)) / 2, mx = (Math.max(a.left, h.left) + Math.min(a.right, h.right)) / 2;
      const gap = (x1: number, y1: number, x2: number, y2: number, px: number, dir: string) => (line(x1, y1, x2, y2, px), out.push(`${dir} gap ${said(fmt(px))}`));
      if (h.left >= a.right) gap(a.right, my, h.left, my, h.left - a.right, 'across');
      if (a.left >= h.right) gap(h.right, my, a.left, my, a.left - h.right, 'across');
      if (h.top >= a.bottom) gap(mx, a.bottom, mx, h.top, h.top - a.bottom, 'down');
      if (a.top >= h.bottom) gap(mx, h.bottom, mx, a.top, a.top - h.bottom, 'down');
    }
    text = `${desc(sel)} → ${desc(hov)}: ${out.length ? out.join('; ') : 'they overlap'}; the second is ${size} px${zoom}`;
  }
  say(text, text);
}
function say(words: string, text = '') {
  M.text = text;
  M.words!.textContent = words;
  (M.bar!.querySelector('[data-a="pin"]') as HTMLButtonElement).disabled = !text;
}
const redraw = () => M.on && (M.raf ||= requestAnimationFrame(draw));

/** A pin on the thing measured last, carrying what was measured (lib/comments-api.mjs: "measured:"). */
function pin() {
  const t = M.hov || M.sel, text = M.text;
  if (!t || !text) return;
  const r = t.getBoundingClientRect();
  const a = W.anchorAt(r.left + Math.min(24, r.width / 2), r.top + Math.min(r.height / 2, 24), false, t);
  measure(W, false);
  W.S.openId = null;
  W.begin({ ...a, measure: text });
}

let bound = false;
/** The mode on or off (G, the ⋯ menu's "measure", or the bar's done). */
export function measure(w: unknown, on = !M.on) {
  W = w;
  if (!bound) bind();
  M.on = on;
  W.S.measuring = on;
  document.documentElement.classList.toggle('lab-measuring', on);
  M.sel = M.hov = null;
  M.locked = false;
  if (!on) return void (M.box?.remove(), M.bar?.remove());
  M.tok = tokens();
  W.root.append(M.box!, M.bar!);
  draw();
}
function bind() {
  bound = true;
  const style = document.createElement('style');
  style.textContent = CSS;
  W.root.append(style);
  W.fonts.textContent += ' html.lab-measuring body, html.lab-measuring body * { cursor: crosshair !important; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }';
  M.box = Object.assign(document.createElement('div'), { className: 'mz' });
  M.bar = Object.assign(document.createElement('div'), { className: 'mzbar' });
  M.words = document.createElement('span');
  M.words.setAttribute('aria-live', 'polite');
  const btn = (a: string, words: string, title: string, go: () => void) => {
    const b = Object.assign(document.createElement('button'), { type: 'button', textContent: words, title });
    b.dataset.a = a;
    b.addEventListener('click', (e) => (e.stopPropagation(), go()));
    return b;
  };
  M.bar.append(M.words, btn('pin', 'pin', 'a pin carrying this (Enter)', pin), btn('done', 'done', 'leave measure (G, Esc)', () => measure(W, false)));
  const quiet = (e: Event) => (e.preventDefault(), e.stopImmediatePropagation());
  const mine = (e: Event) => M.on && !e.composedPath().includes(W.host);
  const at = (e: Event) => {
    const t = e.target instanceof Element ? e.target : null;
    return t && t !== document.documentElement ? t : null;
  };
  const take = (t: Element | null) => {
    if (!t || M.locked || !M.sel) [M.sel, M.hov, M.locked] = [t, null, false]; // the first, or start again
    else if (t === M.sel) [M.sel, M.hov] = [null, null];
    else [M.hov, M.locked] = [t, true]; // the second: it stays until the next click
    draw();
  };
  // A finger picks on its lift, if it didn't move (a scroll picks nothing); the click after it is dropped.
  let down = { x: 0, y: 0, at: 0 }, tapped = 0;
  // Before the page and the pins see them (window, capture): a click or tap picks instead of pinning or pressing.
  for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu'])
    addEventListener(type, (e) => {
      if (!mine(e)) return;
      const pe = e as PointerEvent, touch = pe.pointerType === 'touch' || pe.pointerType === 'pen';
      if (type === 'pointerdown' && touch) down = { x: pe.clientX, y: pe.clientY, at: Date.now() };
      quiet(e);
      if (type === 'pointerup' && touch && Math.hypot(pe.clientX - down.x, pe.clientY - down.y) < 10 && Date.now() - down.at < 600) {
        tapped = Date.now();
        take(at(e));
      } else if (type === 'click' && Date.now() - tapped > 700) take(at(e));
    }, true);
  addEventListener('pointermove', (e) => {
    if (!mine(e) || M.locked || e.pointerType !== 'mouse') return;
    const t = at(e);
    if (t === M.hov) return;
    M.hov = t;
    redraw();
  }, true);
  addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if (!M.on || e.metaKey || e.ctrlKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(t?.tagName) || t?.isContentEditable || W.S.draft) return;
    if (e.key === 'Escape') {
      quiet(e);
      if (!M.sel && !M.hov) return void measure(W, false);
      M.sel = M.hov = null;
      M.locked = false;
      draw();
    } else if (e.key === 'Enter' && M.text) {
      quiet(e);
      pin();
    }
  }, true);
  addEventListener('scroll', redraw, { capture: true, passive: true });
  addEventListener('resize', redraw);
}
