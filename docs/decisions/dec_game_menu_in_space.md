---
id: dec_game_menu_in_space
kind: decision
status: provisional
origin: ai-unreviewed
human_input: in_441, in_463
date: 2026-11-15
depends_on:
alternative_to:
---
# In game mode the right-click menu stands in the world

`in_441` asked for the menu to be usable with the game mode's centre cursor and `in_463` said how: a right click puts the menu *in space*, it stays there while the view moves about it, the crosshair points at its bubbles and a click presses one; it goes with a click on nothing, when it leaves the view, or after a choice. **The AI's reading:** the ring opens at a point 60 % of the way to the model ahead of the eye and is drawn there as the view moves (`main.ts` `ringAnchor`, `ring.moveTo`); it is not kept on the screen; the pointer stays locked (the page's pointer is never freed and no cursor of its own is drawn: the crosshair is the cursor); the crosshair lights the bubble it is over; a left click presses it, or closes the ring when there is none; a right click closes it; keys, walking and turning do not close it; it closes when its middle is behind the eye or off the screen. Outside game mode nothing changed.

## Rationale

Recorded because production code needs an entry (`CLAUDE.md` rule 9); the form is the AI's reading and stays provisional.
