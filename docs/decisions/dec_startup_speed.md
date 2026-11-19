---
id: dec_startup_speed
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_990
date: 2026-11-18
depends_on:
  - dec_gear_speed: the speed work is recorded there (the stand-ins, the kernel thread's restart); this is the same work for the time before the first answer, and a change to the kernel thread's life (`kernel-async.ts`) changes what starts it
  - dec_description_cache: the kernel's kept answers are looked for once the thread is up; what starts the thread does not change them
---
# The kernel's thread starts at once, and the page's own code does not carry the kernel

**Measured** (a built app, local server, headless Chromium, `in_990`): the app is ready after 2.5 s and the first kernel answer comes after 4.5 to 5.4 s from opening the page; the build is a 2.2 MB script (655 KB compressed), the kernel's 23 MB of WebAssembly (7.3 MB compressed) and a 0.5 MB worker. At 4 times slower the page is ready after 2.9 s and the answer comes after 5.4 s.

**Done (`in_990`)**
1. **The thread starts first** (`vite.config.ts` `earlyKernel`): the built page has a small inline script ahead of everything that starts the kernel's worker (`window.__earlyKernel`), so it fetches and compiles the WebAssembly while the app's script is read (the worker was made at 24 ms, not after the 2.5 s the app takes to be ready); `kernel-async.ts` takes it once, and a restart makes its own. Only in a build (the development server has no such file name).
2. **The page's own code does not carry the kernel:** `main.ts` loaded the kernel (the geometry library, 0.5 MB compressed) for the case that the thread cannot start; it is now loaded only then (`import()`), and `interaction/api.ts` does not export it. The app's script 2162 to 1658 KB (655 to 498 KB compressed).
3. Tests: `kernelmemory.test.ts` (the early thread is used once).

**Result:** the first answer 5.4 s to 4.5 to 4.8 s at normal speed; no change at 4 times slower (there the page's own reading is the longer).

**Warm-up tried and dropped (`in_991`, `prototypes/kernel-warmup`):** from the kernel being up to the first answer is 1.4 to 4 s for models the kernel makes in 0.1 s in Node; three models made first (7 to 8 s of the kernel's time) took 0.5 to 1.2 s off the first real one, and the larger part of a first load (1.6 to 2.6 s of 4 s) is the page's own first run, which the kernel cannot warm. Not built. The kernel's file is cached by the browser when the server says so (a deployment matter: the file name carries its hash, so it can be kept for good).

## Rationale

Every visit waits for the kernel before anything is made; starting it first and not reading code the page does not need are free of any change to what the app does. Both were approved as a step (`in_990`).
