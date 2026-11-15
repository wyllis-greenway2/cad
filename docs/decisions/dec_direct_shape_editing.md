---
id: dec_direct_shape_editing
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_457, in_458
date: 2026-11-15
depends_on:
alternative_to:
---
# Shaping a body by moving and turning its faces, edges and corners (decided)

**Asked for (`in_457`):** selecting a face, an edge or a corner of a body and moving or turning it should reshape the body (a face tilted, an edge or a corner pulled), not move the whole body as it does now; with limits, such as not turning one edge out of contact with the others and breaking the body open. `dec_direct_modification` lists what is offered today (the whole body; a flat face in or out and tilted; fillets and chamfers; a round face's radius) and says moving a line or a corner is "not offered" because it reshapes the neighbouring faces and there was no valid general operation; the human now asks for it.

**What can be done (the AI's reading, for the human to choose from).** A body of flat faces is held by its faces: each corner is where three or more faces meet, each edge where two do. So shaping it is **moving the faces** and letting their neighbours follow:
- **A face, moved or turned (built in part).** Moved along its normal: *Move*, *Extrude*, *Extend* (`dec_edits_saturate`). *Tilt* and *turn* (new): the face's plane is turned about an axis (an edge of the face, a line through its middle, or one chosen) and the faces beside it are carried on or trimmed until they meet it again. Valid while the body stays closed and does not cross itself; otherwise refused with the reason.
- **An edge.** Two faces meet there. Moving it is moving both planes so that they still meet along the new line: for an edge between two faces and a third face or two beside it, this is a turn of each face about its other edges. Offered where that keeps every face flat; otherwise the faces beside it must be split (see below) or the move is refused.
- **A corner.** Three or more faces meet there. With exactly three the corner cannot move without turning its faces (three planes meet in one point). With more, or on a face of four sides or more, moving one corner makes that face non-flat: it is **refused**, or the face is **split into triangles** so that every piece stays flat (the body then has more faces than it had; a mesh editor's way).
- **A round face** (a cylinder, a cone, a fillet) is a surface, not a polygon: its edges and corners cannot be moved this way; its own handles (radius, taper) stay.

**Decided (`in_458`):** faces, edges and corners are built **together**, as one operation: the corners of the part selected are moved by the motion the handle gives (a Move gives each the same vector, a Rotate turns them about the part's middle), the faces that stop being flat are **split into flat pieces** (triangles, and a face that is still flat is kept whole, and pieces that are flat together are joined again), and a move that would leave the body open, empty or crossing itself is **refused** with the reason. Only bodies whose faces are all flat can be shaped this way (a round face, a fillet, a hole in a face: refused with the reason). A face moved along its own normal keeps its present operations (`dec_edits_saturate`: Move, Extrude, Extend).

**The choices that were put (kept for the record)**
1. **Which first?** Faces (tilt and turn, on what is built) then edges then corners; or all three together.
2. **When a move would make a face non-flat:** refuse with the reason; or split the face into flat pieces (a way to move any corner, at the cost of more faces); or let the corner move only where it keeps every face flat (along the line where its faces' planes meet, when there is one).
3. **What the handle moves:** the arrows of a Move on a selected corner or edge (along X, Y, Z or free) and the rings of a Rotate, as for the whole body, but applied to the part selected.
4. **Interim (done, `in_457`):** until this is built, a corner, edge or face selected and moved, turned or scaled works on **its own body** (it moved every body before: a corner did not say which body it belonged to).

## Rationale

The approach follows `dec_direct_modification` (a growing list of operations made from kernel pieces that keep the body valid, each a step in the history) and `dec_edits_saturate` (an edit is a set operation on the body's regions, so a number never produces an invalid body). Open because the choices above change what is built and what is refused.
