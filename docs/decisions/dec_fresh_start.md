---
id: dec_fresh_start
kind: decision
status: accepted
origin: human
human_input: in_1394
date: 2026-11-21
depends_on:
  - prin_graph_is_truth: the rebuild keeps the graph as the saved truth when it gets to saving
  - prin_input_agnostic: the camera takes mouse, trackpad and touch through one set of intents
---
# The app is rebuilt from scratch in `next/`, one piece at a time

The human decided (`in_1394`) to start again from nothing instead of trimming the prototype: build one piece, let the human try it and say it feels right, then the next. Parts of the old app (`app/`, parked on the branch `prototype-v1`) are pulled in piece by piece only when they are wanted and understood; what is not pulled in is left behind. Production code for each piece is allowed by this entry; each piece that brings a rule or a trade-off gets its own entry when it is built.

**Stage 1 (built, `in_1394`): the world and the camera.** The world with charcoal X Y Z axes and labels, a light grid on the selected plane (drawn by a shader, fading into the fog), three small panes at the origin to pick a plane (teal when selected), and X / Y / Z buttons. The camera: orbit, pan, zoom toward the pointer, straight views of a plane (perspective eased out, so one lens serves both), game-style W A S D flying with the pointer held. The mouse, trackpad and touch mappings are the old app's, with the values the human had tuned.

**Not in stage 1:** parts, sketches, saving, the orb at the origin that hides the axes, selection of anything but a plane.

## Rationale

The human's worry (`in_1394`) was importing code they did not want without knowing it. Starting empty and adding only what they have tried keeps every line something they chose. `docs/rebuild/lessons_and_scope.md` (the AI's draft) is background, not a plan.
