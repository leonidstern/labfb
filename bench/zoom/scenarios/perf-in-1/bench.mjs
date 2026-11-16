// node bench.mjs [file that exports makeLoader]   prints {"ok":true,"ms":123}: every answer was right, and how long the loads took
import path from 'node:path';
import zlib from 'node:zlib';
import { pathToFileURL } from 'node:url';

const { makeLoader } = await import(pathToFileURL(path.resolve(process.argv[2] || 'src/list.mjs')));
let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
function makeStore() {
  const pages = new Map(), ver = new Map();
  return { get: (p) => pages.get(p), version: (p) => ver.get(p) || 0, add(p, c) { if (!pages.has(p)) pages.set(p, []); pages.get(p).push(c); ver.set(p, (ver.get(p) || 0) + 1); }, names: () => [...pages.keys()] };
}
function run() {
  seed = 7;
  const store = makeStore(); let id = 0;
  const comment = () => ({ id: ++id, at: Math.floor(rnd() * 1e9), name: 'leo', text: 'comment '.repeat(6) + id });
  for (let p = 0; p < 30; p++) for (let i = 0; i < 300; i++) store.add(`/page-${p}`, comment());
  const load = makeLoader(store), names = store.names();
  let ms = 0;
  for (let i = 0; i < 600; i++) {
    const page = names[Math.floor(rnd() * rnd() * names.length)]; // a few pages get most of the loads
    if (rnd() < 0.05) store.add(page, comment());
    const t = performance.now(); const out = load(page); ms += performance.now() - t;
    const want = JSON.stringify([...store.get(page)].sort((a, b) => a.at - b.at));
    if (JSON.stringify(JSON.parse(zlib.gunzipSync(out).toString())) !== want) return { ok: false, why: `wrong answer for ${page} on load ${i}` };
  }
  return { ok: true, ms };
}
let best = null;
for (let r = 0; r < 3; r++) { const one = run(); if (!one.ok) { console.log(JSON.stringify(one)); process.exit(1); } if (!best || one.ms < best.ms) best = one; }
console.log(JSON.stringify({ ok: true, ms: Math.round(best.ms * 10) / 10 }));
