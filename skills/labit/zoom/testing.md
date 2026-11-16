# Zoom: testing

For blocks that are a test, a bug, a failing case or a test plan.

**Bigger picture.** What this case is part of:
- what the feature must do, and which of that the tests cover
- where failures cluster: this case among the others
- what the bug affects for people using it, and how often

**Deeper.** Into this one case:
- the shortest steps that show it, and what happens versus what should
- the cause, traced to the code (file and line)
- the cases next to it that fail the same way, run to check
- the fix, and the test that proves it

**Rules.** Run it: a case is shown failing or passing, not assumed. Expected results come from what the feature must do, not from what the code does now.

**Deliver.** Steps as a numbered list; results as pass or fail with the output that shows it.
