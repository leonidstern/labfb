// Part of the comment widget (src/comments.js bundles it). Uses the widget's own parts through W, set once at startup.
import { momentText } from '../../lib/moment.mjs';
import { selectorFor } from './anchoring.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let W: any;
let S: any; // the widget's state (W.S), read once at startup
// Pause (Leo, 19 Nov: "not in menu", "maybe with option pressed"): a small control on the moving thing itself, in
// labit's layer over the page (nothing moves): pause / play · ¼ · its moment in ms, for that element and what is
// inside it. Computers: on the video or loop under the pointer while ⌥ is held (⌥ is Measure's key too; a click on the
// control never pins); let go and a paused one keeps a small ▶. Phones: in the top right corner of each one at least
// half in view, quiet, gone while scrolling or while a sheet is open. P pauses all, S slows all. The widget's own
// animations keep moving, and a comment on a paused video says which second (anchoring.ts).
const held = new Set<any>(); // the videos and elements labit paused
export const slowEls = new Set<any>(); // the elements labit slowed to ¼ (S slows all, S.slow)
let animsNow = null; // one drawMotion's list: asked once per draw, not once per control
const pageAnims = () => animsNow || document.getAnimations().filter((a) => {
  const t = (a.effect as KeyframeEffect | null)?.target;
  if (!t || W.root.contains(t)) return false;
  if (held.has(t)) return true;
  // Only motion that goes on (a loop) gets a pause: a transition, or an animation that ends, is a moment, like the
  // highlight on a heading you just went to (Leo, 19 Nov: "what's with the animation pause thing on headers").
  if (typeof CSSTransition !== 'undefined' && a instanceof CSSTransition) return false;
  const end = a.effect?.getComputedTiming().endTime;
  return !(typeof end === 'number' && Number.isFinite(end));
});
const targetOf = (a) => (a.effect as KeyframeEffect).target;
// An element's own animations first, then those inside it.
const animsOf = (el) => pageAnims().filter((a) => el.contains(targetOf(a))).sort((a, b) => Number(targetOf(b) === el) - Number(targetOf(a) === el));
const videosIn = (el) => (el instanceof HTMLVideoElement ? [el] : [...el.querySelectorAll('video')]);
const moving = () => [...new Set([...document.querySelectorAll('video'), ...held, ...pageAnims().filter((a) => a.playState === 'running').map(targetOf)])].filter((el) => el?.isConnected);
// One control for a moving thing and what moves inside it: only the outermost get one.
const outermost = (els) => els.filter((t) => !els.some((o) => o !== t && o.contains(t)));
const isStill = (el) => videosIn(el).every((v) => v.paused) && animsOf(el).every((a) => a.playState !== 'running');
const setItem = (el, stop) => {
  for (const v of videosIn(el)) {
    if (stop) v.pause();
    else v.play?.().catch(() => {});
  }
  for (const a of animsOf(el)) {
    if (stop && a.playState === 'running') a.pause();
    else if (!stop && a.playState === 'paused') a.play();
  }
  if (!stop) for (const h of held) if (el.contains(h)) held.delete(h); // played from around it: what is inside plays too
  held[stop ? 'add' : 'delete'](el);
  S.paused = held.size > 0; // a comment written now says the page was paused
};
// The moving thing a pin is about (Leo, 19 Nov: pins on a dot, a video and a GIF all got the loop next to them): the
// pinned element's own motion wins, the video or animation it is, holds or sits in, and of several the one under
// the pin's own spot (else the nearest to it). Only a pin with no motion of its own (the page, a heading) takes the
// paused thing most in view, nearest the screen's middle.
const ownMotion = (anchor) => {
  let at = null;
  try {
    at = anchor?.selector ? document.querySelector(anchor.selector) : null;
  } catch {}
  if (at === document.body || at === document.documentElement || (at && W.root.contains(at))) at = null;
  const things = [...new Set([...held, ...document.querySelectorAll('video'), ...pageAnims().map(targetOf)])].filter((el) => el?.isConnected && !W.root.contains(el));
  const area = (r) => r.width * r.height;
  if (at) {
    const ar = at.getBoundingClientRect();
    const px = ar.left + (Number.isFinite(anchor.x) ? anchor.x : 0.5) * ar.width, py = ar.top + (Number.isFinite(anchor.y) ? anchor.y : 0.5) * ar.height;
    const own = things.filter((el) => at.contains(el) || el.contains(at));
    const box = (el) => el.getBoundingClientRect();
    const under = own.filter((el) => { const r = box(el); return px >= r.left && px <= r.right && py >= r.top && py <= r.bottom; });
    if (under.length) return under.sort((p, q) => area(box(p)) - area(box(q)))[0]; // the smallest under the spot: the thing itself, not what holds it
    const off = (el) => { const r = box(el); return Math.hypot(Math.max(r.left - px, 0, px - r.right), Math.max(r.top - py, 0, py - r.bottom)); };
    if (own.length) return own.sort((p, q) => off(p) - off(q))[0];
  }
  return null;
};
// A pin with no motion of its own, while paused: the paused thing most in view, nearest the screen's middle.
export const pausedEl = (anchor) => ownMotion(anchor) || inView();
const inView = () => {
  const all = [...held].filter((el) => el.isConnected);
  const cx = innerWidth / 2, cy = innerHeight / 2;
  const score = (el) => {
    const r = el.getBoundingClientRect();
    const seen = Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
    return [seen > 0 ? 0 : 1, Math.hypot(r.left + r.width / 2 - cx, r.top + r.height / 2 - cy)];
  };
  return all.map((el) => [el, score(el)]).sort((p, q) => p[1][0] - q[1][0] || p[1][1] - q[1][1])[0]?.[0];
};
// A short name for it, as a person would point at it: ".hero video", "#spinner", "div.dot".
const nameOf = (el) => {
  const own = (n) => n.localName + (n.id ? `#${n.id}` : n.classList[0] ? `.${n.classList[0]}` : '');
  const me = own(el);
  if (el.id || el.classList.length) return me.slice(0, 80);
  const up = el.parentElement?.closest('[id], [class]');
  return (up && up !== document.body ? `${up.id ? `#${up.id}` : `.${up.classList[0]}`} ${me}` : me).slice(0, 80);
};
// Where a paused thing stands: a video's second of its length; an animation's second inside one pass and which pass
// (a loop's total time, 835734 ms, says neither). lib/moment.mjs words it.
const momentOf = (el) => {
  if (!el) return undefined;
  const what = nameOf(el), sel = selectorFor(el);
  const playing = isStill(el) ? undefined : true; // nothing paused: the moment it was showing as the pin went down
  if (el instanceof HTMLVideoElement) {
    if (!Number.isFinite(el.currentTime)) return undefined;
    return { kind: 'video', at: el.currentTime, of: Number.isFinite(el.duration) ? el.duration : undefined, what, sel, playing };
  }
  const a = animsOf(el)[0];
  const t = a?.effect?.getComputedTiming();
  const dur = Number(t?.duration), local = Number(t?.localTime);
  if (!t || !(dur > 0) || !Number.isFinite(local)) return undefined;
  const pass = Number.isFinite(t.currentIteration) ? t.currentIteration : 0;
  const at = Math.min(Math.max(local - (t.delay || 0) - pass * dur, 0), dur);
  return { kind: t.iterations === Infinity ? 'loop' : 'anim', at: at / 1000, of: dur / 1000, pass: pass + 1, what, sel, ms: Number(a.currentTime), playing };
};
// A pin's moment chip: the page pauses and the thing goes back to that moment, to see what was meant. It stays
// paused; play it again as usual (the control or the pause key).
const seekMoment = (m) => {
  let el = null;
  try {
    el = m?.sel ? document.querySelector(m.sel) : null;
  } catch {}
  if (!el || m.kind === 'gif') return false;
  setPause(true);
  if (!held.has(el)) setItem(el, true);
  if (el instanceof HTMLVideoElement) el.currentTime = m.at;
  else {
    const a = animsOf(el)[0];
    const t = a?.effect?.getComputedTiming();
    if (!a) return false;
    a.currentTime = Number.isFinite(m.ms) ? m.ms : (t?.delay || 0) + ((m.pass || 1) - 1) * Number(t?.duration) + m.at * 1000;
  }
  drawMotion();
  return true;
};
// The moment, in a small chip: a label in the box being written, a button on a sent pin (back to that moment).
const PAUSED = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 2h2v8H3zM7 2h2v8H7z"/></svg>';
const momentChip = (m, seek = false) => {
  const chip = W.el(seek && m.kind !== 'gif' ? 'button' : 'div', { class: 'moment' });
  chip.innerHTML = m.kind === 'gif' || m.playing ? '' : PAUSED; // ⏸ only for a moment that was paused
  chip.append(W.el('span', {}, momentText(m)));
  if (chip.localName === 'button') {
    chip.setAttribute('type', 'button');
    chip.title = 'pause the page at this moment';
    chip.addEventListener('click', (e) => (e.stopPropagation(), seekMoment(m)));
  }
  return chip;
};
// A pin's moment: on a GIF (it can't be paused), how long it had been showing; else, while paused, where the paused
// thing it is about stood.
// Every way (Leo, 19 Nov: "it says only if i pause one"): the page paused, one thing paused, or nothing paused, a pin
// on a moving thing takes that thing's moment as the pin goes down (begin); a pin on still things, while paused, the
// paused thing most in view.
export const momentFor = (anchor) => {
  if (anchor.shownFor !== undefined) return { kind: 'gif', at: anchor.shownFor };
  const el = ownMotion(anchor) || (S.paused ? inView() : null);
  return el ? momentOf(el) : undefined;
};
export const msOf = (el) => {
  if (!el) return undefined;
  const t = el instanceof HTMLVideoElement ? el.currentTime * 1000 : Number(animsOf(el)[0]?.currentTime);
  return Number.isFinite(t) ? Math.round(t) : undefined;
};
// ¼ speed (Leo, 19 Nov): S slows every page animation and video to a quarter of its speed, a control's ¼ only its own
// element's; a pin made now says so. Motion that starts later is slowed as it starts (and by the 1 s redraw, for
// script animations).
const rates = new WeakMap(); // each animation's own rate, to go back to
const wantSlow = (t) => S.slow || [...slowEls].some((e) => e.isConnected && e.contains(t));
const slowAll = () => {
  for (const a of document.getAnimations()) {
    const t = (a.effect as KeyframeEffect | null)?.target;
    if (!t || W.root.contains(t)) continue;
    const slow = wantSlow(t);
    if (slow && !rates.has(a)) {
      rates.set(a, a.playbackRate);
      a.updatePlaybackRate(a.playbackRate / 4);
    } else if (!slow && rates.has(a)) {
      a.updatePlaybackRate(rates.get(a));
      rates.delete(a);
    }
  }
  for (const v of document.querySelectorAll('video')) v.playbackRate = wantSlow(v) ? 0.25 : 1;
};
export const setSlow = (on) => {
  S.slow = on;
  if (!on) slowEls.clear();
  slowAll();
  drawMotion();
};
// The controls: one per element shown, in .motions (page coordinates, like the pins).
const PLAY = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3.5 2.2v7.6L9.8 6z"/></svg>';
const PAUSE = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 2h2v8H3zM7 2h2v8H7z"/></svg>';
const ctls = new Map<any, any>();
const ctlFor = (target) => {
  let c = ctls.get(target);
  if (c) return c;
  const play = W.el('button', { type: 'button', class: 'motion-play' }) as HTMLButtonElement;
  const slow = W.el('button', { type: 'button', class: 'motion-slow', 'aria-pressed': 'false' }, '¼') as HTMLButtonElement;
  const ms = W.el('span', { class: 'motion-ms' });
  const box = W.el('div', { class: 'motion-ctl', role: 'group' });
  box.append(play, slow, ms);
  play.addEventListener('click', (e) => (e.stopPropagation(), setItem(target, !isStill(target)), drawMotion()));
  slow.addEventListener('click', (e) => {
    e.stopPropagation();
    if (slowEls.has(target) || S.slow) slowEls.delete(target);
    else slowEls.add(target);
    if (S.slow && !slowEls.has(target)) S.slow = false; // the page was all slowed: this one goes back, the rest stay slowed
    slowAll();
    drawMotion();
  });
  for (const type of ['pointerdown', 'mousedown', 'touchstart']) box.addEventListener(type, (e) => e.stopPropagation()); // the control's, never a pin or a hold
  W.motions.append(box);
  c = { box, play, slow, ms, state: '' };
  ctls.set(target, c);
  return c;
};
// Its box from its middle and its own size, so a spinning or growing thing's control stays put.
const boxOf = (t) => {
  const r = t.getBoundingClientRect();
  const w = t instanceof HTMLElement ? t.offsetWidth : r.width;
  const h = t instanceof HTMLElement ? t.offsetHeight : r.height;
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  return { left: x - w / 2, right: x + w / 2, top: y - h / 2, bottom: y + h / 2, w, h };
};
let altMotion = false; // computers: ⌥ held
let pointerAt = null;
let scrolling = 0; // phones: the time the last scroll ended its quiet wait
let hot = null; // computers: the one whose full control shows
let hotSeen = 0; // when the pointer was last on it or its control
let hotBox = null; // its box when its control showed, in page coordinates
let cand = null; // a neighbour the pointer is on while still in that box, and since when
let candSince = 0;
// An element's box at rest, without its animated transform (a sliding loop, a pulsing dot), on screen: where its
// control goes and what counts as on it. From the layout offsets; where those can't say (SVG, a transformed or
// sticky ancestor puts them far off), its drawn box.
const restBox = (t) => {
  const drawn = boxOf(t);
  if (!(t instanceof HTMLElement) || !t.offsetParent && getComputedStyle(t).position !== 'fixed') return drawn;
  let x = 0, y = 0, fixed = false;
  for (let n = t; n; n = n.offsetParent as HTMLElement | null) {
    x += n.offsetLeft + (n === t ? 0 : n.clientLeft);
    y += n.offsetTop + (n === t ? 0 : n.clientTop);
    if (!n.offsetParent && getComputedStyle(n).position === 'fixed') fixed = true;
  }
  for (let a = t.parentElement; a && a !== document.body && a !== document.documentElement; a = a.parentElement) {
    x -= a.scrollLeft;
    y -= a.scrollTop;
  }
  if (!fixed) {
    x -= scrollX;
    y -= scrollY;
  }
  const w = t.offsetWidth, h = t.offsetHeight;
  const far = Math.max(200, 2 * (w + h));
  if (Math.abs(x + w / 2 - (drawn.left + drawn.w / 2)) > far || Math.abs(y + h / 2 - (drawn.top + drawn.h / 2)) > far) return drawn;
  return { left: x, top: y, right: x + w, bottom: y + h, w, h };
};
const under = () => {
  if (!pointerAt) return null;
  // On its control (wider than a small thing, so it can stick out past it): still that one.
  const own = hot && ctls.get(hot)?.box.getBoundingClientRect();
  if (own && hot.isConnected && pointerAt.x >= own.left && pointerAt.x <= own.right && pointerAt.y >= own.top && pointerAt.y <= own.bottom) return hot;
  // Where it was when its control showed (its box at rest, page coordinates): a thing sliding out from under the
  // pointer stays the one, and a neighbour sliding in doesn't take over. A moving thing inside a box that has the
  // control does (Leo, 19 Nov: "still random sometimes": the box between things kept the control from them).
  const was = hot?.isConnected && hotBox;
  const inWas = Boolean(was && pointerAt.x >= was.left - scrollX && pointerAt.x <= was.right - scrollX && pointerAt.y >= was.top - scrollY && pointerAt.y <= was.bottom - scrollY);
  const outer = outermost(moving());
  // The thing under the mouse is a moving one or inside one (the "Buy" text in a pressed button): that one.
  const at = document.elementFromPoint(pointerAt.x, pointerAt.y);
  const page = at && at !== W.host && at !== document.documentElement && at !== document.body && !W.root.contains(at) ? at : null;
  let direct = page && outer.find((t) => t.contains(page));
  if (!direct) {
    let best = null;
    for (const t of outer) {
      const b = restBox(t);
      if (!b.w || !b.h || pointerAt.x < b.left || pointerAt.x > b.right || pointerAt.y < b.top || pointerAt.y > b.bottom) continue;
      if (!best || b.w * b.h < best.a) best = { t, a: b.w * b.h };
    }
    direct = best?.t;
  }
  let next = direct;
  if (!next && inWas) next = hot;
  // A gap between things while one has its control: that control stays, then fades (300 ms), and the box around them
  // doesn't take over (its control sits at that box's far corner: Leo, 19 Nov, "option and move cursor makes controls
  // run away"). Without a control showing, the box offers its own.
  if (!next && !hot?.isConnected) {
    // Or it holds moving things (the demo box around a pressed button and its toast):
    // its control, for all that moves inside; not the page's whole body or a box as big as half the screen.
    // A box with one moving thing in it (a track and its loop) is that thing.
    const r = page?.getBoundingClientRect();
    const inside = r && r.width * r.height <= (innerWidth * innerHeight) / 2 ? outer.filter((t) => page.contains(t)) : [];
    // Not from the gap between two of them (one on each side of the pointer): that box's control sits at its far
    // corner, away from the pointer (Leo, 19 Nov: "option and move cursor makes controls run away").
    const between = inside.length > 1 && (() => {
      const bs = inside.map(restBox);
      const { x, y } = pointerAt;
      // Beside them on their row (or column) only: the box's own edge above or beside them all still offers its control.
      const row = bs.filter((b) => b.top <= y && b.bottom >= y), col = bs.filter((b) => b.left <= x && b.right >= x);
      return (row.some((b) => b.right < x) && row.some((b) => b.left > x)) || (col.some((b) => b.bottom < y) && col.some((b) => b.top > y));
    })();
    next = inside.length === 1 ? inside[0] : inside.length && !between ? page : null;
  }
  if (next && hot?.isConnected && next !== hot) {
    // One control at a time: on its way to it the pointer crosses a neighbour (its control can lie over one), or a
    // thing inside the box that has it; another thing takes over only once the pointer rests on it (250 ms).
    const now = performance.now();
    if (cand !== next) {
      cand = next;
      candSince = now;
    }
    return now - candSince >= 250 ? next : hot;
  }
  cand = null;
  return next;
};
let motionLoop = 0;
export const drawMotion = () => {
  cancelAnimationFrame(motionLoop);
  animsNow = null;
  animsNow = pageAnims();
  try {
    drawMotionNow();
  } finally {
    animsNow = null;
  }
};
const drawMotionNow = () => {
  const vw = document.documentElement.clientWidth;
  const vh = innerHeight;
  const want: Map<Element, 'full' | 'mini'> = new Map();
  if (S.on) {
    if (!W.coarse) {
      // Reachable (Leo, 19 Nov: "sometimes menu with pause is out of reach"): crossing the gap to the control, or the
      // thing moving out from under the pointer, keeps it for 300 ms.
      const next = altMotion ? under() : null;
      const now = performance.now();
      if (next) {
        if (next !== hot) {
          const b = restBox(next);
          hotBox = { left: b.left + scrollX, right: b.right + scrollX, top: b.top + scrollY, bottom: b.bottom + scrollY };
        }
        hot = next;
        hotSeen = now;
      } else if (!(altMotion && hot?.isConnected && now - hotSeen < 300)) hot = null;
          for (const h of outermost([...held].filter((h) => h.isConnected))) want.set(h, 'mini');
      if (hot) want.set(hot, 'full');
    } else if (!scrolling && !W.host.hasAttribute('data-sheet')) {
      for (const t of outermost(moving())) {
        const b = boxOf(t);
        const seen = Math.max(0, Math.min(b.right, vw) - Math.max(b.left, 0)) * Math.max(0, Math.min(b.bottom, vh) - Math.max(b.top, 0));
        if (b.w && b.h && seen >= (b.w * b.h) / 2) want.set(t, 'full');
      }
    }
  }
  for (const [t, c] of ctls) {
    if (want.has(t)) continue;
    if (!c.box.classList.contains('on')) {
      if (!t.isConnected) {
        c.box.remove();
        ctls.delete(t);
      }
      continue;
    }
    c.spot = null; // shown again later: where the thing is then
    c.box.classList.remove('on'); // fades out, and stays in the layer for next time
  }
  for (const [t, kind] of want) {
    const c = ctlFor(t);
    const stopped = isStill(t);
    const state = `${stopped}${kind}`;
    if (c.state !== state) {
      c.state = state;
      c.play.innerHTML = stopped ? PLAY : PAUSE;
      const what = t instanceof HTMLVideoElement ? 'video' : 'animation';
      c.play.setAttribute('aria-label', (c.play.title = `${stopped ? 'play' : 'pause'} this ${what} (${W.KEYS.pause.toUpperCase()}: all)`));
      c.box.setAttribute('aria-label', `${what} controls`);
    }
    const slowed = S.slow || slowEls.has(t);
    c.slow.setAttribute('aria-pressed', String(slowed));
    c.slow.setAttribute('aria-label', (c.slow.title = `${slowed ? 'full' : 'quarter'} speed (${W.KEYS.slow.toUpperCase()}: all)`));
    const ms = msOf(t);
    c.ms.textContent = ms === undefined ? '' : `${ms} ms`;
    c.box.classList.toggle('mini', kind === 'mini');
    c.box.classList.toggle('quiet', W.coarse);
    const b = kind === 'full' && !W.coarse ? restBox(t) : boxOf(t); // ⌥: from its box at rest, not where its animation has it
    // A small paused thing (a dot, an icon) would be all under its ▶, so a click to pin it played it instead: its ▶
    // sits just outside, at its top right.
    const small = kind === 'mini' && (b.w < c.box.offsetWidth * 2 || b.h < c.box.offsetHeight * 2);
    // A computer's full control stays where it first showed while the pointer is on it (a moving thing would carry it
    // away from the pointer), in page coordinates; always on screen.
    const keep = !W.coarse && kind === 'full' && c.spot?.t === t ? c.spot : null;
    const x = keep ? keep.x - scrollX : small ? b.right + 4 + c.box.offsetWidth : b.right - 4;
    const y = keep ? keep.y - scrollY : small ? b.top - 4 : b.top + 4;
    const left = Math.min(Math.max(x, c.box.offsetWidth + 4), vw - 4); // a thing at the screen's edge keeps its control on screen
    const top = Math.min(Math.max(y, 4), vh - c.box.offsetHeight - 4);
    c.spot = kind === 'full' ? { t, x: (keep ? keep.x - scrollX : x) + scrollX, y: (keep ? keep.y - scrollY : y) + scrollY } : null;
    c.box.style.left = `${left + scrollX}px`;
    c.box.style.top = `${top + scrollY}px`;
    if (!c.box.classList.contains('on')) requestAnimationFrame(() => c.box.classList.add('on')); // in the next frame: it fades in
  }
  // The ms and the place follow the motion, every frame, only while a full control shows (⌥, phones). Paused things
  // keep only their ▶, which stays put: no loop (Leo, 19 Nov: "when i paused here its became laggy"); a scroll inside
  // a box, a resize or the 1 s redraw move it.
  if ([...want.values()].includes('full')) motionLoop = requestAnimationFrame(drawMotion);
};
export const setPause = (on) => {
  for (const el of on ? moving().filter((el) => !isStill(el)) : [...held]) setItem(el, on);
  drawMotion();
};
const altMotionSet = (on) => {
  if (altMotion === on) return;
  altMotion = on;
  drawMotion();
};
let scrollQuiet = 0;
// The browser says when a scroll ended (scrollend); a timer stays as a backstop for a scroll that never says so.
const scrollOver = () => {
  clearTimeout(scrollQuiet);
  if (scrolling) {
    scrolling = 0;
    drawMotion();
  }
};
let motionAgain = 0;
const redrawMotionSoon = () => motionAgain || (motionAgain = requestAnimationFrame(() => ((motionAgain = 0), drawMotion())));
export function bindMotion(w: unknown) {
  W = w;
  S = W.S;
  S.momentChip = momentChip;
  S.momentFor = momentFor;
  for (const type of ['animationstart', 'transitionrun', 'play']) addEventListener(type, () => (S.slow || slowEls.size > 0) && slowAll(), true);
  addEventListener('keydown', (e) => e.key === 'Alt' && !W.coarse && altMotionSet(!e.metaKey && !e.ctrlKey && !e.shiftKey), true);
  addEventListener('keydown', (e) => altMotion && e.key !== 'Alt' && altMotionSet(false), true); // ⌥W, ⌥1…: a shortcut
  addEventListener('keyup', (e) => e.key === 'Alt' && altMotionSet(false), true);
  addEventListener('blur', () => altMotionSet(false));
  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    pointerAt = { x: e.clientX, y: e.clientY };
    if (altMotion && !e.altKey) altMotionSet(false); // its keyup went to another window
    else if (altMotion) drawMotion();
  }, { capture: true, passive: true });
  addEventListener('resize', () => held.size && redrawMotionSoon(), { passive: true });
  addEventListener('scroll', (e) => {
    if (!W.coarse) return void (held.size && e.target !== document && redrawMotionSoon()); // a box scrolled: the ▶s in it move
    clearTimeout(scrollQuiet);
    if (!scrolling) {
      scrolling = 1;
      drawMotion();
    }
    scrollQuiet = window.setTimeout(scrollOver, 1500);
  }, { capture: true, passive: true });
  addEventListener('scrollend', () => W.coarse && scrollOver(), { capture: true, passive: true });
  // Once a second, for what starts on its own (a phone's controls come with any loop; a slowed page slows what began since).
  // Nothing to draw or fade out (comments off, or a computer with no ⌥ held and nothing paused): no scan of the page.
  const idle = () => (!S.on || (!W.coarse && !altMotion && !held.size)) && ![...ctls.values()].some((c) => c.box.classList.contains('on'));
  setInterval(() => {
    if (S.slow || slowEls.size > 0) slowAll();
    if (!document.hidden && !idle()) drawMotion();
  }, 1000);
  if (W.coarse) new MutationObserver(() => drawMotion()).observe(W.host, { attributeFilter: ['data-sheet'] }); // a sheet opens: the controls go
}
