# face-modes: spike 8 (mode 3 "move with neighbours" and mode 4 "offset", `in_1495`)

**Meant to learn:** can the two pull modes of the spec (E32, "Face pull modes") be built on the booleans we have, exactly, valid, and equal to the same part made fresh; where do they refuse. Throwaway (CLAUDE.md rule 9). Run `node spike_mode3.mjs`, `node spike_mode4.mjs` (OCCT of `../lineage-occt`).

## What it learned
**The method for both:** the move of a face is a **region**: the tool is the slab (flat face) or the ring (cylinder) between the old and the new surface, **kept on the side of each neighbouring face's plane where the face lies**; it is added when material is gained (`d > 0`) and taken when it is lost. A neighbour's plane is carried on by being the boundary of the tool. No face is patched; the body is the old body plus or minus the tool, then the same-surface faces are joined.

**Mode 3, the flat face** (`spike_mode3.mjs`, all neighbours flat):
- A plain block's top moved +5 and -4: exact volumes (18000, 7200), 6 faces.
- **The chamfered block of the human's example** (40 x 30 x 10, top edges chamfered 3): top moved +2, +5, +10, +11.9 equals the analytic volume to three decimals (12816.667, 14202.667, 15099.333, 15149.899), the chamfer faces grow, the top shrinks (600, 336, 56, 2.04 mm2), 10 faces throughout. Moved down: -1 gives a top of 936 mm2 (the chamfers shrink), -3 reaches the chamfers' foot (6 faces, the chamfers are gone), -5 is a plain cut.
- **The collapse distance** is found by halving: **12.0000** (the 30 mm side: 30 - 2 x (3 + 12) = 0); past it the face has collapsed and the move is **refused** (at +12.5 the tool is a roof with no flat top; a volume check alone does not see it, the face at the new plane has to be looked for).
- A pocket's floor moved +2 and -3: exactly the pocket's area times the distance (11600, 11100). A notch wall of an L-block moved +5 and -5, concave and perpendicular neighbours: exact (13000, 11000).
- **Refusals:** a flat face with a **round hole beside it** (a curved neighbour): "a neighbour is CYLINDRE, not flat". The end wall of a block with a hole (the hole is not beside it) is exact.
- **The infinite half-spaces cannot be intersected with each other** (the kernel returns garbage, volume 6.7e8); the tool must start as a finite box far larger than the body, and each half-space is then cut from it.

**Mode 4, the cylinder wall** (`spike_mode4.mjs`): a hole's or a boss's radius changed by the ring between the radii, bounded by the neighbours' planes:
- Through hole r=4 moved to r 2.5, 5.5, 12; blind hole (floor beside the wall) to 2.5, 5.5, 10; a boss to 6.5, 3.0 and 0.1: **same faces as the part made fresh with the final radius, same volume to 1e-12**.
- Hole grown until it **breaks out of the block** on both sides (r 16, 17): same volume to 1e-11, one face of 12 not equal (the kernel's seam split of a cylinder again).
- A hole broken out through a side (the wall is two pieces at the seam): works when the other piece is taken as the same wall, one face fewer than the fresh part (the fresh one keeps the seam split); the first try refused it ("a neighbour is CYLINDRE").
- **OCCT's offset of one face is not available in this build** (`BRepOffset_MakeOffset`, which has `SetOffsetOnFace`, is not bound; `BRepOffsetAPI_MakeOffsetShape` offsets all faces). So mode 4 is **our own region construction**, as mode 3.
- Not done: cones, spheres, tori (the ring becomes a revolved profile), a cylinder with an axis not along Z (the spike), a neighbour that is not flat (refused), a cylinder wall whose neighbour is another surface kind.
