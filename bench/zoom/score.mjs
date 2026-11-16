#!/usr/bin/env node
// Scores zoom runs against truth.json.
//   node bench/zoom/score.mjs <runs dir> [--json out.json]
// <runs dir> holds one folder per scenario, each a copy of scenarios/<id> after an agent worked in it.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const truth = JSON.parse(fs.readFileSync(path.join(HERE, 'truth.json'), 'utf8'));
const args = process.argv.slice(2);
const runs = path.resolve(args[0] || '.');
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;

const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } };
const ws = (s) => s.replace(/\s+/g, ' ').trim();
const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&');
const text = (html) => ws(unesc(html.replace(/<[^>]*>/g, ' ')));
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const attrs = (open) => Object.fromEntries([...open.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*"([^"]*)"/g)].map((m) => [m[1], m[2]]));

// The element an opening-tag match starts: its whole text, found by counting that tag's opens and closes.
function elementAt(html, m) {
  const tag = m[1];
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi');
  re.lastIndex = m.index + m[0].length;
  let depth = 1, k;
  while ((k = re.exec(html))) {
    if (k[0].endsWith('/>')) continue;
    depth += k[1] ? -1 : 1;
    if (!depth) return { tag, open: m[0], a: attrs(m[0]), start: m.index, end: re.lastIndex, outer: html.slice(m.index, re.lastIndex), inner: html.slice(m.index + m[0].length, k.index) };
  }
  return null;
}
const byId = (html, id) => { const m = new RegExp(`<([a-zA-Z][a-zA-Z0-9-]*)\\b[^>]*\\bid="${reEsc(id)}"[^>]*>`).exec(html); return m ? elementAt(html, m) : null; };
function variantsOf(html, id) {
  const re = new RegExp(`<([a-zA-Z][a-zA-Z0-9-]*)\\b[^>]*\\bdata-variant-of="${reEsc(id)}"[^>]*>`, 'g');
  const out = []; let m;
  while ((m = re.exec(html))) { const e = elementAt(html, m); if (e) { out.push(e); re.lastIndex = e.end; } }
  return out;
}
// A block without the marks every variant must differ in anyway.
const core = (e) => ws(e.outer.replace(e.open, e.open.replace(/\s(?:id|data-variant-of|data-depth|data-from)="[^"]*"/g, '')));
const tokens = (s) => s.match(/[A-Za-z0-9_]+|[^\sA-Za-z0-9_]/g) || [];
function changed(a, b) { // tokens that differ: the longer length minus the longest common subsequence
  const x = tokens(a), y = tokens(b); let prev = new Array(y.length + 1).fill(0);
  for (let i = 1; i <= x.length; i++) { const cur = [0]; for (let j = 1; j <= y.length; j++) cur[j] = x[i - 1] === y[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]); prev = cur; }
  return Math.max(x.length, y.length) - prev[y.length];
}
const words = (s) => s.toLowerCase().match(/[a-z0-9']+/g) || [];
function wordsChanged(a, b) { const x = words(a), y = words(b); let prev = new Array(y.length + 1).fill(0);
  for (let i = 1; i <= x.length; i++) { const cur = [0]; for (let j = 1; j <= y.length; j++) cur[j] = x[i - 1] === y[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]); prev = cur; }
  return Math.max(x.length, y.length) - prev[y.length]; }
// How much a variant's look moved: each number in its style attribute by its relative change, plus the words changed in its text.
// (Counting tokens alone calls 56px → 57px and 56px → 88px the same.)
const nums = (e) => Object.fromEntries([...(e.a.style || '').matchAll(/(--[\w-]+)\s*:\s*(-?[\d.]+)/g)].map((m) => [m[1], Number(m[2])]));
function amount(a, b) { const x = nums(a), y = nums(b); let n = 0;
  for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) n += x[k] && y[k] != null ? Math.abs(y[k] - x[k]) / Math.abs(x[k]) : x[k] === y[k] ? 0 : 1;
  return n + wordsChanged(text(a.inner), text(b.inner)); }
const lines = (s) => (s || '').split('\n').map((l) => l.trim()).filter(Boolean);
// The right key (labit's own keyFor); the scenario's copy has the lower-casing taken out.
const keyRight = (rel) => '/' + rel.replace(/\.html?$/i, '').split('/').map((seg) =>
  [...Buffer.from(seg.toLowerCase())].map((b, i) => (/[a-z0-9]/.test(String.fromCharCode(b)) || (b === 45 && i) ? String.fromCharCode(b) : `_${b.toString(16)}`)).join('')).join('/');
const keyBuggy = (rel) => '/' + rel.replace(/\.html?$/i, '').split('/').map((seg) =>
  [...Buffer.from(seg)].map((b, i) => (/[a-z0-9]/.test(String.fromCharCode(b)) || (b === 45 && i) ? String.fromCharCode(b) : `_${b.toString(16)}`)).join('')).join('/');

function trailChecks(add, orig, run, t, kinds) {
  const o = lines(orig), r = lines(run);
  add('earlier trail lines untouched', o.every((l, i) => r[i] === l), o.every((l, i) => r[i] === l) ? '' : 'a line before the new ones changed or went missing');
  const fresh = []; let bad = 0;
  for (const l of r.slice(o.length)) { try { fresh.push(JSON.parse(l)); } catch { bad++; } }
  add('new trail lines are valid', !bad && fresh.length > 0, bad ? `${bad} line(s) are not JSON` : fresh.length ? `${fresh.length} new` : 'nothing was added');
  const pin = fresh.find((s) => s.by === 'leo' && s.what === t.words);
  add('the request is in the trail, in the person\'s exact words', Boolean(pin) && pin.on === t.block, pin ? (pin.on === t.block ? '' : `on "${pin.on}", not "${t.block}"`) : `no step by leo saying "${t.words}"`);
  const mine = fresh.find((s) => s.by === 'agent' && kinds.includes(s.kind) && pin && (s.from || []).includes(pin.id));
  add('its own step points back at the request', Boolean(mine), mine ? '' : 'no agent step with the request in "from"');
  const ids = r.map((l) => { try { return JSON.parse(l).id; } catch { return null; } });
  const want = ids.map((_, i) => `t${i + 1}`);
  add('step ids continue the count', ids.join() === want.join(), ids.join() === want.join() ? '' : `got ${ids.slice(o.length).join(', ')}`);
  return mine ? mine.id : null;
}

function scoreIn(id, t, origDir, runDir) {
  const checks = []; const add = (name, pass, note = '') => checks.push({ name, pass: Boolean(pass), note });
  const orig = read(path.join(origDir, 'page.html')), run = read(path.join(runDir, 'page.html')) || '';
  const ob = byId(orig, t.block), rb = byId(run, t.block);
  add('the selected block is untouched', rb && rb.outer === ob.outer, rb ? (rb.outer === ob.outer ? '' : 'it changed') : 'it is gone');
  // "Again": the block already had variants. Those must stay as they are; only the new ones are scored.
  const had = variantsOf(orig, t.block), hadIds = new Set(had.map((v) => v.a.id));
  const all = variantsOf(run, t.block), vs = all.filter((v) => !hadIds.has(v.a.id));
  add(`${t.count} ${had.length ? 'new ' : ''}variants`, vs.length === t.count, `${vs.length} found`);
  if (t.again) add('the earlier variants are untouched', had.every((h) => all.some((v) => v.outer === h.outer)));
  const wide = t.level === 'wide', letter = wide ? 'w' : 'v', depthWant = wide ? Number(ob.a['data-depth'] || 0) : t.depth;
  const wantIds = vs.map((_, i) => `${t.block}-${letter}${had.filter((h) => new RegExp(`-${letter}\\d+$`).test(h.a.id || '')).length + i + 1}`);
  add(`ids are <block>-${letter}1, -${letter}2 …`, vs.length > 0 && vs.every((v, i) => v.a.id === wantIds[i]), vs.map((v) => v.a.id).join(', '));
  add(`data-depth is ${depthWant}`, vs.length > 0 && vs.every((v) => v.a['data-depth'] === String(depthWant)), vs.map((v) => v.a['data-depth']).join(', '));
  const lastHad = all.filter((v) => hadIds.has(v.a.id)).pop();
  let gapOk = vs.length > 0, at = lastHad ? lastHad.end : rb ? rb.end : 0;
  for (const v of vs) { if (v.start < at || run.slice(at, v.start).trim()) gapOk = false; at = v.end; }
  add(had.length ? 'placed right after the earlier variants, nothing in between' : 'placed right after the block, nothing in between', gapOk);
  let rest = run; for (const v of [...vs].reverse()) rest = rest.slice(0, v.start) + rest.slice(v.end);
  add('the rest of the page is as it was', ws(rest) === ws(orig));
  add('same kind of element as the block', vs.length > 0 && vs.every((v) => v.tag.toLowerCase() === ob.tag.toLowerCase()));
  const cores = vs.map(core);
  add('every variant differs from the block and from the others', vs.length > 0 && new Set(cores).size === cores.length && !cores.includes(core(ob)));
  if (t.again) add('none repeats an earlier variant', vs.length > 0 && !cores.some((c) => had.map(core).includes(c)));
  const step = trailChecks(add, read(path.join(origDir, 'page.trail.jsonl')), read(path.join(runDir, 'page.trail.jsonl')), t, ['make']);
  const own = (ob.a['data-from'] || '').split(/\s+/).filter(Boolean).join(' ');
  add('data-from: its new step first, then the block\'s steps', vs.length > 0 && Boolean(step) && vs.every((v) => ws(v.a['data-from'] || '') === ws(`${step} ${own}`)), vs.map((v) => v.a['data-from']).join(' | '));
  const reply = read(path.join(runDir, 'reply.txt'));
  add('a short reply', Boolean(reply) && reply.trim().length > 0 && reply.trim().length <= 700, reply ? `${reply.trim().length} characters` : 'no reply.txt');
  const distance = vs.map((v) => changed(core(ob), core(v)));
  const moved = ob.a.style ? vs.map((v) => Number(amount(ob, v).toFixed(3))) : null;

  if (t.fine) add(`fine differences (at most ${t.fine} tokens each)`, distance.length > 0 && distance.every((d) => d >= 1 && d <= t.fine), distance.join(', '));
  if (t.max_words) { const d = vs.map((v) => wordsChanged(text(ob.inner), text(v.inner)) || (text(ob.inner) !== text(v.inner) ? 1 : 0)); add(`at most ${t.max_words} words changed each (a mark counts as one)`, d.length > 0 && d.every((n) => n >= 1 && n <= t.max_words), d.join(', ')); }
  let looks = null;
  if (t.svg) {
    // The drawing inside each block, made ready to draw on its own: black on white, no page styles needed.
    const svgOf = (e) => { const m = /<svg\b[^>]*>[\s\S]*?<\/svg>/.exec(e.outer); if (!m) return null;
      let x = m[0].replace(/currentColor/g, '#000'); if (!/xmlns=/.test(x)) x = x.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
      return x.replace(/^<svg\b[^>]*>/, (o) => `${o.replace(/\s(?:width|height)="[^"]*"/g, '').replace('<svg', '<svg width="256" height="256"')}<rect x="-999" y="-999" width="2999" height="2999" fill="#fff" stroke="none"/>`); };
    const all = [ob, ...vs].map(svgOf);
    const boxes = vs.map((v) => (/<svg\b[^>]*\bviewBox="([^"]*)"/.exec(v.outer) || [])[1]);
    if (!t.svg.any_box) add(`same canvas as the block (viewBox ${t.svg.viewBox})`, boxes.length > 0 && boxes.every((b) => ws(b || '') === t.svg.viewBox), boxes.join(' | '));
    let r = null;
    if (all.every(Boolean)) {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zoom-svg-')); const files = all.map((x, i) => { const f = path.join(tmp, `${i}.svg`); fs.writeFileSync(f, x); return f; });
      const out = path.join(tmp, 'out.json'); spawnSync('python3', [path.join(HERE, 'render.py'), out, ...files], { timeout: 120000 });
      try { r = JSON.parse(fs.readFileSync(out, 'utf8')); } catch {}
    }
    const drawn = r && r.ink.every((x) => x != null);
    add('every variant can be drawn', Boolean(drawn), drawn ? '' : 'a drawing is missing, or it could not be rendered here (needs macOS Quick Look and Pillow)');
    if (drawn) {
      const ink = r.ink.slice(1), d0 = r.diff[0].slice(1);
      add('each draws something (not empty, not a filled square)', ink.every((x) => x > 0.01 && x < 0.8), ink.map((x) => `${(x * 100).toFixed(0)}%`).join(' | '));
      add(`each looks different from the block (at least ${(t.svg.min * 100).toFixed(1)}% of the picture)`, d0.every((x) => x >= t.svg.min), d0.map((x) => `${(x * 100).toFixed(1)}%`).join(' | '));
      let twin = false; for (let i = 1; i < r.diff.length; i++) for (let j = i + 1; j < r.diff.length; j++) if (r.diff[i][j] < 0.002) twin = true;
      add('no two look the same', !twin);
      looks = d0.map((x) => Number(x.toFixed(4)));
    }
  }
  if (t.chart) {
    const want = Object.entries(t.chart.data).map(([n, v]) => `${n}=${v}`).sort().join('; ');
    const bars = vs.map((v) => [...v.outer.matchAll(/<rect\b[^>]*>/g)].map((m) => attrs(m[0])).filter((a) => a['data-value'] != null));
    add('every chart shows the same five numbers, unchanged', bars.length > 0 && bars.every((b) => b.map((a) => `${unesc(a['data-name'] || '')}=${a['data-value']}`).sort().join('; ') === want), bars.map((b) => `${b.length} bars`).join(' | '));
    const scale = bars.map((b) => { if (b.length < 2) return 'no bars';
      const dim = new Set(b.map((a) => a.width)).size > 1 ? 'width' : 'height';
      const r = b.map((a) => Number(a[dim]) / Number(a['data-value'])); const lo = Math.min(...r), hi = Math.max(...r);
      return lo > 0 && (hi - lo) / hi < 0.05 ? 'to scale' : `not to scale (${dim} per unit from ${lo.toFixed(2)} to ${hi.toFixed(2)})`; });
    add('every bar is drawn to scale from zero', scale.length > 0 && scale.every((x) => x === 'to scale'), scale.join(' | '));
  }
  if (t.doc) {
    const wc = (e) => (text(e.inner).match(/\S+/g) || []).length, codes = (e) => [...e.inner.matchAll(/<code>([\s\S]*?)<\/code>/g)].map((m) => ws(unesc(m[1])));
    const base = wc(ob), known = ws(unesc(ob.inner.replace(/<[^>]+>/g, ' ')));
    add(`every variant is shorter than the ${base} words it started from`, vs.length > 0 && vs.every((v) => wc(v) < base && wc(v) >= 30), vs.map((v) => wc(v)).join(' | '));
    const made = vs.map((v) => codes(v).filter((c) => !known.includes(c)));
    add('no command or name that is not in the original', vs.length > 0 && made.every((m) => m.length === 0), made.map((m) => (m.length ? m.join(', ') : 'none')).join(' | ').slice(0, 300));
  }
  if (t.must_not) add(t.must_not[1], vs.length > 0 && vs.every((v) => !new RegExp(t.must_not[0], 'i').test(text(v.inner))), vs.map((v) => ((new RegExp(t.must_not[0], 'i').exec(text(v.inner)) || [])[0] || 'ok')).join(' | '));
  if (t.crop) {
    const box = (e) => ((/<svg\b[^>]*\bviewBox="([^"]*)"/.exec(e.outer) || [])[1] || '').trim().split(/[\s,]+/).map(Number);
    const [W, H] = t.crop.image, [sx1, sy1, sx2, sy2] = t.crop.subject, o = box(ob), bs = vs.map(box);
    const good = (b) => b.length === 4 && b.every((n) => Number.isFinite(n)) && b[2] > 0 && b[3] > 0;
    const iou = (a, b) => { const w = Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]), h = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]); const i = w > 0 && h > 0 ? w * h : 0; return i / (a[2] * a[3] + b[2] * b[3] - i); };
    add('each crop lies inside the picture', bs.length > 0 && bs.every((b) => good(b) && b[0] >= 0 && b[1] >= 0 && b[0] + b[2] <= W && b[1] + b[3] <= H), bs.map((b) => b.join(' ')).join(' | '));
    add('each keeps the 4 by 3 shape', bs.length > 0 && bs.every((b) => good(b) && Math.abs(b[2] / b[3] - t.crop.ratio) / t.crop.ratio < 0.03));
    add('the sailboat is whole in every crop', bs.length > 0 && bs.every((b) => good(b) && b[0] <= sx1 && b[1] <= sy1 && b[0] + b[2] >= sx2 && b[1] + b[3] >= sy2));
    const near = bs.map((b) => (good(b) ? iou(o, b) : 0));
    add(`each is another framing near the block's (shares ${t.crop.near[0] * 100}% to ${t.crop.near[1] * 100}% with it)`, near.length > 0 && near.every((x) => x >= t.crop.near[0] && x <= t.crop.near[1]), near.map((x) => `${(x * 100).toFixed(0)}%`).join(' | '));
    let twin = false; for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) if (good(bs[i]) && good(bs[j]) && iou(bs[i], bs[j]) > 0.97) twin = true;
    add('no two crops are the same', bs.length > 0 && !twin);
    add('the picture file is untouched', vs.every((v) => /<image\b[^>]*href="media\/harbour-800\.jpg"/.test(v.outer)));
    looks = near.map((x) => Number((1 - x).toFixed(4)));
  }
  if (t.bench) {
    const codeOf = (e) => unesc((/<pre\b[^>]*data-code[^>]*>([\s\S]*?)<\/pre>/.exec(e.outer) || [])[1] || '');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zoom-bench-'));
    const time = (code, name) => { const f = path.join(tmp, name); fs.writeFileSync(f, code); const r = spawnSync(process.execPath, [path.join(origDir, t.bench.file), f], { cwd: origDir, timeout: 120000, encoding: 'utf8' }); try { return JSON.parse(r.stdout.trim().split('\n').pop()); } catch { return { ok: false, why: (r.stderr || '').split('\n').find((l) => /Error/.test(l)) || 'did not run' }; } };
    const base = time(read(path.join(origDir, t.bench.src)), 'base.mjs');
    const res = vs.map((v, i) => time(codeOf(v), `v${i + 1}.mjs`));
    add('every variant still gives the right answers', res.length > 0 && res.every((r) => r.ok), res.map((r) => (r.ok ? 'right' : r.why)).join(' | '));
    add(`every variant really is faster (at most ${t.bench.faster * 100}% of the time)`, res.length > 0 && base.ok && res.every((r) => r.ok && r.ms <= base.ms * t.bench.faster), `was ${base.ms} ms; now ${res.map((r) => (r.ok ? `${r.ms} ms` : '—')).join(' | ')}`);
    const codes = vs.map((v) => ws(codeOf(v)));
    add('the code itself differs each time', codes.length > 0 && new Set(codes).size === codes.length && !codes.includes(ws(codeOf(ob))));
  }
  if (t.same_as_original) {
    const codeOf = (e) => unesc((/<pre\b[^>]*data-code[^>]*>([\s\S]*?)<\/pre>/.exec(e.outer) || [])[1] || '');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zoom-same-'));
    const outs = [ob, ...vs].map((e, i) => { const f = path.join(tmp, `${i}.mjs`); fs.writeFileSync(f, codeOf(e));
      const r = spawnSync(process.execPath, ['--input-type=module', '-e', `const m = await import(${JSON.stringify('file://' + f)}); console.log(JSON.stringify(${JSON.stringify(t.same_as_original)}.map((x) => { try { return m.listenPages(x); } catch (e) { return 'threw'; } })));`], { timeout: 15000, encoding: 'utf8' });
      return r.stdout.trim(); });
    const off = outs.slice(1).map((o, i) => (o === outs[0] ? null : `v${i + 1}`)).filter(Boolean);
    add('behaves like the block where the tests do not look (8 more inputs)', vs.length > 0 && outs[0] && !off.length, off.length ? `${off.join(', ')} differ` : '');
  }
  if (t.not_same) add('each builds it another way, not the same way laid out again (rough check: the original\'s key phrase is gone)', vs.length > 0 && vs.every((v) => !new RegExp(t.not_same, 'i').test(text(v.inner))), vs.map((v) => (new RegExp(t.not_same, 'i').test(text(v.inner)) ? 'same' : 'other')).join(' | '));
  if (t.headings) {
    const h = (e) => text((/<h3>([\s\S]*?)<\/h3>/.exec(e.outer) || [])[1] || '');
    const hs = vs.map(h);
    add('each has its own name, not the block\'s and not another idea\'s on the page', hs.length > 0 && new Set(hs).size === hs.length && !hs.includes(h(ob)) && !hs.some((x) => t.headings.includes(x)), hs.join(' | '));
  }
  if (t.pair) {
    const ps = vs.map((v) => [Number(v.a[t.pair[0]]), Number(v.a[t.pair[1]])]);
    add('each is still a two-size rule (small below box)', ps.length > 0 && ps.every(([a, b]) => a > 0 && b > a), ps.map((p) => p.join('/')).join(' | '));
    add('the words agree with the values', ps.length > 0 && vs.every((v, i) => new RegExp(`\\b${ps[i][0]} px`).test(text(v.inner)) && new RegExp(`\\b${ps[i][1]} px`).test(text(v.inner))));
    const keys = vs.map((v, i) => `${ps[i].join('/')} ${text(v.inner)}`);
    add('a different rule each time (other sizes, or the same sizes for other things)', new Set(keys).size === keys.length && !keys.includes(`${ob.a[t.pair[0]]}/${ob.a[t.pair[1]]} ${text(ob.inner)}`));
  }
  if (t.code) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zoom-code-')); const res = [];
    vs.forEach((v, i) => {
      const m = /<pre\b[^>]*data-code[^>]*>([\s\S]*?)<\/pre>/.exec(v.outer);
      if (!m) return res.push('no code');
      const file = path.join(tmp, `v${i + 1}.mjs`); fs.writeFileSync(file, unesc(m[1]));
      const r = spawnSync(process.execPath, [path.join(origDir, t.code), file], { cwd: origDir, timeout: 15000, encoding: 'utf8' });
      res.push(r.status === 0 ? 'pass' : `fail: ${(r.stderr || '').split('\n').find((l) => /Error|listenPages/.test(l)) || 'exit ' + r.status}`);
    });
    add('every variant still passes the tests', res.length > 0 && res.every((r) => r === 'pass'), res.join(' | '));
    const codes = vs.map((v) => ws(unesc((/<pre\b[^>]*data-code[^>]*>([\s\S]*?)<\/pre>/.exec(v.outer) || [])[1] || '')));
    const oc = ws(unesc((/<pre\b[^>]*data-code[^>]*>([\s\S]*?)<\/pre>/.exec(ob.outer) || [])[1] || ''));
    add('the code itself differs each time', codes.length > 0 && new Set(codes).size === codes.length && !codes.includes(oc));
  }
  if (t.cases) {
    const rows = vs.map((v) => ({ i: v.a['data-input'], e: v.a['data-expected'], codes: [...v.inner.matchAll(/<code>([\s\S]*?)<\/code>/g)].map((m) => unesc(m[1])) }));
    add('expected result is right', rows.length > 0 && rows.every((r) => r.i != null && keyRight(r.i) === r.e), rows.map((r) => `${r.i} → ${r.e}${r.i != null && keyRight(r.i) !== r.e ? ` (right: ${keyRight(r.i)})` : ''}`).join(' | '));
    add('still fails on the code as it is', rows.length > 0 && rows.every((r) => r.i != null && keyBuggy(r.i) !== r.e));
    add('same kind of case (a capital letter in the name)', rows.length > 0 && rows.every((r) => /[A-Z]/.test(r.i || '')));
    const ins = rows.map((r) => r.i);
    add('new inputs, no repeats', new Set(ins).size === ins.length && !ins.includes(ob.a['data-input']));
    add('the words on the page agree with the data', rows.length > 0 && rows.every((r) => r.codes[0] === r.i && r.codes[1] === r.e), rows.map((r) => r.codes.join(' / ')).join(' | '));
  }
  if (t.quotes_from) {
    const q = (e) => { const m = /<q\b([^>]*)>([\s\S]*?)<\/q>/.exec(e.outer); return m ? { src: attrs('<q' + m[1] + '>')['data-source'], text: ws(unesc(m[2])) } : null; };
    const qs = vs.map(q), oq = q(ob);
    const real = qs.map((x) => { if (!x || !x.src) return 'no quote'; const f = read(path.join(origDir, x.src)); return f == null ? `no file ${x.src}` : ws(f).includes(x.text) ? 'real' : 'not in the file'; });
    add('every quote is word for word in its source', real.length > 0 && real.every((r) => r === 'real'), real.join(' | '));
    const ts = qs.map((x) => x && x.text);
    add('new quotes, no repeats', ts.length > 0 && new Set(ts).size === ts.length && !ts.includes(oq.text));
  }
  return { checks, distance, moved, looks, judged: t.judged || null };
}

