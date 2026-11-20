// A page's HTML read as a tree, for `labit pin`: does its selector match, and what is there (the element's opening tag,
// its words, the heading it sits under), written the way the widget writes them (src/widget/anchoring.ts), so a pin
// made from the command line is found again like a person's. Plain HTML only: what a script draws is not here.
import { GENERATED } from './ids.ts';

export type El = { tag: string; attrs: Record<string, string>; kids: (El | string)[]; up: El | null };

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const RAW = new Set(['script', 'style', 'textarea', 'title']);
const HEAD = new Set(['title', 'meta', 'link', 'base', 'style', 'script', 'noscript', 'template']);
const BLOCK = new Set(['address', 'article', 'aside', 'blockquote', 'div', 'dl', 'fieldset', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'ul']);
// A tag that opens ends an open one of these (the end tags a page may leave out), up to the first of the stops.
const CLOSES: Record<string, [string[], string[]]> = {
  li: [['li'], ['ul', 'ol']],
  dt: [['dt', 'dd'], ['dl']],
  dd: [['dt', 'dd'], ['dl']],
  td: [['td', 'th'], ['tr']],
  th: [['td', 'th'], ['tr']],
  tr: [['tr', 'td', 'th'], ['table', 'tbody', 'thead', 'tfoot']],
  tbody: [['tbody', 'thead', 'tfoot', 'tr', 'td', 'th'], ['table']],
  thead: [['tbody', 'thead', 'tfoot', 'tr', 'td', 'th'], ['table']],
  tfoot: [['tbody', 'thead', 'tfoot', 'tr', 'td', 'th'], ['table']],
  option: [['option'], ['select', 'datalist', 'optgroup']],
};
// The names pages use most. A name not here stays as written (&name;) and the text that holds it is not trusted (rawEntity).
const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', copy: '©',
  reg: '®', trade: '™', middot: '·', bull: '•', times: '×', divide: '÷', laquo: '«', raquo: '»', sect: '§', para: '¶', deg: '°', plusmn: '±', frac12: '½', frac14: '¼', frac34: '¾',
  euro: '€', pound: '£', yen: '¥', cent: '¢', larr: '←', rarr: '→', uarr: '↑', darr: '↓', harr: '↔', check: '✓', ne: '≠', le: '≤', ge: '≥', infin: '∞', minus: '−', sup2: '²', sup3: '³',
  eacute: 'é', egrave: 'è', agrave: 'à', aacute: 'á', uuml: 'ü', ouml: 'ö', auml: 'ä', szlig: 'ß', ccedil: 'ç', ntilde: 'ñ', iexcl: '¡', iquest: '¿', thinsp: ' ', ensp: ' ', emsp: ' ', zwj: '‍', zwnj: '‌', shy: '­',
  sbquo: '‚', bdquo: '„', dagger: '†', permil: '‰', lsaquo: '‹', rsaquo: '›', prime: '′', hearts: '♥', star: '☆',
};
const decode = (s: string) =>
  s.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z][a-z0-9]*));/gi, (m, d, h, n) => {
    try {
      return d ? String.fromCodePoint(Number(d)) : h ? String.fromCodePoint(parseInt(h, 16)) : ENTITIES[n] ?? ENTITIES[n.toLowerCase()] ?? m;
    } catch {
      return m;
    }
  });
/** A name this does not know is still in the text as &name;: what the browser shows there is not known, so the text is not trusted. */
const rawEntity = (t: string) => /&[a-z][a-z0-9]*;/i.test(t);
/** Pages above this are not read: the check says so and the pin is saved as given. */
export const MAX_HTML = 2e6;

/** One tag from its `<` at i: its name, attributes and where it ends; null when it never closes (then the `<` is only text).
 *  Attributes are read as a browser reads them: a quote opens a value only after `=`, a `/` inside an unquoted value is part of it. */
