// The labit plugin's wake for Claude Code: a pin left while the session that was listening isn't listening (its `wait`
// ended, or it never ran it again, or it is busy building) comes in as a new turn, the way a person's message would.
// Without it, a pin after the agent stopped listening reached nobody until the person came back to the chat.
//
// Every few seconds it asks each lab this session may be listening on GET /_lab/pending: pins no wait has been handed
// yet, whether a wait is open, and which session listened last. It wakes only that session, only when nothing is
// listening, and once per set of pins. The turn tells the agent to run `wait`, which hands the pins over as always
// (and the lab marks them, so the same pins never wake it twice). Other agents (Codex, Cursor...) keep using `wait`.
//
// Even while the session is busy mid-turn the wake is submitted (`$.prompt.submit` queues it as the next turn, which
// starts the moment the current one ends), so a long build never leaves pins sitting. Only a pin that is still
// unheard on two looks in a row is queued then, so an agent about to run `wait` itself isn't woken for nothing.
//
// Progress: while this session (or a helper it started) runs tools, the pins handed to it and not answered get a short
// progress line by themselves ("editing comments.js", "running tests"), at most one per pin a minute. A pin then goes
// grey ("no update") only when the work has really stopped, not when the agent forgot `reply --progress`.
//
// Labs: the one in the session's folder (.lab/server.json, or above), and every lab whose registry file
// (~/.labit/servers/<port>.json, what `labit list` reads) names this session as its listener, so it also works when the
// session's folder is somewhere else. Localhost only, a few labs at most, and each look is quick.
import type { Register } from 'claude-code';

const EVERY_MS = 4000;
const MAX_LABS = 4; // labs one look asks, at most
const MAX_FILES = 40; // registry files one look reads, at most
type Pending = { working?: { page: string; id: string }[]; fresh: number; pages: string[]; key: string; listening: boolean; last: string; dir: string; cmd: string; url: string };
type Lab = { port: number; key: string };

let busy = false; // a main-loop turn is running
const told = new Map<number, string>(); // lab port -> the set of pins this session was last woken for
let heard = ''; // port:key seen unheard while busy, on the look before
let timer: { cancel: () => void } | null = null;
const PROGRESS_MS = 60000; // a pin's progress line is renewed once a minute at most
const WORKING_MS = 15000; // how long the list of pins being worked on is kept before it is asked for again
let working: { lab: Lab; page: string; id: string }[] = [];
let workingAt = -Infinity;
const noted = new Map<string, number>(); // lab port + pin id -> when its line was last written
// When the last wake was submitted, until its turn starts. A wake the person cancels (Escape takes it out of the
// queue) never starts a turn: after SUBMIT_MS it counts as not delivered, and the same pins may wake the session again.
// A wake queued behind a running turn starts that clock when the turn ends (`queued`), not before.
let submittedAt = 0;
let queued = false;
const SUBMIT_MS = 15000;

// The lab's address and the agent's key, from .lab/server.json in a folder or one above it.
async function labAt($: any, dir: string, port?: number): Promise<Lab | null> {
  for (;;) {
    try {
      const s = JSON.parse(await $.fs.read(`${dir}/.lab/server.json`));
      if (s && Number(s.port) && (!port || Number(s.port) === port)) return { port: Number(s.port), key: String(s.agent || s.token || '') };
    } catch {}
    if (port) return null; // a registry root is the lab's own folder: no looking above it
    const up = dir.replace(/\/[^/]+\/?$/, '');
    if (!up || up === dir) return null;
    dir = up;
  }
}

// Labs whose registry file names this session as the one that listened last: found from any folder.
async function registered($: any, me: string): Promise<Lab[]> {
  const found: Lab[] = [];
  try {
    const home = (await $.env.get('LABIT_HOME')) || `${(await $.env.get('HOME')) || ''}/.labit`;
    const dir = `${home}/servers`;
    for (const f of (await $.fs.list(dir)).slice(0, MAX_FILES)) {
      if (found.length >= MAX_LABS) break;
      if (!/^\d+\.json$/.test(f.name)) continue;
      try {
        const r = JSON.parse(await $.fs.read(`${dir}/${f.name}`));
        if (r?.listener !== me || !Number(r.port) || typeof r.root !== 'string') continue;
        const lab = await labAt($, r.root, Number(r.port));
        if (lab) found.push(lab);
      } catch {}
    }
  } catch {}
  return found;
}

async function labsFor($: any, me: string): Promise<Lab[]> {
  const labs: Lab[] = [];
  const here = await labAt($, await $.session.cwd());
  if (here) labs.push(here);
  for (const l of await registered($, me)) if (!labs.some((x) => x.port === l.port)) labs.push(l);
  return labs.slice(0, MAX_LABS);
}

