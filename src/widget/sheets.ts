// Part of the comment widget (src/comments.js bundles it). Uses the widget's own parts through W, set once at startup.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let W: any;
export function bindSheets(w: unknown) {
  W = w;
}

// A sheet follows the finger like a native one: from the handle and the header, from any part that doesn't scroll,
// and from a list or the messages when they're already at the top and the finger pulls down (any other drag there
// scrolls them natively; overscroll-behavior keeps the page behind still). Up past where it sits it stretches a
// little and springs back. Let go fast, or past a third of its height, and it carries on down and away at the
// finger's speed; else it springs back, the dimmed page fading with it. Text boxes stay the browser's.
const grabArea = (t) => Boolean(t.closest?.('.handle, .tabs'));

const scrollerIn = (e, node) =>
  e.composedPath().find((n) => n instanceof HTMLElement && node.contains(n) && (n.localName === 'textarea' || /auto|scroll/.test(getComputedStyle(n).overflowY)));

const SPRING = 'cubic-bezier(.32,.72,0,1)';

const HELD = ['top', 'bottom', 'height', 'max-height', 'transform', 'transition', 'animation', 'pointer-events', 'opacity', 'transform-origin'];

// Where the last touch went down: the sheet it opens grows out of there, as iOS 27's do from the button you tapped.
let tap = { x: 0, y: 0, at: -1e9 };
export function fromTap(node: HTMLElement, at?: { x: number; y: number } | null) {
  const p = at || (performance.now() - tap.at < 1500 ? tap : null);
  if (!p) return node.style.removeProperty('--lab-from'); // no tap (a key, a link): from the bottom middle
  node.style.setProperty('--lab-from', `${Math.round(p.x - node.offsetLeft)}px ${Math.round(p.y - node.offsetTop)}px`);
}

// Phones, sending with the keyboard up: the box being sent is about to be drawn away, which would drop the keyboard at
// once, and Safari moves its fixed things ~300 px as the keyboard lets go: the card vanished instead of flying into its
// pin (iOS 27 simulator, 16 Nov). A hidden field holds the keyboard (and so the screen) still until the card has landed.
let keeper: HTMLInputElement | null = null;
export function holdKeyboard() {
  if (!W.coarse || !W.host.hasAttribute('data-kb') || W.still.matches) return;
  // The comment box's settings, so the keyboard stays exactly as it was (no suggestion row appearing: a relayout).
  keeper ??= W.el('input', { 'aria-hidden': 'true', tabindex: '-1', autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false', writingsuggestions: 'false',
    style: 'position:fixed;top:0;left:-200px;width:1px;height:1px;opacity:0;font-size:16px;pointer-events:none' }) as HTMLInputElement;
  if (!keeper.isConnected) W.root.append(keeper);
  keeper.focus({ preventScroll: true });
}

