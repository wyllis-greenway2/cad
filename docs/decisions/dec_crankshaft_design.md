---
id: dec_crankshaft_design
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_1252
date: 2026-11-20
depends_on:
  - dec_engine_model: the crank is the engine's driver and sets the stroke; its throw, the rod and the piston keep the exact slider crank
  - dec_rod_design: the split big end is what lets the rod go on a crank pin held between two webs
alternative_to:
---
# The crankshaft: two webs with counterweights, and Honda's crank pin

The human chose the crankshaft as the next part (`in_1252`). Built:

- **The crank pin is Honda's:** 0.44 of the bore (the service manual: 29.98 mm in a 68 mm bore, 25.98 mm in a 60 mm bore; the model's was 1.25 of the piston pin, an assumed proportion; now 30.0 mm for a GX160). The rod's big end follows it (its eye is the pin's radius plus 2.5 mm).
- **Two webs, the pin held between them** (it was a disc with an overhung pin): a lower web and an upper web, each a hub round the shaft, a boss round the pin, a neck between them and a **counterweight opposite the pin** (a disc 0.6 of the sweep radius across, its middle 0.4 of the sweep from the axis, so it reaches exactly the sweep the clearances are checked with). **ASSUMED**, as is the web thickness (the model's old one): no source gives a web or a counterweight.
- **The stroke's refusal changed:** the pin and the shaft may now overlap in plan (they are at different heights, joined by the webs, as in a real crank), so a stroke is refused only when the pin's circle would swallow the axis: the stroke must be at least the pin's diameter plus 3 mm. The old refusal (stroke at least the pin plus the shaft plus 3 mm) would have refused a real GX160 (it needs 51 mm; Honda's stroke is 45).
- **Not built:** the crank's balance (the counterweight's size is not worked out from the masses), a second main bearing and a block that carries it (the top web has a flat top: the block is the next part), oil passages, fillets between pin and web.

## Rationale

The human chose the crank. A crank pin whose size is Honda's and a crank that holds the pin at both ends are what every real crank has, and the split rod from `dec_rod_design` needs the second. The counterweights are the one thing a real crank has that a disc lacks; their size is a placeholder until the masses are worked out.
