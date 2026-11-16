# Zoom: code and architecture

For blocks about code, a part of a system, an API, data or how something is built.

**Bigger picture.** Where this sits in the system:
- what calls it and what it calls; the data that flows in and out
- the module or service map around it, as a small diagram (boxes and arrows, inline SVG)
- the constraint it serves (speed, safety, cost) and the parts that share it
- what was decided and dropped on the way (from the trail)

**Deeper.** Into this part:
- the path step by step, each step with its file and line
- the data shapes it takes and returns
- the edge cases and how each is handled; the ones that aren't
- the tests that cover it, and what nothing covers
- what breaks if it changes

**Rules.** Read the code; quote file paths and lines that exist. Run a test or the code when a claim depends on it. Say what you didn't read.

**Deliver.** A diagram for the bigger picture; a numbered path with file:line for deeper.
