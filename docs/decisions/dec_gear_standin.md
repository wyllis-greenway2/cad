---
id: dec_gear_standin
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_702, in_707, in_804, in_806
date: 2026-11-17
depends_on:
  - dec_gear_speed: the measured cost of a heavy gear's body that this hides while it is made; a change to how fast the body is made changes how often the stand-in shows
  - dec_drag_preview_without_kernel: that decision says what is drawn is never an estimate; the stand-in is an estimate, so it is drawn so that nobody can take it for the part (rule 2), and nothing that needs the true shape uses it (rule 3)
  - dec_gear_tool: the gear's record (plane, centre, numbers) is what the stand-in is drawn from, with no kernel
---
# A gear's body that is still being made is drawn as a plain disc

**Asked (`in_702`, approved `in_707`):** gears (and so much else) take a long time to come out of the kernel; while that is so, draw each gear's body as a plain disc, and settle to the real gear when it arrives.

**The rules**
1. **When.** The kernel is working (`outcome.kernel.stale`) and the step that makes a gear's body (an extrude or a twist of the gear's outline, a worm wheel's loft) is not in the answer that is being shown (the step is new; nothing of it has been drawn yet). It is drawn once the wait has lasted 250 ms, so a gear that comes at once is never preceded by a flash. A gear whose body is already drawn is **not** replaced: an edit that waits for the kernel keeps showing the old gear, as it does now.
2. **What.** A flat, ghosted disc (a ring when the gear has a bore or is an internal gear) at the gear's outside diameter and the step's depth, on the gear's own plane, worked out from the gear's record alone (`standin.ts`, no kernel). Translucent grey with a faint outline, so it reads as a place holder, not as the part.
3. **What it is not.** It cannot be picked, hovered, measured, exported or used for clearance and overlap: those already wait for the kernel (`stale`), and the stand-in is drawn outside the scene.
4. **A label (`in_804`).** A small dark pill on the middle of each disc says **Building…**, and after two seconds how long (**Building… 5 s**, counting): so the grey disc reads as a place holder and a long wait is not mistaken for a hang. It appears and goes with the disc (`ui/standinlabel.ts`, the words in `standInWords`); it takes no clicks.
5. **A worm (`in_806`).** A worm's heavy step is its thread (a helical sweep; the core is quick): its first thread step is drawn as one disc as long as the worm, at the thread's outside radius, along the worm's axis from one end, with the bore as its hole. It is measured at 1 to 2 s a worm in the page. A hand-drawn cylinder (an extrude of a circle) is not given a disc: it comes from the kernel in a few ms. A hand-drawn sweep along a bent path took 0.1 s (one arc) to 0.7 to 1.7 s (three to eight arcs) in a rough measure; it is not given a disc, since a disc is the wrong shape for a body that follows a path and the person's own sketch and path are already on the screen (a stand-in for it would need its own design: a tube along the path, say).

## Rationale

The gear sketch is on the screen at once (the gear record makes its parts without the kernel) but its body can take seconds, so the page shows a bare outline and nothing happens. A disc of the right size and place tells the person what is coming, and the real gear replaces it with no change of place. The disc is exact in place and size at the tips and is wrong only in being a disc, which is why it is drawn as a place holder and why rule 1 does not use it over a gear already built.
