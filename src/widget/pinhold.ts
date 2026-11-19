// Part of the comment widget (src/comments.js bundles it).
//
// Pins the browser holds (flag nativePins): a pin on an element of the page is tied to that element with CSS anchor
// positioning, so the browser keeps it on its spot through scrolling (the page, a box that scrolls, a sticky header, a
// parent that moves), and hides it while a box it is inside cuts its spot off. No script runs for that. The script still
// finds the spot (anchoring.ts, position) when the pins are drawn or the page changes size, and writes it here as an
// offset from the element's corner: on words, in a gap between two blocks, on an area or a share of the element alike.
//
// Two things make it reach the page:
// - the pin is fixed: an absolute pin's containing block is the widget's own host, which no element of the page is in;
// - its rule is in the page's style sheet, by ::part: anchor names given in the page are not seen from the shadow root.
// A browser without anchor positioning (or without position-visibility) keeps the pins the script places, as before.
let sheet: HTMLStyleElement | null = null;
const names = new WeakMap<Element, string>(); // an element's anchor name, kept while it lives
const rules = new Map<HTMLElement, string>(); // a held pin and its rule
let count = 0;
let dirty = false;
let able: boolean | null = null;
const can = () => (able ??= typeof CSS !== 'undefined' && CSS.supports('anchor-name: --a') && CSS.supports('position-visibility: anchors-visible'));
const px = (n: number) => `${Math.round(n * 100) / 100}px`;

/** Ties a pin to node, its spot at (left, top) in page coordinates. False, and the pin let go, when the script places it. */
export function holdPin(pin: HTMLElement, on: boolean, node: Element | null, left: number, top: number): boolean {
  // The page itself, or a big container placed by a share of its size, keeps the script's place (anchoring.ts, spotOf).
  if (!on || !node || !can() || /^(html|body|main)$/.test(node.localName) || pin.classList.contains('dragging')) {
    letPin(pin);
    return false;
  }
  let name = names.get(node);
  if (!name) names.set(node, (name = `lab${(++count).toString(36)}`));
  if (node.getAttribute('data-lab-anchor') !== name) node.setAttribute('data-lab-anchor', name); // put back after a live patch
  const part = pin.getAttribute('part') || `lp${(++count).toString(36)}`;
  pin.setAttribute('part', part);
  const r = node.getBoundingClientRect();
  const rule =
    `[data-lab-anchor="${name}"]{anchor-name:--${name}}` +
    `[data-lab-comments]::part(${part}){position:fixed!important;position-anchor:--${name};position-visibility:anchors-visible;` +
    `left:calc(anchor(left) + ${px(left - scrollX - r.left)})!important;top:calc(anchor(top) + ${px(top - scrollY - r.top)})!important}`;
  if (rules.get(pin) !== rule) (rules.set(pin, rule), (dirty = true));
  return true;
}

/** The script places this pin again (it is dragged, or it can't be held). */
export function letPin(pin: HTMLElement) {
  if (!rules.delete(pin)) return;
  pin.removeAttribute('part');
  dirty = true;
  flushPins();
}

/** Whether the browser holds this pin: a scroll needs nothing from the script for it. */
export const heldPin = (pin?: HTMLElement) => Boolean(pin && rules.has(pin));

/** Writes the rules once the pins are drawn; pins gone from the page let go of theirs. */
export function flushPins() {
  for (const pin of rules.keys()) if (!pin.isConnected) (rules.delete(pin), (dirty = true));
  if (!dirty) return;
  dirty = false;
  if (!sheet) sheet = Object.assign(document.createElement('style'), { id: 'lab-pinhold' });
  if (!sheet.isConnected) document.head.append(sheet);
  sheet.textContent = [...rules.values()].join('');
}
