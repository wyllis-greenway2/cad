---
id: q_stable_reference_mechanism
kind: question
status: open
origin: ai-unreviewed
human_input: in_546, in_558
date: 2026-11-16
depends_on:
  - dec_stable_references: that entry decided the idea (names by how things were made, geometry as the fallback); this asks how it is built
alternative_to:
---
# How faces and edges get names that survive earlier edits (the mechanism for `dec_stable_references`)

**Why now (`in_558`):** it is item 5 of the order of `in_546`, and inserting a step in the middle of the history, and a sketch that follows its face (`dec_sketch_recipe_synced`), both need it.

**What is true today (looked at, `in_558`):** the faces and edges of a body are named by **where they are in the body as it is now** (`b/body/f@nx,ny,nz,d`, `b/body/e@a~b~m`, `b/body/c@...`; `compiler/body.ts`). A step keeps its face as numbers (`faceParams`) and a relation keeps a description of its circular edge (`anchors`, `in_309`). Checked on a block: a fillet of the top edge, then the depth of the extrusion changed from 10 to 14, kept the fillet (volume 1397.85 = the block with one 1 mm fillet along a 10 mm edge): the geometric fallback follows a simple change. What it cannot be trusted with is a step that is **put between** two others, or a change that moves two faces onto each other, because the name is the place and the place is what changed. The kernel gives no label for a face (`KernelFace` has a normal, an offset and a surface type, no origin).

**The options**
- **A. Labels carried by the kernel's own history (OCCT `Generated` and `Modified`).** Each operation of the interpreter reports what each face of its input became. Exact, also for splits and merges. Large: every operation of `interpreter.mjs` (and the region round, which makes its own booleans) must report; it ties names to OCCT, against `dec_kernel_hybrid`'s aim that names do not depend on the kernel.
- **B. Names carried by matching, outside the kernel.** After each step, the faces of the new body are matched to those of the body before it (same kind of surface, same plane or axis after the motion the step is known to make, the area that overlaps), and each keeps its name. New faces get a name from their step and their role (an extrusion's start, end and one side for each edge of the sketch; the round of a named edge). No kernel change. Wrong in the rare case two faces swap places or a face splits; there the old geometric fallback is used and the step is shown as "matched by place".
- **C. B first, A later where B is not enough.** What `dec_stable_references` already says ("OCCT's own history ... may be added later for the cases naming cannot follow").

**Recommendation (not decided): C.** First: roles from the sketch-based operations (`extrude`, `revolve`, `loft`, `sweep`) and matching carried through the other steps; steps store the name next to the numbers they keep now; a test that puts a step between two others and one that changes an earlier number and checks that a later push and a later fillet stay on the same face and edge; then the insertion itself (a step added at the cursor, the later steps made again). Existing files keep working: a step with no name uses its numbers as it does now.

**Asked of the human:** is C the way to go, or A (exact but large and tied to the kernel), or B alone?

## Rationale

Written so the choice is the human's: it changes a core part of the model (how every later step finds what it works on), the options differ much in size and risk, and the app works today for simple edits. Nothing is built for this yet.
