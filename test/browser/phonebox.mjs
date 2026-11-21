// A phone's new comment box keeps its placeholder on one line (Leo, 21 Nov: "no agent listening yet" wrapped under
// "as <name>" and the second line was half cut off). The box is held (400 ms) open, with no agent listening.
// Run: node test/browser/phonebox.mjs (needs playwright). Not part of `npm test`; CI runs it in the `browser` job.
import fs from 'node:fs';
import path from 'node:path';
import { claimPort } from './port.mjs';
import { playwright, engines, tmp, labEnv, startLab, labUp, sleep, check, finish } from './harness.mjs';

const pw = playwright({ ciFails: true });
const DIR = tmp('labit-phonebox-');
const PORT = String(claimPort(6070, 30));
const B = `http://localhost:${PORT}`;
fs.writeFileSync(path.join(DIR, 'index.html'), '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>P</title><body style="margin:20px"><h1>Hello</h1><p>Some words to hold on.</p></body>');
const server = startLab(DIR, labEnv({}, { settings: false }), { root: '.', port: PORT });
await labUp(B);

for (const eng of engines('chromium')) {
  const browser = await pw[eng].launch();
  for (const width of [390, 375]) {
    const ctx = await browser.newContext({ viewport: { width, height: 700 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(() => localStorage.setItem('lab-name', 'Leo'));
    const p = await ctx.newPage();
    await p.goto(B + '/');
    await p.waitForFunction(() => [...document.querySelectorAll('*')].some((n) => n.shadowRoot?.querySelector('.scrim')), null, { timeout: 10000 });
    await sleep(500);
    // The hold: a made-up touch pointer down for 700 ms (the widget's timer makes the pin at 400).
    const at = await p.evaluate(() => { const r = document.querySelector('p').getBoundingClientRect(); return [r.left + 40, r.top + 8]; });
    await p.evaluate(([x, y]) => document.elementFromPoint(x, y).dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, button: 0, bubbles: true, composed: true })), at);
    await sleep(700);
    const t = await p
      .waitForFunction(() => {
        const r = [...document.querySelectorAll('*')].find((n) => n.shadowRoot?.querySelector('.scrim'))?.shadowRoot;
        const ta = r?.querySelector('.float textarea');
        return ta ? { ph: ta.placeholder, h: ta.getBoundingClientRect().height } : null;
      }, null, { timeout: 5000 })
      .then((h) => h.jsonValue());
    check(eng, `${width} px phone: the empty box is one line tall (36 px), so the placeholder didn't wrap`, t.h <= 40, JSON.stringify(t));
    await ctx.close();
  }
  await browser.close();
}
server.kill();
finish();
