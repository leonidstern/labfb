// Part of the comment widget (src/comments.js bundles it). Uses the widget's own parts through W, set once at startup.
//
// A board in the page, and the widget's part in it: showing a board, a tap on it that closes a comment, the board's camera
// moving the pins with it, and the page's pins hiding under a board's view.
import { heldPin } from './pinhold.ts';
import { anchorAt, coveredAt, position } from './anchoring.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let W: any;
let S: any; // the widget's state (W.S), read once at startup
// A board in this page (src/board/overlay.ts, loaded when one is opened): its link, the address's #board=<name> (a
// reload, a forward) or a board pin picked in the list opens it. Closing it lets go of a board pin that was open.
export const showBoard = (name: string, of = '', push = true) =>
  W.part('boardview').then((m) => m.show(name, { page: S.page, of, push, onClose: () => {
    const open = S.comments.find((c) => c.id === S.openId);
    if (open?.anchor?.kind === 'board') S.openId = null;
    if (S.draft?.anchor?.kind === 'board') S.draft = null;
    W.render();
  } }), () => W.say("the board couldn't load"));
// A tap on the board outside an open comment or the chat closes it, as a click outside one does on a page (onPageClick,
// and the chat's own press above); the board's surface eats its presses, so it asks here (Leo, 19 Nov). True when
// something closed: that tap only closes, a sent pin's undo card too (as on a page: the sent pin stays, no new one).
const dismiss = () => {
  const chat = S.chatOpen && !W.coarse; // phones close the chat by its handle or the dimmed page
  if (!S.draft && !S.openId && !chat) return false;
  if (S.undo && S.openId === S.undo.id) S.undo = null;
  S.draft = null;
  S.openId = null;
  if (chat) S.chatOpen = false;
  W.render();
  return true;
};
// The board's camera moved (a pinch, a pan) and nothing else: its pins go with it in the same frame, placed by the
// board's own sums (no read of the page, no redraw of the widget: that took 70 ms a frame on a page with many pins,
// and ran a frame late, so the pins swam behind the frames; Leo, 19 Nov: "zoom feels weird, slow"). An open card or a
// new comment's box on the board moves by as much as its pin, as it is (what is typed in it stays). Pins the browser
// holds move by themselves. False when it can't (a pin being dragged): the caller draws everything again.
const followCamera = () => {
  if (S.grabbing) return false;
  const by = (n: HTMLElement | null | undefined, dx: number, dy: number) => {
    if (!n?.style.left || !(dx || dy)) return;
    n.style.left = `${parseFloat(n.style.left) + dx}px`;
    n.style.top = `${parseFloat(n.style.top) + dy}px`;
  };
  // Every spot is read first, then every pin written: a spot reads the page's scroll, and reading it after a pin was
  // moved lays the page out again, once per pin (600 pins in a half view: a long task on every frame of a pan).
  const moves: [string, HTMLElement, ReturnType<typeof position>][] = [];
  for (const [id, pin] of W.pinsById) {
    const a = W.pinData.get(pin)?.c.anchor;
    if (a?.kind === 'board' && !heldPin(pin)) moves.push([id, pin, position(a)]);
  }
  const [sx, sy] = [scrollX, scrollY];
  for (const [id, pin, at] of moves) {
    const [x, y] = [at.left - sx, at.top - sy]; // held to the screen (onBoard)
    if (S.openId === id && S.openCard?.isConnected) by(S.openCard, x - parseFloat(pin.style.left), y - parseFloat(pin.style.top));
    pin.style.left = `${x}px`;
    pin.style.top = `${y}px`;
    pin.style.visibility = at.clipped && S.openId !== id ? 'hidden' : '';
  }
  if (S.draft?.anchor?.kind === 'board') {
    const pin = W.layer.querySelector('.pin.draft') as HTMLElement | null;
    if (pin) {
      const at = position(S.draft.anchor);
      const [dx, dy] = [at.left - scrollX - parseFloat(pin.style.left), at.top - scrollY - parseFloat(pin.style.top)];
      by(pin, dx, dy);
      by(W.layer.querySelector('.float:not(.out)') as HTMLElement | null, dx, dy);
    }
  }
  return true;
};
// The page's own pins under a board's view hide (position, anchoring.ts): as the page scrolls under a half view, or
// the view is dragged taller, only those that cross its edge are looked at again; nothing else is read or drawn.
const coverPins = () => {
  for (const [id, pin] of W.pinsById) {
    const info = W.pinData.get(pin);
    if (!info || info.c.anchor?.kind === 'board') continue;
    // A pin the browser holds has no place in its style: its spot is read (only in a half view, as it scrolls).
    const at = heldPin(pin) ? position(info.c.anchor || {}) : { left: parseFloat(pin.style.left), top: parseFloat(pin.style.top) };
    const covered = coveredAt(at.left - scrollX, at.top - scrollY);
    if (covered === Boolean(info.covered)) continue;
    info.covered = covered;
    pin.style.visibility = (covered || position(info.c.anchor || {}).clipped) && S.openId !== id ? 'hidden' : '';
  }
};
export function bindBoardCam(w: unknown) {
  W = w;
  S = W.S;
  // A board page (src/board/): a tap in comment mode puts a pin on the board (anchoring.ts asks the board where a point is
  // and where a pin sits), and the pins move with the camera.
  if (!S.board && self === top) {
    Object.assign(window, { __labBoardView: { show: showBoard } });
    const bn = /^#board=([a-z0-9][a-z0-9_-]*)/i.exec(location.hash)?.[1];
    if (bn) showBoard(bn, '', false);
  }
  Object.assign(window, { __labBoardWidget: { pinning: () => S.on, holding: () => S.on /* a phone's hold comments in either mode, as on a page */, hold: (x: number, y: number) => { if (S.draft || S.openId) W.closeOrNudge(); else W.begin(anchorAt(x, y)); }, place: (x: number, y: number) => (S.draft || S.openId ? W.closeOrNudge() : W.begin(anchorAt(x, y))), dismiss } });
  addEventListener('lab-board-moved', (e) => {
    const d = (e as CustomEvent).detail;
    if (!S.on) return;
    // The camera alone, or the page scrolling under a half view (its own pins scroll with it, the board's are held
    // to the screen): no redraw. With the view's box changing too, the page's pins it covers are hidden or shown.
    if (d?.camera && followCamera()) return void (d.box && coverPins());
    if (d?.scroll && !S.grabbing) return coverPins();
    S.moveFrame ||= requestAnimationFrame(() => ((S.moveFrame = 0), W.render()));
  });
}
