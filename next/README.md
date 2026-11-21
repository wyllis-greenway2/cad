# next: the rebuild, from scratch

Started on the human's word (`in_1394`): build the app again from nothing, a piece at a time, and pull parts of the old app (`../app`, parked on the branch `prototype-v1`) in only as each is wanted and the human has tried it. See `docs/decisions/dec_fresh_start.md`.

**Stage 1: the world and the camera.** `npm install`, then `npm run dev` (port 5173), `npm test`, `npm run typecheck`.

| File | What it is |
|---|---|
| `src/camera.ts` | The camera as pure maths: orbit, pan, zoom to the pointer, straight views, fly. No DOM, no three.js. |
| `src/input.ts` | Mouse, trackpad and touch events turned into a few intents. |
| `src/game.ts` | W A S D flying: pure state with easing. |
| `src/world.ts` | three.js: axes and labels, the grid of the selected plane (a shader), the three plane panes, fog. |
| `src/main.ts` | Wires them. |
| `src/settings.ts` | Every tunable number. |

Controls: left-drag on empty space, right-drag or Alt+left-drag orbit; middle-drag, Shift+right-drag or Space+drag pan; wheel zooms to the pointer (out is about the centre); a trackpad scroll pans and a pinch zooms; one finger orbits and two pan and pinch. X / Y / Z (keys or buttons) look straight at a plane, again for the other side; a pane click selects a plane, a double click also looks straight at it. W A S D fly (the pointer is held and turns the view), Esc ends it.
