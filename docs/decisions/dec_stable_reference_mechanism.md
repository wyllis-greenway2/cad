---
id: dec_stable_reference_mechanism
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_546, in_558, in_559, in_560, in_561, in_564
date: 2026-11-16
depends_on:
  - dec_stable_references: that entry decided the idea (names by how things were made, geometry as the fallback); this asks how it is built
alternative_to:
---
# Faces and edges get names that survive earlier edits: matching first, the kernel's history later (the mechanism for `dec_stable_references`)

**Decided (`in_559`): option C.** The text below is the question as it was put; the build follows C.

**Why now (`in_558`):** it is item 5 of the order of `in_546`, and inserting a step in the middle of the history, and a sketch that follows its face (`dec_sketch_recipe_synced`), both need it.

**What is true today (looked at, `in_558`):** the faces and edges of a body are named by **where they are in the body as it is now** (`b/body/f@nx,ny,nz,d`, `b/body/e@a~b~m`, `b/body/c@...`; `compiler/body.ts`). A step keeps its face as numbers (`faceParams`) and a relation keeps a description of its circular edge (`anchors`, `in_309`). Checked on a block: a fillet of the top edge, then the depth of the extrusion changed from 10 to 14, kept the fillet (volume 1397.85 = the block with one 1 mm fillet along a 10 mm edge): the geometric fallback follows a simple change. What it cannot be trusted with is a step that is **put between** two others, or a change that moves two faces onto each other, because the name is the place and the place is what changed. The kernel gives no label for a face (`KernelFace` has a normal, an offset and a surface type, no origin).

