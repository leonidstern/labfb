// Ids that say nothing: a framework or build makes them up (React's :r3: and «r3», Radix's radix-:r5:, svelte-1abc2de,
// CSS-module _card_1x2y3, css-1abc2de), so they change between builds and renders. A Tailwind variant (hover:bg-x) has a
// colon too: it's a state, not identity either.
export const GENERATED = /[:«»]|^_r_\w+_$|[-_](?=[a-z0-9]*\d[a-z])[a-z0-9]{5,}$/i;
// Not worth showing anybody as new: made up, a long hash, or too long to be a name.
export const noisy = (id: string) => GENERATED.test(id) || /^[0-9a-f]{12,}$/i.test(id) || id.length > 64;

// The ids a page's source gives its elements (scripts, styles and comments left out), each once, in order, the ones
// that read as names only: what the lab compares with the ids a person has seen (local.mjs, "unseen by").
export function pageIds(html: string): string[] {
  const text = html.replace(/<!--[\s\S]*?-->|<(script|style|template)\b[\s\S]*?<\/\1>/gi, '');
  const ids = new Set<string>();
  for (const m of text.matchAll(/<[a-z][^>]*?\sid\s*=\s*(?:"([^"]+)"|'([^']+)')/gi)) {
    const id = (m[1] || m[2]).trim();
    if (id && !noisy(id)) ids.add(id);
  }
  return [...ids];
}
