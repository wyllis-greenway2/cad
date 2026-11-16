---
id: dec_hard_bodies
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_472, in_473, in_474
date: 2026-11-16
depends_on:
alternative_to:
---
# Hard bodies: bodies that collide, kept apart by one clearance for the model

`in_472` asked whether bodies that cannot pass through each other ("hard bodies") are possible and feasible, as a natural real-world constraint for interlocking parts, or whether it takes a whole physics engine. The AI's answer and proposal were approved as written, with one clearance for the whole model (`in_473`).

**Answer: possible, and it does not take a physics engine.** What is wanted is a *kinematic* rule, "a hard body may not overlap another body", checked while a body is moved or turned by hand, not dynamics (no gravity, forces, bounce, momentum, friction). The app already has the other half: a driven move is solved against the mates (`solveDriven` in `operation/matesolve.ts` takes the pose the pointer asks for and gives back the nearest pose the mates allow, with `blockedBy` naming what held it back, and the picture flashes red, `in_338`). Non-penetration is one more constraint of that kind, an inequality instead of an equality.

**How it would work**
1. *A flag* on a body: **hard** (saved in the file; shown with a small mark; a body that is not hard behaves as now).
2. *The test:* two hard bodies overlap when the volume of what they share is more than a small tolerance (the kernel's boolean `intersect` and `measureVolume`, which it already runs); touching faces share no volume, so flush and fitted parts are fine; a cheap check of the boxes first, then the exact one only for boxes that meet.
3. *In a drag:* the pose asked for is tested; if it overlaps, the body stops at the last free pose on the way (a search along the path between the last free pose and the one asked for, to the tolerance), the contact is flashed (the touching faces, as a mate's are), and a message says what it is against. A turn is the same along the angle.
4. *Then sliding:* with the contact's normal (the kernel's minimum distance between the two shapes gives the nearest points and so the normal) the part of the motion along the surface is kept, so a peg is pushed along a hole's wall instead of sticking; this is a second step.
5. *What it is not:* nothing falls or is pushed by another body; a body only stops. Pushing a chain of bodies is the next level and is where it starts to be a physics engine.

**Edge cases, and what I would do**
- *Typed and stepped changes* (a move by a typed number, a repeat, a mirror, a push / pull that grows a hard body into another): the same test, refused with the reason, as a move against a mate is.
- *Already overlapping when the flag is set:* allowed, with a message; the moves that reduce the overlap are allowed, the ones that increase it are not.
- *The history:* the rule is for the moment of editing; the steps record the poses reached. Replaying the history does not test them again (or an earlier edit that changed a size would break every later move), but a step that now overlaps is marked.
- *Clearance for printing:* a fit needs a gap (a hole 0.2 mm bigger than the peg); a per-body or global **clearance** (the bodies count as overlapping when closer than it) would let the model be the real size and the test keep the gap; this is the part that makes it useful for printed parts.
- *Cost:* exact booleans on bodies with hundreds of faces take tens to hundreds of milliseconds, too slow for every pointer move; so the test is run on the kernel's mesh (a bounding-volume tree of triangles, in the worker) for the drag and the exact boolean is kept for the final answer.
- *Mates:* a mate may put hard bodies in contact (flush faces); that is touching, not overlap. A mate that holds two hard bodies overlapping is reported as a conflict.
- *Sketches and groups:* sketches carried with a body follow it; a group of bodies moved together tests the group against the others, not against itself.

**Size:** the flag, the exact test, blocking a drag at contact with the flash and the message: about a session; sliding along contacts and the clearance: another; mesh-based speed for large bodies: another. No new dependency is needed for the first two (OpenCascade is there); a triangle-mesh tree is a few hundred lines of our own.

**Built (`in_473`, the first two of the three steps, the clearance one number for the model):**
- *The flag and the clearance:* `Scene.hard` (the names of the hard bodies) and `Scene.clearance` (mm, 0 = only going into each other counts), saved, set by the commands `setHard` and `setClearance` (undoable); the ring's *Hard body* (Shape; every body selected, off again when all are hard) and the ⋯ list's *Hard bodies: clearance …* (goes round 0, 0.1, 0.2, 0.3, 0.5, 1 mm).
- *The test (`operation/collide.ts`, pure):* triangle lists, a tree of boxes over the one that stays, proper crossings of a triangle by an edge (a face on a face, an edge or a corner on a surface are touches), the least triangle distance when there is a clearance (so a face resting on a face is a collision when the clearance is more than nothing), a body wholly inside another by a counted ray; the way a rigid motion goes (`partOf`: a turn about an axis with a slide, taken any part of the way) and `freePart` (24 steps along it so a thin wall is not stepped over, the last free one narrowed in 10 halvings).
- *The rule (`interaction/hard.ts`):* `hardLimit` for a group moved by hand against every hard body that stays (a pair already overlapping is left out so bodies can be pulled out of each other); the triangles come from the face meshes of each body; `limitedOp` for what releasing makes: a drag's move or turn taken only as far as it can go, a number typed that would run into another is refused with the reason, a body already against another says so. While dragging, the picture stops where the bodies meet (`frame.ts` `gpuMotion`) and the body it is against flashes.
- *Sliding along the contact (`in_474`):* a drag by hand (a move taken free, not along an arrow or typed) that meets a hard body goes on with the part of what is left of it that runs along the surface it is against (`hardMotion` in `interaction/hard.ts`): the surface's way is the sum of the normals of the triangles of the other body that the mover goes into (`contactNormal`: only those that face against the motion, not those it brushes), the part of the motion into it is taken out, the rest is made (a free-part search again, with the clearance less a hair so a body that is on the surface may run along it), and so on round a corner up to four times, stopping against the next hard body; the picture and the release (`limitedOp`) give the same place. A turn, a move along an arrow and a typed number still only stop (a slide off the axis of an arrow would not be the arrow's).
- *Not built:* moves by a repeat, a mirror, a push / pull that grows a hard body, and the history is not tested again when it is replayed (the steps hold the poses reached); a mate that holds two hard bodies against the rule; a motion held by mates is limited as the mates leave it only in the picture, not at release; a tree of the moving body for very heavy models (each step moves its triangles); a mark on a hard body.

## Rationale
It adds a property to bodies and a rule to every motion, so it is asked before it is built.
