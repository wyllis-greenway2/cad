---
id: inv_manufacturing_boundary
kind: invariant
status: accepted
origin: ai-proposed-human-approved
human_input: in_543, in_544, in_561
date: 2026-11-16
depends_on:
  - dec_manufacturing_contract: this is the rule that keeps the contract the only way in and out
  - inv_kernel_boundary: same method for the same reason, one folder and one data format, checked mechanically
alternative_to:
---
# Manufacturing modules and the app meet only at the contract

**Accepted by the human (`in_561`) as proposed by the AI (`in_543`); not yet checked by any tool (the check script is not written).** Code of a manufacturing module (a route, the toolpath types, profiles, post-processors) may import only the contract types, other code of its own, and permitted libraries. It may not import the compiler, the kernel, the interaction layer or the UI. The app may import a module only through the registry, never its internals. Nothing a kernel or the app made (objects, handles, ids) crosses; only plain data does. When accepted it should be checked by a script like `tools/check_kernel_boundary.py` (the script is not written: production code is gated by rule 9).

## Rationale

Without a mechanical rule, one convenient import ties a slicer to OCCT or to a UI file and the modules stop being replaceable. This is the same reasoning as `inv_kernel_boundary`, applied to the other side of the model.
