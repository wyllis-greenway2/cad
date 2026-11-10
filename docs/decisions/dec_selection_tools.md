---
id: dec_selection_tools
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_257, in_258
date: 2026-11-10
depends_on:
  - dec_stable_references: a group (and a "select similar") holds faces and edges of the body, which must be found again after the body is edited the way a fillet finds its edges; a change to how references are named changes how members are re-found
  - prin_input_agnostic: adding to and taking from a selection must be possible without a keyboard (touch), so the keys below are shortcuts for intents the page can also offer another way
---
# Selecting more, selecting less, groups, select similar, and a face's edges as one chamfer 

**Status: accepted** (`in_258`: "Yes lets build it, I will take your recommendations on all"; drafted from `in_257`). Built in the order given below; the entry says what is built as each part is.

## 1. A face as a way to choose all its edges for a fillet or chamfer

What exists today: selecting a face of the body shows its edges in blue, and **Offset** works on a face's edges (`faceEdges`, `interaction/offsetbody.ts`); but **fillet / chamfer only takes lines (edges) of the body** (`autoOp` in `operations.ts`: a selection of faces gets the push / pull arrow, a selection of edges gets the fillet / chamfer arrow). I found no record of fillet or chamfer ever having worked from a face: older handoffs list "fillet/chamfer on selected faces or edges" under "Next" and only the edges was built (`in_087`, `in_090`). So this is new, not lost.

