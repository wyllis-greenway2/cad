# CAD: working agreement

A parametric solid modeler for functional 3D printing. Vision, target user and scope are in
`docs/origin/CAD_Blueprint.original.md` (written by the human owner, kept untouched).
Current decisions live in `docs/decisions/`. This file is the short version of how we work.

## Session start (every session, in order)
1. Read this file.
2. Read the **last entry** of `docs/handoff.md`, then `docs/roadmap.md`.
3. Run `python3 tools/check_docs.py`. Fix anything it reports before other work.
4. If the human has not said what to do, ask; do not guess from the roadmap alone.

## The record
- `docs/decisions/*.md`: one file per principle, invariant, decision or open question. Format below.
- `docs/human-input.md`: **verbatim** human input that steers the project (provenance record).
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
12. **Session end:** append a handoff entry, run the check, commit, push to the designated branch.

## Entry format (`docs/decisions/<id>.md`; copy `_TEMPLATE.md`)
Front matter, then a `# Title`, a body, and `## Rationale`. Id prefixes: `prin_`, `inv_`, `dec_`, `q_`.
Kinds: `principle` (could in theory admit an exception), `invariant` (zero exceptions, checkable),
`decision`, `question` (status `open`). Statuses: `accepted`, `provisional`, `open`.

## Git
Develop on the branch the session is assigned. Commits made by Claude carry Claude's attribution;
human-authored changes should be committed under the human's own identity.
