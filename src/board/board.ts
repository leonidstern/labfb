// The board page (flag `board`): a board's frames on one canvas you pan and zoom. Loaded by /_lab/board/<name> only,
// before the widget, which rides on the page as it does on any other. The board file and its API come from the lab
// (lib/board.ts, GET /_lab/api/board). Frames are the lab's own pages in iframes, named "lab:<id>", which the widget in
// them reads as "draw nothing, bind nothing" (src/widget/frame.ts, it finds window.__labBoard on top).
//
// Camera: cam = { x, y, z }, screen = (world + cam) * z. The world is one element with one transform; a frame is a box in it.
import { clamp, fitAll, fitFrame, panBy, zoomAt } from './camera.ts';
import type { Cam, Box } from './camera.ts';

type Frame = { id: string; src: string; w: number; h: number; x: number; y: number; label?: string; state?: string };
type Card = { f: Frame; box: HTMLElement; inner: HTMLElement; frame?: HTMLIFrameElement; seen: number };

const script = document.currentScript as HTMLScriptElement;
const name = script.dataset.name || '';
let of = new URLSearchParams(location.search).get('of') || ''; // the page this board is about: Esc on an empty board goes back to it
const coarse = matchMedia('(pointer: coarse)').matches;
const CAP = coarse ? 3 : 8; // frames alive at once
const AT_ONCE = coarse ? 1 : 2; // frames loading at once
const WAKE = 120; // a frame is woken when it is in view and at least this many screen px wide

const css = `
html,body{margin:0;height:100%;overflow:hidden;overscroll-behavior:none;background:#e9e8e4;color:#1d1d1b;font:13px/1.35 system-ui,-apple-system,sans-serif}
@media (prefers-color-scheme:dark){html,body{background:#1b1b1a;color:#e9e8e4}}
#lab-board{position:fixed;inset:0;overflow:hidden;touch-action:none;user-select:none;-webkit-user-select:none;cursor:default}
#lab-board .world{position:absolute;left:0;top:0;transform-origin:0 0}
#lab-board .f{position:absolute}
#lab-board .b{position:absolute;inset:0;background:#fff;contain:layout paint}
#lab-board .f.off{content-visibility:hidden}
#lab-board .f.sel{outline:calc(2px*var(--iz)) solid #1f7a4d;outline-offset:calc(1px*var(--iz))}
#lab-board iframe{position:absolute;inset:0;width:100%;height:100%;border:0;background:#fff;pointer-events:none}
#lab-board .f.in iframe{pointer-events:auto}
#lab-board .t{position:absolute;left:0;bottom:100%;white-space:nowrap;transform-origin:0 100%;transform:scale(var(--iz));padding-bottom:4px;opacity:.75}
#lab-board .c{position:absolute;inset:0;box-sizing:border-box;padding:calc(20px*var(--iz));font-size:calc(14px*var(--iz));line-height:1.5;color:#1d1d1b;background:#f6f5f1}
#lab-board .c b{display:block;font-size:calc(22px*var(--iz));font-weight:600;margin-bottom:calc(6px*var(--iz))}
#lab-board .none{position:absolute;inset:0;display:grid;place-items:center;opacity:.7}
#lab-board .done{position:fixed;top:max(12px,env(safe-area-inset-top));left:12px;z-index:5;font:inherit;color:inherit;background:none;border:0;padding:8px;text-decoration:underline;cursor:pointer}
`;
document.head.append(Object.assign(document.createElement('style'), { textContent: css }));
const root = document.createElement('div');
root.id = 'lab-board';
const world = document.createElement('div');
world.className = 'world';
root.append(world);
document.body.append(root);

let cards: Card[] = [];
let edited: Record<string, string> = {}; // page path -> when its file was saved
let cam: Cam = { x: 0, y: 0, z: 1 };
let view = { w: innerWidth, h: innerHeight };
let moved = false; // the person moved the camera: a resize no longer fits everything again
let selected = '';
let entered = '';
let lastDown = 0;
let checked = { x: 1e9, y: 1e9, z: 0 }; // the camera at the last wake/cull check
let still: ReturnType<typeof setTimeout> | undefined;
let hashTimer: ReturnType<typeof setTimeout> | undefined;

