# Handoff log

Append-only. One entry per session. A new session reads the last entry first.

## Handoff 001 — 2026-11-04
**State:** Repo was empty at session start. Design discussion happened (see `docs/human-input.md`), and
the project record was set up: `CLAUDE.md`, `docs/decisions/`, `docs/human-input.md`, `docs/origin/`,
`tools/check_docs.py` (+ CI workflow). The human's original blueprint is preserved untouched in
`docs/origin/`.

**Accepted by the human:** web-first with a portable core (`dec_platform_web_portable`), the human-input
record (`dec_human_input_log`), a lean version of the Mosaic method (`dec_lean_project_structure`).

**Not yet decided (open questions in `docs/decisions/`):** geometry kernel (OCCT vs custom vs hybrid),
the role of the grid, how geometry references stay stable, which constraint solver. The AI gave
recommendations on these; the human has not approved any of them.

**Next:** (1) create `docs/licenses.md` (the human asked for this in `in_007`); (2) human decides
`q_kernel_choice`; (3) vertical-slice spike with a test corpus; (4) revised blueprint.

**Notes for next session:** commits so far are authored under the Claude identity in this
environment. Ask the human whether they want to commit under their own identity as well.
