// Part of the comment widget (src/comments.js bundles it).
//
// Pins the browser holds (flag native): a pin on an element of the page is tied to that element with CSS anchor
// positioning, so the browser keeps it on its spot through scrolling (the page, a box that scrolls, a sticky header, a
// parent that moves), and hides it while a box it is inside cuts its spot off. No script runs for that. The script still
// finds the spot (anchoring.ts, position) when the pins are drawn or the page changes size, and writes it here as an
// offset from the element's corner: on words, in a gap between two blocks, on an area or a share of the element alike.
//
// Two things make it reach the page:
// - the pin is fixed: an absolute pin's containing block is the widget's own host, which no element of the page is in;
// - its rule is in the page's style sheet, by ::part: anchor names given in the page are not seen from the shadow root.
// A browser without anchor positioning (or without position-visibility) keeps the pins the script places, as before.
// So does a pin on an element the page anchors to itself (its anchor-name would win over ours) or one inside an open
// dialog, popover or full screen (the top layer is laid out after the pin, so it can't be its anchor). An element whose
// anchor attribute a live patch took away parks its pins off screen (anchor()'s fallback) until they are placed again.
// Safari takes position-visibility but doesn't hide a pin whose spot a box cuts off (asked once, hidesClipped): there a
// pin inside a box that clips is placed by the script, which hides it; the others are held all the same.
let sheet: HTMLStyleElement | null = null;
const names = new WeakMap<Element, string>(); // an element's anchor name, kept while it lives
const rules = new Map<HTMLElement, string>(); // a held pin and its rule
const spots = new Map<HTMLElement, { name: string; node: Element }>(); // a held pin's element and its anchor name
const boxes = new Map<HTMLElement, string>(); // a card tied to the element its held pin is on, and its rule
// A card's places, in the page's sheet (tree-scoped names): where the script puts it, above or in from the screen's
// right edge when there is no room. --lab-cx / --lab-cy / --lab-ay: from the element's corner (thread.ts tieToPin).
const TRIES =
  '@position-try --lab-c-above{top:auto;bottom:calc(anchor(top) - var(--lab-ay))}' +
  '@position-try --lab-c-edge{left:auto;right:12px}' +
  '@position-try --lab-c-edge-above{left:auto;right:12px;top:auto;bottom:calc(anchor(top) - var(--lab-ay))}';
let count = 0;
let dirty = false;
let able: boolean | null = null;
let hides = false; // until the probe says so, a pin inside a box that clips is the script's
let again = () => {}; // places the pins again (comments.js): once the probe has answered yes
/** What places the pins again when the browser turns out to hide clipped ones. */
export const bindPinHold = (redraw: () => void) => (again = redraw);
const can = () => {
  if (able === null) {
    able = typeof CSS !== 'undefined' && CSS.supports('anchor-name: --a') && CSS.supports('position-visibility: anchors-visible');
    if (able) hidesClipped();
  }
  return able;
};
// Whether the browser really hides a fixed element whose anchor a box cuts off: a 4 px probe at the screen's corner,
// unseen and let through, tied to an anchor scrolled out of a 4 px box that scrolls. The browser decides at its next rendering
// update, so it is read two frames on: not found at that point, it is hidden.
function hidesClipped() {
  // As pins meet it: a box that scrolls (overflow auto), its anchor scrolled out of it.
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:0;top:0;width:4px;height:4px;overflow:auto;scrollbar-width:none;opacity:0;pointer-events:none;z-index:2147483647';
  box.append(Object.assign(document.createElement('div'), { style: 'height:4px;anchor-name:--lab-probe' }), Object.assign(document.createElement('div'), { style: 'height:80px' }));
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;width:4px;height:4px;opacity:0;z-index:2147483647;position-anchor:--lab-probe;position-visibility:anchors-visible;left:anchor(left);top:calc(anchor(top) + 40px)';
  document.body.append(box, probe);
  box.scrollTop = 40;
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const r = probe.getBoundingClientRect();
      const seen = document.elementFromPoint(1, 1) === probe;
      box.remove();
      probe.remove();
      hides = Math.abs(r.left) < 1 && Math.abs(r.top) < 1 && !seen;
      if (hides) again();
    }),
  );
}
// A box between the element and the page that cuts what overflows it.
const clips = (node: Element) => {
  for (let el = node.parentElement; el && el !== document.body && el !== document.documentElement; el = el.parentElement)
    if (getComputedStyle(el).overflow !== 'visible') return true;
  return false;
};
const px = (n: number) => `${Math.round(n * 100) / 100}px`;
const inTopLayer = (node: Element) => {
  try {
    return Boolean(node.closest('dialog[open], :popover-open, :fullscreen'));
  } catch {
    return true;
  }
};

