---
id: dec_anchor_geometry
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_305, in_308
date: 2026-11-14
depends_on:
  - dec_relations_standard: the relations that apply to anchors are the table's own rows, not new ones
  - dec_constraint_solver_small: the sketch solver is used as it is; an anchor is a fixed virtual part in it
  - inv_kernel_boundary: the body's edges come to the constraint code as scene data, never from the kernel
alternative_to:
---
# Anchors: the body's geometry as read-only references for a sketch

The human approved (`in_308`, after `in_305`) the first step of `q_body_constraints`: a drawn part can be held to the geometry of a body as to any other part, and the body's geometry is read, never moved.

Built: (1) `roundOf` / `relationKind` (`operation/part.ts`): a **circular edge of a body** (a full circle, or an arc: the circle through its ends and its middle) counts as a **circle** wherever relations are chosen, and is marked an *anchor*. (2) The relations table and the annotations take it as a circle, so a drawn circle selected with such an edge is offered Concentric, Equal radius and Tangent (`actions.ts`, `rows.ts`, `annotations.ts`). (3) The solver reads it as a **fixed virtual centre and a fixed radius** at its projection on the plane being solved (`solve.ts` `roundCentre`, `radiusId`): the drawn part moves, the edge does not. (4) The **drawing hints and suggestions** see the same edges, those in the plane of the sketch (`operation/anchors.ts` `anchorRounds`): a circle's centre drawn near an edge's centre goes there and is made concentric with it; a line's end on it, or tangent to it; a selected circle is offered Tangent when it nearly touches an edge and Concentric when their centres are close (`hints.ts`, `suggest.ts`).

Not built yet (each its own step): an edge that does not lie in the sketch's plane (only its projection); a straight edge or a corner of the body as an anchor for the suggestions (the solver already holds body corners and lines fixed); a stable name for an edge with no sketch behind it (it is named by where it is, so a change of the body that moves the edge leaves the relation pointing at nothing, which is reported, not repaired); body-to-body constraints (`q_body_constraints`).

## Rationale

Constraints between a sketch and the body it sits on are the first thing a user reaches for (a circle on a face, concentric with the edge); the solver already holds body corners and lines fixed, so the missing part was that a circular edge had no centre to hold. Treating the edge as a circle with a fixed centre and radius keeps one relation vocabulary for drawn and body geometry, which is the start of the one system that `q_body_constraints` proposes, and needs no new solver.
