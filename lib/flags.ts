// Things being tried. A new instrument arrives here first: off unless somebody turns it on, used in a real lab for
// a while, then kept (the flag goes and it is simply labit) or dropped (the code goes with it). The changelog says
// which. Nothing is in the product because it was built.
//
// Each flag: the key as it is written in labit.json, one line saying what it is, and when it was first offered.

// agentPins was kept (an agent's pin always wears labit's mark) and liveUrl was dropped before it had code.
export const FLAGS: Record<string, { name: string; since: string }> = {
  editText: { name: 'edit words in place (E), saved into the source file', since: '0.6.3' },
  sinceLooked: { name: 'a "New" pill: what was added since you looked', since: '0.6.3' },
};

/** Every flag, off. */
export const flagDefaults = (): Record<string, boolean> =>
  Object.fromEntries(Object.keys(FLAGS).map((k) => [k, false]));

/** The ones that are on, for the page and for a listing. */
export const flagsOn = (flags: Record<string, boolean> = {}): string[] =>
  Object.keys(FLAGS).filter((k) => flags[k]);
