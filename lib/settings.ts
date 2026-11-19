// Settings: labit.json in the project (shared, committed) and settings.json in ~/.config/labit (yours). For each
// setting the first that has it wins: a flag, an environment variable, the project's file, your file, the default.
// Flags and variables keep working as before; a file only fills in what they leave out. `labit settings` shows each
// value and where it came from. docs/settings.md describes them for people.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FLAGS, flagDefaults } from './flags.ts';

const SHORTCUTS = { toggle: 'm', comment: '1', chat: 't', next: 'w', pause: 'p', done: 'd', reply: 'r', resolve: 'e', select: 'v', pin: 'c' };
// The actions row on selected words ("words") and on a spot ("spot"). The comment itself is
// always there, first and unlisted; the list holds the built-in rewrite, cut, go, remove and fix, and your own: { label, send }.
const BUILTIN_ACTIONS = ['rewrite', 'cut', 'go', 'remove', 'fix'];
const ACTIONS = { words: ['rewrite', 'cut', 'go'], spot: ['go', 'remove', 'fix'] };
const MAX_ACTIONS = 5; // with comment, 6 in all
type Kind = 'number' | 'boolean' | 'string';
// Each setting: its type, its default, and where it may be set (a project can't name you or open your lab to the
// wifi; your own file can't say which folder or dev server a project uses).
const SPEC: Record<string, { type: Kind | 'shortcuts' | 'flags' | 'actions'; def: unknown; only?: 'project' | 'personal'; min?: number }> = {
  port: { type: 'number', def: 4400, min: 1 },
  proxy: { type: 'string', def: '', only: 'project' },
  folder: { type: 'string', def: '.', only: 'project' },
  open: { type: 'boolean', def: true },
  wifi: { type: 'boolean', def: false, only: 'personal' },
  batchSeconds: { type: 'number', def: 2, min: 0 },
  stopListeningAfterMinutes: { type: 'number', def: 60, min: 0 },
  remindAfterMinutes: { type: 'number', def: 3, min: 0 },
  archiveAfterDays: { type: 'number', def: 30, min: 1 },
  updateCheck: { type: 'boolean', def: true },
  name: { type: 'string', def: '', only: 'personal' },
  model: { type: 'string', def: '', only: 'personal' },
  // The one lab for pages that belong to no project (tries, demos, options): agents add pages there, a folder per
  // topic, instead of starting a lab of their own (Leo 18 Nov: "def reuse it, why we have so much").
  pagesFolder: { type: 'string', def: '~/lab-pages', only: 'personal' },
  shortcuts: { type: 'shortcuts', def: SHORTCUTS },
  actions: { type: 'actions', def: ACTIONS },
  // What is being tried here (lib/flags.ts). Off unless labit.json, your settings or the ⋯ menu's experiments turn one on.
  flags: { type: 'flags', def: flagDefaults() },
};
// The environment variables that set a setting (as before), and how their values read.
const ENV: Record<string, [string, (v: string) => unknown]> = {
  port: ['PORT', Number],
  batchSeconds: ['LAB_SETTLE_MS', (v) => Number(v) / 1000],
  stopListeningAfterMinutes: ['LAB_CLOSE_GRACE', (v) => Number(v) / 60],
  remindAfterMinutes: ['LAB_REMIND_MS', (v) => Number(v) / 60000],
  updateCheck: ['LABIT_NO_UPDATE_CHECK', () => false],
  model: ['LAB_MODEL', String],
};

type Settings = {
  values: Record<string, any>;
  from: Record<string, string>; // flag, env PORT, labit.json, ~/.config/labit/settings.json, default
  flagFrom: Record<string, 'project' | 'personal'>; // each flag a file names: the project's (which wins) or yours
  files: { project: string | null; personal: string };
  problems: string[];
};

const personalFile = () => path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'labit', 'settings.json');
// labit.json in the folder or the nearest one above it.
const projectFile = (from: string): string | null => {
  for (let dir = path.resolve(from); ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'labit.json'))) return path.join(dir, 'labit.json');
    if (path.dirname(dir) === dir) return null;
  }
};

const read = (file: string | null, problems: string[]): Record<string, unknown> => {
  if (!file || !fs.existsSync(file)) return {};
  try {
    const v = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (v && typeof v === 'object' && !Array.isArray(v)) return v;
    problems.push(`${file}: not an object of settings; ignored`);
  } catch (e) {
    problems.push(`${file}: not valid JSON (${(e as Error).message}); ignored`);
  }
  return {};
};

