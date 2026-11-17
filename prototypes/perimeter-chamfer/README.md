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

**Not tried (an idea, untested):** the offset of an involute flank is an involute of the same base circle, so the outline of a gear **inset by c** is a gear outline with thinner teeth (half thickness less c / base radius), tip radius less c and root radius less c, with the same number of edges as the full outline. A **ruled loft** through four such sections (the inset outline at the bottom face, the full outline c up, the full outline c below the top, the inset outline at the top) would be a single solid with the perimeter chamfer built in, no boolean and no fuse, and the bore the same with its radius c bigger at the faces. It would cover spur gears and rings; a helical gear (a twisted sweep, not a ruled loft) would not be covered. A prototype would say how long it takes.
