// `labit skill` prints the agent's instructions from the package, without the plugin's frontmatter: what a lab's
// first lines point an agent to when it has no plugin.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const LAB = fileURLToPath(new URL('../local.mjs', import.meta.url));

test('labit skill prints SKILL.md without its frontmatter', async () => {
  const { stdout } = await promisify(execFile)(process.execPath, [LAB, 'skill']);
  assert.match(stdout, /^# labit\n/);
  assert.doesNotMatch(stdout, /^---/);
  assert.match(stdout, /wait --bg/);
});

test('the skill says how to use boards', async () => {
  const { stdout } = await promisify(execFile)(process.execPath, [LAB, 'skill']);
  assert.match(stdout, /board new/);
  assert.match(stdout, /Picked b/);
});
