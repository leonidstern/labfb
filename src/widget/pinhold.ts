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
// So does a pin on an element the page anchors to itself (its anchor-name would win over ours) or one inside an open
// dialog, popover or full screen (the top layer is laid out after the pin, so it can't be its anchor). An element whose
// anchor attribute a live patch took away parks its pins off screen (anchor()'s fallback) until they are placed again.
// Safari takes position-visibility but doesn't hide a pin whose spot a box cuts off (asked once, hidesClipped): there a
// pin inside a box that clips is placed by the script, which hides it; the others are held all the same.
let sheet: HTMLStyleElement | null = null;
const names = new WeakMap<Element, string>(); // an element's anchor name, kept while it lives
const rules = new Map<HTMLElement, string>(); // a held pin and its rule
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
// unseen and let through, tied to an anchor scrolled out of a 4 px box. The browser decides at its next rendering
// update, so it is read two frames on: not found at that point, it is hidden.
function hidesClipped() {
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:0;top:0;width:4px;height:4px;overflow:hidden;opacity:0;pointer-events:none;z-index:2147483647';
  box.append(Object.assign(document.createElement('div'), { style: 'margin-top:40px;height:4px;anchor-name:--lab-probe' }));
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;width:4px;height:4px;opacity:0;z-index:2147483647;position-anchor:--lab-probe;position-visibility:anchors-visible;left:anchor(left);top:calc(anchor(top) - 40px)';
  document.body.append(box, probe);
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

/** Ties a pin to node, its spot at (left, top) in page coordinates. False, and the pin let go, when the script places it. */
export function holdPin(pin: HTMLElement, on: boolean, node: Element | null, left: number, top: number): boolean {
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
  const rule =
    `[data-lab-anchor="${name}"]{anchor-name:--${name}}` +
    `[data-lab-comments]::part(${part}){position:fixed!important;position-anchor:--${name};position-visibility:anchors-visible;` +
    `left:calc(anchor(left, -10000px) + ${px(left - scrollX - r.left)})!important;top:calc(anchor(top, -10000px) + ${px(top - scrollY - r.top)})!important}`;
  if (rules.get(pin) !== rule) {
    rules.set(pin, rule);
    dirty = true;
  }
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
  for (const pin of rules.keys()) {
    if (pin.isConnected) continue;
    rules.delete(pin);
    dirty = true;
  }
  if (!dirty) return;
  dirty = false;
  if (!sheet) sheet = Object.assign(document.createElement('style'), { id: 'lab-pinhold' });
  if (!sheet.isConnected) document.head.append(sheet);
  sheet.textContent = [...rules.values()].join('');
}
