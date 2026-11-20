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
  option: [['option'], ['select', 'datalist', 'optgroup']],
};
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', copy: '©' };
const decode = (s: string) =>
  s.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (m, d, h, n) => {
    try {
      return d ? String.fromCodePoint(Number(d)) : h ? String.fromCodePoint(parseInt(h, 16)) : ENTITIES[n.toLowerCase()] ?? m;
    } catch {
      return m;
    }
  });

/** The page's HTML as the browser would build it: html, head and body there even when the source leaves them out. */
export function parseHtml(html: string): El {
  const root: El = { tag: '#root', attrs: {}, kids: [], up: null };
  let at = root;
  const push = (tag: string, attrs: Record<string, string>) => {
    const el: El = { tag, attrs, kids: [], up: at };
    at.kids.push(el);
    return el;
  };
  const re = /<!--[\s\S]*?-->|<![^>]*>|<\?[^>]*>|<\/([a-zA-Z][^\s>/]*)[^>]*>|<([a-zA-Z][^\s>/]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
  let last = 0;
  for (let m; (m = re.exec(html)); ) {
    if (m.index > last) at.kids.push(decode(html.slice(last, m.index)));
    last = re.lastIndex;
    if (m[1]) {
      const name = m[1].toLowerCase();
      for (let n: El | null = at; n && n !== root; n = n.up)
        if (n.tag === name) {
          at = n.up || root;
          break;
        }
      continue;
    }
    if (!m[2]) continue;
    const tag = m[2].toLowerCase();
    const attrs: Record<string, string> = {};
    for (const a of m[3].matchAll(/([^\s=/"'<>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) attrs[a[1].toLowerCase()] ??= decode(a[2] ?? a[3] ?? a[4] ?? '');
    const rule = CLOSES[tag];
    if (rule) for (let n: El | null = at; n && n !== root && !rule[1].includes(n.tag); n = n.up) if (rule[0].includes(n.tag)) { at = n.up || root; break; }
    if (BLOCK.has(tag)) for (let n: El | null = at; n && n !== root && n.tag !== 'button'; n = n.up) if (n.tag === 'p') { at = n.up || root; break; }
    const el = push(tag, attrs);
    if (VOID.has(tag) || /\/\s*$/.test(m[3])) continue;
    if (RAW.has(tag)) {
      const end = html.slice(re.lastIndex).search(new RegExp(`</${tag}\\s*>`, 'i'));
      const stop = end < 0 ? html.length : re.lastIndex + end;
      if (tag !== 'script' && tag !== 'style') el.kids.push(decode(html.slice(re.lastIndex, stop)));
      re.lastIndex = last = end < 0 ? html.length : stop + html.slice(stop).indexOf('>') + 1;
      continue;
    }
    at = el;
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
function all(n: El, out: El[] = []): El[] {
  for (const k of els(n)) (out.push(k), all(k, out));
  return out;
}
/** An element's words as the page reads them: tags gone, runs of spaces one, no words from scripts and styles. */
export const textOf = (n: El): string => n.kids.map((k) => (typeof k === 'string' ? k : k.tag === 'script' || k.tag === 'style' ? '' : textOf(k))).join('');
const squash = (t: string, n = 1e9) => t.replace(/\s+/g, ' ').trim().slice(0, n);

// ---------- selectors: tag, #id, .class, [attr], [attr=v ^= $= *=], :nth-of-type(n), :first-child, :last-child, and ' ', >, +, ~ ----------
type Part = { tag?: string; test: ((e: El) => boolean)[] };
const sibs = (e: El) => (e.up ? els(e.up) : [e]);
function compound(src: string): Part | null {
  const part: Part = { test: [] };
  const re = /^(?:(\*|[\w-]+)|#([\w-]+)|\.([\w-]+)|\[\s*([\w:-]+)\s*(?:([~|^$*]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]*))\s*)?\]|:(first-child|last-child|first-of-type|last-of-type|nth-of-type\(\s*(\d+)\s*\)|nth-child\(\s*(\d+)\s*\)))/;
  for (let rest = src; rest; ) {
    const m = re.exec(rest);
    if (!m) return null;
    rest = rest.slice(m[0].length);
    if (m[1]) m[1] !== '*' && (part.tag = m[1].toLowerCase());
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

/** The elements a selector matches in the page's order; null when it uses something this does not read (so it can't be checked). */
export function select(root: El, selector: string): El[] | null {
  const found = new Set<El>();
  const pool = all(root).filter((e) => e.tag !== '#root');
  for (const one of selector.split(/,(?![^[]*\])/)) {
    const toks = one.trim().replace(/\s*([>+~])\s*/g, ' $1 ').split(/\s+/).filter(Boolean);
    if (!toks.length) return null;
    const chain: { op: string; part: Part }[] = [];
    let op = ' ';
    for (const t of toks) {
      if (/^[>+~]$/.test(t)) op = t;
      else {
        const part = compound(t);
        if (!part) return null;
        chain.push({ op, part });
        op = ' ';
      }
    }
    const reach = (e: El, i: number): boolean => {
      if (!is(e, chain[i].part)) return false;
      if (!i) return true;
      const rel = chain[i].op;
      if (rel === '>') return Boolean(e.up) && reach(e.up!, i - 1);
      if (rel === '+') return (() => { const s = sibs(e); const k = s.indexOf(e); return k > 0 && reach(s[k - 1], i - 1); })();
      if (rel === '~') return sibs(e).slice(0, sibs(e).indexOf(e)).some((s) => reach(s, i - 1));
      for (let a = e.up; a; a = a.up) if (reach(a, i - 1)) return true;
      return false;
    };
    for (const e of pool) if (reach(e, chain.length - 1)) found.add(e);
  }
  return pool.filter((e) => found.has(e));
}

// ---------- what the widget would say about an element (anchorAt, openingTag) ----------
const generated = (v: string) => GENERATED.test(v || '');
/** The element's opening tag as the widget writes it: id, class, alt, role, aria-label, href and data-*, made-up ids and classes left out. */
export function openingTag(e: El): string {
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
  const words = squash(textOf(e));
  if (words && e.tag !== 'body' && textOf(e).length < 400) out.text = words.slice(0, 80);
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
/** Words in an element as a text pin quotes them: the words and up to 40 characters either side; how many times they stand there. */
export function quoteIn(e: El, exact: string): { quote: { exact: string; prefix: string; suffix: string }; times: number } | null {
  const full = squash(textOf(e));
  const want = squash(exact);
  const at = want ? full.indexOf(want) : -1;
  if (at < 0) return null;
  let times = 0;
  for (let i = full.indexOf(want); i >= 0; i = full.indexOf(want, i + 1)) times++;
  return { quote: { exact: want.slice(0, 300), prefix: full.slice(Math.max(0, at - 40), at), suffix: full.slice(at + want.length, at + want.length + 40) }, times };
}
