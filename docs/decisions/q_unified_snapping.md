---
id: q_unified_snapping
kind: question
status: open
origin: ai-unreviewed
human_input: in_1334
date: 2026-11-20
depends_on:
alternative_to:
---
# One snapping and constraint system instead of six?

The human (`in_1334`): "how can we unify our whole snapping system and setting constraints to system because it seems awfully piece meal?", after finding that distances from a sketch to the faces and edges of the block it is on cannot reliably be set, and asking for "snapping suggestions with basically all the lines available in view".

**What there is now (read in the code, 2026-11-20):** six separate places each decide "what is under the pointer that I can hold on to".
1. `picking.ts` `candidatesAt`: what a click selects.
2. `tools.ts` `snapOnPlane` and `hints.ts` `pointHint`, `lineHint`, `arcBulgeHint`: where a sketch tool's point lands and which constraint it takes while drawing.
3. `orbsnap.ts` `snapOrb`/`orbSpots`: where the mover orb lands.
4. `gizmo.ts` / `control/handles.ts`: the arrows and rings, with their own axis holding.
5. `suggest.ts` `suggestionsFor`: the constraints offered for a selection (the helpful bar).
6. `actions.ts` + `rows.ts` + `constraintlist.ts`: the table of constraints by kind of pair (`ROWS`), the ring's entries over it.

They share nothing but `Scene`; each has its own radius, its own idea of "visible", its own list of what counts (the orb knows body edges and vertices, a sketch tool knows only sketch parts and some body edges, the bar knows the selection only).

**What I found when I tried it (a circle's centre on the top of a block):** selecting the centre and a vertical edge, a side face, a vertex or a top edge of the block does offer Dimension (`ROWS` handle a face as the line where it cuts the sketch plane, `in_313`). What is missing is a way to *reach* them: a face seen edge on, a vertical edge (a point in the plane) and anything behind the block cannot be pointed at, so there is nothing to select, and while drawing the sketch tools do not snap to them.

**Proposal (not built; for the human to accept, change or reject):**
- One **reference set** for a scene and a plane: every point, line, circle, plane and axis that can be held, with the face edge-on and the vertical edge reduced to what they are in the plane being worked in (a line, a point), whether or not hidden, each with a stable `Ref`. Pure, in `operation/`, memoised per scene like `consumed`.
- One **hold** function: pointer + reference set + what is wanted (point, line, direction) → the nearest holds, ranked, with the constraint each would make. Every one of the six users above calls it (the sketch tools, the orb, a click, the arrows) and only differs in what it does with the answer.
- One **constraint table** that the bar, the ring, the hints and the dimension tool all read (today `ROWS`, `constraintlist.ts` and `hints.ts` each hold part of it).
- Everything in view offered: while a sketch point is placed, guide lines to all references in view (edges and edge-on faces of bodies included), clickable to make the constraint.
- Done in steps, each behind the existing tests: (1) the reference set and `hold`, with the sketch tools moved onto it; (2) the orb; (3) selection; (4) the bar and the ring.

**Cost and risk:** large; the layers (`ui → interaction → operation`) stay as they are. Step 1 alone would fix the reported case. I would start there if approved.

## Rationale

Needed to answer `in_1334`; nothing depends on it. Kept open until the human says whether to go ahead, and in what order.

## Step one built (`in_1335`, for review)
The human: "yes go ahead with step one". `interaction/hold.ts` is the one reference set for a point placed on a plane: `holdsAt` (the corners, polygon middles, the body's corners as they fall on the plane, the corners of a cross section's cut and the middles of straight lines, ranked) and `alignPoints` (what it can line up with). `snapOnPlane` and `pointHint` now ask it instead of each looping over the scene. New: a point lines up (level or upright) with the body's corners where they fall on the plane (the feet of vertical edges). The question stays open for steps two to four (the orb, selection, the bar and ring). Not yet done: pointing at an edge-on face or a vertical edge to select it.
