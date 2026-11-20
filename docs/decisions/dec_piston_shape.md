---
id: dec_piston_shape
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_1279, in_1287
date: 2026-11-20
depends_on:
  - dec_piston_maker: the piston's overall structure and shape, made typed fields
  - dec_piston_skirt: the arched skirt replaces the two-pad style's straight cut
  - prin_manufacture_agnostic: the shapes below are geometry; whether a surface is cast or machined is how a part is made, and is not the modeler's (see the open point)
alternative_to:
---
# The piston's overall structure and shape: what five real pistons show, and what is built

The human sent five pictures of real pistons (`in_1279`) and asked to finish the structure and shape of the piston itself. **What the pictures show** (my reading of them: a drawing of a piston, pin, rings and rod; a piston on its rod seen from the pin side; the underside of a forged piston; a wireframe with two valve pockets; a slipper skirt with an arched cutaway):

1. **The skirt's lower edge is curved**: the skirt is cut away at the two sides of the pin in an **arch**, leaving **ears** (pads) on the two thrust sides that reach further down.
2. **The pin bore does not run out to the skirt's full radius**: it ends on a **flat boss face** (a flat or pocket in the skirt round the pin) with a chamfer or spot-face, the circlip groove inside it.
3. **Inside:** the bosses are shaped (rounded, braced to the crown by **ribs**), the cavity has curved arches under the crown, the walls vary in thickness.
4. **Cast and machined surfaces:** the surfaces that are machined (the ring grooves and lands, the skirt, the pin bore, the crown's top) and those left as cast (the inside, the boss faces).

**Built** (stage 6): (1) an **arched cutaway** with ears: the two-pad style's cut is now an arch (a circular arch, or a semicircle on straight sides when it is tall), its height typed (0 = auto: up to just below the bosses); (2) **flats round the pin**: a typed Pin flats choice (None, Flat), its depth below the skirt's face (0 = auto 0.02 of the bore) and width (0 = auto: the boss and a millimetre either side); the circlip groove is placed from the flat. **Not built yet:** (3) the interior: rounded bosses and **ribs** to the crown (proposed next); the pin bore's chamfer; **(4) is not the modeler's to build:** that a surface is machined or cast is how the piston is made, which `prin_manufacture_agnostic` keeps out of the modeler (a separate manufacturing module is to take a finished model and a route); **a question for the human** is in the reply.

## Rationale

The pictures show what a real piston has that this one lacks. The arched skirt and the flats are geometry the modeler can build now; the interior ribs are geometry too, but a larger change (the bosses' shape and the volumes); the cast and machined surfaces are the one request that meets the human's own principle, so it is asked, not built.

## Stage 7 (`in_1287`): on by default, and the interior

The human asked for the arched skirt and the pin flats **on by default** and for the **interior shapes** to be built; and said **cast and machined surfaces stay out of the modeler** (manufacturing agnostic, for now). **Built:** Skirt style defaults to Arched pads and Pin flats to Flat (each is made where the piston has room: a piston too small for an arch or a flat has none, as the box says; a number typed for them is held to, a refusal if it cannot be made); the pin bosses are **round with a rib** by default (a boss round the pin's axis at each side of the rod, braced to the crown by a thin rib; the old block pads are the other choice), the rib's thickness typed (0 = auto, 0.8 of the wall); the pin height leaves room for the boss under the ring belt. See `dec_piston_interior`. **Cast and machined surfaces: not built, by the human's decision** (`prin_manufacture_agnostic`).
