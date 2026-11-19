// Where a pin points: the element, words, picture pixel, code line or video second under it, and how to find
// that spot again when the page changes. Part of the comment widget (src/comments.js bundles it).
import { GENERATED } from '../../lib/ids.ts';

/** Words a pin quotes, with what comes before and after so they can be found again. */
type Quote = {
  exact: string;
  prefix: string;
  suffix: string;
  /** In code: the whole line, its number in the block and on the page, and the block's label. */
  line?: string;
  lineNo?: number;
  pageLineNo?: number;
  lines?: number;
  label?: string;
};

/** Everything a pin remembers about its spot. Saved with the comment and read by agents. */
type Anchor = {
  selector: string;
  /** The nearest element with an id around the spot, so an agent knows the block a pin is on. */
  block?: string;
  /** Where in the element, as shares of its width and height. */
  x: number;
  y: number;
  /** Where on the page, and the window it was seen in. */
  docX: number;
  docY: number;
  width: number;
  height: number;
  dpr: number;
  /** The element's opening tag, and its height then. */
  element: string;
  eh: number;
  kind?: string;
  text?: string;
  inside?: string;
  section?: string;
  shadow?: string;
  component?: string;
  source?: string;
  looks?: string;
  chosen?: string;
  cssText?: string;
  quote?: Quote;
  /** Pictures and video: the file, the pixel in its natural size, the second. */
  src?: string;
  alt?: string;
  file?: string;
  nw?: number;
  nh?: number;
  imgX?: number;
  imgY?: number;
  time?: number;
  /** The page's videos and animations were paused when this was written. */
  paused?: boolean;
  /** Then: the moment showing, in ms. */
  atMs?: number;
  /** The page's motion ran at ¼ speed. */
  slow?: boolean;
  duration?: number;
  transform?: string;
  /** An area dragged out, and what was inside it. */
  zoneItems?: string[];
  zoneText?: string;
  shownFor?: number;
  build?: string;
};

/** A rectangle on the page, in document pixels. */
type Box = { left: number; top: number; width: number; height: number };

/** Where a pin shows: its point, the area it marks (if any), and whether its spot changed. */
type Spot = { left: number; top: number; zone: Box | null; moved?: boolean };

type Deps = {
  host: HTMLElement;
  layer: HTMLElement;
  el: (tag: string, attrs?: Record<string, string>, text?: string) => HTMLElement;
};

// Set once by the widget at startup (bindAnchoring), so importing this module touches nothing.
let host: Deps['host'], layer: Deps['layer'], el: Deps['el'];
export function bindAnchoring(deps: Deps) {
  ({ host, layer, el } = deps);
}

// A motion token (--_t-quick, -base, -slow, -loop, -hold, styles.css) in milliseconds, times `times`: for a timer or a
// Web Animation, which can't read a var(). It is 0 under reduced motion, as the CSS durations are (hold excepted).
export function ms(token: 'instant' | 'quick' | 'base' | 'slow' | 'loop' | 'hold', times = 1): number {
  const v = /^\s*(-?[\d.]+)(m?s)\s*$/.exec(getComputedStyle(host).getPropertyValue(`--_t-${token}`));
  return v ? parseFloat(v[1]) * (v[2] === 's' ? 1000 : 1) * times : 0;
}

// A motion curve (--_ease, -out, -in, -settle, -pop) for a Web Animation's `easing`, which can't read a var() either.
export const ease = (curve: '' | 'out' | 'in' | 'settle' | 'pop' = ''): string =>
  getComputedStyle(host).getPropertyValue(`--_ease${curve && `-${curve}`}`).trim() || 'linear';

// Ids and classes a framework or build makes up (lib/ids.ts) say nothing about which element it is.
const generated = (v) => GENERATED.test(v || '');
// Names a page gives an element for tests or for comments: the most lasting way to find it again.
const NAMED = ['data-testid', 'data-lab', 'data-comment-target'];

