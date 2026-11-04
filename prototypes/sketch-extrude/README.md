# sketch-extrude (THROWAWAY prototype)

Approved as the next experiment in `in_013`. It decides nothing by itself. Never import this code from
production code (CLAUDE.md rule 9).

**Meant to learn:** does the blueprint's core interaction work (draw on a plane, see closed regions, pick
one, drag a handle to extrude with live preview, pull below the plane to cut)? Is OCCT in a worker fast
enough for a live drag? Does the architecture split (pure sketch logic / view / worker) hold up?

## Run
```bash
bash tools/preview.sh            # from the repo root: pulls, installs, opens http://localhost:5173
```
or `cd prototypes/sketch-extrude && npm install && npm run dev`. Tests: `npm test` (9 tests).

## Try this
1. Press **R**, click two corners (watch the yellow snap square and blue dashed inference lines; hold
   **Shift** to turn snapping off). **C** circle, **L** polyline (click the first point or press Enter to close).
2. Press **V** (select), hover a closed region (it brightens), click it. The view tilts to 3D.
3. Drag the yellow arrow up. A green ghost appears instantly; the exact OCCT result follows. Or type a
   distance. **Enter** applies, **Esc** cancels.
4. Press **T** (sketch on the top face), draw a circle, select it, drag the arrow **down**: it cuts.
5. **Ctrl+Z** undoes the last feature and puts its sketch region back. Open "Live graph" to see the model
   as JSON.
Middle or right mouse drag (or Space+drag) pans, the wheel zooms, left drag orbits in 3D.

## What is here
- `src/sketch.mjs`: pure geometry: snapping, inference, closed regions, hit tests, region to sketch-op.
- `src/interaction.mjs`: pure drawing-tool state machine (rect, circle, polyline).
- `src/settings.js`: every threshold, duration and color. No magic numbers elsewhere.
- `src/main.js`: three.js view and input glue. `src/worker.js`: OCCT compile off the UI thread.
- `src/interpreter.mjs`, `src/oc.mjs`: copied from `kernel-slice` (plus a `polygon` sketch shape).

## What we learned (2026-11-04; scripted mouse in headless Chromium with software rendering)
1. **The whole flow works.** A scripted run drew a rectangle, selected it, dragged the arrow, applied,
   switched to the top face, drew a circle and dragged it down to cut. Final volume matched the closed
   form (20073.186 mm^3) and the operation list had no errors.
2. **Latency looks comfortable.** Steady-state drag round trips (UI to worker to mesh back) were about 20 ms
   for an extrude and about 30 ms for a preview with a cut. The first request of a drag was slower
   (60 to 150 ms, a cold path). The instant client-side ghost hides this. Coalescing (one request in
   flight, newest wins) kept it from queuing up. This was a laptop-class container with software
   rendering sharing the CPU, so real machines should do the same or better, but that is untested.
3. **Rounding input to 0.01 mm gives clean numbers** (`40.00 x 30.00`, not `39.999999`) without a grid
   rule on stored geometry. This is the blueprint's grid used only as input rounding (see `q_grid_role`).
4. **The graph stays small and readable.** Each feature is one `sketch` op plus one `extrude` op, with
   `mode: "cut"` when pulled below the plane. Undo needed no special logic.
5. **A bug class worth remembering:** my first tests assumed snaps would not trigger; the origin and
   edge midpoints are snap targets and silently won. Snap priority and discoverability will need design.

## What this does NOT show
- Nobody has used it with a real hand, trackpad or touch screen. Scripted events cannot judge feel,
  smoothness, discoverability or whether the arrow is easy to grab. That judgment is yours.
- No constraints or dimension editing; a sketch is consumed when extruded (undo restores it). No face
  picking: "top face" is just a plane at the body's highest z. No sketch on angled faces.
- A circle inside a rectangle is a separate region, not a hole. No region-with-holes extrude.
- Only extrude and cut: no revolve, fillet, shell or patterns. Single body only.
- Only tested in headless Chromium.
