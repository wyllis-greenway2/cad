# next: the rebuild, section by section

`docs/decisions/dec_rebuild_by_requirements.md`. Section 1: the world view and camera; its requirements are in `docs/rebuild/world_view_requirements.md`.

Run it: `bash tools/preview.sh next` (or `LAN=1 bash tools/preview.sh next` for a phone). `?boxes=0` starts with an empty model, `?boxes=1` with one box; three boxes stand in for bodies otherwise, so there is something to measure by, turn about and lose. `?wheel=0.001` tunes the wheel's step; the B key adds or takes away the boxes.

| File | What it is |
|---|---|
| `src/camera.ts` | The camera as pure maths: an eye, a direction, perspective or orthographic. Turn about a point, move along a ray, zoom, straight views, the eased change between the two projections. |
| `src/view.ts` | The world view's **state and every change of it**, as pure functions (state, what is known now, what happened) to the next state. This is what the tests will try. |
| `src/sense.ts` | What the camera needs to know of the scene: the scale of what the eye is among, the point looked at, in view or lost, which pane a ray goes through, the grid's level. |
| `src/scene.ts` | The stand-in boxes and the ray test. |
| `src/input.ts`, `src/game.ts` | Mouse, trackpad and touch to intents; W A S D flying (pure state with easing). |
| `src/world.ts`, `src/ui.ts` | Drawing (three.js) and the page's parts (buttons, letters, origin dot, Reset pill; one stylesheet from settings). |
| `src/main.ts` | The wiring: intents and time in, calls on `view.ts`, the state kept, the drawing and the page told. The pointer lock and the game ring (only the browser can do them). |
| `src/dev.ts` | Aids for trying it by hand (the address, the B key, `window.__cad`): not part of the app. |
| `src/settings.ts` | Every tunable number (the prototype's tuned values, verbatim; the colours and sizes of the page's parts). |
