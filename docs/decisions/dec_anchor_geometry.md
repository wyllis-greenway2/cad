---
id: dec_anchor_geometry
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_305, in_308, in_309, in_310
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

**Stable naming (`in_309`, as `dec_stable_references` says: names first, geometry as the fallback).** An edge of the body is named by where it is, so a change of the body (a depth, a size, a chamfer) used to leave a relation to it pointing at nothing. Now a relation to a circular edge of the body also keeps **how the edge looked** when the relation was made (`Relation.anchors`: its centre, radius, which way it faces, and its height in the body's box; made when the relation is added, `commands.ts`); when the compile finds the edge gone (`compile.ts`, `anchors.ts` `rebindAnchors`) it names the edge that looks most like that one: facing the same way, with the centre and radius changed least and at the same relative height; the drawn parts held to it are then solved again. Only a clear winner is taken (nothing within reach, or two alike, takes none); then the relation is listed (`CompileOutcome.lost`), the change stays, the constraint flashes and a message says so (`session.ts`), and it holds again when the body does. The description stays the one made with the relation, so each later change is judged against it. The document is not rewritten: the renaming is in the compiled scene, found again from the description on every compile.

**Straight edges and corners (`in_310`).** The straight edges of the body that lie in the sketch's plane (`anchorLines`) and its corners on the plane (`anchorCorners`) are anchors for the drawing hints and the suggestions, as the circular edges are: a line being drawn takes level, upright, parallel, square, on-the-edge and as-long-as with them (`hints.ts`); a figure whose corner is drawn on a corner of the body, and a line that ends on one, is **held to it** by a Coincident relation (`joinedAtCorners`, now also for lines); a selected drawn corner near a body edge is offered On line / Coincident with circle, and a selected circle, arc or line near a corner of the body is offered it (`suggest.ts`). The recorded look and the finding again (`in_309`) cover them too: a straight edge by its direction, its middle across the sketch's plane, its length and its height; a corner by its place across the plane and its height (`EdgeAnchor.kind`, `axis`).

Not built yet (each its own step): an edge that does not lie in the sketch's plane (only its projection is held by the solver, which already takes any body corner or line); the same description for a face; body-to-body constraints (`q_body_constraints`).

## Rationale

Constraints between a sketch and the body it sits on are the first thing a user reaches for (a circle on a face, concentric with the edge); the solver already holds body corners and lines fixed, so the missing part was that a circular edge had no centre to hold. Treating the edge as a circle with a fixed centre and radius keeps one relation vocabulary for drawn and body geometry, which is the start of the one system that `q_body_constraints` proposes, and needs no new solver.
