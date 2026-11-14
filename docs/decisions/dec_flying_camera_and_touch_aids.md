---
id: dec_flying_camera_and_touch_aids
kind: decision
status: accepted
origin: human
human_input: in_300
date: 2026-11-14
depends_on:
  - dec_ui_conventions: these add to the navigation and selection conventions (mouse navigation, Shift selection) and do not replace them
  - prin_input_agnostic: each is an intent from the recogniser (walk, swivel, a menu mode), never a device check in the interaction layer
---
# Game-style camera keys, and aids for a phone

The human asked for (`in_300`), and the app does:

1. **Game mode** (`in_300`, `in_302`): any of **W A S D** turns it on and it ends a moment (`input.gameIdleMs`) after the last of them is let go, or at Esc; a click does not end it (`in_304`). While it is on the pointer is held at the middle of the screen (the browser's pointer lock, so the screen's edge cannot stop it): the hover disc and clicks are at the middle, a small ring there marks it, and the mouse's movement turns the view, less sensitively (`flyLookScale`). The keys move the view forward, back, left and right while they are down; the pointer, with no button and no key needed, turns the view about the eye up / down / left / right. Both ease: the keys come up to speed and down again (`input.flyEaseSec`), the pointer's movement is let out over a few ticks (`flyLookSec`), at about 60 ticks a second while in the mode; speed is `flySpeed` view distances a second. (Intents `walk` and `swivel`; `recognizer.ts`, `viewing.ts`, `dom-input.ts`.)
2. **Select several** in the ⋯ menu: every tap adds to the selection, a tap on what is selected takes it out (what Shift does; a phone has no Shift). A long press on a move arrow chooses it with the others for a free drag (what Shift + click does).
3. A trackpad's two-finger scroll pans by `settings.input.trackpadPanScale` of what it scrolls (less sensitive).
4. A held press on a button shows its title in a bubble on a phone (no hover for the tooltip): `ui/tips.ts`.
5. The hover mark on a surface is a flat see-through disc (`settings.orb.hoverOpacity`), not a ring: a ring looked like a circle a click would place.
6. The small controls over the view share one look (`ui/look.ts`: a dark pill, choices teal when on): the Similar chip, the join / separate chip of Combine and the group chip that stands over the view while several things are selected.

## Rationale

The keys and the selection mode are the human's own proposals; the rest answers their complaints about sensitivity, patchy visuals and the lack of a hover on a phone. Each is a setting or a mode, nothing is hardcoded to a device.
