---
id: dec_kernel_hybrid
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_044
date: 2026-11-04
---
# OCCT now, our own kernel later (hybrid), kept unpluggable

The human chose option 3 of the former `q_kernel_choice`: use OpenCASCADE (OCCT) now, with the plan to move to our own kernel later, and to keep the kernel modular,
unpluggable and replaceable, with our own work isolated and ready to take along (`in_044`).

How: the app talks to a kernel only through an **operation graph in** and a **plain-data result out** (`prototypes/cad-ui/src/kernel/README.md`). OCCT lives in
one folder (`src/kernel/occt/`); `src/kernel/index.mjs` and `client.js` are the only switch points. Everything else (sketch logic, the history and graph builder, selection,
the UI) is kernel-agnostic and goes with us. References to faces, lines and corners are geometric (normal and offset, end points and middle), never kernel ids. A conformance
suite (`test/kernel-conformance.test.mjs`) runs against whatever kernel is plugged in, and `tools/check_kernel_boundary.py` enforces the boundary (`inv_kernel_boundary`).

Moving over is per operation: our kernel (or a mix) must pass the same suite plus new cases for that operation before it replaces OCCT's. No deadline; the trigger is evidence
(failures on realistic printing parts, size, speed, or the need for control OCCT does not give).

## Rationale

OCCT has handled every operation built so far, each checked against closed-form volumes and heights, and its weaknesses (opaque errors, a fillet that can return an invalid solid,
about 7 MB compressed) are manageable behind our own interface. A custom kernel is a multi-year effort that nothing yet justifies, but the human wants the option, so the cost of keeping it
open is paid now, while the code is small: one adapter folder, one result format, one test suite.
