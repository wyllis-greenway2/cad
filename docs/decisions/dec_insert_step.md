---
id: dec_insert_step
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_489, in_490, in_562, in_563
date: 2026-11-16
depends_on:
  - dec_history_navigation: this is the one place that decision's "doing something at an earlier point drops what comes after" no longer holds, when the human switches Insert here on
  - dec_stable_reference_mechanism: the later steps find their faces and edges again by the names, not by where they were
  - prin_history_additive: the history stays a list of commands with a cursor; the insertion puts one command in the list, nothing is rewritten
---
# Insert a step in the middle of the history

**What the human asked (`in_489`, `in_490`, `in_563`):** to make a step in the middle of the history, not only at the end; the last of the order of `in_489` that waited for stable references (`in_562` asked which to do next; the recommendation was this, `in_563` approved it).

**What is built, and the choices that were mine**
1. **Insert here** is a switch in the History panel, shown while the cursor is before the last step (go to a step first). While it is on, what is made goes in **at the cursor**, and the steps after it (the faded ones) are **made again** on top of it. The cursor stays at the new step, so several steps can be put in one after another. Off, or at the last step, things work as before (an action at an earlier point drops the faded steps). It is off by default and goes off when the cursor reaches the end; it is not saved in the file.
2. **One command, one undo.** The inserted command goes into the list at the cursor (`History.inserting`, `insertExec`, `operation/history.ts`); undo takes it back from the cursor and the rest stay to redo.
3. **Ids:** while inserting, the scene at the cursor has the counter of the whole history, so what is made there gets ids no later step has (`shown`).
4. **Refused, nothing changed:** if a later command cannot be applied again on top of the inserted one (for example it names something the new step took away) the insertion is refused and says so ("the steps after it could not be made again"). A later **step the kernel cannot make** is not refused: it shows red with its reason in the History, as any step does; its face and edge names (`dec_stable_reference_mechanism`) mean it finds its face again where it can, and fails loudly where it cannot.
5. **Not done:** inserting an edit of an earlier step's numbers (that is the pencil, at the last step); insertion in a file loaded with a cursor in the middle (the flag is not saved); curved faces, edges with a curved face beside them, and the faces of a revolve, loft or sweep have no lasting names yet, so a later step that uses them may fail after an insertion where the old matching by place would have found them; a drag of a face of an earlier body made while inserting has not been tried by hand.

## Rationale

The history already kept the scene after each command, so going to a step costs nothing; what an insertion adds is replaying the tail. Making it a switch, not the default, keeps the usual undo-then-do-something-else meaning (the future is dropped), which people expect. Refusing the insertion when a later command cannot be applied keeps the history whole; a step the kernel cannot make is left to show red, which is what the History does for any step, so the human can see what the insertion changed and take it out with one undo.
