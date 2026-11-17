// Sync on the web, where there is no live stream: each page's comments have a revision that every change counts up
// (a comment, a reply, a resolve, a move, a delete), and an open page asks for it (GET ?page=…&rev) to know when to
// load the comments again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apiOn } from '../lib/dev.ts';

const OWNER = 'owner-secret-0123456789abcdef';
process.env.LAB_HOST = 'lab.test';
process.env.LAB_COMMENTS_ADMIN_TOKEN = OWNER;
const api = await apiOn(new Map());
const PAGE = '/anna/site/home';
const call = (body, headers = {}, method = 'POST') =>
  api[method](new Request('https://lab.test/_lab/api/comments' + (method === 'GET' ? `?${new URLSearchParams(body)}` : ''), {
    method,
    headers: { host: 'lab.test', 'content-type': 'application/json', 'x-forwarded-for': '10.0.0.1', ...headers },
    body: method === 'GET' ? undefined : JSON.stringify(body),
  }));
const rev = async (page = PAGE) => (await (await call({ page, rev: '' }, {}, 'GET')).json()).rev;
const admin = { 'x-lab-admin': OWNER };

test('every change counts the page revision up; the list says it too; other pages keep theirs', async () => {
  assert.equal(await rev(), 0, 'a page nobody wrote on');
  const { comment } = await (await call({ page: PAGE, name: 'Ann', text: 'hi', anchor: { selector: 'h1' } })).json();
  assert.equal(await rev(), 1, 'a comment');
  await call({ page: PAGE, name: 'Bo', text: 'reply', parent: comment.id });
  assert.equal(await rev(), 2, 'a reply');
  await call({ page: PAGE, action: 'resolve', id: comment.id }, admin);
  assert.equal(await rev(), 3, 'a resolve');
  await call({ page: PAGE, action: 'move', id: comment.id, anchor: { selector: 'p', x: 0.5, y: 0.5 } }, admin);
  assert.equal(await rev(), 4, 'a move');
  const list = await (await call({ page: PAGE }, {}, 'GET')).json();
  assert.equal(list.rev, 4, 'the full list carries the revision it was read at');
  assert.equal(list.comments.length, 2);
  assert.equal(await rev('/anna/site/other'), 0, 'another page is untouched');
  await call({ page: PAGE, action: 'delete', id: comment.id }, admin);
  assert.equal(await rev(), 5, 'a delete');
});

test('a refused change leaves the revision alone', async () => {
  const before = await rev();
  assert.equal((await call({ page: PAGE, action: 'resolve', id: 'nope' }, admin)).status, 404);
  assert.equal((await call({ page: PAGE, action: 'resolve', id: 'nope' })).status, 403);
  assert.equal(await rev(), before);
});
