---
id: dec_fine_motion
kind: decision
status: provisional
origin: ai-unreviewed
human_input: in_420
date: 2026-11-15
depends_on:
alternative_to:
---
# Fine mouse movements turn the view a little less; a menu in game mode frees the pointer

`in_420` asked that the right-click menu not vanish in game mode, and for a gentle decrease in the mouse's sensitivity for fine movements that fades to the usual sensitivity as movements grow, also with the keys (W A S D) moving, to make it easier to take fine edges and pull arrows. **The AI's reading, built (for the human to correct):** (1) `fineGain(mag)` = 1 − (1 − 0.6)·e^(−mag/6 px) multiplies each pointer movement that turns the view: the orbit drag outside game mode and the look in game mode (with the keys held or not, since the look is the same path). A movement of about 20 px or more is as before. Handle drags and the pointer's place are not touched (the arrow stays under the pointer). (2) In game mode the pointer is held at the middle, so the menu that opened at the crosshair closed when the mouse turned the view; now a menu being open lets the pointer go (as Alt does) and takes it back when the menu closes. **Not done:** the keys' own walk has no extra fine damping (it eases in over 0.15 s already); the numbers (0.6, 6 px) are guesses in `settings.input`.

## Rationale

Recorded because production code needs an entry (`CLAUDE.md` rule 9); the numbers and the reading of "also with the keys" are the AI's and stay provisional.
