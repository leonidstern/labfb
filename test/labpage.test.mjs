// Lab pages (lib/labpage.ts): a page made for the lab (.html with no document of its own, or .md) gets the lab's shell
// and stylesheet; the person's own page (a full HTML document) is served exactly as it is. And `labit new`.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isLabPage, labShell, renderMarkdown } from '../lib/labpage.ts';

test('a page is a lab page when it has no document of its own', () => {
  assert.equal(isLabPage('<title>T</title><section id="a">x</section>'), true);
  assert.equal(isLabPage('<!doctype html><title>T</title>'), false);
  assert.equal(isLabPage('<!-- note -->\n<html><body>x</body></html>'), false);
  assert.equal(isLabPage('  <HTML lang="en">'), false);
  // Written the Artifact way (no doctype, but its own styles or viewport): the author's own design, served as it is.
  assert.equal(isLabPage('<title>T</title><style>main{max-width:600px}</style><main>x</main>'), false);
  assert.equal(isLabPage('<meta name="viewport" content="width=device-width"><title>T</title><p>x</p>'), false);
});

test('the shell: its title, the lab stylesheet, the lab column, light and dark from the stylesheet', () => {
  const page = labShell('<title>Plans</title>\n<section id="a"><h2>A</h2></section>', 'fallback');
  assert.match(page, /^<!doctype html>/);
  assert.match(page, /<title>Plans<\/title>/);
  assert.equal(page.match(/<title>/g).length, 1, 'the title moves into the head');
  assert.match(page, /<link rel="stylesheet" href="\/_lab\/lab\.css">/);
  assert.match(page, /viewport-fit=cover/);
  assert.match(page, /<body class="lab lab-doc">\n<main>\n<section id="a">/);
  assert.match(labShell('<main id="m"><h1>Own column</h1></main>', 'x'), /<body class="lab lab-doc">\n<main id="m">/, 'its own <main> is kept, not nested');
  assert.match(labShell('<h1>From the <b>heading</b></h1>', 'x'), /<title>From the heading<\/title>/);
  assert.match(labShell('<p>nothing</p>', 'file-name'), /<title>file-name<\/title>/);
});

test('versions get ids: v<number>, never over an id the page has, never twice', () => {
  const page = labShell(
    '<ol class="lab-options"><li value="1"><b>A</b></li><li value="2" id="mine"><b>B</b></li><li value="3" class="rec"><b>C</b></li></ol>' +
      '<ol class="lab-options"><li value="1"><b>A again</b></li></ol><ol><li value="9">not options</li></ol>',
    'x',
  );
  assert.match(page, /<li value="1" id="v1">/);
  assert.match(page, /<li value="2" id="mine">/, 'its own id is kept');
  assert.match(page, /<li value="3" class="rec" id="v3">/);
  assert.match(page, /<li value="1"><b>A again/, 'a second block does not repeat v1');
  assert.match(page, /<li value="9">/, 'only options blocks');
  assert.equal(page.match(/id="v1"/g).length, 1);
  assert.match(labShell('<li value="1" id="v1">x</li><ol class="lab-options"><li value="1">y</li></ol>', 'x'), /<li value="1">y/, 'an id already on the page is not taken again');
});

