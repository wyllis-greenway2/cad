# kernel-warmup (prototype, `in_988`)

**Meant to learn:** how much of the first model's delay a warm-up of the kernel (making a few models before the person's first) removes, and what it costs.

**Run (from `app/`):** `npm run build`, `npx vite preview --port 5198`, then `node ../prototypes/kernel-warmup/run.cjs` (`WARM=`, `TARGETS=` name fixtures of `test/fixtures`).

**Method.** For each target model, in a fresh headless Chromium page of the built app: (cold) load it as soon as the app is up; (warm) first load three other models one after another (a rod with a fillet, a loft and a block, the human's sweep with a chamfer), each waited for, then the target. The answer's own numbers (`kernel.totalMs`, the worker's round trip) are read as well.

**Learned (this container, 1x):**

| target | cold: all / kernel | after a warm-up of three models (7.2 to 7.8 s) |
|---|---|---|
| hollow block | 3.9 to 4.0 s / 1.4 s | 2.5 to 2.6 s / 0.9 s |
| three bodies grouped | 3.1 s | 1.8 s |
| a chamfer | 1.7 s | 0.9 s |
| a gear | 4.3 to 4.9 s / 3.5 s | 2.7 s / 2.3 s |

- **The cold cost of the kernel is 0.5 to 1.2 s, not 2 to 3 s:** the rest of what a first load takes (1.6 to 2.6 s of the 4 s) is the page's own (its code run for the first time, drawing in software in the headless browser), which a kernel warm-up cannot touch. An earlier note ("the next model took 0.16 s") was a small model after three others.
- **The warm-up itself is 7 to 8 s of the kernel's time** (three models, each waited for) for 0.5 to 1.2 s saved on the first real model, and it would delay a first action that comes sooner than that (a person who draws a square and pushes it in the first seconds would meet a busy kernel).

**Conclusion:** not worth building. The time is better spent where the page's own first run is (not measured: a code split of rarely used tools, or a smaller first screen).
