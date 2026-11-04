---
id: inv_math_pure
kind: invariant
status: accepted
origin: human
human_input: in_001
date: 2026-11-04
depends_on:
  - prin_never_box_in: pure geometry functions are what make the kernel portable and replaceable
---
# The geometry math library has no side effects

Functions take inputs and return outputs: no global state, no mutation, no logging, no events. The same
inputs always produce the same outputs.

## Rationale
Human-authored: blueprint "Three Non-Negotiable Rules" (rule 3). Makes the geometry testable against a
known-answer corpus and compilable to both WASM and native.
