---
id: dec_arc_wall_pushpull
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_257, in_258
date: 2026-11-10
depends_on:
  - dec_face_edit_by_step: pushing a face changes the step or the drawing that made it; what an arc wall's push means is another case of that rule
alternative_to:
---
# Pushing or pulling the wall of an arc of an extruded sketch changes that arc's radius (and which arc a wall belongs to is told by where it lies)

**CORRECTION (later in the session, `in_258`): my first explanation below was wrong, and the gap is fixed.** Arcs of a sketch already had push / pull (`arcWall`): the radius of that arc changes. What was missing was a case like a gear: several arcs on one circle (all the tooth tips) match the same radius and axis, so `wallOfCircle` found more than one and gave up. It now chooses the arc whose span the face lies in (`test/arcwalls.test.ts`, which fails without it). Original text follows.

**Why (from the code, `faceedit.ts`):** a curved face of the body gets a push / pull arrow only if the face is (a) the wall of a **whole circle** extruded (a post or a hole, along a world axis; pushing it changes that circle's radius), or (b) a fillet or chamfer face (its size). A wall that comes from an **arc** that is one side of an outline (a tooth's flank or tip) is neither: `sideOfSketch` skips every side that has a centre or a bulge, so no edit is found and the message says "this curved face can be selected but not pushed or pulled yet". It is a gap, not a decision. (The file attached to `in_257` holds the drawing only, with no extrusion in it, so I reasoned from the code and not from your body; a file with the extrusion would let me check which faces.)

**What it could do (proposal):** pushing an arc wall changes the **radius of that arc**, the way pushing a post's wall changes the radius of its circle: if the arc has a radius dimension, the number is changed (the tip arc of the gear, 14.5, becomes 15); the ends of the arc follow along the lines they sit on, which is what the sketch's own relations already say. If it has no dimension, the arc is made bigger or smaller with its two end corners kept, so it only bulges more or less. A flank that is a straight line already works (`sideOfSketch`). A side held by relations that forbid the change is refused with the constraints shown, as any change to a drawing is.

**Questions:** is "push = change the arc's radius, ends staying on their lines" what you would expect on a tooth tip and a flank? Should an arc whose centre is another part's centre (concentric) keep that centre (yes, in this proposal)? (Separate gap, not asked here: round faces that are not along a world axis, after a body is turned by an angle.)

## Rationale

Accepted, `in_258` ("I will take your recommendations on all"). What a push means for an arc is the proposal below, which was already how an arc wall behaved; the fix was to tell the arcs of one circle apart. `test/arcwalls.test.ts`.