// Phones: the open sheet leaves, and the keyboard (if it's up) goes at the same moment, as a native sheet's does. It
// used to slide behind the keyboard and vanish there, and the keyboard stayed alone for 0.6 s; after sending, the sheet
// rode the keyboard halfway down and vanished mid-screen (iOS 27 simulator, 16 Nov). Its box is held where it is (the
// keyboard going would otherwise resize and move it on the way).
// Closed by a tap (or a send) it shrinks back into where it came from and fades, as iOS 27's share sheet does into its
// button (measured: ~0.1 s); to: the new pin, after a send. After a swipe (ms) it slides down at the finger's speed,
// steady, never fading (easing out, its last part crept under Safari's see-through bottom bar, Leo 16 Nov).
// After a send (to: the new pin's middle) it flies into the pin, shrinking to the pin's size, and fades only at the end;
// the pin pops in as it arrives (.pin.arrive): lab option B2, Leo 16 Nov.
// Returns how long it takes; let go of it with letGo().
export function leave(node: HTMLElement, ms = 0, to?: { x: number; y: number } | null) {
  const dur = to ? 360 : ms || 200;
  const ease = ms ? 'linear' : 'cubic-bezier(.4, 0, .9, .4)';
  let moved = 0; // a finger may have it part way down already
  try { moved = new DOMMatrixReadOnly(getComputedStyle(node).transform).m42 || 0; } catch {}
  const r = node.getBoundingClientRect();
  const top = r.top - moved;
  const fade = getComputedStyle(W.scrim).opacity;
  for (const [k, v] of [['top', `${top}px`], ['bottom', 'auto'], ['height', `${r.height}px`], ['max-height', 'none'], ['animation', 'none'],
    ['transition', 'none'], ['transform', to ? '' : `translateY(${moved}px)`], ['pointer-events', 'none']]) node.style.setProperty(k, v, 'important');
  W.host.setAttribute('data-leaving', '');
  W.scrim.style.transition = 'none';
  W.scrim.style.opacity = fade;
  // The keyboard goes now, with the sheet; after a send, once the card is in its pin (see holdKeyboard).
  const letKeysGo = () => (W.root.activeElement as HTMLElement | null)?.blur();
  if (to) setTimeout(letKeysGo, dur);
  else letKeysGo();
  // Back into its pin where the pin is now (the page scrolled it into view after the tap); the list and the chat back
  // to where they were tapped open.
  const pin = to ? null : W.root.querySelector(node.classList.contains('card') ? '.pin.open' : node.classList.contains('float') ? '.pin.draft' : 'none');
  const p = pin?.getBoundingClientRect();
  if (p) fromTap(node, { x: p.left + p.width / 2, y: p.top + p.height / 2 });
  void node.offsetHeight;
  if (to) {
    node.style.setProperty('transform-origin', '50% 50%', 'important');
    const dx = to.x - (r.left + r.width / 2), dy = to.y - (top + r.height / 2);
    // From the next frame: drawing the sent pin took ~100 ms, which ate the start of the flight (iOS 27 simulator).
    // The move on iOS's curve; the fade on its own, in the last 30 % of the time (on the move's curve it was nearly gone
    // halfway, so you never saw it reach the pin).
    const fly = () => {
      node.animate([{ transform: 'none' }, { transform: `translate(${dx}px, ${dy}px) scale(${22 / r.width}, ${22 / r.height})` }], { duration: dur, easing: SPRING, fill: 'forwards' });
      node.animate([{ opacity: 1 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }], { duration: dur, fill: 'forwards' });
    };
    requestAnimationFrame(() => requestAnimationFrame(fly));
  } else if (ms) {
    node.style.setProperty('transition', `transform ${dur}ms ${ease}`, 'important');
    node.style.setProperty('transform', `translateY(${Math.max(r.height, innerHeight - top) + 8}px)`, 'important');
  } else {
    node.style.setProperty('transition', `transform ${dur}ms ${ease}, opacity ${dur}ms ease-in`, 'important');
    node.style.setProperty('transform', `translateY(${moved}px) scale(.3)`, 'important');
    node.style.setProperty('opacity', '0', 'important');
  }
  W.scrim.style.transition = `opacity ${dur}ms ${ease}`;
  W.scrim.style.opacity = '0';
  return to ? dur + 120 : dur; // a flight starts a frame or two late (see fly)
}
export function letGo(node: HTMLElement) {
  for (const k of HELD) node.style.removeProperty(k);
  W.host.removeAttribute('data-leaving');
  W.scrim.style.opacity = W.scrim.style.transition = '';
}

// Phones: a sheet slides down and away (see leave), then it closes.
export function slideAway(node, close, ms = 0) {
  if (!W.coarse || !node || W.still.matches) return close();
  const dur = leave(node, ms);
  W.bar.style.transition = `transform ${dur}ms cubic-bezier(.2, .6, .4, 1), opacity ${dur}ms`;
  W.host.style.setProperty('--lab-p', '1'); // the bar comes up as the sheet goes down
  setTimeout(() => {
    close();
    letGo(node);
    W.bar.style.transition = '';
    W.host.style.removeProperty('--lab-p');
  }, dur);
}

