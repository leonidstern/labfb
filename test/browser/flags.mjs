// Flags from labit.json in real browsers (WebKit and Chrome's engine): the ⋯ menu has no switches for them (no
// "trying" section), the lab takes no switch from a page, and a flag set in the file still turns its feature on
// (agentPins: an agent's pin wears labit's mark, not a letter). Not part of `npm test`; CI runs it in the `browser` job.
// Run: node test/browser/flags.mjs (needs playwright; NODE_PATH can point at a node_modules that has it).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const pw = (() => {
  for (const paths of [undefined, (process.env.NODE_PATH || '').split(path.delimiter)]) {
    try {
      return require(require.resolve('playwright', paths && { paths }));
    } catch {}
  }
  console.log('playwright is not installed: skipped');
  process.exit(0);
})();

const LAB = fileURLToPath(new URL('../../local.mjs', import.meta.url));
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'labit-flags-'));
const PORT = 7970 + Math.floor(Math.random() * 30);
const B = `http://localhost:${PORT}`;
fs.writeFileSync(path.join(DIR, 'index.html'), '<!doctype html><meta charset="utf-8"><title>f</title><h1 id="t">Flags</h1><p>text</p>');
fs.writeFileSync(path.join(DIR, 'labit.json'), JSON.stringify({ port: PORT, flags: { agentPins: true } }));
const env = { ...process.env, PORT: '', XDG_CONFIG_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'labit-cfg-')), LABIT_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'labit-home-')), LABIT_NO_UPDATE_CHECK: '1' };
const server = spawn(process.execPath, [LAB, '--new', '--no-open'], { cwd: DIR, env });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 80; i++) {
  try {
    await fetch(B + '/');
    break;
  } catch {
    await sleep(100);
  }
}
let failed = 0;
const check = (eng, name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${eng.padEnd(8)} ${name}${detail ? ` (${detail})` : ''}`);
};

try {
  // The lab no longer takes a switch from a page: the old endpoint is not there.
  const sw = await fetch(B + '/_lab/flags', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ flag: 'liveUrl', on: true }) });
  check('lab', 'POST /_lab/flags switches nothing', sw.status !== 200, String(sw.status));
  check('lab', 'labit.json is as it was', JSON.parse(fs.readFileSync(path.join(DIR, 'labit.json'), 'utf8')).flags.liveUrl === undefined);
  // An agent's pin, left the way an agent leaves one.
  execFileSync(process.execPath, [LAB, 'pin', '#t', 'a question from the agent'], { cwd: DIR, env: { ...env, PORT: String(PORT) }, stdio: 'pipe' });

  for (const eng of ['webkit', 'chromium']) {
    const browser = await pw[eng].launch();
    try {
      const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
      await ctx.addInitScript(() => {
        localStorage.setItem('lab-name', 'leo');
        localStorage.setItem('lab-on', '1');
      });
      const p = await ctx.newPage();
      await p.goto(B + '/');
      await sleep(1500);
      const menu = await p.evaluate(async () => {
        const r = [...document.querySelectorAll('*')].find((n) => n.shadowRoot?.querySelector('.more-menu'))?.shadowRoot;
        r?.querySelector('.more')?.click();
        await new Promise((res) => setTimeout(res, 300));
        const m = r?.querySelector('.more-menu');
        return {
          open: Boolean(m && !m.hidden),
          text: m?.textContent || '',
          switches: m?.querySelectorAll('[role="switch"], .trying, .trying-head').length ?? -1,
          agentMark: r?.querySelectorAll('.pin .agentmark').length ?? 0,
        };
      });
      check(eng, 'the ⋯ menu opens', menu.open);
      check(eng, 'the ⋯ menu has no trying section', menu.switches === 0 && !/trying/i.test(menu.text), menu.text.slice(0, 120));
      check(eng, "no flag's name is in the menu", !/live URL|labit's mark/.test(menu.text));
      check(eng, "agentPins from labit.json: the agent's pin wears labit's mark", menu.agentMark === 1, String(menu.agentMark));
      await p.goto('about:blank');
      await ctx.close();
    } finally {
      await browser.close();
    }
  }
} finally {
  server.kill();
  fs.rmSync(DIR, { recursive: true, force: true });
}
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
