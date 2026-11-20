---
id: dec_open_and_survive
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_996, in_997
date: 2026-11-18
depends_on:
  - dec_per_body_checks: the history's snapshots (item 13) and the kept answers are what a lean replay and a kept picture build on
  - dec_gear_speed: the kernel thread's restart and its limits (60 s, the memory) are its rules; the memory stop extends them
---
# Phase 0 of the progressive loading plan: open quicker, keep the last picture, keep a copy, stop before the memory does

**Approved (`in_996`, `in_997`):** Phase 0 of `q_progressive_load` (an open question that these changes do not wait for; its measurements, in `q_limits_and_failures`, are what they answer: a 1000 step project froze the page 33 s at open; a model past the kernel's 4 GB crashed the tab; a step over the 60 s limit left the model blank; no copy of the work was kept).

1. **Open derives the scene now and then, not after every command** (`history.ts` `replay`): a history made only of the commands that add (`addPart`, `addRelation`, `addStep`, alone or in a batch) is applied command after command and the scene derived every 64 and for the last 31; the snapshots between are lean (derived when gone back to, `sceneAt`). **Any other command in the history takes the way it always had** (a scene derived afresh is not always the scene derived step by step: a differential test over every fixture found that for a history with other commands, so they are not trusted to the short way). Page-only, 300 parts 4.0 to 1.1 s, 1000 parts 54 to 5.3 s; the final scene is the same (`test/replayfast.test.ts`).
2. **The last good picture stays** when a step cannot be made (`kernel-async.ts` `failedResult`): the answer to a job that failed or was stopped carries the last answer's mesh, bodies and faces, with the error on the step that asked: the model stays on the screen with the step marked, not a blank. (A project that fails on opening, with no earlier answer, is still blank: the ghosts of `q_progressive_load` are for that.)
3. **A copy of the project is kept in the browser** (`platform/autosave.ts`): a moment after each change (once for a run of changes, 1.5 s) and when the page is hidden or closed; the copy of the session before this one is kept for a restore (⋯ then **Restore session**, and a message when the page is opened); a project too big for the browser's storage is not kept and the person is told once. An empty session does not replace the copy of a crashed one.
4. **The kernel stops before its memory does** (`interpreter.mjs` `memoryStopMb`, 3300 MB of 4096): a step that would begin above it, and the steps after it, are answered with "the model is too big for the kernel's memory…"; the thread is restarted before the next job whatever its size at its first answer.

**Tests:** `replayfast.test.ts`, `autosave.test.ts`, `kernelmemory.test.ts` (the kept picture, the memory stop, the restart).

## Rationale

The human approved the first phase: the changes that turn the measured freeze, blank screen, lost work and crash into a quicker open, a kept picture, a restorable session and a message.

## Built: no refusal in the middle of a job, and a warm thread (`in_1275`)
The kernel's memory only grows, so its thread is restarted (`kernel-async.ts`). Measured on a heavy helical gear: a push of a face grows it 260 to 650 MB, so a thread at 2900 MB was refused part way (the step said "too big for the kernel's memory") and the page showed a failure; and a restart meant the next edit made the whole model again from nothing (15 s for the final steps alone). **Now:** (1) the thread keeps the most that recent jobs grew it by (not the first, which makes the whole model) and restarts before a job it would have no room for (`tooFull`: its size plus that, a little over, is past 3300 MB), with a job waiting or not; (2) a step refused for want of memory is not shown: the thread is restarted and the job made again once on the new one (a second refusal is shown); (3) a new thread, once ready and with nothing asked, makes the last whole answer again so the model is warm for the next edit; not for a model that is over the limit from its first answer (that would be made again for ever). **Not done:** the thread's own growth (the leak is not found, `Handoff 1126`) and the cost of a step (the boolean of a push on a helical gear, 3 s, is not changed by the flags I tried: OBB, non-destructive, no inversion check).
