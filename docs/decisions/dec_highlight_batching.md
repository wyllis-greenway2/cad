---
id: dec_highlight_batching
kind: decision
status: provisional
origin: ai-proposed-human-approved
human_input: in_700, in_701
date: 2026-11-17
depends_on:
  - dec_speed_rules: this extends the system-wide speed rules from the kernel's work to what the page draws; a change to them would change what counts as a saving here
---
# What is selected is drawn in a few batches, and kept while it does not change

**Found (`in_700`):** a gear sketch of 400 lines and 401 corners is drawn in a few batches while unselected (the frame costs about 5 ms in the headless browser), and with all of it selected costs about 50 ms a frame (draw 24 ms, build 24 ms) while the pointer hovers, 25 ms while orbiting. The cause is in `ui/view/highlight.ts` `buildHighlight`: for every selected part it makes its own object, a `Line2` with its own `LineGeometry` and `LineMaterial` for a line, a 14 by 10 `SphereGeometry` and a material for a corner, and it makes them all again on every frame that is drawn (every move of the pointer, every step of an orbit). 800 draw calls, 800 buffers uploaded and thrown away, 800 materials (`pen.line` keeps each in `mats`, which only `content.ts` empties, so the list grows by the size of the selection on every frame, and a resize walks all of them).

**Approved in principle and pinned (`in_701`: "that sounds good, lets pin that idea"): not built yet, to be done with the other speed fixes.** The plan:
1. All selected lines of one colour and width are one `LineSegments2` (`pen.segments`), and all selected corners are one instanced mesh (or one `Points`), so a selection costs a few draw calls whatever its size.
2. The highlight is built again only when what it is made of changes (the scene, the selection, the hover, the amber, red and temp sets, the unit it is sized by), not on every frame; the camera distance only changes the size of the dots, so they are sized in the shader or the instance matrices are updated, not rebuilt.
3. The pen's `mats` list is emptied whenever the highlight group is cleared.
4. Measured the same way, with `tools/perf/select.cjs`, before and after.

## Rationale

The user's sketch is slow only when selected because only then is every part its own object. A selection of one face or one body was measured and is cheap (5 to 12 ms a frame); the cost grows with the number of selected parts, and a gear, a text outline or an imported shape selected as a whole is hundreds of parts. This is the same finding as the speed rules (cost is shared by every heavy thing, so fix it as a system rule): batching removes the cost for every selected heavy sketch, and nothing is drawn differently.
