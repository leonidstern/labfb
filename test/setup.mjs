// Loaded before every test file (npm test): labs started by tests keep their registry and update check
// in a throwaway folder, never in the person's ~/.labit, and never ask npm for the latest version.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.env.LABIT_HOME ||= fs.mkdtempSync(path.join(os.tmpdir(), 'labit-test-home-'));
process.env.LABIT_NO_UPDATE_CHECK = '1';
