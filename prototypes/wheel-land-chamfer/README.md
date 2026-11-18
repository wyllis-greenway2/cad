# wheel-land-chamfer (prototype, `in_928`)

**Meant to learn:** whether the edge chamfer of a worm wheel can be made inside its land (the straight part at each face), where the kernel's own chamfer of the faces' edges cannot (it returns nothing after 6 to 29 s: the faces are cut by the worm's envelope and the rest is throated), by pulling the end section in by the chamfer and lofting.

**Run (from `app/`):** `Z=30 C=0.5 node ../prototypes/wheel-land-chamfer/inset.mjs` (module 2, the worm 20 mm, 9.6 wide).

**Method.** The wheel's end section (`wheelSections`, a chain of arcs, counter-clockwise) is pulled in side by side: each corner moves `c` along the bisector of the two normals there, divided by the cosine of half the turn (a miter); each side becomes an arc of the old radius less `c` (a tooth's tip) or plus `c` (a root) through its new ends. Then (in the app, `wheelinset.ts`, `chamferBody` with `one`) a ruled loft from the inset section at the face to the full one a chamfer in, the rest of the land straight, sewn to the throated part before the worm's envelope is cut out.

**Learned (2026-11-18):**

| teeth | chamfer | area of the section | expected (area less chamfer times perimeter) |
|---|---|---|---|
| 30 | 0.3 | 3042.6 -> 2930.7 | 2930.8 |
| 30 | 0.8 | 3042.6 -> 2745.0 | 2744.4 |
| 60 | 0.8 | 11762.4 -> 11157.0 | 11156.8 |

- The pulled-in outline has the same number of sides and the right area to a few hundredths of a per cent. The points of it stand 0.06 to 0.17 mm from the old outline's samples where a chamfer of 0.3 or 0.8 asks for exactly that: the miter at a corner is further than `c` (as it must be); the samples are 0.1 mm apart.
- In the app (30 teeth, land 4 or 2, chamfer 0.5): one valid body, as thick as before, 94 mm3 less (the lands' edges), 8.9 s against 8.4 s for the land alone. A chamfer of 1 mm is refused with why (a tooth's tip is under 2 mm wide: the pulled-in side would turn round).
- A wheel of 12 teeth cannot be worked out at all (`wheelSections`: no whole gap), with or without a chamfer.
