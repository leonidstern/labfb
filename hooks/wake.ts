// The labit plugin's wake for Claude Code: a pin left while the session that was listening has gone idle (its `wait`
// ended, or it never ran it again) comes in as a new turn, the way a person's message would. Without it, a pin after
// the agent stopped listening reached nobody until the person came back to the chat.
//
// Every few seconds, only while the session is idle, it asks the lab in the session's folder (or a folder above)
// GET /_lab/pending: pins no wait has been handed yet, whether a wait is open, and which session listened last. It
// wakes only that session, only when nothing is listening, and once per set of pins. The turn tells the agent to run
// `wait`, which hands the pins over as always (and the lab marks them, so the same pins never wake it twice).
// Other agents (Codex, Cursor…) keep using `wait`; this is Claude Code's only.
import type { Register } from 'claude-code';

const EVERY_MS = 4000;
type Pending = { fresh: number; pages: string[]; key: string; listening: boolean; last: string; dir: string; cmd: string; url: string };

let busy = false; // a main-loop turn is running
let told = ''; // the set of pins this session was last woken for
let timer: { cancel: () => void } | null = null;
// When the last wake was submitted, until its turn starts. A wake the person cancels (Escape takes it out of the
// queue) never starts a turn: after SUBMIT_MS it counts as not delivered, and the same pins may wake the session again.
let submittedAt = 0;
const SUBMIT_MS = 15000;

// The lab's address and the agent's key, from .lab/server.json in the session's folder or one above it.
async function findLab($: any): Promise<{ port: number; key: string } | null> {
  let dir: string = await $.session.cwd();
  for (;;) {
    try {
      const s = JSON.parse(await $.fs.read(`${dir}/.lab/server.json`));
      if (s && Number(s.port)) return { port: Number(s.port), key: String(s.agent || s.token || '') };
    } catch {}
    const up = dir.replace(/\/[^/]+\/?$/, '');
    if (!up || up === dir) return null;
    dir = up;
  }
}

async function look($: any): Promise<void> {
  if (busy) return;
  if (submittedAt) {
    if ((await $.clock.now()) - submittedAt < SUBMIT_MS) return;
    submittedAt = 0;
    told = '';
  }
  const lab = await findLab($);
  if (!lab) return;
  let p: Pending;
  try {
    const res = await $.http.fetch(`http://127.0.0.1:${lab.port}/_lab/pending`, {
      headers: { host: `localhost:${lab.port}`, 'x-lab-admin': lab.key, 'x-lab-agent': '1' },
    });
    if (!res.ok) return;
    p = JSON.parse(res.text);
  } catch {
    return; // no lab running there
  }
  if (!p.fresh || p.listening || p.key === told || busy || submittedAt) return;
  if (!p.last || p.last !== (await $.session.id())) return; // another session's lab, or one this session never listened on
  told = p.key;
  submittedAt = await $.clock.now(); // its turn starts once the session is idle; don't submit twice meanwhile
  const n = p.fresh === 1 ? 'A new pin' : `${p.fresh} new pins`;
  void $.prompt.submit({
    text:
      `labit: ${n} on ${p.pages.join(', ')} (${p.url}) while you weren't listening. ` +
      `Run \`${p.cmd} wait --timeout 5\` in ${p.dir} to read them, answer each on its pin with reply, ` +
      `then listen again in the background as before (\`wait --bg\`).`,
  });
}

export const register: Register = (on) => {
  on('turn.start', ($, e, next) => {
    if (e.agentId === undefined) {
      busy = true;
      submittedAt = 0;
    }
    return next(e);
  });
  on('turn.complete', ($, e, next) => {
    if (e.agentId === undefined) busy = false;
    return next(e);
  });
  on('session.start', async ($, e, next) => {
    const out = await next(e);
    timer?.cancel();
    timer = $.clock.every(EVERY_MS, () => void look($).catch(() => {}));
    return out;
  });
};
