---
id: dec_measure_report
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_546, in_567, in_568
date: 2026-11-16
depends_on:
  - dec_model_panel: the report is the Measure tab of that panel
  - prin_variable_over_hardcoded: the density of the material is a setting, not a number in the code
---
# The measure report: what the selection is, in numbers

**What the human asked (`in_546`, `in_567`):** the measuring tool under the View part of the menu (the tape measure, `in_338`) should give a more useful report; the last item of the order of `in_546`. What is in the report is mine (the human said "more useful information", not which).

**What is built, and the choices that were mine**
1. **A Measure tab** in the Model panel (`interaction/measure.ts`, pure: the scene and the selection in, sections of lines out). It follows the selection; the tape measure entry of the menu turns the tape on **and opens this tab** (and closes it when the tape goes off). The tape's own bubbles on the faces are as they were.
2. **Nothing selected: the model.** Bodies, volume (mm³ and cm³), weight of the solid, the size of everything together, then a section for each body.
3. **A body:** volume, weight, surface area (the sum of its faces' triangles), size X × Y × Z, the lowest and highest Z, the middle of its box, how many faces, edges and corners it is made of.
4. **A face:** its area, radius and diameter when it is round, its tilt from level; **two faces:** each, and between them the angle and, when parallel, the distance (the tape's readings were for the faces of two bodies, so two faces of one body are worked out here).
5. **An edge:** its length (a curve's length is along the points it is drawn through, a hair short), radius and diameter for a circle or an arc, its tilt from level for a straight one; **two edges:** each, the angle between them (straight ones) and the distance middle to middle. **A corner:** its position; **two corners:** the distance and along X, Y, Z. More than two of a kind: the total area, the total length, the farthest two corners apart.
6. **Weight:** the solid's volume at `settings.measure.densityGramsPerCm3` (1.24, PLA). It says "solid" and the density it used: a printed part is lighter by its infill and walls, which the app does not know.
7. **Left out, not guessed:** a number the model does not have is not shown.

## The clearance between two bodies (`in_568`)

- **Two bodies selected:** a section "Between the two bodies": **"they go into each other"** (their surfaces cross, or one is wholly in the other), **"touching"** (nearer than 0.01 mm), or **the nearest distance** between their surfaces in mm. If a clearance is set for hard bodies (`Scene.clearance`, `dec_hard_bodies`) it says whether the distance is at least that or less.
- **Any body:** with more than one body each body's section has a line "To Body k" for up to five others, so the clearance of a part to its neighbours is seen without selecting two.
- **How:** `interaction/clearance.ts`, from the triangles of the bodies as drawn (`hard.ts` keeps them; `meshOf` is exported) and the tests of the hard bodies (`collide.ts`): `collides(a, treeB, c)` says whether any two triangles come nearer than `c`, so the distance is found by growing a bound and then halving to a thousandth of a millimetre; crossing is the "deep" test; kept for the scene (the panel is made again every frame).
- **Accuracy, said in the report:** a mesh of a round face lies inside its true surface by a few hundredths of a millimetre, so a distance between round faces reads that much larger than the true one; for flat faces it is exact to the halving.
- **Not measured:** the volume of an overlap (it needs a boolean in the kernel), which place the nearest points are at, and wall thickness.

**Not done (later, each needing its own approval):** the volume of an overlap and where the nearest points are; the centre of mass; the perimeter of a face; the length of a chain of edges in one go; wall thickness and overhang checks for printing; a copy of the report as text; the units in inches.

## Rationale

The tape measure answered one question (what two faces are to each other) and only for faces of two bodies. A person measuring a part to print it wants the size, the volume and weight, and the length of the edge in front of them, whatever they select, so the report follows the selection instead of being a mode of faces. It is made of numbers the model already has (the bodies' volumes and boxes, the faces' meshes, the corners), so nothing new is stored; the density is the one new setting, and the line says what it assumed.
