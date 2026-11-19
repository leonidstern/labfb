// The board page (flag `board`): a board's frames on one canvas you pan and zoom. Loaded by /_lab/board/<name> only,
// before the widget, which rides on the page as it does on any other. The board file and its API come from the lab
// (lib/board.ts, GET /_lab/api/board). Frames are the lab's own pages in iframes, named "lab:<id>", which the widget in
// them reads as "draw nothing, bind nothing" (src/widget/frame.ts, it finds window.__labBoard on top).
//
// Camera: cam = { x, y, z }, screen = (world + cam) * z. The world is one element with one transform; a frame is a box in it.
import { clamp, fitAll, fitFrame, panBy, zoomAt } from './camera.ts';
import type { Cam, Box } from './camera.ts';

type Frame = { id: string; src: string; w: number; h: number; x: number; y: number; label?: string; state?: string; auto?: boolean; variantOf?: string };
type Board = { rev: number; frames: Frame[]; of?: string } & Record<string, unknown>;
type Card = { f: Frame; box: HTMLElement; inner: HTMLElement; frame?: HTMLIFrameElement; seen: number };

const script = document.currentScript as HTMLScriptElement;
const name = script.dataset.name || '';
let of = new URLSearchParams(location.search).get('of') || ''; // the page this board is about: Esc on an empty board goes back to it
const coarse = matchMedia('(pointer: coarse)').matches;
const CAP = coarse ? 3 : 8; // frames alive at once (a phone draws them at 390 wide, so three side by side stay light)
const AT_ONCE = coarse ? 1 : 2; // frames loading at once
const WAKE = coarse ? 56 : 120; // a frame is woken when it is in view and at least this many screen px wide (a phone: every frame fitted, live)

