// Version links on a lab page in real browsers (WebKit and Chrome's engine): options get ids, `#v2` and `[words](#v2)`
// in a comment's message are links that scroll to the version and mark it, and an address with #v2 lands on it with
// the lab's outline. Not part of `npm test`; CI can run it in the `browser` job.
// Run: node test/browser/labversions.mjs (needs playwright; NODE_PATH can point at a node_modules that has it).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
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
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'labit-versions-'));
const PORT = 7960 + Math.floor(Math.random() * 30);
const B = `http://localhost:${PORT}`;
const gap = '<div style="height:1400px"></div>';
fs.writeFileSync(
  path.join(DIR, 'versions.html'),
  `<title>Versions</title>
<header id="top"><h1>Versions</h1></header>
<section id="layout"><h2>Layout</h2>
<ol class="lab-options">
  <li value="1"><b>Plain list</b><span>One column.</span></li>
  <li value="2" class="rec"><b>Cards</b><span>A grid.</span></li>
</ol></section>
${gap}
<section id="color"><h2>Colour</h2>
<ol class="lab-options">
  <li value="1" id="color-v1"><b>Green</b><span>Calm.</span></li>
  <li value="2" id="color-v2"><b>Grey</b><span>Quiet.</span></li>
</ol></section>
${gap}`,
);
fs.writeFileSync(path.join(DIR, 'labit.json'), JSON.stringify({ port: PORT }));
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
const post = (body) => fetch(`${B}/_lab/api/comments`, { method: 'POST', headers: { 'content-type': 'application/json', origin: B }, body: JSON.stringify(body) });
await post({
  page: '/versions',
  name: 'Sam',
  text: 'V1 · [plain list](#v1) or #color-v2, not #nowhere or [x](#nowhere)',
  anchor: { selector: '#top h1', x: 0.5, y: 0.5, docX: 0.1, docY: 40, width: 1000, element: '<h1>' },
});

try {
  for (const eng of ['webkit', 'chromium']) {
    const browser = await pw[eng].launch();
    try {
      const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
      await ctx.addInitScript(() => localStorage.setItem('lab-name', 'leo'));
      const p = await ctx.newPage();
      await p.goto(B + '/versions');
      await sleep(1200);
      const ids = await p.evaluate(() => [...document.querySelectorAll('.lab-options > li')].map((l) => l.id));
      check(eng, 'options get v1, v2 and keep their own ids', ids.join() === 'v1,v2,color-v1,color-v2', ids.join());
      await p.evaluate(() => [...document.querySelectorAll('*')].find((n) => n.shadowRoot?.querySelector('.scrim')).shadowRoot.querySelector('button.pin').click());
      await sleep(600);
      const links = await p.evaluate(() => {
        const r = [...document.querySelectorAll('*')].find((n) => n.shadowRoot?.querySelector('.scrim')).shadowRoot;
        return [...r.querySelectorAll('.msg a.link')].map((a) => `${a.textContent}>${a.getAttribute('href')}`);
      });
      check(eng, 'a message links [words](#id) and #id to versions on the page, not to ids it lacks', links.join('|') === 'plain list>#v1|#color-v2>#color-v2', links.join('|'));
      // Down the page first, then a click in the message goes to the version and marks it.
      await p.evaluate(() => scrollTo(0, 0));
      const click = async (text) => {
        await p.evaluate((t) => {
          const r = [...document.querySelectorAll('*')].find((n) => n.shadowRoot?.querySelector('.scrim')).shadowRoot;
          [...r.querySelectorAll('.msg a.link')].find((a) => a.textContent === t).click();
        }, text);
        await sleep(1200);
      };
      await click('#color-v2');
      const where = await p.evaluate(() => {
        const t = document.getElementById('color-v2').getBoundingClientRect();
        return { scrolled: scrollY > 1000, inView: t.top >= 0 && t.bottom <= innerHeight };
      });
      check(eng, 'clicking #color-v2 scrolls to that version', where.scrolled && where.inView, JSON.stringify(where));
      const marked = await p.evaluate(() => document.getElementById('color-v2').getAnimations().length > 0);
      check(eng, 'and marks it for a moment', marked);
      await p.evaluate(() => scrollTo(0, 0));
      await click('plain list');
      const back = await p.evaluate(() => scrollY < 400 && document.getElementById('v1').getBoundingClientRect().top < innerHeight);
      check(eng, 'clicking [plain list](#v1) goes back up to version 1', back);
      // An address with the id lands on it, outlined by the lab's stylesheet.
      await p.goto(B + '/versions#color-v1');
      await sleep(500);
      const outline = await p.evaluate(() => getComputedStyle(document.getElementById('color-v1')).outlineStyle);
      check(eng, 'an address with #color-v1 outlines that version', outline === 'solid', outline);
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
