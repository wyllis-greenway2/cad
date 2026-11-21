---
id: dec_world_view_spec
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_1433
date: 2026-11-21
depends_on:
  - dec_rebuild_by_requirements: the section's requirements are the list that decision calls for, and its tests are written against them
  - prin_input_agnostic: the camera takes mouse, trackpad and touch through one set of intents
---
# The world view and camera: the requirements are `docs/rebuild/world_view_requirements.md`

The AI drafted the list of 40 requirement rows from the human's recorded input and from what the human tried by hand while `next/` was built; the human approved it (`in_1433`). It is the specification of the world view and camera: its rows, the contracts it owns and the inputs it claims. A row is changed by editing that file and recording the human's words (rule 1); a test names the rows it protects, and `tools/check_spec.py` and `tools/affected_tests.py --root next` use the file to find what to re-test when a contract's file or a settings group changes.

## Rationale

The human asked for each section to be built from written requirements and tested against them (`in_1396`), and for tests to run only where a change can reach them (`in_1425`). A single approved list of rows, each with its contracts and inputs, is what both need.
