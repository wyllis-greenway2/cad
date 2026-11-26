---
id: dec_helpers_one_rule
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_1579, in_1580, in_1581, in_1582, in_1583, in_1597
date: 2026-11-25
depends_on:
  - dec_hints_place_only: a helper only places; this entry is what a helper is and how it always looks
alternative_to:
---
# A helper is a constraint that nearly holds; every helper looks the same

Asked for in `in_1579` and `in_1580` (a simple rule set that expands well and covers both the alignment and the styling, with no special case for circles); the AI's proposal, approved with the four amendments below (`in_1581`, `in_1582`). Built in `next/src/engine/helpers.ts` (reads the relation table) and `next/src/interaction/helpshow.ts` (the look), checked by `next/dev/helpers-check.ts`.

## The rule set

1. **What a helper is.** The place being drawn is a point *P*. A **helper** is any relation of the engine's relation table (`engine/solver.ts` `RELATIONS`: level, upright, parallel, square, tangent, on a line, on a circle, concentric, middle of a line, as long as, ...) that *P* nearly satisfies together with parts that are already there. The parts the relation names are its **sources**. Level with a corner is `level(P, corner)`; level with the line's start is the same with the start as the corner; a line's centre is `midpoint(P, line)`; a circle's middle is `concentric(P, circle)`. Nothing is a helper that is not a relation. A relation is offered as a helper by one flag on its row in the table (a new relation is one row: its equations, the kinds of parts it takes, the flag).
2. **When it acts.** Its residual says how far *P* is from satisfying it, in mm. Within 6 px (a point result: 12 px) it acts; *P* moves to where the residual is zero (the same projection the solver does). A second, independent helper within reach of that place: *P* goes where both hold. Nothing else decides, and no constraint is made (`dec_hints_place_only`).
3. **Where the place may be drawn to.** Only to what is there: points, lines, circles and arcs of the sketch (later the edges and corners of a body, as more parts, not more rules). No grid: the grid is display only (`in_1580`).
4. **What each part gives (the sources, for now).** A point: level and upright with it (two relations). A line: its middle, parallel and square to it, a point on it. A circle or arc: its middle (concentric), tangent to it, a point on it. The figure's own first place counts as a point. A centreline (the middle between two lines, or the line through two middles) is the `symmetric` relation with the same flag: one row, no new rule.
5. **How every helper is shown (one look, no exceptions).** (a) **Sources are orange** (`#f2c14e`): a point source as a small ball, a line, circle or arc source drawn over in orange. This is the one rule for orange: orange is what a helper is about, for every helper, always. (b) **The guide is dashed teal** (1.5 px; dash 0.012 of the view's distance, gap 0.7 of it): the line (or circle) on which the relation holds, from the source to *P* and 12 px past each end. (c) What is being drawn stays teal; the place has the ball. (d) The relation's label ("level", "tangent", "middle") is the sentence; its icon later.
6. **A circle's cross is not a special case.** *P* on a circle's middle is level and upright with the middle: two alignment guides that cross there, the middle lit orange. With rule 5(b) each guide runs 12 px past its ends, so the cross is small and the same for every point (a corner has one too). If the cross should reach past the rim as the old app's does, the general rule is "a guide spans the whole source part plus *P*", which does the same for a parallel line and a tangent circle: one rule, still no circle case.
7. **Constraints are made only when asked** (`dec_hints_place_only`). The helper bar's suggestion and the constraint you add use the same relation row, so a helper, its suggestion and its constraint cannot disagree.

**The numbers** (6 px and 12 px reach, the guide's 12 px overshoot and 6 px trace step, the dash) are `settings.helpers`; the offer's times are `settings.offer` (`dec_helper_constraint_bubble`); `engine/helpers.ts` takes them as an argument (`Reach`) so the engine knows no screen. Where this entry says 6 or 12 px it means those settings.

## The four amendments (`in_1581`)

- **A fixed order.** The place is taken by, in order: a relation that says a point (two rows: coincident, midpoint) before one that says a line; the smallest move; the one that names more of the sketch's own parts; the relation's order in the table; the parts' names. So the same pointer always gives the same helper.
- **The free thing is general.** The place `~P` is alone (a corner, a centre, a first click), or the end of a line from the figure's first place `~S` (`~L`), or the edge of a circle about it (`~C`). Dragging a point will use the same. A new tool says which of its points is free.
- **Units.** The step to a relation is the Newton step on its residuals, so it is in mm whatever the row's unit (an angle's residual is turned into the distance the place must move): one reach, 6 px for a line, 12 px for a point.
- **A guard.** Every relation row says `helper: null` or what it needs (`HelperSpec`), so a new relation cannot be left out (type-checked, and `dev/helpers-check.ts`). Relations with three parts (`symmetric`) are `null` until a locality prune is built; with several roots (tangent) only the roots within reach of the pointer matter, found by Newton from it.
- **Everything that holds is shown.** At the place, every helper that holds is shown (sources lit, guides drawn) and shown, not only the ones that moved it: a place on a circle's middle holds level and upright with it, so the cross appears with no case for circles. A relation that holds wherever the place is (the end of the line is on the line) says nothing and is left out.

## Hints and constraints are one thing (`in_1583`)

A helper is a relation that is **applicable** and **within reach**. *Applicable* is the question the helper bar asks, answered once in `engine/relations.ts`: `fits` (which kinds of parts a relation can be said over) and `standingOf` (the solver would add it as new, or it is already implied by the figure or the sketch, or it is refused). A relation that always holds for the figure (a line's start is on the line) is `already` by the solver's own verdict, not by a guess, so it can never hide a real helper; a relation the sketch's constraints would refuse is never offered. `interaction/suggest.ts` (the bar) and `engine/helpers.ts` (the drawing) both use these, so they cannot disagree about what a relation is, what parts it takes, or whether it would add anything. The first place of a line or circle is the sketch's own point when it is one (`Free.startId`), so the solver sees one point, not two that happen to coincide.
**The guard** is `dev/helpers-roundtrip-check.ts`: random sketches; for random selections that include the free place, the bar's `offersFor` says what would be new; each helper relation is applied, the solver moves only the free part, and `helpersAt` must list that same relation as holding where the figure ends up (700 constraints a seed, all found). Not covered by it: circles being drawn (the circle's radius is its own variable in the solver, the helper's follows the pointer) and dragging.

## One rule for what is offered (`in_1597`)

A relation is offered to a person, **anywhere**, only if it is **offerable**: new (`free`), or true as drawn but not yet said (`holds`), and the solver would accept it. One predicate, `offerable` in `engine/relations.ts`, is used by the helpers of drawing (`applicable`) and the info bar (`barFor`, and `nearFor` for the relations with one other part that hold now). **Already said** and **refused** are never offered (the bar used to show refused ones with a red edge as buttons that only said why they would not work; that is gone). The helper bar has no Delete button either: Delete and a click on nothing do that. A bar with nothing offerable does not appear.

## Not helpers

Dimensions (distance, length, radius, angle: they are numbers, typed or measured), fixed, and equal-radius while no circle is being drawn. Typed numbers stay in the number bubble.

## Differs from the first code
Aligned and level/upright are one relation (level, with two points). Midpoint, tangent, parallel and square are the same code as the rest. Alignment guides and cross lines are drawn by one rule, and their sources are lit orange (the old app lit only the parts of the hints that carried a reference; that was the inconsistency). Cost: about 16 ms a call for 23 points, 19 lines and 3 circles; a locality prune is the next step if drawings get large.
**Not built:** hint icons, helpers while dragging, sources from a body, a guide that reaches past a circle's rim.

## Rationale

The old app had one function per kind of hint, each with its own tolerance, order and drawing, so each looked and acted a little differently and none could be added without writing all three. The engine already states every relation once, with exact residuals; a helper is a relation that nearly holds, so the table can drive the helper, its look, its sentence, its bar suggestion and its constraint. A new constraint then arrives with its hint. The orange rule and the one guide style make it impossible for two helpers to look different.

## Built: the same helpers while dragging (`in_1616`, `in_1617`)
A vertex, the free end of a line and a circle's edge, dragged, are placed by `helpersAt` as when they were drawn (`sketchcontrol.ts` `grabMove`, `interaction/dragging.ts` `freeOfDrag`, `without`, `dragRadius`): a dragged point is the free end of its only line (a `line` figure from the other end) or a place alone (`point`); a circle's edge is a `circle` figure about its centre (a press on the edge sets the radius, a press on the centre moves it whole). The part being dragged is taken out of the system while looking, the hint draws as it does when drawing (orange ties, dashed guides), and it only places: nothing is constrained (`dec_hints_place_only`); after the drop what holds is offered by the marks. A point near another point or a curve still joins it first (`joinFor`), so a line end dropped on a circle is not a tangent hint. A radius that is held (a locked diameter, a fixed radius) is not dragged and the constraints that hold it flash red. Found on the way: the helper offered "the edge place is on its own circle", true by construction, which won at no distance and hid the tangent, so a circle drawn or dragged never got its tangent hint (`engine/helpers.ts` `candidates`). `dev/drag-hints-browser.ts` (scaffolding). A whole line, or a circle by its centre, is dragged as one piece (`in_1618`): a new free figure `piece` (`engine/free.ts`: its points, lines and circles by free names over their own coordinates, and `ref`, the place that stands for the whole; asked about a place, it is moved by the difference), looked up against everything else (`candidates` skips what is among its own parts; the dashed guide passes through the moving point, not through `ref`), `pieceOf` in `interaction/dragging.ts`. A line dragged near a circle rests on it, a circle dragged near a line rests on it, ends align with other points (dashed guides), and nothing is constrained. A line that shares its ends with others keeps them out of the targets (they stretch), and an arc is not yet a piece. `dev/drag-hints-browser.ts` has both.
