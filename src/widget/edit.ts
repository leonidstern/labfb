// Editing words in place (flag editText, Leo 19 Nov): in select mode (select.ts, V or E) Enter or a double click on the
// picked block edits it where it is: plain text, typing replaces, a click puts the caret, a drag selects. Esc or Enter
// writes it into the project's file and steps out to the picked block, Tab saves and opens the next block, Cmd-Z puts it
// back. No dialog, no pin: the agent only hears of an edit when it is pinned or asked about. The lab does the writing
// (lib/edit.ts, POST /_lab/api/edit) and only when the old words are in exactly one place.
// Part of the comment widget (src/comments.js bundles it). Uses the widget's own parts through W, set once at startup.
import { bindSelect, hold, ink, pick, picked, selectMode, selectOn, step } from './select.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let W: any;
let live: { el: HTMLElement; node: Text; was: string } | null = null;
const call = (body: object) => fetch('/_lab/api/edit', { method: 'POST', headers: W.headers(), body: JSON.stringify(body) }).then((r) => r.json(), () => ({ ok: false, why: 'the lab did not answer' }));
// Pasted words come in as plain text, on one line.
const flat = (e: ClipboardEvent) => {
  e.preventDefault();
  document.execCommand('insertText', false, (e.clipboardData?.getData('text/plain') || '').replace(/\s+/g, ' '));
};
function start(el: HTMLElement, at?: MouseEvent) {
  const node = [...el.childNodes].find((n) => n.nodeType === 3 && (n as Text).data.trim()) as Text | undefined;
  if (!node) return;
  live = { el, node, was: el.textContent! };
  W.S.editing = true;
  pick(el);
  el.setAttribute('contenteditable', 'plaintext-only');
  if (el.contentEditable !== 'plaintext-only') el.contentEditable = 'true';
  el.setAttribute('data-lab-editing', '');
  el.focus({ preventScroll: true });
  const caret = at && (document.caretPositionFromPoint?.(at.clientX, at.clientY) || document.caretRangeFromPoint?.(at.clientX, at.clientY));
  const r = document.createRange();
  const c = caret as { offsetNode?: Node; offset?: number; startContainer?: Node; startOffset?: number } | null;
  if (c) r.setStart((c.offsetNode || c.startContainer)!, c.offset ?? c.startOffset!);
  else r.selectNodeContents(el);
  r.collapse(Boolean(caret));
  getSelection()!.removeAllRanges();
  getSelection()!.addRange(r);
  el.addEventListener('paste', flat);
  hold();
}
/** The words are written into the file (when they changed). */
async function commit() {
  if (!live) return;
  const { el, node, was } = live;
  live = null;
  const now = (el.textContent || '').replace(/\s+/g, ' ').trim();
  // The page's own text node goes back as it was, so a framework that redraws it finds what it expects.
  el.replaceChildren(node);
  node.data = was.trim() === now ? was : now;
  el.removeAttribute('contenteditable');
  el.removeAttribute('data-lab-editing');
  el.removeEventListener('paste', flat);
  W.S.editing = false;
  getSelection()?.removeAllRanges();
  pick(el);
  if (was.trim() === now) return;
  const text = el.parentElement?.textContent || '';
  const i = text.indexOf(now);
  const near = (a: number, b: number) => text.slice(Math.max(0, a), b).replace(/\s+/g, ' ');
  ink('lab-sent', el);
  const res = await call({ page: W.S.page, was, now, prefix: near(i - 40, i), suffix: near(i + now.length, i + now.length + 40) });
  ink('lab-sent', null);
  if (!res.ok) {
    node.data = was; // not written: the page says what the file says
    return W.say(`not saved: ${res.why}`);
  }
  ink('lab-kept', el);
  setTimeout(() => ink('lab-kept', null), 3000);
  W.say(`saved to ${res.edit.file}:${res.edit.line}`);
  W.placed.push(async () => {
    const r = await call({ undo: res.edit.id });
    if (!r.ok) {
      W.say(`not undone: ${r.why}`);
      return false;
    }
    if (node.isConnected) node.data = was;
    W.say('took back an edit');
  });
}
/** E: the mode on; with a block picked, that block opens; with none, the mode off. */
export function editKey() {
  const p = picked();
  if (!selectOn()) selectMode(true);
  else if (p) start(p);
  else selectMode(false);
}
export function bindEdit(w: unknown) {
  W = w;
  bindSelect(w, start, commit);
  W.fonts.textContent += '::highlight(lab-sent) { background-color: rgba(255, 214, 10, .4); color: inherit; } ::highlight(lab-kept) { background-color: rgba(52, 199, 89, .3); color: inherit; } [data-lab-editing] { outline: 1.5px solid rgba(120, 120, 128, .55); outline-offset: 2px; cursor: text !important; }';
  addEventListener('keydown', (e) => {
    if (!live || e.metaKey || e.ctrlKey || e.altKey) return;
    const stop = () => (e.preventDefault(), e.stopImmediatePropagation());
    if (e.key === 'Escape' || e.key === 'Enter') {
      stop();
      commit();
    } else if (e.key === 'Tab') {
      const to = step(e.shiftKey ? -1 : 1);
      stop();
      commit(); // saves in the background while the next block opens
      if (to) start(to);
    }
  }, true);
}
