---
id: dec_per_body_checks
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_701, in_726, in_729, in_737
date: 2026-11-17
depends_on:
  - dec_gear_speed: the measured cost this removes (each gear added to a model cost more than the one before, 0.8 s to 3.6 s for six, though its own extrude is 0.4 s); a change to those numbers changes whether this is worth its risk
  - dec_independent_bodies: a body is a solid that stands alone and is told apart by its identity, which is what the per-body work is kept by
  - inv_kernel_boundary: all of it is inside the kernel folder; the graph in and the result out are unchanged
---
# What is worked out of a body is worked out once for the body

**Asked (`in_701`, approved `in_726`):** adding a gear should cost what that gear costs, not what the whole model costs.

**Found (measured, six gears of 30 teeth added one after another, Node, each step the new gear's sketch and extrude):** the new body's own work (extrude, its validity and self-crossing checks, its mesh) was about 0.4 s every time; the rest grew with the bodies already there: the fingerprint of every body for the description cache (265 ms at six bodies), naming the edges of the whole final shape by listing the edges of every face (340 ms), the details of every face for naming (`surfacesOf`), the validity check of the whole compound, and, when a gear is pulled out beside the others, a boolean fuse of the new body with all of them (about 75 ms a step, growing).

**Built, each kept by the body's, face's or edge's identity (its identity number, and for a body a quick box; a face or an edge is only taken for the same when the kernel says it is the same shape, as identity numbers can be shared), as the body's exact box already was (`bodies.mjs`):**
1. **The fingerprint of a body** (volume, box, number of faces and edges) is found once for the body (`evaluate.mjs`, `lumpFacts`).
2. **The validity check of a compound** checks each solid on its own (the library checks the parts of a compound separately) and not again for one found valid before (`interpreter.mjs`, `isValidSolid`, `validSolids`); a single solid is checked as before.
3. **The edges of a face and the ends and middle of an edge** are found once (`facenames.mjs`, `edgesOfFace`, `itemOfEdge`); **what a face is** (its kind, direction, place, box) too (`surfacesOf`, `factsOf`). What is given out is a copy, so changing one answer does not change the next.
4. **A piece added whose box meets none of the bodies** (`joined`) is a body of its own: the compound of them, with no boolean on the others. A piece that does meet one is fused as before.
5. A new body is still checked, meshed, named and described in full: that is what it costs.
6. **A body's own solid is kept under what it was made from, not what came before it** (`in_729`; `interpreter.mjs`, `extrude`'s `toolOf`, `prisms`): a step's kept answer is keyed by the steps before it, so a change to an early gear made every body after it be built again (8 gears: 9 steps, 4.0 s). The solid a step makes of its own sketches (the prism, with the roles of its faces by the sketches' own edges, which are replayed when it is found again) is now kept under a key of its sketches' answers, its depth and the named parameters, so the later bodies are the very same solids as before, and everything kept for a solid (validity, no self-crossing, mesh, the details of its faces: all now by the solid, also for a single solid: `isValidSolid`, `crossesItself`) is found again. Only the body that changed is built.

**What is not changed:** the results. The kept answers are the ones working it out again gives (`test/perbody.test.ts`: the names of the edges and faces are the same cold and kept; two gears apart have the volume of one twice; touching gears are one body with the volumes added; a compound of valid solids is valid).

## Measured

Six gears, one after another: **13.8 s to 9.2 s** in all. The last gear's step: fingerprints 265 to 56 ms, the kernel's naming of the final shape 340 to under 100 ms, the fuse gone. The cost of each added gear (ten gears): 1.5 s for the second to 2.7 s for the tenth, a rise of about 0.13 s a gear where it was 0.55 s a gear (0.9 to 3.6 s over six). What still rises is mostly outside the kernel (the page's scene is derived from every part again at each edit, `withDerived`, which grows with the 700 or so parts a gear sketch has) and the work a new body is owed.

7. **Naming the faces and edges is per body** (`in_737`; `facenames.mjs`, `infoOf`, `surfacesOf`, `nameEdges`): the faces of each solid, what each face is, and the names of the solid's edges for the names its faces were given, are kept by the solid (its identity, and only for the same solid), so a step that adds or changes another body no longer looks through the faces and edges of every body. An edge lies between two faces of one body, so each body's edges are named from its own faces and the lists are put together in the order of the bodies; the answer is the one the face by face way gave (`test/perbody.test.ts`, `test/prismkept.test.ts`: the names of faces and edges are the same kept and worked out from nothing). Editing the first of 16 gears: 2.8 s to 1.9 s; the last: 1.83 s to 1.59 s.

**Measured (`in_729`, Node, 30-tooth gears):** an edit to the first gear: 8 gears **4.0 s to 1.5 s**, 16 gears **10.5 s to 3.3 s** (the fingerprints 826 to 89 ms, the checks and the builds of the later bodies gone). Editing the last of 16 is 2.0 s, of which about 0.65 s is the changed body's own work (describe 0.3, self-crossing 0.2, validity 0.1, prism 0.07) and the rest grows with the model, in proportion: naming the faces and edges (0.3), the fingerprints (0.07), the page's parts (0.25). `test/prismkept.test.ts` (3 tests: an early edit builds one body and finds three kept; the kept answer's volumes, face names and edge names are the worked-out answer's; a valid solid is found so again).

## Rationale

The costs that grew with the model were each the same shape: a pure function of one body (or face or edge) worked out again for all of them whenever one was added. Cutting them where they are made, by the identity the kernel already uses to tell bodies apart, loses nothing so long as an identity is never taken for another (hence the same-shape check on a hit) and what is given out is not shared.
