---
id: inv_kernel_boundary
kind: invariant
status: accepted
origin: ai-proposed-human-approved
human_input: in_044
date: 2026-11-04
depends_on:
  - dec_kernel_hybrid: if the kernel strategy changes, the boundary rule changes with it
---
# Nothing outside the kernel adapter touches a geometry library

Only files under `src/kernel/occt/` (the adapter) may import OCCT or replicad. Files directly in `src/kernel/` (`index.mjs`, `client.js`) may import the adapter; nothing else may.
The adapter may not import the app. The app and the kernel exchange only the operation graph and the plain-data result (`src/kernel/README.md`): no kernel objects, handles or
ids cross the boundary, and references to faces, lines and corners are geometric. Every kernel plugged in must pass `test/kernel-conformance.test.mjs` unchanged.

Checked mechanically by `python3 tools/check_kernel_boundary.py` (run it with the tests; it exits 1 and lists the offending files) and in code review.

## Rationale

The human wants to replace OCCT with our own kernel later without rewriting the app (`in_044`). That is only cheap if the dependency is confined to one folder and one data format
from the start; a single stray import or a kernel id stored in the model would spread it.
