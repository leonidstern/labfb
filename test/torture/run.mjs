#!/usr/bin/env node
// The torture test's entry: makes N seeded cases in three areas (dev-sync, hotswap, agent-sync), runs each against a lab
// of its own, and says per area and overall how many passed, failed loudly, failed silently, or were flaky, with every
// failure grouped by signature and one small replayable case per signature. See README.md beside this file.
//
//   node test/torture/run.mjs --cases 3000 --area all --seed 1 --concurrency 12 --json out.json
//   node test/torture/run.mjs --smoke
//   node test/torture/run.mjs --replay hotswap:2884193731            (one case again, every step printed)
//   node test/torture/run.mjs --replay hotswap:2884193731:0,3,4      (only these steps of it)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Ctx, hashSeed, makeRng, signatureOf, sleep, spread, LAN } from './lib.mjs';
import * as devSync from './dev-sync.mjs';
import * as hotswap from './hotswap.mjs';
import * as agentSync from './agent-sync.mjs';
import { KNOWN_BUGS, knownBugOf, bugTag } from './known-bugs.mjs';

const AREAS = { 'dev-sync': devSync, hotswap, 'agent-sync': agentSync };
// How `--area all` shares its cases out.
const SHARE = { 'dev-sync': 0.35, hotswap: 0.3, 'agent-sync': 0.35 };
const REPO = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));

// ---------- arguments (a flag, or the same name in the environment: --cases / TORTURE_CASES) ----------
const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  if (i >= 0) return argv[i + 1] === undefined || argv[i + 1].startsWith('--') ? true : argv[i + 1];
  return process.env[`TORTURE_${name.toUpperCase().replace(/-/g, '_')}`] ?? fallback;
};
if (flag('help', false)) {
  console.log(fs.readFileSync(fileURLToPath(new URL('./README.md', import.meta.url)), 'utf8').split('\n## ')[1] || 'see test/torture/README.md');
  process.exit(0);
}
const smoke = Boolean(flag('smoke', false));
const opts = {
  seed: Number(flag('seed', 1)),
  cases: Number(flag('cases', smoke ? 60 : 3000)),
  area: String(flag('area', 'all')),
  concurrency: Number(flag('concurrency', smoke ? 8 : 12)),
  json: flag('json', ''),
  /** A failed case is run again this many times: a signature that never comes back is flaky. */
  confirm: Number(flag('confirm', smoke ? 1 : 2)),
  /** At most this many more runs to make a failing case smaller, for each new signature. */
  shrink: Number(flag('shrink', smoke ? 3 : 12)),
  /** The share of hotswap and agent-sync cases that also drive a real browser (Chromium or WebKit). */
  browserShare: flag('no-browser', false) ? 0 : Number(flag('browser-share', smoke ? 0.1 : 0.06)),
  /** Every settle time and bound times this (a slow or busy machine: 2). */
  slow: Number(flag('slow', 1)),
  verbose: Boolean(flag('verbose', false)),
  replay: flag('replay', ''),
  lan: LAN,
};
const areaNames = opts.area === 'all' ? Object.keys(AREAS) : opts.area.split(',');
for (const a of areaNames) if (!AREAS[a]) throw new Error(`--area: one of ${Object.keys(AREAS).join(', ')}, all`);

// ---------- real browsers, for the cases that ask for one ----------
const require = createRequire(import.meta.url);
let pw = null;
try {
  // From here, from NODE_PATH (as test/browser/harness.mjs looks), or from the folder beside this checkout where this
  // machine keeps it for labit's browser tests.
  for (const paths of [undefined, (process.env.NODE_PATH || '').split(path.delimiter), [path.join(REPO, '..', '.labit-pw-scratch', 'node_modules')]]) {
    try {
      pw = require(require.resolve('playwright', paths && { paths }));
      break;
    } catch {}
  }
} catch {}
const launched = new Map();
let browserSlots = 3; // browser cases at once: each is a real engine's page or two
const browserQueue = [];
opts.browser = !pw || !opts.browserShare
  ? null
  : {
      /** A browser of this engine (started once for the whole run) and a turn to use it; release() when done. */
      async take(engine) {
        if (browserSlots > 0) browserSlots--;
        else await new Promise((r) => browserQueue.push(r));
        if (!launched.has(engine)) launched.set(engine, pw[engine].launch());
        try {
          return { browser: await launched.get(engine), devices: pw.devices, release: () => (browserQueue.length ? browserQueue.shift()() : browserSlots++) };
        } catch (e) {
          launched.delete(engine);
          browserQueue.length ? browserQueue.shift()() : browserSlots++;
          throw e;
        }
      },
    };
