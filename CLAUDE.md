# CAD: working agreement

A parametric solid modeler: real CAD (exact geometry, exchange with other CAD programs, history); 3D printing is one thing it makes (`dec_scope_real_cad`, `in_1472`). Vision, target user and scope were first written in
`docs/origin/CAD_Blueprint.original.md` (written by the human owner, kept untouched).
Current decisions live in `docs/decisions/`. This file is the short version of how we work.

## Testing: test what you touched, and no more (read this first; the detail is rule 12)
- After a change: `npm run typecheck`, `python3 tools/affected_tests.py --root next --run`, and the **one** page check that covers it. Not a batch of page checks, and not the whole set again after a small fix.
- Before the handoff, **once**: `check_docs`, `check_spec`, `npm run checks`.
- A wide run (`checks:all`, many page checks) only before a merge or a milestone, or after changing what everything shares (`main.ts`, the camera's wiring, the engine); when a change touches something shared, say so and ask before running the wide set.
- Never start a second browser run while one is going (they share a port and the second fails).
- A check that fails on something you did not touch is pinned in `docs/roadmap.md`, not fixed on the spot (`in_1614`).

## Session start (every session, in order)
1. Read this file.
2. Read the **last entry** of `docs/handoff.md`, then `docs/roadmap.md`.
3. Run `python3 tools/check_docs.py`. Fix anything it reports before other work.
4. If the human has not said what to do, ask; do not guess from the roadmap alone.

## The record
- `docs/decisions/*.md`: one file per principle, invariant, decision or open question. Format below.
- `docs/human-input.md`: **verbatim** human input that steers the project (provenance record).
- `docs/sources/README.md`: index of every outside source read or looked up (status, rights, use, where recorded). Add a row when you read or look one up; the files of copyrighted sources are not kept in the repository.
- `docs/handoff.md`: append-only; one entry per session.
- `docs/origin/`: original human-authored documents. Never edit. Hashes in `SHA256SUMS`.
- `tools/check_docs.py` enforces the rules below mechanically. Never weaken it to make it pass.

## Rules
1. **Human input is recorded verbatim.** When the human gives a directive, preference, approval or
   rejection that steers the project, append it to `docs/human-input.md` in the same session, in their
   exact words (typos included). Never paraphrase inside a quote. Never invent or "tidy" human input.
   Never record an AI suggestion as a human decision.
2. **Provenance on every entry.** `origin` is `human` (the human decided or authored it),
   `ai-proposed-human-approved` (AI proposed, the human explicitly approved; cite the approving input in
   `human_input`) or `ai-unreviewed` (AI's own; the human has not reviewed it). An entry can be
   `accepted` only if its origin is one of the first two.
3. **AI recommendations stay `open` or `provisional` until the human approves.** A recommendation the
   human did not answer is not a decision. If unsure whether they approved, ask.
4. **Don't re-litigate accepted entries.** If you disagree, add or update a `question` entry and tell
   the human. Do not quietly build something that contradicts an accepted entry.
5. **Rationale is required** once another entry depends on this one (`## Rationale` section).
6. **`depends_on` only passes the causal test:** "would a change to the target force reconsideration of
   this entry?" Every link carries a one-line note saying why. Mere topic overlap is not a link. An
   accepted entry may not depend on an open question.
7. **Edit in place; git is the history.** Superseded or retired entries are changed or deleted, not
   kept as dead files. `alternative_to` marks a deliberately preserved Plan B.
8. **Look before you write.** Search `docs/decisions/` (grep) for related entries before adding one or
   before proposing code that touches the same area.
9. **Prototypes are free; production code is gated.** Anything under `prototypes/` may be built fast
   and thrown away with no prior decision. Prototype code is never imported by production code, and each
   prototype's README says what it was meant to learn and what it did learn. Code outside `prototypes/`
   needs an accepted entry behind it; otherwise propose it (as a `provisional` entry or a question) and
   ask. Promoting prototype work means rewriting or reviewing it first.
10. **Dependencies:** adding one means recording its license in `docs/licenses.md` first. No GPL or
    AGPL. LGPL needs the packaging care described there.
11. **Architecture invariants** (`inv_*` entries) are checked in code review and, where possible, by
    tooling. Violating one is a failed review.
12. **Session end:** append a handoff entry, run the check, run `python3 tools/affected_tests.py --run` (the tests that import, directly or through one file, what you changed; do the same right after merging another session's work, with `--since-merge`), commit, push to the designated branch. A test that checks what another session changed on purpose is brought up to date, not left failing (`in_1384`).
    For the rebuild in `next/`, **test what you touched, and no more** (`in_1711`):
    - *After each change, while you edit:* `npm run typecheck` (5 s) and `python3 tools/affected_tests.py --root next --run` (the tests that import what changed, **and** the tests of every requirement row that lists a contract whose file changed, `docs/rebuild/*_requirements.md`; under 2 s). A change you can see in a page: also the **one** page check that covers it (the list below), not the others.
    - *Before the handoff, once:* `python3 tools/check_docs.py`; `python3 tools/check_spec.py` (a test names the requirement rows it protects, `test("[C8] ...")`; no orphan tests, no unknown rows, no two sections claiming the same input; a new section reuses the human's inputs only by listing them in its claims, so a clash shows up); and `npm run checks` in `next/` (the dev checks, not tests, `in_1444`: no browser, about a minute; a name filters, `npm run checks -- helpers`).
    - *Rarely:* the whole set (`npm run checks:all`, about 15 minutes, which also runs the slow checks) and the browser test files (`npm run test:browser`; the sketching file takes about a minute and needs `--test-timeout=600000`, the default cuts it off) only before a merge or a milestone, or after changing what everything shares (the camera's wiring, `main.ts`, the engine). Do not re-run suites for what you did not touch.
    - *What covers what* (page checks, `npm run checks:all -- <name>`): the camera out of and back into a straight view `exitzoom-browser`; the camera looking at bodies (pivot, Reset, scale-free axes) `camerabody-browser`; the View menu and the body's look `wireframe-browser`; a pick showing its handle, the whole body and its orb `autohandles-browser`; round and chamfer `round-browser`; a sketch on a face `face-browser`; the face tools from the ring `tools-face-browser`; extrude `extrude-browser`; the Move tool and its orb `move-browser`; undo and the step list `undo-browser`; a pull flush with a face `flush-browser`; the "..." menu and files `more-browser`; the sketch's tools `sketch-browser`, typed numbers `typed-browser`, arcs `arc-browser`, dragging parts `drag-browser`, the helpers while dragging `drag-hints-browser` (about two minutes), the tangent `tangent-browser`; marks on a sketch: bubbles `bubbles-browser`, dimension lines `dims-browser`, an offer's arrows `moves-browser`; nothing left over when something is taken away `leftovers-browser`.
    - The checks in a real page (`*-browser.ts`) are **scaffolding, not a gate** (`in_1614`): do not rewrite them each time the look or the layout changes, delete one that only pins a layout, and write a test against a behaviour only once the human has said it must survive (`in_1444`; `docs/rebuild/artifacts_to_preserve.md` lists the candidates). A check that fails on something you did not touch is not yours to fix on the spot: pin it in `docs/roadmap.md` and say so.

## Entry format (`docs/decisions/<id>.md`; copy `_TEMPLATE.md`)
Front matter, then a `# Title`, a body, and `## Rationale`. Id prefixes: `prin_`, `inv_`, `dec_`, `q_`.
Kinds: `principle` (could in theory admit an exception), `invariant` (zero exceptions, checkable),
`decision`, `question` (status `open`). Statuses: `accepted`, `provisional`, `open`.

## Git
Develop on the branch the session is assigned. Commits made by Claude carry Claude's attribution;
human-authored changes should be committed under the human's own identity.
