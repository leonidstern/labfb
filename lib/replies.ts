// How you want agents to answer, made from your feedback on their answers (the feedback button on an answer, in the
// widget). The agent turns the feedback into one rule (labit reply --rule); the lab keeps the rules here, one line
// each, and hands them over with every pin. Yours, for every project: ~/.config/labit/replies.md. Edit it freely.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** At most this many rules go out with the pins: the ones you gave most often, then the newest. */
const HANDED = 15;
const HEAD = '# How to answer\n\nRules from your feedback on agents\' answers in labit. Every agent gets them with your pins. Edit freely: one rule per line.\n\n';
const file = () => path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'labit', 'replies.md');
const LINE = /^- (.+?)(?: \(×(\d+)\))?$/;
const same = (a: string, b: string) => a.toLowerCase().replace(/[\s.]+$/, '') === b.toLowerCase().replace(/[\s.]+$/, '');

type Rule = { text: string; times: number; at: number };

function read(): Rule[] {
  let src = '';
  try {
    src = fs.readFileSync(file(), 'utf8');
  } catch {
    return [];
  }
  return src.split('\n').map((l) => LINE.exec(l.trim())).filter(Boolean).map((m, at) => ({ text: m![1], times: Number(m![2] || 1), at }));
}

function write(rules: Rule[]) {
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), HEAD + rules.map((r) => `- ${r.text}${r.times > 1 ? ` (×${r.times})` : ''}`).join('\n') + '\n');
}

/** A rule from feedback: a new line, or the same rule given again counts once more. */
export function addRule(text: string) {
  const t = text.replace(/\s+/g, ' ').trim().slice(0, 200);
  if (!t) return;
  const rules = read();
  const had = rules.find((r) => same(r.text, t));
  if (had) had.times++;
  else rules.push({ text: t, times: 1, at: rules.length });
  write(rules);
}

/** Undo on the answer that saved it: once less, gone at none. */
export function dropRule(text: string) {
  const rules = read();
  const had = rules.find((r) => same(r.text, text));
  if (!had) return;
  had.times--;
  write(rules.filter((r) => r.times > 0));
}

/** What goes out with the pins: a few lines, or nothing while there are no rules. */
export function rulesText(): string {
  const rules = read().sort((a, b) => b.times - a.times || b.at - a.at).slice(0, HANDED);
  return rules.length ? `\nHow the person wants answers, for the rest of this session (sent once, and again when they change; ${file().replace(os.homedir(), '~')}):\n${rules.map((r) => `- ${r.text}`).join('\n')}` : '';
}
