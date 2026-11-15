---
id: dec_edits_saturate
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_383, in_386, in_387
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

**B (built, `in_386`).** A fillet or chamfer of **straight edges between flat faces** is, when the kernel's own fillet cannot be made at that size, made as a **region** (`regionRound` in `interpreter.mjs`): the area between the two face lines and the rounding (the rolling circle, or the bevel) is a prism along the edge, **cut** from the body where the edge is convex and **added** where it is concave. There is no size at which it fails: past the size where the rounding stops touching the faces tangentially it crosses them (a convex corner is cut across the faces beside it; a concave one is filled as far as the faces go and no further, so nothing stands out as a wing). All the regions of one step are made from the body as it was. The step says so (a note: "could not be made as a smooth round at this size ... so the corner was cut as a region") and a size that would take all of the body is refused ("would take all of the body"). The kernel's own fillet is still tried first, so every size that worked before gives the same body, and it stays for edges between curved faces (rims, the edge of a dome and a hole), with its refusals and the neighbour retry of `in_379`. **B for rims (built, `in_387`).** The circle where a flat face meets a round wall about an axis at right angles to it (the end of a post or a hole, the foot of a post) is rounded or bevelled by a region made by **revolving** the corner area about the axis (`rimTool`), cut where it is the corner of the body and added where it is the foot of a post. A rim **saturates** at the largest size the faces beside it allow (the wall's height; the flat face's width, which for the end of a post is its radius, so past that the round is a dome), because a region crossing the axis or going past the foot of a post would cut into what is not the corner. Only a whole rim (the two halves the kernel makes of it are both chosen, as the tool chooses them). Straight edges cross the faces past their size (a convex corner), rims do not: the first is a cut across what is there, the second would be a drilled dent or a cusp on the axis.

**Variable fillet (built, `in_387`).** A fillet of **one edge** can have a size at its start and another at its other end (the library's `[r1, r2]`; the step has `value` and `end`; a fillet only: a chamfer has one size): a chip beside the number (Constant, Variable), two numbers (Start, End; Tab goes between them, or click either), the start end in amber. The start is the end `a` of the edge (the first point of its name). It is its own step (never rounded together with others). Where the kernel cannot make it, a straight edge between flat faces is made as a region between two profiles (a ruled loft, the cone the rolling ball makes), so a size at either end does not fail either. Not built: a variable chamfer (the library has none), a size at several points along the edge, a variable fillet of several edges at once, the loft for edges that are not straight.

**Not built:** B for corners where several rounded edges meet, and for an edge between a flat face and a curved one that is not a rim.

**C (later, with our own kernel).** Rebuild bodies from their surfaces (half-spaces, cylinders) so that every number saturates by construction, and kinds of face edit that need it (extend across curved neighbours). It is a second geometry engine, which `dec_direct_modification` rejected for now; it belongs to the project of writing our own kernel (`dec_kernel_hybrid`, "our own later"). Listed in `docs/roadmap.md`.

**Not decided:** a variable fillet (the library has a start and an end radius per edge, not a radius at several points; untested where a constant radius fails).

## Rationale

The refusals all came from one thing: the old operations are patches on the faces and edges that exist and fail where the patch would change which faces exist. Saying what an edit means as a region makes the limit part of the answer. Built on the booleans we already use, it needs no second engine, and `in_386` chose it over rebuilding from surfaces.
