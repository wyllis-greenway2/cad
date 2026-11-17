---
id: dec_worm_gears
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_573, in_572, in_571, in_570, in_569, in_568, in_567
date: 2026-11-17
depends_on:
  - dec_gear_tool: a worm and its wheel are gear records of the same kind (a record, parts made from it each derive, steps it owns); a change to how a gear is a record changes them
  - dec_spiral_extrude: the worm's thread is that decision's revolve with an advance (a figure carried along a helix about an axis in its plane)
  - dec_loft_sketches: the wheel is a loft through sketches, as that decision makes them
  - prin_manufacture_agnostic: nothing per manufacturing route (no clearance for printing, no kerf)
---
# Worm gears: a worm, and a throated wheel as a loft through five sections

**Asked and approved (`in_567` to `in_573`):** a worm is a rack wound round an axis (the tooth of its axial section is a rack tooth, carried along a helix); the exact wheel (cutting the worm out of a blank at 24 turns) took 153 s for one window of a 30-tooth wheel (`prototypes/worm-hobbing`), so the wheel is a loft through sections worked out from the worm, which a prototype showed follows the exact wheel to 0.05 mm with five (`prototypes/worm-wheel-loft`). Built as proposed: single hand (right), 90 degree shafts, one to four starts.

**The worm** (`GearSpec.worm = { diameter, length }`; `teeth` is its starts, `module` its axial module, `pressure` its axial pressure angle; `operation/worm.ts`, `wormscene.ts`). Thread: the rack tooth at the pitch (thick pi m / 4 either side of the middle at the pitch circle, flanks at the pressure angle, a module above and 1.25 modules below the pitch circle, the foot reaching half a module into the core), one figure for each start; the lead is the starts x pi x the module. Core: a rectangle on a second plane through the axis, revolved 360 degrees (a cylinder; extruding a circle gave a cylinder the kernel's join with the thread could not make). Steps (named by the gear in `params.gear`): the core revolve as a piece of its own (`mode: "new"`: it stands beside its wheel, which overlaps it by tooth clearance and must not cut it), then each start's thread as a revolve with advance, joined (`mode: "add"`). The thread stays half a millimetre inside the core's ends (a thread that touches an end face exactly makes the join fail). The default Diameter is ten modules, Length 15 modules (2.5 leads at least); the figure is drawn counter-clockwise (a thread swept from a clockwise one is a solid turned inside out).

**The wheel** (`GearSpec.wheel = { starts, diameter, width }`: the worm it is for; `teeth` its teeth; `operation/wheelsections.ts`). Its tip surface is an arc about the worm's axis (the throat, a quarter module from the worm's root: tip radius smallest in the middle, 24 against 22 at the faces in the prototype). The sections are worked out as in the prototype: a point of the wheel is cut when at some turn of the worm (the wheel turning starts / teeth as much) it is inside the thread; a section at height h is the curve where that test changes, by marching squares over two pitches with every grid crossing found by bisection, cut into 18 pieces of equal length (arcs through their ends and middles) and a top arc for the tooth. Five sections (`SECTIONS`), equal heights, a loft step `mode: "new"` through the planes the record makes parallel to its own (`wormscene.ts`). Worked out in about 2.7 s for 20 teeth (the prototype's brute force took 25 s: a coarser grid, the reach of the worm limited to the turns that can touch the point, early exits) and cached by the numbers. Edit gear works from either body (`gearOfPart`).

**Meshing** (`meshWith`, Mesh gear on a worm; fields Teeth, Offset, Width, Bore): the wheel's centre is the centre distance (the wheel's pitch radius and the worm's) from the worm's axis on the side the pointer is on, `Offset` mm along the worm; it is turned so that its teeth meet the thread: the sections are for a worm whose thread stands at x = lead / 4 on the line of contact (mod the pitch of the thread), this worm's thread stands where its figure and the side put it, and the wheel is turned by the difference over its pitch radius. Checked by the kernel's intersection of the two bodies in `test/worm.test.ts`: on either side and along the worm the overlap is under 1 mm3 (about 0.01 mm3 in the runs) and a wheel 0.4 mm too near overlaps by tens of mm3.

**Not built:** left hand worms (a mirror of the wheel's sections), a worm wheel for a worm on its own (the Worm wheel tool makes one by its numbers, anywhere; only Mesh gear places it against a worm), double enveloping worms, a wheel with a keyway or D bore, a worm meshed from the wheel's side (Mesh gear on a wheel is refused). The wheel is an approximation to 0.05 mm, as the prototype measured, not a hobbed wheel; nothing was checked in a browser or on a printed pair.

## Rationale

The loft makes a throated wheel in seconds where cutting it takes minutes, within the tolerance a printer holds, and uses only steps that exist (`revolve` and `loft`); the sections' arcs make it ordinary sketches, so it follows the numbers like every gear.
