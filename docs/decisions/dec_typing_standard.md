---
id: dec_typing_standard
kind: decision
status: provisional
origin: ai-unreviewed
human_input: in_235
date: 2026-11-08
---
# What typing a number does with something selected

The human, `in_235`: "can we just have systemwide standards for what happens when you click a line? I imagine if you click a line and start typing, then it should modify the length constraint. If you draw a square, then click an edge of the square, you would expect that edge that you selected to be focused, but typing apparently just extrudes the square, not modifies the length of the edge you selected. Lets see if problems like this exist elsewhere too."

The rule (the table is the AI's proposal, to be confirmed): **a number typed with something selected goes to that thing's own number; the whole thing it belongs to is only extruded, pushed or moved when it is itself what is selected.** Enter locks it as a constraint (one undo takes it back); Esc or the first undo puts it away.

| Selected | Typing sets |
|---|---|
| one side of a sketch | its length (locked) |
| a circle | its diameter |
| an arc | its radius (not the length of its chord) |
| two sides that meet | the angle between them |
| two corners, or a corner and a side | the distance |
| one corner alone | nothing |
| the figure itself (a closed sketch, its face) | the extrusion distance |
| a side or corner of a sketch that has a body made from it | the same numbers as above (the sketch is hidden, so only through the History button) |
| an edge of the body | the fillet (or, negative, chamfer) size |
| a face of the body | push or pull distance |
| the body | move along the chosen axis |

Found and fixed with it: a side or a corner of a closed sketch used to take the whole figure for its object, so typing extruded the square; and the arrow offered to type over could be the length of an arc's chord while the bubble showed its radius.

## Rationale

One answer to "I selected X and typed a number" that does not depend on the order things were drawn in. The table follows the numbers the bubbles already show (`measureAction`), so what is typed is what the bubble would have shown.
