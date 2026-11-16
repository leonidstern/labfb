// Zoom: from one block of a lab page, step out to the bigger picture or in to a deeper look. Either way the agent
// writes one block and the lab places it: a bigger picture above the part of the page the block is in, a deeper look
// right after it. What "bigger" and "deeper" mean depends on the page: skills/labit/zoom/ has one skill per kind.
// No Node here: the widget bundles this file too.
//
// The trail is a text file beside the page, one JSON object per line, oldest first:
//   {"id":"t4","kind":"pin|pick|make|change|answer","by":"<name>|agent","from":["t2"],"on":"<block id>","what":"one line",
//    "pin":"<comment id>","at":"<ISO time>","dropped":[{"what":"…","why":"…"}]}
// A block is an element with an id. Its steps are the ones that name it in `on`, plus the ones its `data-from` lists.
// The agent reads the trail for context; the zoom card shows a block's steps under "how we got here".

export type Step = {
  id: string;
  kind: string;
  by: string;
  what: string;
  from?: string[];
  on?: string;
  pin?: string;
  at?: string;
  zoom?: string; // on the two steps of a zoom ("in" or "out"): the request, and the block the agent made for it
  dropped?: { what: string; why: string }[];
};
export type Dir = 'in' | 'out';

/** A zoom as the widget sends it on a pin's anchor. */
export const ZOOM = /^(in|out)$/;
export const dirOf = (zoom: unknown): Dir | null => (zoom === 'in' || zoom === 'out' ? zoom : null);
/** The fixed words a zoom is sent with: they read as a comment, and the trail keeps them as the person's words. */
export const zoomWords = (dir: Dir) => (dir === 'out' ? 'zoom out: the bigger picture' : 'zoom in: dive deeper');
/** How the made block is named on the page and in the card. */
export const zoomName = (dir: Dir) => (dir === 'out' ? 'bigger picture' : 'deeper look');

export const parseTrail = (text: string): Step[] =>
  String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .flatMap((l) => {
      try {
        const s = JSON.parse(l);
        return s && typeof s.id === 'string' ? [s as Step] : [];
      } catch {
        return []; // a line half written: the others still count
      }
    });
export const trailLine = (s: Step) => JSON.stringify(s);
const nextId = (steps: Step[]) => `t${Math.max(0, ...steps.map((s) => Number(String(s.id).replace(/^t/, '')) || 0)) + 1}`;

/** The steps that made a block: the ones on it, and the ones its data-from names. Nearest first. */
export function stepsOf(steps: Step[], blockId: string, dataFrom = ''): string[] {
  const marked = new Set(dataFrom.split(/\s+/).filter(Boolean));
  return steps.filter((s) => (s.on === blockId && !s.zoom) || marked.has(s.id)).map((s) => s.id).reverse();
}
/**
 * Zoom out ×n from a block's steps: 1 = those steps and the ones directly behind them, 2 = everything that leads to
 * them, 3 = every step on the page. `on` says which of the returned steps lead to the block.
 */
export function zoomOut(steps: Step[], own: string[], n: number): { steps: Step[]; on: Set<string> } {
  const by = new Map(steps.map((s) => [s.id, s]));
  const on = new Set<string>();
  const queue = own.filter((id) => by.has(id));
  const deep = n >= 2;
  for (const id of queue) on.add(id);
  for (let i = 0; i < queue.length; i++) {
    for (const f of by.get(queue[i])?.from || []) {
      if (!by.has(f) || on.has(f)) continue;
      on.add(f);
      if (deep) queue.push(f);
    }
  }
  return { steps: n >= 3 ? steps : steps.filter((s) => on.has(s.id)), on };
}

// ---------- finding blocks in a page's HTML (no parser: a tag and its matching close, counted) ----------
type El = { tag: string; open: string; a: Record<string, string>; start: number; end: number; outer: string };
const reEsc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const attrs = (open: string): Record<string, string> =>
  Object.fromEntries([...open.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*"([^"]*)"/g)].map((m) => [m[1], m[2]]));
const VOID = /^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/i;
function elementAt(html: string, m: RegExpExecArray): El | null {
  const tag = m[1];
  const start = m.index;
  if (VOID.test(tag) || m[0].endsWith('/>')) return { tag, open: m[0], a: attrs(m[0]), start, end: start + m[0].length, outer: m[0] };
  const re = new RegExp(`<(/?)${reEsc(tag)}\\b[^>]*>`, 'gi');
  re.lastIndex = start + m[0].length;
  let depth = 1;
  let k: RegExpExecArray | null;
  while ((k = re.exec(html))) {
    if (k[0].endsWith('/>')) continue;
    depth += k[1] ? -1 : 1;
    if (!depth) return { tag, open: m[0], a: attrs(m[0]), start, end: re.lastIndex, outer: html.slice(start, re.lastIndex) };
  }
  return null;
}
const TAG = '<([a-zA-Z][a-zA-Z0-9-]*)\\b[^>]*';
export function blockById(html: string, id: string): El | null {
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

export type PlaceIn = {
  html: string; // the page
  trail: string; // its trail file ('' when there is none yet)
  block: string; // the block's id
  dir: Dir;
  made: string; // what the agent wrote: one element
  what: string; // one line about it: the agent's step in the trail
  by: string; // who asked
  words: string; // their words on the pin
  pin?: string; // the pin's id: a second hand-over for the same pin is refused
  at?: string;
};
export type PlaceOut = { html: string; trail: string; id: string; steps: Step[] };

const MARKS = /\s(?:id|data-zoom|data-zoom-of|data-from)="[^"]*"/g;
/** The block a zoom already made from this one, in this direction: the card goes to it instead of asking again. */
export function zoomedFrom(html: string, block: string, dir: Dir): string | null {
  const m = new RegExp(`<[^>]*\\bdata-zoom="${dir}"[^>]*\\bdata-zoom-of="${reEsc(block)}"[^>]*>`).exec(html);
  return m ? attrs(m[0]).id || null : null;
}
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
 * The lab's part of a zoom: checks what the agent made (one element), puts it on the page (a deeper look right after
 * the part of the page the block is in, a bigger picture right before it), names and marks it, and adds the request and
 * the agent's step to the trail. Nothing else on the page is touched. Throws a ZoomError that says what to fix.
 */
