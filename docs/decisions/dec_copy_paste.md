---
id: dec_copy_paste
kind: decision
status: provisional
origin: ai-unreviewed
human_input: in_435
date: 2026-11-15
depends_on:
alternative_to:
---
# Copy captures, Paste pastes: the paste is parts of its own

`in_435` said Ctrl+C must not make a copy, that Ctrl+V pastes (at the preset distance with no position given, on a surface that is clicked), that the copy must be deletable and must not go when the original does. **The AI's reading, built (for the human to correct):** Ctrl+C and the menu's *Copy* capture what is selected (`AppState.clipboard`) and make nothing; Ctrl+V and the menu's *Paste* paste it. A drawn figure is pasted as ordinary drawn parts (no repeat record keeps them tied to the original, so each can be moved, constrained and deleted by itself, and the original can be deleted without taking it): beside the original at the distance a copy begins with, or, if a single face, plane or sketch is selected when Ctrl+V is pressed (a click selects it), onto that surface: the figure's middle at the surface's middle, on a plane of its own there unless it is the figure's own plane; level and upright sides stay so. A body is pasted as the quick copy beside it (a `pattern` step), as before. **Not built:** a body pasted onto a surface, the pasted figure turned to a surface's own up, pasting where the pointer is (a click after Ctrl+V), the other constraints of the figure carried over, a pasted body that is free of the original's steps.

## Rationale

Recorded because production code needs an entry (`CLAUDE.md` rule 9); the surface rule (selected, not pointed at) and the independence of a figure's paste are the AI's reading.