const boxes = (): Box[] => cards.map((c) => c.f);
const ago = (iso?: string) => {
  const s = iso ? (Date.now() - Date.parse(iso)) / 1000 : NaN;
  return !(s >= 0) ? '' : s < 60 ? 'edited just now' : s < 3600 ? `edited ${Math.floor(s / 60)}m ago` : s < 86400 ? `edited ${Math.floor(s / 3600)}h ago` : `edited ${Math.floor(s / 86400)}d ago`;
};
const text = (tag: string, t: string, to: Node) => to.appendChild(Object.assign(document.createElement(tag), { textContent: t }));

// A title card: what the frame is, as plain text. No screenshot (it would go stale), no count of comments.
const card = (c: Card) => {
  const el = document.createElement('div');
  el.className = 'c';
  text('b', c.f.label || c.f.src, el);
  text('div', `${c.f.w} × ${c.f.h}`, el);
  if (c.f.label) text('div', c.f.src, el);
  const when = ago(edited[c.f.src.replace(/\.html?$/i, '').replace(/\/$/, '') || '/']);
  if (when) text('div', when, el);
  return el;
};

const draw = () => {
  world.style.transform = `scale(${cam.z}) translate(${cam.x}px,${cam.y}px)`;
  world.style.setProperty('--iz', String(1 / cam.z));
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    try {
      history.replaceState(history.state, '', `#${Math.round(cam.x)},${Math.round(cam.y)},${cam.z.toFixed(3)}`);
    } catch {}
  }, 200);
};
// While the camera moves the world is its own layer; a layer kept after it stops would stay a blurry bitmap at the new zoom.
const moving = () => {
  world.style.willChange = 'transform';
  clearTimeout(still);
  still = setTimeout(() => (world.style.willChange = ''), 140);
};
const go = (next: Cam, user = true) => {
  cam = clamp(next, boxes(), view);
  if (user) moved = true;
  draw();
  moving();
  if (Math.abs(cam.x - checked.x) * cam.z > 64 || Math.abs(cam.y - checked.y) * cam.z > 64 || Math.abs(cam.z / (checked.z || 1) - 1) > 0.05) wake();
};

// Which frames are alive. Those in view and wide enough, nearest the centre first, up to the cap, two loading at a time;
// when the cap is reached the one seen longest ago is dropped back to its card (never the selected or entered one).
const loading = () => cards.filter((c) => c.frame && !c.frame.dataset.ready).length;
function wake() {
  checked = { ...cam };
  const now = performance.now();
  const near = (c: Card) => {
    const f = c.f;
    return { l: (f.x + cam.x) * cam.z, t: (f.y + cam.y) * cam.z, r: (f.x + f.w + cam.x) * cam.z, b: (f.y + f.h + cam.y) * cam.z };
  };
  const seen = cards.filter((c) => {
    const r = near(c);
    const inView = r.r > -200 && r.l < view.w + 200 && r.b > -200 && r.t < view.h + 200;
    c.box.classList.toggle('off', !inView);
    return r.r > 0 && r.l < view.w && r.b > 0 && r.t < view.h;
  });
  for (const c of seen) if (c.frame) c.seen = now;
  const dist = (c: Card) => {
    const r = near(c);
    return Math.hypot((r.l + r.r) / 2 - view.w / 2, (r.t + r.b) / 2 - view.h / 2);
  };
  const want = seen.filter((c) => !c.frame && c.f.w * cam.z >= WAKE).sort((a, b) => dist(a) - dist(b));
  const alive = () => cards.filter((c) => c.frame);
  for (const c of want) {
    if (loading() >= AT_ONCE) break;
    if (alive().length >= CAP) {
      const old = alive().filter((o) => o.f.id !== selected && o.f.id !== entered && !seen.includes(o)).sort((a, b) => a.seen - b.seen)[0];
      if (!old) break;
      sleep(old);
    }
    live(c);
  }
}
function live(c: Card) {
  if (c.frame) return;
  const fr = document.createElement('iframe');
  fr.name = `lab:${c.f.id}`;
  fr.title = c.f.label || c.f.src;
  fr.addEventListener('load', () => {
    fr.dataset.ready = '1';
    if (entered === c.f.id) focusIn(c);
    wake(); // the next one may load now
  }, { once: true });
  fr.src = c.f.src;
  c.frame = fr;
  c.seen = performance.now();
  c.inner.replaceChildren(fr);
}
function sleep(c: Card) {
  c.frame?.remove();
  c.frame = undefined;
  c.inner.replaceChildren(card(c));
}