const closeBrowsers = async () => {
  for (const b of launched.values()) await (await b.catch(() => null))?.close().catch(() => {});
};

// ---------- one case ----------
const CASE_MS = 90000 * opts.slow;
/** Runs one case: its plan from its seed alone, a world of its own, its findings. `keep`: only these steps of the plan. */
async function runOnce(area, seed, keep = null) {
  const plan = area.plan(makeRng(seed), opts);
  const all = plan.ops.length;
  if (keep) plan.ops = plan.ops.map((op, i) => (keep.includes(i) ? op : null));
  const ctx = new Ctx(area.name, seed);
  const t0 = Date.now();
  let timer;
  try {
    await Promise.race([
      area.run(plan, ctx, opts),
      new Promise((_, no) => (timer = setTimeout(() => no(new Error(`case ran over ${CASE_MS} ms`)), CASE_MS))),
    ]);
  } catch (e) {
    ctx.add('harness', 'case-threw', e?.stack || String(e));
  } finally {
    clearTimeout(timer);
    await ctx.dispose();
  }
  return { plan, all, findings: ctx.findings, trace: ctx.trace, ms: Date.now() - t0, timings: ctx.timings || {} };
}
const failing = (findings) => findings.filter((f) => f.cls === 'silent' || f.cls === 'loud');
const sigsOf = (area, findings) => [...new Set(findings.map((f) => signatureOf(area.name, f)))];

// ---------- replay ----------
if (opts.replay) {
  const [name, seed, keep] = String(opts.replay).split(':');
  const area = AREAS[name];
  if (!area || !/^\d+$/.test(seed || '')) throw new Error('--replay <area>:<case seed>[:<steps to keep, e.g. 0,3,4>]');
  const times = Number(flag('times', 1));
  let bad = 0;
  for (let n = 0; n < times; n++) {
    const r = await runOnce(area, Number(seed), keep ? keep.split(',').map(Number) : null);
    if (failing(r.findings).length) bad++;
    if (times > 1) {
      console.log(`run ${n + 1}: ${r.findings.length ? [...new Set(r.findings.map((f) => signatureOf(name, f)))].join(' ; ') : 'pass'} (${r.ms} ms)`);
      // The first run that fails is printed in full, below.
      if (!failing(r.findings).length || bad > 1) continue;
    }
    console.log(`# ${name} case ${seed} · kind ${r.plan.kind}${r.plan.browser ? ` · ${r.plan.browser}` : ''} · ${r.ms} ms`);
    console.log(`\n## plan${area.planLine ? ` (${area.planLine(r.plan)})` : ''}`);
    r.plan.ops.forEach((op, i) => console.log(`${String(i).padStart(3)}  ${op ? area.describe(op) : '(left out)'}`));
    console.log('\n## what happened');
    console.log(r.trace.join('\n'));
    console.log('\n## findings');
    for (const f of r.findings) console.log(`- ${signatureOf(name, f)}\n    ${f.detail.replace(/\n/g, '\n    ')}`);
    if (!r.findings.length) console.log('none: pass');
  }
  if (times > 1) console.log(`${bad} of ${times} runs failed`);
  await closeBrowsers();
  process.exit(0);
}

// ---------- the run ----------
// The page script is built once, before any lab starts (each lab would build it itself, all at once).
await (await import(pathToFileURL(path.join(REPO, 'lib/build.ts')).href)).ensureBuilt(REPO);

