// A folder and everything under it, watched. fs.watch(dir, { recursive: true }) does it on macOS and Windows; on Linux,
// Node's own version follows each file, so a file replaced by a rename (how the lab writes a board, and how many editors
// and tools save) is seen once and never again: the second save of a page, or of a board, is silent. There each folder gets
// its own plain watcher, which sees every rename, and one is added as a folder appears (and let go as it goes). Folders
// that skip() names are not watched at all (a project's node_modules would be thousands).
import fs from 'node:fs';
import path from 'node:path';

type Handler = (event: string, file: string) => void;

/** onEvent(event, file): file is relative to root, as fs.watch's recursive watcher reports it. */
export function watchTree(root: string, onEvent: Handler, skip: (rel: string) => boolean = () => false): { close: () => void } {
  const skipped = (rel: string) => rel.split(path.sep).some((_, i, parts) => skip(parts.slice(0, i + 1).join(path.sep)));
  if (process.platform !== 'linux') {
    // The native watcher sees everything under root: what skip() names is dropped here, as on Linux it is never watched.
    const w = fs.watch(root, { recursive: true }, (event, file) => file && !skipped(String(file)) && onEvent(event, String(file)));
    return { close: () => w.close() };
  }
  const watchers = new Map<string, fs.FSWatcher>();
  const drop = (dir: string) => {
    watchers.get(dir)?.close();
    watchers.delete(dir);
  };
  const add = (dir: string, fresh = false) => {
    if (watchers.has(dir)) return;
    const rel = path.relative(root, dir);
    if (rel && skip(rel)) return;
    let w: fs.FSWatcher;
    try {
      w = fs.watch(dir, (event, name) => {
        if (!name) return;
        const sub = path.join(dir, String(name));
        onEvent(event, path.join(rel, String(name)));
        if (event !== 'rename') return;
        drop(sub); // a folder that went, or was replaced: its old watcher follows what is gone
        try {
          if (fs.statSync(sub).isDirectory()) add(sub, true);
        } catch {}
      });
    } catch (e) {
      if (!rel) throw e; // the folder itself can't be watched (it isn't there): the caller says so, as fs.watch does
      return;
    }
    w.on('error', () => drop(dir));
    watchers.set(dir, w);
    try {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        // A folder that has just appeared may already hold files, written before its watcher was there: say so.
        if (fresh) onEvent('rename', path.join(rel, e.name));
        if (e.isDirectory()) add(path.join(dir, e.name), fresh);
      }
    } catch {}
  };
  add(root);
  return { close: () => [...watchers.keys()].forEach(drop) };
}
