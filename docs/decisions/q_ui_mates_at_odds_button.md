---
id: q_ui_mates_at_odds_button
kind: question
status: open
origin: ai-unreviewed
human_input: in_551
date: 2026-11-16
depends_on:
alternative_to:
---
# Should "Delete constraint to proceed" be offered for mates at odds?

A change, an undo or a redo that would leave standing mates that cannot all hold is refused and names the mates, but has no button (`session.ts` `atOdds`). Offering it needs a delete-mate command (the existing button deletes relations). **Recommendation:** yes, for a change; not for undo or redo (deleting a mate would make an undo something else). The other refusals without the button (a kernel step that cannot be made) should stay as they are: deleting a constraint would not mend them.

## Rationale

A loose end of `dec_ui_unification`, left on purpose and recorded so it is decided and not forgotten.
