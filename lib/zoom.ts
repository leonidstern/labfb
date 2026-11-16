// Zoom: from one block of a lab page, a deeper look into it or the bigger picture around it. The agent writes one
// block and the lab places it: a deeper look right after the part of the page the block is in, a bigger picture right
// above it. skills/labit/zoom.md says what the agent writes. No Node here: the widget bundles this file too.

export type Dir = 'in' | 'out';

/** A zoom as the widget sends it on a pin's anchor. */
export const dirOf = (zoom: unknown): Dir | null => (zoom === 'in' || zoom === 'out' ? zoom : null);
/** The fixed words a zoom is sent with: they read as a comment. */
export const zoomWords = (dir: Dir) => (dir === 'out' ? 'zoom out: the bigger picture' : 'zoom in: dive deeper');
/** How the made block is named in messages. */
export const zoomName = (dir: Dir) => (dir === 'out' ? 'bigger picture' : 'deeper look');

// ---------- finding blocks in a page's HTML (no parser: a tag and its matching close, counted) ----------
type El = { tag: string; open: string; start: number; end: number; outer: string };
const reEsc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const VOID = /^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/i;
function elementAt(html: string, m: RegExpExecArray): El | null {
  const tag = m[1];
  const start = m.index;
  if (VOID.test(tag) || m[0].endsWith('/>')) return { tag, open: m[0], start, end: start + m[0].length, outer: m[0] };
  const re = new RegExp(`<(/?)${reEsc(tag)}\\b[^>]*>`, 'gi');
  re.lastIndex = start + m[0].length;
  let depth = 1;
  let k: RegExpExecArray | null;
  while ((k = re.exec(html))) {
    if (k[0].endsWith('/>')) continue;
    depth += k[1] ? -1 : 1;
    if (!depth) return { tag, open: m[0], start, end: re.lastIndex, outer: html.slice(start, re.lastIndex) };
  }
  return null;
}
const TAG = '<([a-zA-Z][a-zA-Z0-9-]*)\\b[^>]*';
function blockById(html: string, id: string): El | null {
  const m = new RegExp(`${TAG}\\bid="${reEsc(id)}"[^>]*>`).exec(html);
  return m ? elementAt(html, m) : null;
}
function topLevel(html: string): El[] {
  const re = /<([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*>/g;
  const out: El[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const e = elementAt(html, m);
    if (!e) throw new ZoomError(`a <${m[1]}> in what you sent is not closed`);
    out.push(e);
    re.lastIndex = e.end;
  }
  return out;
}
/** What went wrong with a zoom, in words for the agent that sent it. */
export class ZoomError extends Error {}

const MARKS = /\s(?:id|data-zoom|data-zoom-of)="[^"]*"/g;
/**
 * The part of the page a block is in, which a made block goes next to: the outermost <section> around it (or the block,
 * when it is one); on a page without sections, the child of <main> (or <body>) around it.
 */
function partOf(html: string, block: El): El {
  const sec = /<section\b[^>]*>/gi;
  let q: RegExpExecArray | null;
  while ((q = sec.exec(html)) && q.index <= block.start) {
    const e = elementAt(html, Object.assign(q, { 1: 'section' }) as RegExpExecArray);
    if (e && e.start <= block.start && e.end >= block.end) return e;
    if (e) sec.lastIndex = e.end;
  }
  const m = /<(main)\b[^>]*>/i.exec(html) || /<(body)\b[^>]*>/i.exec(html);
  const box = m ? elementAt(html, m) : null;
  if (!box || block.start < box.start || block.end > box.end) return block;
  const re = /<([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*>/g;
  re.lastIndex = box.start + box.open.length;
  let k: RegExpExecArray | null;
  while ((k = re.exec(html)) && k.index < box.end) {
    const e = elementAt(html, k);
    if (!e) break;
    if (e.start <= block.start && e.end >= block.end) return e;
    re.lastIndex = e.end;
  }
  return block;
}

/**
 * The lab's part of a zoom: checks what the agent made (one element), puts it on the page (a deeper look after the
 * part the block is in and after the deeper looks already there, a bigger picture right above the part), names and
 * marks it. Nothing else on the page is touched. Throws a ZoomError that says what to fix.
 */
export function place(p: { html: string; block: string; dir: Dir; made: string }): { html: string; id: string } {
  const block = blockById(p.html, p.block);
  if (!block) throw new ZoomError(`no block with id "${p.block}" on the page`);
  const els = topLevel(p.made);
  if (els.length !== 1) throw new ZoomError(`send one element (a <section> with everything inside it), you sent ${els.length}`);
  const el = els[0];
  const base = `${p.block}-${p.dir === 'out' ? 'bigger' : 'deeper'}`;
  let id = base;
  for (let n = 2; blockById(p.html, id); n++) id = `${base}-${n}`;
  const open = el.open.replace(MARKS, '').replace(new RegExp(`^<${reEsc(el.tag)}`), `<${el.tag} id="${id}" data-zoom="${p.dir}" data-zoom-of="${p.block}"`);
  const placed = el.outer.replace(el.open, open).trim();
  const part = partOf(p.html, block);
  let end = part.end;
  for (;;) {
    const m = /^\s*<([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*\bdata-zoom="in"[^>]*>/.exec(p.html.slice(end));
    const next = m && elementAt(p.html, Object.assign(m, { index: end + m[0].indexOf('<') }) as RegExpExecArray);
    if (!next) break;
    end = next.end;
  }
  const html = p.dir === 'in' ? p.html.slice(0, end) + '\n' + placed + p.html.slice(end) : p.html.slice(0, part.start) + placed + '\n' + p.html.slice(part.start);
  return { html, id };
}
