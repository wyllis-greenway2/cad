# Roadmap

Phases come from the human's blueprint (section 17). This file only tracks what is current.
Update it at the end of each session.

## Now
- **The clean engine in `app/`** is built under `dec_clean_engine_design` (accepted, `in_099`); the behaviours to reproduce are `dec_interaction_spec` (still to be confirmed by the human), the relations rules `dec_relations_standard` (provisional except the mover rule), no sketch isolation `dec_no_sketch_isolation`, ownership `dec_constraint_ownership`.
- **The eight phases of the clean engine are done** (131 tests; `cd app && npm run check`): core, compiler, picking, view, input, drawing and operations, relations UI, and the cut over (save and open, autosave, conformance suite moved, README). Run it: `LAN=1 bash tools/preview.sh`. **Next: the human tries it on the mouse, trackpad and phone**; then the features listed in Handoff 090 (compass and panes, grid on the straight plane, kernel in a worker, history panel, push and pull, named references).
- `prototypes/cad-ui` is frozen (its README says what it taught); `bash tools/preview.sh cad-ui` still runs it.

## Done
- Project record set up; `docs/licenses.md` written; `kernel-slice`, `sketch-extrude`, `cad-ui` built as prototypes (2026-11-04 and 2026-11-05): planes, sketching, constraints, extrude, fillet and chamfer, devices, the pencil look and the ring highlight; relations (distances) started.

## Later
- Blueprint phases 2-5 (solver feel, analytical fillets and STEP, polish, then AI generation, assemblies, threads).
