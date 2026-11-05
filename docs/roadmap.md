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


## Not done yet (kept here so nothing is forgotten; update when one is done)
From the human's requests and my own handoffs; each has a handoff entry that says more.
- **Scale for a drawn figure** (a circle's radius has no command yet); **push / pull for a curved face**; a handle for several faces at once.
- **Handles on a real phone:** touch uses the same intents as the mouse but a drag on a handle has not been tried on a device. **The kernel's memory on real phones** (Android and iPhone) is untested.
- **Arrow size:** all handles now share one size (my guess); the human to tune. **Push / pull slivers** (zero-thickness planes after a face push) not reproduced in the kernel; need the exact steps.
- **History panel** (the history exists and undoes; nothing shows it); **kernel in a worker** so a heavy model does not freeze dragging; **named stable references** for body parts (`dec_stable_references`); **curved body edges** pickable along their curve (`Line.pts`).
- **Constraints:** relations between parts on different planes have no special placement; bubbles do not avoid overlapping geometry; the step that uses a deleted figure is reported broken but not shown; the conflict flash names constraints found by leaving each out, not a minimal set.
- **Drawing:** press-drag-release to draw; inference lines (horizontal or vertical alignment with existing points); more than one body (one body is assumed).
- **Look:** the hover ring still shows over a selected body (decide); compare the pencil look with the old one again after the helpers settle; the corner compass was removed on request (axes are small and stay at the origin) so the X Y Z buttons are all that is left of it.
- **To decide with the human:** confirm `dec_interaction_spec` (still provisional); the constraints UI beyond bubbles (a panel, a list); key choices (T rotate, F fillet).
- **Code:** `interaction/actions.ts` (259 lines) mixes the relations table and the code that builds actions from it (split into `rows.ts`); `frameOf` is computed on every dirty frame (profile before optimising).
- **Blueprint, later:** STEP export, assemblies, threads, AI generation (`docs/origin/CAD_Blueprint.original.md`).
