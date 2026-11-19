---
id: dec_hub_spoke
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_1214, in_1216, in_1222
date: 2026-11-19
depends_on:
  - dec_gear_models: the tool would be one more model in the Models menu, with the same box, edit and Size rules
---
# Hub and spoke tool: the Wheel model

**Asked (`in_1214`):** a tool that makes hubs and spokes for wheels, pulleys or any round object; alone, or on a selected round object so it is made into that object. The human is not sure how it would work, so this is my proposal for them to change.

**Proposal (mine; nothing is built)**
1. **A Models item "Wheel"** (hub, spokes, rim as one printable body) with a box of numbers: outer diameter, rim width and thickness, hub diameter and length, bore, number of spokes, spoke style (straight bars, tapered, curved, solid web with round lightening holes, none) and spoke width and thickness. Size scales it as the other models do. Refuses what cannot be made (spokes thinner than the print minimum, hub bigger than the rim, bore bigger than the hub).
2. **Alone:** placed at the click as a new body, like the other models.
3. **On a selected round object** (a round face, a circular edge or a drawn circle) two readings are possible, and I need the human to choose which one (or both, as a switch in the box): **(a) Fill it:** the selected circle is the rim's outside, and the wheel is made inside it (a disc becomes a spoked wheel, a round pocket gets a wheel to fit it). **(b) Fit it:** the selected round shaft or hole is the bore, and the hub, spokes and rim are made around it.
4. **Grooves for pulleys** (V, round belt, timing belt) are not part of this first step: they belong with `q_timing_pulleys`, which is still waiting on the groove shapes.

**The human's answers (`in_1216`):** a selected round object is **filled** (reading a). Spoke styles: not known; research them, with designs that **cast well** in mind.

**Spoke styles after a first search (`docs/sources/README.md`, "Wheel spokes and hubs"; snippets only, to be confirmed):** casting-friendly spokes are tapered from hub to rim, have an elliptical or oval section (major axis about twice the minor) or a tapered I/T section, large fillets where they meet hub and rim (thicker metal there), a little draft, no abrupt thickness change over about 2:1, and four or more spokes (the count is free). So the proposed styles are: **tapered oval spokes** (the classic cast pulley), **tapered flat bars**, **solid web with round lightening holes**, **straight bars**; curved spokes later. For printing the same rules (fillets, no thick lumps) also help; a 3D print needs no draft.

**Approved (`in_1222`):** the styles above and the build. **Built (first step):** `operation/modelwheel.ts`, the Models item "Wheel". One body: rim, spokes and hub. Styles: **Tapered** (spokes taper hub to rim, with fillet flares into hub and rim), **Flat taper** (trapezoid bars), **Straight** bars, **Web** (a disc with round lightening holes). Numbers: outside diameter (Size), rim width and thickness, hub diameter and length, bore, spoke count, spoke width at the hub and thickness. With a round object selected (a round face, a circular edge or a drawn circle) the tool starts filled: its diameter is the Size, centred on it and standing along its axis (Fill); with none, the first click places it.
**Honest limits:** the spoke section is a rectangle (axial thickness), not the oval a casting pattern has: the taper and the fillet flares are in the plan view only; no draft; Fill makes a **new body** on the circle and does not cut the disc it was selected on away (delete or hide that disc); no pulley grooves (`q_timing_pulleys`); proportions are rules of thumb and the print-size refusals are ones I chose.

## Rationale
The human approved the proposal and the styles (`in_1222`), and chose Fill (`in_1216`); the rest were my choices, listed above.
