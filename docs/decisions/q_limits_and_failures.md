---
id: q_limits_and_failures
kind: question
status: open
origin: ai-unreviewed
human_input: in_905
date: 2026-11-18
depends_on:
  - dec_per_body_checks: the costs of many bodies are recorded there (items 10 to 13); the limits below are what those costs add up to
  - dec_gear_speed: the 60 second job limit and the kernel thread's restart are its rules
alternative_to:
---
# How big a model the app takes, how it fails, and what to do about the hard failures

**Measured (`in_905`, the built app in headless Chromium, 1x, `prototypes/limits`)**

*Parts that are separate steps (a sketch and a push each), the project opened from a file:* 10 parts 0.4 s; 50 1.6 s; 100 3.6 s; 150 6.0 s; 200 8.3 s (the page frozen 2.2 s); 300 17.5 s (frozen 4.4 s, kernel 12.7 s): about the square of the parts, so **about 600 is where the kernel's 60 s limit is met**. 1000 parts: the history alone froze the page **33 s** and held 441 MB before the kernel began. Building by hand one part at a time is quicker per step (an add costs 0.1 s at 40 parts, 0.3 s at 100, about 1.5 s at 300: 257 s for 300), so a model that cannot be opened again can still be built.

*Parts by a pattern (a linear pattern is at most 200 copies, and says so):* nested patterns of a post: 20 bodies 0.3 s; 100 1.1 s; 221 7.6 s; 484 20 s; 784 44 s; 961 46 s **and 3.8 GB of the kernel's memory** (its limit is 4 GB: the thread was restarted after the answer). A step that takes more: the **whole page crashed after 46 s** (the memory, before the 60 s limit); a model whose steps take over 60 s at once (1100 bodies): the kernel is stopped, the step says "the kernel was still working on that after 60 seconds and was stopped: it cannot be made (try something smaller)", and **the model shows nothing** (no bodies) because there is no answer.

*Faces drawn:* one 200 tooth worm wheel is 2602 faces, 7800 edges and 72 thousand triangles (26 thousand scene parts); four are 10 thousand faces, 290 thousand triangles and 104 thousand scene parts: the page's own work at rest 6 to 23 per cent of its thread, the frames at 60 a second (a headless browser draws in software: a graphics card's own limit is not measured here). The kernel took 12 to 14 s for them. An imported mesh is refused above 12 thousand triangles, and at 2000 triangles takes 5.7 s.

**How it fails**
1. **Said, with a reason:** a pattern over 200 copies; a mesh over 12 thousand triangles; a step over 60 s (see above: but the whole model goes blank); a loft that cannot be made now says so.
2. **Freezes:** opening a project of hundreds of steps freezes the page (4.4 s at 300, 33 s at 1000: the browser may call it unresponsive).
3. **Crashes without a word:** the kernel's memory above 4 GB kills the page's tab after about 46 s of work; **the app keeps no copy of the work between sessions** (settings only), so what was not saved to a file is lost.
4. **Silent wrong answers:** none found in these tests (not exhaustive). The screen mesh of a body of more than 300 freeform faces is coarser by design.

**Proposals (the AI's, none decided)**
1. **Keep a copy of the project in the browser as it is worked** (local storage or IndexedDB, offered back when the app is opened again): cheap, and the one thing that makes the crash survivable.
2. **Stop before the memory does:** the kernel thread knows its size after every step; refuse a step that would take it past about 3.5 GB (restart, say "too big: try fewer parts") instead of the tab dying.
3. **Keep the last good picture** when a step cannot be made, instead of an empty model.
4. **Open a big project without freezing:** replay the history in pieces between frames, with a progress sign; and make the cold build of many separate parts less than the square.
5. Say the limits where a person meets them (a pattern's copies, a mesh's triangles) and when a model is getting near the memory.

## Rationale

The human asked how big a model can be and how the app fails; the numbers and the failure modes are recorded so that the choice of which to fix is theirs.
