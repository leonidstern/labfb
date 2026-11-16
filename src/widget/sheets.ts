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
export const grabArea = (t) => Boolean(t.closest?.('.handle, .tabs'));

export const scrollerIn = (e, node) =>
  e.composedPath().find((n) => n instanceof HTMLElement && node.contains(n) && (n.localName === 'textarea' || /auto|scroll/.test(getComputedStyle(n).overflowY)));

export const SPRING = 'cubic-bezier(.32,.72,0,1)';

const HELD = ['top', 'bottom', 'height', 'max-height', 'transform', 'transition', 'animation', 'pointer-events'];

// Phones: the open sheet leaves, down past the screen's bottom, and the keyboard (if it's up) goes at the same moment,
// as a native sheet's does. It used to slide behind the keyboard and vanish there, and the keyboard stayed alone for
// 0.6 s; after sending, the sheet rode the keyboard halfway down and vanished mid-screen (iOS 27 simulator, 16 Nov).
// Its box is held where it is (the keyboard going would otherwise resize and move it on the way), and the dimmed page
// fades on the sheet's own curve, so it's as dim as the sheet is still there. ms: after a swipe, the finger's speed
// carried on. Returns how long it takes; let go of it with letGo().
// It never slows down on its way out: easing out, its last part crept under Safari's see-through bottom bar and looked
// like it lagged and faded there (Leo, 16 Nov). A flick goes on at a steady speed; a tap closes it speeding up, as iOS
// does. The sheet itself never fades.
export function leave(node: HTMLElement, ms = 0) {
  const dur = ms || 280;
  const ease = ms ? 'linear' : 'cubic-bezier(.4, 0, 1, 1)';
  let moved = 0; // a finger may have it part way down already
  try { moved = new DOMMatrixReadOnly(getComputedStyle(node).transform).m42 || 0; } catch {}
  const r = node.getBoundingClientRect();
  const top = r.top - moved;
  const fade = getComputedStyle(W.scrim).opacity;
  for (const [k, v] of [['top', `${top}px`], ['bottom', 'auto'], ['height', `${r.height}px`], ['max-height', 'none'], ['animation', 'none'],
    ['transition', 'none'], ['transform', `translateY(${moved}px)`], ['pointer-events', 'none']]) node.style.setProperty(k, v, 'important');
  W.host.setAttribute('data-leaving', '');
  W.scrim.style.transition = 'none';
  W.scrim.style.opacity = fade;
  (W.root.activeElement as HTMLElement | null)?.blur(); // the keyboard goes now, with the sheet
  void node.offsetHeight;
  node.style.setProperty('transition', `transform ${dur}ms ${ease}`, 'important');
  node.style.setProperty('transform', `translateY(${Math.max(r.height, innerHeight - top) + 8}px)`, 'important');
  W.scrim.style.transition = `opacity ${dur}ms ${ease}`;
  W.scrim.style.opacity = '0';
  return dur;
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
      const seen = top + W.vv.height; // the bottom of what the screen shows
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
        if (open?.offsetHeight && !open.style.transform) Object.assign(fit, { sheet: open, top: open.getBoundingClientRect().top });
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
      // Without any slide in progress (its own or the sheet's opening one): the place it is going to, not passing through.
      const slid = (n) => { try { return new DOMMatrixReadOnly(getComputedStyle(n).transform).m42 || 0; } catch { return 0; } };
      const keyboardMoved = Math.abs((fit.vh || vh) - vh) > 60 || fit.kbUp !== kb > 60;
      const sliding = open && open === fit.sheet && keyboardMoved && !open.style.transform && !W.still.matches;
      // Its own height change (the chat eases its height) jumps to the end first, so the place measured is where it
      // ends up: measured mid-change, the slide started 84 px too high (?kbdebug, 15 Nov).
      if (sliding) {
        open.style.transition = 'none';
        void open.offsetHeight;
      }
      const at = open ? open.getBoundingClientRect().top - slid(open) : null;
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
      // A new comment's pin stays in sight: when its sheet opens, and again once the keyboard is up, a pin the sheet
      // would cover scrolls up into the middle of what's free above it, as goTo does for a thread (a pin low on the
      // page went under the sheet: you couldn't see what you were commenting on, 16 Nov).
      const float: HTMLElement | null = W.S.draft ? W.root.querySelector('.float:not(.out)') : null;
      const pin: HTMLElement | null = float ? W.root.querySelector('.pin.draft') : null;
      const now = kb > 60 ? 'kb' : 'rest';
      if (float && pin && float.dataset.seen !== now) {
        float.dataset.seen = now;
        const sheetTop = r.bottom - kb - float.offsetHeight; // where it comes to rest, not where its slide is now
        const p = pin.getBoundingClientRect();
        const free = 56; // below the status bar
        if (p.top < free || p.bottom > sheetTop - 16) scrollPageTo(scrollY + (p.top + p.bottom) / 2 - (free + sheetTop) / 2);
      }
    };
    W.S.refit = fit;
    W.root.addEventListener('focusin', () => setTimeout(fit, 50));
    W.root.addEventListener('focusout', () => setTimeout(fit, 50));
    W.vv.addEventListener('resize', fit);
    W.vv.addEventListener('scroll', fit);
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