// A new comment's pin stays in sight: as its sheet opens, a pin the sheet would cover once the keyboard is up scrolls up
// into the middle of what's free above it, as goTo does for a thread (a pin low on the page went under the sheet: you
// couldn't see what you were commenting on, 16 Nov). Now, before the keyboard: scrolled with the keyboard up, Safari pans
// its view instead and the sheet landed 126 px low, behind the keyboard's bar.
export function revealDraft() {
  const float: HTMLElement | null = W.root.querySelector('.float:not(.out)');
  const pin: HTMLElement | null = W.root.querySelector('.pin.draft');
  if (!W.coarse || !float || !pin || !W.vv) return;
  const up = innerHeight - W.vv.height;
  const keys = up > 60 ? up : W.S.kbSeen || Math.round(innerHeight * 0.42); // the keyboard it will have
  const sheetTop = innerHeight - keys - float.offsetHeight - 8; // where it comes to rest, not where it is growing now
  const p = pin.getBoundingClientRect();
  const free = 56; // below the status bar
  if (p.top < free || p.bottom > sheetTop - 16) scrollPageTo(scrollY + (p.top + p.bottom) / 2 - (free + sheetTop) / 2);
}

// Scrolls the page to top (smoothly, unless motion is reduced). A spot near the page's end can't scroll up into the
// part a phone's sheet leaves free above it: the page gets room below its end while the sheet is open (--lab-room).
export function scrollPageTo(top: number) {
  if (W.coarse) {
    const de = document.documentElement;
    const had = parseFloat(de.style.getPropertyValue('--lab-room')) || 0;
    const room = Math.max(0, Math.ceil(top + innerHeight - (de.scrollHeight - had)));
    de.style.setProperty('--lab-room', `${room}px`);
    de.classList.toggle('lab-room', room > 0);
  }
  scrollTo({ top: Math.max(0, top), behavior: W.still.matches ? 'auto' : 'smooth' });
}

 // CloseWatcher (not in TypeScript's DOM types yet)
export function backCloses() {
  const open = matchMedia('(pointer: coarse)').matches && W.host.hasAttribute('data-sheet');
  if (!open && W.S.backWatcher) {
    const w = W.S.backWatcher;
    W.S.backWatcher = null;
    w.destroy();
  }
  if (open && !W.S.backWatcher && 'CloseWatcher' in window) {
    try {
      const w = new (window as any).CloseWatcher();
      w.onclose = () => {
        if (W.S.backWatcher === w) W.S.backWatcher = null;
        W.closeOrNudge();
        backCloses(); // still open (it nudged): back closes it next time
      };
      W.S.backWatcher = w;
    } catch {}
  }
}

