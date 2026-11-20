// Several marks, then words: the person draws more than one thing (in one drawing, or several drawings and then a typed
// comment) and says what's wrong across them ("these don't line up"). The real widget makes the comments on a copy of
// dash.html per scenario; an agent (Sonnet by default) gets the page's agent text, as a wait hands it over, edits a
// fresh copy; a Sonnet grader reads the diff against what the fix must show.
//   NODE_PATH=<folder with playwright-core>/node_modules node bench/multi/run.mjs [sonnet] [runs]
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFile, execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHAPES } from '../drawings/shapes.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const OUT = join(HERE, 'out');
const SITE = join(OUT, 'site');
const PORT = 4494;
const MODEL = process.argv[2] || 'sonnet';
const RUNS = Number(process.argv[3] || 2);
const TAG = process.env.TAG || 'run';

// Each: what is drawn (groups of marks: one group = one drawing, D held throughout), the words, and what must change.
const SCEN = [
  { id: 'one-drawing-align', groups: [[['circle', '.users .value'], ['circle', '.revenue .value'], ['circle', '.churn .value']]], words: "these don't line up",
    problem: "The Revenue value sits lower than the other two stat values: .stat.revenue .value has margin-top: 18px instead of the shared 4px.", done_when: 'The three stat values share one top margin (the .stat.revenue .value override is gone or matches 4px); nothing else changes.' },
  { id: 'three-drawings-then-ask', groups: [[['circle', '.actions .primary']], [['circle', '.actions a[href="#share"]']], [['circle', '.actions .export']]], chat: 'the 3 I circled should sit on one line',
    problem: 'Export sits 9px lower than New report and Share: .btn.export has margin-top: 9px.', done_when: 'The three action buttons align on one line (the .btn.export margin-top is gone); their order and styles are otherwise unchanged.' },
  { id: 'mixed-marks-one-ask', groups: [[['x', '.tag.t4'], ['x', '.tag.t5'], ['circle', '.tag.t3']]], words: 'drop the crossed ones, make the circled one stand out',
    problem: 'Old and Archived tags should go; Draft should look different from the other tags (stand out).', done_when: 'The Old and Archived tags are removed; Draft has a visibly different style (colour or weight) from Q3 and EU; Q3 and EU are unchanged.' },
  { id: 'move-and-rename', groups: [[['arrow', '.card.c h2', '.card.a h2'], ['circle', '.card.b h2']]], words: 'move this one first. and this title is wrong, should be Notifications',
    problem: 'Integrations card should come first (before Weekly digest); the Alerts card title should read Notifications.', done_when: 'The Integrations card is the first card in .cards; the second-marked card (formerly Alerts) is titled Notifications; Weekly digest is kept.' },
];

const AGAIN = process.env.AGENTS_ONLY; // reuse the comments made last time
if (!AGAIN) rmSync(OUT, { recursive: true, force: true });
mkdirSync(SITE, { recursive: true });
for (const s of SCEN) cpSync(join(HERE, 'dash.html'), join(SITE, `${s.id}.html`));
const lab = AGAIN ? { kill() {} } : spawn('node', [join(ROOT, 'local.mjs'), '.', '--port', String(PORT), '--no-open', '--new'], { cwd: SITE, stdio: 'ignore' });
process.on('exit', () => lab.kill());
for (let i = 0; i < (AGAIN ? 0 : 40); i++) {
  try {
    if ((await fetch(`http://localhost:${PORT}/${SCEN[0].id}`)).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 250));
}