// ---------- frames in the world ----------
const label = (f: Frame) => `${f.label || f.src} · ${f.w} × ${f.h}`;
function show(b: { frames: Frame[]; rev: number; of?: string }) {
  of = of || (b.of || '').split('#')[0];
  const next = b.frames.filter((f) => f.state !== 'archived' && Number.isFinite(f.x));
  const old = new Map(cards.map((c) => [c.f.id, c]));
  cards = next.map((f) => {
    const was = old.get(f.id);
    old.delete(f.id);
    if (was && was.f.src === f.src && was.f.w === f.w && was.f.h === f.h) {
      was.f = f;
      return was;
    }
    was?.box.remove();
    const box = document.createElement('div');
    box.className = 'f';
    const inner = document.createElement('div');
    inner.className = 'b';
    const c: Card = { f, box, inner, seen: 0 };
    box.dataset.id = f.id;
    inner.appendChild(card(c));
    box.append(inner);
    text('div', '', box).className = 't';
    world.append(box);
    return c;
  });
  for (const c of old.values()) c.box.remove();
  for (const c of cards) {
    const f = c.f;
    Object.assign(c.box.style, { left: `${f.x}px`, top: `${f.y}px`, width: `${f.w}px`, height: `${f.h}px` });
    (c.box.querySelector('.t') as HTMLElement).textContent = label(f);
  }
  if (selected && !cards.some((c) => c.f.id === selected)) selected = entered = '';
  world.querySelector('.none')?.remove();
  if (!cards.length) text('div', 'No frames on this board.', world).className = 'none';
  const hash = /^#(-?\d+),(-?\d+),([\d.]+)$/.exec(location.hash);
  if (hash && !moved) cam = { x: +hash[1], y: +hash[2], z: +hash[3] };
  else if (!moved) cam = coarse && cards[0] ? fitFrame(cards[0].f, view) : fitAll(boxes(), view);
  moved = moved || Boolean(hash);
  go(cam, false);
  wake();
}
const load = async () => {
  const res = await fetch(`/_lab/api/board?name=${name}${of ? `&page=${encodeURIComponent(of)}` : ''}`);
  if (!res.ok) {
    text('div', res.status === 404 ? `There is no board called ${name}.` : 'The board could not be read.', world).className = 'none';
    return;
  }
  show(await res.json());
};
// When each page was saved, for "edited 5m ago" (a variant's file has no such time here: the card says none).
fetch('/_lab/pages').then((r) => r.json()).then((d) => {
  edited = Object.fromEntries((d.pages || []).map((p: { path: string; edited: string }) => [p.path, p.edited]));
  for (const c of cards) if (!c.frame) c.inner.replaceChildren(card(c));
}).catch(() => {});

// ---------- selecting and entering ----------
const find = (id: string) => cards.find((c) => c.f.id === id);
function select(id: string) {
  if (entered && entered !== id) leave();
  selected = id;
  for (const c of cards) c.box.classList.toggle('sel', c.f.id === id);
}
function focusIn(c: Card) {
  c.frame?.focus();
  c.frame?.contentWindow?.focus();
}
function enter(id: string) {
  const c = find(id);
  if (!c) return;
  select(id);
  entered = id;
  c.box.classList.add('in');
  if (!c.frame) live(c); // a card is woken to be entered, cap or not
  else focusIn(c);
  if (coarse) done.hidden = false;
}
function leave() {
  const c = find(entered);
  entered = '';
  done.hidden = true;
  if (!c) return;
  c.box.classList.remove('in');
  // The keys stay with the frame's document until focus is moved back: M, ⇧B and Esc would go to the wrong one.
  (c.frame?.contentWindow as unknown as { __labSpot?: { clear?: () => void } } | null | undefined)?.__labSpot?.clear?.();
  c.frame?.blur();
  window.focus();
}
const done = Object.assign(document.createElement('button'), { className: 'done', type: 'button', textContent: 'done', hidden: true });
done.addEventListener('click', () => (leave(), select('')));
root.append(done);

