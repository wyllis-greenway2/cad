---
id: inv_no_logic_in_ui
kind: invariant
status: accepted
origin: human
human_input: in_001
date: 2026-11-04
depends_on:
  - inv_layer_adjacency: the UI-purity rule is a special case of the layer boundaries
---
# No business logic in the UI layer

The UI displays; it does not decide. Any conditional in UI code that involves geometry or operation
concepts belongs in the interaction or operation layer.

## Rationale
Human-authored: blueprint "Three Non-Negotiable Rules" (rule 2). Keeps the UI replaceable across web,
desktop and mobile shells.