// One list of actions, checked: the built-in names and { label, send } of your own, in the order given. comment is
// implied (listed, it is dropped); a name that isn't one, a label over 16 characters, a repeat, or more than 5 are said and left out.
const actionList = (list: unknown[], bad: (why: string) => void): unknown[] => {
  const out: unknown[] = [];
  const seen = new Set(['comment']);
  for (const x of list) {
    if (typeof x === 'string') {
      const name = x.trim().toLowerCase();
      if (name === 'comment') continue;
      if (!BUILTIN_ACTIONS.includes(name)) bad(`"${x}" is not an action (${BUILTIN_ACTIONS.join(', ')}, or { "label": "…", "send": "…" }); ignored`);
      else if (seen.has(name)) bad(`"${x}" is listed twice; ignored`);
      else {
        seen.add(name);
        out.push(name);
      }
      continue;
    }
    const o = x as Record<string, unknown> | null;
    const label = typeof o?.label === 'string' ? o.label.trim() : '';
    const send = typeof o?.send === 'string' ? o.send.trim() : '';
    if (!o || typeof o !== 'object' || Array.isArray(o) || !label || !send) bad(`an action of your own needs a "label" and the text to "send"; ignored`);
    else if (label.length > 16) bad(`"${label}": a label is 16 characters at most; ignored`);
    else if (send.length > 300) bad(`"${label}": the text to send is 300 characters at most; ignored`);
    else if (seen.has(label.toLowerCase())) bad(`"${label}" is listed twice; ignored`);
    else {
      seen.add(label.toLowerCase());
      out.push({ label, send });
    }
  }
  if (out.length > MAX_ACTIONS) {
    bad(`has more than ${MAX_ACTIONS} actions (comment makes six); the rest are ignored`);
    out.length = MAX_ACTIONS;
  }
  return out;
};

// A value from a file, checked: undefined (with a problem said) when it doesn't fit.
const check = (key: string, v: unknown, file: string, problems: string[]): unknown => {
  const s = SPEC[key];
  const bad = (why: string) => void problems.push(`${file}: ${key} ${why}; ignored`);
  if (s.type === 'shortcuts') {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return bad('must be an object of action → key');
    const out: Record<string, string> = {};
    for (const [action, key1] of Object.entries(v)) {
      if (action === 'pointer') continue; // the old key 3: key 1 now switches between comment and pointer; a leftover setting is ignored, not said
      if (!(action in SHORTCUTS)) bad(`.${action} is not an action (${Object.keys(SHORTCUTS).join(', ')})`);
      else if (typeof key1 !== 'string' || !/^[a-z0-9]$/i.test(key1)) bad(`.${action} must be one letter or digit`);
      else out[action] = key1.toLowerCase();
    }
    return out;
  }
  if (s.type === 'actions') {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return bad('must be an object: { "words": [...], "spot": [...] }');
    const out: Record<string, unknown[]> = {};
    for (const [area, list] of Object.entries(v)) {
      if (!(area in ACTIONS)) bad(`.${area} is not a place for actions (${Object.keys(ACTIONS).join(', ')})`);
      else if (!Array.isArray(list)) bad(`.${area} must be a list`);
      else out[area] = actionList(list, (why) => bad(`.${area} ${why}`));
    }
    return out;
  }
  if (s.type === 'flags') {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return bad('must be an object of flag → true or false');
    const out: Record<string, boolean> = {};
    for (const [flag, on] of Object.entries(v)) {
      // A flag that was kept or dropped leaves its name behind in somebody's file: say so, don't fail.
      if (!(flag in FLAGS)) bad(`.${flag} is not something being tried now (${Object.keys(FLAGS).join(', ') || 'nothing at the moment'})`);
      else if (typeof on !== 'boolean') bad(`.${flag} must be true or false`);
      else out[flag] = on;
    }
    return out;
  }
  if (typeof v !== s.type) return bad(`must be a ${s.type}`);
  if (s.type === 'number' && (!Number.isFinite(v) || (v as number) < (s.min ?? -Infinity))) return bad(`must be a number of at least ${s.min}`);
  if (s.type === 'string' && key === 'folder') return path.resolve(path.dirname(file), v as string);
  return s.type === 'string' ? (v as string).trim() : v;
};

