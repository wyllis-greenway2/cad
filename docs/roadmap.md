# Roadmap

Phases come from the human's blueprint (section 17). This file only tracks what is current.
Update it at the end of each session.

## Now
- Interface in stages (`in_015`): **stages 1 and 2 built** in `prototypes/cad-ui`: planes and navigation; sketching
  on a plane (rectangle, circle, line, snapping, typed sizes, select/delete, undo/redo, right-click menu, navigation
  presets). The human tries it and gives feedback (and can set the new see-through sheet brightness with
  `bash tools/preview.sh tune`; the look values were tuned and applied in `in_031`, reflections are new and untuned).
- Then stage 3: extrude on the plane with Shapr3D-style defaults (pull up adds, pull down cuts), plus the history list
  and the drawer (`dec_ui_conventions`). Reuse the OCCT worker from `kernel-slice` / `sketch-extrude`.
- Human decides the open questions, starting with `q_kernel_choice` (evidence in `kernel-slice` and
  `sketch-extrude` READMEs).

## Done
- Project record set up; `docs/licenses.md` written; `kernel-slice`, `sketch-extrude`, `cad-ui` stages 1 and 2 built (2026-11-04).

## Next
- Depending on the kernel decision: a larger adversarial corpus (random and chained operations), history
  through fillet/chamfer/shell, or a first custom-kernel corpus run for comparison.
- Revised `docs/blueprint.md` that folds in accepted decisions and resolved questions.

## Later
- Blueprint phases 2-5: constraint solver and sketcher feel, analytical fillets and STEP, polish,
  then AI generation, assemblies, threads.
