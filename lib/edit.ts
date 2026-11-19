// Editing words in place (flag editText): find the words in the project's source, change them once, remember it for undo.
// Exact or nothing: a file is written only when the old words are in exactly one place. Otherwise nothing changes and
// the answer says why in plain words. No parser: text matching with the words around them. Runs in the lab (node:fs).
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

type Ask = { was: string; now: string; prefix?: string; suffix?: string; file?: string; line?: number; pageFile?: string };
type Rec = { id: string; at: string; page: string; file: string; line: number; rung: string; was: string; now: string; wrote: string; before: string; after: string; state: 'kept' | 'undone' | 'overwritten' };
type Out = { ok: true; edit: Rec } | { ok: false; why: string };

const TYPES = /\.(html?|md|mdx|astro|[jt]sx?|vue|svelte|json)$/i;
const SKIP = /^(node_modules|dist|build|out|coverage|\.[^/]*)$/;
const MAX = { file: 2e6, files: 5000, text: 300 };
const sha = (s: string) => createHash('sha1').update(s).digest('hex').slice(0, 12);
const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
// Text as a reader sees it, to compare: tags and {' '} gone, entities as characters, white space gone.
const plain = (s: string) => s.replace(/\{\s*(['"])\s*\1\s*\}/g, ' ').replace(/<[^>]*>/g, '').replace(/&(#39|\w+);/g, (m, e) => ENT[e] ?? m).replace(/\s+/g, '');
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// The words as a pattern: any white space, &nbsp; or {' '} where there is a space; an entity where the character is one.
const pat = (s: string) =>
  esc(s.trim()).replace(/&/g, '(?:&|&amp;)').replace(/'/g, "(?:'|&apos;|&#39;|\u2019)").replace(/"/g, '(?:"|&quot;)').replace(/</g, '(?:<|&lt;)').replace(/>/g, '(?:>|&gt;)')
    .replace(/\s+/g, '(?:\\s|&nbsp;|\\{\\s*[\'"] [\'"]\\s*\\})+');

/** A path inside the project that may be written: a real file under root, not in a dot folder or node_modules, a text type, small. */
function inside(root: string, rel: string): string | null {
  if (typeof rel !== 'string' || !rel || rel.includes('\0')) return null;
  const file = path.resolve(root, rel);
  if (file !== root && !file.startsWith(root + path.sep)) return null;
  if (path.relative(root, file).split(path.sep).some((s) => SKIP.test(s)) || !TYPES.test(file) || /lock\.json$/i.test(file)) return null;
  try {
    const real = fs.realpathSync(file);
    const st = fs.statSync(real);
    return real.startsWith(root + path.sep) && st.isFile() && st.size <= MAX.file ? real : null;
  } catch {
    return null;
  }
}

function listed(root: string): string[] {
  let all: string[] = [];
  try {
    all = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], { cwd: root, encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }).split('\n');
  } catch {
    const walk = (dir: string, depth: number) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (SKIP.test(e.name)) continue;
        const f = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (depth < 8) walk(f, depth + 1);
        }
        else all.push(path.relative(root, f));
      }
    };
    walk(root, 0);
  }
  return all.filter((f) => f && TYPES.test(f)).slice(0, MAX.files);
}

type Hit = { at: number; len: number };
// Every place the words are in this text, narrowed by the words around them, then by the line.
function hits(text: string, ask: Ask, near?: number): Hit[] {
  const all = [...text.matchAll(new RegExp(pat(ask.was), 'g'))].map((m) => ({ at: m.index!, len: m[0].length }));
  if (all.length < 2) return all;
  const p = plain(ask.prefix || '').slice(-12), s = plain(ask.suffix || '').slice(0, 12);
  const score = (h: Hit) => (p && plain(text.slice(Math.max(0, h.at - 300), h.at)).endsWith(p) ? 1 : 0) + (s && plain(text.slice(h.at + h.len, h.at + h.len + 300)).startsWith(s) ? 1 : 0);
  const best = Math.max(...all.map(score));
  let left = best ? all.filter((h) => score(h) === best) : all;
  if (left.length > 1 && near) {
    const line = (h: Hit) => text.slice(0, h.at).split('\n').length;
    const close = left.filter((h) => Math.abs(line(h) - near) <= 2);
    if (close.length === 1) left = close;
  }
  return left;
}