function scanTag(html: string, i: number, shut: { d: boolean; s: boolean; gt: number }): { end: number; name: string; attrs: Record<string, string>; self: boolean } | null {
  if (i > shut.gt) return null; // no > after here: no tag can end
  const name = /^[a-zA-Z][^\s>/]*/.exec(html.slice(i + 1, i + 80))?.[0];
  if (!name) return null;
  const attrs: Record<string, string> = {};
  let j = i + 1 + name.length;
  const ws = () => {
    while (j < html.length && /\s/.test(html[j])) j++;
  };
  for (;;) {
    ws();
    if (j >= html.length) return null;
    if (html[j] === '>') return { end: j + 1, name, attrs, self: false };
    if (html[j] === '/') {
      if (html[j + 1] === '>') return { end: j + 2, name, attrs, self: true };
      j++;
      continue;
    }
    const from = j;
    while (j < html.length && !/[\s=/>]/.test(html[j])) j++;
    if (j === from) j++; // a stray = or quote: skipped
    const key = html.slice(from, j).toLowerCase();
    ws();
    let value = '';
    if (html[j] === '=') {
      j++;
      ws();
      const q = html[j];
      if (q === '"' || q === "'") {
        const flag = q === '"' ? 'd' : 's';
        const close = shut[flag] ? -1 : html.indexOf(q, j + 1);
        if (close < 0) {
          shut[flag] = true; // no such quote anywhere after here: the next tag can't find one either
          return null;
        }
        value = html.slice(j + 1, close);
        j = close + 1;
      } else {
        const v = j;
        while (j < html.length && !/[\s>]/.test(html[j])) j++;
        value = html.slice(v, j);
      }
    }
    if (key && !(key in attrs)) attrs[key] = decode(value);
  }
}

/** The page's HTML as the browser would build it: html, head and body there even when the source leaves them out, a tbody
 *  where a table has rows without one. Null when it is too big to read. */
export function parseHtml(html: string): El | null {
  if (html.length > MAX_HTML) return null;
  const root: El = { tag: '#root', attrs: {}, kids: [], up: null };
  let at = root;
  const lower = html.toLowerCase();
  const shut = { d: false, s: false, gt: html.lastIndexOf('>') };
  const push = (tag: string, attrs: Record<string, string>) => {
    const el: El = { tag, attrs, kids: [], up: at };
    at.kids.push(el);
    return el;
  };
  const foreign = () => {
    for (let n: El | null = at; n && n !== root; n = n.up) if (n.tag === 'svg' || n.tag === 'math') return true;
    return false;
  };
  let last = 0; // the text before this has gone into the tree
  let i = 0;
  const text = (to: number) => {
    if (to > last) at.kids.push(decode(html.slice(last, to)));
  };
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt < 0) break;
    i = lt + 1;
    if (html.startsWith('<!--', lt)) {
      text(lt);
      const close = html.indexOf('-->', lt + 4);
      i = last = close < 0 ? html.length : close + 3;
    } else if (html[lt + 1] === '!' || html[lt + 1] === '?') {
      text(lt);
      const close = html.indexOf('>', lt);
      i = last = close < 0 ? html.length : close + 1;
    } else if (html[lt + 1] === '/') {
      const m = /^[a-zA-Z][^\s>/]*/.exec(html.slice(lt + 2, lt + 80));
      if (!m) continue;
      text(lt);
      const close = html.indexOf('>', lt);
      i = last = close < 0 ? html.length : close + 1;
      const tag = m[0].toLowerCase();
      for (let n: El | null = at; n && n !== root; n = n.up)
        if (n.tag === tag) {
          at = n.up || root;
          break;
        }
    } else {
      const t = scanTag(html, lt, shut);
      if (!t) continue; // never closes: the < is text
      text(lt);
      i = last = t.end;
      const tag = t.name.toLowerCase();
      const rule = CLOSES[tag];
      if (rule) for (let n: El | null = at; n && n !== root && !rule[1].includes(n.tag); n = n.up) if (rule[0].includes(n.tag)) { at = n.up || root; break; }
      if (BLOCK.has(tag)) for (let n: El | null = at; n && n !== root && n.tag !== 'button'; n = n.up) if (n.tag === 'p') { at = n.up || root; break; }
      if (tag === 'tr' && at.tag === 'table') at = push('tbody', {}); // the browser puts rows in a tbody of its own
      const el = push(tag, t.attrs);
      // /> closes only what a browser lets it: void elements, and anything inside an svg or math (<div/> opens a div).
      if (VOID.has(tag) || (t.self && (foreign() || tag === 'svg' || tag === 'math'))) continue;
      if (RAW.has(tag)) {
        const end = lower.indexOf(`</${tag}`, i);
        const stop = end < 0 ? html.length : end;
        const body = html.slice(i, stop);
        el.kids.push(tag === 'script' || tag === 'style' ? body : decode(body)); // a script's words are in textContent, as written
        const close = end < 0 ? -1 : html.indexOf('>', end);
        i = last = close < 0 ? html.length : close + 1;
        continue;
      }
      at = el;
    }
  }
  if (last < html.length) at.kids.push(decode(html.slice(last)));
  return shape(root);
}