const browser = AGAIN ? null : await chromium.launch({ channel: 'chrome' });
const page = AGAIN ? null : await browser.newPage({ viewport: { width: 1280, height: 900 } });
if (page) await page.addInitScript(() => (localStorage.setItem('lab-name', 'leo'), localStorage.setItem('lab-on', '1')));
const boxOf = (sel) => page.locator(sel).first().evaluate((e) => {
  const r = document.createRange();
  r.selectNodeContents(e);
  let b = r.getBoundingClientRect();
  if (!b.width || !b.height) b = e.getBoundingClientRect();
  return { x: b.x, y: b.y, w: b.width, h: b.height };
});
const root = `[...document.querySelectorAll('*')].find((n) => n.shadowRoot?.querySelector('.scrim'))?.shadowRoot`;
const until = (sel, ms = 3000) => page.waitForFunction((s) => Boolean(new Function(`return ${s[0]}`)()?.querySelector(s[1])), [root, sel], { timeout: ms }).catch(() => {});
for (const s of AGAIN ? [] : SCEN) {
  await page.goto(`http://localhost:${PORT}/${s.id}`);
  await page.waitForTimeout(1200);
  for (const [gi, group] of s.groups.entries()) {
    await page.keyboard.down('d');
    for (const [mark, on, to] of group) {
      const strokes = SHAPES[mark](await boxOf(on), to ? await boxOf(to) : null);
      for (const st of strokes) {
        await page.mouse.move(st[0][0], st[0][1]);
        await page.mouse.down();
        for (const [x, y] of st.slice(1)) await page.mouse.move(x, y, { steps: 4 });
        await page.mouse.up();
        await page.waitForTimeout(150);
      }
    }
    await page.keyboard.up('d');
    await until('.float textarea');
    if (s.words && gi === s.groups.length - 1) await page.keyboard.type(s.words);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(800);
  }
  if (s.chat) {
    await page.keyboard.press('t'); // the chat: a comment on the page as a whole
    await until('.chatwin textarea');
    await page.waitForTimeout(300);
    await page.keyboard.type(s.chat);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(800);
    await page.keyboard.press('Escape');
  }
  const text = await (await fetch(`http://localhost:${PORT}/_lab/agent/${s.id}`)).text();
  writeFileSync(join(OUT, `${s.id}.txt`), text);
  console.log(`${s.id}: ${(text.match(/^## /gm) || []).length} comments, marks: ${[...text.matchAll(/^drawn: (.*)$/gm)].map((m) => m[1]).join(' · ')}`);
}
await browser?.close();
lab.kill();

const claude = (args, cwd) => new Promise((done) => execFile('claude', args, { cwd, timeout: 300000, maxBuffer: 1 << 24 }, (err, out) => {
  try {
    done(JSON.parse(out));
  } catch {
    done({ result: String(out || err) });
  }
}));
const diffOf = (a, b) => {
  try {
    execFileSync('diff', ['-u', a, b]);
    return '';
  } catch (e) {
    return String(e.stdout);
  }
};
const results = [];
const jobs = SCEN.flatMap((s) => Array.from({ length: RUNS }, (_, n) => ({ s, n })));
const run = async ({ s, n }) => {
  const dir = join(OUT, `run-${TAG}-${s.id}-${n}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  cpSync(join(HERE, 'dash.html'), join(dir, `${s.id}.html`));
  // The lab's own lines that point at its folder (where to answer, the live link) are left out: the agent works in its own copy.
  const pins = readFileSync(join(OUT, `${s.id}.txt`), 'utf8').split('\n').filter((l) => !/^(to answer|always up to date): /.test(l)).join('\n');
  const prompt = `You answer comments people leave on pages in a lab (labit). This folder is the site; the page /${s.id} is ${s.id}.html. These comments came in together:\n\n${pins}\n\nDo the work they ask for in the files now (no one is around to answer questions). Then end with one short line: what you did.`;
  const t0 = Date.now();
  const j = await claude(['-p', prompt, '--output-format', 'json', '--model', MODEL, '--permission-mode', 'acceptEdits', '--allowedTools', 'Read,Edit,Write,Grep,Glob'], dir);
  const said = String(j.result || '').trim().split('\n').filter(Boolean).at(-1) || '';
  const diff = diffOf(join(HERE, 'dash.html'), join(dir, `${s.id}.html`));
  const g = await claude(['-p', `You grade a coding agent's edit for a design review benchmark. Reply with JSON only:\n{"verdict":"right|partial|wrong|nothing","unrelated":<changes that have nothing to do with it>,"why":"<one short line>"}\n\nWhat the reviewer meant: ${s.problem}\nDone when: ${s.done_when}\nThe agent's last words: ${said}\n\nThe diff (empty = nothing changed):\n${diff.slice(0, 12000) || '(empty)'}`, '--output-format', 'json', '--model', 'sonnet', '--allowedTools', ''], OUT);
  let grade = {};
  try {
    grade = JSON.parse(/\{[\s\S]*\}/.exec(g.result || '')?.[0] || '{}');
  } catch {}
  results.push({ id: s.id, n, verdict: grade.verdict || '?', unrelated: grade.unrelated ?? null, why: grade.why || '', s: Math.round((Date.now() - t0) / 100) / 10, turns: j.num_turns, said });
  console.log(`${(grade.verdict || '?').padEnd(8)} ${s.id.padEnd(24)} #${n} ${Math.round((Date.now() - t0) / 1000)}s ${j.num_turns}t  ${grade.why || ''}`.slice(0, 220));
};
const queue = [...jobs];
await Promise.all(Array.from({ length: 3 }, async () => {
  while (queue.length) await run(queue.shift());
}));
writeFileSync(join(HERE, `results-${TAG}.json`), JSON.stringify(results, null, 2));
const right = results.filter((r) => r.verdict === 'right').length;
console.log(`${MODEL} ${TAG}: right ${right} / ${results.length}`);
