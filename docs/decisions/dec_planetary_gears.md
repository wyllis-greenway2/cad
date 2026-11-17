---
id: dec_planetary_gears
kind: decision
status: provisional
origin: ai-proposed-human-approved
human_input: in_762, in_761, in_736
date: 2026-11-17
depends_on:
  - dec_gear_tool: the sun, planets and ring are ordinary gear records (made, meshed, edited and extruded as any gear); a change to how a gear is a record changes the set
  - dec_spiral_extrude: a helical set's bodies are that decision's twist, made by the gear records
  - prin_manufacture_agnostic: nothing per manufacturing route (no print clearance presets); the pin gap is a number the person sets
alternative_to:
---
# A planetary set that keeps its numbers

**Approved (`in_762`, after `in_761`):** the human asked for a planetary gear maker and answered the design questions: either the teeth or the ratio is given and the other follows; the carrier plate is optional; the set is a feature that keeps its numbers and Edit gear edits the whole of it as it was made; spur and helical; the ratio is shown for each part held; the carrier is a plate with a pin at each planet (thickness, pin diameter and clearance set by the person); each planet is a body of its own.

**Built (`operation/planetary.ts`, commands `planetary`, `setPlanetary`, `deletePlanetary`, `Scene.planetaries`, saved in the file):**
- A set is a record (plane, centre, turn, numbers) that ties together gear records `<id>s` (sun), `<id>p1..N` (planets) and `<id>r` (ring): ordinary gears, so every body is a separate body with its own steps, and everything that works on a gear (selecting, extruding, meshing, export) works on them. Editing the set sets each gear again (`setGear`), adds or takes away planets, and makes the carrier again.
- **Numbers:** sun and planet teeth, number of planets, module, width (every gear's thickness), pressure, backlash, clearance, helix (the sun's), sun bore, ring wall, pin diameter, pin gap, carrier thickness. The ring has `sun + 2 planet` teeth. The planet's bore is the pin plus the gap all round.
- **Checks (`problemsOf`):** whole numbers, `(sun + ring) / planets` whole (the planets spaced evenly all mesh), neighbouring planets' tips apart (in the transverse module for a helical set), a width; few teeth are warned as undercut.
- **Ratio to teeth (`fromRatio`):** for a wanted ratio with the ring, carrier or sun held, every sun and planet count that passes the checks, nearest first; when none is exact the nearest is said (four planets cannot reach 7.3).
- **Ratios shown (`ratios`):** ring held 1 + Zr/Zs; carrier held -Zr/Zs; sun held 1 + Zs/Zr (input over output).
- **Layout:** the planets are placed with `meshWith` on the sun, `360 / N` apart; the ring is placed with `meshWith` round the first planet (its phase then fits the others by the whole-number rule).
- **Hands (helical):** the sun one hand, the planets the other, **the ring the planets' hand**. The AI said in the chat that the ring takes the sun's hand: that was wrong; an internal pair has the same hand (the contact point has both circles' centres on the same side, so their counter-clockwise tangents agree), and `meshWith` already does it that way. The human approved the AI's sentence; this is the correction, to be told to them.
- **Carrier:** one body: an extrude with the plate (radius the ring's pitch radius, below the gears' plane, thickness as set, a hole for the sun's shaft: the sun's bore plus the gap) and a pin at each planet (its length the gears' width), each figure with its own depth (`alsoDepth`). Its parts are ordinary drawn circles named `d/<id>.*`.
- **Checked (`test/planetary.test.ts`, 13 tests):** the kernel makes the bodies (6, or 7 with the carrier, whose volume is the plate less the hole plus the pins to 1%); no body of a spur set runs into another (0 mm3 in every pair tried), a helical set under 0.01 mm3; a planet turned half a tooth overlaps by more than 5 mm3 (the check sees a bad fit); edit (planets 4 to 2 to 5, carrier on and off), refused numbers leave the scene alone, delete takes everything, save and open.

**Not built:** the tool (box, menu, ratio display) is next; the planets are not tied to move together (each is a gear; moving one breaks the set: Edit gear on any member is to open the set); an axial gap between the planets and the carrier plate (they touch at the plane); a ring with an outer carrier or housing; unequal spacing, out-of-phase planets.

## Rationale

The set is made of the gear records that already exist, so the whole of the gear tool's machinery (the speed rules, the kernel's caches, selecting, extruding, meshing) applies unchanged; the record only holds the numbers that tie them together and re-derives them on edit, the same way a gear's parts are re-derived from its record. Planets as separate bodies is what the human asked for, and one carrier body avoids a plate and N loose pins.
