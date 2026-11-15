---
id: q_edits_saturate
kind: question
status: open
origin: ai-unreviewed
human_input: in_383
date: 2026-11-15
depends_on:
  - dec_direct_modification: it says body edits are a list of kernel operations and that we do not rebuild bodies from their planes; this question asks whether that should change in part
  - dec_modifications_are_steps: any new edit is still a step with parameters, so the history and the parameters stay as they are
  - dec_kernel_hybrid: the kernel stays OpenCASCADE behind the operation graph; the question is what the operations mean, not the kernel
alternative_to:
---
# Should an edit's size saturate instead of failing, and should a face resolve to the feature that made it?

`in_383` (four files, a design question). Four refusals the human met, all of one kind: the edit would be valid geometry, but the kernel operation that makes it is a patch on the existing faces and edges, and it fails when the patch would change which faces exist.

**What was seen** (the files replayed headless): (1) a vertical fillet on a 13.5 x 13.1 block is refused from about 12.9 mm up, where the rounded edge reaches the corners of the faces next to it; (2) the hole in `cant_through_hole` is a cut step whose sketch plane lies 0.73 mm inside the front of the body, so a skin is left in front of it: the depth of the cut only moves its other end (every depth from 20 to 60 mm gives the same body), and the hole's wall cannot be moved (its push / pull changes its radius); (3) a fillet of the edge where a dome meets a tilted hole is refused above 0.9 mm; (4) a chamfered block can be made taller (the top face is pushed, the height of the extrusion grows, the chamfer goes with the top) but there is no way to extend the top face together with the sloping chamfer faces until they meet.

**The idea.** An edit is a **set operation on regions**, and its numbers **saturate** instead of failing:
- a fillet or chamfer of a convex edge removes a corner region (the wedge between the two faces, outside the rolling cylinder or the bevel); a concave one adds it. Any size is valid: past the size where the rounding would stop touching the faces tangentially it simply cuts the faces next to it, as an intersection of what is left;
- a face moved in or out can be **three** things, offered as kinds of the same tool (as `in_383` suggests): *extrude* (a prism of the face's outline is added or taken: a square growing out of the top square), *move* (what it does now: the step that made the face changes, the height grows with what is attached), *extend* (the face's plane moves and its neighbours are carried on as surfaces until they meet, intersected with what is there: the top of the chamfered block rises as a pyramid and, past the apex, nothing more happens and nothing fails);
- a face of the body **resolves to the feature that made it** (a hole's wall to the cut step and its sketch), and the handles on it edit that feature: radius, depth, and **position** (move or sweep the hole), which is what the history already holds as parameters.

**Where it stops.** Limits that are real constraints (a locked length) still refuse and flash. A fillet on an edge between two curved faces has no simple region to remove; there OpenCASCADE's own fillet stays, and its refusals stay (with the neighbour retry of `in_379`). A *variable* fillet: the library has a start and an end radius per edge (`FilletRadius = number | [number, number]`), not a radius at several points; whether it helps where a constant radius fails (3) is untested.

**Options.** (A) Keep the list of specific operations (`dec_direct_modification`) and add only the three face kinds and "move the feature behind a face". (B) A, plus fillets and chamfers of straight edges between flat faces and of rims made as removed regions, so they never fail. (C) Rebuild bodies from their surfaces (half-spaces and cylinders) in our own engine: every number then saturates by construction, but it is a second geometry engine, which `dec_direct_modification` rejected, and it works as long as the faces are planes and cylinders. The AI's recommendation: A first (the hole and the pyramid are cheap and need no new engine), then B for the cases with a clean region; not C.

## Rationale

Needed because the human asked for a model with fewer edge cases rather than a list of new ones, and the accepted entry `dec_direct_modification` points the other way for the part of it that concerns rebuilding from planes. The human decides whether and how far to depart from it.
