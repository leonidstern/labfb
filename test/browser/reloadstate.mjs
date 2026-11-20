// A reload the lab makes (a page with a script of its own is reloaded on a save, not patched) puts back what you did to
// the page: the scroll, a scrolled box, an opened <details>, typed words, a tick, a choice. A page that builds itself
// after it loads gets its scroll back once it is long enough. Not part of `npm test`; CI runs it in the `browser` job.
// Run: node test/browser/reloadstate.mjs (needs playwright; NODE_PATH can point at a node_modules that has it).
import fs from 'node:fs';
import path from 'node:path';
import { claimPort } from './port.mjs';
import { playwright, engines, tmp, labEnv, startLab, labUp, sleep, check, finish } from './harness.mjs';

const pw = playwright();

const DIR = tmp('labit-reloadstate-');
const PORT = claimPort(10600, 30);
const B = `http://localhost:${PORT}`;
const lines = (n) => Array.from({ length: n }, (_, i) => `<p>Paragraph number ${i} with some words in it.</p>`).join('\n');
const page = (word) => `<!doctype html><meta charset="utf-8"><title>t</title>
<h1>Title ${word}</h1>
<details><summary>More</summary><p>hidden</p></details>
<input id="in"><textarea></textarea><input type="checkbox" id="cb"><input type="password" id="pw">
<input id="same" value="from the file ${word}">
<select id="sel"><option>a<option>b<option>c</select>
<div id="box" style="height:200px;overflow:auto">${lines(60)}</div>
${lines(40)}<h2 id="target">Target</h2>${lines(80)}<script>window.own = 1</script>`;
const save = (f, text) => fs.writeFileSync(path.join(DIR, f), text);
save('index.html', page('one'));
const app = `setTimeout(() => (document.getElementById('late').innerHTML = ${JSON.stringify(lines(150))}), 700);`;
save('app.js', app);
save('late.html', '<!doctype html><meta charset="utf-8"><title>l</title><h1>Late</h1><div id="late"></div><script src="app.js"></script>');
save('labit.json', JSON.stringify({ port: PORT }));
const server = startLab(DIR, labEnv());
await labUp(B);
try {
  for (const eng of engines()) {
    const browser = await pw[eng].launch();
    try {
      const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
      await ctx.addInitScript(() => localStorage.setItem('lab-name', 'tester'));
      const open = async (p) => {
        const pg = await ctx.newPage();
        await pg.goto(B + p);
        await pg.waitForFunction(() => [...document.querySelectorAll('*')].some((n) => n.shadowRoot), null, { timeout: 5000 });
        await sleep(800);
        await pg.evaluate(() => (window.__kept = 1));
        return pg;
      };
      const pg = await open('/');
      await pg.fill('#in', 'typed');
      await pg.fill('textarea', 'area');
      await pg.fill('#pw', 'secret');
      await pg.evaluate(() => {
        document.activeElement.blur();
        document.getElementById('target').scrollIntoView();
        document.getElementById('box').scrollTop = 300;
        document.querySelector('details').open = true;
        document.getElementById('cb').checked = true;
        document.getElementById('sel').selectedIndex = 2;
      });
      const y = await pg.evaluate(() => Math.round(scrollY));
      await sleep(1800); // a reload waits 1.5 s after a touch
      save('index.html', page('two'));
      await pg.waitForFunction(() => !window.__kept && document.querySelector('h1')?.textContent === 'Title two', null, { timeout: 8000 }).catch(() => {});
      await sleep(600);
      const s = await pg.evaluate(() => ({
        reloaded: !window.__kept, y: Math.round(scrollY), box: document.getElementById('box').scrollTop, open: document.querySelector('details').open,
        input: document.getElementById('in').value, area: document.querySelector('textarea').value, tick: document.getElementById('cb').checked,
        sel: document.getElementById('sel').selectedIndex, pw: document.getElementById('pw').value, same: document.getElementById('same').value,
      }));
      const d = JSON.stringify(s);
      check(eng, 'a page with a script reloads on its save (control)', s.reloaded, d);
      check(eng, 'the scroll comes back', Math.abs(s.y - y) < 3, `${y} -> ${s.y}`);
      check(eng, 'a scrolled box comes back', s.box === 300, d);
      check(eng, 'an opened <details> is open again', s.open, d);
      check(eng, 'typed words come back (a field, a textarea)', s.input === 'typed' && s.area === 'area', d);
      check(eng, 'a tick and a choice come back', s.tick && s.sel === 2, d);
      check(eng, 'a password is not kept', s.pw === '', d);
      check(eng, 'a field you left alone follows the file', s.same === 'from the file two', d);
      check(eng, 'nothing is left in sessionStorage', (await pg.evaluate(() => Object.keys(sessionStorage).filter((k) => k.startsWith('lab-scroll:')).length)) === 0);
      await pg.close();

      // A page that is short when it loads and builds itself 700 ms later.
      const late = await open('/late');
      await sleep(900);
      await late.evaluate(() => scrollTo(0, 3000));
      await sleep(1800);
      save('app.js', app + '\n// saved');
      await late.waitForFunction(() => !window.__kept, null, { timeout: 8000 }).catch(() => {});
      await sleep(2000);
      const ly = await late.evaluate(() => Math.round(scrollY));
      check(eng, 'a page built after it loads gets its scroll back', Math.abs(ly - 3000) < 3, `3000 -> ${ly}`);
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
