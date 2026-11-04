---
id: q_topological_refs
kind: question
status: open
origin: ai-unreviewed
human_input: in_001
date: 2026-11-04
---
# How do later operations keep a stable reference to earlier geometry?

The blueprint (sections 8 and 15) references geometry as operation deltas ("born / modified / destroyed")
but its example uses an index (`"index": 4`), which is the fragile pattern behind FreeCAD's topological
naming problem. The hard cases are a face splitting in two or disappearing after a parameter change.

AI suggestion, not approved: reference by query ("the top face born by op_002", "the edges between face A
and face B") with a fallback, as Onshape does. If OCCT is the kernel, its `Generated()`, `Modified()` and
`IsDeleted()` calls supply the delta data. Prototype evidence (`prototypes/kernel-slice`): index references changed for 8 of 15 edges after a side
notch; geometric queries found the corners but silently matched a 5 mm stub after a partial corner notch;
OCCT history through the raw bindings reported destroyed, modified and split references exactly, and
filleting the surviving named edges matched the closed-form volume. Not yet tested through fillet,
chamfer and shell, and replicad does not expose the history objects, so this needs our own thin OCCT
wrapper. Must be proven with a test: change an upstream parameter and
check a downstream fillet still attaches to the right edges.