// html > head + body, as a browser makes them: what stands before the first piece of content goes in the head.
function shape(root: El): El {
  const kids = root.kids;
  let page = kids.find((k): k is El => typeof k !== 'string' && k.tag === 'html');
  if (!page) {
    page = { tag: 'html', attrs: {}, kids: kids.filter((k) => typeof k === 'string' ? false : true), up: root };
    root.kids = [page];
    for (const k of page.kids) if (typeof k !== 'string') k.up = page;
  }
  if (page.kids.some((k) => typeof k !== 'string' && k.tag === 'body')) return root;
  const head: El = { tag: 'head', attrs: {}, kids: [], up: page };
  const body: El = { tag: 'body', attrs: {}, kids: [], up: page };
  const own = page.kids.find((k): k is El => typeof k !== 'string' && k.tag === 'head');
  let inHead = !own;
  for (const k of page.kids) {
    if (k === own) continue;
    const el = typeof k === 'string' ? null : k;
    if (inHead && (typeof k === 'string' ? !k.trim() : HEAD.has(k.tag))) head.kids.push(k);
    else {
      inHead = false;
      body.kids.push(k);
    }
    if (el) el.up = el === own ? page : inHead ? head : body;
  }
  for (const k of head.kids) if (typeof k !== 'string') k.up = head;
  for (const k of body.kids) if (typeof k !== 'string') k.up = body;
  page.kids = [own || head, body];
  return root;
}

const els = (n: El) => n.kids.filter((k): k is El => typeof k !== 'string');
// The elements below n in page order, found with a stack of its own: a page nested deeper than the call stack is fine.
function all(n: El): El[] {
  const out: El[] = [];
  const todo = [...els(n)].reverse();
  for (let e = todo.pop(); e; e = todo.pop()) {
    out.push(e);
    todo.push(...els(e).reverse());
  }
  return out;
}
const words = (n: El, visible: boolean): string => {
  let out = '';
  const todo: (El | string)[] = [...n.kids].reverse();
  for (let k = todo.pop(); k !== undefined; k = todo.pop()) {
    if (typeof k === 'string') out += k;
    else if (!(visible && (k.tag === 'script' || k.tag === 'style'))) todo.push(...[...k.kids].reverse());
  }
  return out;
};
/** An element's textContent, as the widget reads it (a script's words are in it). */
export const textOf = (n: El): string => words(n, false);
/** The words a reader sees: textContent without scripts and styles. */
export const visibleText = (n: El): string => words(n, true);
const squash = (t: string, n = 1e9) => t.replace(/\s+/g, ' ').trim().slice(0, n);

