---
id: prin_graph_is_truth
kind: principle
status: accepted
origin: human
human_input: in_001
date: 2026-11-04
---
# The operation graph is the source of truth

Geometry is derived output. The graph of operations is what gets saved; geometry is recompiled from it
on load and never saved as the primary artifact (like source code versus a compiled binary).

## Rationale
Human-authored: blueprint section 5, principle 1, and section 8. Gives undo, incremental rebuild, a
readable file format and a natural path for AI-generated operations.
