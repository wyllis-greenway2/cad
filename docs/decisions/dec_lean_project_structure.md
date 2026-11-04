---
id: dec_lean_project_structure
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_007, in_008, in_009
date: 2026-11-04
depends_on:
  - dec_human_input_log: the provenance fields and the verbatim log exist because of that requirement
---
# Lean project structure, kept in the repo as text

The project record lives in git as plain text, not a database and not zip snapshots: `CLAUDE.md`
(working rules), `docs/decisions/` (typed entries with causal links), `docs/human-input.md`,
`docs/handoff.md` (session continuity), `docs/roadmap.md`, `docs/origin/`, and `tools/check_docs.py`
(mechanical checks, also run in CI). Ideas borrowed from the earlier Mosaic project: typed entries,
rationale once load-bearing, a causal test for links, preserved alternatives, mechanical enforcement,
and a session handoff. Mosaic's SQLite file, 42 protocols and zip workflow are deliberately left out.

## Rationale
The human asked for something lean that keeps both of us aligned (`in_007`), to learn from Mosaic
without copying its structure (`in_008`), and to work directly in the repo (`in_009`). Text files diff,
review and merge in git, and a fresh AI session can read them. A SQLite index can be generated from them
later if the record grows large.
