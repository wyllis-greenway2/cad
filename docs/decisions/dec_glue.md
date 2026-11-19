---
id: dec_glue
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_1145, in_1146
date: 2026-11-19
depends_on:
  - dec_mechanism_motion: glue is what a motion honours (a motion that moves a body moves what is glued to it); a change to how Play moves bodies changes how glue is applied
  - dec_gear_models: the models glue their parts that are fixed to one another (a gear and its rod, the cage and its caps), in place of the private lists of followers they kept
alternative_to:
---
# Glue: bodies that move as one for motion

**Asked** (`in_1145`): a gear is not held to its shaft by a coaxial mate (that only says they share an axis); does it need a new constraint, and what would it do? **Approved** (`in_1146`: "yes do all three, glue first").

**What it is.** A group of two or more bodies, named by their ids (as a pivot's body is), kept in the scene (`Scene.glue`, `operation/glue.ts`; the commands `glue` (several bodies: any that were in a group bring it in, so groups only grow together) and `unglue` (one body leaves its group; a group of one goes); saved with the project). It is not a mate: it names no faces and keeps no gap. It is only a statement that the bodies are fixed to one another.

**What it does.** When a motion moves a body (the one that is played, or one a gear coupling, a planetary carrier or a model's record moves), **every body glued to it moves the same way** (`interaction/motion.ts` `withGlue`: the same turn or slide, the same orbit if it has one). A body that cannot be played itself (a plain rod) is played from the member of its group that can be (a gear's body, a pivot); `animatedBodies` says so, so Play is offered for a rod glued to a gear. A body glued to a part that moves moves even if it was standing still before: that is what glue means.

**In the ring:** Move, **Glue** (two bodies selected or more) and **Unglue** (a glued body selected).

**The models** (`modelplay.ts`, `modeltool.ts` `finishCommand`): when a model is made it is glued where it is fixed together, and its record of motion lists one leader for each group: the gearbox's rods with the gears and pinions on them; the differential's cage with its caps, pin and drive gear, and each side gear with its axle (the spiders spin on the pin and are not glued).

**Not built:** dragging or moving a glued body does not yet carry the others (only motion does); a glued group is not drawn or listed (no mark in the History panel); mates to a glued body are not looked at.

## Rationale

The motion decision already moves bodies by a list of followers; glue is the smallest addition that makes "these are one body" a fact of the model that the person can make and see, without the solver (it keeps no geometry). The models needed it: each kept a private list saying a rod turns with its gear, which nobody could see or change.
