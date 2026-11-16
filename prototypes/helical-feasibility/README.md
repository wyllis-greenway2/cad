# helical-feasibility (prototype, `in_562`)

**Meant to learn:** whether the kernel can carry a gear outline (about 100 arcs, with a bore) along its own axis while it turns, using the existing twist about the plane's normal (`dec_spiral_extrude`), so helical gears can be made from the flat gear outline.

**Run (from `app/`):** `node --test ../prototypes/helical-feasibility/try.test.ts`

**Learned (2026-11-16):** it works, with no change to the kernel or the revolve step. A gear made by the gear command, its outline revolved about its own normal with `value` = twist (degrees) and `advValue` = width, for 12, 20, 40 and 60 teeth, with and without a bore, twists of 5.6 to 17.4 degrees:
- no errors, and the volume equals the flat extrusion's (within 0.0001 of it), as a screw motion must;
- it takes **1.2 to 5 seconds** (20 teeth: about 2 s; 40 teeth: 5 s; 60 teeth: 4 s). Every change of a number re-makes the body, so editing a big helical gear would be slow;
- the turn direction is the sign of the angle (the hand).

**Not tested:** the shape against a real helical gear (only the volume), meshing, a twist of a herringbone, the preview while the numbers are typed (the revolve's preview is a wireframe).
