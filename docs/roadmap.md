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
Done (`in_131`, `in_132`): scale for a drawn figure, dragging a corner of a drawing, lining up with corners while drawing, push / pull of several faces, curved body edges picked along the curve, `actions.ts` split, no letter keys, smaller semi-transparent handles, the bodies and history lists in the ⋯ menu, every curved face selectable, the kernel on its own thread.
Waiting for a decision or a bigger piece of work (each has a handoff entry that says more):
- **More than one body** (one is assumed everywhere: the kernel graph is one chain of steps); the bodies list is ready for it but shows Body 1; needs a design for how a second body is made, which one a step works on, and renaming.
- **Named stable references** for body parts (`dec_stable_references`): names are positions today; a push stores its face as numbers, edges are still found by position.
- **History panel** lists the steps (take one out, undo, redo); sketches and constraints are not steps so they are not in it yet.
- **Curved faces:** every curved face is selectable; only round posts and holes along a world axis can be pushed / pulled (diameter), and no curved face can be sketched on.
- **Constraints:** bubbles do not avoid overlapping geometry; relations between parts on different planes have no special placement; the step that uses a deleted figure is reported broken but not shown; the conflict flash names constraints found by leaving each out, not a minimal set.
- **Rotation angles** are one fixed order (X then Y then Z); a body turned about several axes has other equal ways to say it. Rotate, move and scale still make one step per drag (push / pull, extrude and fillet / chamfer are one step per operation).
- **Keys:** none for now (`in_131`); to be chosen later (tools, operations, views).
- **Confirm `dec_interaction_spec`** (still provisional; parts of it are older than the current look, for example the compass).
- **Blueprint, later:** STEP export, assemblies, threads, AI generation (`docs/origin/CAD_Blueprint.original.md`).

