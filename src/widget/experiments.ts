// Part of the comment widget (src/comments.js bundles it). Uses the widget's own parts through W, set once at startup.
//
// Experiments (lib/flags.ts) in the ⋯ menu: "experiments" with how many are on; a click turns the menu into the list,
// a switch a flag with its one line, and a back row at its head. A switch saves in your own settings (every lab you
// run) and applies at once: the lab tells every open page, which starts what came on and reloads for what went off.
// A flag the project's labit.json sets wins over yours: shown, not switched. A guest sees the switches, greyed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let W: any;
export let flagNames: string[];
export let mayFlag: boolean;
let expOpen = false;
export let expBtn: HTMLElement | null;
export let expBack: HTMLElement;
export let expNote: HTMLElement;
export let expRows: HTMLButtonElement[];
/** Whether the Experiments list is open in the ⋯ menu (it opens on its first page again when the menu closes). */
export const expIsOpen = () => expOpen;
export const expClose = () => {
  expOpen = false;
};
function drawExperiments() {
  if (!expBtn) return;
  const n = flagNames.filter(W.flag).length;
  expBtn.replaceChildren('experiments', W.el('span', { class: `exp-cnt${n ? '' : ' zero'}` }, String(n)));
  expBtn.setAttribute('aria-label', `experiments, ${n} on`);
  for (const b of expRows) b.setAttribute('aria-checked', String(W.flag(b.dataset.flag)));
}
const showExperiments = (open: boolean) => {
  expOpen = open;
  W.placeBar();
  (open ? expRows.find((b) => !b.disabled) || expBack : expBtn)?.focus({ preventScroll: true });
};
// A flag's feature, started once. One that goes off can't be
// taken back out of a running page: the page reloads (when it's safe) and comes back without it.
const started = new Set();
export const startFlag = (name: string) => {
  if (started.has(name) || !W.host.isConnected) return;
  started.add(name);
};
export function bindExperiments(w: unknown) {
  W = w;
  flagNames = Object.keys(W.FLAGS);
  mayFlag = Boolean(W.adminToken && W.FLAGSAPI);
  expBtn = flagNames.length && W.script?.dataset.live ? W.el('button', { type: 'button', class: 'exp-btn', 'aria-haspopup': 'true' }) : null;
  expBack = W.el('button', { type: 'button', class: 'exp-back' }, '‹ experiments');
  expNote = W.el('div', { class: 'exp-note' }, 'only the computer running the lab switches these');
  expRows = flagNames.map((name) => {
    const b = W.el('button', { type: 'button', class: 'exp', role: 'switch', 'data-flag': name }) as HTMLButtonElement;
    const words = W.el('span', { class: 'exp-words' }, W.FLAGS[name].name);
    if (W.FLAGS[name].project) words.append(W.el('span', { class: 'exp-why' }, "set by the project's labit.json"));
    b.append(words, W.el('span', { class: 'exp-sw', 'aria-hidden': 'true' }));
    b.disabled = !mayFlag || Boolean(W.FLAGS[name].project);
    b.addEventListener('click', async (e) => {
      e.stopPropagation(); // the menu stays open: one pick doesn't close it here
      if (b.disabled) return;
      const on = !W.flag(name);
      b.setAttribute('aria-checked', String(on)); // at once; FLAGS follows the lab's answer
      try {
        const r = await fetch(W.FLAGSAPI, { method: 'POST', headers: W.headers(), body: JSON.stringify({ flag: name, on }) });
        if (!r.ok) throw new Error(await r.text());
        W.S.syncFlags((await r.json()).flags, () => location.reload());
      } catch {
        drawExperiments();
        W.say("couldn't switch it: is the lab running?");
      }
    });
    return b;
  });
  drawExperiments();
  expBtn?.addEventListener('click', (e) => (e.stopPropagation(), showExperiments(true)));
  expBack.addEventListener('click', (e) => (e.stopPropagation(), showExperiments(false)));
  // The lab's word on which flags are on (live stream, or the answer to a switch here).
  W.S.syncFlags = (on, reload) => {
    let gone = false;
    for (const [name, f] of Object.entries(W.FLAGS as Record<string, { on: boolean }>)) {
      const now = on.includes(name);
      if (f.on === now) continue;
      f.on = now;
      if (now) startFlag(name);
      else if (started.has(name)) gone = true;
    }
    drawExperiments();
    if (gone) reload();
  };
}
