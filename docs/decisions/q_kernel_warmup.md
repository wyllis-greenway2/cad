---
id: q_kernel_warmup
kind: question
status: open
origin: ai-unreviewed
human_input: in_903
date: 2026-11-18
depends_on:
  - dec_startup_speed: the time to the first answer after the kernel is up is what this is about; the early start and the split are in that entry
---
# Should the kernel be warmed up with a model of its own while the person is looking at the empty app?

**Found (`in_903`, built app in Chromium):** the first models the kernel makes in a fresh page take 1.9 to 3.6 s each though it makes them in 0.1 s in Node (the rod 2.6 s, two bodies 1.9 s, a hollow block 3.6 s), and then a different model took 0.16 s and a repeat 0.1 s. It is the first calls of thousands of WebAssembly functions (compiled when first called, then improved), a cost that does not come again for the same code. A persistent browser profile (a second visit) was not much quicker.

**The idea:** when the kernel is up, make a few small recorded models (a block with a fillet, a hole, a loft, a revolve) in the worker, in pieces between messages, so that a job that arrives in the middle waits for one piece only; throw the answers away. The first real model would then come in a fraction of a second instead of 2 to 3. **Costs:** the worker is busy for about 5 to 8 s after start (at normal speed; four times that on a slow device), a warm-up that is slower than the person's first action delays it, and the recorded models are another thing to keep up with the graph's format (a warm-up that fails is dropped). **Recommendation (the AI's, not a decision):** try it as a prototype first and measure how much of the delay it removes for a person who opens a file at once and for one who draws first; build it only if it takes most of the 2 to 3 s off.

## Rationale

A recorded finding and a proposal, not built: the change touches the kernel's thread and takes its time, and the human has not been asked.
