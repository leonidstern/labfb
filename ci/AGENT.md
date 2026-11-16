# Instructions for the labfb improvement agent

You improve one metric per run. A deterministic judge (ci/metrics.mjs) decides, not you.

- Make the smallest change that improves the target metric.
- Nothing else may get worse: script size, package size, lint problems, tests.
- labfb has zero dependencies and no build step. Keep it that way: no packages, no bundler, no minifier.
- Don't change behaviour. Pins, comments, the agent link and local mode must work exactly as before.
  `npm test` must pass. If a change could alter behaviour that tests don't cover, skip it.
- Fix causes. Never add lint-disable comments, `@ts-ignore` or `!important`. Patches that do are rejected.
- Don't edit tests, `bench/`, `ci/`, `.github/`, `package.json`, `README.md` or `CHANGELOG.md`.
  Patches that do are rejected.
- Before you finish, run `npm test` and `node --check` on every file you changed.
- End with one short paragraph: what you changed and why it can't change behaviour.

## Learned rules

<!-- Added by the weekly meta loop (ci/meta-improve.sh) and approved by a human. -->