// ---------- input: the board owns its surface (these run before the widget's own listeners) ----------
const at = (e: { clientX: number; clientY: number }) => {
  const x = e.clientX / cam.z - cam.x;
  const y = e.clientY / cam.z - cam.y;
  return cards.find((c) => x >= c.f.x && x <= c.f.x + c.f.w && y >= c.f.y && y <= c.f.y + c.f.h)?.f.id || '';
};
const mine = (e: Event) => e.target instanceof Node && root.contains(e.target);
const pts = new Map<number, { x: number; y: number }>();
let down: { x: number; y: number; id: string; far: boolean; at: number } | null = null;
let tap = { at: 0, x: 0, y: 0 };
let pinch = 0;
let space = false;
const eat = (e: Event) => (e.stopImmediatePropagation(), e.preventDefault());

addEventListener('pointerdown', (e) => {
  if (!mine(e) || entered && e.target instanceof HTMLIFrameElement) return;
  eat(e);
  lastDown = performance.now();
  (document.activeElement as HTMLElement | null)?.blur?.();
  pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  root.setPointerCapture?.(e.pointerId);
  if (pts.size === 2) {
    const [a, b] = [...pts.values()];
    pinch = Math.hypot(a.x - b.x, a.y - b.y);
    if (down) down.far = true; // a second finger: this was no tap
  } else down = { x: e.clientX, y: e.clientY, id: at(e), far: false, at: performance.now() };
}, true);
addEventListener('pointermove', (e) => {
  const p = pts.get(e.pointerId);
  if (!p) return;
  eat(e);
  const [dx, dy] = [e.clientX - p.x, e.clientY - p.y];
  if (pts.size === 2) {
    const o = [...pts.entries()].find(([id]) => id !== e.pointerId)![1];
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const d = Math.hypot(e.clientX - o.x, e.clientY - o.y);
    const mid = { x: (e.clientX + o.x) / 2, y: (e.clientY + o.y) / 2 };
    if (pinch) go(panBy(zoomAt(cam, mid.x, mid.y, cam.z * (d / pinch), boxes(), view), dx / 2, dy / 2));
    pinch = d;
    return;
  }
  pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) down.far = true;
  if (down?.far) go(panBy(cam, dx, dy));
}, true);
const up = (e: PointerEvent) => {
  if (!pts.delete(e.pointerId)) return;
  eat(e);
  pinch = 0;
  const d = down;
  if (pts.size || !d) return;
  down = null;
  if (d.far || e.type === 'pointercancel') return;
  // A tap selects the frame under it (or nothing); a second one close by and soon enters it.
  const again = performance.now() - tap.at < 350 && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 24;
  tap = { at: performance.now(), x: e.clientX, y: e.clientY };
  if (again && d.id && d.id === selected) return enter(d.id);
  select(d.id);
};
addEventListener('pointerup', up, true);
addEventListener('pointercancel', up, true);
addEventListener('click', (e) => mine(e) && eat(e), true);
addEventListener('dblclick', (e) => mine(e) && eat(e), true);
addEventListener('contextmenu', (e) => mine(e) && e.preventDefault(), true);
// A mouse or trackpad. Pinch on a trackpad arrives as a wheel with ctrlKey (Chrome, Firefox); ⌘ or Ctrl and a wheel zoom.
addEventListener('wheel', (e) => {
  if (!mine(e)) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  if (e.ctrlKey || e.metaKey) {
    const dy = Math.max(-24, Math.min(24, e.deltaY));
    go(zoomAt(cam, e.clientX, e.clientY, cam.z * Math.exp(-dy * (e.ctrlKey ? 0.04 : 0.01)), boxes(), view));
  } else go(panBy(cam, -(e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX), e.shiftKey && !e.deltaX ? 0 : -e.deltaY));
}, { passive: false, capture: true });
// Safari's pinch.
let g0 = 1;
addEventListener('gesturestart', (e) => (e.preventDefault(), (g0 = cam.z)), true);
addEventListener('gesturechange', (e) => {
  e.preventDefault();
  const x = e as unknown as { scale: number; clientX: number; clientY: number };
  go(zoomAt(cam, x.clientX ?? view.w / 2, x.clientY ?? view.h / 2, g0 * x.scale, boxes(), view));
}, true);

