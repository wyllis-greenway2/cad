---
id: q_kernel_choice
kind: question
status: open
origin: human
human_input: in_002, in_003
date: 2026-11-04
---
# Which geometry kernel?

The blueprint's intent was a custom kernel (closed-form primitive intersections, OCCT only as a fallback).
The human later questioned whether to use OpenCASCADE at all, because of FreeCAD's reputation, and asked
how hard a from-scratch kernel would be (`in_002`, `in_003`).

Options on the table:
1. **OCCT behind our own interface** (AI recommendation). Known weaknesses: fillet and boolean failures on
   awkward geometry, tolerance handling, a heavy C++ API, large WASM size. Most FreeCAD pain (naming,
   crashes, sketcher, UX) came from FreeCAD's own layer, not OCCT.
2. **Custom kernel from day one**, with a strict gate: build a test oracle and corpus first and check at
   2-3 months whether the failure rate on realistic printing parts is acceptable.
3. **Hybrid** (AI's "middle path"): OCCT first behind the interface, custom kernel built in parallel for
   narrow cases (orthogonal parts, holes, simple fillets), switching per operation only where it passes
   the same corpus.

Evidence from `prototypes/kernel-slice` (2026-11-04, see its README): OCCT via replicad built 16 of 16
closed-form corpus cases to within 1.2e-11 and handled coincident faces, tangency and 1e-4 mm gaps exactly.
One bad case: an impossible fillet returned an invalid solid without throwing (caught by OCCT's validity
check). Browser error messages are opaque. These results do not say how a custom kernel would compare.

Not decided. The human has not chosen among these. The AI's suggested way to decide with data: build a
vertical slice and an adversarial test corpus (see roadmap).
