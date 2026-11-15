---
id: dec_edits_saturate
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_383, in_386
date: 2026-11-15
depends_on:
  - dec_direct_modification: edits stay a list of specific operations built from kernel pieces (booleans, prisms, wedges, rings); this entry adds to the list and does not rebuild bodies from planes
  - dec_modifications_are_steps: every new edit is a step with parameters, replayable and editable like the others
  - dec_kernel_hybrid: the kernel stays OpenCASCADE behind the operation graph; only what the operations mean changes
alternative_to:
---
# Edits that are valid geometry are not refused: face kinds, the feature behind a face, and fillets as removed regions

`in_383` found edits that are valid geometry and were refused (a fillet past the size where it reaches the corners of the faces next to it; a hole that cannot be moved through the skin in front of it; a chamfered top that cannot be pulled up into a pyramid), and asked for a simpler model with fewer edge cases. `in_386` approved options **A** and **B** of the question that followed, and asked for **C** to be a later project.

**The model.** An edit is a **set operation on regions**, and its numbers **saturate**: past a limit it adds or takes nothing more, it does not fail. A refusal is left for real constraints (a locked length) and for an edit that would leave nothing of the body. Built on OpenCASCADE's booleans, with simple solids (slabs, wedges, prisms, rings) made for the purpose.

**A (built, `in_386`).** (1) A push or pull of one **flat face** has three kinds, chosen on a chip beside the number (`ui/facekindchip.ts`): *Move* (what it did: the step that made the face changes), *Extrude* (a prism of the face's outline is added or taken), *Extend* (the face moves and the faces next to it are carried on as surfaces until they meet: the kernel operation `faceExtend`, a step `pushPull` with `extend: 1`; the slab between the old and the new plane is kept to the side of each neighbouring flat face that the body is on, and for a neighbour that rises above the face (a pocket wall) to the other side; past the point where the neighbours meet nothing is added, and a push inward that would leave nothing is refused). Extend needs flat neighbours. (2) The **wall of a hole or a post** (a face that a circle made) is **moved or turned by moving or turning that circle** (`figureBehindFace` in `faceedit.ts`, used by `startOp` for Move and Rotate): along the axis it sweeps the hole through the part, across it slides it, turned it tilts it, and the steps after it are worked out again.

**B (to build).** A fillet or chamfer of a straight edge between two flat faces, and of a rim, is made as a **removed region** (a convex edge: the wedge between the faces outside the rolling cylinder or the bevel; a concave edge: the region added), so it has no size that fails: past the size where the rounding would stop touching the faces tangentially it cuts the faces next to it. OpenCASCADE's fillet stays for edges between curved faces, with its refusals and the neighbour retry of `in_379`.

**C (later, with our own kernel).** Rebuild bodies from their surfaces (half-spaces, cylinders) so that every number saturates by construction, and kinds of face edit that need it (extend across curved neighbours). It is a second geometry engine, which `dec_direct_modification` rejected for now; it belongs to the project of writing our own kernel (`dec_kernel_hybrid`, "our own later"). Listed in `docs/roadmap.md`.

**Not decided:** a variable fillet (the library has a start and an end radius per edge, not a radius at several points; untested where a constant radius fails).

## Rationale

The refusals all came from one thing: the old operations are patches on the faces and edges that exist and fail where the patch would change which faces exist. Saying what an edit means as a region makes the limit part of the answer. Built on the booleans we already use, it needs no second engine, and `in_386` chose it over rebuilding from surfaces.
