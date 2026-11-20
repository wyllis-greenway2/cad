---
id: dec_piston_crown
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_1269
date: 2026-11-20
depends_on:
  - dec_piston_maker: the crown's variables, made typed fields
  - dec_piston_hollow: the crown is the hollow piston's top; its thickness is measured at the flat edge, and a dish, bowl or relief must leave metal under it
  - dec_piston_skirt: the crown is the top of the turned outer profile
  - dec_engine_model: the block's head must clear a dome
alternative_to:
---
# The crown: flat, dome, dish or bowl, with an edge chamfer and valve reliefs

The human approved (`in_1269`). Built, **all sizes assumed** (the kinds are sourced: Kean's "flat, curved up or curved down" crowns, EngineLabs on dome and dish, the Caterpillar patent's bowl; no source gives a small gasoline piston's sizes):

- **Crown shape** (a typed choice, default **Flat**): **Dome** (a spherical cap up), **Dish** (a spherical cap down), **Bowl** (a flat-bottomed bowl with a sloped wall). A **height** (dome height or the dish's or bowl's depth, mm, 0 = auto: 0.04, 0.03 and 0.04 of the bore) and a **diameter of the shaped part** (mm, 0 = auto: 0.75 of the bore for a dome or dish, 0.6 for a bowl); the flat band outside it is the squish band. **The pin height stays the distance to the flat crown** (EngineLabs: "not inclusive of dome or dish").
- **Crown edge chamfer:** 0.004 of the bore (typed, 0 = auto).
- **Valve reliefs** (only in a flat crown): a typed number of pockets (0 to 2, default 0), each a round pocket **0.3 of the bore across** (0 = auto), **0.02 of the bore deep** (0 = auto), centred **0.25 of the bore** from the axis along the pin's axis (0 = auto). The GX160 is overhead-valve but no source gives its pockets, so none are on by default.
- **Refused:** a dish, bowl or pocket that would leave under 1.5 mm of crown; a shaped part wider than the crown's flat; pockets outside the crown or with a dome, dish or bowl.
- **The engine's block** leaves room for a dome (the head is raised by its height).
- **Not built:** valve pockets at an angle, a bowl off the axis, a bowl with a re-entrant wall or rounded corners, a variable squish clearance, the combustion volume and the compression ratio (the model has no head).

## Rationale

The human chose the crown. A crown that is a flat disc is the one feature that every real piston differs in; the shapes and the reliefs are what set the combustion chamber. The compression ratio would follow from them, but the model has no head to measure it against, so it is not computed.
