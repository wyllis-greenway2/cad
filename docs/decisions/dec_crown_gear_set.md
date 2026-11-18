---
id: dec_crown_gear_set
kind: decision
status: provisional
origin: ai-unreviewed
human_input: in_878
date: 2026-11-19
depends_on:
  - dec_crown_gears: the set is that tool and its variations; the pinion, linking and body are that decision's
alternative_to:
---
# A set of crown gears (a recommendation; the human has said to take it, `in_878`, but has not seen it yet)

**Why the pinion does not stand at 90 degrees:** a crown gear with a straight bevel pinion has the shafts 90 degrees plus the pinion's pitch angle apart (`sin = pinion teeth / crown teeth`: 116.7 degrees for 18 and 40), because the pinion's cone must touch the crown's flat face along a line through the apex. That is the geometry, not a fault. **Recommended set:** (1) **Crown gear** (as built): straight teeth, a straight bevel pinion at that angle; (2) **Face gear**: a spur pinion at exactly 90 degrees, axes crossing (the usual right angle drive; the tooth is not a plane but the envelope of the pinion's involute, by the same gearing law as `prototypes/bevel-spiral-generated`); (3) later: a crown with curved teeth and a spiral pinion. **Polish for (1):** the box says the angle the pinion stands at; defaults that suit a print.

## Rationale

The human asked for 90 degrees; only the face gear gives it. It is a recommendation, so it stays provisional until the human has seen it; the face gear starts as a prototype (`prototypes/face-gear`), which needs no decision.
