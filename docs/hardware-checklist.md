# What only a person with real hardware can check

Everything below was built and checked by tests and in Chromium with emulation (`dec_settings_page`, `dec_ui_unification`), but never on the real device. Try each on the branch's build, and write what you see in `docs/human-input.md` (or tell the AI). Where something is wrong, say which line.

## Phone or tablet (a finger)
1. **Long press opens the ring.** Hold on empty space: a ring of round bubbles appears. In its **Select** bubble there is **Add mode** (a mouse's ring does not have it).
2. **Add mode.** Turn it on: a pill "Adding: tap to add or remove · Done" shows at the top left. Tap two faces: both are selected. Tap one of them: it is taken out. Done leaves.
3. **The operation bar at the bottom.** Select a face, choose Push pull: the bar stands at the bottom with undo, redo, Move / Extrude / Extend, a check and a cross. Does it fit the width? Can a thumb reach the check?
4. **Apply by tapping away.** With an operation open, tap empty space: it applies (as a right click does).
5. **Settings by touch.** ⋯ then Settings…: the page opens and **nothing on it changes by itself** (the scroll choice stays as it was).
6. **Inches.** Settings → Inches. Type a push / pull size of 1: the bubble says "1 in" and the face moves 25.4 mm.

## Trackpad
7. **Two-finger scroll pans, pinch zooms** (Settings → A scroll → Automatic). Try Pans, Zooms and the three pan speeds.

## Mouse
8. **Game mode with a real mouse.** Press Space (or W A S D): the pointer is held at the middle. Open a push / pull on a face: **Tab** steps Move, Extrude, Extend; **Shift+Tab** goes back; type a number and **Enter** applies. Esc leaves.
9. **The ring in game mode.** Right click: the ring stands in the world; turning the mouse lights options; a click chooses. Esc closes it.
10. **Select similar and Cut in the bar.** Select an edge, Select similar: the bar shows "N similar edges" and the rules as ✓ / ○. Tab lands on one, **Shift+Enter** flips it, Enter keeps the selection. Select two overlapping bodies, Combine → Cut: the parts and Joined are in the bar the same way.

## Keyboard
11. **Rebinding.** Settings → Keyboard: set **R** for Rectangle. Close. Press R: the rectangle tool starts. Set Undo to U: U undoes and Ctrl+Z no longer does. "Put every key back" restores them. Try a **non-US layout** if you have one (Ctrl, Shift and punctuation keys).
12. **Keys that cannot be bound.** Digits, Tab, Enter, the arrows, Space and W A S D say why.

## Gears (another branch's work)
13. The gear tools' numbers do **not** follow the inch setting on purpose (`q_gear_units`): check that a gear is still right with Inches on.
