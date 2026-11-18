---
id: q_collision_free_numbering
kind: question
status: open
origin: ai-unreviewed
human_input: in_835, in_834
date: 2026-11-18
depends_on:
alternative_to:
---
# Numbers that cannot collide, so branches merge with a plain `git merge`

**Asked (`in_834`, `in_835`):** merging the other sessions' work into the testing branch should be fast and automatic. Most of
the time of a merge is not the code: every session counts `in_NNN` inputs and handoffs from the last number it saw, other
sessions work at the same time, so the same number is used for different things, and each merge renumbers the incoming entries
and every place that cites them (docs, decisions, code comments). A merge that renumbers cannot be done by a tool without a
Claude in it. This entry asks whether the numbers should change so that they cannot collide.

**The idea (not decided):** a session numbers its own inputs and handoffs with a prefix that is its own (its branch's short
name), for example `in_cool-045` and `Handoff cool-017`, counting up inside the prefix. Two sessions then never use the same
name. The record's order is the order of the commits in git, as the file's order is, not the number. `tools/check_docs.py`
would accept the prefixed form beside the plain one (the 835 entries already there stay as they are).

**What it would change:** `CLAUDE.md` (the numbering sentence of rule 1), `tools/check_docs.py` (the heading patterns, the
reference check), the session-start text, and `docs/merge-routine.md` (no renumbering step). A merge would then be a plain
`git merge` for the docs, and a GitHub Action could do it every few minutes with no Claude (it would stop at a code conflict
and open an issue).

**Costs and open points:** a name is longer than a number; the reading order in a file is the order of merging, not of the
human's words in time, unless each entry keeps its date and time; `human-input.md` is the provenance record, so the form of
its headings is not changed lightly (the human's words are untouched either way); the old numbers cited in code comments
stay valid. Not built; nothing in `tools/` or `CLAUDE.md` is changed until the human decides.

## Rationale

Written as a question because it changes how the record is kept (rule 1) and the checker; the AI proposes, the human decides.
