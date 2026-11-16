// The message box of the chat, a thread and a new comment: the text, your name (once), the send arrow. Part of the
// comment widget (src/comments.js bundles it).

type Deps = {
  el: (tag: string, attrs?: Record<string, string>, text?: string) => HTMLElement;
  store: { get: (k: string) => string; set: (k: string, v: string) => void };
  root: ShadowRoot;
  refreshPinCursor: () => void;
  syncReads: () => void;
};

// Set once by the widget at startup (bindComposer), so importing this module touches nothing.
let d: Deps;
export function bindComposer(deps: Deps) {
  d = deps;
}

// The send arrow is drawn with CSS (a stem and a chevron), no picture.
const ARROW = '<i class="arr" aria-hidden="true"></i>';

// One field that grows: a pill while empty, a box with a divider and the name row once you type.
export function composer({ placeholder, onSubmit, autofocus = false }: {
  placeholder: string;
  onSubmit: (name: string, text: string) => Promise<unknown>;
  autofocus?: boolean;
}): HTMLElement {
  const { el, store, root, refreshPinCursor, syncReads } = d;
  const wrap = el('div', { class: 'composer' });
  const box = el('div', { class: 'box' });
  // No autofill or suggestion bar on phones: a comment isn't a form to fill.
  const text = el('textarea', { placeholder, maxlength: '2000', rows: '1', 'aria-label': placeholder, enterkeyhint: 'send', autocomplete: 'off', autocorrect: 'off', spellcheck: 'false', writingsuggestions: 'false' }) as HTMLTextAreaElement;
  const who = el('label', { class: 'who' });
  const as = el('span', {}, 'as');
  const name = el('input', { type: 'text', placeholder: 'your name', maxlength: '60', enterkeyhint: 'send', autocomplete: 'off', autocorrect: 'off', autocapitalize: 'words', spellcheck: 'false', writingsuggestions: 'false', 'data-1p-ignore': '', 'data-lpignore': 'true' }) as HTMLInputElement;
  name.value = store.get('lab-name');
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

  const sync = () => {
    const open = text.value.length > 0 || root.activeElement === name || !!error.textContent;
    // Opening moves the arrow from the text row to the name row: slide it there while the box grows, no jump.
    const glide = open !== box.classList.contains('open') && !store.get('lab-name') && box.isConnected && !matchMedia('(prefers-reduced-motion: reduce)').matches;
    const from = glide && { arrow: sendBtn.getBoundingClientRect(), height: box.getBoundingClientRect().height };
    const one = Boolean(store.get('lab-name'));
    box.classList.toggle('one', one);
    box.classList.toggle('open', open);
    as.hidden = !name.value.trim();
    if (one && !CSS.supports?.('field-sizing', 'content')) name.style.width = `${Math.max(2, name.value.length + 1)}ch`;
    sendBtn.classList.toggle('ready', Boolean(text.value.trim() && name.value.trim()));
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
    if (!text.value.trim()) return text.focus();
    if (!name.value.trim()) {
      box.classList.add('open');
      return name.focus();
    }
    store.set('lab-name', name.value.trim());
    refreshPinCursor(); // the pointer shows your initial
    syncReads();
    sendBtn.classList.remove('sent');
    void sendBtn.offsetWidth; // restart the arrow's flight on a quick second send
    sendBtn.classList.add('sent');
    busy = true;
    error.textContent = '';
    error.classList.remove('wait');
    // Taking a while (the lab is restarting): say so; it goes as soon as the lab is back.
    const slow = setTimeout(() => {
      error.textContent = 'sending… it goes as soon as the lab is back';
      error.classList.add('wait');
    }, 1500);
    try {
      const result = (await onSubmit(name.value.trim(), text.value.trim())) as { keep?: boolean } | undefined;
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
  name.addEventListener('input', sync);
  name.addEventListener('blur', () => setTimeout(sync, 0));
  text.addEventListener('keydown', onKey);
  name.addEventListener('keydown', onKey);
  sendBtn.addEventListener('click', go);
  // Keep focus in the field when the send button is pressed.
  sendBtn.addEventListener('mousedown', (e) => e.preventDefault());
  requestAnimationFrame(sync);
  // Right after it's on screen, in the same tap: phones open the keyboard only then.
  // preventScroll: the sheet is still sliding in from below the screen, and the page must not scroll to meet it.
  const focus = () => text.focus({ preventScroll: true });
  if (autofocus) queueMicrotask(() => (text.isConnected ? focus() : setTimeout(focus, 0)));
  return wrap;
}
