---
id: q_snap_suggestions
kind: question
status: open
origin: ai-unreviewed
human_input: in_152
date: 2026-11-06
depends_on:
alternative_to:
---
# Which constraints should be offered while drawing, when what you draw is close to one?

While a line is being drawn, show a small hint (and a click to accept) when the pointer is near enough for a constraint to hold: the human asked for these and wanted to know which we should offer. My proposal, in order of how often they are wanted:

1. **Horizontal / vertical**: the line being drawn is within a few degrees of the plane's axes (a guide line along the axis, the bubble on the line's end).
2. **Coincident / on line**: the end is at an existing corner (already done: it reuses the corner) or on an existing line (new: offers "on line").
3. **Perpendicular and parallel** to the line nearest the pointer's direction (a small guide at the line it relates to).
4. **Tangent**: when a line starts or ends on an arc or circle and its direction is within a few degrees of the tangent.
5. **Equal length** to a nearby line, and **same height / same position across** as a nearby corner (guide lines to it).
6. Not offered while drawing: distances, angles, radius, diameter (numbers: typed after).

How they would work: a hint shows while the pointer is within a threshold (a few degrees, a few pixels); clicking while it shows adds the constraint with the click. Holding a modifier (Alt) turns hints off. This is a proposal; built as a first version (`in_152`: "okay lets do the constraint hints"), which approves the idea but not the exact list, thresholds or how a click accepts: those stay provisional until tried.

**Built for arcs (`in_280`, provisional like the rest):** the human asked for the helpers the line has to be on the curved line too. An arc's first and second end snap onto a straight line or a circle / arc edge near the pointer (on line, on circle), and a click makes the arc with that constraint on the end. While the bow is adjusted (no height typed), if an end of the arc is on a circle or an arc and the bow is within the same few degrees of the one that meets it smoothly there, the bow takes it and says "tangent"; the arc is made tangent (and with its end on the circle). Tangent between an arc and a circle (or an arc) is a new solver constraint (`tangentRound`: the two centres and the shared end in one line); Tangent from the constraints menu on an arc and a circle now means this, where it used to treat the arc's chord as the tangent line.

## Rationale

Needed to answer the question in `in_151`; nothing depends on it yet. Kept open until the human chooses which ones, the thresholds, and whether a click accepts or a key does.