type Found = { ok: true; file: string; abs: string; at: number; len: number; line: number; sha: string; rung: string; text: string } | { ok: false; why: string };
function find(root: string, ask: Ask): Found {
  const known = [ask.file, ask.pageFile].filter((f): f is string => Boolean(f));
  const seen = new Set<string>();
  const found: { rel: string; abs: string; text: string; h: Hit[] }[] = [];
  // Rungs for a file the page tells us (its source, or its own file): one place in it is enough.
  for (const rel of known) {
    const abs = inside(root, rel);
    if (!abs || seen.has(abs)) continue;
    seen.add(abs);
    const text = fs.readFileSync(abs, 'utf8');
    const h = hits(text, ask, rel === ask.file ? ask.line : undefined);
    if (h.length === 1) return done(root, abs, text, h[0], rel === ask.file ? 'source' : 'page');
  }
  // The project: every file is read, and the words must be in one place in ALL of them together.
  let bytes = 0;
  for (const rel of listed(root)) {
    const abs = inside(root, rel);
    if (!abs || (bytes += fs.statSync(abs).size) > 5e7) continue;
    const text = fs.readFileSync(abs, 'utf8');
    const h = hits(text, ask);
    if (h.length) found.push({ rel, abs, text, h });
  }
  const total = found.flatMap((f) => f.h.map(() => f));
  if (total.length === 1) return done(root, found[0].abs, found[0].text, found[0].h[0], 'search');
  if (total.length > 1) return { ok: false, why: `more than one place: ${found.map((f) => `${f.rel}${f.h.length > 1 ? ` (${f.h.length} places)` : ''}`).slice(0, 4).join(', ')}` };
  return { ok: false, why: 'not found in the project' };
}
const done = (root: string, abs: string, text: string, h: Hit, rung: string): Found => ({ ok: true, file: path.relative(root, abs), abs, at: h.at, len: h.len, line: text.slice(0, h.at).split('\n').length, sha: sha(text), rung, text });

// The new words as the file spells text: escaped for its type.
const spelled = (file: string, now: string) =>
  /\.[jt]sx$/i.test(file) ? now.replace(/[{}<>]/g, (c) => `{'${c}'}`) : /\.(html?|astro|vue|svelte)$/i.test(file) ? now.replace(/&/g, '&amp;').replace(/</g, '&lt;') : /\.json$/i.test(file) ? JSON.stringify(now).slice(1, -1) : now;

const LOG = (labDir: string) => path.join(labDir, 'edits.jsonl');
const log = (labDir: string, rec: Rec) => fs.appendFileSync(LOG(labDir), JSON.stringify(rec) + '\n');
/** Every edit, the last state of each, oldest first. */
export function edits(labDir: string): Rec[] {
  const by = new Map<string, Rec>();
  try {
    for (const l of fs.readFileSync(LOG(labDir), 'utf8').split('\n').slice(-2000)) if (l) by.set(JSON.parse(l).id, JSON.parse(l));
  } catch {}
  return [...by.values()];
}
const write = (abs: string, text: string) => {
  const tmp = `${abs}.lab-${process.pid}`;
  fs.writeFileSync(tmp, text, { mode: fs.statSync(abs).mode });
  fs.renameSync(tmp, abs);
};

/** Find the words and change them once. dry: only say whether it can be done. */
export function edit(root: string, labDir: string, page: string, ask: Ask, dry = false): Out {
  const was = String(ask.was ?? '').trim(), now = String(ask.now ?? '').trim();
  if (!was || !now || was === now) return { ok: false, why: 'nothing changed' };
  if (now.length > MAX.text || /[\r\n]/.test(now)) return { ok: false, why: 'too long to write from here; say it to the agent' };
  const hit = find(root, { ...ask, was, now });
  if ('why' in hit) return { ok: false, why: hit.why };
  // Read again, match again: the file may have been saved since it was read (the agent, an editor).
  let text = hit.text, at = hit.at, len = hit.len;
  if (!dry) {
    const fresh = fs.readFileSync(hit.abs, 'utf8');
    if (sha(fresh) !== hit.sha) {
      const h = hits(fresh, { ...ask, was, now }, ask.line);
      if (h.length !== 1) return { ok: false, why: 'the file changed just now' };
      [text, at, len] = [fresh, h[0].at, h[0].len];
    }
  }
  if (dry) return { ok: true, edit: { id: '', at: '', page, file: hit.file, line: hit.line, rung: hit.rung, was: text.slice(at, at + len), now, wrote: '', before: hit.sha, after: '', state: 'kept' } };
  const wrote = spelled(hit.file, now);
  const next = text.slice(0, at) + wrote + text.slice(at + len);
  write(hit.abs, next);
  const rec: Rec = { id: sha(hit.file + Date.now() + Math.random()), at: new Date().toISOString(), page, file: hit.file, line: text.slice(0, at).split('\n').length, rung: hit.rung, was: text.slice(at, at + len), now, wrote, before: sha(text), after: sha(next), state: 'kept' };
  log(labDir, rec);
  return { ok: true, edit: rec };
}

/** Put the old words back, if the new ones are still in one place. */
export function undo(root: string, labDir: string, id: string): Out {
  const rec = edits(labDir).find((e) => e.id === id);
  if (!rec || rec.state === 'undone') return { ok: false, why: 'nothing to undo' };
  const abs = inside(root, rec.file);
  if (!abs) return { ok: false, why: 'the file is gone' };
  const text = fs.readFileSync(abs, 'utf8');
  const first = text.indexOf(rec.wrote);
  if (first < 0 || first !== text.lastIndexOf(rec.wrote)) return { ok: false, why: 'the words changed since' };
  const next = text.slice(0, first) + rec.was + text.slice(first + rec.wrote.length);
  write(abs, next);
  const back: Rec = { ...rec, state: 'undone', at: new Date().toISOString() };
  log(labDir, back);
  return { ok: true, edit: back };
}
