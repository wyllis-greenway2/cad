---
id: dec_hints_place_only
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_1327, in_1328
date: 2026-11-20
depends_on:
  - dec_sketch_lines_and_constraints: a rectangle's horizontal and vertical lines are real constraints the tool makes, and they stay; this entry is about what a snap or a hint adds beyond the tool's own
alternative_to:
---
# A snap or a hint only places; a constraint is made when it is asked for

The human found the sketch constraints "getting out of control" (`in_1327`): hints taken while drawing (level, upright, on a line, on a circle, tangent, parallel, square, as long as, concentric, and anything to a body's edge) each made a real constraint nobody had chosen. In one file 20 of them tied a tube's sketches to a cylinder's edges and blocked a mate, and the solver spent its time on them. They asked whether snapping and suggested positions should only help to position, with a constraint made only when the user adds it, and approved the AI's answer (`in_1328`: "yes, do that, rectangles keep theirs").

**The rule.** Snapping (to a corner, a line, a circle's middle, the grid), the guides and the hints (level, upright, parallel, square, on a line, on a circle, tangent, concentric, as long as) **place the point and draw their guide, and make no constraint.** A constraint is made only by the person: from the Constraints list, or the suggestions group of the bar (which offers the ones the drawing already satisfies).

**What stays as it is:**
- **A tool's own constraints.** A rectangle keeps its horizontal and vertical lines, a polygon its equal sides, a gear, a cam and the other tools what they define: that is the shape, not a hint.
- **A shared corner.** Snapping a line's end onto an existing corner reuses that corner: that is how a closed figure is made, not a constraint.
- **Files already made** keep their constraints.

**The switch.** `settings.sketch.hintConstraints` (default false) brings the old behaviour back (`shared/settings.ts`): the hints taken while drawing a line, an arc, a circle or a rectangle, while dragging a corner and while dragging a circle's rim make their constraints again. There is no page for it yet.

**Built (`in_1328`):** the five places that turned a taken hint into a constraint are behind the switch: the line and arc (`hintRelations`), a circle's centre or a rectangle's corner put on a line or circle, a circle made tangent, a dragged corner, a dragged rim, and a circle made concentric. **Not built:** the suggestions group offering the satisfied ones is as it was (it offers what a selection satisfies); a settings-page toggle; the hint keys shown as "would be a constraint" while drawing.

## Rationale

A snap is a way to put a point exactly; a constraint is a rule the solver must keep true from then on. Making one of every snap fills a sketch with rules nobody chose, slows the solver, and, worst, ties a sketch to other bodies so that a mate or a move is refused. Keeping the tools' own constraints keeps the parametric behaviour that matters (a rectangle stays a rectangle); the rest the person adds, in one click, where it matters.
