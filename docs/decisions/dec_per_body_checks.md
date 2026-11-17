---
id: dec_per_body_checks
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_689, in_699
date: 2026-11-17
depends_on:
  - dec_gear_speed: the measured cost this removes (each gear added to a model cost more than the one before, 0.8 s to 3.6 s for six, though its own extrude is 0.4 s); a change to those numbers changes whether this is worth its risk
  - dec_independent_bodies: a body is a solid that stands alone and is told apart by its identity, which is what the per-body work is kept by
  - inv_kernel_boundary: all of it is inside the kernel folder; the graph in and the result out are unchanged
---
# What is worked out of a body is worked out once for the body

**Asked (`in_689`, approved `in_699`):** adding a gear should cost what that gear costs, not what the whole model costs.

**Found (measured, six gears of 30 teeth added one after another, Node, each step the new gear's sketch and extrude):** the new body's own work (extrude, its validity and self-crossing checks, its mesh) was about 0.4 s every time; the rest grew with the bodies already there: the fingerprint of every body for the description cache (265 ms at six bodies), naming the edges of the whole final shape by listing the edges of every face (340 ms), the details of every face for naming (`surfacesOf`), the validity check of the whole compound, and, when a gear is pulled out beside the others, a boolean fuse of the new body with all of them (about 75 ms a step, growing).

**Built, each kept by the body's, face's or edge's identity (its identity number, and for a body a quick box; a face or an edge is only taken for the same when the kernel says it is the same shape, as identity numbers can be shared), as the body's exact box already was (`bodies.mjs`):**
1. **The fingerprint of a body** (volume, box, number of faces and edges) is found once for the body (`evaluate.mjs`, `lumpFacts`).
2. **The validity check of a compound** checks each solid on its own (the library checks the parts of a compound separately) and not again for one found valid before (`interpreter.mjs`, `isValidSolid`, `validSolids`); a single solid is checked as before.
3. **The edges of a face and the ends and middle of an edge** are found once (`facenames.mjs`, `edgesOfFace`, `itemOfEdge`); **what a face is** (its kind, direction, place, box) too (`surfacesOf`, `factsOf`). What is given out is a copy, so changing one answer does not change the next.
4. **A piece added whose box meets none of the bodies** (`joined`) is a body of its own: the compound of them, with no boolean on the others. A piece that does meet one is fused as before.
5. A new body is still checked, meshed, named and described in full: that is what it costs.

**What is not changed:** the results. The kept answers are the ones working it out again gives (`test/perbody.test.ts`: the names of the edges and faces are the same cold and kept; two gears apart have the volume of one twice; touching gears are one body with the volumes added; a compound of valid solids is valid).

## Measured

Six gears, one after another: **13.8 s to 9.2 s** in all. The last gear's step: fingerprints 265 to 56 ms, the kernel's naming of the final shape 340 to under 100 ms, the fuse gone. The cost of each added gear (ten gears): 1.5 s for the second to 2.7 s for the tenth, a rise of about 0.13 s a gear where it was 0.55 s a gear (0.9 to 3.6 s over six). What still rises is mostly outside the kernel (the page's scene is derived from every part again at each edit, `withDerived`, which grows with the 700 or so parts a gear sketch has) and the work a new body is owed.

## Rationale

The costs that grew with the model were each the same shape: a pure function of one body (or face or edge) worked out again for all of them whenever one was added. Cutting them where they are made, by the identity the kernel already uses to tell bodies apart, loses nothing so long as an identity is never taken for another (hence the same-shape check on a hit) and what is given out is not shared.
