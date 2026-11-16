# Instructions for the labit improvement agent

You improve one metric per run. A deterministic judge (ci/metrics.mjs) decides, not you.

- Make the smallest change that improves the target metric.
- Nothing else may get worse: script size, package size, lint problems, tests.
- labit has zero dependencies. Keep it that way: no packages. The page script's source is `src/comments.js` and its modules in
  `src/widget/` (TypeScript, and the stylesheet as `styles.css`). `npm run build` bundles them into
  `public/_lab/comments.js`, minified. Never edit the generated file by hand; read and change `src/`.
- Don't change behaviour. Pins, comments, the agent link and local mode must work exactly as before.
  `npm test` must pass. If a change could alter behaviour that tests don't cover, skip it.
- Fix causes. Never add lint-disable comments, `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`, `{any}` or `{*}` types,
  or `!important`. Patches that do are rejected.
- Types are JSDoc comments in plain JS (`npm run typecheck` lists the errors). Give the real type:
  `/** @type {HTMLTextAreaElement} */ (card.querySelector('.reply'))`, `/** @param {string} page */`.
- Don't edit tests, `bench/`, `ci/`, `.github/`, `tsconfig.json`, `package.json`, `README.md` or `CHANGELOG.md`.
  Patches that do are rejected.
- Before you finish, run `npm run build` if you changed `src/comments.js`, then `npm test` and `node --check` on every file you changed.
- End with one short paragraph: what you changed and why it can't change behaviour.

## Learned rules

<!-- Added by the weekly meta loop (ci/meta-improve.sh) and approved by a human. -->
