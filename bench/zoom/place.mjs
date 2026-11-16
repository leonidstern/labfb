#!/usr/bin/env node
// The lab's part of a zoom in: puts the agent's variants into the page and the trail.
// Run in a folder with page.html, page.trail.jsonl, request.md, variants.html and variants.txt:  node place.mjs
// A sketch of what a `labit variants` command would do. The agent writes only the variants; ids, marks, the place
// on the page and the trail steps are the lab's, so nothing else on the page can be touched.
import fs from 'node:fs';

const die = (msg) => { console.error(`place: ${msg}`); process.exit(1); };
const read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return die(`${f} is missing`); } };
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const attrs = (open) => Object.fromEntries([...open.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*"([^"]*)"/g)].map((m) => [m[1], m[2]]));
function elementAt(html, m) {
  const re = new RegExp(`<(/?)${m[1]}\\b[^>]*>`, 'gi'); re.lastIndex = m.index + m[0].length;
  let depth = 1, k;
  while ((k = re.exec(html))) { if (k[0].endsWith('/>')) continue; depth += k[1] ? -1 : 1; if (!depth) return { tag: m[1], open: m[0], a: attrs(m[0]), start: m.index, end: re.lastIndex, outer: html.slice(m.index, re.lastIndex) }; }
  return null;
}
const MARKS = /\s(?:id|data-variant-of|data-depth|data-from)="[^"]*"/g;
const core = (e) => e.outer.replace(e.open, e.open.replace(MARKS, '')).replace(/\s+/g, ' ').trim();

if (fs.existsSync('.placed')) die('these variants are already on the page (.placed). Nothing done.');
const request = read('request.md');
const words = (/^comment:\s*(.+)$/m.exec(request) || [])[1]?.trim() || die('request.md has no "comment:" line');
const blockId = (/^block:\s*(\S+)/m.exec(request) || [])[1] || die('request.md has no "block:" line');
const who = (/^##\s*\d+\.\s*(\S+)/m.exec(request) || [])[1] || 'someone';
const lv = /zoom in\s+(wide|[×x]\s*(\d))/i.exec(words) || die(`"${words}" is not a zoom in (zoom in wide, ×1, ×2 or ×3)`);
const wide = /wide/i.test(lv[1]), n = wide ? 0 : Number(lv[2]);

let page = read('page.html');
const bm = new RegExp(`<([a-zA-Z][a-zA-Z0-9-]*)\\b[^>]*\\bid="${reEsc(blockId)}"[^>]*>`).exec(page) || die(`no block with id "${blockId}" on the page`);
const block = elementAt(page, bm) || die(`the block "${blockId}" is not closed`);
const depth = Number(block.a['data-depth'] || 0);
if (!wide && n !== depth + 1) die(`"${blockId}" is at depth ${depth}, so the next step in is ×${depth + 1}, not ×${n}`);
const want = wide || n === 1 ? 4 : 3;

const raw = read('variants.html');
const vs = []; { const re = /<([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*>/g; let m; while ((m = re.exec(raw))) { const e = elementAt(raw, m); if (!e) die(`a <${m[1]}> in variants.html is not closed`); vs.push(e); re.lastIndex = e.end; } }
if (vs.length !== want) die(`${wide ? 'wide' : `×${n}`} takes ${want} variants, variants.html has ${vs.length}`);
for (const [i, v] of vs.entries()) if (v.tag.toLowerCase() !== block.tag.toLowerCase()) die(`variant ${i + 1} is a <${v.tag}>, the block is a <${block.tag}>`);
const cores = vs.map(core);
if (cores.includes(core(block))) die('one variant is the same as the block');
if (new Set(cores).size !== cores.length) die('two variants are the same');
const what = read('variants.txt').split('\n').map((l) => l.trim()).find(Boolean) || die('variants.txt is empty: one line saying what the variants are');

// Earlier variants of this block: the new ones go after them, and the numbering carries on.
const kin = []; { const re = new RegExp(`<([a-zA-Z][a-zA-Z0-9-]*)\\b[^>]*\\bdata-variant-of="${reEsc(blockId)}"[^>]*>`, 'g'); let m; while ((m = re.exec(page))) { const e = elementAt(page, m); if (e) { kin.push(e); re.lastIndex = e.end; } } }
const letter = wide ? 'w' : 'v';
const used = kin.map((k) => Number((new RegExp(`^${reEsc(blockId)}-${letter}(\\d+)$`).exec(k.a.id || '') || [])[1] || 0));
let next = Math.max(0, ...used) + 1;

const trail = read('page.trail.jsonl');
const steps = trail.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
const last = Math.max(0, ...steps.map((s) => Number(String(s.id).replace(/^t/, '')) || 0));
const own = (block.a['data-from'] || '').split(/\s+/).filter(Boolean);
const pin = { id: `t${last + 1}`, kind: 'pin', by: who, ...(own[0] ? { from: [own[0]] } : {}), on: blockId, what: words };
const make = { id: `t${last + 2}`, kind: 'make', by: 'agent', from: [pin.id], on: blockId, what };

const ids = [];
const placed = vs.map((v) => {
  const id = `${blockId}-${letter}${next++}`; ids.push(id);
  const marks = ` id="${id}" data-variant-of="${blockId}" data-depth="${wide ? depth : n}" data-from="${[make.id, ...own].join(' ')}"`;
  const open = v.open.replace(MARKS, '').replace(new RegExp(`^<${v.tag}`), `<${v.tag}${marks}`);
  return v.outer.replace(v.open, open).trim();
});
const at = kin.length ? Math.max(...kin.map((k) => k.end)) : block.end;
page = page.slice(0, at) + placed.map((p) => '\n' + p).join('') + page.slice(at);
fs.writeFileSync('page.html', page);
fs.writeFileSync('page.trail.jsonl', trail.replace(/\n*$/, '\n') + JSON.stringify(pin) + '\n' + JSON.stringify(make) + '\n');
fs.writeFileSync('.placed', ids.join('\n') + '\n');
console.log(`placed ${ids.join(', ')} after ${kin.length ? 'the earlier variants of ' : ''}${blockId}; trail: ${pin.id} (the request), ${make.id} (your step)`);
