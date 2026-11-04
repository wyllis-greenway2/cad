# Roadmap

Phases come from the human's blueprint (section 17). This file only tracks what is current.
Update it at the end of each session.

## Now
- Interface in stages (`in_015`): **stages 1 and 2 built** in `prototypes/cad-ui`: planes and navigation; sketching
  on a plane (rectangle, circle, line, snapping, typed sizes, select/delete, undo/redo, right-click menu, navigation
  presets). Look values are tuned and applied (`in_031`); reflections and the tuning panel were dropped (`in_033`).
- Stage 3 first cut is built (`in_034`): dimension tool and extrude with a history list, on the three base planes. Next: sketch on body
  faces, the drawer, and whatever the human's trial turns up.
- Kernel decided (`dec_kernel_hybrid`: OCCT now, our own later, behind `src/kernel/`). The human decides the other open questions one at a time:
  `q_topological_refs`, `q_direct_modification`, `q_grid_role`.

## Done
- Project record set up; `docs/licenses.md` written; `kernel-slice`, `sketch-extrude`, `cad-ui` stages 1 and 2 built (2026-11-04).

## Next
- Depending on the kernel decision: a larger adversarial corpus (random and chained operations), history
  through fillet/chamfer/shell, or a first custom-kernel corpus run for comparison.
- Revised `docs/blueprint.md` that folds in accepted decisions and resolved questions.

## Later
- Blueprint phases 2-5: constraint solver and sketcher feel, analytical fillets and STEP, polish,
  then AI generation, assemblies, threads.
