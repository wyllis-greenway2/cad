---
id: q_face_edit_model
kind: question
status: open
origin: ai-unreviewed
human_input: in_171
date: 2026-11-06
depends_on:
alternative_to:
---
# What should pulling or pushing an existing face of a body do?

The human wants two different behaviours for the pull / push arrow: (1) a fresh sketch being extruded, or a face pulled into another body, is a **pure extrusion or cut along its path** (what we do now); (2) grabbing a face that **already belongs to the body** should **reshape the body**, extending or trimming the faces around it so no new faces are invented and the edge connections stay (a chamfered cylinder made narrower gets narrower as a whole, chamfer included), not cut or add a ring at that face.

**What we do now:** every push / pull is a prism from the face's old place to its new one, added or cut. That is right for (1). For (2) it invents faces (a step where the chamfer began, a ring around a wall) because the neighbouring faces do not follow.

**Ways to get (2), with what I know and do not know:**
- **A. Edit the step that made the face** (history-based). The body is already a list of steps; the wall of a cylinder *is* the extruded circle, so changing its diameter is changing that circle's radius and letting the later steps (the chamfer) be worked out again; the top face of a plain extrusion is its depth; a fillet's face is the fillet's size; a hole wall is the cutting circle's radius. This keeps every relationship by construction and invents nothing. Needs: the face to name the step that made it (we know that when it comes from one step; a wall made of pieces from several steps is the hard case), and later steps to find their edges again after the size changes (our references name an edge by its ends, so after a size change they may not match: this is the unfinished "stable references" item).
- **B. Move the face and heal the neighbours geometrically** (what the human describes, and what I believe direct modelling programs such as Shapr3D do with their own geometry engine's "tweak" operations). The neighbouring faces keep their surfaces and are extended or trimmed to meet the moved face; the result has the same faces as before. I do not know of a ready function in our kernel (OpenCascade through replicad) that does this for any face; whole-shape offset and boolean prisms exist, a per-face "move and heal" I would have to build or find. Note the example: with pure extension, a chamfer cone is *eaten* when the wall moves in past its start (the cone is extended until it meets the new wall, higher up, or vanishes), it does not shrink with the wall: "the whole body gets narrower including the chamfer" is what A does, not what B does. The human should say which one is meant.
- **C. Keep today's prism but also move the faces that are tied to the moved face** (the chamfer cone and the top disc's edge move in with the wall): a special case of B for chains of faces that belong together.

**My proposal, not decided:** build A first for the common cases (the end of an extrusion, the wall of an extruded circle or rectangle's side, a hole, a fillet or chamfer face), keep today's prism for fresh sketches and for faces pulled into another body (as the human asks), and show the user which one is happening (for instance a different arrow colour). Then see how much B is still needed, and look into how other programs do B (I cannot see inside them; reading their published descriptions or trying them is the way).

**Asked of the human:** (1) is "the whole body gets narrower, chamfer included" (A) what is wanted, or "the faces around it are extended and trimmed" (B)? (2) is it acceptable that a face made by several steps (a wall pulled taller) asks which part to change, or edits the latest step?

## Rationale

Nothing depends on it yet. Kept open until the human answers (1) and (2).
