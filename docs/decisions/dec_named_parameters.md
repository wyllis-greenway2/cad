---
id: dec_named_parameters
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_546, in_547, in_557
date: 2026-11-16
depends_on:
  - dec_model_panel: the parameters are a tab of that panel
  - dec_history_navigation: a step's numbers are changed in its pencil; a number can now be a formula there
  - dec_modifications_are_steps: a change of a parameter is a command added at the end, undone like the rest; the steps are not rewritten except by their tied numbers
  - prin_variable_over_hardcoded: this is the user-facing form of the same idea (a number with a name)
---
# Named parameters and formulas

**What the human asked (`in_546`, `in_547`, `in_557`):** named dimensions and formulas, in the unified model view, fourth of the agreed order.

**What is built, and the choices that were mine**
1. **A parameter** is a name and a formula text (`wall`, `4`, `wall * 2 + 1`). Names are words of letters, digits and `_` (not starting with a digit; not a function or `pi`). Formulas: numbers, `+ - * / ^`, brackets, a minus, the names of other parameters, `pi`, and `sqrt abs min max round floor ceil sin cos tan` (angles in degrees). Millimetres only; no units in formulas.
2. **Saved in the scene** (`Scene.parameters`, in the file). The commands `setParameter`, `removeParameter` and `linkParam` (`operation/paramscene.ts`; the formulas are in `operation/parameters.ts`, a small parser of mine with no library).
3. **A step's number can be tied to a formula** (`Step.links`: key → formula; `params[key]` holds the value now, so everything that reads steps is unchanged). Changing a parameter makes every tied number again; the model is made again from there. One undo takes the change of the parameter and its effects back.
4. **Where it is done:** the **Parameters** tab of the Model panel (a row for each parameter: its value, its formula to edit, a cross, how many numbers are tied to it; a line to add one), and the **pencil of a step** in Steps: a field takes a number or a formula; a formula ties it, a plain number lets it go.
5. **Refusals, nothing changes:** a bad name, a mistake in a formula, a name nobody gave, a circle of formulas; taking away a parameter that another formula or a step uses (the message names who).
6. **A number typed over a tied one lets it go** (`setStepParams`, so a pull of a face that changes the same number does too).
7. Like step numbers, parameters are changed only at the last step of the history (`dec_history_navigation`).

**Not done (later, each needing its own approval):** units (inches, degrees as a unit); parameters for sketch dimensions (the dimension constraints of a sketch, `setRelationValue`) and for bubbles while drawing; tying numbers of a repeat, a hollow's wall by drawing or the face push handles; importing parameters; a parameter used before it exists in an earlier step (all steps see the current values); the other filters of the Model panel (Constraints).

## Rationale

The kernel graph already took `$name` parameters, but nothing above it did; the least change that gives the human named numbers is to keep every step's `params` as the value in use and add the formula beside it, so no drawing, picking or compile code had to learn about formulas. The formula parser is small enough to read and test in full, and avoids running arbitrary code (no `eval`). Tied numbers are made again inside the command, so replay, undo, save and the snapshots of the history give the same model with no extra rules.
