---
id: dec_gear_feature
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_690, in_716, in_825
date: 2026-11-17
depends_on:
  - dec_gear_speed: the measured cost this removes (about 80 parts a tooth: 16000 parts for 200 teeth, worked by every stage after the kernel); a change to those numbers changes whether this is worth its loss of editing
  - dec_gear_tool: the gear's record and the step that makes its body are what say a body is a gear's
  - dec_independent_bodies: a body is told apart by the name its step gave it, which is how a gear's body is found in the kernel's answer
---
# A gear's body is one feature: its two faces, its bore and the whole gear

**Asked (`in_690`: "open to treating the gear as one feature, probably the only selectable parts might be the surface to adjust thickness, and the bore", approved `in_716`):**

1. **Kept, as parts of the body:** the whole body (the gear), its two flat faces across the axis (to change the thickness), the bore (its round face and the two half rims the kernel makes of its circle) and a flat or keyway across the bore; for an internal gear (a ring) its round wall and the rims of it. Everything the kernel says of the teeth (the face of every arc of every flank, the edges between them, their corners) is **not** a part: the teeth are the body's surface, drawn as before (the mesh and its sharp lines are the kernel's, not the parts').
2. **Which bodies.** A body of the kernel's answer that was made by a step of a gear (`gearshape.ts`: an extrude of the gear's outline, a helical twist, a worm wheel's loft; not a worm) **and is wholly that gear**: its box is the gear's (the depth, no wider than the gear's outside diameter, centred where the gear is). A gear that has been joined to something, moved off its record, cut or put on a tilted plane keeps all its parts, as before: nothing is taken from a body that is more than the gear.
3. **What is lost.** A tooth's face or edge cannot be picked, filleted, chamfered or drawn on by itself. The numbers of the teeth are changed in the gear's box, as they were. A body that is more than a gear (rule 2) has them still.

## Measured

`test/gearfeature.test.ts`: a 40 tooth spur gear with a bore: 2892 parts of the body before (483 faces, 1443 lines, 966 corners), **8** after (the body, 2 faces, the bore, 2 rim halves, 2 corners); a ring the same; a helical gear and a worm wheel 8 or fewer; a gear of a hundred teeth 8.

In the real app (headless Chromium, a 100 tooth spur gear with a bore, extruded, orbiting and hovering): **8020 parts before, 2019 after**; the page's frame **17.5 ms before, 10.9 ms after** (working the frame out 9.3 to 3.7 ms). What is left of the 2019 is the gear's own sketch (a side and a corner for every arc of the outline, 20 a tooth), which the steps name and which is the next thing to cut.

## Audit of every gear kind (`in_825`; findings only, nothing is decided from them)

Measured with a 20 tooth, module 2 gear 8 thick (or the kind's own size) made on its own: the parts of its body (planes / lines / corners), and again after the things that happen to gears. `~` marks a kind that is not reduced.

| Kind | Parts of the body | Reduced? |
|---|---|---|
| spur, helical, ring, cycloidal, pulley, sprocket, bevel, spiral bevel, crown, worm wheel with no land | 2-3 / 0-3 / 0-3 | yes |
| spur with a perimeter (edge) chamfer | 3 / 44 / 84 | mostly: the chamfer's own rims stay |
| planetary set (5 bodies) | 15 / 10 / 10 | yes (each gear) |
| **worm** (rule 2: not a worm) | 25 / 63 / 41 (length 50); 36 / 99 / 63 (length 100) | no, the thread's faces |
| **worm wheel with a land** (the report: land 4) | **1169 / 2792 / 1632** | no: its body is the result of two subtracts, so it is not the body of the gear's step |
| **rack**, 10 teeth; 40 teeth; helical rack | 46 / 132 / 88; 166 / 492 / 328; 46 / 132 / 88 | no (flat faces, but a part for every tooth face) |
| **any gear moved or turned by a step** | **243 / 723 / 482** (a spur gear, 3 / 2 / 2 before the move) | no: its box is no longer the gear's (rule 2) |
| two gears joined (or a gear cut) | 470 / 1404 / 936 | no, by rule 2 |

So the rule is lost by the worm, the wheel with a land, the rack (three kinds), and every gear that has been moved or turned, which is the common case; the plain made-and-left gear keeps it. Also found: a worm with 3 starts, diameter 20, length 50 makes "kernel returned an invalid solid" (the plain one-start worm is fine).

**The wheel's options.** The Chamfer and Edge chamfer fields exist only for a plain gear and a ring; not for a rack, bevel, crown, worm, worm wheel, pulley, sprocket, clock gear or planetary set (the tooth chamfer is made by cutting wedges from the extruded body, and the perimeter chamfer by insetting its outline; neither was written for a throated, lofted or conical tooth).

## Rationale

The cost of a gear in the page is not its triangles but its parts: every stage after the kernel (naming, picking, the highlight, the scene's lists, the frame's loops) is worked by part, and a gear has eighty a tooth. A person picks a gear's faces to change its thickness, its bore, or the gear: the rest of the parts were never used. Cutting them where the parts are made, from the gear's own record and the body's box, loses nothing that is not named in rule 3 and falls back to everything when it is not sure (rule 2).
