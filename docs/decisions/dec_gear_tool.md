---
id: dec_gear_tool
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_544, in_543
date: 2026-11-16
depends_on:
  - prin_manufacture_agnostic: the gear tool carries no per-route treatment (no kerf, no print backlash, no laser presets)
alternative_to:
---
# A gear tool: one generator, many tooth profiles

**Approved (`in_544`)** as proposed after `in_543`, except nothing per manufacturing route (`prin_manufacture_agnostic`).

- **One generator, many profiles.** A tooth profile gives one pitch of outline from a few numbers; the tool repeats it round the axis, and the outline is drawn as an ordinary figure of lines and arcs on a plane (a flat figure first). Thickness is the normal extrude; a bore, hub, spokes and keyway are the normal tools. New profiles are new generators, not new tools.
- **Inputs:** tooth count and module (metric tooth size); pitch diameter is module times teeth and is shown; the outside diameter can stand in for the module. Also pressure angle (20 degrees by default), profile shift, backlash (nominal 0), clearance (0.25 module).
- **Order:** involute spur gear first (external and internal), then rack; timing pulleys and roller-chain sprockets from published tables; cycloidal (clock) teeth; helical and herringbone by twisting the same outline (`dec_spiral_extrude`). Later and different in kind: bevel and worm gears, a planetary layout helper, differentials (assemblies).
- **No library:** the maths is public (ISO 53, DIN 867) and written here; gear libraries are GPL or LGPL.
- **Built in the first slice:** `operation/gear.ts` makes the outline of an external or an internal (ring) involute gear as points and bulges (each side of a tooth is a short chain of arcs through points of the true involute, checked to a thousandth of the module; the area and the volume of the extruded body agree with the exact maths). `drawGear` (`operation/build.ts`) draws it as ordinary lines and arcs (a ring also gets its wall circle). The **Gear** tool (Sketch ring, `tool:gear`): click the centre, then the pointer sets the outside size (the module is the nearest 0.05 that makes the outside that wide, 20 teeth by default) or type Teeth, Tab, Module, Enter; the outline is selected as a figure, ready to extrude. The tool makes external gears only.
- **Not built yet:** internal gears in the tool (the outline and the builder exist), pressure angle, shift, backlash and bore in the tool's fields, a message when typed numbers make no gear (the tool just makes none), root fillet (the root is the root circle between the flanks) and the undercut shape (only a warning is computed), keeping the numbers so a gear can be edited later (it is drawn as plain parts for now), snapping a bore to the gear's centre (no centre corner is kept: `dec_no_stray_corners`), rack, pulleys, sprockets, cycloidal, helical.

## Rationale

The involute is the one profile of machined gears that keeps a constant speed ratio and forgives centre-distance error; the rest of the list are the profiles the human named. Drawing the outline as ordinary parts means export, extrude, hole cutting, mirroring and the flat SVG/DXF export all work on it without special cases.
