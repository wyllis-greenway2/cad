---
id: q_hub_spoke
kind: question
status: open
origin: ai-unreviewed
human_input: in_1212
date: 2026-11-19
depends_on:
  - dec_gear_models: the tool would be one more model in the Models menu, with the same box, edit and Size rules
---
# Hub and spoke tool: how it would work (proposal, not yet approved)

**Asked (`in_1212`):** a tool that makes hubs and spokes for wheels, pulleys or any round object; alone, or on a selected round object so it is made into that object. The human is not sure how it would work, so this is my proposal for them to change.

**Proposal (mine; nothing is built)**
1. **A Models item "Wheel"** (hub, spokes, rim as one printable body) with a box of numbers: outer diameter, rim width and thickness, hub diameter and length, bore, number of spokes, spoke style (straight bars, tapered, curved, solid web with round lightening holes, none) and spoke width and thickness. Size scales it as the other models do. Refuses what cannot be made (spokes thinner than the print minimum, hub bigger than the rim, bore bigger than the hub).
2. **Alone:** placed at the click as a new body, like the other models.
3. **On a selected round object** (a round face, a circular edge or a drawn circle) two readings are possible, and I need the human to choose which one (or both, as a switch in the box): **(a) Fill it:** the selected circle is the rim's outside, and the wheel is made inside it (a disc becomes a spoked wheel, a round pocket gets a wheel to fit it). **(b) Fit it:** the selected round shaft or hole is the bore, and the hub, spokes and rim are made around it.
4. **Grooves for pulleys** (V, round belt, timing belt) are not part of this first step: they belong with `q_timing_pulleys`, which is still waiting on the groove shapes.

**Status:** open; the first question to the human is which reading of "made into the object" they mean.

## Rationale
Kept as a question because the human said the behaviour is not settled and an AI proposal is not a decision.
