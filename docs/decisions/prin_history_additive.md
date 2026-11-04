---
id: prin_history_additive
kind: principle
status: accepted
origin: ai-proposed-human-approved
human_input: in_047, in_049
date: 2026-11-04
---
# History is additive; the past changes only when the user explicitly edits a step

New work is recorded by appending steps. Undo removes the last thing added. Nothing the user did earlier is rewritten as a side effect of a later action: no operation edits an
earlier step or sketch on its own. The one way the past changes is the user deliberately opening a step and editing it (and that edit is itself an undoable action), possibly with
a warning about what it affects.

This is a principle, not an invariant: a future feature could have a reason to break it, and then the entry should be revised on purpose.

## Rationale

The human asked for history to be additive and said automatic editing of past things would be bad (`in_047`). Additive history keeps undo trivially correct, keeps the model readable
(you can see how the part was made), and means nothing changes meaning behind the user's back.