test('Markdown: headings with ids, lists, checklists, tables, code, quotes, figures, raw HTML blocks', () => {
  const { html, title } = renderMarkdown(
    [
      '---', 'title: Front title', '---', '', '# Notes', '', 'Some **bold**, *it*, `code` and [a link](https://x.dev).', '',
      '## Steps', '', '1. one', '2. two', '', '- [x] done', '- [ ] next', '', '- [x] mixed', '- plain', '',
      '| a | b |', '| --- | --- |', '| 1 | 2 |', '', '```js', 'const a = 1 < 2;', '```', '', '> quoted', '', '![Shot](s.png)', '_The caption_', '',
      '<p class="lab-note">raw</p>', '', '## Steps',
    ].join('\n'),
  );
  assert.equal(title, 'Front title', 'front matter names the page');
  assert.match(html, /<h1 id="notes">Notes<\/h1>/);
  assert.match(html, /<h2 id="steps">Steps<\/h2>[\s\S]*<h2 id="steps-2">Steps<\/h2>/, 'repeated headings get unique ids');
  assert.match(html, /<b>bold<\/b>, <i>it<\/i>, <code>code<\/code> and <a href="https:\/\/x.dev">a link<\/a>/);
  assert.match(html, /<ol><li>one<\/li><li>two<\/li><\/ol>/);
  assert.match(html, /<ul class="lab-checklist"><li class="done">done<\/li><li class="todo">next<\/li><\/ul>/);
  assert.match(html, /<ul><li>✓ mixed<\/li><li>plain<\/li><\/ul>/, 'a mixed list stays a list');
  assert.match(html, /<table class="lab-table"><thead><tr><th>a<\/th><th>b<\/th><\/tr><\/thead><tbody><tr><td>1<\/td><td>2<\/td><\/tr><\/tbody><\/table>/);
  assert.match(html, /<pre><code class="language-js">const a = 1 &lt; 2;<\/code><\/pre>/);
  assert.match(html, /<blockquote><p>quoted<\/p><\/blockquote>/);
  assert.match(html, /<figure class="lab-figure"><img src="s.png" alt="Shot"><figcaption>The caption<\/figcaption><\/figure>/);
  assert.match(html, /<p class="lab-note">raw<\/p>/, 'an HTML block passes as it is');
});

test('Markdown text is text: tags in a paragraph are escaped, script links are dropped', () => {
  const { html } = renderMarkdown('Hello <script>alert(1)</script> and [x](javascript:alert(1))');
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /<a href="#">x<\/a>/);
});

