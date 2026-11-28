# Roadmap

Phases come from the human's blueprint (section 17). This file only tracks what is current.
Update it at the end of each session.

## Now
- **The clean engine in `app/`** is built under `dec_clean_engine_design` (accepted, `in_099`); the behaviours to reproduce are `dec_interaction_spec` (still to be confirmed by the human), the relations rules `dec_relations_standard` (provisional except the mover rule), no sketch isolation `dec_no_sketch_isolation`, ownership `dec_constraint_ownership`.
- **The eight phases of the clean engine are done** (131 tests; `cd app && npm run check`): core, compiler, picking, view, input, drawing and operations, relations UI, and the cut over (save and open, autosave, conformance suite moved, README). Run it: `LAN=1 bash tools/preview.sh`. **Next: the human tries it on the mouse, trackpad and phone**; then the features listed in Handoff 090 (compass and panes, grid on the straight plane, kernel in a worker, history panel, push and pull, named references).
- `prototypes/cad-ui` is frozen (its README says what it taught); `bash tools/preview.sh cad-ui` still runs it.

## Pinned to do (rebuild in `next/`)
- **Move / turn a body, what is left** (`dec_task_handles`, `in_1610`): moving one of several bodies (the step names the body by an `Id`, the page holds a string), numbers for a move on the info bar, the orb's own axes with the pull arrow's screen-based gain (`pullDelta`), grab (press a body and drag), a second move of the same body merged into the earlier steps.
- **Marks on the things instead of the info bar for a sketch** (`dec_marks_on_things`, `in_1611`): built (`in_1612`, `in_1613`): the drawer, the rule, the drawing numbers on the figure, marks on the part and draggable; the human is to see it; see the entry.

- **Group B of body manipulation, waiting for the human** (`in_1720`): before building, agree the rule that an operation adds only a description, chips, number fields and a `plan` (no new handle, render type, controller or overlay; anything that would is a question first), and generalise `Operation.value` to a list of named numbers (count, angle, second distance) and "pick another thing" as `toolspec` needs. Candidates, least new first: hollow, scale, two-distance chamfer, mirror, pattern, revolve, round-wall radius, variable fillet, sweep, loft; need a new pick type (ask first): vertices, box select; multi-body mover. The human has not yet said which items are in B.

## Done
- Project record set up; `docs/licenses.md` written; `kernel-slice`, `sketch-extrude`, `cad-ui` built as prototypes (2026-11-04 and 2026-11-05): planes, sketching, constraints, extrude, fillet and chamfer, devices, the pencil look and the ring highlight; relations (distances) started.

## Later
- **Our own kernel (`dec_kernel_hybrid`, "our own later"), and with it option C of `dec_edits_saturate` (`in_405`):** bodies rebuilt from their surfaces (half-spaces, cylinders) so every edit's numbers saturate by construction, and the face edits that need it (extend across curved neighbours). A second geometry engine: not before the operations on OpenCASCADE (A and B of `dec_edits_saturate`) have been used and shown what is still refused.
- Blueprint phases 2-5 (solver feel, analytical fillets and STEP, polish, then AI generation, assemblies, threads).


