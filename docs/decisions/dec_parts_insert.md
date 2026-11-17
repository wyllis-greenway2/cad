---
id: dec_parts_insert
kind: decision
status: provisional
origin: ai-unreviewed
human_input: in_786, in_787
date: 2026-11-17
depends_on:
  - dec_parts_library: this is the "mating points" of its point 4, done with the mates the program already has
  - dec_parts_fastener_pilot: the screws and the receivers (hole, countersink, counterbore) it inserts into are that entry's
  - dec_body_mates: the placement is a coaxial mate and a flush mate, made and recorded as that entry describes
  - dec_standing_mates: the mates stand, so the screw follows the body it is in
alternative_to:
---
# Insert fastener: a screw put into a selected hole, placed and mated in one action

**Drafted from `in_786` and `in_787`, not yet approved. Nothing built.** The human asked what the mating point design is, and then for it to be drafted with these defaults: **the length chosen automatically, the mates standing, and the screw alone** (the nut and washer separate). The one-line version: a part does not store "mating points"; the program finds the faces of the part it needs by their geometry and uses the mates it already has.

1. **The action.** Select a hole (the round wall of a hole or a circular edge of it, as for a picked place) and the flat face the screw goes in from, then choose **Insert fastener…**: the family (socket head cap screw or countersunk screw) and the size. The part is made and placed: **coaxial** with the hole's axis and **seated** on the face.
2. **The seat.** A **socket head** screw is seated with the **underside of its head** on the face (or on the floor of a counterbore, when the hole has one: the floor is the flat face selected); a **countersunk** screw with the **top of its head flush** with the face. The faces of the screw are found by geometry on the part as it is made (the round shank, the flat underside of the head, the flat top), so a part needs no stored points and any family that makes a shank and a seat works the same way.
3. **Length chosen automatically (the default),** with a typed length as the override: from how far the hole goes (the grip: its depth from the face to the far side, or the depth of a blind hole) the shortest **standard length** (ISO 888, `dec_parts_fastener_pilot`) that is at least the grip, so the screw comes through a through hole; for a blind hole, the shortest standard length **not longer than the hole's depth** (so it does not reach the bottom). The length is shown and can be changed in the dialog before the part is made. A standard length that the size is not made in is advised, as before.
4. **Standing mates, by default.** Both mates are recorded as standing (`dec_standing_mates`): move or change the plate and the screw follows; one undo takes the insertion back. An option (`mate:stand:<id>` as for any mate) turns it off. Coaxial leaves the screw free to turn and slide: **Turn about the mate's axis** and **Slide along the mate's axis** work on it, and the flush mate holds the slide at the seat.
5. **The screw alone (the default).** No nut and no washer are made. Placing a nut or a washer on the far side or under the head is a separate action to come, by the same rule (a washer's hole coaxial with the screw, flat on the face; a nut's hole coaxial, flat on the far face), and is not part of this entry yet.
6. **Reuse, no new kernel operation.** The motion and the records are the placement mates of `dec_body_mates` (`mateCommand`), the part is the part of `dec_parts_fastener_pilot`, and the hole and face come from the selection the way a picked place does (`interaction/addpart.ts`).

## To settle by trying it (not decided)
- **When the mates can be made.** A mate is worked out from the faces of the part as the kernel has built them, and the page refuses a step made while the kernel is still answering (`in_142`). Either the insertion is **two steps** (the part is made in place; the mates are recorded once the answer is in), or the part is **drawn already in its place** (as the receivers are, on a plane through the hole's axis) so the mates are already true when they are recorded. The second needs one undo for both and is preferred; whether it can be done without waiting for the kernel is to be found by a prototype.
- **What a hole is.** A round face or circular edge of a body gives the axis and radius; a hole that is not round, or two selected holes, are refused with the reason (several holes at once is a later step).
- **The length rule for a stepped hole** (a counterbore over a clearance hole): the grip is counted from the seat selected; its depth to the far side is the hole's reach.

## Rationale

The mates already exist, stand, undo and save, and they are the way the program says "these two bodies are joined"; building insertion on them means no new solver and no new kind of record. Finding the faces by geometry keeps the part's data small (no stored points, `dec_parts_library`) and makes every screw family work the same. Choosing the length from the standard list is where the standard lengths are worth having: a person puts in a screw and gets one that can be bought. Defaulting to standing mates matches how the other mates are made, and defaulting to the screw alone keeps the first slice small.
