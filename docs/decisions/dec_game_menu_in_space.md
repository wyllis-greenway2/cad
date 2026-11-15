---
id: dec_game_menu_in_space
kind: decision
status: provisional
origin: ai-unreviewed
human_input: in_441, in_463, in_467, in_469
date: 2026-11-15
depends_on:
alternative_to:
---
# In game mode the menu: the crosshair, the wheel and a fixed view

`in_441` asked for the menu to be usable with the game mode's centre cursor and `in_463` said how: a right click puts the menu *in space*, it stays there while the view moves about it, the crosshair points at its bubbles and a click presses one; it goes with a click on nothing, when it leaves the view, or after a choice. **The AI's reading:** the ring opens at a point 60 % of the way to the model ahead of the eye and is drawn there as the view moves (`main.ts` `ringAnchor`, `ring.moveTo`); it is not kept on the screen; the pointer stays locked (the page's pointer is never freed and no cursor of its own is drawn: the crosshair is the cursor); the crosshair lights the bubble it is over; a left click presses it, or closes the ring when there is none; a right click closes it; keys, walking and turning do not close it; it closes when its middle is behind the eye or off the screen. Outside game mode nothing changed.

**Changed by `in_467` (this supersedes the standing-in-the-world form above):** the crosshair is drawn *over* the menu (it was under it); it works every bubble, icon and field of the page as a mouse does (`platform/dom-input.ts`: what is under the middle of the view gets `pointerenter` / `leave`, `pointermove`, `pointerdown`, `pointerup`, `click`; a field is focused and takes the keys) and then the press is not the view's; in game mode the wheel is the menu's, not the zoom (`Intent menuStep`): the first notch opens the ring at the middle with its first option lit and each notch lights the next; with the menu open the view is **fixed** (keys and the mouse do not move it) and the mouse turns a selection round the ring in clicks (`Intent menuTurn`; `ring.turn`: a small stick the mouse pushes, a dead place in the middle, the selection moves only when the next option is clearly nearer); a click chooses the lit option wherever the crosshair is (a category opens its ring with its first option lit), a right click or a click with none lit closes it. A straight (orthographic) view and the game mode do not go together: the mode **ends** when the view becomes straight (it made the controls uncontrollable and, after leaving, the wheel zoomed out until the world was gone). Not tried with real pointer lock.

**Changed by `in_469`:** the wheel no longer steps the menu (it zooms in game mode as it does outside it; `Intent menuStep` and `ring.step` are gone; the mouse's turning is the only way to light an option); while the menu is open the view is still fixed against the mouse and the keys, but it **tilts** to look at the lit option (`main.ts`: each frame the view is swivelled a little towards the lit bubble's place round the ring and back to where it was when the menu goes; `ring.selectedOffset`); **W A S D begin game mode** as Space does (`recognizer.ts`, `dom-input.ts`; not with Shift, Ctrl or Alt, nor in a field); game mode begun in a straight (orthographic) view **leaves the straight view** (`main.ts`: the camera is put back to a perspective one), while a view that becomes straight *during* game mode still ends it.

## Rationale

Recorded because production code needs an entry (`CLAUDE.md` rule 9); the form is the AI's reading and stays provisional.
