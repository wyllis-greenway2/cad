---
id: dec_measure_report
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_612, in_633, in_634, in_639, in_640, in_641, in_643
date: 2026-11-16
depends_on:
  - dec_model_panel: the report is the Measure tab of that panel
  - prin_variable_over_hardcoded: the density of the material is a setting, not a number in the code
---
# The measure report: what the selection is, in numbers

**What the human asked (`in_612`, `in_633`):** the measuring tool under the View part of the menu (the tape measure, `in_338`) should give a more useful report; the last item of the order of `in_612`. What is in the report is mine (the human said "more useful information", not which).

**What is built, and the choices that were mine**
1. **A Measure tab** in the Model panel (`interaction/measure.ts`, pure: the scene and the selection in, sections of lines out). It follows the selection; the tape measure entry of the menu turns the tape on **and opens this tab** (and closes it when the tape goes off). The tape's own bubbles on the faces are as they were.
2. **Nothing selected: the model.** Bodies, volume (mm³ and cm³), weight of the solid, the size of everything together, then a section for each body.
3. **A body:** volume, weight, surface area (the sum of its faces' triangles), size X × Y × Z, the lowest and highest Z, the middle of its box, how many faces, edges and corners it is made of.
4. **A face:** its area, radius and diameter when it is round, its tilt from level; **two faces:** each, and between them the angle and, when parallel, the distance (the tape's readings were for the faces of two bodies, so two faces of one body are worked out here).
5. **An edge:** its length (a curve's length is along the points it is drawn through, a hair short), radius and diameter for a circle or an arc, its tilt from level for a straight one; **two edges:** each, the angle between them (straight ones) and the distance middle to middle. **A corner:** its position; **two corners:** the distance and along X, Y, Z. More than two of a kind: the total area, the total length, the farthest two corners apart.
6. **Weight:** the solid's volume at `settings.measure.densityGramsPerCm3` (1.24, PLA). It says "solid" and the density it used: a printed part is lighter by its infill and walls, which the app does not know.
7. **Left out, not guessed:** a number the model does not have is not shown.

## The clearance between two bodies (`in_634`)

- **Two bodies selected:** a section "Between the two bodies": **"they go into each other"** (their surfaces cross, or one is wholly in the other), **"touching"** (nearer than 0.01 mm), or **the nearest distance** between their surfaces in mm. If a clearance is set for hard bodies (`Scene.clearance`, `dec_hard_bodies`) it says whether the distance is at least that or less.
- **Any body:** with more than one body each body's section has a line "To Body k" for up to five others, so the clearance of a part to its neighbours is seen without selecting two.
- **How:** `interaction/clearance.ts`, from the triangles of the bodies as drawn (`hard.ts` keeps them; `meshOf` is exported) and the tests of the hard bodies (`collide.ts`): `collides(a, treeB, c)` says whether any two triangles come nearer than `c`, so the distance is found by growing a bound and then halving to a thousandth of a millimetre; crossing is the "deep" test; kept for the scene (the panel is made again every frame).
- **Accuracy, said in the report:** a mesh of a round face lies inside its true surface by a few hundredths of a millimetre, so a distance between round faces reads that much larger than the true one; for flat faces it is exact to the halving.
- **Not measured:** the volume of an overlap (it needs a boolean in the kernel), which place the nearest points are at, and wall thickness.

## The volume two bodies share (`in_639`)

- **A line "Shared volume"** under "Between the two bodies" when the two overlap: the volume of the common part in mm³ and cm³ and its share of the smaller body ("500 mm³ (0.5 cm³), 50 % of the smaller body"); "none (they only touch)" when the common part is nothing; "being worked out…" until the kernel answers.
- **How** (`interaction/overlap.ts`): the kernel makes the common part with the same boolean as the combine step's intersect (the scene's own graph and one more step after its last solid, the two bodies by the names they keep) and says its volume from the solid itself; the answer is asked through the kernel's export queue (`exportMesh` with the first body named, meshed coarsely, only its volume is used), so the kernel's thread needs nothing new and the model's own answer is not disturbed. It is asked once for the scene and the pair (kept for the scene) when the Measure tab is open with two overlapping bodies selected (`main.ts`); the panel shows it when it comes. A boolean that fails says why in the line.
- **Tests:** two blocks overlapping by half share 500 mm³ and 50 %; asked twice, the kernel is asked once; bodies that are apart have no such line. Looked at in the browser, where the kernel runs on its own thread: the same.
- **Not done:** the place of the nearest points; the overlap of more than two bodies; the overlap by regions of the combine step (it exists, `in_294`, in the Combine operation).

## The centre of mass (`in_640`)

- **A body's centre of mass** is a line "Centre of mass" in its section ("5, 10, 15 mm (as solid all through)"), and with several bodies the model's section has "Centre of mass, all" (each body counted for its own volume; where bodies overlap the overlap counts twice). It is of the solid as if it were the same all through (not of a printed part with its infill and walls).
- **How** (`interaction/mass.ts`): from the triangles of the body's faces, by the divergence theorem: each triangle with the origin is a small piece with a signed volume and a middle, summed; inner faces face inward and count negative, so a cavity or a notch takes nothing. Kept for the scene.
- **Accuracy:** the mesh of a round face lies inside the true surface by a few hundredths of a millimetre, so for round bodies the centre and the volume (from the mesh) are that much off (a post's volume from its mesh reads under 1 % low; its centre is on its axis to 0.01 mm); for flat faces it is exact.
- **Tests:** a block's centre is the middle of it and its volume from the mesh is the kernel's; two blocks together weigh by volume (27.5, 5, 5); a notch cut out moves the centre away from it (5.75, 5, 5.625 for the block with a 4 x 10 x 5 notch); a round post's centre is on its axis.
- **Not done:** the centre of the part as printed (infill, walls), the moments of inertia, the centre of mass of the selected part of a body.

## Wall thickness for printing (`in_641`)

- **Two lines in a body's section:** **"Thinnest wall"** (the least thickness found in mm and the place on the surface where) and **"Under 0.8 mm"**: either "none: every wall is at least 0.8 mm" or "N % of the surface has less than 0.8 mm behind it: too thin to print well" (the share is of the surface by area). 0.8 mm (two lines of a 0.4 mm nozzle) is `settings.measure.minWallMm`; a very detailed body is sampled (`settings.measure.wallSamples`, 40 000 points) and the line says so.
- **How** (`operation/thickness.ts`, pure on the body's triangles, with the tree of boxes of `collide.ts`): from four points of every triangle (its middle and three nearer its corners) a ray goes into the solid along the inward normal; how far it goes to the next surface is the thickness there. Which way is in is found from the winding of the mesh (a closed mesh facing outward has a positive volume). A hollow body's inner faces face the cavity, so their rays go into the wall. Kept for the scene (`measure.ts`); 40 to 100 ms for the bodies of 1 000 to 4 000 triangles measured.
- **What it means, said plainly:** it is the thickness straight in from the surface at the sample points, which finds a thin plate, a thin shell wall and a thin rib or fin, and is not the least distance between two surfaces anywhere (a thin sliver between two faces that are not facing each other, a wedge that comes to an edge, is not found: its ray from a face goes where the wedge is thick). Round faces are measured on their meshes (a few hundredths of a millimetre).
- **Tests:** a block's thinnest wall is its smallest size (10) and nothing is under the minimum; a plate of 0.5 mm is 0.5 thick with 95.24 % of the surface under the minimum (its edges are thick); a hollow with 2 mm walls reads 2 and one with 0.5 mm walls reads 0.5 and is flagged; the check on raw triangles of a cube reads 10, and a limit of samples is said to have sampled.
- **Marked in the picture (`in_643`):** while the Measure tab is open the triangles whose samples have less than the minimum behind them are drawn red and see-through over the body (`thin` in the frame, `view.setThin`, colour and opacity `settings.measure.thinColor`, `thinOpacity`); for the bodies selected, or for all when none is. The "Under 0.8 mm" line says "marked red in the picture". They go when another tab is chosen. The marks are the whole triangles that have a thin sample, so a large triangle that is thin only in part is marked whole. A body being dragged does not carry its marks along until the next frame is built; they are not shown while the kernel is still answering.
- **Not done:** a separate switch for the marks (they follow the Measure tab); overhangs and unsupported spans; the smallest hole or the thinnest gap between two parts; a different minimum for a different nozzle in the interface (it is a setting).

**Not done (later, each needing its own approval):** the place of the nearest points; the perimeter of a face; the length of a chain of edges in one go; overhang checks for printing; a copy of the report as text; the units in inches.

## Rationale

The tape measure answered one question (what two faces are to each other) and only for faces of two bodies. A person measuring a part to print it wants the size, the volume and weight, and the length of the edge in front of them, whatever they select, so the report follows the selection instead of being a mode of faces. It is made of numbers the model already has (the bodies' volumes and boxes, the faces' meshes, the corners), so nothing new is stored; the density is the one new setting, and the line says what it assumed.