// What a tool call says it is doing, as a short line: "editing comments.js", "running npm test", "reading list.ts".
const base = (p: unknown) => String(p || '').split('/').pop() || '';
const lineFor = (e: any): string => {
  const tool = String(e.tool || '');
  if (/^(Edit|Write|NotebookEdit)$/.test(tool)) return `editing ${base(e.file_path || e.notebook_path)}`.trim();
  if (tool === 'Bash') return `running ${String(e.command || '').replace(/\s+/g, ' ').slice(0, 60)}`.trim();
  if (/^(Read|Grep|Glob)$/.test(tool)) return tool === 'Read' ? `reading ${base(e.file_path)}`.trim() : `searching ${String(e.pattern || '').slice(0, 40)}`.trim();
  if (tool === 'Agent') return `helper: ${String(e.description || 'working').slice(0, 60)}`;
  return '';
};

async function progress($: any, e: any): Promise<void> {
  const line = lineFor(e);
  if (!line) return;
  const now = await $.clock.now();
  if (now - workingAt > WORKING_MS) {
    workingAt = now;
    const me = await $.session.id();
    const list: typeof working = [];
    for (const lab of await labsFor($, me)) {
      try {
        const res = await $.http.fetch(`http://127.0.0.1:${lab.port}/_lab/pending`, { headers: { host: `localhost:${lab.port}`, 'x-lab-admin': lab.key, 'x-lab-agent': '1' } });
        const p: Pending = res.ok ? JSON.parse(res.text) : null;
        if (p?.last === me) for (const w of p.working || []) list.push({ lab, ...w });
      } catch {}
    }
    working = list;
  }
  for (const w of working) {
    const key = `${w.lab.port}:${w.id}`;
    if (now - (noted.get(key) ?? -Infinity) < PROGRESS_MS) continue;
    noted.set(key, now);
    void $.http
      .fetch(`http://127.0.0.1:${w.lab.port}/_lab/api/comments`, {
        method: 'POST',
        headers: { host: `localhost:${w.lab.port}`, 'x-lab-admin': w.lab.key, 'x-lab-agent': '1', 'content-type': 'application/json' },
        body: JSON.stringify({ page: w.page, action: 'progress', id: w.id, text: line }),
      })
      .catch(() => {});
  }
}

async function look($: any): Promise<void> {
  if (submittedAt) {
    if ((await $.clock.now()) - submittedAt < SUBMIT_MS) return;
    submittedAt = 0;
    told.clear();
  }
  if (queued) return; // already in the queue behind the running turn; its end starts the clock
  const me = await $.session.id();
  for (const lab of await labsFor($, me)) {
    let p: Pending;
    try {
      const res = await $.http.fetch(`http://127.0.0.1:${lab.port}/_lab/pending`, {
        headers: { host: `localhost:${lab.port}`, 'x-lab-admin': lab.key, 'x-lab-agent': '1' },
      });
      if (!res.ok) continue;
      p = JSON.parse(res.text);
    } catch {
      continue; // no lab running there
    }
    if (!p.fresh || p.listening || p.key === told.get(lab.port) || submittedAt || queued) continue;
    if (!p.last || p.last !== me) continue; // another session's lab, or one this session never listened on
    if (busy) {
      const now = `${lab.port}:${p.key}`;
      if (heard !== now) {
        heard = now; // wait one more look: the agent may be about to run `wait` itself
        return;
      }
    }
    told.set(lab.port, p.key);
    if (busy) queued = true;
    else submittedAt = await $.clock.now(); // its turn starts once the session is idle; don't submit twice meanwhile
    const n = p.fresh === 1 ? 'A new pin' : `${p.fresh} new pins`;
    void $.prompt.submit({
      text:
        `labit: ${n} on ${p.pages.join(', ')} (${p.url}) while you weren't listening${busy ? ' (queued while you were busy)' : ''}. ` +
        `Run \`${p.cmd} wait --timeout 5\` in ${p.dir} to read them (nothing new means you already have them), ` +
        `answer each on its pin with reply, then listen again in the background as before (\`wait --bg\`).`,
    });
    return;
  }
  heard = ''; // nothing waiting: the next pin starts its count again
}

export const register: Register = (on) => {
  // A tool call by this session or a helper of it: the pins being worked on show it. Never delays the call.
  on('tool.call', ($, e, next) => {
    void progress($, e).catch(() => {});
    return next(e);
  });
  on('turn.start', ($, e, next) => {
    if (e.agentId === undefined) {
      busy = true;
      submittedAt = 0;
      queued = false;
    }
    return next(e);
  });
  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      busy = false;
      if (queued) {
        queued = false;
        submittedAt = await $.clock.now(); // the queued wake's turn should start now; if it doesn't, it counts as lost
      }
    }
    return next(e);
  });
  on('session.start', async ($, e, next) => {
    const out = await next(e);
    timer?.cancel();
    timer = $.clock.every(EVERY_MS, () => void look($).catch(() => {}));
    return out;
  });
};
