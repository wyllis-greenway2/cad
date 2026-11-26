# Behaviours that might have to survive (candidates, not approved)

`in_1444`: no tests until the prototype is in a state the human wants to preserve. This is a list **for the human to approve, cut or reword**, taken from what the human has said (the input ids are the source). **The human has decided to approve none of it for now (`in_1615`): prototype fast and cheap, lock a behaviour in once it is right.** Nothing here is a requirement until the human says so; once one is approved it becomes a requirement row and a test names it (`check_spec.py`). Until then these are only what the dev checks and page checks happen to look at.

| # | Behaviour, in one line | Source | Approved? |
|---|---|---|---|
| 1 | Millimetres only; no unit switch. | in_1595 | |
| 2 | Hints and helpers only place; a constraint is made only when asked. | `dec_hints_place_only` | |
| 3 | Undo and redo are Ctrl+Z and Ctrl+Y only; the history list is only from the "..." menu. | in_1600 | |
| 4 | A right click makes what is valid, throws the rest away and puts the tool away; Esc throws the draft away, then puts the tool away, then clears the selection, then closes the menu. | in_1599, in_1600 | |
| 5 | A change that would break a constraint is refused in words and flashes the constraints that held it back, red, selected or not. | in_1611 | |
| 6 | A constraint or number is one mark standing on its part with one lock: green locked (applied), yellow open (offered, true as drawn and near). Locked marks and offers show when the part is selected; the offers for a part just made show for a few seconds, fading, even unselected. | in_1611 | |
| 7 | Numbers are typed as you draw (digits with no key first, Tab to the next, Enter makes the figure with the numbers locked, Esc gives up); a number is measured first and locked when asked. | `dec_dimensions_measure_then_lock` | |
| 8 | One rule for what is offered: new, or true as drawn and the solver would accept; never already said, never refused. | `dec_helpers_one_rule` | |
| 9 | Dragging a part keeps the constraints (a rectangle stays a rectangle), a locked length holds the drag back, one undo takes the whole drag back. | earlier sketch directives | |
| 10 | Three surfaces only: the circle menu (every tool always shown), notices (one stack at the bottom), the info bar (operations and body picks). | in_1598..in_1602 | |
| 11 | Three handles only: the mover orb, the pull arrow (face: push or pull; edge: round pulled out, chamfer pushed in), grab. | in_1604..in_1606 | |
| 12 | A body moved or turned by the orb is made as a `turn` about its middle then a `move`, and Esc puts it back. | in_1609, in_1610 | |
| 13 | A sketch extrudes (a boss, a pocket on a face); a face is pushed or pulled by the kinds the engine says it has. | engine requirements | |
| 14 | Save and open a model; export STL and STEP. | earlier directives | |

Not in the list on purpose: how it looks (sizes, colours, where a bubble stands), the order of items in a menu, the exact words of a notice. Those are free to change.
