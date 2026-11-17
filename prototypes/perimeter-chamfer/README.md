# perimeter-chamfer (prototype, `in_809`)

**Meant to learn:** whether a chamfer round the whole top and bottom perimeter of a gear (every edge of both faces: tips, flanks, roots, the bore's rim), meant for printing (the first layer's squash, `elephant foot`), is quick enough to offer, by the kernel's own edge chamfer.

**Run (from `app/`):** `Z=20 C=0.4 node ../prototypes/perimeter-chamfer/perimeter.mjs` (`Z=40` takes a minute).

**Method.** A spur gear (module 2, 8 mm, bore 5, the app's outline) made in replicad, and `chamfer(0.4)` on the edges of the bottom face, of the top face, and of both (`EdgeFinder.inPlane`). One run each on a shared machine.

**Learned (2026-11-17):**

| teeth | faces of the body | bottom edges | top edges | both | valid |
|---|---|---|---|---|---|
| 20 | 243 | 5.9 s | 6.1 s | 11.8 s | yes |
| 40 | 483 | 22.9 s | 23.4 s | 45.6 s | yes |

- It works (the result is valid, the volume is right, a chamfer face for every edge) and does not fail, but **the time grows faster than the tooth count** (20 to 40 teeth: four times as long), so 100 teeth would be minutes. Not "forever", but not something to offer as a quick field.
- The edge chamfer is the one this app already has for a body (`Fillet chamfer`): it works for simple shapes at once.

## The fast way (`inset.mjs`, `in_810`)

**Run:** `Z=40 C=0.4 node ../prototypes/perimeter-chamfer/inset.mjs` (`RING=1` for a ring).

**Idea:** the offset of an involute is an involute of the same base circle, so the outline of a gear **inset by c** is the same kind of outline: a profile shift of -c / m (tip and root radii each c less) and teeth thinner by 2 c (1 - sin a) / cos a (that is, flanks moved in by c along the base circle) in the app's own `gearOutline`, with the same number of sides. A **ruled loft** through four outlines (the inset one at the bottom face, the full one c above it, the full one c below the top face, the inset one at the top face) is one solid with the chamfer built in, no boolean on the gear: ruled between coaxial arcs is a cone, between lines a plane. The bore is a chamfered cone of its own. A ring is the same with its hole's outline (tips and roots c further out, teeth thinner) and the wall's circles (c less at the faces); the app's ring outline had no tip radius parameter, so the prototype writes the ring's outline out itself (checked equal to the app's to four decimals).

**Learned (2026-11-17, one run each, a gear of module 2, 8 mm, 0.4 mm chamfer):**

| | 20 teeth | 40 teeth | 100 teeth | the kernel's edge chamfer |
|---|---|---|---|---|
| spur gear, loft then a cut for the bore | 0.86 s | 1.75 s | 4.25 s | 11.8 s (20), 45.6 s (40) |
| **spur gear, shells sewn (no boolean)** | **0.43 s** | **0.99 s** | **2.96 s** | minutes at 100 |
| ring, wall minus the hole's loft | 5.7 s | 11.6 s | | |
| **ring, shells sewn (no boolean)** | **0.29 s** | **0.66 s** | | |

- **14 to 46 times quicker than the kernel's chamfer, and valid**: the volume is within 0.01 per cent of the kernel's own (9607.2 against 9608.1 mm3 at 20 teeth; 39619.5 against 39623.3 at 40) and the faces are the same number (725, 1445). A plain gear of 40 teeth takes 1.4 s to make in the app, so the chamfer built in costs about what the gear does.
- **The boolean is the part to leave out:** a ring made as a wall with the hole's loft cut from it took 5 to 12 s (the long cut); the same faces sewn into a solid took under a second. The shells are the loft's (`returnShell`), the hole's turned the other way, and two flat ends with their hole.
- **Limits:** a helical gear (a twisted sweep, not a ruled loft) is not covered; a bore with a flat or keyway would need its own inset outline (a round bore only here); the chamfer must be smaller than about half a tooth's thickness at the tip (the inset teeth would vanish); a feet-line (the short radial side under the base circle) is offset as if it were a flank, a slight error (under a few hundredths of a mm) that the volume does not show.

**To build it in the app (not started):** a gear's body step that takes the four outlines (as numbers: the outline's points and bulges for the full and the inset gear, from `gearOutline`) and makes the solid in the kernel as here, replacing the extrusion when a perimeter chamfer is asked for; the parts of the gear's sketch stay as they are (only the full outline is drawn).