// ---------- selectors: tag, #id, .class, [attr], [attr=v ^= $= *= ~= |=], :nth-of-type(n), :first-child, :last-child, and ' ', >, +, ~ ----------
type Part = { tag?: string; test: ((e: El) => boolean)[] };
const sibs = (e: El) => (e.up ? els(e.up) : [e]);
function compound(src: string): Part | null {
  const part: Part = { test: [] };
  const re = /^(?:(\*|[\w-]+)|#([\w-]+)|\.([\w-]+)|\[\s*([\w:-]+)\s*(?:([~|^$*]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]*))\s*)?\]|:(first-child|last-child|first-of-type|last-of-type|nth-of-type\(\s*(\d+)\s*\)|nth-child\(\s*(\d+)\s*\)))/;
  for (let rest = src; rest; ) {
    const m = re.exec(rest);
    if (!m) return null;
    rest = rest.slice(m[0].length);
    if (m[1] && m[1] !== '*') part.tag = m[1].toLowerCase();
    else if (m[2]) part.test.push((e) => e.attrs.id === m[2]);
    else if (m[3]) part.test.push((e) => (e.attrs.class || '').split(/\s+/).includes(m[3]));
    else if (m[4]) {
      const [name, op, val] = [m[4].toLowerCase(), m[5], m[6] ?? m[7] ?? m[8] ?? ''];
      part.test.push((e) => {
        const v = e.attrs[name];
        return v === undefined ? false : !op ? true : op === '=' ? v === val : op === '^=' ? v.startsWith(val) : op === '$=' ? v.endsWith(val) : op === '*=' ? v.includes(val) : op === '~=' ? v.split(/\s+/).includes(val) : v === val || v.startsWith(val + '-');
      });
    } else if (m[9]) {
      const k = m[9];
      const same = (e: El) => sibs(e).filter((s) => s.tag === e.tag);
      part.test.push(
        k === 'first-child' ? (e) => sibs(e)[0] === e
        : k === 'last-child' ? (e) => sibs(e).at(-1) === e
        : k === 'first-of-type' ? (e) => same(e)[0] === e
        : k === 'last-of-type' ? (e) => same(e).at(-1) === e
        : m[10] ? (e) => same(e)[Number(m[10]) - 1] === e
        : (e) => sibs(e)[Number(m[11]) - 1] === e,
      );
    }
  }
  return part;
}
const is = (e: El, p: Part) => (!p.tag || e.tag === p.tag) && p.test.every((t) => t(e));

/** A selector as its alternatives, each a list of compound selectors and the combinator before it: a space inside [..],
 *  (..) or quotes is part of its compound, a comma too. Null when it can't be split (an unclosed bracket or quote). */
function split(selector: string): { op: string; src: string }[][] | null {
  const out: { op: string; src: string }[][] = [[]];
  let cur = '';
  let op = ' ';
  let depth = 0;
  let quote = '';
  const flush = () => {
    if (cur) out.at(-1)!.push({ op, src: cur });
    if (cur) op = ' ';
    cur = '';
  };
  for (const ch of selector) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
    } else if (ch === '[' || ch === '(') {
      depth++;
      cur += ch;
    } else if (ch === ']' || ch === ')') {
      depth--;
      cur += ch;
    } else if (depth === 0 && /\s/.test(ch)) flush();
    else if (depth === 0 && /[>+~]/.test(ch)) {
      flush();
      op = ch;
    } else if (depth === 0 && ch === ',') {
      flush();
      if (!out.at(-1)!.length) return null;
      out.push([]);
      op = ' ';
    } else cur += ch;
  }
  flush();
  return quote || depth || !out.at(-1)!.length ? null : out;
}

/** The elements a selector matches in the page's order; null when it uses something this does not read (so it can't be checked). */
export function select(root: El, selector: string): El[] | null {
  const alts = split(selector);
  if (!alts) return null;
  const found = new Set<El>();
  const pool = all(root).filter((e) => e.tag !== '#root');
  for (const alt of alts) {
    const chain: { op: string; part: Part }[] = [];
    for (const t of alt) {
      const part = compound(t.src);
      if (!part) return null;
      chain.push({ op: t.op, part });
    }
    // Each (element, step) is asked once: a descendant combinator that finds nothing would otherwise try every ancestor
    // of every ancestor.
    const memo = new Map<El, Map<number, boolean>>();
    const reach = (e: El, i: number): boolean => {
      const seen = memo.get(e)?.get(i);
      if (seen !== undefined) return seen;
      const r = (() => {
        if (!is(e, chain[i].part)) return false;
        if (!i) return true;
        const rel = chain[i].op;
        if (rel === '>') return Boolean(e.up) && reach(e.up!, i - 1);
        if (rel === '+') {
          const s = sibs(e);
          const k = s.indexOf(e);
          return k > 0 && reach(s[k - 1], i - 1);
        }
        if (rel === '~') return sibs(e).slice(0, sibs(e).indexOf(e)).some((s) => reach(s, i - 1));
        for (let a = e.up; a; a = a.up) if (reach(a, i - 1)) return true;
        return false;
      })();
      if (!memo.has(e)) memo.set(e, new Map());
      memo.get(e)!.set(i, r);
      return r;
    };
    for (const e of pool) if (reach(e, chain.length - 1)) found.add(e);
  }
  return pool.filter((e) => found.has(e));
}

