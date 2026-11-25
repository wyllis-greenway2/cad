---
id: dec_helpers_one_rule
kind: decision
status: provisional
origin: ai-unreviewed
human_input: in_1579, in_1580
date: 2026-11-25
depends_on:
  - dec_hints_place_only: a helper only places; this entry is what a helper is and how it always looks
alternative_to:
---
# A helper is a constraint that nearly holds; every helper looks the same

**The AI's proposal, not yet approved by the human** (asked for in `in_1579` and `in_1580`: a simple rule set that expands well and covers both the alignment and the styling, with no special case for circles). The first version of the code (`next/src/interaction/helpers.ts`, hand-written loci) is a step toward it and does not yet follow rules 5 and 6.

## The rule set

1. **What a helper is.** The place being drawn is a point *P*. A **helper** is any relation of the engine's relation table (`engine/solver.ts` `RELATIONS`: level, upright, parallel, square, tangent, on a line, on a circle, concentric, middle of a line, as long as, ...) that *P* nearly satisfies together with parts that are already there. The parts the relation names are its **sources**. Level with a corner is `level(P, corner)`; level with the line's start is the same with the start as the corner; a line's centre is `midpoint(P, line)`; a circle's middle is `concentric(P, circle)`. Nothing is a helper that is not a relation. A relation is offered as a helper by one flag on its row in the table (a new relation is one row: its equations, the kinds of parts it takes, the flag).
2. **When it acts.** Its residual says how far *P* is from satisfying it, in mm. Within 6 px (a point result: 12 px) it acts; *P* moves to where the residual is zero (the same projection the solver does). A second, independent helper within reach of that place: *P* goes where both hold. Nothing else decides, and no constraint is made (`dec_hints_place_only`).
3. **Where the place may be drawn to.** Only to what is there: points, lines, circles and arcs of the sketch (later the edges and corners of a body, as more parts, not more rules). No grid: the grid is display only (`in_1580`).
4. **What each part gives (the sources, for now).** A point: level and upright with it (two relations). A line: its middle, parallel and square to it, a point on it. A circle or arc: its middle (concentric), tangent to it, a point on it. The figure's own first place counts as a point. A centreline (the middle between two lines, or the line through two middles) is the `symmetric` relation with the same flag: one row, no new rule.
5. **How every helper is shown (one look, no exceptions).** (a) **Sources are orange** (`#f2c14e`): a point source as a small ball, a line, circle or arc source drawn over in orange. This is the one rule for orange: orange is what a helper is about, for every helper, always. (b) **The guide is dashed teal** (1.5 px; dash 0.012 of the view's distance, gap 0.7 of it): the line (or circle) on which the relation holds, from the source to *P* and 12 px past each end. (c) What is being drawn stays teal; the place has the ball. (d) The relation's label ("level", "tangent", "middle") is the sentence; its icon later.
6. **A circle's cross is not a special case.** *P* on a circle's middle is level and upright with the middle: two alignment guides that cross there, the middle lit orange. With rule 5(b) each guide runs 12 px past its ends, so the cross is small and the same for every point (a corner has one too). If the cross should reach past the rim as the old app's does, the general rule is "a guide spans the whole source part plus *P*", which does the same for a parallel line and a tangent circle: one rule, still no circle case.
7. **Constraints are made only when asked** (`dec_hints_place_only`). The helper bar's suggestion and the constraint you add use the same relation row, so a helper, its suggestion and its constraint cannot disagree.

## Not helpers

Dimensions (distance, length, radius, angle: they are numbers, typed or measured), fixed, and equal-radius while no circle is being drawn. Typed numbers stay in the number bubble.

## Differs from the first code
Aligned and level/upright become one relation (level, with two points). Midpoint, tangent, parallel and square are the same code as the rest, not cases. Alignment guides and cross lines are drawn by one rule, and their sources are lit orange (today alignment lights nothing, as the old app: it lit only the parts of the hints that carried a reference; that was the inconsistency).

## Rationale

The old app had one function per kind of hint, each with its own tolerance, order and drawing, so each looked and acted a little differently and none could be added without writing all three. The engine already states every relation once, with exact residuals; a helper is a relation that nearly holds, so the table can drive the helper, its look, its sentence, its bar suggestion and its constraint. A new constraint then arrives with its hint. The orange rule and the one guide style make it impossible for two helpers to look different.
