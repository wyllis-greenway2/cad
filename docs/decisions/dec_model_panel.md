---
id: dec_model_panel
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_546, in_547, in_556
date: 2026-11-16
depends_on:
  - dec_history_navigation: the Steps tab is that History, unchanged
  - dec_hidden_bodies: the Bodies tab is that list, unchanged
  - dec_sketch_recipe_synced: the Sketches tab shows the names and statuses that entry decided; it fixes what the status means
---
# The Model panel: one panel, three tabs (Steps, Bodies, Sketches)

**What the human asked (`in_546`, `in_547`, `in_556`):** one place to look at the model, with a filter for what is shown (steps, bodies, sketches, later constraints and parameters), built on the ids that exist; third item of the agreed order.

**What is built, and the choices that were mine**
1. The History and the Bodies lists are the tabs **Steps** and **Bodies** of one panel titled **Model**; a new tab **Sketches** is added. The ⋯ menu's Bodies and History entries open the panel at their tab. Groups stays its own list.
2. **Sketches:** one row for each figure a step (extrude, revolve, loft, sweep) made a body from, named in the order of the steps (**Sketch 1, 2, ...**), with a second line: the step that took it and a status. The pencil on an extrusion's row shows or puts away its sketch in the picture (the existing control).
3. **Status** (from the steps after the sketch's own that act on its body, taken by the body's name): *as drawn*; *carried by* a move, turn or scale; *changed by* a push or pull; *the body has changed since:* a fillet, a hollow, a cut, a reshape (the last such step is named).

**Not done (each stays for later, with the rest of the order of `in_546`):** the filters Constraints and Parameters (Parameters wait for named parameters, the next item); the rows of each kind listed **under their owning step** in one tree; the status *unused* (a drawn figure no step has taken) and *detached*; names that are **kept for good** — the names here are the order of the steps now, so taking a step out renumbers the ones after it (that needs a stored name on the figure); a sketch's row selecting or editing the sketch; status that sees a push of a face that is not on the sketch's body by ref.

## Rationale

The tabs reuse the two lists the human already works with and add the one list the sketch decision needs, without a second way to open each. The status is read from the steps' own parameters, so it needs no new stored data; stored names are the part that cannot be done without a data change, so they are left as a stated limit rather than guessed.