function scoreOut(id, t, origDir, runDir) {
  const checks = []; const add = (name, pass, note = '') => checks.push({ name, pass: Boolean(pass), note });
  for (const f of ['page.html', 'page.trail.jsonl']) add(`${f} unchanged`, (read(path.join(runDir, f)) || '').trimEnd() === read(path.join(origDir, f)).trimEnd());
  const reply = read(path.join(runDir, 'reply.txt')) || '';
  add('a reply', reply.trim().length > 0, reply ? `${reply.trim().length} characters` : 'no reply.txt');
  if (t.kind === 'none') { add(`says only "${t.reply}"`, ws(reply) === t.reply, ws(reply).slice(0, 120)); return { checks }; }
  const at = [];
  for (const [name, re] of t.required) { const m = new RegExp(re, 'i').exec(reply); at.push(m ? m.index : -1); add(`names ${name}`, Boolean(m)); }
  const seq = t.ordered_first ? at.slice(0, t.ordered_first) : at;
  add('oldest first', seq.every((n) => n >= 0) && seq.every((n, i) => !i || n >= seq[i - 1]), seq.join(', '));
  for (const q of t.quotes) add(`quotes the person exactly: "${q}"`, reply.includes(q));
  for (const [name, re] of t.forbidden) add(`leaves out ${name}`, !new RegExp(re, 'i').test(reply));
  if (t.branch) {
    const n = (reply.match(/another branch/gi) || []).length;
    add(`marks the ${t.branch.min} steps that don't lead here as another branch`, n === t.branch.min, `${n} marked`);
    const wrong = reply.split('\n').filter((l) => new RegExp(t.branch.not_on, 'i').test(l) && /another branch/i.test(l));
    add('does not mark its own way as another branch', wrong.length === 0, wrong.join(' / ').slice(0, 160));
  }
  return { checks };
}

