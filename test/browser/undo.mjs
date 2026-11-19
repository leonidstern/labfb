// Undo after sending (Leo, 19 Nov): for 3 s a new pin's card shows "undo" in the resolve key's place, at resolve's
// width; a tap deletes the pin and closes the card, with no words left anywhere. Left alone, the card closes and the
// key is resolve again. Its own lab on a free port, its own LABIT_HOME (never the owner's lab or settings).
// Not part of `npm test`. Run: node test/browser/undo.mjs (needs playwright; NODE_PATH can point at a node_modules that
// has it; ENGINES=webkit,chromium for both). One line per check; exits 1 if any fails.
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (eng, name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${eng.padEnd(8)} ${name}${detail ? ` (${detail})` : ''}`);
};
const until = async (ok, ms = 6000) => {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(50)) if (await ok()) return true;
  return false;
};

async function lab(n) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'labit-undo-'));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'labit-home-'));
  const port = String(6700 + n * 40 + Math.floor(Math.random() * 30));
  const B = `http://localhost:${port}`;
  const env = { ...process.env, LAB_SETTLE_MS: '0', LABIT_HOME: home, LABIT_NO_UPDATE_CHECK: '1', LABIT_EXIT_WITH_PARENT: '1' };
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><meta charset="utf-8"><title>p</title><body style="margin:40px"><p id="a">first line</p><p id="b" style="margin-top:120px">second line</p></body>');
  const server = spawn(process.execPath, [LAB, '.', '--new', '--no-open', '--port', port], { cwd: dir, env });
  for (let i = 0; i < 80; i++) {
    try {
      await fetch(B + '/');
      break;
    } catch {
      await sleep(100);
    }
  }
  const comments = () => fetch(B + '/_lab/api/comments?page=/index').then((r) => r.json()).then((j) => j.comments || []);
  return { B, comments, stop: () => (server.kill(), fs.rmSync(dir, { recursive: true, force: true }), fs.rmSync(home, { recursive: true, force: true })) };
}

for (const [n, eng] of (process.env.ENGINES || 'chromium').split(',').entries()) {
  const L = await lab(n);
  const browser = await pw[eng].launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
    await ctx.addInitScript(() => localStorage.setItem('lab-name', 'leo'));
    const p = await ctx.newPage();
    await p.goto(L.B + '/');
    const shadow = (fn) => p.evaluate((f) => new Function('r', f)([...document.querySelectorAll('*')].find((x) => x.shadowRoot?.querySelector('.scrim'))?.shadowRoot), fn.toString().replace(/^[^{]*{|}$/g, ''));
    await until(() => p.evaluate(() => [...document.querySelectorAll('*')].some((x) => x.shadowRoot?.querySelector('.scrim'))));
    await sleep(300);
    const write = async (words) => {
      if (!(await p.evaluate(() => document.documentElement.classList.contains('lab-pinning')))) await p.keyboard.press('1');
      const b = await p.locator('#b').boundingBox();
      await p.mouse.click(b.x + 30, b.y + b.height / 2);
      await until(() => shadow(() => { return Boolean(r.querySelector('.float textarea')); }));
      await p.keyboard.type(words);
      await p.keyboard.press('Enter');
    };

    // Sent, then taken back within the 3 s.
    await write('fix this typo');
    const offered = await until(() => shadow(() => { return Boolean(r.querySelector('.card .btn.undo')); }), 2000);
    const widths = await shadow(() => {
      const u = r.querySelector('.card .btn.undo');
      return [u?.getBoundingClientRect().width, (() => { const t = document.createElement('button'); t.className = 'btn'; t.textContent = 'resolve'; u.parentNode.append(t); const w = t.getBoundingClientRect().width; t.remove(); return w; })()];
    });
    check(eng, 'after sending, the card shows undo in the resolve key\'s place', offered && (await L.comments()).length === 1);
    check(eng, 'undo keeps resolve\'s width', Math.abs(widths[0] - widths[1]) < 0.5, widths.join(' vs '));
    await shadow(() => { r.querySelector('.card .btn.undo').click(); });
    const gone = await until(async () => (await L.comments()).length === 0, 2000);
    const shut = await until(() => shadow(() => { return !r.querySelector('.float textarea') && !r.querySelector('.card:not(.out)') && !r.querySelector('.pin.draft'); }), 2000);
    const pins = await shadow(() => { return r.querySelectorAll('.pin:not(.draft)').length; });
    const kept = await p.evaluate(() => Object.keys(localStorage).filter((k) => /^lab-(typing|spot):/.test(k) && localStorage.getItem(k)).join(','));
    check(eng, 'undo deletes the pin (no comment left on the lab)', gone);
    check(eng, 'the card closes with no comment box and no pin', shut && pins === 0, `pins ${pins}`);
    check(eng, 'no draft kept in localStorage', kept === '', kept);
    await p.reload();
    await until(() => p.evaluate(() => [...document.querySelectorAll('*')].some((x) => x.shadowRoot?.querySelector('.scrim'))));
    await sleep(400);
    check(eng, 'after a reload no comment box comes back', await shadow(() => { return !r.querySelector('.float textarea'); }));

    // Sent again, then left alone: after 3 s the card closes and the pin stays.
    await write('fix this typo');
    await until(() => shadow(() => { return Boolean(r.querySelector('.card .btn.undo')); }), 2000);
    await sleep(3600);
    const after = await shadow(() => { return { card: Boolean(r.querySelector('.card:not(.out)')), undo: Boolean(r.querySelector('.btn.undo')) }; });
    check(eng, 'left alone, after 3 s the card has closed and the pin is kept', !after.card && !after.undo && (await L.comments()).length === 1, JSON.stringify(after));
  } finally {
    await browser.close();
    L.stop();
  }
}
process.exit(failed ? 1 : 0);
