// The shape a comment is stored in, and how an older one is read. Used by the comments API (lib/comments-api.mjs) and
// by the lab (local.mjs) as it loads .lab/comments/: one place, so both read old records alike.
//
// v is the version a record was saved in; a record without one is 0. upgrade() brings any record up to VERSION, filling
// new fields from the old ones, so an old file means exactly what it meant before.
//   1 (17 Nov): agent replies say what they are with intent ('done' | 'working' | 'question'), read before from the
//     text ("Done: …", "On it"); a thread says when it was resolved (resolvedAt); replies no longer carry resolved:false
//     (only a thread can be resolved).
//   2 (17 Nov): a rule the agent offers is one field, suggest: { text, state } (state 'kept' | 'no' | 'undone', none
//     while it is only offered), where it was four (suggest, suggestDone, rule, ruleUndone). The marks of what a wait
//     was handed (deliveredAt, deliveredTo, remindedAt) left the comment: a local lab keeps them in .lab/handed.json.
//     A pin on a word from before quotes ("…before [word] after…" in anchor.text) has the word as anchor.quote.
//     A reply has no anchor (it was null). An agent's session on a comment is id, name, agent, kind and model.
export const VERSION = 2;
export const INTENTS = ['done', 'working', 'question'];

// An agent reply's intent from its words, for records (and agents) that don't say it: the rule the lab and the widget
// went by before intent existed.
export const intentFromText = (text) => (/^done\b/i.test(String(text ?? '').trim()) ? 'done' : /^on it\b/i.test(String(text ?? '').trim()) ? 'working' : undefined);

// handed: where a local lab collects the old hand-off marks, { id: [deliveredAt, deliveredTo, remindedAt] }.
// What a comment keeps of the session that wrote it: who, not how to reach it (the link and resume command change, and
// nothing reads them from a comment).
export const slim = (s) => Object.fromEntries(Object.entries(s).filter(([k, v]) => v && k !== 'url' && k !== 'resume'));
export function upgrade(record, handed) {
  if (!record || typeof record !== 'object' || (Number(record.v) || 0) >= VERSION) return record;
  const c = { ...record, v: VERSION };
  if (c.parent) {
    if (c.resolved === false) delete c.resolved;
    if (c.anchor === null) delete c.anchor;
    // An agent's answer (it carries session) from before intent, or from before the lab filled it in from the words.
    if (c.session && !c.intent) {
      const intent = intentFromText(c.text);
      if (intent) c.intent = intent;
    }
  }
  const text = c.rule || c.suggest;
  if (typeof text === 'string') c.suggest = { text, ...(c.rule ? { state: c.ruleUndone ? 'undone' : 'kept' } : c.suggestDone === 'no' ? { state: 'no' } : {}) };
  if (handed && c.deliveredAt) handed[c.id] = [c.deliveredAt, c.deliveredTo ?? null, ...(c.remindedAt ? [c.remindedAt] : [])];
  for (const k of ['suggestDone', 'rule', 'ruleUndone', 'deliveredAt', 'deliveredTo', 'remindedAt']) delete c[k];
  if (c.session) c.session = slim(c.session);
  const a = c.anchor;
  const word = a && !a.quote && /^(?:element|text|)$/.test(a.kind || '') && /^(…?)(.*?)\[([^\]]+)\](.*?)(…?)$/s.exec(a.text || '');
  if (word && (word[1] || word[5])) c.anchor = { ...a, kind: 'text', quote: { exact: word[3], prefix: word[2].slice(-40), suffix: word[4].slice(0, 40) } };
  return c;
}
