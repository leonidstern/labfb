// The message box of the chat, a thread and a new comment: the text, your name (once), the send arrow. Part of the
// comment widget (src/comments.js bundles it).

type Deps = {
  el: (tag: string, attrs?: Record<string, string>, text?: string) => HTMLElement;
  store: { get: (k: string) => string; set: (k: string, v: string) => void };
  root: ShadowRoot;
  refreshPinCursor: () => void;
  syncReads: () => void;
  rememberMe: (name: string) => void;
  /** Called as boxes fill and empty, so the page's own pointer can come back while you write. */
  whileWriting?: () => void;
};

// Set once by the widget at startup (bindComposer), so importing this module touches nothing.
let d: Deps;
export function bindComposer(deps: Deps) {
  d = deps;
}

import { holdReloads } from './hold.ts';

// Every box on the page that holds words nobody has sent. While there is one, a reload waits (hold.ts).
const writing = new Set<HTMLTextAreaElement>();
// Drafts whose words are on their way to the lab. A box rebuilt while one is in flight (the widget redraws as the
// comment lands) must not read them back in, and must not lose them either if the send fails.
const sending = new Set<string>();
/** True while any box on the page holds words nobody has sent. */
export const anyWriting = () => writing.size > 0;
const saysWriting = (field: HTMLTextAreaElement) => {
  if (field.value.trim()) writing.add(field);
  else writing.delete(field);
  holdReloads(writing.size);
  d?.whileWriting?.(); // the page's own pointer comes back while you are writing (comments.js)
};

// The send arrow is drawn with CSS (a stem and a chevron), no picture.
const ARROW = '<i class="arr" aria-hidden="true"></i>';

