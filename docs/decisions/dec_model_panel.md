---
id: dec_model_panel
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_546, in_547, in_556, in_566
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

## Second part (`in_566`)

- **Rows under their step:** in the Steps tab each step shows, indented under it, what it owns: its **sketch** (the pencil shows or puts it away, as in the Sketches tab), the **constraints** on its sketch as one row (how many, and of what kinds; choosing it selects the parts they tie) and the **body** it made (choosing it selects the body). A step with none of these has no rows under it. Only the steps up to the cursor have them (the faded later steps do not).
- **Which step owns a constraint** (`constraintOwners` in `panels.ts`): the first step whose figures hold one of its parts, a part being a figure's line or circle or a corner or centre one of them ends at. A constraint on parts no step has used yet belongs to none; one between the body and a sketch goes with the sketch's step.
- **Constraints tab:** one row for each constraint of the model, with its name and number (`rows.ts` labels; `arcEnds` is "Arc meets its ends") and the step whose sketch it is on (or "a sketch not used by a step yet"); choosing a row selects the parts it ties, the cross takes it away (`removeRelation`, one undo).
- **The tabs are now Steps, Bodies, Sketches, Constraints, Parameters;** the panel is a little wider (340 px at most) to hold them.
- **Tests:** `test/modelpanel.test.ts` (the tabs; the rows under a step and what choosing them selects; a step with no sketch has none; the Constraints tab, selecting and removing). Three older tests that read the History's rows (`gizmo`, `import`, `importmesh`, `historynav`) now read the step rows only, since what a step owns is listed under it; what they check about the steps is unchanged.

**Not done (each stays for later, with the rest of the order of `in_546`):** the status *unused* (a drawn figure no step has taken) and *detached*; names that are **kept for good** — the names here are the order of the steps now, so taking a step out renumbers the ones after it (that needs a stored name on the figure); a sketch's row selecting or editing the sketch; status that sees a push of a face that is not on the sketch's body by ref.

## Rationale

The tabs reuse the two lists the human already works with and add the one list the sketch decision needs, without a second way to open each. The status is read from the steps' own parameters, so it needs no new stored data; stored names are the part that cannot be done without a data change, so they are left as a stated limit rather than guessed.
