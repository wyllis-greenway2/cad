---
id: dec_hollow
kind: decision
status: provisional
origin: ai-unreviewed
human_input: in_391, in_393, in_394
date: 2026-11-15
depends_on:
alternative_to:
---
# Hollow: a body made a shell with chosen faces left open

`in_391` asked "Can we offer a hollow tool?". **The AI's reading, for the human to correct:** Hollow makes the body a shell: the flat face or faces selected are left open, the wall is a thickness (dragged on an arrow that points into the body, or typed), the inside is removed. It is a step of the history (`hollow`, params `thickness` and `faces`, each face named by where it was, as a push / pull names one) made by the kernel's shell, so it can be reopened or removed like any step. **Reworked after `in_393`, then `in_394` (again the AI's reading):** the faces selected are the **open** ones and every other face is a wall (the first form, restored by `in_394`); a switch by the handles makes the selected faces the walls instead; the whole body selected is hollowed with **no opening**; the wall is inward when the arrow is pulled one way (positive) and **outward** the other (negative). The step's params: `thickness` (signed), `mode` (`open` the default, `keep`, `closed`); corners stay sharp (the offset faces meet, not round, `in_394`); the body fades to wireframe while the wall is pulled; `mode` (`keep`, `open`, `closed`), `faces`. Not built: round faces as walls or as open faces (they cannot be named), and the other steps (push / pull of a face, stretch) reading a hollowed body.

## Rationale

Recorded because production code needs an entry (`CLAUDE.md` rule 9); the form of the tool is the AI's reading and stays provisional until the human approves it.