const counts = {}; // area -> { total, pass, loud, silent, flaky, unclear, harness }
const signatures = new Map(); // signature -> { area, cls, check, tags, cases, confirmed, flaky, example, repro }
const failures = []; // every failing case, one line each
const timings = {}; // name -> [ms], the settle times the areas measured
const caseMs = {};
const shares = areaNames.map((a) => SHARE[a] ?? 1);
const queue = [];
areaNames.forEach((a, k) => {
  const n = k === areaNames.length - 1 ? opts.cases - queue.length : Math.round((opts.cases * shares[k]) / shares.reduce((x, y) => x + y, 0));
  counts[a] = { total: 0, pass: 0, loud: 0, silent: 0, flaky: 0, unclear: 0, harness: 0 };
  for (let i = 0; i < n; i++) queue.push({ area: AREAS[a], index: i, seed: hashSeed(opts.seed, a, i) });
});
// Mixed, so the three areas load the machine together from start to end (the order still depends on the seed alone).
const order = makeRng(hashSeed(opts.seed, 'order')).shuffle(queue);
const sig = (key, area, f) => {
  if (!signatures.has(key)) signatures.set(key, { signature: key, area: area.name, cls: f.cls, check: f.check, tags: f.tags, cases: 0, confirmed: 0, flaky: 0, example: f.detail, repro: null });
  return signatures.get(key);
};

async function shrink(area, seed, key, all) {
  let keep = Array.from({ length: all }, (_, i) => i);
  let budget = opts.shrink;
  // A smoke run stops making cases smaller a minute in: it has to end within two.
  const late = () => smoke && Date.now() - t0 > 60000;
  for (let chunk = Math.ceil(keep.length / 2); chunk >= 1 && budget > 0 && !late(); ) {
    let smaller = false;
    for (let at = 0; at < keep.length && budget > 0 && !late(); ) {
      const cand = [...keep.slice(0, at), ...keep.slice(at + chunk)];
      budget--;
      const r = await runOnce(area, seed, cand);
      if (sigsOf(area, failing(r.findings)).includes(key)) {
        keep = cand;
        smaller = true;
      } else at += chunk;
    }
    if (!smaller || chunk > keep.length) chunk = Math.floor(chunk / 2);
  }
  return keep;
}

async function runCase(job) {
  const { area, seed } = job;
  const c = counts[area.name];
  const first = await runOnce(area, seed);
  (caseMs[area.name] ||= []).push(first.ms);
  for (const [k, list] of Object.entries(first.timings)) (timings[k] ||= []).push(...list);
  const bad = failing(first.findings);
  const keys = sigsOf(area, bad);
  for (const f of first.findings.filter((x) => x.cls === 'unclear' || x.cls === 'harness')) sig(signatureOf(area.name, f), area, f).cases++;
  let cls;
  const confirmedKeys = [];
  if (!keys.length) cls = first.findings.some((f) => f.cls === 'harness') ? 'harness' : first.findings.some((f) => f.cls === 'unclear') ? 'unclear' : 'pass';
  else {
    // Again, to tell a failure that comes back from one that doesn't. A signature seen come back five times already is
    // taken as known (no more reruns for it); one that never did in eight is taken as flaky.
    const known = (k) => signatures.get(k)?.confirmed >= 5;
    const lost = (k) => signatures.get(k)?.flaky >= 8 && !signatures.get(k)?.confirmed;
    const open = keys.filter((k) => !known(k) && !lost(k));
    const again = new Set(keys.filter(known));
    for (let n = 0; n < opts.confirm && open.some((k) => !again.has(k)); n++) for (const k of sigsOf(area, failing((await runOnce(area, seed)).findings))) again.add(k);
    for (const k of keys) {
      const f = bad.find((x) => signatureOf(area.name, x) === k);
      const s = sig(k, area, f);
      s.cases++;
      if (again.has(k)) {
        s.confirmed++;
        confirmedKeys.push(k);
        if (!s.repro) {
          s.repro = { seed, keep: null, ops: first.plan.ops.map((op) => area.describe(op)), kind: first.plan.kind, browser: first.plan.browser || null };
          const keep = opts.shrink > 0 && first.all > 1 ? await shrink(area, seed, k, first.all) : null;
          if (keep && keep.length < first.all) Object.assign(s.repro, { keep, ops: keep.map((i) => `${i}: ${area.describe(first.plan.ops[i])}`) });
        }
      } else {
        s.flaky++;
        s.flakySeed ??= seed;
      }
    }
    const confirmed = bad.filter((f) => confirmedKeys.includes(signatureOf(area.name, f)));
    cls = confirmed.some((f) => f.cls === 'silent') ? 'silent' : confirmed.length ? 'loud' : 'flaky';
    failures.push({ area: area.name, seed, kind: first.plan.kind, browser: first.plan.browser || null, class: cls, signatures: keys, confirmed: confirmedKeys, line: `${bad[0].check}: ${bad[0].detail.split('\n')[0].slice(0, 200)}`, ops: first.plan.ops.map((op) => area.describe(op)), replay: `node test/torture/run.mjs --replay ${area.name}:${seed}${first.plan.browser ? ' --browser-share 1' : ' --no-browser'}` });
  }
  // A case whose only notes are "unclear" passed: the note is counted beside it, not instead of it.
  c.total++;
  if (cls === 'unclear') (c.pass++, c.unclear++);
  else c[cls]++;
  if (opts.verbose && cls !== 'pass') console.error(`${cls.padEnd(7)} ${area.name}:${seed} ${keys.join(' ; ') || first.findings.map((f) => f.check).join(',')}`);
}

