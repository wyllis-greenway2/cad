# Roadmap

Phases come from the human's blueprint (section 17). This file only tracks what is current.
Update it at the end of each session.

## Now
- Interface in stages (`in_015`): **stage 1 built** (`prototypes/cad-ui`: infinite XYZ planes, select a
  plane, go normal to it, orbit, click to return). Human tries it and gives feedback.
- Apply the human's tuned values from the temporary tuning panel (`bash tools/preview.sh tune`), then delete
  `prototypes/cad-ui/src/tune.js`.
- Then stage 2: sketch on the selected plane (reuse the tools from `sketch-extrude`). Then stage 3: extrude.
- Human decides the open questions, starting with `q_kernel_choice` (evidence in `kernel-slice` and
  `sketch-extrude` READMEs).

## Done
- Project record set up; `docs/licenses.md` written; `kernel-slice`, `sketch-extrude` and `cad-ui` stage 1 prototypes built (2026-11-04).

## Next
- Depending on the kernel decision: a larger adversarial corpus (random and chained operations), history
  through fillet/chamfer/shell, or a first custom-kernel corpus run for comparison.
- Revised `docs/blueprint.md` that folds in accepted decisions and resolved questions.

## Later
- Blueprint phases 2-5: constraint solver and sketcher feel, analytical fillets and STEP, polish,
  then AI generation, assemblies, threads.
