---
id: dec_self_crossing_check
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_472, in_473, in_484
date: 2026-11-16
depends_on:
  - dec_edits_saturate: a size larger than the part is made as a region that is cut (the fallback a refused round falls back to); this check is what refuses the kernel's own round
  - dec_kernel_hybrid: the check is the kernel's own, on its own thread, before an answer is given
alternative_to:
---
# A body must not pass through itself: the mesh of what an operation changed is looked at

**Decided (`in_473`, after the question `in_472`).** The library's own check (`BRepCheck_Analyzer`) says a body is valid when its faces close up, however they lie. A round larger than the wall of a hollow body made the kernel leave the hollow sticking out through the outer skin ("valid"), and a chamfer on a thin wall made by subtraction made the hollow vanish ("valid"). So, in addition:

1. **A mesh test (`occt/selfcross.mjs`).** The solids an operation made (not the ones it left as they were: the same solid is found again by its identity, which copies share) are meshed coarsely and their triangles looked at: two triangles that do not share a corner and are not in one plane **cross** when each has corners on both sides of the other's plane by more than a few times the meshing error, and the stretches of the line where the planes meet that lie in them overlap by as much. A crossing refuses the operation: `that would make the body pass through itself`. It is for any operation (not only rounds) except a plain move or turn; for a fillet or chamfer it is inside the round, so a refused round falls back to the region (`dec_edits_saturate`). The triangles the meshing leaves on the faces are taken off again (they would change what the library's check says of the same shape afterwards). A body of more than 600 faces is not looked at; a search that would take too long (more than 3 x 10^7 pairs, **or more than 1.5 seconds**) gives up and says nothing, so the check never holds the kernel up. (The time limit was added in `in_484`: without it the gear files' fillet of 60 edges did not come back in five minutes, the check being left to compare tens of millions of triangle pairs of a thin wide body; the pair budget alone did not bound it.)
2. **A cavity must be inside the outer shell** (`cavitiesInside`, in `isValidSolid`) and **a round must not take or add more than its size can** (`roundIsSane`): the cheap checks for the two cases found, which the mesh test does not replace (a body that lost its hollow does not cross itself).
3. **Separate bodies may overlap** (bodies are independent, `dec_independent_bodies`): each solid is looked at on its own.

**Not covered, said plainly:** a crossing shallower than the error of the meshing (about a third of a percent of the body's size at the coarse tolerance used) is not seen; triangles that share a corner are not compared (a crossing right at a corner); a body of more than 600 faces is not looked at.

## Rationale

The human asked that the kernel *generically* know when an operation takes a body into an invalid form (`in_472`), and a hollow made by the hollow tool and one made by subtraction broke differently, so a check per shape of damage would always be one case behind. Looking at the triangles finds a body passing through itself whatever made it. It costs a coarse meshing of the solids an operation changed (1 to 3 ms on a block; the lofts beside an edited block are not meshed again), which is why it looks only at what changed.
