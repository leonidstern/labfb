import { expect, mock, test } from 'claude-code/testing';

// A lab at /p/.lab/server.json; the session is /p/sub; /_lab/pending answers what each test sets.
const world = (on: any, pending: Record<string, unknown>, me = 'S1') => {
  const sent: string[] = [];
  const looked = { n: 0 };
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }));
  on('session.cwd', () => ({ value: '/p/sub' }));
  on('session.id', () => ({ value: me }));
  on('fs.read', (_: any, e: any) => {
    const file = typeof e === 'string' ? e : e.path;
    if (file === '/p/.lab/server.json') return { value: JSON.stringify({ port: 4400, agent: 'k' }) };
    return { deny: 'no such file' };
  });
  on('http.fetch', (_: any, e: any) => {
    looked.n++;
    return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify({ fresh: 0, pages: [], key: '', listening: false, last: 'S1', dir: '/p', cmd: 'labit', url: 'http://localhost:4400', ...pending }) } };
  });
  on('prompt.submit', (_: any, e: any) => {
    sent.push(e.text);
    return { text: e.text };
  });
  return { sent, looked };
};

test('an idle session that listened last is woken once for new pins', async ($, on) => {
  const clock = mock.clock(on);
  const w = world(on, { fresh: 2, pages: ['/a'], key: 'k1' });
  await $.session.start({ cwd: '/p/sub', surface: 'terminal', isInteractive: true } as any);
  await clock.advance(4000);
  expect(w.sent.length).toBe(1);
  expect(w.sent[0]).toContain('2 new pins on /a');
  expect(w.sent[0]).toContain('labit wait --timeout 5');
  await clock.advance(12000);
  expect(w.sent.length).toBe(1);
});

test('nothing while a wait is open, for another session, or with no pins', async ($, on) => {
  const clock = mock.clock(on);
  const a = world(on, { fresh: 1, pages: ['/a'], key: 'k1', listening: true });
  await $.session.start({ cwd: '/p/sub', surface: 'terminal', isInteractive: true } as any);
  await clock.advance(8000);
  expect(a.looked.n).toBeGreaterThan(0);
  expect(a.sent.length).toBe(0);
});

test('another session is never woken', async ($, on) => {
  const clock = mock.clock(on);
  const w = world(on, { fresh: 1, pages: ['/a'], key: 'k1' }, 'S2');
  await $.session.start({ cwd: '/p/sub', surface: 'terminal', isInteractive: true } as any);
  await clock.advance(8000);
  expect(w.sent.length).toBe(0);
});

test('a wake taken out of the queue (Escape) never started a turn: it wakes again later', async ($, on) => {
  const clock = mock.clock(on);
  const w = world(on, { fresh: 1, pages: ['/a'], key: 'k1' });
  await $.session.start({ cwd: '/p/sub', surface: 'terminal', isInteractive: true } as any);
  await clock.advance(4000);
  expect(w.sent.length).toBe(1);
  await clock.advance(8000); // no turn started yet: no second wake
  expect(w.sent.length).toBe(1);
  await clock.advance(12000); // well past 15 s with no turn: the first counts as not delivered
  expect(w.sent.length).toBe(2);
});
