// The shape a comment is stored in, and how an older one is read. Used by the hosted API (api/lab-comments.mjs) as it
// reads Redis and by the local lab (local.mjs) as it loads .lab/comments/: one place, so both read old records alike.
// (The _ keeps Vercel from serving this file as an endpoint of its own.)
//
// v is the version a record was saved in; a record without one is 0. upgrade() brings any record up to VERSION, filling
// new fields from the old ones, so an old file means exactly what it meant before.
//   1 (17 Nov): agent replies say what they are with intent ('done' | 'working' | 'question'), read before from the
//     text ("Done: …", "On it"); a thread says when it was resolved (resolvedAt); replies no longer carry resolved:false
//     (only a thread can be resolved).
export const VERSION = 1;
export const INTENTS = ['done', 'working', 'question'];

// An agent reply's intent from its words, for records (and agents) that don't say it: the rule the lab and the widget
// went by before intent existed.
export const intentFromText = (text) => (/^done\b/i.test(String(text ?? '').trim()) ? 'done' : /^on it\b/i.test(String(text ?? '').trim()) ? 'working' : undefined);

export function upgrade(record) {
  if (!record || typeof record !== 'object' || (Number(record.v) || 0) >= VERSION) return record;
  const c = { ...record, v: VERSION };
  if (c.parent) {
    if (c.resolved === false) delete c.resolved;
    // Only the local lab marks the agent's own replies (session); the hosted store can't tell them from people's.
    if (c.session && !c.intent) {
      const intent = intentFromText(c.text);
      if (intent) c.intent = intent;
    }
  }
  return c;
}
