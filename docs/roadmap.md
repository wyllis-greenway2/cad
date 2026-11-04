# Roadmap

Phases come from the human's blueprint (section 17). This file only tracks what is current.
Update it at the end of each session.

## Now
- Interface in stages (`in_015`): **stages 1 and 2 built** in `prototypes/cad-ui`: planes and navigation; sketching
  on a plane (rectangle, circle, line, snapping, typed sizes, select/delete, undo/redo, right-click menu, navigation
  presets). Look values are tuned and applied (`in_031`); reflections and the tuning panel were dropped (`in_033`).
- Stage 3 first cut is built (`in_034`): dimension tool and extrude with a history list, on the three base planes. Next: sketch on body
  faces, the drawer, and whatever the human's trial turns up.
- **No open questions left.** Decided (`in_044` to `in_050`): kernel hybrid and unpluggable (`dec_kernel_hybrid`, built as `src/kernel/`), small solver of our own (`dec_constraint_solver_small`, built for the first constraint types),
  named references (`dec_stable_references`, not built), additive history with modifications as steps and sketches owned by their step (`prin_history_additive`, `dec_modifications_are_steps`,
  `dec_sketch_belongs_to_step`, not built), grid as an interface feature only (`dec_grid_ui_only`, already how the app works).

## Done
- Project record set up; `docs/licenses.md` written; `kernel-slice`, `sketch-extrude`, `cad-ui` stages 1 and 2 built (2026-11-04).

## Next
- Depending on the kernel decision: a larger adversarial corpus (random and chained operations), history
  through fillet/chamfer/shell, or a first custom-kernel corpus run for comparison.
- Revised `docs/blueprint.md` that folds in accepted decisions and resolved questions.

## Later
- Blueprint phases 2-5: constraint solver and sketcher feel, analytical fillets and STEP, polish,
  then AI generation, assemblies, threads.
