---
id: dec_world_orb
kind: decision
status: provisional
origin: ai-unreviewed
human_input: in_463
date: 2026-11-15
depends_on:
alternative_to:
---
# The orb at the junction of the world axes puts the axes and panes away

`in_463` asked for the world axes and the little panes to be hideable with a little orb at their junction: a click hides them all, another shows them, pointing at it shows an eye or a crossed eye for what a click does. **The AI's reading, for the human to correct:** a small dot at the origin of the view (a page element, over the picture, not a part of the model); pointing at it makes it a larger round button with the crossed eye (a click would put everything away) or the eye (a click would show it); a click toggles `AppState.worldHidden` (view state, not saved): the axes and their labels are not drawn, the panes fade away (and cannot be picked), the orb stays. The grid, the model and the planes of the part are not part of it. Menu action `world:toggle`.

## Rationale

Recorded because production code needs an entry (`CLAUDE.md` rule 9); the form is the AI's reading and stays provisional.
