// Zoom's lab side (lib/zoom.ts): placing the block an agent wrote, the trail, and "how we got here". Nothing is started here.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ZoomError, dirOf, parseTrail, place, record, stepsOf, zoomOut, zoomWords, zoomedFrom } from '../lib/zoom.ts';

const page = `<main>\n<header id="top"><h1>Audit</h1></header>\n<section id="speed">\n  <h2>Speed</h2>\n  <p id="speed-line" data-from="t2">158 ms</p>\n</section>\n<section id="server"><h2>Server</h2></section>\n</main>\n`;
const trail = ['{"id":"t1","kind":"ask","by":"leo","what":"how fast is it"}', '{"id":"t2","kind":"make","by":"agent","from":["t1"],"on":"speed-line","what":"measured it"}', '{"id":"t3","kind":"pin","by":"leo","from":["t2"],"on":"server","what":"why so big"}'].join('\n') + '\n';
const made = '<section class="x">\n  <h2>Deeper: speed</h2>\n  <p>where the 158 ms goes</p>\n</section>';
const ask = { html: page, trail, block: 'speed-line', dir: 'in', made, what: 'where the time goes', by: 'leo', words: zoomWords('in'), pin: 'p1' };

test('a deeper look goes right after the part of the page the block is in, named and marked; nothing else moves', () => {
  const out = place(ask);
  assert.equal(out.id, 'speed-line-deeper');
  const [before, after] = out.html.split('<section id="speed-line-deeper"');
  assert.ok(before.endsWith('  <p id="speed-line" data-from="t2">158 ms</p>\n</section>\n'), 'after the whole section, not inside it');
  assert.ok(after.startsWith(' data-zoom="in" data-zoom-of="speed-line" data-from="t5" class="x">'));
  assert.equal(out.html.replace(/\n<section id="speed-line-deeper"[\s\S]*?<\/section>/, ''), page, 'the rest of the page is as it was');
  assert.equal(out.trail.startsWith(trail), true, 'earlier lines untouched');
  const steps = parseTrail(out.trail).slice(-2);
  assert.deepEqual(steps.map((s) => [s.id, s.kind, s.by, s.on, s.from, s.zoom]), [['t4', 'pin', 'leo', 'speed-line', ['t2'], 'in'], ['t5', 'make', 'agent', 'speed-line-deeper', ['t4'], 'in']]);
  assert.equal(steps[0].what, 'zoom in: dive deeper');
});

test('a bigger picture goes right before the part; a whole section is its own part', () => {
  const out = place({ ...ask, dir: 'out', words: zoomWords('out'), made: made.replace('Deeper', 'Bigger picture') });
  assert.equal(out.id, 'speed-line-bigger');
  assert.ok(out.html.indexOf('id="speed-line-bigger"') < out.html.indexOf('<section id="speed">'));
  assert.ok(out.html.indexOf('id="speed-line-bigger"') > out.html.indexOf('id="top"'));
  const sec = place({ ...ask, block: 'server', pin: 'p9' });
  assert.ok(sec.html.indexOf('</section>\n<section id="server-deeper"') > sec.html.indexOf('<section id="server">'));
});

test('again on the same block: another one, after the first; and on from the made block', () => {
  const once = place(ask);
  assert.equal(zoomedFrom(once.html, 'speed-line', 'in'), 'speed-line-deeper');
  assert.equal(zoomedFrom(once.html, 'speed-line', 'out'), null);
  const again = place({ ...ask, html: once.html, trail: once.trail, pin: 'p2', made: made.replace('where the 158 ms goes', 'long tasks') });
  assert.equal(again.id, 'speed-line-deeper-2');
  assert.ok(again.html.indexOf('id="speed-line-deeper"') < again.html.indexOf('id="speed-line-deeper-2"'), 'in the order asked');
  assert.ok(again.html.indexOf('id="speed-line-deeper-2"') < again.html.indexOf('<section id="server">'));
  const deeper = place({ ...ask, html: once.html, trail: once.trail, block: 'speed-line-deeper', pin: 'p3' });
  assert.equal(deeper.id, 'speed-line-deeper-deeper');
  assert.ok(deeper.html.indexOf('id="speed-line-deeper-deeper"') > deeper.html.indexOf('id="speed-line-deeper"'));
  assert.deepEqual(parseTrail(deeper.trail).at(-2).from, ['t5'], 'the new ask comes out of what made the block it was asked on');
});

test('a page wrapped in one <div>: next to the section, not after the wrapper', () => {
  const wrapped = `<body>\n<div class="wrap">\n<section id="one"><h2>One</h2><p id="x">x</p></section>\n<section id="two"><h2>Two</h2></section>\n</div>\n</body>`;
  const out = place({ ...ask, html: wrapped, trail: '', block: 'x' });
  assert.ok(out.html.includes('</section>\n<section id="x-deeper"'));
  assert.ok(out.html.indexOf('id="x-deeper"') < out.html.indexOf('id="two"'));
});

test('says what to fix', () => {
  const bad = (over, re) => assert.throws(() => place({ ...ask, ...over }), (e) => e instanceof ZoomError && re.test(e.message));
  bad({ made: made + made }, /send one element .* you sent 2/);
  bad({ made: '' }, /you sent 0/);
  bad({ block: 'nope' }, /no block with id "nope"/);
  bad({ what: ' \n ' }, /one line/);
  bad({ made: '<section><p>open' }, /not closed/);
  const once = place(ask);
  assert.throws(() => place({ ...ask, html: once.html, trail: once.trail }), /already on the page/);
});

test('how we got here: a block\'s steps and the ones behind them', () => {
  const steps = parseTrail(place(ask).trail);
  assert.deepEqual(stepsOf(steps, 'speed-line', 't2'), ['t2'], 'the zoom asked on it made another block, not this one');
  assert.deepEqual(stepsOf(steps, 'speed-line-deeper', 't5'), ['t5']);
  assert.deepEqual(zoomOut(steps, ['t5'], 2).steps.map((s) => s.id), ['t1', 't2', 't4', 't5']);
});

test('record: an answer on a pin goes into the trail, the pin once', () => {
  const first = record(trail, { pin: 'c9', block: 'server', by: 'leo', words: 'make it\nsmaller', reply: 'Done: smaller now' });
  const [pin, change] = parseTrail(first);
  assert.deepEqual([pin.id, pin.kind, pin.on, pin.what, pin.from], ['t4', 'pin', 'server', 'make it smaller', ['t3']]);
  assert.deepEqual([change.id, change.kind, change.what, change.from], ['t5', 'change', 'smaller now', ['t4']]);
  const second = parseTrail(record(trail + first, { pin: 'c9', block: 'server', by: 'leo', words: 'make it smaller', reply: 'Which part?' }));
  assert.deepEqual(second.map((s) => [s.id, s.kind, s.from]), [['t6', 'answer', ['t4']]]);
  assert.equal(record(trail, { pin: 'c9', block: '', by: 'leo', words: 'x', reply: 'Done' }), '', 'a pin on no block leaves the trail alone');
});

test('directions', () => {
  assert.equal(dirOf('in'), 'in');
  assert.equal(dirOf('out'), 'out');
  assert.equal(dirOf('in:1'), null);
  assert.equal(zoomWords('out'), 'zoom out: the bigger picture');
});
