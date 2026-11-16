// A dev server reloads the page as soon as a file changes — under you, mid-sentence. The lab puts a small holder
// at the top of every page it serves from a dev server (local.mjs, HOLD): it wraps WebSocket and keeps a reload
// message waiting while words sit unsent. This is the widget's side of it: how many boxes are holding words.
// Where there is no holder (a folder of files, the cloud), nothing waits — the words are still kept (composer.ts).

type Holder = { writing: number; held: unknown[]; flush: () => void };
const holder = (): Holder | null => (window as unknown as { __lab?: Holder }).__lab || null;

/** Called as a box changes: how many boxes hold words nobody has sent. */
export function holdReloads(count: number) {
  const L = holder();
  if (!L) return;
  L.writing = Math.max(0, count);
  if (!L.writing) L.flush(); // nothing is being written any more: the page can catch up
}

/** True while a reload is waiting for you to finish. */
export function reloadWaiting() {
  const L = holder();
  return Boolean(L && L.held.length);
}
