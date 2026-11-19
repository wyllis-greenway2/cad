# What each thing needs of the bodies it touches (`q_progressive_load`, `in_995`)

A working paper, not a decision: the table the safe-interaction rule of `q_progressive_load` needs, written from the command types (`operation/commands.ts`), the step types (`operation/scene.ts`) and the operations of the tools (`interaction/operations.ts`). **Nothing is built from it yet.**

**Levels of a body** (each includes the one before): **G**host: its box or prism from its sketch and depth, worked out in the page from the commands; **C**oarse: a rough mesh; **F**ull: the screen mesh; **N**amed: its faces, edges and corners made, with their names (pickable); **X** exact: the exact solid in the kernel (export, measuring, clearance). **P**age: nothing of any body, only the commands and the page's own solver.

**Rule:** a thing is allowed when every body it names has at least the level it needs; if not, it is **greyed with the reason ("building this part…") and the body is raised to the front of the order**, and it is done when ready if the person still wants it. A thing at level **P** or **G** is always allowed. **What a step does when its body is finally made and it fails** is the usual (the step is marked failed; steps that stood on it are marked blocked: nothing is lost, the commands are all there).

## The commands (what the history keeps)

| command | needs | why |
|---|---|---|
| `addPart`, `deletePart`, `deleteParts`, `movePart`, `setRadius`, `setSpline`, `stretch`, `placePlane`, `transformFigure` | **P** | a sketch is drawn and solved in the page; the body made from it is redone from the commands |
| `addRelation`, `removeRelation`, `setRelationValue` (constraints, dimensions) | **P** | solved in the page |
| `setParameter`, `removeParameter`, `linkParam` (named numbers) | **P** | the numbers of steps change; the bodies are made again |
| `addStep` of `extrude`, `revolve`, `loft`, `sweep` from a drawn sketch | **P** (the new body is a ghost at once) | the sketch is in the page; its own body does not wait for the others unless it joins or cuts (below) |
| `addStep` of `extrude` / `pushPull` **on the face of a body** (a sketch drawn on a face, a face pulled) | **N** of that body | the face is named by the kernel; a name that is not there yet cannot be used |
| `addStep` with mode `add` or `cut` where the figure may meet bodies | **F** of the bodies the ghost boxes say it meets | what it joins or cuts is decided by where the bodies are |
| `addStep` of `edgeMod` (fillet, chamfer), `hollow`, `reshape`, `combine` | **N** of the body (**F** of the others it meets) | named edges and faces |
| `addStep` of `move`, `rotate`, `scale` | **G** (a ghost moves with it) | a motion of a body's own solid; its markers move with it |
| `addStep` of `pattern` | **G** of the source (copies are ghosts of it) | the copies are made from the source's solid when built; the count is checked in the page (200) |
| `addStep` of `delete`, `import`, `importMesh` | **G** / **P** | a delete removes a body; an import brings its own |
| `setStepParams`, `removeStep` | **P** | the bodies after it are made again; those it does not touch are found as they were |
| `gear`, `setGear`, `deleteGear`, `planetary`, `setPlanetary`, `deletePlanetary` | **P** (the gear's ghost is its disc) | the gear's parts come from its numbers; its body is a step |
| `pattern`, `setPattern`, `breakPattern` (patterns of drawn figures) | **P** | made in the page |
| `group`, `ungroup`, `hideBodies`, `setMaterial`, `setMarks`, `setUse`, `setPlan`, `useDefinition` | **P** / **G** | labels, visibility and plans on names |
| `setHard`, `setClearance` | **P** to set; the check that uses them needs **X** | collisions are found on the true shapes |
| `couple`, `setCoupling`, `deleteCoupling` (joints and links) | **P** | the motion is the page's |
| `batch` | the highest of its parts | |

## What the person does with the view

| action | needs |
|---|---|
| orbit, pan, zoom, section view, hide or show a body, change the camera | **P** (draws what there is: ghosts, coarse, full) |
| hover or select **a body** | **G** (a ghost can be picked as a whole body; selecting raises its level) |
| pick a **face, an edge or a corner** of a body | **N** |
| measure, clearance between bodies, overlap check of hard bodies | **X** of the bodies named (**N** for the points they are taken from) |
| move or rotate a body by hand (drag, the gizmo) | **G**; hard bodies stop at a collision found on **X** |
| edit the numbers of a step in the history panel, undo, redo, go to a step | **P** |
| save | **P** (the commands; never the state of the build) |
| open | **P** to begin (the relationships and the ghosts), the rest as built |
| export (STL, 3MF, STEP), print or toolpath | **X** of every body wanted: waits for all of them, with a progress sign |
| import | brings its own; **P** |

## What the ghost needs (the page's own work, no kernel)

- an `extrude` of a polygon or circle sketch: the prism of its outline along the plane's normal, the depth, the move or turn of later steps; a `revolve`, `loft`, `sweep`: the box of the sketch and the path (a box, not a prism); a `pattern`: the source's ghost at each place; a `gear`: its disc (`dec_gear_standin`); an imported mesh: its own bounds.
- a **conservative** overlap test of the ghosts' boxes, enlarged by the clearance and by a margin: bodies whose boxes do not meet cannot be joined, cut or collide and can be built alone; boxes that meet are treated as possibly joined and built together.

## What a step changes, from what it names (`in_999`, `prototypes/progressive`)

A step names the bodies it changes, or the place where it does: **by name** (`params.body`, `b/x_s_N/..`: moves, turns, scales, combines), **by place** (`b/body/e@x,y,z~..` the points of an edge, `b/body/f@nx,ny,nz,d` with a point in the step's numbers: fillets, chamfers, pushes), or **generically** (`b/body/o`: patterns, deletes: every body so far). The bodies whose boxes hold the place are the bodies changed; bodies tied by a relation, hard bodies, and bodies whose boxes meet (a moved body's box taken round where it began and where it ends) are one thing. Against what taking each step out really changes, on 65 steps: the rule names every body changed in 52 of 65 (48 named exactly, 4 said "every body so far", safe); **it missed 13, all in one project where a body is moved through the place of another** (a join is made at the step where they meet): for that the ghost needs the box of every body at every step, and until it has them such a project is built as one group.

## Checked (`prototypes/progressive`, `in_995`)

The claim the table rests on: a group of steps that no other step uses, and whose bodies touch no other group's, **built alone gives the very bodies, volumes, boxes and face names it gives in the whole model, and the groups in any order give the same model.** Of 70 fixtures only the two grids are made of more than one group (the others are single bodies with fillets and moves: one group by the rule above); of five assemblies made for the test (twelve boxes apart; boxes and gears apart; boxes touching; overlapping; gears meshing) 17 groups were built alone and in 6 other orders: **17 bodies compared, no difference**; the touching and overlapping ones were found to be one group. **With modifying steps** (`in_999`): rounded tops, a hole, a slid body and ten fixtures of several bodies: 20 groups built alone and in 27 other orders, 30 bodies, **no difference** (after a fix to the naming of a moved body's faces, found by this test).