// ---- a lab serving them ----
const LAB = fileURLToPath(new URL('../local.mjs', import.meta.url));
const DIR = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'labit-labpage-')));
const PORT = String(7800 + Math.floor(Math.random() * 100)); // clear of the other test files' ranges
const B = `http://localhost:${PORT}`;
const OWN = '<!doctype html><html><head><title>Own</title><style>body{font-family:Georgia}</style></head><body><h1>Mine</h1></body></html>';
fs.writeFileSync(path.join(DIR, 'own.html'), OWN);
fs.writeFileSync(path.join(DIR, 'kit.html'), '<title>Kit</title>\n<section id="a"><ol class="lab-options"><li value="1">One</li></ol></section>');
fs.writeFileSync(path.join(DIR, 'notes.md'), '# Notes\n\nHello.\n');
fs.mkdirSync(path.join(DIR, 'docs'));
fs.writeFileSync(path.join(DIR, 'docs', 'index.md'), '# Docs home\n');
fs.writeFileSync(path.join(DIR, 'both.html'), '<title>Both html</title><p>html</p>');
fs.writeFileSync(path.join(DIR, 'both.md'), '# Both md\n');
const server = spawn(process.execPath, [LAB, '.', '--no-open', '--new', '--port', PORT], { cwd: DIR, env: { ...process.env, PORT: '' } });
after(() => {
  server.kill();
  fs.rmSync(DIR, { recursive: true, force: true });
});
const get = async (p) => {
  for (let i = 0; i < 80; i++) {
    try {
      return await (await fetch(B + p)).text();
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error('lab did not start');
};

test('the person\'s own page is served as it is (with the comment layer); a lab page gets the shell', async () => {
  const own = await get('/own.html');
  // Unchanged but for labit's tab icon, which any page without its own gets (local.mjs, withIcon).
  assert.ok(own.replace('<link rel="icon" href="/_lab/favicon.svg">', '').startsWith(OWN.slice(0, 40)), 'unchanged from the start');
  assert.doesNotMatch(own, /\/_lab\/lab\.css/);
  assert.match(own, /_lab\/comments\.js/, 'the widget still comes on');
  const kit = await get('/kit');
  assert.match(kit, /<link rel="stylesheet" href="\/_lab\/lab\.css">/);
  assert.match(kit, /<body class="lab lab-doc">/);
  assert.match(kit, /_lab\/comments\.js/);
});

test('Markdown pages: /notes is notes.md, a folder\'s index.md, ?raw gives the text, listed, and .html wins over .md', async () => {
  assert.match(await get('/notes'), /<h1 id="notes">Notes<\/h1>[\s\S]*_lab\/comments\.js/);
  assert.match(await get('/notes.md'), /<h1 id="notes">/);
  assert.match(await get('/docs/'), /<h1 id="docs-home">Docs home<\/h1>/);
  assert.equal(await get('/notes.md?raw'), '# Notes\n\nHello.\n');
  assert.match(await get('/both'), /<p>html<\/p>/);
  const { pages } = JSON.parse(await get('/_lab/pages'));
  const listed = Object.fromEntries(pages.map((p) => [p.path, p.title]));
  assert.equal(listed['/notes'], 'Notes');
  assert.equal(listed['/docs/index'], 'Docs home');
  assert.equal(listed['/both'], 'Both html', 'one page for both, the .html one');
  assert.equal(pages.filter((p) => p.path === '/both').length, 1);
});

test('saving a Markdown page updates it in place, like HTML', async () => {
  const states = [];
  const req = http.get({ host: '127.0.0.1', port: PORT, path: '/_lab/live', headers: { host: `localhost:${PORT}` } }, (res) => {
    res.setEncoding('utf8');
    res.on('data', (d) => d.split('\n').filter((l) => l.startsWith('data: ')).forEach((l) => states.push(JSON.parse(l.slice(6)))));
  });
  for (let i = 0; i < 40 && !states.length; i++) await new Promise((r) => setTimeout(r, 50));
  const before = states.at(-1);
  fs.writeFileSync(path.join(DIR, 'notes.md'), '# Notes\n\nHello again.\n');
  for (let i = 0; i < 60 && states.at(-1).hot === before.hot; i++) await new Promise((r) => setTimeout(r, 50));
  req.destroy();
  const now = states.at(-1);
  assert.equal(now.files, before.files, 'no reload');
  assert.ok(now.hot > (before.hot || 0), 'a hot update');
  assert.deepEqual(now.hotFiles, [{ path: '/notes.md', kind: 'html' }]);
});

const cli = (args) => new Promise((resolve) => execFile(process.execPath, [LAB, ...args], { cwd: DIR, env: { ...process.env, PORT: '' } }, (err, stdout, stderr) => resolve({ code: err?.code ?? 0, out: stdout + stderr })));

test('`labit new` writes a lab page (or Markdown with --md), gives its address, and won\'t overwrite one', async () => {
  let r = await cli(['new', 'pricing']);
  assert.equal(r.code, 0, r.out);
  const file = path.join(DIR, 'pricing.html');
  assert.ok(isLabPage(fs.readFileSync(file, 'utf8')));
  assert.match(fs.readFileSync(file, 'utf8'), /<title>Pricing<\/title>[\s\S]*<section id="first">/);
  assert.match(r.out, new RegExp(`http://localhost:${PORT}/pricing`));
  assert.match(r.out, /blocks\.md/);
  assert.match(await get('/pricing'), /<h1>Pricing<\/h1>/);
  r = await cli(['new', 'roadmap', '--md']);
  assert.equal(r.code, 0, r.out);
  assert.match(fs.readFileSync(path.join(DIR, 'roadmap.md'), 'utf8'), /^---\ntitle: Roadmap\n---/);
  r = await cli(['new', 'pricing']);
  assert.equal(r.code, 1);
  assert.match(r.out, /is there already/);
  r = await cli(['new', 'pricing', '--md']);
  assert.equal(r.code, 1, 'not a Markdown twin of an .html page either');
  r = await cli(['new', '../escape']);
  assert.equal(r.code, 1);
});
