---
id: dec_rebuild_by_requirements
kind: decision
status: accepted
origin: human
human_input: in_1396, in_1444
date: 2026-11-21
depends_on:
  - prin_function_over_form: a section is finished only when it is correct, before the next begins
---
# The app is rebuilt from scratch, one section at a time, each starting with written requirements

The human decided (`in_1396`): start again from nothing, section by section, and for each section first **write down what really matters** (from what the human said while the prototype was built, which is kept in `docs/human-input.md`, and from how the current app behaves), then **build a prototype of it and iterate by hand** until it is in a state the human wants to keep, and only **then write the tests against the requirements** (`in_1444`: no tests before that; they would pin down what is still changing), refining the requirements as the prototype settles, until the written requirements and the app agree and the human is satisfied. Only then the next section. The requirements are kept in the new build. The first section is the world view and camera (`docs/rebuild/world_view_requirements.md`).

An earlier from-scratch start (`next/`, `in_1394`) was dropped (`in_1395`) because the world view lacked much of what the refined one had; its camera maths, input mapping and tests are in git at commit 42139c56 and can be reused once the requirements are agreed. The old app (`app/`) stays in place as the reference until sections replace it, and is parked at the branch `prototype-v1`.

## Rationale

The first attempt failed for want of a list of what mattered. The human's own words, recorded as the prototype grew, are that list. Writing it down first and testing against it makes "perfect in that area" checkable, and keeps behaviour the human refined from being lost or silently changed.
