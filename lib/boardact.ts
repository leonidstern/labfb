// What the board commands do (labit board new / add / move / pick / list), on the stored board. Loaded by local.mjs when
// one is run, so a lab that only serves boards does not read it.
import fs from 'node:fs';
import path from 'node:path';
import { CAPTION, MAX_FRAMES, NAME, PRESETS, heightFor, labPath, names, nameOf, one, read, save, frameFile, writeAtomic, type Board, type Frame } from './board.ts';

export const MAX_VARIANTS = 6;
export const MAX_SLIDES = 30;
/** The text a person gave, as a board name: "Pricing hero" is pricing-hero. */
export const slug = (t: string) => t.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'board';
const idOf = (n: number) => (n < 26 ? String.fromCharCode(97 + n) : `z${n - 24}`);
export const nextId = (frames: Frame[]) => {
  for (let n = frames.length; ; n++) if (!frames.some((f) => f.id === idOf(n))) return idOf(n);
};
const route = (name: string, id: string) => `/_lab/board/${name}/${id}`;

/** A plain page as a variant: the same page, its relative links kept by a base at the page's own folder. */
export const seed = (html: string, rel: string) => {
  if (/<base\b/i.test(html)) return html;
  const dir = path.posix.dirname(rel.split(path.sep).join('/'));
  const tag = `<base href="${dir === '.' ? '/' : `/${dir.split('/').map(encodeURIComponent).join('/')}/`}">`;
  const at = /<head[^>]*>/i.exec(html) || /<!doctype[^>]*>/i.exec(html);
  return at ? html.slice(0, at.index + at[0].length) + tag + html.slice(at.index + at[0].length) : tag + html;
};

// ---------- what an agent reads ----------
/** The board as plain text: one line per frame, in order. `pins(frame)` is its open pins. */
export function text(b: Board, o: { origin: string; file?: string | null; json?: boolean; pins?: (f: Frame) => number }): string {
  const lines = [`# Board ${b.name}${b.title ? ` · ${b.title}` : ''}`, `url: ${o.origin}/_lab/board/${b.name}`];
  if (b.of) lines.push(`of: ${b.of.replace('#', ' #')}${o.file ? ` (file ${o.file})` : ''}`);
  if (b.flow) lines.push('flow: the frames are steps, in this order (the canvas draws arrows)');
  if (o.json) lines.push(`file: .lab/boards/${b.name}.json`);
  if (b.frames.some((f) => f.src.startsWith('/_lab/'))) lines.push(`folder: .lab/boards/${b.name}/ (edit a frame's file; it reloads)`);
  for (const f of b.frames) {
    const open = o.pins?.(f) || 0;
    lines.push([f.id, f.src.startsWith('/_lab/') ? `${f.id}.html` : f.src, `${f.w}×${f.h}`, f.label && `"${f.label}"`, f.caption && `caption "${f.caption}"`, f.variantOf && `variant of ${f.variantOf}`, f.state && f.state !== 'live' && f.state, open && `${open} open`].filter(Boolean).join('  '));
  }
  return lines.join('\n') + '\n';
}
/** The line a pin on a frame carries: which frame, of which board. A picked frame also says what to do. */
export const frameLine = (b: Board, f: Frame, file?: string | null) => {
  const beside = b.frames.filter((g) => g.id !== f.id && g.state !== 'archived').map((g) => g.id);
  const gone = b.frames.filter((g) => g.state === 'archived').map((g) => g.id);
  const line = `frame: ${f.id} of board ${b.name} (${[b.of && `variant of ${b.of.replace('#', ' #')}`, `${f.w}×${f.h}`, f.label && `"${f.label}"`, beside.length && `beside ${beside.slice(0, 6).join(', ')}`].filter(Boolean).join(', ')})`;
  return f.state === 'picked' ? `${line}\npicked: ${gone.length ? `${gone.join(', ')} archived, files kept. ` : ''}${b.of ? `Put ${f.id}'s change into ${file || b.of.split('#')[0]}, then reply --done.` : ''}`.trimEnd() : line;
};

