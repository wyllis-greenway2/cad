---
id: dec_context_action_bar
kind: decision
status: accepted
origin: human
human_input: in_054
date: 2026-11-05
depends_on:
  - dec_ui_conventions: the bar shows the same actions and hotkeys as the keymap and the right-click menu
---
# What can be done now: offered by the right-click menu (formerly a bottom bar), in every mode

A full-width bar toward the bottom of the screen presents the actions available for the current context and selection, with the hotkey written on each button (`in_054`). It is the same in the sketch view
(tools, then the constraints that fit what is picked, with their state) and in the 3D view (the actions for a selected face, line, body or sketch shape, plus view and undo), and while an operation is running
(Apply and Cancel). A button that cannot be used is greyed out and says why on hover. The hotkey on a button is read from the keymap that handles the key press, so they cannot disagree.

**Trimmed to the selection (`in_056`, the human's words):** if a line is selected the bar shows only what can be done with that line or set of lines; sketching tools (rectangle, line, circle...) show only on the sketch plane with nothing picked or a drawing tool in use;
extrusion shows when a closed shape (a face) is selected, not otherwise.

**Icons, not words (`in_058`, the human's words):** every operation has an icon and perhaps a keyboard key; text is reserved for the tooltip (name, one line of help, the hotkey, the reason a button is off). This applies to the bar and to the constraint icons next to a selection.

**The bottom bar is gone (`in_061`, the human's words: "Lets get rid of our tool bar at the bottom and see if we can do everything just from mouse clicks. The right click should offer operations. The left click should select. Slected things should show you what is applied to them."):** the same items (`src/actionbar.mjs`, unchanged and still tested) are now offered by the **right-click menu**, which first picks what is under the pointer. The left click selects. Hotkeys are unchanged.
Constraint icons next to a selection: click one and it opens up with an x that deletes it, and what it relates (the other line, corner or circle) shows in amber (`in_061`). AI's reading of "selected things show what is applied to them": done for sketch constraints; in 3D the selection only shows its name so far.

Built in `prototypes/cad-ui` (`src/actionbar.mjs` pure, tests in `test/actionbar.test.mjs`).

## Rationale

The human asked for it directly. Putting the available actions and their keys in one predictable place makes the interface discoverable without a toolbar that is always full.