// ---------- what the widget would say about an element (anchorAt, openingTag) ----------
const generated = (v: string) => GENERATED.test(v || '');
/** The element's opening tag as the widget writes it: id, class, alt, role, aria-label, href and data-*, made-up ids and classes left out. */
function openingTag(e: El): string {
  const attrs = Object.entries(e.attrs)
    .filter(([n]) => /^(id|class|alt|role|aria-label|href|data-[\w-]+)$/.test(n))
    .map(([n, v]) => [n, n === 'class' ? v.split(/\s+/).filter((c) => c && !generated(c)).join(' ') : n === 'id' && generated(v) ? '' : v])
    .filter(([n, v]) => v || !/^(id|class)$/.test(n))
    .map(([n, v]) => `${n}="${squash(v, 60)}"`);
  return `<${e.tag}${attrs.length ? ` ${attrs.join(' ')}` : ''}>`.slice(0, 200);
}

/** What the widget saves with a pin on this element: its tag, words, the box with an id around it and the heading above it. */
export function describe(root: El, e: El): { element: string; text?: string; inside?: string; section?: string; block?: string } {
  const out: ReturnType<typeof describe> = { element: openingTag(e) };
  // The widget keeps an element's words when its textContent is short, cut to 80; one with a name this does not know is left out.
  const content = textOf(e);
  if (squash(content) && e.tag !== 'body' && content.length < 400 && !rawEntity(content)) out.text = squash(content).slice(0, 80);
  const inside = (() => {
    for (let a = e.up; a; a = a.up) if (a.attrs.id || a.attrs['data-lab']) return a;
  })();
  if (inside) out.inside = inside.attrs['data-lab'] ? `[data-lab="${inside.attrs['data-lab']}"]` : `#${inside.attrs.id}`;
  // The last h1 to h3 that starts before it (or holds it), in the page's order.
  let heading: El | null = null;
  for (const n of all(root)) {
    if (n === e) break;
    if (/^h[123]$/.test(n.tag)) heading = n;
  }
  for (let a: El | null = e; a; a = a.up) if (/^h[123]$/.test(a.tag)) heading = a;
  if (heading) out.section = squash(textOf(heading), 100);
  for (let b: El | null = e; b && b.tag !== 'body' && b.tag !== 'html'; b = b.up) {
    if (b.attrs.id) {
      out.block = b.attrs.id;
      break;
    }
  }
  return out;
}
/** Words in an element as a text pin quotes them: the words and up to 40 characters either side; how many times they stand
 *  there. Null when they are not there; 'unsure' when the element holds a name this does not know (what the browser shows
 *  in its place is not known). */
export function quoteIn(e: El, exact: string): { quote: { exact: string; prefix: string; suffix: string }; times: number } | null | 'unsure' {
  const raw = visibleText(e);
  const full = squash(raw);
  const want = squash(exact);
  if (!want) return null;
  const at = full.indexOf(want);
  if (rawEntity(raw)) return at < 0 ? 'unsure' : rawEntity(full.slice(Math.max(0, at - 40), at + want.length + 40)) || rawEntity(want) ? 'unsure' : quote(full, want, at);
  return at < 0 ? null : quote(full, want, at);
}
function quote(full: string, want: string, at: number) {
  let times = 0;
  for (let i = full.indexOf(want); i >= 0; i = full.indexOf(want, i + 1)) times++;
  return { quote: { exact: want.slice(0, 300), prefix: full.slice(Math.max(0, at - 40), at), suffix: full.slice(at + want.length, at + want.length + 40) }, times };
}
