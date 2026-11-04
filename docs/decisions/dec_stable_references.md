---
id: dec_stable_references
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_046
date: 2026-11-04
---
# References are names given by how things were made, with geometry as the fallback

The human chose option 2 of the former `q_topological_refs` (`in_046`): a later step refers to the faces and lines an earlier step created **by name**, for example "the top cap of the
extrusion made by step 1" or "the side that came from sketch edge 2", not by where they happen to be. Editing an upstream number (a height, a width) keeps the name valid.

Rules:
- Our own operations label what they create (an extrusion's start and end caps and one side per sketch edge; later, fillet and chamfer faces). The labels come from the operation's structure,
  not from the kernel, so they do not depend on which kernel runs (`dec_kernel_hybrid`).
- The kernel reports each face and line with its label in the plain-data result, next to the geometry it has now.
- If a name no longer resolves, the reference falls back to geometric matching (the current normal, offset and point, or end points and midpoint). A fallback match is shown as such,
  and a failed one is reported loudly in the history, never silently attached to something else.
- OCCT's own history (what each face became) may be added later for the cases naming cannot follow (a face that splits or is merged), behind the same interface.
- Proof required: change an upstream parameter and check that a downstream face move and a downstream fillet still attach to the right face and line (a test in the conformance suite).

Not built yet. Until it is, references are geometric only (a step fails with "face not found" when an earlier edit moves its face).

## Rationale

Editing an earlier step is the point of a parametric model. Geometric references break on the first height change; names built into our own operations survive it, work the same on any kernel, and
need no kernel history for the common cases. Keeping geometry as a fallback and OCCT history as a later option avoids committing to the hardest part before it is needed.
