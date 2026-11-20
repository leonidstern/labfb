// Your actions (Leo, 19 Nov: "one action list for pin and select", select since removed): one ordered list in your own settings, each a short
// name (the chip) and the prompt the agent gets. The comment box shows as many as fit and "…" for the rest. A list nobody wrote yet is seeded once from SEED into your settings.json (lib/settings.ts), so it is
// yours from then on: there is no default to go back to. The lab always hands the widget the list (data-actions), so the widget carries no copy.
type Action = { name: string; prompt: string };
export const NAME_MAX = 7;
export const PROMPT_MAX = 300;
export const SEED: Action[] = [
  { name: 'go', prompt: 'Go ahead: do what is proposed here.' },
  { name: 'fix', prompt: 'Fix this: it is broken or wrong.' },
  { name: 'remove', prompt: 'Remove this.' },
  { name: 'like', prompt: 'Make this look like the one I name: same size, spacing, colour and type.' },
  { name: 'move', prompt: 'Move this to where I say.' },
  { name: 'states', prompt: 'Show this in its states (hover, loading, empty, error) so I can review each one.' },
  { name: 'variant', prompt: 'Make 3 variants of this, shown in place as a / b / c tabs on it, so I can pick one.' },
];

/** The list, checked, in the order given: a name of NAME_MAX characters at most and a prompt; a bad or repeated one is
 *  said (bad) and left out. */
export function actionItems(list: unknown[], bad: (why: string) => void): Action[] {
  const out: Action[] = [];
  for (const x of list) {
    const o = x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : null;
    const name = typeof o?.name === 'string' ? o.name.trim() : '';
    const prompt = typeof o?.prompt === 'string' ? o.prompt.trim() : '';
    if (!name || !prompt) bad(`each action needs a "name" and a "prompt"; ${JSON.stringify(x)} ignored`);
    else if (name.length > NAME_MAX) bad(`"${name}" is ${name.length} characters: a name is ${NAME_MAX} at most; ignored`);
    else if (prompt.length > PROMPT_MAX) bad(`"${name}": a prompt is ${PROMPT_MAX} characters at most; ignored`);
    else if (out.some((a) => a.name.toLowerCase() === name.toLowerCase())) bad(`"${name}" is listed twice; ignored`);
    else out.push({ name, prompt });
  }
  return out;
}

/** The list to seed from what a settings file holds: the seed, then your own old { label, send } buttons (the
 *  { words, spot } form from before), cut to NAME_MAX. */
export function seedFrom(old: unknown): Action[] {
  const out = SEED.map((a) => ({ ...a }));
  const own = old && typeof old === 'object' && !Array.isArray(old) ? Object.values(old).flat() : [];
  for (const x of own as Record<string, unknown>[]) {
    const name = typeof x?.label === 'string' ? x.label.trim().slice(0, NAME_MAX) : '';
    const prompt = typeof x?.send === 'string' ? x.send.trim().slice(0, PROMPT_MAX) : '';
    if (name && prompt && !out.some((a) => a.name.toLowerCase() === name.toLowerCase())) out.push({ name, prompt });
  }
  return out;
}

export const LIST_MAX = 40;
/** A whole list sent from a comment box's "…" menu (PUT /_lab/api/actions), checked strictly and in its order: every
 *  action must fit (a name of 1 to NAME_MAX characters, a prompt of 1 to PROMPT_MAX, no name twice), or nothing is
 *  saved and the first reason is given. */
export function listFrom(body: unknown): { actions: Action[] } | { why: string } {
  const list = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>).actions : undefined;
  if (!Array.isArray(list)) return { why: 'actions: a list of { "name": "…", "prompt": "…" }' };
  if (list.length > LIST_MAX) return { why: `${LIST_MAX} actions at most` };
  const whys: string[] = [];
  const actions = actionItems(list, (w) => whys.push(w));
  return whys.length ? { why: whys[0].replace(/;? ignored$/, '') } : { actions };
}