## Not done yet (kept here so nothing is forgotten; update when one is done)
Done (`in_131`, `in_132`): scale for a drawn figure, dragging a corner of a drawing, lining up with corners while drawing, push / pull of several faces, curved body edges picked along the curve, `actions.ts` split, no letter keys, smaller semi-transparent handles, the bodies and history lists in the ⋯ menu, every curved face selectable, the kernel on its own thread.
Waiting for a decision or a bigger piece of work (each has a handoff entry that says more):
- **More than one body: built** (`dec_independent_bodies`, `in_270`..`in_278`): separate pieces are separate bodies (identity by markers), each selected, moved, turned, scaled, repeated and combined (add, subtract, intersect, keep) on its own; sketches on a body's face follow it; groups, repeats (`dec_repeat_parameters`) and select similar are built; STL export puts all bodies in one file by default (`exportScope` is the one place to change that). Known gaps: copy / repeat of a body with sketches on its faces is not specially handled; the smooth drag preview of repeats has not been looked at.
- **Named stable references** for body parts (`dec_stable_references`): names are positions today; a push stores its face as numbers, edges are still found by position.
- **History panel** lists the steps (take one out, undo, redo); sketches and constraints are not steps so they are not in it yet.
- **Curved faces:** every curved face is selectable; only round posts and holes along a world axis can be pushed / pulled (diameter), and no curved face can be sketched on.
- **Constraints:** bubbles do not avoid overlapping geometry; relations between parts on different planes have no special placement; the step that uses a deleted figure is reported broken but not shown; the conflict flash names constraints found by leaving each out, not a minimal set.
- **Rotation angles** are one fixed order (X then Y then Z); a body turned about several axes has other equal ways to say it. Rotate, move and scale still make one step per drag (push / pull, extrude and fillet / chamfer are one step per operation).
- **Arcs** have no constraints of their own yet (length is the chord's).
- **Next suggested:** a decision on named stable references; the history panel for sketches and constraints; then the blueprint items.
- **Keys:** none for now (`in_131`); to be chosen later (tools, operations, views).
- **Confirm `dec_interaction_spec`** (still provisional; parts of it are older than the current look, for example the compass).
- **Blueprint, later:** STEP export, assemblies, threads, AI generation (`docs/origin/CAD_Blueprint.original.md`).


Done (`in_143`): double click selects the object, triple click looks at the plane, lit axis button and eye button, centre vertex of a selected curve, layered ring menu (Sketch, Constraints, Shape, Move and repeat, Delete), new push / pull icon. Not done: remember the open category; show inapplicable constraints dimmed with the reason; check the animation on a phone.


## To verify later (`in_735`)
- **Straight bevel gear is an approximation** (`dec_bevel_gears`): the tooth is the Tredgold back cone tooth, not the octoid / spherical involute of ISO 23509 and AGMA 2005. To verify against the standards (or a maker's drawing of a real pair): the tooth form; the thickness split between pinion and wheel (Autodesk "Unit Correction Distribution"); the face width rule (KHK's "at least 10 m" against "at most R/3"); recommended backlash (ANSI/AGMA 2008-D11, AGMA / ISO tables); undercut limits and suggested pinion teeth (AGMA 937); pressure angles other than 20. Details in `q_bevel_gears`.
- Built (`in_755`): the mate placed at the shaft angle with its phase (Mesh gear on a bevel gear). Not built yet: moving a partner's centre when its tooth count is edited (spiral bevel, hypoid, crown, spiral crown and face gears are built since: `dec_spiral_bevel_gears`, `dec_hypoid_gears`, `dec_crown_gear_set`, `dec_spiral_crown`).
- **Crown gear built** (`dec_crown_gears`, `in_802`): Gear > Crown gear, a bevel record at a right pitch angle, straight teeth, a straight bevel pinion by Mesh gear (linked). Not built: a spur pinion (face gear), spiral teeth, a deeper root (a straight flank plane closes the gap at the inner end).
- **Other gears with second-hand or missing data:** timing pulley grooves (GT2, GT3, HTD 5M, HTD 8M: from a Misumi / Gates table, not a groove drawing or ISO 13050; HTD 3M, MXL, XL, T have no data), the ISO 606 sprocket outside diameter limits, the worm geometry (DIN 3975, ISO 14521, AGMA 6022), the clock gear standards (DIN 58400 / 58405), the ISO 53 basic rack, keyway tables beyond DIN 6885.
- **To do later (human, `in_1024`): get ISO 23509 (the full standard, not the preview; sections 6.2 and annex B "Pitch cone parameters", the hypoid geometry) and check the hypoid pinion's pitch angle against it** (`dec_hypoid_gears`, "Checked against the sources": the ring's cone matches Zarebski's three worked examples, the pinion's is 0.8 to 4.3 degrees larger, probably a difference in what is called the pitch cone). Needs the human to send the PDF.

