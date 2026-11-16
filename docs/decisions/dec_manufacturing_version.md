---
id: dec_manufacturing_version
kind: decision
status: provisional
origin: ai-proposed-human-approved
human_input: in_553, in_554
date: 2026-11-16
depends_on:
  - dec_manufacturing_contract: a manufacturing version is the part a plan and a route work on
  - prin_graph_is_truth: the derived part is a step in the graph, so it regenerates from its parent
  - dec_stable_references: the derived part's own steps name faces of a body that changes; they stay attached only if references are names
  - dec_independent_bodies: a derived part is a body with its own name, listed beside the others
  - dec_copy_paste: a paste is independent; a derived part stays linked until detached
alternative_to:
---
# A manufacturing version: a linked derived copy of the design part

`in_553` proposed it; `in_554` approved it in principle ("this sounds good"). **Provisional until the human says accepted; the names (manufacturing version, design part) and the detail are the AI's.** Nothing is built.

1. **Design part and manufacturing version.** The *design part* describes the ideal end state and is never changed for manufacture. A *manufacturing version* is a **derived part**: a step that points at a parent body by its name and takes the parent's current result as its start, followed by its own steps on that body (shrink allowance as a scale, split, keys, draft, handles or sprues, fit compensation). Parent changes regenerate the version; the link is **one way** (a version never changes its parent; no cycles). One parent can have several versions (print, cast pattern, CNC), and versions chain (bust, casting pattern, sand mould).
2. **Geometry in the version, machine-run detail in the plan.** The version holds what shape the part must have to be made by that process, as real geometry you can see and export. The **plan** (per manufacturing version and machine, `in_546`) holds toolpath, feeds, order, tool, orientation, supports, and kerf or tool compensation (applied to the path, not to the shape). A value from a material or machine (a shrink factor, a clearance) is **copied** into the step when it is made and kept there, so the model never changes because a machine did.
3. **Not a paste:** a derived part stays linked; the menu offers *Detach* (it becomes an independent body, as a paste is).
4. **Edits on the version** are ordinary steps on top of the parent; if a large parent change breaks one, the step fails and its dependents are skipped, as the app does now.
5. **Needs first:** stable references (`dec_stable_references`; the human says another AI is building it, `in_554`) so steps on the version's faces survive a parent edit; the derived step must include the parent in its kernel cache fingerprint; the bodies list shows the link.

## Rationale

It answers question 1 of `q_manufacturing_open` more simply than a graph-versus-plan line: all geometry for a process lives in a visible, linked part, and the plan keeps only what a machine does. It follows how mould and casting work is done by hand (master model, working model) and keeps the design part clean. Regenerating from the parent is what the graph already does; the cost is in references, which is why stable references come first.
