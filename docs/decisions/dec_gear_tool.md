---
id: dec_gear_tool
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_545, in_544, in_543
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
- **Built (first slice, `in_544`):** `operation/gear.ts` makes the outline of an external or an internal (ring) involute gear as points and bulges (each side of a tooth is a short chain of arcs through points of the true involute, checked to a thousandth of the module; the volume of the extruded body agrees with the exact area). The **Gear** tool (Sketch ring): click the centre, the pointer sets the outside size or type the numbers; the outline is selected as a figure, ready to extrude.
- **Built (`in_545`): a gear keeps its numbers, and rings are in the tool.** The scene holds a record (`Scene.gears`: plane, centre, numbers; `operation/gearscene.ts`) and the gear's corners, sides (and a ring's wall circle) are made from it each time the scene is derived, as the copies of a repeat are: locked, named by the gear and their place in the outline (`d/g_003.s17`), not saved (the file holds the command). Commands `gear`, `setGear`, `deleteGear`. Changing the numbers changes the bodies made from the gear: when the count of sides changes, a step that names the whole outline (as its figure, a hole, a sibling) is given the new sides; a numbers change that would take away a corner or side a constraint stands on is refused with the reason; numbers that make no gear are refused with the reason and the gear stays. **Edit gear** (Sketch ring, enabled with a gear selected) opens the same number box on it: Teeth, Module, Pressure (degrees), Shift (a gear) or Wall (a ring, in modules), Backlash (mm), typed or Tab between; Enter applies and puts the tool away, Esc leaves it. **Ring gear** (Sketch ring) draws a ring: the pointer sets the outside of the wall. Delete on a selected gear takes the record and parts whole.
- **Not built yet:** moving a gear (its parts are locked; the centre is in the record, so a move would be a change of it), a bore or clearance field in the box, a message when typed numbers make no gear while drawing (the tool just makes none; the edit says nothing either until Enter is refused with the reason), root fillet (the root is the root circle between the flanks), the undercut shape (only a warning is computed), snapping a bore to the gear's centre (no centre corner is kept: `dec_no_stray_corners`; a ring has its wall's centre), rack, pulleys, sprockets, cycloidal, helical.

## Rationale

The involute is the one profile of machined gears that keeps a constant speed ratio and forgives centre-distance error; the rest of the list are the profiles the human named. Drawing the outline as ordinary parts means export, extrude, hole cutting, mirroring and the flat SVG/DXF export all work on it without special cases.
