# next: the rebuild, section by section

`docs/decisions/dec_rebuild_by_requirements.md`. Section 1: the world view and camera; its requirements are in `docs/rebuild/world_view_requirements.md`.

Run it: `bash tools/preview.sh next` (or `LAN=1 bash tools/preview.sh next` for a phone). `?boxes=0` starts with an empty model. Three boxes stand in for bodies, so there is something to measure by, turn about and lose.

| File | What it is |
|---|---|
| `src/camera.ts` | The camera as pure maths: an eye, a direction and a lens. Turn about a point (orbit, look), move along a ray or across (zoom, walk, pan), straight views, eased changes. |
| `src/sense.ts` | What the camera needs to know of the scene: depth ahead, the pivot, in view or lost, which pane a ray goes through. |
| `src/scene.ts` | The stand-in boxes and the ray test. |
| `src/input.ts`, `src/game.ts` | Mouse, trackpad and touch to intents; W A S D flying. |
| `src/world.ts`, `src/ui.ts` | Drawing (three.js) and the page's parts (buttons, letters, origin dot, Reset pill). |
| `src/main.ts` | The controller. |
| `src/settings.ts` | Every tunable number (the prototype's tuned values, verbatim). |
