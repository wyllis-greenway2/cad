---
id: dec_description_cache
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_454, in_455, in_456
date: 2026-11-15
depends_on:
  - dec_kernel_hybrid: the kernel runs on its own thread and answers a graph with plain data; the cache stores those answers
alternative_to:
---
# A cache of the kernel's answers that outlives the page

**The idea (`in_454`):** show the model's meshes at once, like a game, and bring in the exact values only where they are needed. **What it is here (`in_455`, `in_456`):** the kernel's answer for a graph (the meshes, the faces and edges a pointer can pick, the volume, the boxes) is kept in the browser's own storage (IndexedDB) under a key made of the whole graph and the version of the kernel. When a file is opened and its graph has been answered before, the answer is there at once and the model is drawn and can be picked while the kernel's thread goes on to work the model out; its answer replaces the kept one (they are the same: the kernel is deterministic).

**Rules**
1. **The key is the graph itself and the kernel's version** (a SHA-256 of the graph's text, and of the kernel's source files and libraries, found when the app is built). Never a short hash; a change of the kernel, the library or the settings of the mesh never finds an old answer.
2. **Only whole answers** (not the rough "draft" or the "lite" ones made while a size is dragged), and only after the answers have stopped coming for a moment, so that dragging writes nothing.
3. **What comes back is checked** (the arrays are what they should be); anything else is ignored as if it were not there.
4. **The kernel's own answer still comes and replaces it.** A kept answer is the kernel's answer for the same graph, so it is as exact as one that has just come, and steps are made from it as from any other. What is not there yet is the kernel's own work (its shapes): the first change after opening has to make the model, and the model is worked out again in the thread while the kept answer is shown.
5. **Bounded:** the newest few answers, and a limit in bytes; the oldest go first. It can be cleared from the menu.
6. **Off while developing** (the version of the kernel's source is found when the app is built, so a change made after the dev server started would not be seen): on in a built app, or with `?cache=1`.

## Rationale

Opening a file or coming back to one costs the kernel's whole work (a few seconds for a model of lofts) although nothing has changed since it was last answered. The answer is a pure function of the graph and the kernel, so keeping it is safe if the key says both. It also makes undo and redo across a reload quick. What it does not do is keep the kernel's shapes: the first change after opening still has to make the model; keeping those is a separate step, taken if the first change is still too slow.