// ---------- keys (after the widget's own: an Esc it used is not ours) ----------
const typing = (e: KeyboardEvent) => e.composedPath().some((n) => n instanceof HTMLElement && (n.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(n.tagName) || n.hasAttribute('data-lab-comments')));
// Back to the page this board is about; the page puts its scroll back from the key ⇧B left (the one a reload uses).
const back = () => {
  if (of) location.href = of;
};
const press = (e: Pick<KeyboardEvent, 'key' | 'code' | 'shiftKey' | 'metaKey' | 'ctrlKey' | 'altKey'> & { repeat?: boolean }, fromFrame = false): boolean => {
  if (e.metaKey || e.ctrlKey || e.altKey) return false;
  const digit = /^Digit(\d)$/.exec(e.code)?.[1];
  const idx = cards.findIndex((c) => c.f.id === selected);
  const step = (by: number) => {
    if (!cards.length) return;
    const c = cards[(idx + by + cards.length) % cards.length];
    select(c.f.id);
    go(fitFrame(c.f, view));
  };
  if (e.shiftKey && digit === '1') go(fitAll(boxes(), view));
  else if (e.shiftKey && digit === '2') go(zoomAt(cam, view.w / 2, view.h / 2, 1, boxes(), view));
  else if (e.shiftKey && digit === '0') go(find(selected) ? fitFrame(find(selected)!.f, view) : fitAll(boxes(), view));
  else if (!e.shiftKey && (e.key === '+' || e.key === '=' || e.key === '-') && !fromFrame) go(zoomAt(cam, view.w / 2, view.h / 2, cam.z * (e.key === '-' ? 0.8 : 1.25), boxes(), view));
  else if (e.shiftKey && e.code === 'KeyB' && !entered) back();
  else if (e.key === 'Enter' && !e.shiftKey && selected && !entered) enter(selected);
  else if (e.key === 'Tab' && !entered && cards.length) step(e.shiftKey ? -1 : 1);
  else if (e.key === 'Escape') {
    // Heard in the frame, which keeps an Esc its page used (a menu closing) to itself: this one is ours.
    if (entered) leave();
    else if (selected) select('');
    else if (of && !coarse) back(); // an empty board's Esc goes back to the page, as ⇧B does
    else return false;
  } else return false;
  return true;
};
addEventListener('keydown', (e) => {
  if (e.key === ' ') space = true;
  if (e.defaultPrevented || typing(e) || (entered && document.activeElement instanceof HTMLIFrameElement)) return;
  if (press(e)) e.preventDefault();
});
addEventListener('keyup', (e) => e.key === ' ' && (space = false));
void space;

// ---------- what the frames and the widget see ----------
Object.assign(window, {
  __labBoard: {
    back,
    busy: () => performance.now() - lastDown < 1500,
    key: (k: Parameters<typeof press>[0]) => press(k, true),
    frame: (id: string) => find(id)?.frame,
    camera: () => ({ ...cam }),
    selected: () => selected,
    entered: () => entered,
    live: () => cards.filter((c) => c.frame).map((c) => c.f.id),
  },
});
addEventListener('resize', () => {
  view = { w: innerWidth, h: innerHeight };
  go(moved ? cam : fitAll(boxes(), view), false);
});
// The board file changed (the agent added a frame, a person moved one elsewhere): read it again. The lab's state says so.
addEventListener('lab-state', ((e: CustomEvent) => {
  if (typeof e.detail?.boards === 'number' && e.detail.boardNames?.includes?.(name) !== false && e.detail.boards !== bver) {
    const was = bver;
    bver = e.detail.boards;
    if (was !== undefined && started) load();
  }
}) as EventListener);
let bver: number | undefined;
let started = false;
load().then(() => (started = true));