/** Ties a pin to node, its spot at (left, top) in page coordinates. False, and the pin let go, when the script places it.
 *  share: the spot as a share of node's box instead (a board's frame, which the board's camera scales: anchor() reads the
 *  box as the camera shows it, so a share stays on the same point of the frame through any pan and zoom). */
export function holdPin(pin: HTMLElement, on: boolean, node: Element | null, left: number, top: number, share?: { x: number; y: number }): boolean {
  // The page itself, or a big container placed by a share of its size, keeps the script's place (anchoring.ts, spotOf).
  if (!on || !node || !can() || /^(html|body|main)$/.test(node.localName) || pin.classList.contains('dragging')) {
    letPin(pin);
    return false;
  }
  let name = names.get(node);
  if (!name) names.set(node, (name = `lab${(++count).toString(36)}`));
  const own = (getComputedStyle(node) as CSSStyleDeclaration & { anchorName?: string }).anchorName;
  if ((own && own !== 'none' && own !== `--${name}`) || inTopLayer(node) || (!hides && clips(node))) {
    letPin(pin);
    return false;
  }
  if (node.getAttribute('data-lab-anchor') !== name) node.setAttribute('data-lab-anchor', name); // put back after a live patch
  const part = pin.getAttribute('part') || `lp${(++count).toString(36)}`;
  pin.setAttribute('part', part);
  const r = node.getBoundingClientRect();
  const pct = (n: number) => `${Math.round(n * 10000) / 100}%`;
  const at = share
    ? `left:anchor(${pct(share.x)}, -10000px)!important;top:anchor(${pct(share.y)}, -10000px)!important`
    : `left:calc(anchor(left, -10000px) + ${px(left - scrollX - r.left)})!important;top:calc(anchor(top, -10000px) + ${px(top - scrollY - r.top)})!important`;
  const rule =
    `[data-lab-anchor="${name}"]{anchor-name:--${name}}` +
    `[data-lab-comments]::part(${part}){position:fixed!important;position-anchor:--${name};position-visibility:anchors-visible;${at}}`;
  if (rules.get(pin) !== rule) {
    rules.set(pin, rule);
    dirty = true;
  }
  spots.set(pin, { name, node });
  return true;
}

/** Ties a card to the element its pin is held on (not to the pin: anchor positioning reads a held pin's place from before
 *  the browser follows a scroll, so a card on the pin would trail by the scroll). The element, or null when the pin isn't
 *  held. Where on it: the card's --lab-cx / --lab-cy / --lab-ay (thread.ts tieToPin). */
export function holdBox(node: HTMLElement, pin: HTMLElement | null | undefined): Element | null {
  const at = pin && rules.has(pin) ? spots.get(pin) : null;
  if (!at) {
    letBox(node);
    return null;
  }
  const part = node.getAttribute('part') || `lb${(++count).toString(36)}`;
  node.setAttribute('part', part);
  const rule =
    `[data-lab-comments]::part(${part}){position:fixed;position-anchor:--${at.name};` +
    'left:max(12px,calc(anchor(left, -10000px) + var(--lab-cx)));top:calc(anchor(top, -10000px) + var(--lab-cy));' +
    'position-try-fallbacks:--lab-c-above,--lab-c-edge,--lab-c-edge-above}';
  if (boxes.get(node) !== rule) {
    boxes.set(node, rule);
    dirty = true;
  }
  return at.node;
}

/** The card is placed another way again (in the margin, a sheet, untied). */
export function letBox(node: HTMLElement) {
  if (!boxes.delete(node)) return;
  node.removeAttribute('part');
  dirty = true;
}

/** The script places this pin again (it is dragged, or it can't be held). */
export function letPin(pin: HTMLElement) {
  spots.delete(pin);
  if (!rules.delete(pin)) return;
  pin.removeAttribute('part');
  dirty = true;
  flushPins();
}

/** Whether the browser holds this pin: a scroll needs nothing from the script for it. */
export const heldPin = (pin?: HTMLElement) => Boolean(pin && rules.has(pin));

/** Writes the rules once the pins are drawn; pins gone from the page let go of theirs. */
export function flushPins() {
  for (const map of [rules, boxes])
    for (const node of map.keys()) {
      if (node.isConnected) continue;
      map.delete(node);
      dirty = true;
    }
  if (!dirty) return;
  dirty = false;
  if (!sheet) sheet = Object.assign(document.createElement('style'), { id: 'lab-pinhold' });
  if (!sheet.isConnected) document.head.append(sheet);
  sheet.textContent = (boxes.size ? TRIES : '') + [...rules.values(), ...boxes.values()].join('');
}