export function place(p: PlaceIn): PlaceOut {
  const block = blockById(p.html, p.block);
  if (!block) throw new ZoomError(`no block with id "${p.block}" on the page`);
  const steps = parseTrail(p.trail);
  if (p.pin && steps.some((s) => s.pin === p.pin && s.kind === 'make')) throw new ZoomError(`the ${zoomName(p.dir)} for this pin is already on the page`);
  const els = topLevel(p.made);
  if (els.length !== 1) throw new ZoomError(`send one element (a <section> with everything inside it), you sent ${els.length}`);
  const what = p.what.split('\n').map((l) => l.trim()).find(Boolean);
  if (!what) throw new ZoomError(`say in one line what the ${zoomName(p.dir)} is`);
  const el = els[0];
  const base = `${p.block}-${p.dir === 'out' ? 'bigger' : 'deeper'}`;
  let id = base;
  for (let n = 2; blockById(p.html, id); n++) id = `${base}-${n}`;
  const own = stepsOf(steps, p.block, block.a['data-from'] || '');
  const pinStep: Step = { id: nextId(steps), kind: 'pin', by: p.by, ...(own[0] ? { from: [own[0]] } : {}), on: p.block, what: p.words, zoom: p.dir, ...(p.pin ? { pin: p.pin } : {}), ...(p.at ? { at: p.at } : {}) };
  const make: Step = { id: nextId([...steps, pinStep]), kind: 'make', by: 'agent', from: [pinStep.id], on: id, what, zoom: p.dir, ...(p.pin ? { pin: p.pin } : {}), ...(p.at ? { at: p.at } : {}) };
  const marks = ` id="${id}" data-zoom="${p.dir}" data-zoom-of="${p.block}" data-from="${make.id}"`;
  const open = el.open.replace(MARKS, '').replace(new RegExp(`^<${reEsc(el.tag)}`), `<${el.tag}${marks}`);
  const placed = el.outer.replace(el.open, open).trim();
  const part = partOf(p.html, block);
  // A deeper look goes after the part and after the deeper looks already there, so they read in the order asked; a
  // bigger picture goes right above the part, the newest nearest.
  let end = part.end;
  for (;;) {
    const m = /^\s*<([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*\bdata-zoom="in"[^>]*>/.exec(p.html.slice(end));
    const next = m && elementAt(p.html, Object.assign(m, { index: end + m[0].indexOf('<') }) as RegExpExecArray);
    if (!next) break;
    end = next.end;
  }
  const html = p.dir === 'in' ? p.html.slice(0, end) + '\n' + placed + p.html.slice(end) : p.html.slice(0, part.start) + placed + '\n' + p.html.slice(part.start);
  return {
    html,
    trail: (p.trail.trim() ? p.trail.replace(/\n*$/, '\n') : '') + trailLine(pinStep) + '\n' + trailLine(make) + '\n',
    id,
    steps: [pinStep, make],
  };
}

/**
 * An agent's answer on a pin, kept in the trail: the pin first (once), then the answer. "Done …" is a change, anything
 * else an answer. Returns the lines to add, or none when the pin names no block.
 */
export function record(trail: string, r: { pin: string; block: string; by: string; words: string; pinAt?: string; reply: string; at?: string }): string {
  if (!r.block || !r.pin) return '';
  const steps = parseTrail(trail);
  const add: Step[] = [];
  let pinStep = steps.find((s) => s.pin === r.pin && s.kind === 'pin');
  if (!pinStep) {
    const before = [...steps].reverse().find((s) => s.on === r.block);
    pinStep = { id: nextId(steps), kind: 'pin', by: r.by, ...(before ? { from: [before.id] } : {}), on: r.block, what: r.words.replace(/\s+/g, ' ').trim().slice(0, 300), pin: r.pin, ...(r.pinAt ? { at: r.pinAt } : {}) };
    add.push(pinStep);
  }
  const text = r.reply.replace(/\s+/g, ' ').trim();
  if (!text) return add.map((s) => trailLine(s) + '\n').join('');
  add.push({ id: nextId([...steps, ...add]), kind: /^done\b/i.test(text) ? 'change' : 'answer', by: 'agent', from: [pinStep.id], on: r.block, what: text.replace(/^done[:.\s]*/i, '').slice(0, 300) || text.slice(0, 300), pin: r.pin, ...(r.at ? { at: r.at } : {}) });
  return add.map((s) => trailLine(s) + '\n').join('');
}
