// Things being tried. A new instrument arrives here first: off unless somebody turns it on, used in a real lab for
// a while, then kept (the flag goes and it is simply labit) or dropped (the code goes with it). The changelog says
// which. Nothing is in the product because it was built.
//
// Each flag: the key as it is written in labit.json, the one line the ⋯ menu's experiments list shows, and when it was
// first offered.

// sinceLooked (an "Added" pill) was replaced by sectionBar, and sectionBar was kept (the section bar is always there). board was kept (boards are always there). agentPins was kept (an agent's pin always wears labit's mark) and liveUrl was dropped before it had code. native was kept (the browser holds pins and cards, menus are popovers, the box grows: always, 20 Nov). select (select mode, V) was dropped (20 Nov).
export const FLAGS: Record<string, { name: string; since: string }> = {
  inkOnText: { name: 'ink on selected words, not a pin', since: '0.6.3' },
};

/** Every flag, off. */
export const flagDefaults = (): Record<string, boolean> =>
  Object.fromEntries(Object.keys(FLAGS).map((k) => [k, false]));

/** The ones that are on, for the page and for a listing. */
export const flagsOn = (flags: Record<string, boolean> = {}): string[] =>
  Object.keys(FLAGS).filter((k) => flags[k]);
