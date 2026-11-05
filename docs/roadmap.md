# Roadmap

Phases come from the human's blueprint (section 17). This file only tracks what is current.
Update it at the end of each session.

## Now
- **Building the clean engine in `app/`** under `dec_clean_engine_design` (accepted, `in_099`); the behaviours to reproduce are `dec_interaction_spec` (still to be confirmed by the human), the relations rules `dec_relations_standard` (provisional except the mover rule), no sketch isolation `dec_no_sketch_isolation`, ownership `dec_constraint_ownership`.
- The scaffold and **phase 1 (core, no screen) are done** (27 tests): parts, scene, commands and history, ownership, selection, the actions table. **Next: phase 2, the compiler** (solver per plane with virtual fixed parts, then the kernel graph); see Handoff 082.
- `prototypes/cad-ui` is the reference until phase 4 runs, then frozen (its README says what it taught).

## Done
- Project record set up; `docs/licenses.md` written; `kernel-slice`, `sketch-extrude`, `cad-ui` built as prototypes (2026-11-04 and 2026-11-05): planes, sketching, constraints, extrude, fillet and chamfer, devices, the pencil look and the ring highlight; relations (distances) started.

## Later
- The clean engine phases 2 to 8 (compiler, picking, minimal view, input, drawing and operations, the relations UI, cut over), then blueprint phases 2-5 (solver feel, analytical fillets and STEP, polish, then AI generation, assemblies, threads).