**The options**
- **A. Labels carried by the kernel's own history (OCCT `Generated` and `Modified`).** Each operation of the interpreter reports what each face of its input became. Exact, also for splits and merges. Large: every operation of `interpreter.mjs` (and the region round, which makes its own booleans) must report; it ties names to OCCT, against `dec_kernel_hybrid`'s aim that names do not depend on the kernel.
- **B. Names carried by matching, outside the kernel.** After each step, the faces of the new body are matched to those of the body before it (same kind of surface, same plane or axis after the motion the step is known to make, the area that overlaps), and each keeps its name. New faces get a name from their step and their role (an extrusion's start, end and one side for each edge of the sketch; the round of a named edge). No kernel change. Wrong in the rare case two faces swap places or a face splits; there the old geometric fallback is used and the step is shown as "matched by place".
- **C. B first, A later where B is not enough.** What `dec_stable_references` already says ("OCCT's own history ... may be added later for the cases naming cannot follow").

**Recommendation (not decided): C.** First: roles from the sketch-based operations (`extrude`, `revolve`, `loft`, `sweep`) and matching carried through the other steps; steps store the name next to the numbers they keep now; a test that puts a step between two others and one that changes an earlier number and checks that a later push and a later fillet stay on the same face and edge; then the insertion itself (a step added at the cursor, the later steps made again). Existing files keep working: a step with no name uses its numbers as it does now.

## Built so far (first slice, `in_559`)

- **Kernel** (`compiler/kernel/occt/facenames.mjs`, called from `compile` in `interpreter.mjs` when the graph says `names`): every flat face of a solid has a name; a name is carried through each operation by matching (the same plane and the same place on it, after the motion of a move, turn or scale, which is known to the operation); a face no name matches is new and is named `<op id>:<rank>`, the rank by the order of its normal and its place, so a change of a size gives the same names. The final names go out as `KernelResult.faceNames`. Nothing of OCCT's own history is used.
- **A step that names a face:** a push or pull keeps the name (`fname`) next to the numbers it kept before; the kernel finds the face by the name (`namedRef`): a name the body has lost is an error ("face not found ... is not a face of the body any more"), never another face; a step with no name, or a body with no names, uses the numbers as before.
- **The app:** a flat face of the body is a `Plane` part with `stable` (the name, found by `body.ts` from the kernel's names); `operations.ts` copies it into a new push or pull. The graph always asks for names (`names: true`), so a face has its name before a step uses it.
- **Cost:** 8 to 20 % more time in the kernel on the models measured (gear 2.2 to 2.4 s, hollow-pushed 0.9 to 1.0 s, face-edits 0.11 to 0.13 s).
- **Tests:** `test/facenames.test.ts`: names the same for any size; a push by name follows the top when the extrusion is made taller; a step put between two others (a move) does not change what a later step names; a lost name is an error; the same through the model.

## Edge names (`in_560`)

- An edge **between two flat faces** is named by the names of the two, sorted: `<a>|<b>`; where several edges lie between the same two faces (a face cut in two), each also gets `#<rank>` by its place. The names come from the face names at each operation, so nothing more is carried. An edge with a curved face beside it has no name yet (it uses its numbers as before). `KernelResult.edgeNames` has each with its ends and middle; a body edge `Line` part has `stable`.
- A fillet or chamfer keeps the names of its edges (`enames`, joined by `;`, in the order of its parts); the kernel finds the edges by name (`namedEdgeRefs`), also for the earlier steps it is made together with; a name the body has lost is an error (`line not found (... is not an edge of the body any more)`), never another edge.
- Face names are looked up by bucket (the main direction of the normal and the plane's offset), since a body of a thousand faces made the first version quadratic (`test/scaling.test.ts` caught it).
- **Tests:** the twelve edges of a block named the same for any size; a fillet by name follows the top edge when the extrusion is made taller and when a move is put before it; a lost name is an error; the same through the model.
- **The weakness above is fixed for extrusions (`in_561`, next section).**

## Roles from the sketch's edges, for extrusions (`in_561`)

- The graph's polygon sketch op carries `sides`: for each corner, the id of the drawn line that runs from it to the next (`loopSteps`, `graph.ts`). While an extrusion makes its prism (`OPS.extrude`), `figureRoles` (`facenames.mjs`) works out, from the sketch's edge ends, the extrusion's direction and the distance (no second prism: the first version built one and doubled the time of a gear), the plane of each straight side and of the two caps: `start`, `end` (the main figure only) and `side:<line id>`. A face that is new after the step and lies on such a plane is named `<op id>:<role>`; a face with no role keeps the rank name. The roles never fail a step.
- So a side is the same face when the sketch gains or loses a side elsewhere, or is resized; holes and sibling figures name their sides the same way. An arc side (a curved face) has no name yet.
- **Tests:** an L-shaped extrusion's sides named by their sketch lines (and their directions); the left side keeps `side:d/e6` when a corner is cut off elsewhere and the new side is `side:d/e7`; a pocket names its walls `x_b:side:d/p1..4` and floor `x_b:end` and the block keeps its six names; through the model, a drawn rectangle's faces are named by its four lines and are the same after a change of the depth.
- **Cost:** about 0.5 s more on a 60-tooth gear's extrusion (0.43 to about 0.8 s), most of it the matching of 250 faces; the gear's timing test (2 s) passes but with little room.
- **Not done:** revolve, loft and sweep faces still get rank names (a revolve's faces are mostly curved; a loft's and a sweep's flat faces need the same idea with their own sketches); arc sides.

## Round faces (`in_564`)

- **Cylinders have names** (`surfacesOf` in `facenames.mjs`): a round face is the same surface when its axis is the same line and its radius the same; a name is carried through the steps by that (and by the place on the cylinder), after a move, turn or scale (the radius scales). A new one is named by its sketch edge when an extrusion made it, else by rank. A cylinder the kernel made of two halves has `side:<id>` and `side:<id>#1`.
- **The extrusion's roles cover arcs and circles:** an arc side of a drawn shape or a drawn circle (one side of the sketch, two halves in the wire) is a round role found from three points of its edge; the graph gives the circle sketch its `sides`.
- **So the edges beside a round face have names:** a rim is `<top>|<wall>` (`#0`, `#1` for its two halves), so a fillet or chamfer of a post's or hole's rim keeps it through a change of the radius or the height and through a step put before it. Tested in the kernel and in the model (a post's rim filleted, the circle made bigger).
- **Speed:** the first version read each flat face's centre of mass, which integrates over the outline (90 ms for each of the two faces of a 60-tooth gear); a point of the face from its box is used instead. The gear's extrusion now takes about 0.2 s more with names (0.4 to 0.63 s). The gear and the 144-post timing tests are timing-sensitive under the load of the whole suite; they passed in the last run and had failed in the one before.
- **Not built:** a push or pull of a round wall (the radius change) still finds the wall by numbers; the faces a fillet or chamfer makes are named by rank (not by the edge they round); other curved faces (a cone, a sphere, a torus, a spline) and the edges beside them have no name.

**Not built (next, in this order):** (1) roles for revolve, loft and sweep (rank names until then), and the faces a fillet or chamfer makes named for the edge they round; (2) hollow's faces, a repeat's, the sketch's plane when drawn on a face; (3) a push or pull of a round wall by name; (4) the kernel's own history (option A) where matching is wrong (a face that splits, two faces that swap).

## Rationale

Put to the human as a choice because it changes a core part of the model (how every later step finds what it works on), the options differ much in size and risk, and the app works today for simple edits. Nothing is built for this yet.
