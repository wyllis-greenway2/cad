# Mechanism play (a prototype, `in_821`)

**What it was meant to learn:** what it costs, on the page, to move bodies on screen with a matrix each (no kernel, no history), driven by a timer: whether that is cheap enough to build play and gear-driving-gear motion on, and where the cost is (`in_820`).

**What it is:** `build.ts` makes the Geneva drive as a 3D model through the app's own modules (`layout: "model"`, three bodies) and writes `model.json` with each body's triangles split out (from the kernel's face ranges, as the app's `bodySplitOf` does). `index.html` and `play.js` draw it in Three.js, one mesh per body with its own matrix (`matrixAutoUpdate = false`), the crank and the locking disc turning together about the second shaft and the wheel stepping (the formulas of `dec_geneva`: the wheel's turn while the pin is in the slot), and time each frame. `run.cjs` serves the repository and runs it in headless Chromium with 1, 10 and 50 copies of the drive, and with a naive mode that makes new geometry from the arrays every frame. Run: `cd app && node ../prototypes/mechanism-play/build.ts && node ../prototypes/mechanism-play/run.cjs`. Nothing in the app imports this.

**What it learned** (headless Chromium with software GL: the frame rates are the sandbox's, not a real graphics card's; the JavaScript costs are the real part):

| copies | bodies | triangles | fps (software GL) | matrices, ms a frame | naive rebuild, ms a frame | render call, ms a frame |
|---|---|---|---|---|---|---|
| 1 | 3 | 3,370 | 59 | 0.019 | | 0.4 |
| 10 | 30 | 33,700 | 30 | 0.050 | | 0.5 |
| 50 | 150 | 168,500 | 8 | 0.082 | | 1.5 |
| 1, naive | 3 | 3,370 | 59 | 0.020 | 0.23 | 0.5 |
| 10, naive | 30 | 33,700 | 25 | 0.033 | 1.42 | 2.3 |

- **Moving bodies by matrices costs nothing:** under a tenth of a millisecond a frame for 150 bodies. The kinematics (a few trigonometric calls a body) is the same size. The cost does not grow with the number of bodies in any way that matters.
- **What the frame rate follows is the triangle count** (rasterising, here in software): the same whether or not anything moves. A real graphics card does far better than this sandbox; the point is that **motion adds nothing to what drawing the still model already costs.**
- **Making new geometry every frame is the thing to avoid:** about five times the render call's cost at 30 bodies (the upload), and it grows with the mesh; with the real kernel in the loop it would be seconds. The matrix route keeps the geometry the kernel made once.
- **What the app has to change (not done here, this is a prototype):** its viewer moves **one group with one matrix** (`bodyMatrix`, `bodySplit` in `frame.ts` and `ui/view.ts`, made for dragging one body). A mechanism needs **a matrix for each moving body**: the viewer must keep one mesh per body (the kernel's face ranges already say which triangles are whose) and take a list of matrices from the frame. A one-time split when the kernel answers; no cost per frame.
- **Not tested:** a real graphics card (none in the sandbox), a model of tens of thousands of triangles a body (gears with many teeth), the cost of the app's own frame (`frameOf`, 0.6 ms on a scene of 1,659 parts, was measured separately in the app and is small), and collision checks during play (the exact ones are kernel booleans and are far too slow per frame: they would be a separate sweep, not part of the tick).
