---
id: dec_modifications_are_steps
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_047, in_049
date: 2026-11-04
depends_on:
  - prin_history_additive: automatic edits of earlier steps would break additive history, which is why modifications append instead
  - dec_direct_modification: this settles how the operations in that list are recorded
---
# Every modification appends a step and never edits a sketch

Pushing or pulling a face, tilting it, rounding a line, changing a round face's radius, moving, rotating or scaling a body: each is recorded as a **new step**. None of them edits the
sketch (or any earlier step) that made the geometry. A radius changed three times is three steps (the list may later fold them into one line for reading, without removing any).

This answers the replay-versus-edit-the-source question that was `q_direct_modification`: replay, always (`in_047`, `in_049`).

## Rationale

It follows from `prin_history_additive`. It also keeps a sketch's constraints safe: a face modification cannot break a constraint, because it never touches the sketch.
