// A page inside a board's frame (the board names the iframe "lab:<id>" and sets top.__labBoard): it draws nothing and
// binds nothing. No bar, no pill, no pins, no menu, no listeners of the widget's own. The board is the one widget.
// What it keeps: the page's live updates (a save patches or reloads this frame, never the board), reading the lab's
// state from the board's stream and not opening its own, and a way to pass keys on to the board.
import { bindLive, startLive } from './live.ts';

/** True in a board's frame: the name the board gave it, and a board on top (the name alone could be anyone's frame). */
export const inFrame = (): boolean => {
  try {
    return window.name.startsWith('lab:') && Boolean((top as unknown as { __labBoard?: unknown }).__labBoard);
  } catch {
    return false;
  }
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Board = { busy?: () => boolean; key?: (k: Record<string, unknown>) => void } & Record<string, any>;

export function startFrame(script: HTMLScriptElement | null) {
  const board = () => (top as unknown as { __labBoard: Board }).__labBoard;
  // live.ts runs on this: what it touches of the widget is a detached stand-in that is never put on the page.
  const host = document.createElement('div');
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = '<div class="left"></div><button class="chat-btn"></button><button class="list-btn"></button>';
  const none = () => {};
  const S = { page: script?.dataset.page || location.pathname.replace(/\/+$/, '') || '/', frame: window.name, busy: () => Boolean(board()?.busy?.()) };
  bindLive({
    S, script, host, root, coarse: false, fonts: null, pinCursorStyle: null, still: matchMedia('(prefers-reduced-motion: reduce)'), tabTitle: { base: '' },
    chatBtn: root.querySelector('.chat-btn'), listBtn: root.querySelector('.list-btn'),
    drawList: none, reflow: none, load: none, loadChanges: none, syncReads: none,
  });
  startLive();
  // What the board may ask of this page (the rest of the bridge comes with the pins).
  Object.assign(window, { __labSpot: { clear: () => getSelection()?.removeAllRanges() } });
  // A key heard here goes to the board unless the page used it or is typing in it: the board's keys work in a focused frame.
  addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement | null;
    if (e.defaultPrevented || t?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t?.tagName || '')) return;
    board()?.key?.({ key: e.key, code: e.code, shiftKey: e.shiftKey, metaKey: e.metaKey, ctrlKey: e.ctrlKey, altKey: e.altKey, repeat: e.repeat });
  });
}
