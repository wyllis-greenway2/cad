---
id: dec_contact_push
kind: decision
status: provisional
origin: ai-unreviewed
human_input: in_887, in_888, in_889, in_890, in_891, in_892
date: 2026-11-19
depends_on:
  - dec_hard_bodies: this builds on its mesh test, its "one hard body is enough" rule and its sliding; a change to them changes what is built here
  - dec_mechanism_motion: the push is a way for a played joint to move other joints, beside the couplings; a change to how motion is played changes where it plugs in
alternative_to:
---
# Contact push: a played body pushes the bodies it meets, which yield by their own joints

**Provisional: the AI's proposal, not approved.** It comes from the human's brainstorm (`in_887` to `in_891`): most of a mechanism is solved with joints and couplings, contact is for the key parts, one body is set to move, and the rest follows by constraints and collision.

**A correction first.** The AI had said the hard bodies were checked with the kernel's booleans and were too slow to use live. That is wrong: `dec_hard_bodies` is already built on the kernel's **mesh** (`operation/collide.ts`: a tree of boxes over the triangles, `collidesMoving`, `contactNormals`, `freePart`), the exact boolean is kept for the final answer only, a hard body already treats every body it meets as hard (`meets`, `in_490`), and a dragged body already stops and slides. What is not there is the next level that `dec_hard_bodies` names as not built: **pushing**.

## The model

1. **Layers.** Joints and couplings first (cheap, exact, nothing to tune); contact only for what is marked, as the last layer. With nothing marked, nothing changes from today.
2. **The push rule.** The played joint moves by a small step. If the moved body overlaps a body that is in the contact set, that body **yields**: it is moved along its own joint (a pin turns, a rod slides, within its stops) by the **smallest amount that clears the overlap** (the way it was going first, then the other way; found by doubling and halving). If it cannot clear (a stop, a wall, a body with no joint), the played joint stops where it was: a **jam**, said in words with the two bodies named. A joint may have a **rest value** it goes back toward when nothing holds it away (a spring, a pawl dropping into the next tooth).
3. **Who is in the contact set.** Three states for a body: **soft** (as now), **hard** (`dec_hard_bodies`), and **ghost** (never solid, for what is meant to pass through). A hard body that is pushed **passes its hardness on** to the soft bodies it touches, to a depth (open: 2 or 3 by default), so one marked body is enough for a simple mechanism and more are marked only where a chain is longer. Bodies joined by a mate are never counted as touching each other (a pin in its hole is in contact by design).
4. **A budget.** A cap on the depth and on the passes, and a time budget for a frame: when it is hit the motion stops with a message, never silently (a silent stop would make a wrong animation look right).
5. **Layered mechanisms.** Two layers of a mechanism rest face to face (the crank's plate under the wheel). The mesh test counts a face resting on a face as a hit (the nudge it uses to break ties goes one way), so only what stands in the same layer may be tested against each other: bodies are compared on the part of them that overlaps in height by more than a tolerance.
6. **Not physics:** no mass, momentum, friction or forces; things stop and start at once; a free body falling or sliding down a ramp is not covered.

## What the prototype showed (`prototypes/contact-push`)

The Geneva drive's wheel, with **no formula**, moved by the rule alone (the pin and the locking disc tested against the wheel with the existing mesh test, 1 degree of crank a step, the wheel yielding by the smallest clearing angle): for 4, 5, 6 and 8 slots, three turns each, no jam; the wheel makes a slot's step for each turn and is within about 3, 1.2, 0.9 and 0.4 degrees of the formula's value (the difference is the clearance each side of the pin: the pin presses one wall and the wheel follows it). Cost in Node on a shared sandbox CPU: about 2 to 5 ms a step on average with about 11 collision tests a step; the slowest steps were 13 to 80 ms (probably the first test of a body and garbage collection, not examined). One thing that did not work first: the crank's plate resting under the wheel was reported as a hit all the time (point 5).

## Open questions for the human

- The default depth of passed-on hardness, and whether ghost is wanted as a body state or only as a setting of a joint.
- Whether the rest value belongs on the joint (a number in its settings) or on the body.
- Whether this replaces the exact boolean for interaction while keeping it for the final answer (the AI's view: yes, in steps, the existing `hardCollision` is the seam, and the old and new tests are run side by side on the existing hard-body tests before anything is switched).

## Rationale

The human wants "set one body to move and the rest follows" without a physics engine. Most of it is already there (joints, couplings, the mesh test, the sliding); the missing part is a push rule that is bounded and explainable. The prototype shows the rule alone reproduces the one mechanism that had a hand-made formula, at a cost that looks affordable, which is the evidence for asking for approval. Nothing is built in the app.
