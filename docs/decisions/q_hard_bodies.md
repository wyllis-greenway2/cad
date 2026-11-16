---
id: q_hard_bodies
kind: question
status: open
origin: ai-unreviewed
human_input: in_472
date: 2026-11-16
depends_on:
alternative_to:
---
# Hard bodies: bodies that collide

`in_472` asked whether bodies that cannot pass through each other ("hard bodies") are possible and feasible, as a natural real-world constraint for interlocking parts, or whether it takes a whole physics engine. Nothing is built; this is the AI's answer and proposal.

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

**Recommendation:** build it in that order. Say go ahead, and whether the tolerance for fitted parts should be a number set once for the model or on each body.

## Rationale
It adds a property to bodies and a rule to every motion, so it is asked before it is built.