export function swipeDown(node, close, grows = false) {
  if (!W.coarse) return;
  // A sheet that grows (the chat) has two heights, as iOS and Android sheets do: pull it up (or flick) to fill the
  // screen, pull it down from there to go back; from the lower one a pull down closes it as before.
  let raw = 0;
  // Right after its content scrolled (a fling up to the top), a pull down scrolls on instead of taking the sheet,
  // and for a moment after letting go of a drag a tap does nothing, so a sheet that springs back under the finger
  // doesn't press what lands there or pop the keyboard (Vaul's 100 ms and 200 ms).
  let scrolledAt = -1e9;
  let releasedAt = -1e9;
  node.addEventListener('scroll', () => (scrolledAt = performance.now()), { capture: true, passive: true });
  node.addEventListener('click', (e) => {
    if (performance.now() - releasedAt < 200) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);
  node.addEventListener('focusin', (e) => {
    if (performance.now() - releasedAt < 200 && e.target.localName === 'textarea') e.target.blur();
  });
  let x0 = 0;
  let y0 = 0;
  let dy = 0;
  let v = 0; // px/ms, from the last moves
  let last = null;
  let mode = null; // 'drag' the sheet, 'hold' (sideways on a part that doesn't scroll), 'off' (the browser's)
  let box = null; // the scrolling part the touch began in
  let fromScrim = false; // the touch began on the dimmed page under the sheet: that pulls the sheet too
  const onStart = (e) => {
    fromScrim = e.currentTarget === W.scrim;
    if (fromScrim && W.openSheet() !== node) return void (mode = 'off');
    const t = e.touches[0];
    x0 = t.clientX;
    y0 = t.clientY;
    dy = v = raw = 0;
    last = { y: y0, at: e.timeStamp };
    box = fromScrim ? null : scrollerIn(e, node);
    mode = e.touches.length > 1 || box?.localName === 'textarea' ? 'off' : null;
  };
  node.addEventListener('touchstart', onStart, { passive: true });
  W.scrim.addEventListener('touchstart', onStart, { passive: true });
  const onMove = (e) => {
    if (fromScrim !== (e.currentTarget === W.scrim)) return;
    const t = e.touches[0];
    // Scrolling the messages up to their top and pulling on in the same move hands the sheet to the finger, as iOS
    // sheets do (it used to take a second swipe). Only while the browser still lets the move be taken over.
    if (mode === 'off' && box && box.localName !== 'textarea' && e.touches.length === 1 && e.cancelable && box.scrollTop <= 0 && t.clientY > last.y + 1) {
      mode = 'drag';
      y0 = t.clientY;
      v = 0;
      last = { y: t.clientY, at: e.timeStamp };
    }
    if (mode === 'off') return void (last = { y: t.clientY, at: e.timeStamp });
    if (mode === 'hold') return e.preventDefault();
    if (!mode) {
      const down = t.clientY - y0;
      const across = t.clientX - x0;
      if (!down && !across) return; // iOS sends moves for pressure changes too
      const sideways = Math.abs(across) > Math.abs(down);
      // The sheet's top quarter pulls it down too, messages and all, as does the dimmed page above it (Leo, 15 Nov);
      // below that a pull scrolls the messages until they reach their top.
      const nearTop = !sideways && down > 0 && y0 - node.getBoundingClientRect().top < node.offsetHeight * 0.25;
      if (fromScrim) mode = sideways ? 'hold' : 'drag';
      else if (grabArea(e.target)) mode = sideways && e.target.closest('.tabs') ? 'off' : 'drag'; // the list's tabs scroll sideways
      else if (nearTop && box?.localName !== 'textarea') mode = 'drag';
      else if (box) mode = !sideways && down > 0 && box.scrollTop <= 0 && performance.now() - scrolledAt > 100 ? 'drag' : 'off';
      else mode = sideways ? 'hold' : 'drag';
      W.S.dbg?.(`touch ${String(e.target.className || e.target.localName).slice(0, 20)} at ${Math.round(y0 - node.getBoundingClientRect().top)}/${node.offsetHeight} down${Math.round(down)} → ${mode}${e.cancelable ? '' : ' (not cancelable)'}${box ? ` box${Math.round(box.scrollTop)}` : ''}`);
      if (mode === 'off') return;
      if (mode === 'hold') return e.preventDefault();
    }
    e.preventDefault();
    raw = t.clientY - y0;
    // Up past where it sits: iOS's rubber band (UIScrollView's: offset = (1 − 1 / (pull × 0.55 / size + 1)) × size),
    // so it follows the finger, more and more slowly (it barely moved before: 100 px of pull gave 20 px, now ~50).
    const size = node.offsetHeight || 400;
    dy = raw >= 0 ? raw : -(1 - 1 / ((-raw * 0.55) / size + 1)) * size;
    if (e.timeStamp > last.at) v = 0.8 * ((t.clientY - last.y) / (e.timeStamp - last.at)) + 0.2 * v;
    last = { y: t.clientY, at: e.timeStamp };
    node.style.transition = W.scrim.style.transition = 'none';
    node.style.transform = `translateY(${dy}px)`;
    // How far it is on its way out (to the screen's bottom): the page undims and the bar comes up by that much, so
    // the dim is gone when the sheet is, not after the first 320 px (it was gone with two thirds of a thread still up).
    const way = Math.min(1, Math.max(0, dy / Math.max(100, innerHeight - (node.getBoundingClientRect().top - dy))));
    W.scrim.style.opacity = String(1 - way);
    W.bar.style.transition = 'none';
    W.host.style.setProperty('--lab-p', String(way));
  };
  node.addEventListener('touchmove', onMove, { passive: false });
  W.scrim.addEventListener('touchmove', onMove, { passive: false });
  const end = (e) => {
    if (fromScrim !== (e.currentTarget === W.scrim)) return;
    const was = mode;
    mode = null;
    if (was === 'drag') W.S.sheetDraggedAt = performance.now();
    if (was !== 'drag') return;
    releasedAt = performance.now();
    if (e.timeStamp - last.at > 80) v = 0; // held still before letting go
    const h = node.offsetHeight || innerHeight;
    const settle = () => {
      node.style.transition = `transform 380ms ${SPRING}, height 380ms ${SPRING}`;
      W.scrim.style.transition = 'opacity 300ms';
      node.style.transform = W.scrim.style.opacity = '';
      W.bar.style.transition = '';
      W.host.style.removeProperty('--lab-p'); // springing back: the bar goes back down with it
      setTimeout(() => (node.style.transition = W.scrim.style.transition = ''), 400);
    };
    if (grows && !node.classList.contains('full') && (raw < -40 || v < -0.4)) return node.classList.add('full'), node.classList.contains('card') && (W.S.cardFull = true), settle();
    if (grows && node.classList.contains('full') && v < 1.2 && (raw > 60 || v > 0.4)) return node.classList.remove('full'), node.classList.contains('card') && (W.S.cardFull = false), settle();
    // Where the sheet would come to rest if let go now, as iOS judges a throw (Apple's "Designing Fluid Interfaces":
    // the distance plus the speed carried on at the normal deceleration, 0.998 a millisecond, so v × 499): past half
    // its height it goes. A short quick flick closes; a slow long drag closes past halfway; a move back up never does.
    const rest = dy + Math.max(0, v) * 499;
    W.S.dbg?.(`let go: moved ${Math.round(dy)} speed ${v.toFixed(2)} rest ${Math.round(rest)} of half ${Math.round(h / 2)} → ${v > -0.1 && rest > h / 2 ? 'close' : 'stay'}`);
    // Off the screen's bottom at the finger's speed (it leaves at a steady pace, see leave).
    if (v > -0.1 && rest > h / 2) return slideAway(node, close, Math.min(320, Math.max(140, (innerHeight - node.getBoundingClientRect().top) / Math.max(v, 1.2))));
    node.style.transition = `transform 380ms ${SPRING}`;
    W.scrim.style.transition = 'opacity 300ms';
    node.style.transform = W.scrim.style.opacity = '';
    W.bar.style.transition = '';
    W.host.style.removeProperty('--lab-p'); // springing back: the bar goes back down with it
    setTimeout(() => (node.style.transition = W.scrim.style.transition = ''), 400);
  };
  node.addEventListener('touchend', end);
  W.scrim.addEventListener('touchend', end);
  W.scrim.addEventListener('touchcancel', end);
  node.addEventListener('touchcancel', end);
}

export function startSheets() {
  if (W.coarse && W.vv) {
    const probe = W.el('i', { style: 'position:fixed;top:0;bottom:0;left:0;width:0;visibility:hidden;pointer-events:none' });
    // Safari 26 with the keyboard up shows the page in a strip above the keyboard, around its address pill, where it
    // draws nothing fixed: the sheet and its dimming stop above it. A block in the page itself (not fixed) covers it.
    const strip = W.el('i', { style: 'position:absolute;left:0;width:100vw;display:none;background:var(--_bg);z-index:3;pointer-events:none' });
    W.root.append(probe, strip);
    let fitted = '';
    const fit: (() => void) & { sheet?: HTMLElement | null; top?: number; done?: any; vh?: number; kbUp?: boolean } = () => {
      const zoomed = Math.abs(W.vv.scale - 1) > 0.01; // pinch-zoomed: that isn't a keyboard
      const r = probe.getBoundingClientRect();
      // iOS 26.0 can leave offsetTop at 24 px after the keyboard has gone. With nothing to type in focused there is no
      // keyboard and nothing panned (unzoomed), so an offset then is stale and counts as 0.
      const field = (W.root.activeElement || document.activeElement as HTMLElement | null);
      const typing = /^(textarea|input|select)$/.test(field?.localName || '') || Boolean(field?.isContentEditable);
      const top = zoomed || !typing ? 0 : W.vv.offsetTop;
      // The bottom of what the screen shows, where the probe's box is measured. WebKit (Safari, Chrome on iPhone)
      // measures boxes from the screen's top, so a page panned up for the keyboard puts the probe's top at -offsetTop;
      // Blink measures from the page's top (probe at 0). Adding the offset alone counted a pan twice on iPhones: the
      // keyboard came out 0 and a new comment sat behind the keyboard's bar (Leo, 16 Nov, "sometimes": only when Safari
      // pans instead of scrolling).
      const seen = (top ? top + r.top : 0) + W.vv.height;
      const kb = zoomed ? 0 : Math.max(0, Math.round(r.bottom - seen));
      const gap = zoomed ? 0 : Math.max(0, Math.round(seen - r.bottom));
      const vh = zoomed ? 0 : Math.round(W.vv.height);
      // Safari 26 doesn't count as "keyboard up" here (its fixed layer ends above the keyboard by itself): the sheet stays
      // a half sheet resting on that layer, which sits right, and the strip below it is covered.
      const sheet = W.host.hasAttribute('data-sheet');
      const key = `${kb} ${vh} ${gap} ${sheet} ${scrollY} ${Math.round(top)}`;
      if (key === fitted) {
        // Nothing to lay out again, but where the open sheet sits now is where the next keyboard slide starts from (it
        // was last read when the chat opened, hidden, at 0: the slide jumped to the screen's top first).
        const open = sheet ? W.openSheet() : null;
        if (open?.offsetHeight && !open.style.transform) Object.assign(fit, { sheet: open, top: open.offsetTop });
        return;
      }
      fitted = key;
      W.host.style.setProperty('--lab-kb', `${kb}px`);
      W.host.style.setProperty('--lab-top', `${Math.round(top)}px`);
      if (vh) W.host.style.setProperty('--lab-vh', `${vh}px`);
      else W.host.style.removeProperty('--lab-vh');
      W.host.toggleAttribute('data-kb', kb > 60);
      strip.style.display = sheet && gap ? 'block' : 'none';
      strip.style.top = `${Math.round(scrollY + r.bottom)}px`;
      strip.style.height = `${gap}px`;
      // The keyboard came or went: the open sheet moves from where it was to its new place instead of jumping there
      // (filling the screen above the keyboard, or resting on the screen's bottom again). Not while a finger drags it.
      // Its place as the browser reports it: on iOS 26 a fixed sheet's box is already where you see it (it rests on
      // the keyboard while Safari pans the page), so subtracting the pan put the slide's start 276 px off (15 Nov,
      // ?kbdebug on Leo's iPhone: the visible height jumps 686 → 410 → 686 in one step each way).
      const open = sheet ? W.openSheet() : null;
      // Its box, without any slide or opening growth in progress: the place it is going to, not passing through. (Read
      // mid-growth, a new comment's slide up with the keyboard started 266 px too high and it jumped, 16 Nov.)
      const keyboardMoved = Math.abs((fit.vh || vh) - vh) > 60 || fit.kbUp !== kb > 60;
      const sliding = open && open === fit.sheet && keyboardMoved && !open.style.transform && !W.still.matches;
      // Its own height change (the chat eases its height) jumps to the end first, so the place measured is where it
      // ends up: measured mid-change, the slide started 84 px too high (?kbdebug, 15 Nov).
      if (sliding) {
        open.style.transition = 'none';
        void open.offsetHeight;
      }
      const at = open ? open.offsetTop : null;
      if (sliding && Math.abs(fit.top - at) <= 8) open.style.transition = '';
      if (sliding && Math.abs(fit.top - at) > 8) {
        // Set at once, then eased away: an animate() call waits a frame to start, and that frame showed the sheet at
        // its new place before it jumped back to slide (the flicker a ?kbdebug run on Leo's iPhone showed, 15 Nov).
        open.style.transform = `translateY(${fit.top - at}px)`;
        void open.offsetHeight;
        open.style.transition = `transform 340ms ${SPRING}`;
        open.style.transform = '';
        clearTimeout(fit.done);
        fit.done = setTimeout(() => !open.style.transform && (open.style.transition = ''), 360);
      }
      Object.assign(fit, { vh, kbUp: kb > 60 }, open?.offsetHeight ? { sheet: open, top: at } : { sheet: null }); // a hidden one has no place yet
      if (kb > 60) W.S.kbSeen = kb; // the keyboard's height, for revealDraft before the next one comes up
    };
    W.S.refit = fit;
    W.root.addEventListener('focusin', () => setTimeout(fit, 50));
    W.root.addEventListener('focusout', () => setTimeout(fit, 50));
    W.vv.addEventListener('resize', fit);
    W.vv.addEventListener('scroll', fit);
    addEventListener('pointerdown', (e) => (tap = { x: e.clientX, y: e.clientY, at: performance.now() }), { capture: true, passive: true });
    fit();
    // ?kbdebug on the page's address: every frame for 1.5 s after the keyboard is asked for or let go, where the open
    // sheet sits on the screen and what Safari reports, sent to the page's chat as "kb-log" 2 s after letting go. For
    // tuning the keyboard slide on a real phone (a simulator's keyboard doesn't move like one).
    // Only with ?kbdebug in the address; nothing runs otherwise.
    if (globalThis.__LAB_DEBUG__ !== false && /[?&]kbdebug\b/.test(location.search)) {
      let lines = [];
      let t0 = performance.now();
      let sendTimer: any = 0;
      const row = (what) => {
        const open = W.openSheet();
        const r = open?.getBoundingClientRect();
        lines.push(`${Math.round(performance.now() - t0)} ${what} h${Math.round(W.vv.height)} top${Math.round(W.vv.offsetTop)} in${innerHeight} kb${W.host.hasAttribute('data-kb') ? 1 : 0}` +
          (r ? ` sheet${Math.round(r.top)}/${Math.round(r.height)}${open.getAnimations().length ? ' anim' : ''}` : '') +
          // What is moving anywhere (the page, the pins, the dimming): for a flicker that isn't the keyboard.
          ` [${[...document.getAnimations(), ...W.root.getAnimations()].map((a) => (a as any).animationName || (a as any).transitionProperty || 'js').slice(0, 6).join(',')}]` +
          ` scrim${getComputedStyle(W.scrim).opacity.slice(0, 4)} scroll${Math.round(scrollY)}`);
      };
      const watch = (what) => {
        row(what);
        const end = performance.now() + 1500;
        let prev = '';
        const f = () => {
          const before = lines.length;
          row('f');
          const last = lines[lines.length - 1].replace(/^\d+ f /, '');
          if (last === prev) lines.length = before; // only frames where something moved
          prev = last;
          if (performance.now() < end) requestAnimationFrame(f);
        };
        requestAnimationFrame(f);
      };
      W.root.addEventListener('focusin', () => ((t0 = performance.now()), watch('focus')));
      // Sent 2 s after the last thing that moved (a keyboard, Safari's address bar), so one run is one message.
      const sendSoon = () => {
        clearTimeout(sendTimer);
        sendTimer = setTimeout(async () => {
          const text = lines.join('\n');
          lines = [];
          for (let i = 0; i < text.length; i += 1900) {
            await W.send({ name: 'kb-log', text: text.slice(i, i + 1900), anchor: { kind: 'page', selector: 'body', x: 0, y: 0, docX: 0, docY: 0, width: innerWidth } }).catch(() => {});
          }
        }, 2000);
      };
      W.root.addEventListener('focusout', () => {
        lines.push('--- let go');
        t0 = performance.now();
        watch('blur');
        sendSoon();
      });
      W.S.dbg = (line) => {
        lines.push(`${Math.round(performance.now() - t0)} ${line}`);
        sendSoon();
      };
      // The address bar growing or shrinking resizes the view too: each resize is followed for 1.5 s like a keyboard.
      W.vv.addEventListener('resize', () => {
        watch('resize');
        if (lines.length > 1) sendSoon();
      });
    }
  }
}
