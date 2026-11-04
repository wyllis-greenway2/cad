---
id: q_ui_conventions
kind: question
status: open
origin: ai-unreviewed
human_input: in_026
date: 2026-11-04
---
# Which established CAD conventions (hotkeys, mouse navigation, workflow) should we follow?

The human asked (`in_026`) whether to borrow hot key and interface patterns from SolidWorks, Blender or another
popular CAD program so new users feel at home. Not decided.

AI recommendation, not approved:
- Target users (the blueprint: Bambu, Prusa and Creality owners; people leaving FreeCAD or Fusion 360) mostly know
  Fusion 360, Tinkercad, Onshape or FreeCAD, so the default should follow Fusion/Onshape-style habits: letter hotkeys
  for sketch tools (L line, R rectangle, C circle), E extrude, D dimension, Esc cancel, Enter confirm, Ctrl+Z / Ctrl+Y
  or Ctrl+Shift+Z for undo and redo, millimeters, typing a number to set a dimension.
- Make every binding data (a keymap and a mouse-navigation preset in settings, as the blueprint's "variable over
  hardcoded" principle already asks), and ship a few navigation presets (Fusion-like, SolidWorks/Blender-like with
  middle-mouse orbit) so people can use the hands they already have.
- Copy workflow concepts users already know (sketch, finish, extrude; timeline or feature list), not any program's look.
- Design reason to decide soon: in sketch view the left mouse button must draw (click, press-and-drag), so orbit
  cannot stay on left-drag. It has to move to the middle button, the right button or a modifier. The current
  `D` key toggles the dev theme but `D` means "dimension" in Fusion, so it should be freed.
- Not verified: shortcut tables here come from memory and should be checked against each program's current docs
  before they are locked in.
