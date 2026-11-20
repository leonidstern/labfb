// The HTML reader behind `labit pin`'s selector check (lib/htmlsel.ts): the tree a browser would build, its selectors, and
// what it says about an element, held to what the widget reads from the real page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describe, MAX_HTML, parseHtml, quoteIn, select, textOf, visibleText } from '../lib/htmlsel.ts';

const q = (html, sel) => select(parseHtml(html), sel);

test('a table with rows and no tbody has the tbody a browser makes', () => {
  assert.equal(q('<table><tr><td id="c">x</td></tr><tr><td>y</td></tr></table>', 'table > tbody > tr > td').length, 2);
  assert.equal(q('<table><thead><tr><th>h</th></tr></thead><tr><td>y</td></tr></table>', 'table > tbody > tr > td').length, 1);
  assert.equal(q('<table><tbody><tr><td>a</td></tr></tbody></table>', 'table > tbody > tr > td').length, 1, 'one that is written stays one');
});

test('named entities: the common ones read as a browser reads them; an unknown one makes the text untrusted', () => {
  const root = parseHtml('<p id="a">Fish &amp; chips &laquo;x&raquo; &hellip;</p><p id="b">Caf&eacute; &zzzunknown; end</p>');
  const [a] = select(root, '#a');
  const [b] = select(root, '#b');
  assert.equal(describe(root, a).text, 'Fish & chips «x» …');
  assert.equal(describe(root, b).text, undefined, 'its words are not guessed at');
  assert.deepEqual(quoteIn(a, 'chips «x»').quote, { exact: 'chips «x»', prefix: 'Fish & ', suffix: ' …' });
  assert.equal(quoteIn(b, 'end'), 'unsure', 'words beside the unknown name are not placed');
  assert.equal(quoteIn(b, 'zzz'), 'unsure');
  assert.equal(quoteIn(b, 'nothing here'), 'unsure', 'not found in text that holds an unknown name: not a no');
});

test('words as the widget reads them: textContent has a script\'s text, the visible words do not', () => {
  const root = parseHtml('<p id="a">hi <b>there</b><script>var x = 1</script></p>');
  const [a] = select(root, '#a');
  assert.equal(textOf(a), 'hi there' + 'var x = 1');
  assert.equal(visibleText(a), 'hi there');
  assert.equal(describe(root, a).text, 'hi therevar x = 1');
  assert.equal(quoteIn(a, 'there').quote.suffix, '', 'a quote is of what is seen');
});

test('selectors: a space inside [..] or quotes stays in its compound; ~= and descendant chains; what is not read is null', () => {
  const html = '<div title="a b" class="x y"><p class="z">t</p></div><div title="c"></div>';
  assert.equal(q(html, '[title="a b"]').length, 1);
  assert.equal(q(html, '[class~="y"]').length, 1);
  assert.equal(q(html, 'div[title="a b"] > p.z').length, 1);
  assert.equal(q(html, 'div + div').length, 1);
  assert.equal(q(html, 'p, [title=c]').length, 2);
  assert.equal(q(html, 'p:not(.z)'), null);
  assert.equal(q(html, '[title="a b'), null);
});

test('a descendant chain that finds nothing is fast, and so is a very deep page', () => {
  const deep = '<div>'.repeat(3000) + '<p id="x">t</p>' + '</div>'.repeat(3000);
  let t = Date.now();
  assert.equal(q(deep, 'div div div div div div div div div div div div .nope').length, 0);
  assert.ok(Date.now() - t < 2000, `${Date.now() - t} ms`);
  const deeper = '<div>'.repeat(20000) + '<p id="x">t</p>';
  t = Date.now();
  const root = parseHtml(deeper);
  assert.equal(select(root, '#x').length, 1);
  assert.equal(describe(root, select(root, '#x')[0]).element, '<p id="x">');
});

test('unclosed tags do not make it slow; a page over the limit is not read', () => {
  const t = Date.now();
  assert.ok(parseHtml('<a href="x" '.repeat(30000) + '<p id="ok">t</p>'));
  assert.ok(parseHtml('<a "'.repeat(30000)));
  assert.ok(Date.now() - t < 3000, `${Date.now() - t} ms`);
  assert.equal(parseHtml('x'.repeat(MAX_HTML + 1)), null);
});

test('/> closes void elements and what is inside an svg, not a div; a trailing / in an unquoted value is the value\'s', () => {
  assert.equal(q('<div id="d"/><p id="p">t</p>', '#d > #p').length, 1, '<div/> opens a div');
  assert.equal(q('<svg><circle/><path id="pa"></path></svg>', 'svg > path').length, 1, 'in an svg it closes');
  assert.equal(q('<svg><circle id="c"/><path id="pa"></path></svg>', '#c + #pa').length, 1);
  const root = parseHtml('<a id="l" href=/x/>link</a><p id="n">after</p>');
  assert.equal(select(root, '#l')[0].attrs.href, '/x/');
  assert.equal(textOf(select(root, '#l')[0]), 'link');
  assert.equal(q('<input id="i"/><p id="n">after</p>', '#i + #n').length, 1);
});
