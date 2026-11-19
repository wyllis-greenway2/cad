---
id: q_working_and_settled
kind: question
status: open
origin: ai-unreviewed
human_input: in_1007, in_1008, in_1009
date: 2026-11-19
depends_on:
  - dec_drag_preview_without_kernel: the preview while a value is set is already the kernel's own answer for the step; "working" is the state that keeps it cheap and exact
  - dec_scene_derivation_cache: what the page works out of a scene is kept while the parts it came from are the same objects; the per-body steps below extend that from the scene to each body
  - dec_per_body_checks: bodies are kept and described by the identity of their own solid; changed bodies are found that way
alternative_to:
---
# Working and settled: what is recalculated while the user is working, and what waits

**Asked (`in_1009`, after `in_1007` and `in_1008`: extruding a plane of a simple arm in a project with two gears took 0.8 s a step, and about 0.3 s after one quadratic scan was removed, though the arm touches nothing complex):** which recalculations are safe to skip, and when are they needed? The human's ideas: the collision system should say which bodies need work; a selection that stays means the user is still working, so the preview comes first and shows interactions with other bodies (cuts, joins); the true final result and the other recalculation wait for the deselect, read as "this is the state I want".

**Recommendation (the AI's; nothing built; not approved):**
1. **What must be recalculated is a matter of dependency, not of selection.** A body's picture is made again when its own graph (its steps, the steps that name it, the relations that name its faces, a move that carries it) changed; found by solid identity before and after, as `dec_per_body_checks` does. Unchanged bodies keep their parts, descriptions and meshes. This needs no state the user can see, and is safe by construction.
2. **Collision is the hint of what a preview must include, not the rule for what is stale.** For the body being changed, the bodies whose boxes (swept, for a move) meet its new box are shown with it (a cut-away, a join); the mesh test is made only when the boxes meet. It is a hint because dependency also runs through names (fillets by face name), relations, patterns and steps order, and because boxes alone missed a body passing through another's place in `in_999`'s differential harness (13 of 65 steps). A body the box test cannot clear is included.
3. **Selection and an open operation set the level of detail and the order, never what is true.** An open operation is "working": the changed body and what it meets are exact and first; the rest is the last picture, not recalculated. A selected face, line, vertex or body: what it is and what is near it exact, far bodies kept coarse. Nothing selected or the operation done: "settled", the rest is brought up to date in the background, the answers keyed by what they were made from so a stale one is dropped.
4. **The history is committed by the operation's own accept (Enter, the tick), never by a deselect.** A deselect only starts the settling; the settled picture must equal a full derive of the same history (a differential test over the fixtures: preview then settle against the whole). A click elsewhere that deselects in the middle of work should not lose or finish anything.
5. **Order of work, safest first:** (a) per-body keeping of parts and descriptions (`bodyParts`, `describeSolid`: about 0.4 s each in the profile of the arm project), (b) re-matching a constraint's named part of a body only for relations that name a changed body, (c) a preview that works out the changed body and the bodies it meets, (d) settling on deselect with a visible "preview" mark, (e) gears as parts with lazy faces and edges (`q_progressive_load`). (a) and (b) change no behaviour; (c) and (d) add a state the user sees and need approval of the words and of when it settles.

**Measured before starting (`in_1010`), Node, 40 extrudes of the arm at different depths, about 330 ms each:** the kernel's own work is most of it: the extrude 190 ms (the fuse of the arm with the gear-and-pin body it overlaps 135 ms: it is built again against the whole body, 240-sided gear and all, at each depth; the arm's prism and tool 28 ms), the description of the answer 32 ms; the page's work is about 90 ms (`bodyParts` 30, `withDerived` 32, the solve 11, rebinding 7). So (a) and (b) would save at most about 30 to 70 ms of 330, and `bodyParts` works over the whole answer (mesh offsets, corner and edge pairing across bodies), so keeping it per body is a refactor to be checked by a differential test, not a small change; the larger cost is the boolean against a body the arm barely touches. **Correction:** the earlier statement that the kernel took 13 ms for the extrude was wrong (that figure was a total in other units over a repeated, cached step); the kernel is the larger part of the cost. **Options for the boolean (not built):** a preview of an add that draws the tool beside the unchanged body and does the fuse only when the value is accepted (the picture of a fuse is the same; the volume, faces and names are not, so it is marked as a preview); or the fuse made only against the part of the body the tool's box meets.

**Done (`in_1011`, option 1 chosen): `dec_preview_without_boolean`** (a preview of an extrusion leaves out the boolean for a figure apart from the bodies; the step made for good keeps it). The rest of this entry (collision as the hint for what a preview includes, selection and deselect, per-body parts) is still open.

**Open:** whether a preview may show other bodies as they were (marked) or must show them current; what "deselect" means for a long-lived selection (a time limit?); how a preview marks itself; whether a hard (collision) body is always included.

## Rationale

The profile of the arm project after the quadratic scan was removed shows the remaining cost is work on bodies the edit did not touch, so the fix is to make that work follow what changed; that part is safe whatever the user is doing. Selection and collision are good guides to what the user is looking at and what may interact, so they should order the work and set its detail, but a stale picture presented as the answer is the failure `dec_per_body_checks` and `q_progressive_load` already guard against, so no choice of what to skip may rest on a guess.
