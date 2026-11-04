---
id: dec_human_input_log
kind: decision
status: accepted
origin: human
human_input: in_009
date: 2026-11-04
---
# Record human input and decisions verbatim

Human input that steers the project is kept verbatim in `docs/human-input.md`, and every decision entry
records its provenance (`origin`) and the inputs behind it (`human_input`). The human's original
documents are preserved untouched in `docs/origin/` with hashes. A tool refuses to let an entry be
`accepted` unless a human originated or approved it.

## Rationale
The human wants a clear record of their contribution so the project is not "only an AI project", which
matters if the code is ever licensed (`in_009`). The record is evidence of human authorship and
direction. It does not by itself settle legal questions: how much human contribution is needed for
copyright varies by country and is unsettled for AI-assisted work (in the US, prompts alone have
generally not been enough, while human-authored material and human selection, arrangement and
modification can be). Have an IP lawyer review the record before relying on it, alongside the
licensing review already planned.
