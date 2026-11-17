// The command line: one list of flags for every command, the pages a wait listens on, and how answers should read.

/** Options by name: switches are true, valued ones their value (or true when the value is left out). */
export type Opts = Record<string, any>;

// The pages a wait listens on (--pages /a,/b, or wait --page /a): page keys as the lab writes them ("/router-fixes").
export function listenPages(opts: Opts, forWait = false): string[] | null {
  const raw = opts.pages || (forWait ? opts.page : '');
  if (!raw) return null;
  return String(raw).split(',').map((p) => '/' + p.trim().replace(/^\/+/, '').replace(/\.html?$/i, '')).filter((p) => p !== '/');
}
// One list of flags for every command: anything else starting with -- is refused, so a typo
// (`reply abc "Done" --resolv`) stops instead of landing in the reply's text. After a bare --, all is words.
const SWITCHES = ['--wifi', '--no-open', '--resolve', '--wait', '--new', '--all', '--bg', '--fast', '--no-fast'];
/** The longest a wait sits open when nobody has said it is running in the background. */
export const FOREGROUND_CAP = 60;
/** The wait's own default, when no --timeout is given. */
export const WAIT_DEFAULT = 1500;

/** How many seconds a wait may sit open.
 *
 *  A wait run in the foreground of an agent's turn holds that turn open for its whole timeout: the person can't say
 *  anything to their agent until it ends, and the message they do send kills the command. From inside the process the
 *  two look the same -- same environment, same stdin, same stdout -- so a foreground run can't be spotted, only
 *  promised against: an agent that puts the command in the background says so with --bg and gets the full wait.
 *  Without that promise the wait is capped at a minute: long enough to catch a pin, short enough that nobody is held
 *  up. Someone at a terminal (a tty) is not inside anybody's turn, so they keep the full wait. */
export function waitSeconds(opts: Opts, isTTY = false): { seconds: number; capped: boolean } {
  const asked = Number(opts.timeout) || WAIT_DEFAULT;
  if (opts.bg || isTTY || process.env.LABIT_BACKGROUND === '1') return { seconds: asked, capped: false };
  return { seconds: Math.min(asked, FOREGROUND_CAP), capped: asked > FOREGROUND_CAP };
}

// --fast / --no-fast switched the quick model, removed 15 Nov: still accepted, so older scripts keep working; they do nothing.
// How answers should read, said with every pin (the page shows short blocks and '- ' lists as such).
export const WRITE_SHORT = "Write answers short: they're read in a small window, often on a phone. One point per line or two, a blank line between points, '- ' lines for lists.";
const VALUED = ['--port', '--name', '--page', '--pages', '--timeout', '--dir', '--proxy', '--model', '--suggest-rule'];
// The command line's words (pos) and options (opts), and any --flag it doesn't know.
export function parseArgs(argv: string[]): { opts: Opts; pos: string[]; unknownFlags: string[] } {
  const opts: Opts = {};
  const pos: string[] = [];
  const unknownFlags: string[] = [];
  for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--') {
    pos.push(...argv.slice(i + 1));
    break;
  }
  if (a === '--help' || a === '-h') opts.help = true;
  else if (a === '--version' || a === '-v') opts.version = true;
  else if (SWITCHES.includes(a)) opts[a.slice(2)] = true;
  else if (a.startsWith('--') && !VALUED.includes(a)) unknownFlags.push(a);
  else if (VALUED.includes(a)) {
    // --proxy on its own means "find the dev server yourself".
    const v = argv[i + 1];
    if (v === undefined || v.startsWith('-')) opts[a.slice(2)] = true;
    else opts[a.slice(2)] = argv[++i];
  }
  else pos.push(a);
  }
  return { opts, pos, unknownFlags };
}
