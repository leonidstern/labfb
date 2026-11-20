// Ids that say nothing: a framework or build makes them up (React's :r3: and «r3», Radix's radix-:r5:, svelte-1abc2de,
// CSS-module _card_1x2y3, css-1abc2de), so they change between builds and renders. A Tailwind variant (hover:bg-x) has a
// colon too: it's a state, not identity either.
export const GENERATED = /[:«»]|^_r_\w+_$|[-_](?=[a-z0-9]*\d[a-z])[a-z0-9]{5,}$/i;
// Not worth showing anybody as new: made up, a long hash, or too long to be a name.
export const noisy = (id: string) => GENERATED.test(id) || /^[0-9a-f]{12,}$/i.test(id) || id.length > 64;
