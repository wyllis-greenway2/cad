# wheel-tooth-loft (prototype, `in_854`)

**Meant to learn:** whether a worm wheel can be made faster by lofting **one tooth** (an open strip of its section's arcs through the five sections) and turning copies of it round, instead of one loft through the whole wheel's sections.

**Run (from `app/`):** `Z=100 node ../prototypes/wheel-tooth-loft/run.mjs`

**Method.** The app's own sections (`wheelSections`). (a) The whole loft with the compatibility check off (what the app does since `in_853`). (b) One tooth's open outline lofted as a shell (`ThruSections`, not solid), `Z` rotated copies, the two end caps made from the whole sections' outlines, all sewn (`BRepBuilderAPI_Sewing`, 1e-6) into one shell, made a solid. (c) A solid sector (the tooth closed through the centre) lofted, turned and **fused**.

**Learned (the kernel in Node, module 2, 24 mm worm, width 10):**

| teeth | whole loft | strips: loft + copies + caps + sewing | fused sectors |
|---|---|---|---|
| 40 | 0.9 s | 0.3 s (0.01 + 0.02 + 0.10 + 0.19) | **13.2 s** (22 s without glue) |
| 100 | 2.5 s | 0.9 s (0.01 + 0.04 + 0.32 + 0.53) | not tried |
| 200 | 5.5 s | 1.8 s (0.01 + 0.07 + 0.81 + 0.89) | not tried |

- **Fusing is a dead end** (13 s for 40 teeth, against 0.9 s for the loft): a boolean over coincident faces is the slow thing, glued or not.
- **Sewing strips works.** The sewn shell is a valid solid (`BRepCheck_Analyzer`), with the same number of faces as the whole loft (13 a tooth + 2 caps) and the same volume to 1e-8 (100 teeth 316371.2137 against 316371.2150; 200 teeth 1261144.757 against 1261144.763).
- The saving in the app would be about 1.5 s of 7.3 s at 100 teeth and about 3.7 s of 17.5 s at 200: the rest (sections, mesh, names, the validity check, `SameParameter`) is not touched.
- **What stands in the way of building it in:** the names of the wheel's faces (`facenames.mjs`, `loftRoles`) find faces by the hash of the section sketches' own edges; the copies of a strip are new shapes, so the names of every tooth but the first would have to be found another way (by the face's place), and the strips' wires have to be cut out of each section sketch's wire (its edges in order). Worth doing only if the names are rebuilt too.

**Not tried:** the caps made faster (they are 45 per cent of the strips' time: a face made from one wire of `Z` times 13 edges); a bored wheel; several starts.