// ---------- slides ----------
const SLIDES_CSS = `/* The look of every slide of this deck: one file, so changing it changes them all. */
html,body{margin:0;width:1920px;height:1080px;overflow:hidden;background:var(--lab-bg,#fff);color:var(--lab-fg,#1d1d1b)}
.slide{position:relative;box-sizing:border-box;width:1920px;height:1080px;padding:120px 140px;display:flex;flex-direction:column;gap:48px;font:400 44px/1.4 var(--lab-font,system-ui,sans-serif)}
.slide h1{margin:0;font-size:96px;line-height:1.05;font-weight:600;letter-spacing:-.02em}
.slide .body{flex:1;min-height:0}
.slide .body p{margin:0 0 .6em}
.slide .n{position:absolute;right:140px;bottom:80px;margin:0;font-size:32px;color:var(--lab-muted,rgba(0,0,0,.5))}
`;
const slideHtml = (board: string, n: number) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Slide ${n}</title>
<link rel="stylesheet" href="/_lab/lab.css"><link rel="stylesheet" href="/_lab/board/${board}/slides.css"></head>
<body><section class="slide"><h1>Title</h1><div class="body"><p>Body</p></div><p class="n">${n}</p></section></body></html>
`;
export const slidesFile = (e: { root: string }, name: string) => path.join(path.dirname(frameFile(e.root, name, 'a')), 'slides.css');

/** A --size: its width and height, or the reason it is refused. */
const sizeOf = (size?: string): [number, number] | undefined | string => {
  if (size === undefined) return undefined;
  return PRESETS[String(size)] ?? `--size is one of ${Object.keys(PRESETS).join(', ')} (got ${String(size).slice(0, 20)})`;
};
/** A caption as given: one line, at most CAPTION characters. */
const cap = (t: unknown) => one(t, CAPTION) || undefined;

// ---------- the changes ----------
type Ask = { name?: string; topic?: string; of?: string; variants?: number; widths?: string; flow?: string; target?: string; label?: string; width?: number; after?: string; first?: boolean; frame?: string; frames?: string[]; caption?: string; captions?: string; size?: string; slides?: number; text?: string };
type Env = { root: string; origin: string; open: (key: string) => number; titleOf: (page: string) => string; fileOf: (page: string) => string | null; proxied: boolean };
export type Done = { text: string; board?: Board; picked?: Frame; error?: string };

const no = (error: string): Done => ({ text: error, error });
const frameOf = (b: Board, id: unknown) => b.frames.find((f) => f.id === id);
const insert = (b: Board, f: Frame, after?: string) => {
  const at = after ? b.frames.findIndex((g) => g.id === after) : -1;
  b.frames.splice(at < 0 ? b.frames.length : at + 1, 0, f);
};
const copyIn = (e: Env, name: string, id: string, html: string) => writeAtomic(frameFile(e.root, name, id), html);

/** One command's work (new, add, move, pick) on the stored board; the answer is what the agent reads. */
export function act(action: string, a: Ask, e: Env): Done {
  const view = (b: Board, file: string | null) => text(b, { origin: e.origin, file, json: true, pins: (f) => (f.src.startsWith('/_lab/') ? e.open(`/_board/${b.name}/${f.id}`) : 0) });
  if (action === 'list') {
    if (!a.name) return { text: names(e.root).map((n) => { const b = read(e.root, n); return b ? `${n}  ${b.frames.filter((f) => f.state !== 'archived').length} frames${b.of ? `  of ${b.of}` : ''}  ${e.origin}/_lab/board/${n}` : ''; }).filter(Boolean).join('\n') || 'No boards yet. Make one: labit board new "<topic>" --of /page --variants 3' };
    const b = read(e.root, a.name);
    return b ? { text: view(b, b.of ? e.fileOf(b.of.split('#')[0]) : null), board: b } : no(`No board ${a.name}. See: labit board list`);
  }
  if (action === 'deck') {
    const topic = one(a.topic, 80);
    const n = Math.round(Number(a.slides));
    if (!topic || !(n >= 1 && n <= MAX_SLIDES)) return no(`Give the deck a topic and a count (1 to ${MAX_SLIDES}): labit board deck "Q3 review" --slides 8`);
    const name = a.name || slug(topic);
    if (!NAME.test(name)) return no('Give the deck a topic: labit board deck "Q3 review" --slides 8');
    let into = name;
    for (let k = 2; read(e.root, into) && !a.name; k++) into = `${name}-${k}`;
    if (read(e.root, into)) return no(`There is already a board ${into}.`);
    const [w, h] = PRESETS.slide;
    const b: Board = { v: 1, name: into, rev: 1, title: topic, flow: true, frames: [] };
    writeAtomic(slidesFile(e, into), SLIDES_CSS);
    for (let i = 1; i <= n; i++) {
      const id = nextId(b.frames);
      copyIn(e, into, id, slideHtml(into, i));
      b.frames.push({ id, src: route(into, id), w, h, label: String(i), state: 'live' });
    }
    save(e.root, b);
    const done = read(e.root, into)!;
    return { text: view(done, null) + `slides: edit .lab/boards/${into}/<frame>.html (a title and a body each); the look is .lab/boards/${into}/slides.css\n`, board: done };
  }
  if (action === 'new') {
    const topic = one(a.topic, 80);
    const name = a.name || (a.of && !topic ? nameOf(a.of.split('#')[0]) : slug(topic));
    if (!NAME.test(name)) return no('Give the board a topic: labit board new "Pricing hero" --of /pricing --variants 3');
    let into = name;
    for (let n = 2; read(e.root, into) && !a.name; n++) into = `${name}-${n}`;
    const of = a.of ? one(a.of, 200) : '';
    const page = of.split('#')[0];
    if (of && !labPath(page)) return no(`--of is a page of this lab, like /pricing (got ${of.slice(0, 60)})`);
    const b: Board = { v: 1, name: into, rev: 0, ...(topic ? { title: topic } : {}), ...(of ? { of } : {}), frames: [] };
    const size = sizeOf(a.size);
    if (typeof size === 'string') return no(size);
    if (size && a.widths) return no('--size goes with --variants, --flow or a single page; --widths already sets the sizes.');
    const add = (f: Omit<Frame, 'id' | 'h'> & { h?: number }) => b.frames.push({ ...f, ...(size ? { w: size[0], h: size[1] } : {}), id: nextId(b.frames), h: size ? size[1] : f.h ?? heightFor(f.w), state: 'live' });
    if (a.variants !== undefined) {
      const n = Math.round(Number(a.variants));
      if (!of || !(n >= 1 && n <= MAX_VARIANTS)) return no(`--variants takes 1 to ${MAX_VARIANTS} and goes with --of /page: labit board new "<topic>" --of /pricing --variants 3`);
      const rel = e.fileOf(page);
      if (e.proxied || !rel || !/\.html?$/i.test(rel)) return no(`${page} is not a plain HTML page of this folder, so it cannot be copied. Use --widths 390,820,1280 (the real page at several widths) or add your own file: labit board add ${into} <file.html>`);
      const html = fs.readFileSync(path.join(e.root, rel), 'utf8');
      for (let i = 0; i < n; i++) {
        const id = nextId(b.frames);
        copyIn(e, into, id, seed(html, rel));
        add({ src: route(into, id), w: 1280 });
      }
    } else if (a.widths) {
      const ws = String(a.widths).split(',').map((s) => Math.round(Number(s))).filter((w) => w >= 200 && w <= 4000);
      if (!of || !ws.length || ws.length > MAX_VARIANTS) return no(`--widths goes with --of /page and takes up to ${MAX_VARIANTS} widths: --widths 390,820,1280`);
      for (const w of ws.sort((x, y) => x - y)) add({ src: page, w });
    } else if (a.flow) {
      const pages = String(a.flow).split(',').map((s) => s.trim()).filter(Boolean);
      if (!pages.length || pages.length > MAX_FRAMES || pages.some((p) => !labPath(p))) return no('--flow takes pages of this lab in order: --flow /cart,/checkout,/thanks');
      const caps = a.captions === undefined ? [] : String(a.captions).split('|').map((t) => cap(t));
      if (caps.length > pages.length) return no(`--captions has ${caps.length} captions for ${pages.length} pages: --captions "Cart|Pay|Done" (one per page, in order, | between).`);
      pages.forEach((p, i) => add({ src: p, w: 1280, label: `${i + 1} ${e.titleOf(p) || p.slice(1) || 'home'}`, ...(caps[i] ? { caption: caps[i] } : {}) }));
      b.flow = true;
    } else if (page) add({ src: page, w: 1440, h: 900 });
    save(e.root, { ...b, rev: 1 });
    const done = read(e.root, into)!;
    return { text: view(done, page ? e.fileOf(page) : null), board: done };
  }
  const b = a.name ? read(e.root, a.name) : null;
  if (!b) return no(a.name ? `No board ${a.name}. See: labit board list` : 'Name the board first: labit board <new|add|move|pick> <board> …');
  const done = (t: string, extra: Partial<Done> = {}): Done => {
    b.rev++;
    save(e.root, b);
    return { text: t, board: b, ...extra };
  };
  if (action === 'add') {
    const t = String(a.target || '');
    const had = frameOf(b, t);
    if (a.after && !frameOf(b, a.after)) return no(`No frame ${a.after} on ${b.name}.`);
    const w = a.width === undefined ? undefined : Math.round(Number(a.width));
    if (w !== undefined && !(w >= 200 && w <= 4000)) return no('--width is 200 to 4000.');
    const size = sizeOf(a.size);
    if (typeof size === 'string') return no(size);
    if (had) {
      if (a.label !== undefined) had.label = one(a.label, 80) || undefined;
      if (a.caption !== undefined) had.caption = cap(a.caption);
      if (w) [had.w, had.h] = [w, heightFor(w)];
      if (size) [had.w, had.h] = size;
      if (a.after) {
        b.frames.splice(b.frames.indexOf(had), 1);
        insert(b, had, a.after);
      }
      return done(`Changed ${had.id}.`);
    }
    if (b.frames.length >= MAX_FRAMES) return no(`A board holds at most ${MAX_FRAMES} frames.`);
    const id = nextId(b.frames);
    const f: Frame = { id, src: '', w: size?.[0] ?? w ?? 1280, h: 0, state: 'live', ...(a.label ? { label: one(a.label, 80) } : {}), ...(cap(a.caption) ? { caption: cap(a.caption) } : {}) };
    // /cart is a path on this lab, below the lab's folder (path.resolve would read it from the disk's root: "/" always exists there).
    const file = t.startsWith('/') ? path.join(e.root, t) : path.resolve(e.root, t);
    if (labPath(t) && !(fs.existsSync(file) && fs.statSync(file).isFile())) f.src = t;
    else {
      if (!t || !/\.html?$/i.test(file) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return no(`${t || 'nothing'}: give a frame id, a page like /cart, or an .html file to copy in.`);
      copyIn(e, b.name, id, fs.readFileSync(file, 'utf8'));
      f.src = route(b.name, id);
    }
    f.h = size?.[1] ?? heightFor(f.w);
    insert(b, f, a.after);
    return done(`Added ${id} (${f.src.startsWith('/_lab/') ? `${id}.html` : f.src})${a.after ? ` after ${a.after}` : ''}.`);
  }
  if (action === 'caption') {
    const f = frameOf(b, a.frame);
    if (!f) return no(`No frame ${a.frame} on ${b.name}.`);
    f.caption = cap(a.text);
    return done(f.caption ? `Caption on ${f.id}: "${f.caption}"` : `Cleared the caption of ${f.id}.`);
  }
  if (action === 'move') {
    const f = frameOf(b, a.frame);
    if (!f) return no(`No frame ${a.frame} on ${b.name}.`);
    if (!a.first && !frameOf(b, a.after)) return no('Say where: labit board move <board> <frame> --after <frame> (or --first).');
    if (a.after === f.id) return no('A frame cannot go after itself.');
    b.frames.splice(b.frames.indexOf(f), 1);
    if (a.first) b.frames.unshift(f);
    else insert(b, f, a.after);
    delete f.x;
    delete f.y;
    return done(`${f.id} is now ${a.first ? 'first' : `after ${a.after}`}.`);
  }
  if (action === 'pick') {
    const ids = [...new Set(a.frames || [])];
    const bad = ids.find((i) => !frameOf(b, i));
    if (!ids.length || bad) return no(bad ? `No frame ${bad} on ${b.name}.` : 'Name the frame to keep: labit board pick <board> <frame>');
    const same = b.frames.every((f) => f.state === (ids.includes(f.id) ? (ids.length === 1 ? 'picked' : 'live') : 'archived'));
    if (same) return { text: `${ids.join(', ')} is already ${ids.length === 1 ? 'picked' : 'kept'}.`, board: b };
    for (const f of b.frames) f.state = ids.includes(f.id) ? (ids.length === 1 ? 'picked' : 'live') : 'archived';
    const gone = b.frames.filter((f) => f.state === 'archived').map((f) => f.id);
    return done(`${ids.length === 1 ? `Picked ${ids[0]}` : `Kept ${ids.join(', ')}`}.${gone.length ? ` Archived ${gone.join(', ')} (files kept).` : ''}`, ids.length === 1 ? { picked: frameOf(b, ids[0]) } : {});
  }
  return no(`Unknown board action ${action}. Use new, deck, add, caption, move, pick or list.`);
}
