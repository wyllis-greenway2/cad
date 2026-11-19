---
id: dec_progressive_open
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_1001, in_1002
date: 2026-11-18
depends_on:
  - dec_per_body_checks: bodies are kept and described one at a time by their own solid; a model made in pieces uses that, and the history and answers it leaves are the ones that decision bounds
  - dec_gear_standin: a ghost of what is being made, drawn from the commands alone, is that decision's idea; here for every part of a model of many parts apart
  - dec_open_and_survive: opening derives the scene quickly and keeps the last picture; this adds the pieces
  - dec_gear_speed: the 60 second limit and the thread's restart are its rules; each answer of a model made in pieces is a sign that the job is alive
---
# A model of many parts apart is made in pieces, nearest the eye first, with a box for each part not made yet

**Approved (`in_1001`, `in_1002`):** the smallest slice of Phase 1 of `q_progressive_load`.

**The class.** A graph is made in pieces only when it has at least 24 solid steps and **every one is a push of a sketch of its own into a body of its own** (`extrude`, mode `new`, the first `add`, with its holes; a plain polygon or circle sketch with a frame and a number for its depth) and in the chain the graph makes. Anything else in it (a fillet, a move, a cut, a revolve, a loft, a sweep, a gear, a pattern, a draft or a sibling figure) means **the whole graph is made whole, as it always was** (`compiler/kernel/pieces.ts` `planPieces`, `ghostsOf`). The independence of such parts is what `prototypes/progressive` has shown (groups built alone and in other orders give the same bodies, volumes, boxes and face names).

**The plan.** The parts' boxes are worked out from the sketches and depths alone (the ghosts); parts whose boxes meet (0.5 mm) are one piece, built together; the pieces are put nearest the eye first (the eye is the camera's place, `engine.eye`, set every frame; it is not part of the question, so the same answer is kept whichever it was).

**In the kernel's thread** (`kernel-pieces.ts`, `kernel-worker.ts`): each piece is made alone (a graph of its own steps), **the first part at once and then an answer of the parts so far** every 200 ms or a fifth of the time spent, whichever is more (`partial: { done, total }`); the answers of the pieces are put together (`compiler/kernel/merge.ts` `mergeAnswers`: the vertices and triangles one after the other with the faces' and corners' numbers moved on, each face and edge saying which body it is of, the volumes added, the boxes joined; its own copy of every buffer, since a sent answer gives its buffers away) and the whole answer is the same as the whole graph's (`test/pieces.test.ts`). The worker lets messages in between answers, and **a newer question stops the job** (`{ cancel: id }`, answered `cancelled`): the parts made stay on the screen and the new question is posted.

**In the page** (`kernel-async.ts`, `interaction/standin.ts`, `ui/view.ts`, `interaction/frame.ts`): an answer so far is the picture at once (`stale` stays set until the last); each answer so far starts the 60 s limit again (a model of more than a minute of pieces is not stopped while they come); **a box is drawn for every part not made yet, from the scene's steps alone, as one mesh**, and goes as its body is made; the working sign says **"Building N of M parts…"**.

**Measured** (the built app in headless Chromium, parts apart, `prototypes/progressive-load/browser.cjs`): 100 parts: boxes drawn after 0.66 s, all parts after 1.9 s (3.6 s before); 300 parts: boxes 1.3 s, all parts **4.4 s (12.9 to 17.5 s before)**; 1000 parts: boxes 4.8 s, all parts **14.6 s (past the 60 s limit before)**; the longest the page was away from a 25 ms timer 0.5 s at 300 parts, 1.4 s at 1000; an edit made half way through 300 parts stopped the job, the edit was made and the 300 parts were there 1.9 s later with the edited depth. **The time to the boxes is the page's own replay of the commands** (0.8 s for 300 parts, 4.1 s for 1000), not the kernel.

**Tests:** `pieces.test.ts` (the plan, the pieces' bodies and volumes, the answers put together, buffers), `kernelpieces.test.ts` (the order, the first part at once, stopping, the page's handling of an answer so far, a newer question, the limit restarted), `pieceghosts.test.ts` (the boxes, the working sign).

**Not done (and why):** ghosts **before** the replay (the boxes can be had from the saved text in 6 to 22 ms, `prototypes/progressive-load`: they would need a state of the page that shows them before a scene exists); parts that touch (one piece: a long chain is made as one); parts with fillets, holes, moves, gears and other kinds (the table `docs/progressive-levels.md` and the harness say what has to be known about each first); picking a ghost; the memory over thousands of pieces (the answers are kept as made until the last); the page taking in each answer so far costs the page about as much as a frame (not separated).

## Rationale

The measured cost of a model of many parts was the square of the parts (the chain of steps made onto the one before), the time to a first picture the whole of that, and the limit of the kernel's 60 seconds; a model made piece by piece costs a line, shows what is made as it goes and ghosts for the rest, and a question that overtakes it stops it. The class is the one the tests have shown to be independent; everything else is untouched.
