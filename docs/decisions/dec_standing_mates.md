---
id: dec_standing_mates
kind: decision
status: provisional
origin: ai-unreviewed
human_input: in_321, in_322, in_323
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
4. **Limits (`in_322`, AI's reading, for the human to correct):** a joint remembers where it stands (`turn` degrees, `slide` mm, counted from where the mate was made) on the mate record, and can have a lowest and a highest stop for each. Rows: *lowest / highest stop* (a number; refused if the two would cross) and *take the stops away*. A drive amount is **added** to where the joint stands and **stops at the limit** (asked for more, it goes as far as the stop; at the stop it does nothing). The drive values and stops survive a mate being put back. A hand-made turn or move of the body is not counted (it is a placement, not a drive).
5. **Drag handle (`in_323`, AI's reading):** selecting the pinned body adds two handles to its helper: a ring round the shared axis (turn) and an arrow along it past the body's end (slide). Where the arrow lies on a Move arrow's line the joint's handle is the one taken. The drag is drawn live on the graphics card (the body moved by a matrix, as a free body drag is), is held at the stops, and is made as one drive step when let go (the same step as a typed amount). Sketches on the body do not move in the picture until it is let go.
6. **Not built yet:** standing correction while the kernel is still answering (browser, stale result: it is corrected on the next change), planar joints, several mates on one body solved together.

## Rationale

Keeping standing mates as appended steps reuses everything already tested (carrying sketches, anchors, undo, save/open) and needs no new solver; the cost is that a body with competing mates is corrected greedily rather than solved. Grouping with the change in one entry keeps undo honest. A real pose solver should be added only if competing mates turn out to matter.
