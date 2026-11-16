import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// ---------- the labs running on this computer ----------
// Each lab writes ~/.labit/servers/<port>.json while it runs; a file whose process is gone is left over and skipped.
// LABFB_HOME: the name before labit, still read.
export const REGISTRY = path.join(process.env.LABIT_HOME || process.env.LABFB_HOME || path.join(os.homedir(), '.labit'), 'servers');
export type Lab = { port: number; pid: number; root: string; name: string; proxy?: string | null };
export const runningLabs = (): Lab[] =>
  (fs.existsSync(REGISTRY) ? fs.readdirSync(REGISTRY) : [])
    .filter((n) => n.endsWith('.json'))
    .flatMap((n) => {
      const file = path.join(REGISTRY, n);
      try {
        const lab = JSON.parse(fs.readFileSync(file, 'utf8'));
        process.kill(lab.pid, 0);
        return [lab];
      } catch {
        fs.rmSync(file, { force: true });
        return [];
      }
    })
    .sort((a, b) => a.root.localeCompare(b.root));
