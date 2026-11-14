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

1. **W A S D** move the view forward, back, to the left and to the right while the key is down; with any of them down the pointer (no button) turns the view about the eye, up / down / left / right, as in a game. (Intents `walk` and `swivel`; `recognizer.ts`, `viewing.ts`.)
2. **Select several** in the ⋯ menu: every tap adds to the selection, a tap on what is selected takes it out (what Shift does; a phone has no Shift). A long press on a move arrow chooses it with the others for a free drag (what Shift + click does).
3. A trackpad's two-finger scroll pans by `settings.input.trackpadPanScale` of what it scrolls (less sensitive).
4. A held press on a button shows its title in a bubble on a phone (no hover for the tooltip): `ui/tips.ts`.
5. The hover mark on a surface is a flat see-through disc (`settings.orb.hoverOpacity`), not a ring: a ring looked like a circle a click would place.
6. The small controls over the view share one look (`ui/look.ts`: a dark pill, choices teal when on): the Similar chip, the join / separate chip of Combine and the group chip that stands over the view while several things are selected.

## Rationale

The keys and the selection mode are the human's own proposals; the rest answers their complaints about sensitivity, patchy visuals and the lack of a hover on a phone. Each is a setting or a mode, nothing is hardcoded to a device.
