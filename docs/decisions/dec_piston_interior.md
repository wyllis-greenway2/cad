---
id: dec_piston_interior
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_1288, in_1297, in_1304, in_1306
date: 2026-11-20
depends_on:
  - dec_piston_shape: the interior is the second half of the piston's overall shape; the flats, the arch and the defaults are decided there
  - dec_piston_hollow: the bosses are the hollow piston's bosses, made round
  - prin_manufacture_agnostic: nothing here says how the piston is made; a rib and a round boss are geometry
alternative_to:
---
# Round bosses braced by a rib (the interior), and the arch and flats on by default

The human said (`in_1288`) to build the interior shapes and to have the skirt's arch and the pin flats on by default, and to keep cast and machined surfaces out of the modeler. **Built, assumed sizes** (the shapes are what the pictures show; no source gives their sizes):

- **Pin bosses** (a typed choice, default **Round, ribbed**; Block is the old rectangular pad): a boss **round the pin's axis** at each side of the rod, its radius the pin's radius, the pin's room and the boss reach (the wall's thickness), from the gap between the bosses out to the cavity's wall; and a **rib**, a thin plate across the thrust (0.8 of the wall thick: a typed number, 0 = auto), from the boss's centre up to the crown's underside, in the wide cavity and the narrow one under the ring belt. The block pads filled a rectangle; the round boss with a rib is about **20 per cent lighter** in a GX160 piston (a test measures it).
- **The pin height** leaves room for the boss: at least the larger of the belt's length and the crown's thickness, plus the boss's radius and 0.5 mm.
- **On by default:** the arched skirt and the flats, each made where there is room for it. **The flat starts 0.1 mm above the arch's top** (the two were one plane, and the kernel returned an invalid solid when they met exactly in the engine).
- **Checked:** the kernel's piston volume against a worked-out one, within 0.15 %, in every combination of the arch, the flats and the boss shape (the usual piston and a GX160); sections of the mesh show the rib alone above the boss and the wall off the pin's axis.
- **Not built:** ribs across the thrust under the crown, a bowl-shaped underside, lightening holes in the boss, a variable wall, the pin bore's chamfer; **cast and machined surfaces: the human's decision is to keep them out** (`prin_manufacture_agnostic`).

## Rationale

The human asked for the interior and the defaults. The round boss and the rib are the two things the underside pictures show (a boss round the pin, ribs to the crown) and are plain geometry; the arch and the flats are what most real pistons have, so they are the default.

## The flat with a ramp (in_1297)
The human showed two pistons and said the pin's flats were not right: the first has a flat whose top angles out to the full diameter before the oil ring; the second a deep cutout that returns to the diameter above and below, with ears reaching much lower. **Built first (the human: "go build the ramp flat first"):** Pin flats gained a third choice, "Flat with ramp" (now the default), with a typed ramp angle (0 = auto 30 degrees, assumed). The flat's top angles out and meets the skirt's face at the flat's end, so the flat no longer ends in a square step under the ring belt. **Not built yet:** the scoop (cutout returning to the diameter at top and bottom) and the long ears cut by a curve around the thrust axis; two questions to the human stand (does the scoop close below; does the arch stay as its own option).

## The scoop (in_1304)
The human: "build the scoop next, the arch stays as an option". Pin flats gained a fourth choice, **Scoop**: a flat floor round the pin (the pin's radius and a millimetre, each way) and a curved end above and below, each a circle tangent to the floor, running out to the skirt's face (0.2 mm past it, so no step is left). It returns to the full diameter at the top and the bottom, and the ring belt stays round. Typed: depth (flat depth; auto 0.04 of the bore, assumed), width, and the scoop's run (mm each end runs; 0 = auto, to the ring belt above and the bosses' feet below). The arch is its own option and can be on with the scoop. **Not built yet:** the ears much lower, cut by a curve around the thrust axis (a lower, curved thrust-pad edge); the existing arch is the only ear shape.

## The curved ears (in_1306)
The human: "build the ears next". The skirt style gained a third choice, **Curved ears**: the skirt's foot is cut up at each side of the pin along a curve seen from the thrust side (a cut through across the thrust, its section in the plane of the piston's axis and the pin's), so the thrust pads reach much lower than at the pin's sides. The curve is one circle tangent to the foot (a low ear), or, when the rise is greater than the run, straight up from where it starts and then a quarter circle to the skirt's face (the way the arch has straight sides). Typed: the rise (0 = auto, up to just below the bosses, as the arch) and where the curve starts across the skirt (0 = auto, 0.6 of the radius; assumed). The arch stays as its own choice; the two are not on together.