/** The settings in force: flags (passed in by name), then the environment, the project's file, yours, the defaults. */
export function loadSettings(here: string, flags: Record<string, unknown> = {}, env: NodeJS.ProcessEnv = process.env): Settings {
  const problems: string[] = [];
  const files = { project: projectFile(here), personal: personalFile() };
  const layers: [string, Record<string, unknown>, 'project' | 'personal'][] = [
    [files.project || '', read(files.project, problems), 'project'],
    [files.personal, read(files.personal, problems), 'personal'],
  ];
  const values: Record<string, any> = {};
  const from: Record<string, string> = {};
  const flagFrom: Settings['flagFrom'] = {};
  for (const [file, data] of layers)
    for (const key of Object.keys(data)) if (!(key in SPEC) && key !== '$schema') problems.push(`${file}: ${key} is not a setting; ignored`);
  for (const key of Object.keys(SPEC)) {
    const s = SPEC[key];
    if (flags[key] !== undefined) {
      values[key] = flags[key];
      from[key] = 'flag';
      continue;
    }
    const e = ENV[key];
    if (e && env[e[0]] !== undefined && env[e[0]] !== '') {
      values[key] = e[1](env[e[0]] as string);
      from[key] = `env ${e[0]}`;
      continue;
    }
    for (const [file, data, where] of layers) {
      if (!(key in data)) continue;
      if (s.only && s.only !== where) {
        problems.push(`${file}: ${key} can only be set in ${s.only === 'personal' ? `your own settings (${files.personal})` : "the project's labit.json"}; ignored`);
        continue;
      }
      const v = check(key, data[key], file, problems);
      if (v === undefined) continue;
      // Shortcuts and flags add up, one at a time: the project's over yours over the defaults.
      if (s.type === 'shortcuts' || s.type === 'flags' || s.type === 'actions') {
        if (s.type === 'flags') for (const f of Object.keys(v as object)) flagFrom[f] ??= where;
        values[key] = { ...(v as object), ...values[key] };
        from[key] = from[key] ? `${from[key]} + ${file}` : file;
        continue;
      }
      values[key] = v;
      from[key] = file;
      break;
    }
    if (s.type === 'flags' && values[key]) values[key] = { ...flagDefaults(), ...values[key] };
    if (s.type === 'actions' && values[key]) values[key] = { ...ACTIONS, ...values[key] };
    if (s.type === 'shortcuts' && values[key]) {
      values[key] = { ...SHORTCUTS, ...values[key] };
      const taken = Object.entries(values[key] as Record<string, string>).filter(([, k], i, all) => all.findIndex(([, k2]) => k2 === k) !== i);
      for (const [action, k] of taken) problems.push(`shortcuts: "${k}" is used twice (${action} too); the first action keeps it`);
    }
    if (!(key in values)) {
      values[key] = s.def;
      from[key] = 'default';
    }
  }
  return { values, from, flagFrom, files, problems };
}

/** The shortcuts that differ from the defaults (what the widget needs to hear). */
export const changedShortcuts = (keys: Record<string, string>) => Object.fromEntries(Object.entries(keys).filter(([a, k]) => SHORTCUTS[a as keyof typeof SHORTCUTS] !== k));

/** The actions lists that differ from the defaults (what the widget needs to hear). */
export const changedActions = (actions: Record<string, unknown[]>) => Object.fromEntries(Object.entries(actions).filter(([area, list]) => JSON.stringify(ACTIONS[area as keyof typeof ACTIONS]) !== JSON.stringify(list)));

/** Turns a flag on or off in your own settings file (the Experiments list in the ⋯ menu), keeping the rest of the
 *  file. Off leaves no trace: off is the absence of a flag. A file that isn't JSON is left alone (it throws) rather than
 *  written over. Returns the file. */
export function savePersonalFlag(flag: string, on: boolean): string {
  if (!(flag in FLAGS)) throw new Error(`${flag} is not something being tried now`);
  const file = personalFile();
  let data: Record<string, unknown> = {};
  if (fs.existsSync(file)) {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(`${file}: not an object of settings`);
  }
  const flags = (data.flags && typeof data.flags === 'object' && !Array.isArray(data.flags) ? data.flags : {}) as Record<string, unknown>;
  if (on) flags[flag] = true;
  else delete flags[flag];
  if (Object.keys(flags).length) data.flags = flags;
  else delete data.flags;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
  return file;
}

/** Sets one setting in your own file, keeping the rest. */
export function savePersonal(key: string, value: unknown) {
  const file = personalFile();
  let data: Record<string, unknown> = {};
  let src: string | null = null;
  try {
    src = fs.readFileSync(file, 'utf8');
  } catch {}
  // A file that is there but can't be read as settings is left as it is: writing one key over it would drop the rest.
  if (src !== null) {
    try {
      data = JSON.parse(src);
    } catch {
      throw new Error(`${file} is not valid JSON: fix it, then ${key} can be saved`);
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(`${file} does not hold settings: fix it, then ${key} can be saved`);
  }
  data[key] = value;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file + '.tmp', JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(file + '.tmp', file);
}