const t0 = Date.now();
let done = 0;
const total = order.length;
console.error(`torture: ${total} cases (${areaNames.map((a) => `${a} ${order.filter((j) => j.area.name === a).length}`).join(', ')}), seed ${opts.seed}, ${opts.concurrency} at once${opts.browser ? `, browsers in ~${Math.round(opts.browserShare * 100)}% of hotswap and agent-sync` : ', no browsers'}${opts.lan ? '' : ', no wifi address (phones come in as this computer)'}`);
const tick = setInterval(() => {
  const sum = (k) => Object.values(counts).reduce((n, c) => n + c[k], 0);
  console.error(`  ${done}/${total} · pass ${sum('pass')} loud ${sum('loud')} silent ${sum('silent')} flaky ${sum('flaky')} harness ${sum('harness')} · ${Math.round((Date.now() - t0) / 1000)} s`);
}, 10000);
tick.unref();
await Promise.all(
  Array.from({ length: Math.max(1, opts.concurrency) }, async () => {
    for (let job; (job = order.pop()); done++) {
      try {
        await runCase(job);
      } catch (e) {
        counts[job.area.name].total++;
        counts[job.area.name].harness++;
        console.error(`harness: ${job.area.name}:${job.seed} ${e?.stack || e}`);
      }
    }
  }),
);
clearInterval(tick);
await closeBrowsers();

