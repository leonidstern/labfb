// Flags in real browsers (WebKit and Chrome's engine): nothing is being tried at the moment, so the ⋯ menu has no experiments
// row (inkOnText was dropped: a switch for it is refused), a page without the lab's key switches nothing, and an agent's pin
// wears labit's mark with no flag set. When a flag comes back, the list and its switch want a check here again. Not part of `npm test`; CI runs it in the `browser` job.
// Run: node test/browser/flags.mjs (needs playwright; NODE_PATH can point at a node_modules that has it).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { claimPort } from './port.mjs';
import { playwright, engines, LAB, tmp, labEnv, startLab, labUp, sleep, check, finish } from './harness.mjs';

const pw = playwright({ ciFails: true });

const DIR = tmp('labit-flags-');
const PORT = claimPort(7970, 30);
const B = `http://localhost:${PORT}`;
fs.writeFileSync(path.join(DIR, 'index.html'), '<!doctype html><meta charset="utf-8"><title>f</title><h1 id="t">Flags</h1><p>text</p>');
fs.writeFileSync(path.join(DIR, 'labit.json'), JSON.stringify({ port: PORT }));
const env = labEnv();
const server = startLab(DIR, env);
await labUp(B);

try {
  // A page without the lab's key (not this computer's browser) can't switch anything.
  const sw = await fetch(B + '/_lab/flags', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ flag: 'inkOnText', on: true }) });
  check('lab', 'POST /_lab/flags without the key is refused', sw.status === 403, String(sw.status));
  // An agent's pin, left the way an agent leaves one.
  execFileSync(process.execPath, [LAB, 'pin', '#t', 'a question from the agent'], { cwd: DIR, env: { ...env, PORT: String(PORT) }, stdio: 'pipe' });

  for (const eng of engines()) {
    const browser = await pw[eng].launch();
    try {
      const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
      await ctx.addInitScript(() => {
        localStorage.setItem('lab-name', 'tester');
        localStorage.setItem('lab-on', '1');
      });
      const p = await ctx.newPage();
      await p.goto(B + '/');
      // The widget, however long a busy machine takes to start it (a fixed 1.5 s was too short with eight jobs at once).
      await p.waitForFunction(() => [...document.querySelectorAll('*')].some((n) => n.shadowRoot?.querySelector('.more-menu')), null, { timeout: 15000 });
      await sleep(300);
      const r = () => p.evaluateHandle(() => [...document.querySelectorAll('*')].find((n) => n.shadowRoot?.querySelector('.more-menu'))?.shadowRoot);
      const menu = await (await r()).evaluate(async (root) => {
        root.querySelector('.more').click();
        await new Promise((res) => setTimeout(res, 300));
        const m = root.querySelector('.more-menu');
        return { open: !m.hidden, item: m.querySelector('.exp-btn')?.textContent || '', agentMark: root.querySelectorAll('.pin .agentmark').length };
      });
      check(eng, 'the ⋯ menu opens', menu.open);
      check(eng, 'no experiments row while nothing is being tried', menu.item === '', menu.item);
      check(eng, "with no flag set, the agent's pin wears labit's mark", menu.agentMark === 1, String(menu.agentMark));
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
finish();
