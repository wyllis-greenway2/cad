---
id: dec_piston_interior
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_1280
date: 2026-11-20
depends_on:
  - dec_piston_shape: the interior is the second half of the piston's overall shape; the flats, the arch and the defaults are decided there
  - dec_piston_hollow: the bosses are the hollow piston's bosses, made round
  - prin_manufacture_agnostic: nothing here says how the piston is made; a rib and a round boss are geometry
alternative_to:
---
# Round bosses braced by a rib (the interior), and the arch and flats on by default

The human said (`in_1280`) to build the interior shapes and to have the skirt's arch and the pin flats on by default, and to keep cast and machined surfaces out of the modeler. **Built, assumed sizes** (the shapes are what the pictures show; no source gives their sizes):

- **Pin bosses** (a typed choice, default **Round, ribbed**; Block is the old rectangular pad): a boss **round the pin's axis** at each side of the rod, its radius the pin's radius, the pin's room and the boss reach (the wall's thickness), from the gap between the bosses out to the cavity's wall; and a **rib**, a thin plate across the thrust (0.8 of the wall thick: a typed number, 0 = auto), from the boss's centre up to the crown's underside, in the wide cavity and the narrow one under the ring belt. The block pads filled a rectangle; the round boss with a rib is about **20 per cent lighter** in a GX160 piston (a test measures it).
- **The pin height** leaves room for the boss: at least the larger of the belt's length and the crown's thickness, plus the boss's radius and 0.5 mm.
- **On by default:** the arched skirt and the flats, each made where there is room for it. **The flat starts 0.1 mm above the arch's top** (the two were one plane, and the kernel returned an invalid solid when they met exactly in the engine).
- **Checked:** the kernel's piston volume against a worked-out one, within 0.15 %, in every combination of the arch, the flats and the boss shape (the usual piston and a GX160); sections of the mesh show the rib alone above the boss and the wall off the pin's axis.
- **Not built:** ribs across the thrust under the crown, a bowl-shaped underside, lightening holes in the boss, a variable wall, the pin bore's chamfer; **cast and machined surfaces: the human's decision is to keep them out** (`prin_manufacture_agnostic`).

## Rationale

The human asked for the interior and the defaults. The round boss and the rib are the two things the underside pictures show (a boss round the pin, ribs to the crown) and are plain geometry; the arch and the flats are what most real pistons have, so they are the default.