function selectorFor(node) {
  const parts = [];
  while (node && node.nodeType === 1 && node !== document.body && node !== document.documentElement) {
    const name = NAMED.find((a) => node.getAttribute(a));
    const named = name && `[${name}="${CSS.escape(node.getAttribute(name))}"]`;
    if (named && document.querySelectorAll(named).length === 1) {
      parts.unshift(named);
      break;
    }
    if (node.id && !generated(node.id) && document.querySelectorAll(`#${CSS.escape(node.id)}`).length === 1) {
      parts.unshift(`#${CSS.escape(node.id)}`);
      break;
    }
    const tag = node.localName;
    let index = 1;
    for (let sib = node.previousElementSibling; sib; sib = sib.previousElementSibling) if (sib.localName === tag) index++;
    parts.unshift(`${tag}:nth-of-type(${index})`);
    node = node.parentElement;
  }
  return parts.length ? (/^[#[]/.test(parts[0]) ? '' : 'body > ') + parts.join(' > ') : 'body';
}

const docWidth = () => Math.max(document.documentElement.scrollWidth, 1);

const clamp01 = (v) => Math.min(Math.max(v, 0), 1);
export const short = (v, n) => (v || '').replace(/\s+/g, ' ').trim().slice(0, n);

// A source-file hint from a (possibly proxied, hashed or optimised) image URL: "hero-1" from
// /_astro/hero-1.Bx3kd9_Z.webp, /_image?href=..., /_vercel/image?url=..., /media/<id>/w800.webp.
function fileHint(url) {
  if (!url || url.startsWith('data:')) return '';
  try {
    const u = new URL(url, location.href);
    const inner = u.searchParams.get('href') || u.searchParams.get('url');
    if (inner && /\/_(image|vercel\/image|next\/image)/.test(u.pathname)) return fileHint(inner);
    const parts = u.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    let name = parts.pop() || '';
    if (/^w?\d+(x\d+)?\.\w+$/i.test(name) && parts.length) name = parts.pop();
    return name.replace(/\.(avif|webp|jpe?g|png|gif|svg|mp4|webm|mov)$/i, '').replace(/[._-][A-Za-z0-9_-]{8}$/, '');
  } catch {
    return '';
  }
}

const mediaSrc = (m) => {
  const src = m.currentSrc || m.getAttribute('src') || '';
  if (src && !src.startsWith('data:')) return new URL(src, location.href).href;
  const lazy = m.dataset?.src || (m.getAttribute('srcset') || m.dataset?.srcset || '').split(/\s+/)[0];
  return lazy ? new URL(lazy, location.href).href : '';
};

// Where the click is inside the original image/video, taking object-fit and object-position into account.
function naturalSpot(m, rect, cx, cy, nw, nh) {
  if (!nw || !nh || !rect.width || !rect.height) return null;
  const cs = getComputedStyle(m);
  const fit = cs.objectFit || 'fill';
  const pos = (cs.objectPosition || '50% 50%').split(/\s+/).map((v) =>
    v.endsWith('%') ? parseFloat(v) / 100 : { left: 0, top: 0, right: 1, bottom: 1 }[v] ?? 0.5,
  );
  const sx = rect.width / nw;
  const sy = rect.height / nh;
  const scale = { cover: Math.max(sx, sy), contain: Math.min(sx, sy), none: 1, 'scale-down': Math.min(1, sx, sy) }[fit];
  const dw = nw * (scale ?? sx);
  const dh = nh * (scale ?? sy);
  const ox = (rect.width - dw) * (pos[0] ?? 0.5);
  const oy = (rect.height - dh) * (pos[1] ?? pos[0] ?? 0.5);
  return { fit, nw, nh, imgX: clamp01((cx - rect.left - ox) / dw), imgY: clamp01((cy - rect.top - oy) / dh) };
}

// The picture file's own size. With srcset, naturalWidth is the size in CSS pixels, not the file's: read the width
// descriptor of the candidate the browser picked ("photo-1600.jpg 1600w"), or scale by its density ("2x").
function fileSize(img) {
  let nw = img.naturalWidth;
  let nh = img.naturalHeight;
  const sets = [img.srcset, ...[...(img.closest('picture')?.querySelectorAll('source') || [])].map((s) => s.srcset)].filter(Boolean);
  for (const set of sets) {
    for (const part of set.split(/,\s+/)) {
      const [url, d = '1x'] = part.trim().split(/\s+/);
      let abs = '';
      try {
        abs = new URL(url, location.href).href;
      } catch {}
      if (!url || abs !== img.currentSrc || !nw) continue;
      const v = parseFloat(d);
      if (d.endsWith('w') && v) return { nw: Math.round(v), nh: Math.round((v * nh) / nw) };
      if (d.endsWith('x') && v) return { nw: Math.round(nw * v), nh: Math.round(nh * v) };
    }
  }
  return { nw, nh };
}

// Which component drew an element and where, from a framework's dev build (React, Vue 3, Svelte); production
// builds keep none of it. A small cut of Census's reader (github.com/leonidstern/census).
const PLAIN_NAME = /^[A-Z][A-Za-z0-9]{2,}$/;
const PLUMBING = /(Provider|Context|Consumer|Boundary|Slot|Portal|Fragment|Presence|Scope|Trap|Root)$/;
const variantOf = (p) =>
  ['variant', 'size', 'tone', 'intent', 'kind']
    .flatMap((k) => ((typeof p?.[k] === 'string' || typeof p?.[k] === 'number') && /^[\w.-]{1,20}$/.test(String(p[k])) ? [`${k}=${p[k]}`] : []))
    .join(' ');
// A served module's address as a repo path: Vite serves /src/x.tsx, webpack and Next say webpack-internal:///./src/x.tsx.
const repoPath = (url) => !/^[a-z-]+:\/\//i.test(url) ? url : decodeURIComponent(url.replace(/^[a-z-]+:\/\/\/?(\.\/)?/i, '/').replace(/^\/[^/]*:\d+/, '').split('?')[0]).replace(/^\/(@fs)?/, '').replace(/^\(app-pages-browser\)\/\.?\/?/, '');
function componentAt(el) {
  const name = (t, d = 0) => (d > 3 ? '' : typeof t === 'function' ? t.displayName || t.name || '' : t && typeof t === 'object' ? t.displayName || name(t.render || t.type, d + 1) : '');
  const plain = (n) => PLAIN_NAME.test(n) && !PLUMBING.test(n);
  // React 18 writes the JSX's file and line; React 19 only the stack where the element was made.
  const srcOf = (f) => {
    const d = f?._debugSource;
    if (d?.fileName) return `${repoPath(String(d.fileName))}:${d.lineNumber || 0}`;
    const st = f?._debugStack?.stack;
    if (typeof st !== 'string') return '';
    for (const line of st.split('\n').slice(1)) {
      const m = /((?:https?|webpack-internal|file):\/\/[^\s()]+?):(\d+):\d+\)?\s*$/.exec(line);
      if (m && !/node_modules|react-dom|react-jsx|jsx-dev-runtime|react-server|scheduler/.test(m[1])) return `${repoPath(m[1])} (line ${m[2]} as served, may differ from the source)`;
    }
    return '';
  };
  const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
  if (key) {
    const host = el[key];
    const parts = [];
    let usedAt = '';
    // Up through the plain elements around it (a <span> in a <td> in a <tr>…) to the component that rendered it.
    for (let f = host?.return, i = 0; f && parts.length < 2 && i < 80; f = f.return, i++) {
      if (typeof f.type === 'string') continue;
      const n = name(f.type);
      if (!plain(n)) continue;
      if (!parts.length) usedAt = srcOf(f);
      const v = variantOf(f.memoizedProps);
      parts.push(v ? `${n} ${v}` : n);
    }
    if (!parts.length) return srcOf(host) ? { source: srcOf(host) } : {};
    return { component: parts.length > 1 ? `${parts[0]} (in ${parts[1]})` : parts[0], source: srcOf(host) || undefined, usedAt: usedAt || undefined };
  }
  const vue = el.__vueParentComponent;
  if (vue?.type) {
    const n = vue.type.name || vue.type.__name || (vue.type.__file || '').replace(/^.*\//, '').replace(/\.vue$/, '');
    const parent = vue.parent?.type;
    const pn = parent && (parent.name || parent.__name);
    const v = variantOf(vue.props);
    return { component: `${n}${v ? ' ' + v : ''}${pn ? ` (in ${pn})` : ''}`, source: vue.type.__file ? repoPath(vue.type.__file) : undefined, usedAt: parent?.__file ? repoPath(parent.__file) : undefined };
  }
  const loc = el.__svelte_meta?.loc;
  if (loc?.file) return { component: loc.file.replace(/^.*\//, '').replace(/\.svelte$/, ''), source: `${repoPath(loc.file)}:${loc.line ?? 0}` };
  return {};
}

// How the element looks: fill, text colour, size and weight, corners. A colour that a CSS variable on :root
// holds is named by it (the page's own tokens).
function looksOf(el) {
  const cs = getComputedStyle(el);
  const names = new Map();
  // A variable that isn't a colour (a radius, a gap) leaves the probe with its parent's colour, one no page uses:
  // those are skipped, so "--radius-sm" never names a text colour.
  const NONE = 'rgb(1, 2, 3)';
  const wrap = document.createElement('i');
  wrap.style.cssText = `display:none;color:${NONE}`;
  const probe = wrap.appendChild(document.createElement('i'));
  document.body.append(wrap);
  for (const prop of [...getComputedStyle(document.documentElement)].filter((p) => p.startsWith('--')).slice(0, 400)) {
    probe.style.color = '';
    probe.style.color = `var(${prop})`;
    const v = getComputedStyle(probe).color;
    if (v && v !== NONE && !names.has(v)) names.set(v, prop);
  }
  wrap.remove();
  const say = (v) => (names.has(v) ? `${names.get(v)} ${v}` : v);
  const out = [];
  if (!/^(transparent|rgba\(0, 0, 0, 0\))$/.test(cs.backgroundColor)) out.push(`fill ${say(cs.backgroundColor)}`);
  out.push(`text ${say(cs.color)} ${cs.fontSize}/${cs.fontWeight}`);
  if (parseFloat(cs.borderTopLeftRadius)) out.push(`radius ${cs.borderTopLeftRadius}`);
  return short(out.join(', '), 200);
}

// A point on an element turned, scaled or skewed by its own CSS transform, in the element's untransformed box.
function untransform(el, cx, cy) {
  const t = getComputedStyle(el).transform;
  if (!t || t === 'none') return null;
  const m = new DOMMatrix(t);
  if (m.isIdentity) return null;
  const w = el.offsetWidth || el.getBoundingClientRect().width;
  const h = el.offsetHeight || el.getBoundingClientRect().height;
  const [ox, oy] = getComputedStyle(el).transformOrigin.split(' ').map(parseFloat);
  const at = (x, y) => m.transformPoint(new DOMPoint(x - ox, y - oy));
  const corners = [at(0, 0), at(w, 0), at(0, h), at(w, h)];
  const r = el.getBoundingClientRect();
  // Where the transform origin is on screen: the drawn box's top left, minus how far the corners reach.
  const origin = { x: r.left - Math.min(...corners.map((p) => p.x)), y: r.top - Math.min(...corners.map((p) => p.y)) };
  const q = m.inverse().transformPoint(new DOMPoint(cx - origin.x, cy - origin.y));
  return { rect: { left: 0, top: 0, width: w, height: h }, x: q.x + ox, y: q.y + oy };
}

// A picture inside an SVG (<image>): its file size, and preserveAspectRatio (default: fit inside, centred).
function svgImageSpot(el, anchor, cx, cy) {
  const r = el.getBoundingClientRect();
  const keep = (el.getAttribute('preserveAspectRatio') || 'xMidYMid meet').split(/\s+/);
  const fill = (iw, ih) => {
    if (!iw || !ih || !r.width || !r.height) return;
    let [dw, dh] = [r.width, r.height];
    if (keep[0] !== 'none') {
      const k = (keep[1] === 'slice' ? Math.max : Math.min)(r.width / iw, r.height / ih);
      [dw, dh] = [iw * k, ih * k];
    }
    const align = (v, room) => (v === 'Min' ? 0 : v === 'Max' ? room : room / 2);
    const ox = keep[0] === 'none' ? 0 : align(keep[0].slice(1, 4), r.width - dw);
    const oy = keep[0] === 'none' ? 0 : align(keep[0].slice(5, 8), r.height - dh);
    Object.assign(anchor, { nw: iw, nh: ih, imgX: clamp01((cx - r.left - ox) / dw), imgY: clamp01((cy - r.top - oy) / dh) });
  };
  const probe = new Image();
  probe.onload = () => fill(probe.naturalWidth, probe.naturalHeight);
  probe.src = anchor.src;
  if (probe.complete) fill(probe.naturalWidth, probe.naturalHeight);
}

// Where the click is inside a CSS background picture: its file size (loaded once, usually from the cache),
// background-size (cover, contain, auto, lengths) and background-position. Fills the anchor when known.
function backgroundSpot(n, url, anchor, cx, cy) {
  const r = n.getBoundingClientRect();
  const cs = getComputedStyle(n);
  // Layers are comma lists (a gradient on top of the photo is common): use the photo's own layer.
  const layers = (v) => v.split(/,(?![^(]*\))/).map((x) => x.trim());
  const at = Math.max(0, layers(cs.backgroundImage).findIndex((l) => l.includes(url)));
  const pick = (v) => {
    const l = layers(v);
    return l[at % l.length];
  };
  const fill = (iw, ih) => {
    if (!iw || !ih || !r.width || !r.height) return;
    const size = pick(cs.backgroundSize);
    let dw = iw;
    let dh = ih;
    if (size === 'cover' || size === 'contain') {
      const k = (size === 'cover' ? Math.max : Math.min)(r.width / iw, r.height / ih);
      dw = iw * k;
      dh = ih * k;
    } else if (size !== 'auto' && size !== 'auto auto') {
      const [w, h = 'auto'] = size.split(/\s+/);
      const len = (v, of) => (v.endsWith('%') ? (parseFloat(v) / 100) * of : parseFloat(v));
      dw = w === 'auto' ? NaN : len(w, r.width);
      dh = h === 'auto' ? NaN : len(h, r.height);
      if (Number.isNaN(dw) && Number.isNaN(dh)) [dw, dh] = [iw, ih];
      else if (Number.isNaN(dw)) dw = (dh * iw) / ih;
      else if (Number.isNaN(dh)) dh = (dw * ih) / iw;
    }
    const [px = '50%', py = '50%'] = pick(cs.backgroundPosition).split(/\s+/);
    const off = (v, room) => (v.endsWith('%') ? (parseFloat(v) / 100) * room : parseFloat(v) || 0);
    const ox = off(px, r.width - dw);
    const oy = off(py, r.height - dh);
    Object.assign(anchor, { nw: iw, nh: ih, fit: `background ${size}`, imgX: clamp01((cx - r.left - ox) / dw), imgY: clamp01((cy - r.top - oy) / dh) });
  };
  const probe = new Image();
  probe.onload = () => fill(probe.naturalWidth, probe.naturalHeight);
  probe.src = url;
  if (probe.complete) fill(probe.naturalWidth, probe.naturalHeight);
}

// A click on empty space: the blocks just above and below it inside the element, by heading or first words.
function between(target, cy) {
  const kids = [...target.children].filter((k) => k !== host && k.getBoundingClientRect().height > 0);
  let above = null;
  let below = null;
  for (const k of kids) {
    const kr = k.getBoundingClientRect();
    if (kr.bottom <= cy) above = k;
    else if (kr.top >= cy && !below) below = k;
    else if (kr.top < cy && kr.bottom > cy) return null; // inside a block, not between two
  }
  const say = (k) => (k ? short(`${openingTag(k)} "${blockWords(k)}"`, 160) : undefined);
  return above || below ? { above: say(above), below: say(below) } : null;
}
// What a block is called there: its heading, else its first words.
const blockWords = (k) => short((k.matches('h1, h2, h3, h4, h5, h6') ? k : k.querySelector('h1, h2, h3, h4, h5, h6') || k).textContent, 60);
// A pin in the space between two blocks (gapAbove / gapBelow name them; none: the box's own top or end) stays between
// them: where it was put while that is still between them, else the nearest point that is. Among look-alikes the pair
// nearest to where it was put; next to the one that is left when the other is gone; null when both are.
function gapTop(anchor, node, rect) {
  const kids = [...node.children].filter((k) => k !== host && k.getBoundingClientRect().height > 0);
  const is = (k, said) => (said ? k && sameKind(k, said) && blockWords(k).startsWith((said.split('> "')[1] || '').replace(/"$/, '')) : !k);
  const put = rect.top + anchor.y * rect.height;
  let best = null;
  let near = Infinity;
  for (let i = 0; i <= kids.length; i++) {
    const [above, below] = [is(kids[i - 1], anchor.gapAbove), is(kids[i], anchor.gapBelow)];
    if (!above && !below) continue;
    // Past the last block (its neighbour above is gone, none below): the box's end, not a block that isn't there.
    const lo = above ? (kids[i - 1]?.getBoundingClientRect().bottom ?? rect.top) : (kids[i]?.getBoundingClientRect().top ?? rect.bottom) - 16;
    const hi = below ? (kids[i]?.getBoundingClientRect().top ?? rect.bottom) : lo + 16;
    const top = Math.min(Math.max(put, lo), Math.max(lo, hi));
    const far = Math.abs(top - put) + (above && below ? 0 : 1e6); // both neighbours beat one
    if (far < near) [best, near] = [top, far];
  }
  return best;
}

// Light or dark where the pin is: the first background colour behind it that isn't transparent.
function schemeAt(target) {
  for (let n = target; n; n = n.parentElement) {
    const m = getComputedStyle(n).backgroundColor.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/);
    if (!m || (m[4] !== undefined && parseFloat(m[4]) < 0.5)) continue;
    const [r, g, b] = [m[1], m[2], m[3]].map(Number);
    const hex = '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
    return { scheme: 0.2126 * r + 0.7152 * g + 0.0722 * b < 128 ? 'dark' : 'light', background: hex };
  }
  return { scheme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light' };
}

// The word under the click plus ~40 characters either side, so an agent can grep the source.
function quoteAt(cx, cy, shadowRoots = []) {
  let node = null;
  let offset = 0;
  if (document.caretPositionFromPoint) {
    // Open shadow roots under the click are passed in, so text inside a web component is found too.
    const p = shadowRoots.length ? document.caretPositionFromPoint(cx, cy, { shadowRoots }) : document.caretPositionFromPoint(cx, cy);
    if (p) {
      node = p.offsetNode;
      offset = p.offset;
    }
  } else if (document.caretRangeFromPoint) {
    const r = document.caretRangeFromPoint(cx, cy);
    if (r) {
      node = r.startContainer;
      offset = r.startOffset;
    }
  }
  if (!node || node.nodeType !== 3 || !node.data.trim()) return null;
  // Only when the click is really on the text, not in empty space next to it.
  const range = document.createRange();
  range.selectNodeContents(node);
  const hit = [...range.getClientRects()].some((r) => cx >= r.left - 4 && cx <= r.right + 4 && cy >= r.top - 4 && cy <= r.bottom + 4);
  if (!hit) return null;
  const text = node.data;
  let a = offset;
  let b = offset;
  // Chinese, Japanese, Korean and Thai don't put spaces between words: ask the browser where the word is.
  const seg = /[\u0e00-\u0e7f\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af\uf900-\ufaff]/.test(text) && typeof Intl !== 'undefined' && Intl.Segmenter
    ? new Intl.Segmenter(node.parentElement?.closest('[lang]')?.lang || undefined, { granularity: 'word' })
    : null;
  if (seg) {
    for (const w of seg.segment(text)) {
      if (offset >= w.index && offset <= w.index + w.segment.length && w.segment.trim()) {
        a = w.index;
        b = w.index + w.segment.length;
        if (offset < b) break;
      }
    }
  } else {
    while (a > 0 && /\S/.test(text[a - 1])) a--;
    while (b < text.length && /\S/.test(text[b])) b++;
  }
  const block = node.parentElement?.closest('p, li, h1, h2, h3, h4, h5, h6, td, th, figcaption, blockquote, a, button, label, span, div') || node.parentElement;
  const full = block?.textContent || text;
  const before = full.slice(0, full.indexOf(text) + a);
  const after = full.slice(full.indexOf(text) + b);
  const squash = (v) => v.replace(/\s+/g, ' ');
  const quote: Quote = {
    exact: short(text.slice(a, b), 80),
    prefix: squash(before.slice(-80)).replace(/^\s+/, '').slice(-40),
    suffix: squash(after.slice(0, 80)).replace(/\s+$/, '').slice(0, 40),
  };
  // Code (or any preformatted text): the whole line, its number in the block, and the block's label
  // (a figcaption, data-file, title or aria-label nearby), so an agent can open the file at that line.
  const pre = node.parentElement?.closest('pre, [data-file]') ||
    (getComputedStyle(node.parentElement).whiteSpace.startsWith('pre') ? node.parentElement : null);
  // A table of code with its own line numbers (one row per line) counts as a block too.
  const codeTable = !pre && node.parentElement?.closest('table[data-file], table[class*="code" i]');
  if (pre || codeTable) {
    const box = pre || codeTable;
    const r = document.createRange();
    r.setStart(box, 0);
    r.setEnd(node, offset);
    let upto = r.toString();
    let all = box.textContent;
    // Lines drawn as elements (a <br> or a row per line, no newline characters): count those instead.
    const breaks = [...box.querySelectorAll('br, tr')];
    // A code table counts its rows, whatever line breaks its markup has.
    if ((box.localName === 'table' || !all.includes('\n')) && breaks.length) {
      const ends = box.querySelectorAll('br').length ? [...box.querySelectorAll('br')] : [...box.querySelectorAll('tr')].slice(0, -1);
      const before = ends.filter((e) => e.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING && !e.contains(node)).length;
      const lineRange = document.createRange();
      if (before) lineRange.setStartAfter(ends[before - 1]);
      else lineRange.setStart(box, 0);
      if (ends[before]) lineRange.setEndBefore(ends[before]);
      else lineRange.setEnd(box, box.childNodes.length);
      // Rows are the lines themselves; with <br> a line is what lies between two of them.
      const row = box.querySelectorAll('br').length ? null : node.parentElement?.closest('tr');
      quote.line = short((row ? row.textContent : lineRange.toString()).trim(), 200);
      quote.lineNo = before + 1;
      quote.lines = ends.length + (box.querySelectorAll('br').length ? 0 : 1);
    } else {
      const from = upto.lastIndexOf('\n') + 1;
      const to = all.indexOf('\n', upto.length);
      quote.line = short(all.slice(from, to < 0 ? undefined : to).trim(), 200);
      quote.lineNo = upto.split('\n').length;
      quote.lines = all.replace(/\n$/, '').split('\n').length;
    }
    // The page's own line number, when it shows one (a number cell, or data-line on the row or cell).
    const row = node.parentElement?.closest('tr, [data-line], [data-line-number]');
    if (row) {
      const cell = row.matches('[data-line], [data-line-number]') ? row : row.querySelector('[data-line], [data-line-number]');
      const n = cell?.getAttribute('data-line') || cell?.getAttribute('data-line-number') || [...row.children].map((c) => c.textContent.trim()).find((t) => /^\d+$/.test(t));
      if (n && /^\d+$/.test(n)) quote.pageLineNo = Number(n);
    }
    // The block's label: data-file, a caption, or a title bar next to the block (Docusaurus, Expressive Code).
    let label = box.closest('[data-file]')?.getAttribute('data-file') || box.getAttribute('title') || box.getAttribute('aria-label') || '';
    for (let el = box.parentElement, i = 0; !label.trim() && el && el !== document.body && i < 3; el = el.parentElement, i++) {
      label = el.querySelector(':scope > figcaption, :scope > [class*="title" i]')?.textContent || '';
    }
    if (label.trim()) quote.label = short(label.trim(), 120);
  }
  return quote;
}

function openingTag(node) {
  const attrs = [...node.attributes]
    .filter((a) => /^(id|class|alt|role|aria-label|href|data-[\w-]+)$/.test(a.name))
    .map((a) => [a.name, a.name === 'class' ? a.value.split(/\s+/).filter((c) => c && !generated(c)).join(' ') : a.name === 'id' && generated(a.value) ? '' : a.value])
    .filter(([n, v]) => v || !/^(id|class)$/.test(n))
    .map(([n, v]) => `${n}="${short(v, 60)}"`);
  return `<${node.localName}${attrs.length ? ` ${attrs.join(' ')}` : ''}>`.slice(0, 200);
}
// Is this element the kind a pin was put on? Same tag and id, and at least one of its classes still there: pages
// add and drop state classes (offscreen, is-active, open), and an exact match of the tag moved those pins away.
function sameKind(node, tag) {
  if (!tag) return true;
  const want = /^<([\w-]+)/.exec(tag)?.[1];
  if (node.localName !== want) return false;
  // Made-up ids and classes don't count (a pin saved before they were left out of the tag still has them).
  const ownId = (v) => (generated(v) ? '' : v || '');
  const id = / id="([^"]*)"/.exec(tag)?.[1];
  if (ownId(id) !== ownId(short(node.id || '', 60))) return false;
  const classes = (/ class="([^"]*)"/.exec(tag)?.[1] || '').split(/\s+/).filter((c) => c && c !== '…' && !c.endsWith('…') && !generated(c));
  return !classes.length || classes.some((c) => node.classList.contains(c));
}

// words: the point is on the word under it (kind text, its quote: the words a Shift-drag quotes). A click or an area is
// only a point, never a quote, so nothing is highlighted (Leo 18 Nov: "pin pointing on word highlighting word").
// onto: the element the caller knows is there (selected words' own). Chrome now and then finds nothing but <html>
// under a point for the moment after a double-click selects a word, and the pin went on <body>, its words not found.
export function anchorAt(clientX, clientY, words = false, onto = null) {
  let stack = document.elementsFromPoint(clientX, clientY).filter((n) => n !== host && n !== document.documentElement);
  if (onto && !stack.length) stack = [onto];
  // Inside open web components: follow the click into each shadow root.
  const shadowRoots = [];
  let shadowHost = null;
  for (let top = stack[0]; top?.shadowRoot && !host.contains(top) && shadowRoots.length < 5; top = stack[0]) {
    shadowHost ||= top;
    shadowRoots.push(top.shadowRoot);
    const inner = top.shadowRoot.elementsFromPoint(clientX, clientY).filter((n) => n !== top);
    if (!inner.length) break;
    stack = [...inner, ...stack];
  }
  // data-comment-target: a click anywhere inside snaps to that element (same attribute as Claude artifacts).
  const target = stack[0]?.closest('[data-comment-target]') || stack[0] || document.body;
  const rect = target.getBoundingClientRect();
  const anchor: Anchor = {
    selector: selectorFor(target),
    x: rect.width ? (clientX - rect.left) / rect.width : 0,
    y: rect.height ? (clientY - rect.top) / rect.height : 0,
    docX: (clientX + scrollX) / docWidth(),
    docY: clientY + scrollY,
    width: innerWidth,
    height: innerHeight,
    dpr: Math.round((devicePixelRatio || 1) * 100) / 100,
    element: openingTag(target),
    eh: Math.round(rect.height), // its height then: a pin on a big container can tell if the page grew under it
  };
  const own = short(target.textContent, 200);
  if (own && target !== document.body && (target.textContent || '').length < 400) anchor.text = short(own, 80);
  const inside = target.parentElement?.closest<HTMLElement>('[id], [data-lab]');
  if (inside) anchor.inside = inside.dataset.lab ? `[data-lab="${inside.dataset.lab}"]` : `#${inside.id}`;
  let heading = null;
  for (const h of document.querySelectorAll('h1, h2, h3')) {
    if (h.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING || h.contains(target)) heading = h;
  }
  if (heading) anchor.section = short(heading.textContent, 100);
  if (shadowHost) anchor.shadow = openingTag(shadowHost);
  for (const [k, v] of Object.entries(componentAt(target))) if (v) anchor[k] = short(v, 200);
  if (target !== document.body) anchor.looks = looksOf(target);
  // A <select>: which option is chosen (its text is every option in a row).
  const select = target.closest?.('select');
  if (select && select.selectedIndex >= 0) {
    anchor.chosen = short(`${select.selectedIndex + 1} of ${select.options.length}: "${select.options[select.selectedIndex].text}"`, 120);
  }
  // Text that CSS adds with ::before / ::after content (a badge, a label): it isn't in the HTML.
  for (const el of [target, target.parentElement]) {
    if (!el || el === document.body) continue;
    for (const which of ['::before', '::after']) {
      const c = getComputedStyle(el, which).content;
      const m = c && c.match(/^"(.+)"$/);
      if (m && m[1].trim()) {
        anchor.cssText = short(`"${m[1]}" from ${which} of ${openingTag(el)}`, 160);
        break;
      }
    }
    if (anchor.cssText) break;
  }
  const build = document.querySelector<HTMLMetaElement>('meta[name="lab-build"]')?.content;
  if (build) anchor.build = short(build, 40);

  // What the pin sits on: media first (even under a transparent overlay), then text, then a background image.
  const media = stack.slice(0, 5).find((n) => /^(img|video|canvas|svg|image)$/.test(n.localName) && !host.contains(n));
  if (media?.localName === 'image' && media.namespaceURI === 'http://www.w3.org/2000/svg') {
    // A picture placed inside an SVG with <image href>: a picture file, not a drawing.
    anchor.kind = 'image';
    anchor.src = new URL(media.getAttribute('href') || media.getAttribute('xlink:href') || '', location.href).href;
    anchor.file = fileHint(anchor.src);
    svgImageSpot(media, anchor, clientX, clientY);
  } else if (media) {
    const r = media.getBoundingClientRect();
    anchor.kind = media.localName === 'img' ? 'image' : media.localName;
    if (media.localName === 'img' || media.localName === 'video') {
      const img = media as HTMLImageElement, video = media as HTMLVideoElement; // the same element, by kind
      anchor.src = mediaSrc(media);
      anchor.file = fileHint(anchor.src);
      if (img.alt) anchor.alt = short(img.alt, 120);
      // Turned or skewed by a CSS transform: undo it, so the spot is measured on the picture itself.
      const local = untransform(media, clientX, clientY);
      const [box, px, py] = local ? [local.rect, local.x, local.y] : [r, clientX, clientY];
      const spot = media.localName === 'img'
        ? naturalSpot(media, box, px, py, fileSize(media).nw, fileSize(media).nh)
        : naturalSpot(media, box, px, py, video.videoWidth, video.videoHeight);
      if (spot) Object.assign(anchor, spot);
      if (local) anchor.transform = short(getComputedStyle(media).transform, 80);
      // An animated picture (GIF, WebP, APNG): how long it had been showing, to find the frame.
      if (media.localName === 'img' && /\.(gif|webp|apng)(\?|#|$)/i.test(img.currentSrc || img.src)) {
        const entry = performance.getEntriesByName(img.currentSrc || img.src)[0] as PerformanceResourceTiming | undefined;
        const since = entry ? (performance.now() - entry.responseEnd) / 1000 : performance.now() / 1000;
        anchor.shownFor = Math.round(since * 10) / 10;
      }
      if (media.localName === 'video') {
        anchor.time = Math.round(video.currentTime * 10) / 10;
        if (Number.isFinite(video.duration)) anchor.duration = Math.round(video.duration * 10) / 10;
        if (!anchor.file && video.poster) anchor.file = fileHint(video.poster);
      }
    } else {
      // canvas / svg animation: when it was, and where inside it.
      anchor.time = Math.round(performance.now() / 100) / 10;
      anchor.imgX = clamp01((clientX - r.left) / (r.width || 1));
      anchor.imgY = clamp01((clientY - r.top) / (r.height || 1));
      anchor.nw = Math.round(r.width);
      anchor.nh = Math.round(r.height);
    }
  } else {
    // Code keeps its quote on a plain click: the line and its number are what an agent opens the file at.
    const inCode = target.closest('pre, [data-file], table[class*="code" i]') || getComputedStyle(target).whiteSpace.startsWith('pre');
    const quote = words || inCode ? quoteAt(clientX, clientY, shadowRoots) : null;
    if (quote) {
      anchor.kind = 'text';
      anchor.quote = quote;
    } else {
      for (let n = target, i = 0; n && n !== document.documentElement && i < 4; n = n.parentElement, i++) {
        const bg = getComputedStyle(n).backgroundImage.match(/url\(["']?(.+?)["']?\)/);
        if (bg) {
          anchor.kind = 'background';
          anchor.src = new URL(bg[1], location.href).href;
          anchor.file = fileHint(anchor.src);
          backgroundSpot(n, anchor.src, anchor, clientX, clientY);
          break;
        }
      }
      anchor.kind ||= 'element';
      if (anchor.kind === 'element') {
        const gap = between(target, clientY);
        if (gap) Object.assign(anchor, { gapAbove: gap.above, gapBelow: gap.below });
      }
    }
  }
  Object.assign(anchor, schemeAt(target));
  // The nearest element with an id around the spot: the block the pin is on.
  for (let b: Element | null = target; b && b !== document.body && b !== document.documentElement; b = b.parentElement) {
    if (b.id) {
      anchor.block = b.id;
      break;
    }
  }
  return anchor;
}

// The stored selector can point at a different element after a redeploy; check it against the
// file / text fingerprint, look for the right one, and otherwise fall back to the page position.
function findTarget(anchor) {
  let node = null;
  try {
    node = anchor.selector ? document.querySelector(anchor.selector) : null;
  } catch {}
  const matches = (n) => {
    if (!n) return false;
    if (anchor.file && /^(image|video)$/.test(anchor.kind)) {
      const m = n.closest?.('img, video') || n;
      return fileHint(mediaSrc(m)) === anchor.file;
    }
    if (anchor.element && !sameKind(n, anchor.element)) return false;
    // Its words start here (a quote from a selection can run on into the next items); spaces don't count. A short quote
    // ("lab", "above") is found anywhere, so the words around it must be there too, or it's another element.
    if (anchor.quote?.exact) {
      const t = (n.textContent || '').replace(/\s+/g, '');
      const q = anchor.quote.exact.replace(/\s+/g, '').slice(0, 24);
      const before = (anchor.quote.prefix || '').replace(/\s+/g, '').slice(-10);
      const after = (anchor.quote.suffix || '').replace(/\s+/g, '').slice(0, 10);
      return t.includes(q) && (q.length >= 16 || (!before && !after) || t.includes(before + q) || t.includes(q + after));
    }
    return true;
  };
  const said = short(anchor.text, 400);
  const sectionOf = (n) => {
    let heading = null;
    for (const h of document.querySelectorAll('h1, h2, h3')) if (h.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING || h.contains(n)) heading = h;
    return heading ? short(heading.textContent, 100) : '';
  };
  const squash = (t) => String(t || '').replace(/\s+/g, '');
  const areaWords = squash(anchor.zoneText).slice(0, 30);
  // The element at the old path is only the same one if it still says the same: its words, an area's words, or at
  // least the same section (a box with no words of its own, like a grid, otherwise matched its twin in the next section).
  const saysSame = (n) =>
    anchor.quote?.exact ? true
    : said ? short(n.textContent, 400).startsWith(said.slice(0, 40))
    : areaWords ? squash(n.textContent).includes(areaWords)
    : anchor.section ? sectionOf(n) === anchor.section
    : true;
  const atPath = node && node !== document.body && matches(node) ? node : null;
  if (atPath && saysSame(atPath)) return atPath;
  if (anchor.file && /^(image|video)$/.test(anchor.kind)) {
    return [...document.querySelectorAll('img, video')].find((m) => fileHint(mediaSrc(m)) === anchor.file) || null;
  }
  // The page changed above it (a section added, a list reordered) and the path no longer leads there: look for the
  // same element by what it is and what it says. Among elements with the same tag and classes, the best one has the
  // same words (or the quote), sits under the same heading, and is nearest to where the pin was; a lone exact twin
  // counts too. So the pin lands back on its element, at the same spot inside it, instead of where the page was.
  const tag = /^<([\w-]+)/.exec(anchor.element || '')?.[1];
  if (!tag || tag === 'body' || tag === 'html') return atPath;
  const flat = (t) => short(t, 400);
  const twin = (n) => !host.contains(n) && sameKind(n, anchor.element);
  // At most 400 are read, and on a long page those are the ones nearest to where the pin was, not the first 400 on
  // the page: a pin on the 500th row was never looked for.
  const some = (all) => {
    const kin = all.filter(twin);
    if (kin.length <= 400) return kin;
    const far = (n) => Math.abs(n.getBoundingClientRect().top + scrollY - (anchor.docY || 0));
    return kin.slice(0, 4000).map((n) => [far(n), n]).sort((a, b) => a[0] - b[0]).slice(0, 400).map((x) => x[1]);
  };
  const pick = (twins) => {
    let found = null;
    let best = -1;
    let near = Infinity;
    for (const n of twins) {
      const t = flat(n.textContent);
      let score = 0;
      if (anchor.quote?.exact && matches(n)) score += 4;
      if (said && t === said) score += 4;
      if (areaWords && squash(n.textContent).includes(areaWords)) score += 4;
      else if (said && t.startsWith(said.slice(0, 40))) score += 2;
      // The same section only breaks a tie between elements that say the right thing; on its own it would pick a
      // neighbour (an option removed from a list put its pins on the next one).
      if (!score && twins.length > 1) continue;
      if (score && anchor.section && sectionOf(n) === anchor.section) score += 2;
      const d = Math.abs(n.getBoundingClientRect().top + scrollY - (anchor.docY || 0));
      if (score > best || (score === best && d < near)) [found, best, near] = [n, score, d];
    }
    return { found, best };
  };
  // First inside the box it was in (the nearest element with an id or data-lab around it), so a card's twin in
  // another section doesn't win; the whole page only when nothing in there says the right thing.
  const scopes = [];
  for (const s of [anchor.inside, anchor.block && `#${anchor.block}`]) {
    const at = !s ? null : s.startsWith('#') ? document.getElementById(s.slice(1)) : (() => {
      try {
        return document.querySelector(s);
      } catch {
        return null;
      }
    })();
    if (at && at !== document.body && !host.contains(at) && !scopes.includes(at)) scopes.push(at);
  }
  scopes.sort((a, b) => (a.contains(b) ? 1 : b.contains(a) ? -1 : 0)); // the smaller box first
  for (const scope of scopes) {
    const { found, best } = pick(some([scope, ...scope.querySelectorAll(tag)].filter((n) => n.localName === tag)));
    if (best > 0) return found;
  }
  const twins = some([...document.querySelectorAll(tag)]);
  const { found, best } = pick(twins);
  if (best > 0 || !atPath) return found;
  // Nothing says the same. A lone element of its kind is still it (the words were edited, say). Among several
  // (cards reordered, one removed) the one at the old path is just whichever came to sit there: the pin shows as
  // moved instead of landing on the wrong card.
  return twins.length > 1 ? null : atPath;
}

// A pin kept at its old spot never sits below the page's end (the page got shorter, say after a cleanup): it moves up
// to just above the end, so it doesn't make the page longer. The end is the page's own content, not the pins' layer.
export let pageEnd = { at: -Infinity, y: 0 }; // never fresh at first: a pin drawn in the page's first 300 ms sat at the top
export const inPage = (y, h = 0) => {
  if (performance.now() - pageEnd.at > 300) {
    const bottoms = [...document.body.children].filter((c) => c !== host && !host.contains(c)).map((c) => c.getBoundingClientRect().bottom + scrollY);
    pageEnd = { at: performance.now(), y: Math.max(innerHeight, ...bottoms) };
  }
  return Math.max(0, Math.min(y, pageEnd.y - h - 40));
};
// An area's pin sits at the corner where the drag ended (where you let go), not where it started.
const pinOf = (zone, anchor) => ({ left: zone.left + (anchor.pinX ? zone.width : 0), top: zone.top + (anchor.pinY ? zone.height : 0) });
// A pin whose spot changed waits beside the content at the height it had, small and faded, out of the content's way
// (it pointed at something that's gone, so its old x means nothing now). Opening it still shows its old area.
// "Beside the content" is the gutter just left of what it sat in: the nearest box in its selector that is still on the
// page, else the page's own content. It used to be the window's left edge, which on a wide window with a centred
// column is hundreds of px from anything people look at: such pins read as lost. EDGE is the least it can be, so on a
// phone, or a page that fills the window, it is where it was.
const EDGE = 10;
const GUTTER = 30; // a moved pin is 22 px wide: its right side stops 8 px short of the content
function edgeFor(anchor) {
  const beside = (rect) => Math.max(EDGE, Math.round(rect.left + scrollX - GUTTER));
  const parts = String(anchor?.selector || '').split(' > ');
  while (parts.length > 1) {
    parts.pop();
    let node = null;
    try {
      node = document.querySelector(parts.join(' > '));
    } catch {}
    if (!node || /^(html|body)$/.test(node.localName) || host.contains(node)) continue;
    const rect = node.getBoundingClientRect();
    if (rect.width) return beside(rect);
  }
  const boxes = [...document.body.children]
    .filter((c) => c !== host && !host.contains(c))
    .map((c) => c.getBoundingClientRect())
    .filter((r) => r.width && r.height);
  return boxes.length ? beside({ left: Math.min(...boxes.map((r) => r.left)) }) : EDGE;
}
export function position(anchor) {
  const at = spotOf(anchor);
  if (at.moved) return { ...at, left: edgeFor(anchor) };
  return anchor.kind === 'board' ? at : { ...at, clipped: clippedAt(findTarget(anchor), at.left - scrollX, at.top - scrollY) };
}
// A pin whose spot a box with overflow cut off (panned or scrolled out of a canvas, a carousel, a scroll box) hides
// until its spot is back in view, instead of floating over the page outside that box.
function clippedAt(node, x, y) {
  for (let el = node?.parentElement; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
    if (getComputedStyle(el).overflow === 'visible') continue;
    const r = el.getBoundingClientRect();
    if (x < r.left - 1 || x > r.right + 1 || y < r.top - 1 || y > r.bottom + 1) return true;
  }
  return false;
}
// Where a pin on quoted words sits: on the piece of them (one per line) nearest to where it was in its element, at
// that spot when it's still on the words, else at the nearest point of them. So an unchanged page keeps the pin
// exactly where it was put, and words that moved inside the element take the pin with them.
function onWords(range, anchor, rect) {
  const rects = [...range.getClientRects()].filter((r) => r.width || r.height);
  if (!rects.length) return null;
  const gx = rect.left + (anchor.x || 0) * rect.width;
  const gy = rect.top + (anchor.y || 0) * rect.height;
  const pull = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
  const far = (r) => Math.hypot(gx - pull(gx, r.left, r.right), gy - pull(gy, r.top, r.bottom));
  let at = rects[rects.length - 1]; // the last piece (where a selection ended) wins a tie
  for (const r of rects) if (far(r) < far(at)) at = r;
  return { left: pull(gx, at.left, at.right) + scrollX, top: pull(gy, at.top, at.bottom) + scrollY };
}
// Pin point (the zone's top-left corner for area comments) and, for areas, the zone box, in page coordinates.
function spotOf(anchor): Spot {
  const node = findTarget(anchor);
  const hasWords = anchor.quote?.exact;
  // Words straight in the page (findTarget never returns the page itself): looked for in the whole page.
  const box = node || (hasWords && /^<(body|html)[\s>]/.test(anchor.element || '') ? document.body : null);
  const big = box && !anchor.zw && !anchor.docW && /^(html|body|main)$/.test(box.localName);
  // A pin on a big container (the page's body or main) is placed by a share of its size, which drifts when content is
  // added above. If it was on words, find them again and sit on them; if they're gone, say so (the pin shows faded as
  // moved) instead of pointing at whatever is there now.
  if (big && hasWords) {
    const range = quoteRange(anchor, box, true);
    const spot = range && onWords(range, anchor, box.getBoundingClientRect());
    return spot ? { ...spot, zone: null } : { left: anchor.docX * docWidth(), top: inPage(anchor.docY), zone: null, moved: true };
  }
  if (node && !anchor.zw && (anchor.gapAbove || anchor.gapBelow)) {
    const rect = node.getBoundingClientRect();
    const top = gapTop(anchor, node, rect);
    if (top !== null) return { left: rect.left + scrollX + anchor.x * rect.width, top: top + scrollY, zone: null };
  }
  // On a big container with no word to find: if the container's height changed since, the share of it no longer points
  // at the same thing, so the pin keeps its old place and shows faded as moved rather than pointing at something else.
  if (big && anchor.eh && !hasWords) {
    if (Math.abs(node.getBoundingClientRect().height - anchor.eh) > 40) return { left: anchor.docX * docWidth(), top: inPage(anchor.docY), zone: null, moved: true };
  }
  if (node) {
    const rect = node.getBoundingClientRect();
    // A pin on words sits on those words, wherever they went inside the element; its share of the element only
    // when they can't be found.
    const range = anchor.kind === 'text' && !anchor.zw && anchor.quote?.exact ? quoteRange(anchor, node) : null;
    const words = range && onWords(range, anchor, rect);
    if (words) return { ...words, zone: null };
    if (rect.width || rect.height) {
      const left = rect.left + scrollX + anchor.x * rect.width;
      // An area on a box much taller than itself (a section, the page) keeps its px offset and size: as a share of the
      // box it jumped onto other text when pictures above it loaded or the page grew.
      const tall = anchor.zw && Number.isFinite(anchor.oy) && anchor.docH && rect.height > 2 * anchor.docH;
      const top = rect.top + scrollY + (tall ? anchor.oy : anchor.y * rect.height);
      const zone = anchor.zw ? { left, top, width: anchor.zw * rect.width, height: tall ? anchor.docH : anchor.zh * rect.height } : null;
      return zone ? { ...pinOf(zone, anchor), zone } : { left, top, zone };
    }
  }
  // Its element is gone: its words may still be on the page.
  const words = !box && hasWords && !anchor.docW && wordsOnPage(anchor);
  if (words) return { ...words, zone: null };
  const left = anchor.docX * docWidth();
  const top = inPage(anchor.docY, anchor.docH || 0);
  const zone = anchor.docW ? { left, top, width: anchor.docW, height: anchor.docH } : null;
  if (zone) return { ...pinOf(zone, anchor), zone, moved: Boolean(anchor.selector) && anchor.selector !== 'body' };
  // Anchored to the page itself (a margin, or an area wider than any element): nothing has moved.
  return { left, top, zone, moved: Boolean(anchor.selector) && anchor.selector !== 'body' };
}

// A pin whose element is gone, by its words. Sure when they stand once on the page between the same words as before
// (or are long, and stand once). Else the nearest look-alike within two screens of where the pin was (the same words in
// other company, or other words in the same company) is a guess: the pin waits beside it, shown as moved.
function wordsOnPage(anchor, fresh = false) {
  const squash = (t) => (t || '').replace(/\s+/g, '');
  const [pre, want, post] = [squash(anchor.quote.prefix).slice(-12), squash(anchor.quote.exact), squash(anchor.quote.suffix).slice(0, 12)];
  const { text, at } = lettersOf(document.body, fresh);
  const all = (s, out = []) => {
    for (let i = text.indexOf(s); s && i !== -1 && out.length < 50; i = text.indexOf(s, i + 1)) out.push(i);
    return out;
  };
  let stale = false; // the page's text changed since it was read (less than a moment ago): read it again
  const spot = (i, n) => {
    try {
      const range = document.createRange();
      range.setStart(...at[i]);
      range.setEnd(at[i + n - 1][0], at[i + n - 1][1] + 1);
      const r = range.getClientRects()[0];
      stale ||= !at[i][0].isConnected;
      return r && { left: r.left + scrollX + Math.min(6, r.width / 2), top: r.top + scrollY + r.height / 2 };
    } catch {
      stale = true;
    }
  };
  const sure = pre || post || want.length > 15 ? all(pre + want + post) : [];
  let best: { left: number; top: number; moved?: boolean } | null | undefined = sure.length === 1 ? spot(sure[0] + pre.length, want.length) : null;
  const company = pre.length > 5 && post.length > 5 ? all(pre).map((i) => [i + pre.length, text.indexOf(post, i + pre.length) - i - pre.length]).filter(([, n]) => n > 0 && n < want.length * 2 + 20) : [];
  let near = 2 * innerHeight;
  for (const [i, n] of best ? [] : [...all(want).map((i) => [i, want.length]), ...company]) {
    const s = spot(i, n);
    if (s && Math.abs(s.top - anchor.docY) < near) [best, near] = [{ ...s, moved: true }, Math.abs(s.top - anchor.docY)];
  }
  return stale && !fresh ? wordsOnPage(anchor, true) : best;
}

// A pin found again on another element than its saved path leads to (the page changed around it): where it is now,
// for the widget to save, so the next look and the agent's text start from there. Null when it is where its path says.
export function foundAt(anchor) {
  const node = findTarget(anchor);
  let at = null;
  try {
    at = document.querySelector(anchor.selector);
  } catch {}
  if (!node || node === at) return null;
  const rect = node.getBoundingClientRect();
  return { selector: selectorFor(node), docX: clamp01((rect.left + scrollX + anchor.x * rect.width) / docWidth()), docY: Math.round(rect.top + scrollY + anchor.y * rect.height), eh: Math.round(rect.height) };
}

// An element's letters without spaces, each with its text piece and place in it; read once per moment and shared by
// the pins in it (pins on the page itself each read the whole page).
const letters = new WeakMap<Node, { when: number; text: string; at: [Text, number][] }>();
function lettersOf(node, fresh = false) {
  const had = letters.get(node);
  if (had && !fresh && performance.now() - had.when < 400) return had;
  let text = '';
  const at: [Text, number][] = [];
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, { acceptNode: (t) => (host.contains(t.parentNode) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
  for (let t = walker.nextNode() as Text | null; t; t = walker.nextNode() as Text | null)
    for (let i = 0; i < t.data.length; i++) {
      if (/\s/.test(t.data[i])) continue;
      text += t.data[i];
      at.push([t, i]);
    }
  const got = { when: performance.now(), text, at };
  letters.set(node, got);
  return got;
}
// The quoted words of a text comment, found again in the page, for the pin and the highlight (CSS Custom Highlight API:
// nothing in the page's DOM is touched).
// The words are matched with spaces left out, across text pieces, so a quote that runs over several items (Shift +
// select) is found too; the search widens from the pinned element to the few boxes around it.
// strict: only where the words before them match too (a pin on the page itself: the same word elsewhere is not it).
function quoteRange(anchor, node = null, strict = false, fresh = false) {
  const q = anchor?.quote;
  const from = q?.exact ? node || findTarget(anchor) : null;
  if (!from) return null;
  const want = q.exact.replace(/\s+/g, '');
  if (!want) return null;
  const tail = (q.prefix || '').replace(/\s+/g, '').slice(-12);
  let stale = false;
  for (let n = from, up = 0; n && up < 4; n = n.parentElement, up++) {
    const { text, at } = lettersOf(n, fresh);
    let first = null;
    for (let i = text.indexOf(want); i !== -1; i = text.indexOf(want, i + 1)) {
      const range = document.createRange();
      try {
        range.setStart(...at[i]);
        const [end, k] = at[i + want.length - 1];
        range.setEnd(end, k + 1);
      } catch {}
      // The page's text changed since it was read (less than a moment ago): read it again.
      if (range.toString().replace(/\s+/g, '') !== want) {
        stale = true;
        continue;
      }
      if (!tail || text.slice(0, i).endsWith(tail)) return range;
      first ||= range;
    }
    if (first && !strict) return first;
  }
  return stale && !fresh ? quoteRange(anchor, from, strict, true) : null;
}
// A message's name with its small marks: ↩ replied, ✅ done.
// A message's name with its small mark: a green ✓ when done. An agent's session id ("Claude · session 8a296ba1") is left off.
export const nameLine = (name) => el('b', {}, String(name || '').replace(/\s*·\s*session\s+\S+$/i, ''));
// A block named in a message: its heading in view with room above, and outlined for a moment. On the element itself
// (the widget's layer is redrawn as comments arrive, which would drop an outline drawn there).
export function goToBlock(e: Element) {
  const r = e.getBoundingClientRect();
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  scrollTo({ top: Math.max(0, r.top + scrollY - 24 - (parseFloat(host.style.getPropertyValue('--lab-sbb')) || 0)), behavior: still ? 'auto' : 'smooth' });
  const ring = '2px solid rgb(52, 199, 89)';
  e.animate([{ outline: ring, outlineOffset: '4px' }, { outline: ring, outlineOffset: '4px', offset: 0.7 }, { outline: '2px solid transparent', outlineOffset: '4px' }], { duration: ms('hold', 2) });
}
// Messages show web addresses as links that open in a new tab, and #some-id, when the page has an element with that
// id, as a link that goes to it there (an agent names the block it placed: "#speed-deeper").
// The widget listens for lab-goto and scrolls (src/comments.js, goToBlock).
const onPage = (id) => {
  const e = document.getElementById(id);
  return Boolean(e) && !e.closest('[data-lab-comments]');
};
const linked = (text) => {
  const out = [];
  let at = 0;
  for (const m of text.matchAll(/\bhttps?:\/\/[^\s<>"']*[^\s<>"'.,;:!?)\]]|(?<![\w&/#])#([A-Za-z][\w:.-]*[\w])/g)) {
    if (m[1] && !onPage(m[1])) continue;
    if (m.index > at) out.push(document.createTextNode(text.slice(at, m.index)));
    const a = m[1]
      ? el('a', { href: `#${m[1]}`, class: 'link' }, m[0])
      : el('a', { href: m[0], target: '_blank', rel: 'noopener noreferrer', class: 'link' }, m[0]);
    a.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!m[1]) return;
      e.preventDefault();
      dispatchEvent(new CustomEvent('lab-goto', { detail: m[1] }));
    });
    out.push(a);
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push(document.createTextNode(text.slice(at)));
  return out;
};
// Messages read in short blocks: a blank line starts a new paragraph, "- " or "1. " lines are a list, and one long
// paragraph (as agents tend to write) is broken after every second sentence, so a small window isn't a wall of text.
const sentences = (t) => t.split(/(?<=[.!?])\s+(?=["'([]?[A-Z0-9])/);
export const readable = (text) => {
  const blocks = [];
  for (const [n, para] of String(text || '').trim().split(/\n\s*\n/).entries()) {
    const lines = para.split('\n');
    if (lines.length === 1 && para.length > 240) { // one long paragraph: two sentences a block
      const ss = sentences(para);
      for (let i = 0; i < ss.length; i += 2) blocks.push({ text: ss.slice(i, i + 2).join(' '), gap: n > 0 || i > 0 });
      continue;
    }
    lines.forEach((line, i) => {
      const item = /^\s*(?:[-•*]|\d+[.)])\s+/.exec(line);
      const prev = i > 0 ? blocks.at(-1) : null;
      if (item) blocks.push({ li: /\d/.test(item[0]) ? item[0].trim() : '•', text: line.slice(item[0].length), gap: n > 0 && i === 0 });
      else if (prev && !prev.li) prev.text += `\n${line}`;
      else blocks.push({ text: line, gap: (n > 0 && i === 0) || Boolean(prev) });
    });
  }
  return blocks.map((b) => {
    const node = el('span', { class: `p${b.li ? ' li' : ''}${b.gap ? ' gap' : ''}` });
    if (b.li) node.append(el('span', { class: 'mk' }, b.li));
    node.append(...linked(b.text));
    return node;
  });
};
/** A range's boxes on screen now, line by line, with how its words sit: reading right to left (their end is then the
 *  left edge), or in a fixed or sticky part of the page (what is placed by them is held to the screen too). */
export const rectsOf = (range?: Range | null) => {
  let n = range ? (range.endContainer instanceof Element ? range.endContainer : range.endContainer.parentElement) : null;
  const rtl = n ? getComputedStyle(n).direction === 'rtl' : false;
  let fixed = false;
  for (; n && !fixed; n = n.parentElement) fixed = /^(fixed|sticky)$/.test(getComputedStyle(n).position);
  return Object.assign([...(range?.getClientRects() || [])].filter((r) => r.width > 0), { rtl, fixed });
};
/** The quoted words' boxes on screen now (none when the words can't be found). */
export const quoteRects = (anchor) => rectsOf(quoteRange(anchor));
const canMark = typeof Highlight === 'function' && Boolean(CSS.highlights);
export const markQuote = (anchor) => {
  if (!canMark) return;
  const range = anchor && quoteRange(anchor);
  if (!range) return CSS.highlights.delete('lab-quote');
  // WebKit paints no highlight set while the text can't be selected (comments on, Shift up: lab-pinning in
  // comments.js), and keeps one set while it can: the page's text is selectable for the frame the words are lit in.
  document.documentElement.classList.add('lab-lit');
  CSS.highlights.set('lab-quote', new Highlight(range));
  requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.remove('lab-lit')));
};

// The area's outline: round dots with room between them (CSS dotted borders can't space their dots).
export const zoneEl = (cls) => {
  const z = el('div', { class: `zone ${cls}` });
  z.innerHTML = '<svg aria-hidden="true"><rect class="dots" width="100%" height="100%"/></svg>';
  return z;
};
export const drawZone = (box, cls) => {
  if (!box) return;
  const z = zoneEl(cls);
  Object.assign(z.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` });
  layer.append(z);
  return z;
};

// An area comment: facts come from the middle of the zone; the anchor element is the smallest one that
// contains the whole zone, so the zone is stored as fractions of it and follows it like a pin.
export function zoneAnchor({ x0, y0, x1, y1 }) {
  const left = Math.min(x0, x1);
  const top = Math.min(y0, y1);
  const right = Math.max(x0, x1);
  const bottom = Math.max(y0, y1);
  const anchor = anchorAt((left + right) / 2, (top + bottom) / 2);
  let box = document.elementsFromPoint((left + right) / 2, (top + bottom) / 2).find((n) => n !== host && !host.contains(n));
  // The area is on the smallest element that holds most of it (80%): a narrow strip drawn a little past a picture's
  // edge stays on the picture, instead of climbing to the page itself.
  const area = Math.max(1, (right - left) * (bottom - top));
  const contains = (r) => (Math.max(0, Math.min(r.right, right) - Math.max(r.left, left)) * Math.max(0, Math.min(r.bottom, bottom) - Math.max(r.top, top))) / area >= 0.8;
  while (box && box !== document.body && !contains(box.getBoundingClientRect())) box = box.parentElement;
  box ||= document.body;
  const r = box.getBoundingClientRect();
  Object.assign(anchor, {
    selector: box === document.body ? 'body' : selectorFor(box),
    element: openingTag(box),
    x: r.width ? (left - r.left) / r.width : 0,
    y: r.height ? (top - r.top) / r.height : 0,
    zw: r.width ? (right - left) / r.width : 0, // may pass 1 a little: the area can reach past its element's edge
    zh: r.height ? (bottom - top) / r.height : 0,
    oy: Math.round(top - r.top), // px below the element's top: a share of a tall box drifts when it grows (pictures load)
    docX: (left + scrollX) / docWidth(),
    docY: top + scrollY,
    docW: Math.round(right - left),
    docH: Math.round(bottom - top),
    pinX: x1 >= x0 ? 1 : 0, // the drag ended on the right / at the bottom: the pin goes there
    pinY: y1 >= y0 ? 1 : 0,
  });
  Object.assign(anchor, schemeAt(box));
  // The middle of an area often lands on one word (a caption under a picture): that word is not what the area is
  // on, so no quote (it lit up green as if it alone was picked); the area's words are in zoneText below.
  if (anchor.kind === 'text') {
    delete anchor.quote;
    anchor.kind = 'element';
  }
  const boxText = box === document.body ? '' : short(box.textContent, 200);
  if (boxText && (box.textContent || '').length < 400) anchor.text = short(boxText, 80);
  else delete anchor.text;
  if (box !== document.body) anchor.looks = looksOf(box);
  // Text inside the zone: the words whose middle falls inside it, in reading order. (Reading it like a selection
  // between the zone's corners took the whole paragraph whenever a corner sat above or below a line of text.)
  const words = [];
  const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let n = walker.nextNode() as Text | null; n && words.length < 80; n = walker.nextNode() as Text | null) {
    if (host.contains(n)) continue;
    const pr = n.parentElement?.getBoundingClientRect();
    if (!pr || pr.bottom < top || pr.top > bottom || pr.right < left || pr.left > right) continue;
    for (const m of n.data.matchAll(/\S+/g)) {
      range.setStart(n, m.index);
      range.setEnd(n, m.index + m[0].length);
      const w = range.getBoundingClientRect();
      const cx = (w.left + w.right) / 2;
      const cy = (w.top + w.bottom) / 2;
      if (w.width && cx >= left && cx <= right && cy >= top && cy <= bottom) words.push(m[0]);
    }
  }
  const text = short(words.join(' '), 300);
  if (text) anchor.zoneText = text;
  // What the area holds: the outermost elements that sit wholly inside it (two cards, not the page around them),
  // each with its text and, on a dev build, the component and line that wrote it.
  const inArea = [];
  const all = box.querySelectorAll('*');
  for (let i = 0; i < all.length && i < 3000; i++) {
    const el = all[i];
    if (host.contains(el) || inArea.some((x) => x.contains(el))) continue;
    const er = el.getBoundingClientRect();
    if (er.width < 8 || er.height < 8 || er.left < left - 4 || er.right > right + 4 || er.top < top - 4 || er.bottom > bottom + 4) continue;
    inArea.push(el);
  }
  if (inArea.length) {
    anchor.zoneItems = inArea.slice(0, 5).map((el) => {
      const c = componentAt(el);
      const t = short(el.textContent, 50);
      return short([openingTag(el), t && `"${t}"`, c.component, c.source && `written at ${c.source}`, c.usedAt && `used at ${c.usedAt}`].filter(Boolean).join(' · '), 500);
    });
    if (inArea.length > 5) anchor.zoneItems.push(`and ${inArea.length - 5} more`);
  }
  // The same area inside the original image or video file, when the zone is on one.
  if (/^(img|video)$/.test(box.localName)) {
    const nw = box.localName === 'img' ? fileSize(box).nw : (box as HTMLVideoElement).videoWidth;
    const nh = box.localName === 'img' ? fileSize(box).nh : (box as HTMLVideoElement).videoHeight;
    const a = naturalSpot(box, r, left, top, nw, nh);
    const b = naturalSpot(box, r, right, bottom, nw, nh);
    if (a && b) Object.assign(anchor, { imgX: a.imgX, imgY: a.imgY, imgX2: b.imgX, imgY2: b.imgY });
  } else if (anchor.kind === 'image' || anchor.kind === 'video') {
    // Zone is bigger than the media it is centred on: drop the single-point spot, keep the file as a hint. It's on
    // the box, not the picture: as an 'image' it was placed on the picture by its file, with the box's shares, and
    // jumped somewhere else on the page.
    delete anchor.imgX;
    delete anchor.imgY;
    anchor.kind = 'element';
  }
  return anchor;
}
