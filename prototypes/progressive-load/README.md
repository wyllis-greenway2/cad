# progressive-load (prototype, `in_914`)

**Meant to learn:** how much of the time to a first picture, to the nearest parts and to the last part Phase 1 of `q_progressive_load` takes off a project of many parts: a ghost of every part from the commands alone, the parts grouped by where their boxes are, each group built alone in the order of its distance from the camera.

**Run (from `app/`):** `python3 ../prototypes/progressive-load/make.py 300 /tmp/synth-300.cad.json` (boxes apart, each a sketch and a push, as the app saves them), then `FILE=/tmp/synth-300.cad.json [WHOLE=1] node --test ../prototypes/progressive-load/run.test.ts` (`WHOLE=1` also builds the whole project in one go, cold, to compare).

**Method.** (1) Ghosts straight from the saved commands with no scene made (the corners drawn, the lines that join them, the push of each figure); (2) the same through the app's own open (`openSession` with a kernel that answers nothing) and its graph, for the page's own cost; (3) the parts grouped by the boxes meeting (a grid of cells, so not a square of the parts); (4) each group made into a graph of its own steps and built in the kernel, nearest the camera first, with the times when 1, 10, a quarter, a half and all of the groups are there; (5) the volumes and bodies of the pieces added up against the whole.

**Learned (Node, the real kernel; the page and the kernel one after the other, in the app the kernel's own thread works while the page does its own):**

| parts | ghosts from the commands | ghosts through the app's open | nearest 1 / 10 parts | all parts, piece by piece | the whole in one go |
|---|---|---|---|---|---|
| 100 | not timed | 0.38 s | 0.10 s / 0.29 s | 1.6 s | 2.6 s |
| 300 | **6 ms** | 1.34 s | 0.12 s / 0.34 s | 4.3 s | **21.0 s** (4.9 times) |
| 1000 | **22 ms** | 6.3 s | 0.12 s / 0.29 s | 12.2 s | not made: it would be past the 60 s limit (about 230 s by the square of 300's) |

- **A picture of every part after 6 to 22 ms** (the ghosts from the commands), not after the replay (1.3 s for 300 parts, 6.3 s for 1000, the page's own derivation: `dec_open_and_survive` made that a fifth of what it was and it is still the largest page-side piece).
- **The nearest parts are made in 0.1 to 0.3 s** whatever the size of the project; **piece by piece the cost is a line** (about 12 ms a part), where the whole in one go is a curve (2.6 s for 100, 21 s for 300): **1000 parts in 12 s where the whole cannot be made at all**.
- The pieces give the same bodies and the same volume as the whole (100 parts: 44480; 300: 134208), and the harness (`prototypes/progressive`) has shown the faces' names to be the same for parts apart.

**Not measured:** the page's work to take each piece's answer into the scene (its parts, its faces) and draw it; the kernel's memory over 1000 pieces (each piece's mesh is kept as made; a million triangles budget); parts that are not apart (touching ones are one group, a long chain of them is built as one); the answer in the browser, where the thread and the page work side by side.
