---
id: q_ui_round_controls
kind: question
status: open
origin: ai-unreviewed
human_input: in_551
date: 2026-11-16
depends_on:
alternative_to:
---
# Should the X Y Z, ⋯, Cut and world-orb controls use the one round button?

They keep their own look (`controls.ts`, `cutparts.ts`, `worldorb.ts`): their colour and border change with the view (facing, selection ring), or they carry a letter or a plus or minus. **Recommendation:** leave them: a view-dependent control is not a plain round button; fold them in only if `roundButton` grows a state for it.

## Rationale

A loose end of `dec_ui_unification`, left on purpose and recorded so it is decided and not forgotten.
