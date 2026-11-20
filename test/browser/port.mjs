// A port for one test's lab, from the test's own range, that no other test on this machine holds right now.
// The browser jobs share one Mac (eight at once), so two files with overlapping ranges, or the same file in WebKit and
// Chromium, could pick the same port and talk to each other's lab. Each claim is a lock file, made exclusively and
// removed when the process exits; a lock older than 30 minutes is a crashed run's and is taken over.
// The unit tests claim theirs here too (test/harness.mjs): they run side by side, and beside the browser jobs.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = path.join(os.tmpdir(), 'labit-test-ports');
fs.mkdirSync(dir, { recursive: true });
const mine = [];
process.on('exit', () => {
  for (const f of mine) try { fs.unlinkSync(f); } catch {}
});

/** A free port in [base, base + span), as a number. */
export function claimPort(base, span) {
  const start = Math.floor(Math.random() * span);
  for (let i = 0; i < span; i++) {
    const port = base + ((start + i) % span);
    const f = path.join(dir, String(port));
    try {
      if (Date.now() - fs.statSync(f).mtimeMs > 30 * 60_000) fs.unlinkSync(f);
    } catch {}
    try {
      fs.closeSync(fs.openSync(f, 'wx'));
      mine.push(f);
      return port;
    } catch {}
  }
  throw new Error(`no free test port in ${base}-${base + span - 1}`);
}