// ---------- the report ----------
const seconds = Math.round((Date.now() - t0) / 1000);
const pct = (n, of) => (of ? `${((100 * n) / of).toFixed(1)}%` : '-');
const rows = [...Object.entries(counts), ['overall', Object.fromEntries(['total', 'pass', 'loud', 'silent', 'flaky', 'unclear', 'harness'].map((k) => [k, Object.values(counts).reduce((n, c) => n + c[k], 0)]))]];
console.log(`\ntorture: seed ${opts.seed}, ${total} cases, ${seconds} s at ${opts.concurrency} at once`);
console.log(`${'area'.padEnd(11)} ${'cases'.padStart(6)} ${'pass'.padStart(6)} ${'loud'.padStart(6)} ${'silent'.padStart(6)} ${'flaky'.padStart(6)} ${'harness'.padStart(7)}   pass%  loud%  silent%  flaky%   (passes with an "unclear" note)`);
for (const [name, c] of rows) console.log(`${name.padEnd(11)} ${String(c.total).padStart(6)} ${String(c.pass).padStart(6)} ${String(c.loud).padStart(6)} ${String(c.silent).padStart(6)} ${String(c.flaky).padStart(6)} ${String(c.harness).padStart(7)}   ${pct(c.pass, c.total).padStart(5)}  ${pct(c.loud, c.total).padStart(5)}  ${pct(c.silent, c.total).padStart(6)}  ${pct(c.flaky, c.total).padStart(5)}   ${c.unclear}`);
const sigList = [...signatures.values()].sort((a, b) => b.cases - a.cases);
const say = (title, list, each) => {
  if (!list.length) return;
  console.log(`\n${title}`);
  for (const s of list) each(s);
};
// A case with a real browser is replayed with one (--browser-share 1); the others without (--no-browser).
const withBrowser = (b) => (b ? ' --browser-share 1' : ' --no-browser');
const replayOf = (s) => `node test/torture/run.mjs --replay ${s.area}:${s.repro.seed}${s.repro.keep ? `:${s.repro.keep.join(',')}` : ''}${withBrowser(s.repro.browser)}`;
say('Failure signatures (came back on a second run of the same case):', sigList.filter((s) => s.confirmed), (s) => {
  console.log(`- [${s.cls}] ${s.signature}\n    ${bugTag(s.signature)}\n    ${s.cases} case${s.cases === 1 ? '' : 's'} (${s.confirmed} came back, ${s.flaky} did not)\n    e.g. ${s.example.split('\n')[0].slice(0, 300)}\n    replay: ${replayOf(s)}\n    steps: ${s.repro.ops.join(' → ').slice(0, 900)}`);
});
say('Flaky signatures (failed once, passed when the case was run again; a race shows here, many cases is a sign of one):', sigList.filter((s) => !s.confirmed && s.flaky), (s) => {
  console.log(`- [${s.cls}] ${s.signature}\n    ${bugTag(s.signature)}\n    ${s.cases} case${s.cases === 1 ? '' : 's'}, e.g. ${s.example.split('\n')[0].slice(0, 300)}\n    one of them: node test/torture/run.mjs --replay ${s.area}:${s.flakySeed} --times 20${/browser=/.test(s.signature) ? ' --browser-share 1' : ' --no-browser'}`);
});
say('Unclear (the contract does not say; noted, the case still passes):', sigList.filter((s) => s.cls === 'unclear'), (s) => console.log(`- ${s.signature}: ${s.cases} cases, e.g. ${s.example.split('\n')[0].slice(0, 240)}`));
say("Harness trouble (this test's own; not counted against labit):", sigList.filter((s) => s.cls === 'harness'), (s) => console.log(`- ${s.signature}: ${s.cases} cases, e.g. ${s.example.split('\n')[0].slice(0, 300)}`));
// Which known bugs showed in this run, and which signatures are new (a re-run after fixes: a bug that shows "not seen"
// is gone, a NEW signature is something nobody listed).
{
  const seen = sigList.filter((x) => (x.cls === 'silent' || x.cls === 'loud') && (x.confirmed || x.flaky));
  console.log('\nKnown bugs and their signatures in this run (confirmed = came back on a rerun; "flaky" = only once):');
  for (const b of KNOWN_BUGS) {
    const mine = seen.filter((x) => knownBugOf(x.signature)?.n === b.n);
    const conf = mine.filter((x) => x.confirmed);
    console.log(`- known bug ${String(b.n).padStart(2)} ${b.name.padEnd(34)} ${mine.length ? `${conf.length} signature${conf.length === 1 ? '' : 's'} confirmed, ${mine.length - conf.length} flaky only; ${mine.reduce((n, x) => n + x.cases, 0)} cases` : 'not seen'}`);
  }
  const fresh = seen.filter((x) => !knownBugOf(x.signature));
  console.log(fresh.length ? `NEW signatures (match no known bug), ${fresh.length}:` : 'NEW signatures: none');
  for (const x of fresh) console.log(`- [${x.cls}] ${x.signature}: ${x.cases} cases (${x.confirmed ? `${x.confirmed} came back` : 'flaky only'})`);
}
console.log('\nHow long things took (ms: half of them within, 99% within, slowest):');
for (const [k, list] of Object.entries(caseMs)) console.log(`- one ${k} case: ${spread(list).join(', ')}`);
for (const [k, list] of Object.entries(timings).sort()) console.log(`- ${k}: ${spread(list).join(', ')} (${list.length} measured)`);
if (opts.json) {
  fs.writeFileSync(String(opts.json), JSON.stringify({ seed: opts.seed, cases: total, seconds, concurrency: opts.concurrency, options: { confirm: opts.confirm, shrink: opts.shrink, browserShare: opts.browserShare, slow: opts.slow, lan: Boolean(opts.lan), browsers: Boolean(opts.browser) }, counts: Object.fromEntries(rows), signatures: sigList.map((x) => ({ ...x, knownBug: knownBugOf(x.signature)?.n ?? null })), failures, timings: Object.fromEntries(Object.entries(timings).map(([k, v]) => [k, spread(v)])) }, null, 2));
  console.log(`\nwrote ${opts.json}`);
}
// Exit 0 when the run itself worked: what it found is in the report (a caller reads the counts, not the exit code).
await sleep(50);
process.exit(0);
