# The batch merge routine

How work from the other Claude branches gets into the testing branch, `claude/inspiring-pascal-l342k7`,
which the human tries with `LAN=1 bash tools/preview.sh`. Asked for in `in_834`, `in_835`; the check rule is `in_833`.
**The hourly scheduled task is disabled (`in_1576`, 2026-11-25):** it ran every hour from 2026-11-18 to 2026-11-25. The routine is run by hand when the human says "merge", or by each session merging its own work.

## The rule that stops the endless chase

1. `git fetch origin` **once** at the start. Write down the tip of every `origin/claude/*` branch and of the testing branch.
2. Merge **those tips** only. Never fetch again during the run: what is pushed while it runs waits for the next run.
3. Push the testing branch once at the end (a plain push; if it was rejected because the testing branch moved, merge its new
   tip once and push again; that is the only second look allowed).
4. End the run. Do not look for more.

## One run

1. Read `CLAUDE.md`, the last entry of `docs/handoff.md`, `python3 tools/check_docs.py`. Work on a branch named for the
   session; push the result to `claude/inspiring-pascal-l342k7` (the human approved this, `in_775`, `in_816`, `in_828`, `in_833`, `in_835`).
2. Start from the testing branch's tip. List the branches that have commits it lacks (`git rev-list --count HEAD..origin/<b>`).
   Nothing to merge: stop and say so in one line (no commit, no handoff entry).
3. Merge each in turn, smallest first. **Numbers:** every session counts its `in_NNN` inputs and handoffs from the last it saw, so
   the incoming ones often reuse numbers the testing branch has. The testing branch's numbers stand: renumber the incoming
   **new** entries to the next free numbers, everywhere they are cited (docs, decisions' `human_input`, code comments), and
   map the references in their new lines to numbers they renumbered before. A human input that was dropped by a session's own
   merge is restored word for word from that branch's history, never rewritten.
4. **Conflicts:** docs (`human-input.md`, `handoff.md`): theirs first then ours, entries in number order. Code: join both sides
   (the lists of tools in `pointer.ts` and the ring tests are the usual ones). **A conflict that cannot be joined safely
   (two sides change the same logic differently): abort that branch's merge, leave it out, say which and why in the handoff
   entry.** Never guess; never delete the other side's work.
5. **Quick checks:** `npm run typecheck`, `npm run unused` (in `app/`), `python3 tools/check_docs.py`, and the tests near what
   changed (`test/tools.test.ts` and `test/iso606.test.ts` when tools were added).
6. Record: the human's request in `docs/human-input.md` only when one was given; a handoff entry for the run (what was merged,
   the renumbering, what was skipped); commit; **push to the testing branch**.
7. **Full suite** (`npm run check` in `app/`, about 7 minutes) in the background after the push, by what the merge touched
   (`in_833`): docs and prototypes only: none; app code, no conflicts: about one in three; app code with real conflicts, the
   kernel (`app/src/compiler/kernel`) or shared files (`gearscene.ts`, `tools.ts`, `pointer.ts`, `entry.ts`, `frame.ts`): every time;
   and one at the end of a batch of merges. The 144-post scaling test is flaky under load: run it alone before calling it a failure.
   A real failure: fix it in a following commit and push, and say so in the handoff entry.

## Numbers

The next free `in_NNN` and handoff number are the highest in `docs/human-input.md` and `docs/handoff.md` plus one.
