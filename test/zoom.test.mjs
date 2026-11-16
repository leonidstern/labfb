// Zoom's lab side (lib/zoom.ts): placing the block an agent wrote. Nothing is started here.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ZoomError, dirOf, place, zoomWords } from '../lib/zoom.ts';

const page = `<main>\n<header id="top"><h1>Audit</h1></header>\n<section id="speed">\n  <h2>Speed</h2>\n  <p id="speed-line">158 ms</p>\n</section>\n<section id="server"><h2>Server</h2></section>\n</main>\n`;
const made = '<section class="x">\n  <h2>Deeper: speed</h2>\n  <p>where the 158 ms goes</p>\n</section>';
const ask = { html: page, block: 'speed-line', dir: 'in', made };

test('a deeper look goes right after the section the block is in, named and marked; nothing else moves', () => {
  const out = place(ask);
  assert.equal(out.id, 'speed-line-deeper');
  const [before, after] = out.html.split('<section id="speed-line-deeper"');
  assert.ok(before.endsWith('  <p id="speed-line">158 ms</p>\n</section>\n'), 'after the whole section, not inside it');
  assert.ok(after.startsWith(' data-zoom="in" data-zoom-of="speed-line" class="x">'));
  assert.equal(out.html.replace(/\n<section id="speed-line-deeper"[\s\S]*?<\/section>/, ''), page, 'the rest of the page is as it was');
});

test('a bigger picture goes right above the section; a whole section is its own part', () => {
  const out = place({ ...ask, dir: 'out' });
  assert.equal(out.id, 'speed-line-bigger');
  assert.ok(out.html.indexOf('id="speed-line-bigger"') < out.html.indexOf('<section id="speed">'));
  assert.ok(out.html.indexOf('id="speed-line-bigger"') > out.html.indexOf('id="top"'));
  const sec = place({ ...ask, block: 'server' });
  assert.ok(sec.html.indexOf('</section>\n<section id="server-deeper"') > sec.html.indexOf('<section id="server">'));
});

test('again on the same block: another one, after the first; and on from the made block', () => {
  const once = place(ask);
  const again = place({ ...ask, html: once.html, made: made.replace('where the 158 ms goes', 'long tasks') });
  assert.equal(again.id, 'speed-line-deeper-2');
  assert.ok(again.html.indexOf('id="speed-line-deeper"') < again.html.indexOf('id="speed-line-deeper-2"'), 'in the order asked');
  assert.ok(again.html.indexOf('id="speed-line-deeper-2"') < again.html.indexOf('<section id="server">'));
  const deeper = place({ ...ask, html: once.html, block: 'speed-line-deeper' });
  assert.equal(deeper.id, 'speed-line-deeper-deeper');
  assert.ok(deeper.html.indexOf('id="speed-line-deeper-deeper"') > deeper.html.indexOf('id="speed-line-deeper"'));
});

test('a page wrapped in one <div>: next to the section, not after the wrapper', () => {
  const wrapped = `<body>\n<div class="wrap">\n<section id="one"><h2>One</h2><p id="x">x</p></section>\n<section id="two"><h2>Two</h2></section>\n</div>\n</body>`;
  const out = place({ ...ask, html: wrapped, block: 'x' });
  assert.ok(out.html.includes('</section>\n<section id="x-deeper"'));
  assert.ok(out.html.indexOf('id="x-deeper"') < out.html.indexOf('id="two"'));
});

test('says what to fix', () => {
  const bad = (over, re) => assert.throws(() => place({ ...ask, ...over }), (e) => e instanceof ZoomError && re.test(e.message));
  bad({ made: made + made }, /send one element .* you sent 2/);
  bad({ made: '' }, /you sent 0/);
  bad({ block: 'nope' }, /no block with id "nope"/);
  bad({ made: '<section><p>open' }, /not closed/);
});

test('directions', () => {
  assert.equal(dirOf('in'), 'in');
  assert.equal(dirOf('out'), 'out');
  assert.equal(dirOf('in:1'), null);
  assert.equal(zoomWords('out'), 'zoom out: the bigger picture');
});