function scoreKeep(id, t, origDir, runDir) {
  const checks = []; const add = (name, pass, note = '') => checks.push({ name, pass: Boolean(pass), note });
  const orig = read(path.join(origDir, 'page.html')), run = read(path.join(runDir, 'page.html')) || '';
  const ob = byId(orig, t.block), rb = byId(run, t.block);
  const h = rb && /<h3>([\s\S]*?)<\/h3>/.exec(rb.outer);
  add('the change was made', Boolean(h) && text(h[1]) === t.heading, h ? text(h[1]) : 'no heading');
  add('nothing else on the page changed', Boolean(rb) && ws(run.slice(0, rb.start) + run.slice(rb.end)) === ws(orig.slice(0, ob.start) + orig.slice(ob.end)));
  const want = rb ? ob.outer.replace(/<h3>[\s\S]*?<\/h3>/, h ? h[0] : '').replace(/\sdata-from="[^"]*"/, '') : '';
  add('nothing else in the block changed', Boolean(rb) && ws(rb.outer.replace(/\sdata-from="[^"]*"/, '')) === ws(want));
  const step = trailChecks(add, read(path.join(origDir, 'page.trail.jsonl')), read(path.join(runDir, 'page.trail.jsonl')), t, ['change']);
  add('data-from: its new step first, then the block\'s steps', Boolean(rb) && Boolean(step) && ws(rb.a['data-from'] || '') === ws(`${step} ${ob.a['data-from']}`), rb ? rb.a['data-from'] : '');
  const reply = read(path.join(runDir, 'reply.txt'));
  add('a short reply', Boolean(reply) && reply.trim().length > 0 && reply.trim().length <= 700, reply ? `${reply.trim().length} characters` : 'no reply.txt');
  return { checks };
}

const out = {}; let pass = 0, total = 0;
for (const [id, t] of Object.entries(truth)) {
  const origDir = path.join(HERE, 'scenarios', id), runDir = path.join(runs, id);
  if (!fs.existsSync(runDir)) { console.log(`\n${id}: not run`); continue; }
  const r = t.kind === 'in' ? scoreIn(id, t, origDir, runDir) : t.kind === 'keep' ? scoreKeep(id, t, origDir, runDir) : scoreOut(id, t, origDir, runDir);
  const ok = r.checks.filter((c) => c.pass).length; pass += ok; total += r.checks.length;
  out[id] = { who: t.who, scale: t.scale, does: t.does, kind: t.kind, passed: ok, of: r.checks.length, ...r, reply: read(path.join(runDir, 'reply.txt')) };
  console.log(`\n${id} · ${t.who} · ${t.does}: ${ok}/${r.checks.length}${r.distance ? ` · tokens changed per variant: ${r.distance.join(', ')}` : ''}`);
  for (const c of r.checks) if (!c.pass) console.log(`  FAIL ${c.name}${c.note ? ` — ${c.note}` : ''}`);
}
const mean = (a) => (a && a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const steps = ['d-in-1', 'd-in-2', 'd-in-3'].map((id) => mean(out[id]?.moved));
const closer = steps.every((n) => n != null) && steps[0] > steps[1] && steps[1] > steps[2];
const gsteps = ['gfx-logo-1', 'gfx-logo-2', 'gfx-logo-3'].map((id) => mean(out[id]?.looks));
const gcloser = gsteps.every((n) => n != null) && gsteps[0] > gsteps[1] && gsteps[1] > gsteps[2];
console.log(`\ncloser each step (how much the look moved at ×1, ×2, ×3, mean per variant): ${steps.map((n) => (n == null ? '—' : n.toFixed(2))).join(' → ')} ${closer ? 'yes' : 'NO'}`);
console.log(`closer each step, on the drawn picture (share of the mark that changed at ×1, ×2, ×3): ${gsteps.map((n) => (n == null ? '—' : (n * 100).toFixed(1) + '%')).join(' → ')} ${gcloser ? 'yes' : 'NO'}`);
console.log(`\ntotal: ${pass}/${total} checks, ${Object.values(out).filter((s) => s.passed === s.of).length}/${Object.keys(out).length} scenarios clean`);
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify({ scenarios: out, closer: { means: steps, pass: closer }, drawn: { means: gsteps, pass: gcloser }, pass, total }, null, 1));
