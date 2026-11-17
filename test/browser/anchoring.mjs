// How pins find their spot again after the page changes (src/widget/anchoring.ts), in Safari's engine (WebKit) and
// Chrome's. No lab server: the module is bundled on its own and run on small pages. Not part of `npm test`; CI runs it
// in the `browser` job. Run: node test/browser/anchoring.mjs   (needs playwright; NODE_PATH can point at one).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const pw = (() => {
  try {
    return require('playwright');
  } catch {
    try {
      return require(require.resolve('playwright', { paths: (process.env.NODE_PATH || '').split(path.delimiter) }));
    } catch {
      console.log('playwright is not installed: skipped');
      process.exit(0);
    }
  }
})();

const SRC = fileURLToPath(new URL('../../src/widget/anchoring.ts', import.meta.url));
const OUT = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'labit-anchoring-')), 'anchoring.js');
execFileSync('npx', ['--yes', 'esbuild@0.25.12', SRC, '--bundle', '--format=iife', '--global-name=A', `--outfile=${OUT}`, '--log-level=warning']);
const BUNDLE = fs.readFileSync(OUT, 'utf8');

let failed = 0;
const check = (eng, name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${eng.padEnd(8)} ${name}${detail ? ` (${detail})` : ''}`);
};

// A page with the module bound to a stand-in widget, and helpers to pin and to place a pin.
const open = async (ctx, body) => {
  const p = await ctx.newPage();
  await p.setContent(`<!doctype html><meta charset="utf-8"><style>body{margin:20px;font:16px/1.4 sans-serif}</style><body>${body}</body>`);
  await p.addScriptTag({ content: BUNDLE });
  await p.evaluate(() => {
    const host = document.createElement('div');
    document.documentElement.append(host);
    const el = (tag) => document.createElement(tag);
    A.bindAnchoring({ host, layer: host, el, store: { get: () => '', set: () => {} } });
    // The middle of a word on the page, in window pixels.
    window.wordAt = (word, root = document.body) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let t = walker.nextNode(); t; t = walker.nextNode()) {
        const i = t.data.search(new RegExp(`\\b${word}\\b`));
        if (i < 0) continue;
        const r = document.createRange();
        r.setStart(t, i);
        r.setEnd(t, i + word.length);
        const b = r.getBoundingClientRect();
        return { x: b.left + b.width / 2, y: b.top + b.height / 2, left: b.left + scrollX, right: b.right + scrollX, top: b.top + scrollY, bottom: b.bottom + scrollY };
      }
      return null;
    };
  });
  return p;
};

try {
  for (const eng of (process.env.ENGINES || 'chromium,webkit').split(',')) {
    const browser = await pw[eng].launch();
    try {
      const ctx = await browser.newContext({ viewport: { width: 900, height: 700 } });

      // 1. Cards reordered and the pinned one removed: the card now at the old path is not it.
      let p = await open(ctx, '<div id="list"><div class="card">Alpha card</div><div class="card">Beta card</div><div class="card">Gamma card</div></div>');
      let r = await p.evaluate(() => {
        const b = document.querySelectorAll('.card')[1].getBoundingClientRect();
        const a = A.anchorAt(b.left + 2, b.top + 2);
        a.kind = 'element'; // a click on the card, not on its words
        delete a.quote;
        document.getElementById('list').innerHTML = '<div class="card">Gamma card</div><div class="card">Alpha card</div><div class="card">Delta card</div>';
        return A.position(a);
      });
      check(eng, 'reordered twins: a pin whose card is gone shows as moved', r.moved === true, JSON.stringify(r));
      r = await p.evaluate(() => {
        document.getElementById('list').innerHTML = '<div class="card">Alpha card</div><div class="card">Beta card</div><div class="card">Gamma card</div>';
        const b = document.querySelectorAll('.card')[1].getBoundingClientRect();
        const a = A.anchorAt(b.left + 2, b.top + 2);
        a.kind = 'element';
        delete a.quote;
        document.getElementById('list').innerHTML = '<div class="card">Gamma card</div><div class="card">Alpha card</div><div class="card">Beta card</div>';
        const now = document.querySelectorAll('.card')[2].getBoundingClientRect();
        const at = A.position(a);
        return { at, top: now.top + scrollY, bottom: now.bottom + scrollY };
      });
      check(eng, 'reordered twins: a pin follows its card by its words', !r.at.moved && r.at.top >= r.top && r.at.top <= r.bottom, JSON.stringify(r));
      await p.close();

      // 2. The same words in two sections: the pin stays in its own box, not the nearer twin in the other one.
      p = await open(ctx, `<section id="s1"><ul><li class="item">Same words</li></ul></section>
        <section id="s2"><div id="pad"></div><ul><li class="item">Same words</li></ul></section>`);
      r = await p.evaluate(() => {
        const li = document.querySelector('#s2 li').getBoundingClientRect();
        const a = A.anchorAt(li.left + 2, li.top + 2);
        a.kind = 'element';
        delete a.quote;
        delete a.section;
        // A new item before it (its path now leads to that one), and room pushing it far below the other section's twin.
        document.querySelector('#s2 ul').insertAdjacentHTML('afterbegin', '<li class="item">A new item</li>');
        document.getElementById('pad').style.height = '900px';
        const now = document.querySelectorAll('#s2 li')[1].getBoundingClientRect();
        return { a: { inside: a.inside, block: a.block }, at: A.position(a), top: now.top + scrollY, bottom: now.bottom + scrollY };
      });
      check(eng, 'twins in two sections: searched inside its own box first', !r.at.moved && r.at.top >= r.top && r.at.top <= r.bottom, JSON.stringify(r));
      await p.close();

      // 3. A pin on a word: words added before it in the same paragraph, the pin stays on the word.
      p = await open(ctx, '<p id="t" style="width:400px">Some words here and the target word sits in the middle of this line of text.</p>');
      r = await p.evaluate(() => {
        const w = wordAt('target');
        const a = A.anchorAt(w.x, w.y);
        document.getElementById('t').firstChild.data = 'Lots of brand new words came first, pushing everything on. ' + document.getElementById('t').firstChild.data;
        return { kind: a.kind, at: A.position(a), word: wordAt('target') };
      });
      check(eng, 'a pin on a word stays on the word when text before it changes', r.kind === 'text' && !r.at.moved && r.at.left >= r.word.left && r.at.left <= r.word.right && r.at.top >= r.word.top && r.at.top <= r.word.bottom, JSON.stringify(r));
      await p.close();

      // 6. A pin on words straight in the page (no element of their own): found again by its quote, moved when gone.
      p = await open(ctx, '<div id="top"></div>Loose text with a findme word in it.');
      r = await p.evaluate(() => {
        const w = wordAt('findme');
        const a = A.anchorAt(w.x, w.y);
        document.getElementById('top').style.height = '300px';
        const at = A.position(a);
        const word = wordAt('findme');
        document.body.lastChild.data = 'Loose text, the word was taken out.';
        return { selector: a.selector, kind: a.kind, at, word, gone: A.position(a) };
      });
      check(eng, 'a pin on words in the page follows them by its quote', r.kind === 'text' && !r.at.moved && r.at.top >= r.word.top && r.at.top <= r.word.bottom, JSON.stringify(r));
      check(eng, 'a pin on words in the page shows as moved when they are gone', r.gone.moved === true, JSON.stringify(r.gone));
      await p.close();

      // 7. Made-up ids and classes are not the element's identity; a test id is.
      p = await open(ctx, `<button id=":r3:" class="btn svelte-1abc2de _card_1x2y3">Go</button>
        <div data-testid="panel"><span class="note">noted</span></div>`);
      r = await p.evaluate(() => {
        const b = document.querySelector('button').getBoundingClientRect();
        const a = A.anchorAt(b.left + 2, b.top + 2);
        const s = document.querySelector('.note').getBoundingClientRect();
        const n = A.anchorAt(s.left + 2, s.top + 2);
        // An older pin saved the made-up names; the next build makes new ones.
        const old = { ...a, selector: '#\\:r3\\:', element: '<button id=":r3:" class="btn svelte-1abc2de _card_1x2y3">' };
        const btn = document.querySelector('button');
        btn.id = ':r9:';
        btn.className = 'btn svelte-9zz8yy7 _card_8q7w6';
        const now = btn.getBoundingClientRect();
        return { selector: a.selector, element: a.element, named: n.selector, at: A.position(a), old: A.position(old), top: now.top + scrollY, bottom: now.bottom + scrollY };
      });
      check(eng, 'made-up ids are left out of the selector', !/r3/.test(r.selector), r.selector);
      check(eng, 'made-up ids and classes are left out of the tag', r.element === '<button class="btn">', r.element);
      check(eng, 'a test id names the element', r.named.startsWith('[data-testid="panel"]'), r.named);
      check(eng, 'a pin is found again when the made-up names change', !r.at.moved && r.at.top >= r.top && r.at.top <= r.bottom, JSON.stringify(r.at));
      check(eng, 'an older pin with made-up names is found again too', !r.old.moved && r.old.top >= r.top && r.old.top <= r.bottom, JSON.stringify(r.old));
      await p.close();
      await ctx.close();
    } finally {
      await browser.close();
    }
  }
} finally {
  fs.rmSync(path.dirname(OUT), { recursive: true, force: true });
}
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