Proposal: with one or more flat faces selected, **Fillet / chamfer (ring, F, B) rounds or bevels every edge on the boundary of the selected faces** in one step, exactly as if those edges had been selected one by one. The selection stays the faces (so the gear's top and bottom face selected together, with Shift, chamfer both outlines). One double arrow stands on the (first) face, not one per edge (a gear has dozens), and its number is the size for all. The step stores the same edges, found again by the same rules, that an edge-by-edge selection stores, so nothing new in the file. An edge that cannot take the size (the kernel refuses) makes the whole step refused with the reason, as now.

**Built** (`operations.ts`, `test/facechamfer.test.ts`): the arrow stands on the last of the face's edges, as for an edge selection.

## 2. Selecting and deselecting additively

What exists (`dec_interaction_spec`): **Shift + click** adds the thing under the pointer and, if it is already selected, takes it out; **Shift + drag-select** adds what is inside the rectangle. Gaps I found in the code (`selection.ts`):
- Shift + click at the *same spot* again does not take it out: it swaps the thing added last for the next candidate under the pointer (cycling). So deselecting a face you just added, without moving the pointer, is not possible. Also, where several things lie under the pointer (a corner, a line, a face) the click takes the top one, which may not be the one you want out.
- A drag-select can only add, not remove.
- There is no way to add or remove without a keyboard.
Proposal: (a) **Ctrl (Cmd on a Mac) + click does the same as Shift + click** (the other key people reach for; two keys, one meaning). (b) A Shift or Ctrl click on a spot where something under the pointer is **already selected removes that one**; cycling by repeated click stays on the plain click (it is "2 of 3 here" today). (c) **Ctrl + drag-select removes** what is inside the rectangle, Shift + drag adds, as now. (d) For touch: a small "add to selection" toggle next to the pill: while on, every tap adds or removes. (d) is later; (a) to (c) are small.

**Built** (a, b, c; d is later): Shift or Ctrl / Cmd + click toggles what is under the pointer every time (the swap is gone); Ctrl + drag takes out. `selection.ts`, `input/mouse.ts`, `control/box.ts`; `test/selection.test.ts`, `test/mouseadd.test.ts`, `test/boxselect.test.ts`. One change from the draft: a click on a spot toggles the **first** thing under the pointer only (it does not remove a lower selected one), so adding an edge of a selected face does not take the face out; a thing under the first one is reached by a plain click, which cycles.

## 3. Groups, layered

A **group** is a set of selected things the model remembers. Selecting any member selects the whole group; an operation on a group is the same as on the same things selected loose.
- Groups nest: grouping a selection that already contains a group makes a group of that group and the rest. **Ungroup breaks only the outermost group of the selection**; the groups inside stay (`in_257`).
- A group is part of the model (saved in the file), made and broken by commands, so it is in the history and can be undone (`prin_history_additive`).
- Make with Ctrl + G or the ring's "Group", break with Ctrl + Shift + G or "Ungroup"; a **Groups panel** (like Bodies and History) lists the groups as a tree, so any group, inner ones included, can be selected, renamed, deleted or ungrouped without picking it in the picture (this is also the touch way).
- **Reaching an inner group** from the picture: a click on a member selects its outermost group; a click on a member whose group is already selected goes one level in (the next inner group, then the single member). This is the same idea as the "2 of 3 here" cycle; the alternative is only the panel.
- A group of drawn parts or whole bodies is stable. A group of **faces and edges of the body** holds them by the same names fillets use (`dec_stable_references`); a member that cannot be found after an edit drops out of the group and the result line says so.
- What a group is *not*: not a body, not an assembly, no effect on how things are drawn or solved. It is only a selection that holds together.

## 4. Select similar (my view: yes, generic, with fixed visible rules, not only for repeats)

Your idea of offering it only for things made by a repeat does not work well: a drawn sketch repeat becomes ordinary copies with no memory that it was a repeat (`pattern.ts`), and a gear drawn by hand, or later imported, has the same need. A generic rule works in all of those. But "the same in some value" must be a small fixed list you can see, or it will surprise. Proposal:
- **Edges:** the same kind (straight, arc, circle), the same length (arc: the same radius and span, within 0.001 mm), and the **same angle between the two faces it lies between, convex or concave** (so the top edge of every tooth matches, the root edge of every tooth does not match the tip edge). **Not** the same direction: a turned copy of a tooth has its edges in other directions and must still match, and these three values do not change when a copy is turned or moved.
- **Faces:** the same kind (flat, round), the same area, the same radius if round.
- **Drawn parts in a sketch:** the same kind and length or radius.
- **Scope:** the same body (or the same sketch). Not the whole model.
- **How it feels:** with something selected, ring or menu "Select similar" selects all matches and says how many ("24 similar edges"). Shift + click takes a wrong one out (section 2). It then shows a small chip, one box per rule (kind, size, angle, direction), so one rule can be loosened (for example "same size" off, to take every straight tooth edge) and the selection updates. Strict rules first, loosen on request.
- **Not proposed:** a match by position ("on the same plane", "oriented the same way") as a default: it would find the gear's top ring but not its teeth.

## 5. Not here

The missing push / pull arrow on curved faces is `q_arc_wall_pushpull`; editing a repeat is `q_repeat_parameters`.

## Order I would build them in

1 (a face's edges for chamfer: small), 2 (a), (b), (c) (small), 4 (select similar: medium), 3 (groups: new data in the file, commands, a panel: the biggest of these), 2 (d) (touch).

## Questions that were asked (answered by taking the recommendation, `in_258`)

1. Section 1 as written (the faces stay selected; one arrow; one size for all)?
2. Section 2: Shift or Ctrl click on an already selected spot removes it, and the Shift "swap for the next candidate" cycling goes (the plain click still cycles)?
3. Groups: is "a click on a selected group's member goes one level in" the way to reach an inner group, or only the Groups panel?
4. Select similar: the edge rule above (kind, size, angle between faces; not direction), and the loosen chip?
5. Which first? I would start with sections 1 and 2.

## Rationale

All four ask for one thing: choosing many things for one operation quickly, without ending with a selection that is wrong (`in_257`). The face-to-edges link and the extra deselect routes are small and reuse what exists; groups and select similar are new concepts that should be agreed before they are built because groups change the file and the selection grammar that the rest of the interaction (`dec_interaction_spec`) is built on.