const css = `
html,body{margin:0;height:100%;overflow:hidden;overscroll-behavior:none;background:#e9e8e4;color:#1d1d1b;font:13px/1.35 system-ui,-apple-system,sans-serif}
@media (prefers-color-scheme:dark){html,body{background:#1b1b1a;color:#e9e8e4}}
#lab-board{position:fixed;inset:0;overflow:hidden;touch-action:none;user-select:none;-webkit-user-select:none;cursor:default}
#lab-board .world{position:absolute;left:0;top:0;transform-origin:0 0}
#lab-board.grab,#lab-board.grab *{cursor:grab!important}
#lab-board.grab.grabbing,#lab-board.grab.grabbing *{cursor:grabbing!important}
#lab-board .f{position:absolute}
#lab-board .b{position:absolute;inset:0;background:#fff;contain:layout paint}
#lab-board .f.off{content-visibility:hidden}
#lab-board .f.sel{outline:calc(2px*var(--iz)) solid #1f7a4d;outline-offset:calc(1px*var(--iz))}
#lab-board iframe{position:absolute;inset:0;width:100%;height:100%;border:0;background:#fff;pointer-events:none}
#lab-board .f.in iframe{pointer-events:auto}
#lab-board .t{position:absolute;left:0;bottom:100%;white-space:nowrap;max-width:calc(100% / var(--iz));overflow:hidden;text-overflow:ellipsis;transform-origin:0 100%;transform:scale(var(--iz));padding-bottom:4px;opacity:.75}
#lab-board .c{position:absolute;inset:0;box-sizing:border-box;padding:calc(20px*var(--iz));font-size:calc(14px*var(--iz));line-height:1.5;color:#1d1d1b;background:#f6f5f1}
#lab-board .c b{display:block;font-size:calc(22px*var(--iz));font-weight:600;margin-bottom:calc(6px*var(--iz))}
#lab-board .t u{text-decoration:none;cursor:pointer;margin-left:.5em;opacity:.6}
#lab-board .t u.on{opacity:1;text-decoration:underline}
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
let board: Board | null = null; // as the lab gave it: saved whole, with the rev it was read at
let undo: Frame[][] = []; // the frames before each change, newest last (⌘Z)
let focus = false; // the camera is fitted to one frame (a phone's first view, Tab): a swipe goes to the next
let lastDown = 0;
let checked = { x: 1e9, y: 1e9, z: 0 }; // the camera at the last wake/cull check
let still: ReturnType<typeof setTimeout> | undefined;
let settle: ReturnType<typeof setTimeout> | undefined;
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

// One camera write per frame: a trackpad sends two or three wheel events a frame, each was a transform, a --iz restyle
// of every label and a pin redraw (Leo, 19 Nov: "lags a lot").
let drawFrame = 0;
const draw = () => {
  drawFrame ||= requestAnimationFrame(paintCam);
};
const paintCam = () => {
  drawFrame = 0;
  world.style.transform = `scale(${cam.z}) translate(${cam.x}px,${cam.y}px)`;
  world.style.setProperty('--iz', String(1 / cam.z));
  dispatchEvent(new Event('lab-board-moved')); // the widget draws the pins again
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
  still = setTimeout(() => (world.style.willChange = ''), 400); // a trackpad's short pauses keep the layer: no full re-raster of every live frame between them
};
const go = (next: Cam, user = true, soft = false) => {
  const c = clamp(next, boxes(), view);
  const was = cam.z;
  // Past an edge a drag gives way half as far, and the board settles back when it stops.
  const give = (v: number, to: number, from: number) => (v === to ? to : to + Math.max(-120 / c.z, Math.min(120 / c.z, from + (v - from) * 0.4 - to))); // never far
  cam = soft ? { z: c.z, x: give(next.x, c.x, cam.x), y: give(next.y, c.y, cam.y) } : c;
  if (user) moved = true;
  if (user && (!soft || Math.abs(c.z - was) > 1e-6)) focus = false;
  draw();
  moving();
  if (soft) {
    clearTimeout(settle);
    settle = setTimeout(() => {
      world.style.transition = 'transform 280ms cubic-bezier(.2,.8,.2,1)';
      cam = clamp(cam, boxes(), view);
      draw();
      setTimeout(() => (world.style.transition = ''), 300);
    }, 120);
  }
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
function show(b: Board) {
  board = b;
  of = of || (b.of || '').split('#')[0];
  const live = b.frames.filter((f) => f.state !== 'archived' && Number.isFinite(f.x));
  // A phone shows each frame at a phone's width, side by side in board order (Leo, 19 Nov: like the sketch on the
  // page). Only how it's drawn here: what is saved is the board as read (save sends board.frames).
  const next = coarse ? [...live].sort((p, q) => p.y - q.y || p.x - q.x).map((f, i) => ({ ...f, x: i * (390 + 80), y: 0, w: 390, h: 844 })) : live;
  const old = new Map(cards.map((c) => [c.f.id, c]));
  cards = next.map((f) => {
    const was = old.get(f.id);
    old.delete(f.id);
    if (was && was.f.src === f.src) {
      if (!was.frame && (was.f.w !== f.w || was.f.h !== f.h)) was.inner.replaceChildren(card({ ...was, f }));
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
    paint(c);
  }
  if (selected && !cards.some((c) => c.f.id === selected)) selected = entered = '';
  world.querySelector('.none')?.remove();
  if (!cards.length) text('div', 'No frames on this board.', world).className = 'none';
  const hash = /^#(-?\d+),(-?\d+),([\d.]+)$/.exec(location.hash);
  if (hash && !moved) cam = { x: +hash[1], y: +hash[2], z: +hash[3] };
  else if (!moved) {
    // Every frame in view, as on a computer, phones too (Leo, 19 Nov: one frame at a time read as a slider, "dont like
    // this view at all"): drag pans, pinch zooms, Tab or a frame's label still fits one.
    focus = false;
    cam = fitAll(boxes(), view);
  }
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

// The label above a frame; on the selected one a plain list of sizes to pick from.
const SIZES: Record<number, number> = { 390: 844, 820: 1180, 1280: 800, 1440: 900 };
const editable = () => Boolean(document.querySelector('script[data-admin]')); // this computer's browser; a guest only looks
function paint(c: Card) {
  const t = c.box.querySelector('.t') as HTMLElement;
  t.textContent = label(c.f);
  if (c.f.id !== selected || !editable()) return;
  for (const w of Object.keys(SIZES)) t.append(' ', Object.assign(document.createElement('u'), { textContent: w, className: +w === c.f.w ? 'on' : '' }));
  t.dataset.id = c.f.id;
}
const api = (more = '') => `/_lab/api/board?name=${name}${of ? `&page=${encodeURIComponent(of)}` : ''}${more}`;
const copy = (fs: Frame[]) => fs.map((f) => ({ ...f }));
// Every change is the whole board put back with the rev it was read at; a frame is never dropped, only archived. A frame the
// lab placed (auto) is sent without x and y, or it would become fixed where it is now.
async function save(frames: Frame[], before: Frame[], remember = true) {
  if (!board || !editable()) return;
  if (remember) undo.push(before);
  const body = { ...board, frames: frames.map(({ auto, x, y, ...f }) => (auto ? f : { ...f, x, y })) };
  const res = await fetch(api(), { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
  if (!res) return;
  const j = await res.json();
  if (res.status === 409 && remember) undo.pop(); // somebody else changed it: theirs is shown, the change is not made
  if (res.ok || res.status === 409) show(res.ok ? j : j.board);
}
// One change at a time: the next is made from what the lab answered to the last (the rev it names).
let queue: Promise<unknown> = Promise.resolve();
const change = (fn: (fs: Frame[]) => void, remember = true) => {
  queue = queue.then(() => {
    if (!board) return;
    const before = copy(board.frames);
    const fs = copy(board.frames);
    fn(fs);
    return save(fs, before, remember);
  });
};
const mutate = (id: string, fn: (f: Frame) => void) => change((fs) => fn(fs.find((f) => f.id === id)!));
const nextId = (fs: Frame[]) => {
  for (let n = 0; ; n++) {
    const id = String.fromCharCode(97 + (n % 26)) + (n >= 26 ? Math.floor(n / 26) : '');
    if (!fs.some((f) => f.id === id)) return id;
  }
};
const dup = (id: string) =>
  change((fs) => {
    const f = fs.find((g) => g.id === id)!;
    const n = { ...f, id: nextId(fs), x: (f.x || 0) + f.w + 80, y: f.y, variantOf: f.id, auto: false, state: 'live' };
    fs.splice(fs.indexOf(f) + 1, 0, n);
    setTimeout(() => select(n.id), 400);
  });
const archive = (id: string) => (select(''), mutate(id, (f) => (f.state = 'archived')));
const nudge = (id: string, dx: number, dy: number) => mutate(id, (f) => ((f.x += dx), (f.y += dy), (f.auto = false)));
// ⌘Z: the frames as they were; one added since is archived (a frame is never dropped).
const undoLast = () => {
  const was = undo.pop();
  if (was) change((fs) => fs.splice(0, fs.length, ...was, ...fs.filter((f) => !was.some((g) => g.id === f.id)).map((f) => ({ ...f, state: 'archived' }))), false);
};

// ---------- selecting and entering ----------
const find = (id: string) => cards.find((c) => c.f.id === id);
function select(id: string) {
  if (entered && entered !== id) leave();
  selected = id;
  for (const c of cards) {
    c.box.classList.toggle('sel', c.f.id === id);
    paint(c);
  }
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
let down: { x: number; y: number; id: string; far: boolean; at: number; t: number; mv?: Card; fx: number; fy: number; before?: Frame[]; held?: boolean; hand?: boolean } | null = null;
let holdTimer = 0;
// A phone comments by holding, as on a page (Leo, 19 Nov: "can't leave a comment" on the board): a finger that stays
// put for 400 ms with comments on drops a pin there; moving first is a pan or a swipe, as before.
const boardWidget = () => (window as unknown as { __labBoardWidget?: { pinning: () => boolean; holding?: () => boolean; hold?: (x: number, y: number) => void; place: (x: number, y: number) => void } }).__labBoardWidget;
let tap = { at: 0, x: 0, y: 0 };
let pinch = 0;
// On a computer a plain mouse drag is labit's, as on a page (a click pins, a drag marks an area, a click selects); the
// board pans with Space held and a drag (the hand), or a trackpad's two fingers / the wheel (Leo, 19 Nov: "like the
// sketch"). A finger still pans, and a hold pins.
let space = false;
let theirs = false; // this press went to the widget (comment mode): its click isn't eaten
const hand = () => {
  root.classList.toggle('grab', space);
  root.classList.toggle('grabbing', space && Boolean(down?.hand));
};
const eat = (e: Event) => (e.stopImmediatePropagation(), e.preventDefault());

addEventListener('pointerdown', (e) => {
  if (!mine(e) || entered && e.target instanceof HTMLIFrameElement) return;
  theirs = false;
  if (e.pointerType !== 'touch' && !space && !pts.size && boardWidget()?.pinning()) {
    lastDown = performance.now();
    theirs = true; // comment mode, no Space: the widget's own click (a pin) and drag (an area)
    return;
  }
  eat(e);
  lastDown = performance.now();
  const size = (e.target as HTMLElement).closest?.('u');
  if (size && editable()) return mutate((e.target as HTMLElement).parentElement!.dataset.id!, (f) => ((f.w = +size.textContent!), (f.h = SIZES[f.w]))); // a size from the list
  (document.activeElement as HTMLElement | null)?.blur?.();
  pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  root.setPointerCapture?.(e.pointerId);
  if (pts.size === 2) {
    const [a, b] = [...pts.values()];
    pinch = Math.hypot(a.x - b.x, a.y - b.y);
    if (down) down.far = true; // a second finger: this was no tap
  } else {
    const id = at(e);
    const mv = e.pointerType === 'mouse' && id && id === selected && !entered && editable() ? find(id) : undefined; // a selected frame is moved by its body (a finger only pans)
    const pan = e.pointerType === 'touch' || space;
    down = { x: e.clientX, y: e.clientY, id, far: false, at: performance.now(), t: e.timeStamp, mv: pan ? undefined : mv, fx: mv?.f.x ?? 0, fy: mv?.f.y ?? 0, before: board ? copy(board.frames) : undefined, hand: pan };
    hand();
    clearTimeout(holdTimer);
    if (e.pointerType === 'touch') {
      const d = down;
      holdTimer = window.setTimeout(() => {
        const w = boardWidget();
        if (down !== d || d.far || pts.size !== 1 || !(w?.holding ? w.holding() : w?.pinning())) return;
        d.held = true; // the comment opens on the lift (below), as a page's hold does: opened now, the lift closed it
        navigator.vibrate?.(8);
      }, 400);
    }
  }
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
  if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) {
    down.far = true;
    clearTimeout(holdTimer);
  }
  if (down?.held) return; // the hold made a pin: the finger lifting off doesn't pan
  if (down?.far && down.mv) {
    // Positions round to 8 px; an edge within 6 screen px of another frame's edge takes that edge.
    const f = down.mv.f;
    f.auto = false;
    let nx = Math.round((down.fx + (e.clientX - down.x) / cam.z) / 8) * 8;
    let ny = Math.round((down.fy + (e.clientY - down.y) / cam.z) / 8) * 8;
    for (const o of cards) {
      if (o === down.mv) continue;
      for (const edge of [o.f.x, o.f.x + o.f.w]) for (const mine of [nx, nx + f.w]) if (Math.abs(edge - mine) * cam.z < 6) nx += edge - mine;
      for (const edge of [o.f.y, o.f.y + o.f.h]) for (const mine of [ny, ny + f.h]) if (Math.abs(edge - mine) * cam.z < 6) ny += edge - mine;
    }
    [f.x, f.y] = [nx, ny];
    Object.assign(down.mv.box.style, { left: `${nx}px`, top: `${ny}px` });
    dispatchEvent(new Event('lab-board-moved'));
  } else if (down?.far && down.hand) go(panBy(cam, dx, dy), true, true);
}, true);
const up = (e: PointerEvent) => {
  if (!pts.delete(e.pointerId)) return;
  eat(e);
  pinch = 0;
  const d = down;
  clearTimeout(holdTimer);
  if (pts.size || !d) return;
  down = null;
  hand();
  // Right after the page loads, the live frames keep the page busy: the finger's lift can be handled before the 400 ms
  // timer runs, and the first hold was taken for a tap (Leo, 19 Nov). The touch's own times decide it then.
  if (!d.held && !d.far && e.type === 'pointerup' && e.pointerType === 'touch' && e.timeStamp - d.t >= 400) {
    const w = boardWidget();
    if (w?.holding ? w.holding() : w?.pinning()) d.held = true;
  }
  if (d.held) {
    const w = boardWidget();
    if (w && e.type === 'pointerup') setTimeout(() => (w.hold || w.place)(d.x, d.y), 0);
    return;
  }
  if (d.mv && d.far && d.before && board) return void save(copy(board.frames), d.before);
  if (d.far && !d.mv && coarse && focus && e.type === 'pointerup' && Math.abs(e.clientX - d.x) > 48 && Math.abs(e.clientX - d.x) > 2 * Math.abs(e.clientY - d.y) && !entered) return step(e.clientX < d.x ? 1 : -1); // a swipe on a phone: the next frame
  if (d.far || e.type === 'pointercancel') return;
  const widget = boardWidget();
  if (widget?.pinning() && e.pointerType !== 'touch') return widget.place(e.clientX, e.clientY); // comments are on and in comment mode: a tap is a pin
  // A tap selects the frame under it (or nothing); a second one close by and soon enters it.
  const again = performance.now() - tap.at < 350 && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 24;
  tap = { at: performance.now(), x: e.clientX, y: e.clientY };
  if (again && d.id && d.id === selected) return enter(d.id);
  select(d.id);
};
addEventListener('pointerup', up, true);
addEventListener('pointercancel', up, true);
addEventListener('click', (e) => mine(e) && !theirs && eat(e), true);
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
  } else go(panBy(cam, -(e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX), e.shiftKey && !e.deltaX ? 0 : -e.deltaY), true, true);
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
// Back to the page this board is about. Opened from that page in this tab: the browser's own back, which gives the page
// back where it was (bfcache / scroll restoration; Leo, 19 Nov: "closing board should back me from where i opened").
// Otherwise a plain visit, and the page puts its scroll back from the key it left on its way here (the one a reload uses).
const cameFromOf = () => {
  try {
    const r = document.referrer && new URL(document.referrer);
    const o = new URL(of, location.href);
    return !!r && r.origin === location.origin && r.pathname === o.pathname && history.length > 1;
  } catch {
    return false;
  }
};
const back = () => {
  if (!of) return;
  if (cameFromOf()) history.back();
  else location.href = of;
};
// A board you came to from a page has a plain way back, on phones too: "‹ back" at the top left (Leo, 19 Nov: "no way
// back"). ⇧B, Esc on an empty board and the browser's own back still work.
if (of) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = '‹ back';
  b.setAttribute('aria-label', 'back to the page');
  b.style.cssText = 'position:fixed;top:calc(10px + env(safe-area-inset-top, 0px));left:10px;z-index:2147482000;font:500 15px/1 system-ui,-apple-system,sans-serif;border:0;border-radius:999px;padding:10px 14px;background:#141414;color:#fff;box-shadow:0 2px 10px rgba(0,0,0,.18);-webkit-tap-highlight-color:transparent;cursor:pointer';
  b.addEventListener('click', (e) => (e.stopPropagation(), back()));
  b.setAttribute('data-uncommentable', '');
  addEventListener('DOMContentLoaded', () => document.body.append(b));
  if (document.body) document.body.append(b);
}
// The next (1) or previous (-1) frame in board order, the camera on it.
const step = (by: number) => {
  if (!cards.length) return;
  const c = cards[(cards.findIndex((o) => o.f.id === selected) + by + cards.length) % cards.length];
  select(c.f.id);
  go(fitFrame(c.f, view));
  focus = true;
};
const press = (e: Pick<KeyboardEvent, 'key' | 'code' | 'shiftKey' | 'metaKey' | 'ctrlKey' | 'altKey'> & { repeat?: boolean }, fromFrame = false): boolean => {
  const [cmd, sel] = [e.metaKey || e.ctrlKey, find(selected)];
  if (cmd && !e.altKey && !e.shiftKey && !entered && editable()) {
    if (e.code === 'KeyZ') {
      undoLast();
      return true;
    }
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return false;
  if (sel && !entered && editable() && /^(Arrow(Left|Right|Up|Down)|Backspace|Delete)$/.test(e.key)) {
    if (e.key.length > 6 && e.key[0] === 'A') {
      const d = e.shiftKey ? 80 : 8;
      nudge(selected, e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0, e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0);
    } else archive(selected);
    return true;
  }
  const digit = /^Digit(\d)$/.exec(e.code)?.[1];
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
// ⌘D / Ctrl D duplicates the selected frame. In capture: Control-D is also the widget's "next new comment".
addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.code === 'KeyD' && selected && !entered && editable() && !typing(e)) {
    eat(e);
    dup(selected);
  }
}, true);
addEventListener('keydown', (e) => {
  if (e.key === ' ' && !typing(e) && !(entered && document.activeElement instanceof HTMLIFrameElement)) {
    e.preventDefault(); // the hand, not a scroll
    if (!space) ((space = true), hand());
    return;
  }
  if (e.defaultPrevented || typing(e) || (entered && document.activeElement instanceof HTMLIFrameElement)) return;
  if (press(e)) e.preventDefault();
});
addEventListener('keyup', (e) => e.key === ' ' && space && ((space = false), hand()));
addEventListener('blur', () => space && ((space = false), hand()));

// ---------- what the frames and the widget see ----------
Object.assign(window, {
  __labBoard: {
    back,
    busy: () => performance.now() - lastDown < 1500,
    key: (k: Parameters<typeof press>[0]) => press(k, true),
    frame: (id: string) => find(id)?.frame,
    // Where a point on the screen is on the board: the frame under it (else the nearest), by px from its top left, and the point.
    anchor: (sx: number, sy: number) => {
      const [wx, wy] = [Math.round(sx / cam.z - cam.x), Math.round(sy / cam.z - cam.y)];
      const gap = (c: Card) => Math.hypot(Math.max(c.f.x - wx, 0, wx - c.f.x - c.f.w), Math.max(c.f.y - wy, 0, wy - c.f.y - c.f.h));
      const f = [...cards].sort((a, b) => gap(a) - gap(b))[0]?.f;
      return { kind: 'board', board: name, ...(f && { frame: f.id, fx: wx - f.x, fy: wy - f.y }), bx: wx, by: wy, selector: '', x: 0, y: 0, docX: 0, docY: 0, width: view.w, height: view.h };
    },
    // Where a board pin is on screen: with its frame, else at the point it was put.
    spot: (a: { frame?: string; fx?: number; fy?: number; bx?: number; by?: number }) => {
      const f = cards.find((c) => c.f.id === a.frame)?.f;
      const [wx, wy] = f && a.fx !== undefined ? [f.x + a.fx, f.y + (a.fy || 0)] : [a.bx || 0, a.by || 0];
      return { left: (wx + cam.x) * cam.z, top: (wy + cam.y) * cam.z, zone: null };
    },
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
