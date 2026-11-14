---
id: dec_standing_mates
kind: decision
status: provisional
origin: ai-unreviewed
human_input: in_321
date: 2026-11-14
depends_on:
  - dec_body_mates: a standing mate is a placement mate that is kept true; it uses the same record, faces and corrective steps
alternative_to:
---
# Standing mates: a mate puts itself back with the change that broke it; a coaxial mate is a pivot and a slider

`in_321` asked to start on option 3 of `q_mate_persistence`. **This is the AI's first slice and the human has not reviewed it.** Choices to veto:

1. **Standing by steps, not by a pose solver.** A mate keeps its record (`params.stand = 1`). After a change that is not stale, the mates that stand and are no longer true are put back by the same corrective turns and move as a hand-made mate (`putMatesBack`), appended **in the same history entry as the change** (one batch), so one undo takes back the change and its corrections. Replays are exact; sketches are carried as before. A pose solver (several mates at once, loops) is **not** built: mates are put back one at a time, up to 8, and if one cannot be put back nothing is corrected and the old "no longer true" message and mark apply.
2. **New mates stand by default; `mate:stand:<id>` turns it off** (back to placed once). Mates made before this keep their old meaning (no `stand`: placed once).
3. **A coaxial mate is already a joint that leaves freedom:** the first body can turn about the shared axis and slide along it. Selecting that body offers **Turn about the mate's axis** (degrees) and **Slide along the mate's axis** (mm); each appends ordinary steps and the mate stays true. Flush + coaxial gives a pin with a shoulder (turn only); a slider is a coaxial or parallel-axes mate plus the slide row.
4. **Not built yet:** limits (min/max turn or slide), a remembered drive value, a drag handle, standing correction while the kernel is still answering (browser, stale result: it is corrected on the next change), planar joints, several mates on one body solved together.

## Rationale

Keeping standing mates as appended steps reuses everything already tested (carrying sketches, anchors, undo, save/open) and needs no new solver; the cost is that a body with competing mates is corrected greedily rather than solved. Grouping with the change in one entry keeps undo honest. A real pose solver should be added only if competing mates turn out to matter.
