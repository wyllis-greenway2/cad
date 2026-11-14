---
id: q_mate_persistence
kind: question
status: open
origin: ai-unreviewed
human_input: in_314, in_315
date: 2026-11-14
depends_on:
alternative_to:
---
# Should a mate stay true when a body changes, and how

**Status after `in_315`:** option 2 (checked, put back on request) is built (`dec_body_mates`). What stays open here is option 3 only: bodies that follow their mates by themselves, and mates that leave freedom.

`dec_body_mates` places two bodies once. The human's picture (`in_306`, `in_307`) is bodies "in constraint relationships": change the pin's diameter, move the plate, and the mated parts follow. Options, with what each costs:

1. **Placed once (built).** Simple, additive, replays exactly; goes stale when a mated body changes (a gap or an overlap), and the user mates again.
2. **Check, and offer to redo (small).** Each mate is also recorded (the two faces by their look, as anchors are, `dec_anchor_geometry`, and the kind); after a change the compile says which mates are no longer true ("the box no longer touches the plate"), flashes them, and a button makes the corrective move and turn as new steps. Additive and honest; not automatic.
3. **Standing mates, solved after the history (large).** Mates are relations kept in the scene; after all steps a placement solve (3D, over each body's pose, with a count of what is left free and what is over-constrained) puts the mated bodies where the mates say, and a body that is dragged stays within its mates (a hinge turns, a slider slides). This is the assembly engine of `q_body_constraints`; it needs a pose solver (not the sketch one), a rule for the order of solves (sketches first, then poses), what happens to a sketch drawn on a mated body (it moves with the pose), and the mates that leave freedom (revolute, slider, planar) with limits.

I suggest 2 next (it makes the placement honest at little cost and is what 3 would be checked against), and 3 when the human wants bodies that move under their mates. The human decides.

## Rationale

The three differ in what they promise: a placement, a warning, or a guarantee. The guarantee is the assembly engine and should be built once the placement and the warning have shown which mates are used.
