// Saves that arrive close together must not leave a page worse off: a stylesheet saved with a picture nothing on the page shows
// (two swaps of one file at once), a page saved with its stylesheet (patched in place, not reloaded), and a saved CSS file
// that was missed while the stream was down. Run: node test/browser/hotrace.mjs (needs playwright; NODE_PATH can point at one).
import fs from 'node:fs';
import path from 'node:path';
import { claimPort } from './port.mjs';
import { playwright, engines, tmp, labEnv, startLab, labUp, sleep, check, finish } from './harness.mjs';

const pw = playwright();
const DIR = tmp('labit-hotrace-');
const PORT = claimPort(10900, 30);
const B = `http://localhost:${PORT}`;
const svg = (w) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="10"><rect width="${w}" height="10" fill="red"/></svg>`;
const page = (h) => `<!doctype html><html><head><meta charset="utf-8"><title>t</title><link rel="stylesheet" href="s.css"></head><body><main id="m">${h}</main></body></html>`;
const w = (f, t) => fs.writeFileSync(path.join(DIR, f), t);
w('index.html', page('hello'));
w('s.css', 'main{color:rgb(255,0,0);background:url(bg.svg)}');
w('bg.svg', svg(10));
w('data.json', '{"n":1}');
w('labit.json', JSON.stringify({ port: PORT }));
const server = startLab(DIR, labEnv());
await labUp(B);
try {
  for (const eng of engines()) {
    const browser = await pw[eng].launch();
    try {
      const pg = await (await browser.newContext()).newPage();
      await pg.goto(B + '/');
      await sleep(1800);
      const links = () => pg.evaluate(() => document.querySelectorAll('link[rel=stylesheet]').length);
      const color = () => pg.evaluate(() => getComputedStyle(document.getElementById('m')).color);
      let lost = 0;
      for (let i = 0; i < 6; i++) {
        w('s.css', `main{color:rgb(0,0,${200 + i});background:url(bg.svg)}`);
        w('bg.svg', svg(20 + i));
        await sleep(1300);
        if (!(await links())) {
          lost++;
          await pg.reload();
          await sleep(1000);
        }
      }
      check(eng, 'a stylesheet saved with a picture no element shows keeps its stylesheet (6 rounds)', lost === 0, `${lost} rounds lost it`);
      check(eng, '… and shows the newest colour', (await color()) === 'rgb(0, 0, 205)', await color());

      let loads = 0;
      pg.on('load', () => loads++);
      w('index.html', page('hello again'));
      w('s.css', 'main{color:rgb(0,128,0);background:url(bg.svg)}');
      await sleep(1500);
      check(eng, 'a page saved with its stylesheet is patched, not reloaded', loads === 0 && (await pg.textContent('#m')) === 'hello again', `loads ${loads}`);
      check(eng, '… and its stylesheet is the new one', (await color()) === 'rgb(0, 128, 0)' && (await links()) === 1, `${await color()}, ${await links()} links`);

      // A picture only a stylesheet shows can't be swapped (the browser keeps its copy): the page loads again. A file the page never loaded
      // (a package.json, a note) leaves it alone, and so does a data file it didn't fetch.
      loads = 0;
      w('package.json', '{"a":1}');
      w('notes.txt', 'one');
      await sleep(1200);
      check(eng, 'a file the page never loaded leaves it alone', loads === 0, `loads ${loads}`);
      w('bg.svg', svg(77));
      await sleep(1800);
      check(eng, 'a picture only a stylesheet shows loads the page again', loads === 1, `loads ${loads}`);
      await pg.evaluate(() => fetch('/data.json').then((r) => r.text()));
      loads = 0;
      w('data.json', '{"n":2}');
      await sleep(1500);
      check(eng, 'a data file the page fetched loads it again', loads === 1, `loads ${loads}`);
    } finally {
      await browser.close();
    }
  }
  finish();
} finally {
  server.kill();
}