// One field that grows: a pill while empty, a box with a divider and the name row once you type.
// empty: what an empty box sends; nameFirst: the cursor goes to the name. Both for a go pin from someone with no name
// yet: the "go" is implied, only the name is missing (guests, Leo 16 Nov: go opened the full comment box).
export function composer({ placeholder, onSubmit, autofocus = false, empty = '', nameFirst = false, draftKey = '' }: {
  placeholder: string;
  onSubmit: (name: string, text: string) => Promise<unknown>;
  autofocus?: boolean;
  empty?: string;
  nameFirst?: boolean;
  /** Where to keep what is typed but not sent, so a page that reloads under you (a dev server rebuilding,
   *  a crash, a tab closed by mistake) does not take the words with it. Empty: not kept. */
  draftKey?: string;
}): HTMLElement {
  const { el, store, root, refreshPinCursor, syncReads, rememberMe } = d;
  const wrap = el('div', { class: 'composer' });
  const box = el('div', { class: 'box' });
  // No autofill or suggestion bar on phones: a comment isn't a form to fill.
  const text = el('textarea', { placeholder, maxlength: '2000', rows: '1', 'aria-label': placeholder, enterkeyhint: 'send', autocomplete: 'off', autocorrect: 'off', spellcheck: 'false', writingsuggestions: 'false' }) as HTMLTextAreaElement;
  const who = el('label', { class: 'who' });
  const as = el('span', {}, 'as');
  // Safari offers "AutoFill Contact" on anything that looks like a name, autocomplete="off" or not; a field whose name
  // says search it leaves alone.
  const name = el('input', { type: 'text', name: 'search-lab-who', placeholder: 'your name', maxlength: '60', enterkeyhint: 'send', autocomplete: 'off', autocorrect: 'off', autocapitalize: 'words', spellcheck: 'false', writingsuggestions: 'false', 'data-1p-ignore': '', 'data-lpignore': 'true' }) as HTMLInputElement;
  name.value = store.get('lab-name');
  // What was typed here last time and never sent. A dev server rebuilding the page used to wipe it.
  if (draftKey && !sending.has(draftKey)) {
    const kept = store.get(draftKey);
    if (kept) {
      text.value = kept;
      queueMicrotask(() => sync());
    }
  }
  const keepDraft = () => {
    if (draftKey) store.set(draftKey, text.value.trim() ? text.value : '');
  };
  const dropDraft = () => {
    writing.delete(text);
    holdReloads(writing.size);
    d?.whileWriting?.();
    if (draftKey) store.set(draftKey, '');
  };
  who.append(as, name);
  const sendBtn = el('button', { class: 'send', type: 'button', 'aria-label': 'send' });
  // Pressing send keeps the cursor in the box: on phones a blur first drops the keyboard, the sheet moves, and the
  // tap misses the button.
  sendBtn.addEventListener('pointerdown', (e) => e.preventDefault());
  sendBtn.addEventListener('mousedown', (e) => e.preventDefault());
  sendBtn.innerHTML = ARROW;
  const error = el('div', { class: 'error' });
  box.append(text, el('div', { class: 'line' }), who, sendBtn);
  wrap.append(box, error);
  // The box is taller than its one line of text: a tap anywhere on it (not the name or send) puts the cursor in, at the end.
  box.addEventListener('click', (e) => {
    if (e.target !== box && !(e.target as Element).classList?.contains('line')) return;
    text.focus({ preventScroll: true });
    text.setSelectionRange(text.value.length, text.value.length);
  });
  // A tap into a field without the cursor: put it there ourselves, without scrolling. Left to Safari, it scrolls the
  // page to show the field (170 px going from the text to the name, iOS 27 simulator), the sheet loses track of the
  // keyboard and drops behind it. A drag that starts on a field still scrolls.
  let start: { x: number; y: number } | null = null;
  for (const field of [text, name]) {
    field.addEventListener('touchstart', (e: TouchEvent) => (start = { x: e.touches[0].clientX, y: e.touches[0].clientY }), { passive: true });
    field.addEventListener('touchend', (e: TouchEvent) => {
      const t = e.changedTouches[0];
      const moved = !start || Math.hypot(t.clientX - start.x, t.clientY - start.y) > 10;
      if (moved || root.activeElement === field) return;
      e.preventDefault();
      field.focus({ preventScroll: true });
      field.setSelectionRange(field.value.length, field.value.length);
    }, { passive: false });
  }

  const sync = () => {
    const open = nameFirst || text.value.length > 0 || root.activeElement === name || !!error.textContent;
    // Opening moves the arrow from the text row to the name row: slide it there while the box grows, no jump.
    const glide = open !== box.classList.contains('open') && !store.get('lab-name') && box.isConnected && !matchMedia('(prefers-reduced-motion: reduce)').matches;
    const from = glide && { arrow: sendBtn.getBoundingClientRect(), height: box.getBoundingClientRect().height };
    const one = Boolean(store.get('lab-name'));
    box.classList.toggle('one', one);
    box.classList.toggle('open', open);
    as.hidden = !name.value.trim();
    if (one && !CSS.supports?.('field-sizing', 'content')) name.style.width = `${Math.max(2, name.value.length + 1)}ch`;
    sendBtn.classList.toggle('ready', Boolean((text.value.trim() || empty) && name.value.trim()));
    saysWriting(text); // a box built with words already in it (a kept draft, a redraw) counts too
    text.style.height = 'auto';
    text.style.height = `${text.scrollHeight}px`;
    if (glide) {
      const to = sendBtn.getBoundingClientRect();
      const timing = { duration: 220, easing: 'cubic-bezier(.2, .7, .3, 1)' };
      sendBtn.animate([{ transform: `translate(${from.arrow.left - to.left}px, ${from.arrow.top - to.top}px)` }, { transform: 'none' }], timing);
      box.style.overflow = 'hidden';
      box.animate([{ height: `${from.height}px` }, { height: `${box.getBoundingClientRect().height}px` }], timing).onfinish = () => (box.style.overflow = '');
    }
  };
  let busy = false;
  const go = async () => {
    if (busy) return;
    const said = text.value.trim() || empty;
    if (!said) return text.focus();
    if (!name.value.trim()) {
      box.classList.add('open');
      return name.focus();
    }
    store.set('lab-name', name.value.trim());
    rememberMe(name.value.trim()); // so the next lab on this computer knows you already
    refreshPinCursor(); // the pointer shows your initial
    syncReads();
    sendBtn.classList.remove('sent');
    void sendBtn.offsetWidth; // restart the arrow's flight on a quick second send
    sendBtn.classList.add('sent');
    busy = true;
    // The words are in flight: a box rebuilt while they are on their way leaves them alone, instead of reading
    // them back in as if they had never been sent.
    const words = text.value;
    if (draftKey) sending.add(draftKey);
    error.textContent = '';
    error.classList.remove('wait');
    // Taking a while (the lab is restarting): say so; it goes as soon as the lab is back.
    const slow = setTimeout(() => {
      error.textContent = 'sending… it goes as soon as the lab is back';
      error.classList.add('wait');
    }, 1500);
    try {
      const result = (await onSubmit(name.value.trim(), said)) as { keep?: boolean } | undefined;
      // It went: the kept draft goes with it.
      dropDraft();
      if (draftKey) sending.delete(draftKey);
      clearTimeout(slow);
      error.textContent = '';
      error.classList.remove('wait');
      if (result?.keep) {
        text.value = '';
        sync();
      }
    } catch (e) {
      clearTimeout(slow);
      error.classList.remove('wait');
      error.textContent = e.message;
      // It did not go: the words are yours again, kept as they were.
      if (draftKey) sending.delete(draftKey);
      text.value = words;
      keepDraft();
      sync();
    }
    busy = false;
  };
  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      go();
    }
  };
  text.addEventListener('input', sync);
  text.addEventListener('input', keepDraft);
  // A box taken off the page (a card closing, a redraw) lets go of its hold; its words are kept.
  new MutationObserver(() => {
    if (wrap.isConnected) return;
    writing.delete(text);
    holdReloads(writing.size);
    d?.whileWriting?.();
  }).observe(document.documentElement, { childList: true, subtree: true });
  name.addEventListener('input', sync);
  name.addEventListener('blur', () => setTimeout(sync, 0));
  text.addEventListener('keydown', onKey);
  name.addEventListener('keydown', onKey);
  // A tap sends on the first try. The arrow keeps the cursor in the box by preventing the default on
  // pointerdown, and a prevented pointerdown can swallow the click that follows on a phone — the tap then only
  // moved focus, the box went back to its one-line self, and it took a second tap to send (Leo, 16 Nov). So a
  // touch sends from touchend itself, and the click that may follow is ignored.
  let sentByTouch = 0;
  sendBtn.addEventListener('touchend', (e) => {
    e.preventDefault();
    sentByTouch = Date.now();
    go();
  }, { passive: false });
  sendBtn.addEventListener('click', () => {
    if (Date.now() - sentByTouch < 700) return; // the ghost click after a tap
    go();
  });
  // Keep focus in the field when the send button is pressed.
  sendBtn.addEventListener('mousedown', (e) => e.preventDefault());
  requestAnimationFrame(sync);
  // Right after it's on screen, in the same tap: phones open the keyboard only then.
  // preventScroll: the sheet is still sliding in from below the screen, and the page must not scroll to meet it.
  const first = nameFirst ? name : text;
  if (nameFirst) name.setAttribute('data-first', '');
  const focus = () => first.focus({ preventScroll: true });
  if (autofocus) queueMicrotask(() => (first.isConnected ? focus() : setTimeout(focus, 0)));
  return wrap;
}
