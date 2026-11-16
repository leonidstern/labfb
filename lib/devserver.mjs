// Finding the project's dev server, for a lab that goes in front of it. Loaded by local.mjs only when it has to look:
// a bare --proxy, or a project with a dev script and no pages of its own. A folder of pages never reads it.
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

// Every server listening on this computer, with the folder it runs in (lsof: macOS and Linux).
// Several projects' dev servers often run at once, so a port is only this project's if its folder is.
function devServers() {
  // lsof fails when it can't read one process (root's, or one that just ended) but still prints the rest.
  const lsof = (args) => {
    try {
      return execFileSync('lsof', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 });
    } catch (e) {
      if (e.code === 'ENOENT' || !e.stdout) throw e;
      return e.stdout;
    }
  };
  let out;
  try {
    out = lsof(['-nP', '-iTCP', '-sTCP:LISTEN', '-Fpn']);
  } catch {
    return null;
  }
  const ports = new Map();
  let pid;
  for (const line of out.split('\n')) {
    if (line[0] === 'p') pid = Number(line.slice(1));
    else if (line[0] === 'n' && pid !== process.pid) {
      const port = Number(line.match(/:(\d+)$/)?.[1]);
      if (port) ports.set(pid, [...new Set([...(ports.get(pid) || []), port])]);
    }
  }
  if (!ports.size) return [];
  const cwds = new Map();
  try {
    for (const line of lsof(['-a', '-p', [...ports.keys()].join(','), '-d', 'cwd', '-Fpn']).split('\n')) {
      if (line[0] === 'p') pid = Number(line.slice(1));
      else if (line[0] === 'n') cwds.set(pid, line.slice(1));
    }
  } catch {}
  return [...ports].flatMap(([p, list]) => list.map((port) => ({ port, dir: cwds.get(p) || '' })));
}
// This project's server: one running in `root` or a folder inside it (a monorepo's app), never the lab's own port.
// The others are named in the message when none is found, so a server started in the wrong folder is easy to spot.
export function findDevServer(root, labPort) {
  const inRoot = (dir) => dir === root || dir.startsWith(root + path.sep);
  const all = devServers();
  if (!all) return { port: null, others: [] };
  const mine = all.filter((s) => inRoot(s.dir) && s.port !== labPort).sort((a, b) => a.port - b.port);
  const others = all
    .filter((s) => !inRoot(s.dir) && s.port >= 1024 && s.port < 10000 && s.dir.startsWith(os.homedir() + path.sep))
    .sort((a, b) => a.port - b.port);
  return { port: mine[0]?.port ?? null, others };
}
export const tilde = (dir) => dir.replace(os.homedir(), '~');
export const othersNote = (others) =>
  others.length ? `\nOther projects' servers (not this one): ${others.slice(0, 4).map((s) => `:${s.port} ${tilde(s.dir)}`).join(', ')}` : '';
