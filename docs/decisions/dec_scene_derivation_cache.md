---
id: dec_scene_derivation_cache
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_701, in_727, in_784
date: 2026-11-17
depends_on:
  - dec_gear_speed: the measured cost this removes (the page's work at each edit grows with the number of parts: 5800 for eight gears); a change to those numbers changes whether this is worth the risk of a stale answer
  - dec_gear_feature: the parts of a gear's body are cut to a few, so what is left to derive is the gear's own sketch
---
# What the page works out of the scene at an edit is kept while the parts it came from are the same objects

**Asked (`in_701`, approved `in_727`):** the page's work on the whole scene at every edit grows with the number of parts and bodies; it should cost what the edit changed.

**Found (eight gears of 30 teeth, extruded, 5799 parts; an edit that leaves the kernel's graph as it was):** 183 ms per edit in Node, 103.6 ms in the real app's own compile timings (graph 41, place 60). The cost was not in the parts but in what was worked out of them again each time: the parts of every gear were made new at every derive (so every part was a new object and nothing worked out from it could be kept), the points of each closed loop (400 arcs of 64 points for a gear) and the faces of the drawn parts, the parts of the body from a kernel answer that had not changed, and a search through all of a loop's lines for each of its corners.

**Built.** The rule is one: parts are never changed in place (a change makes a new part object, as `commands.ts` does), so a result worked out from parts is still right while each part it read is the same object; the parts it read are noted as it is worked out, and one that is another object now, or gone, makes it work again.
1. A gear's parts are kept while its record and plane are the same objects (`gearscene.ts`, `madeParts`); a gear with other numbers has a new record and so new parts.
2. The corners and arcs of a loop (`loopSteps`) and its points (`loopPoints`) are kept with the parts they read (`part.ts`, `keptFor`), bounded by the number of points kept (600 thousand), not by how many loops. The linear search for each corner's side is a lookup by the corner's two ends.
3. The parts of the body for a kernel answer are kept while the answer is the same object, the sheets and the gears the same (`compile.ts`, `bodyPartsOf`): the app's kernel hands back the same result for a graph it has made.
4. The faces derived from the drawn parts are kept for the last four scenes, while the parts and the steps are the same objects, in whatever order (`scene.ts`, `derivedFor`): the two derives of one edit are one.

**Measured.** The real app, eight gears, 25 edits that leave the kernel's graph as it was: **103.6 to 30.8 ms** (graph 41.1 to 20.8, place 60.2 to 8.2). Node: 183 to 47 ms. `test/derivecache.test.ts` (4 tests: the kept answers equal the worked-out ones, including on equal parts that are other objects; a moved corner, a deleted corner, another kernel answer and a gear with other numbers all give new answers; the same objects are kept where they should be). The whole suite (1323 tests) is unchanged.

**What is not changed.** An edit that changes a gear's own parts or its kernel step is worked out for that gear in full, as it must be. **Not done, and bigger:** an edit to an *early* gear makes the kernel build every gear after it again (8 gears: 4 s), because each step's kept answer is keyed by the steps before it; see `dec_gear_speed`.

## The smaller costs that were left (`in_784`)

Measured in the real app first (eight gears extruded, 5799 parts; headless Chromium): a frame of an orbit 13.1 ms, of the pointer moving 9.1 ms, an edit's compile 33.7 ms. What the profile showed, and what was done:
1. **Picking a body's face** (`part.ts`, `rayMesh`): the ray was asked of every triangle of every face under it with three arrays made for each, 273 ms of the 369 of picking in the profile. It is now asked of the mesh's box (found once, by the mesh) and the triangles are worked with plain numbers: the same nearest hit (`test/raymesh.test.ts`: 500 rays against the plain way).
2. **The scene looked through by kind at every frame** (`partindex.ts`): the bodies, the sheets that cut and the parts as a list are found once for a scene (`frame.ts`, `section.ts`, `lastseen.ts`'s `thingsOf` too): five thousand parts looked through for the three that are bodies, several times a frame.
3. **The axis labels' test whether the model hides them** (`ui/world.ts`, `anyHit`): three's raycast works every triangle of a mesh whose box the ray meets and keeps every hit. The triangles of a mesh are now in chunks of 128 with a box each (made once), the ray is asked of the boxes first and the first hit ends it; the sides of a triangle the material draws are those that count, as three has it (`test/occlusion.test.ts`: 600 rays for each side against three).
4. **`loopOf`** searched all the lines for each corner (400 by 400 for a gear): it finds the next side by the corner's list of sides now (`test/derivecache.test.ts`: against the old search, with the lines in scrambled order), and **the groups of lines on a plane** are kept while the lines are the same objects in the same order (`loops.ts`, `groupsOf`).

**Measured after:** an orbit 13.1 to 7.4 ms, the pointer moving 9.1 to 3.6 ms, an edit's compile 33.7 to 24.5 ms (graph 22.0 to 12.8); the screen is the same, pixel for pixel, in three views (the labels hidden and shown as before). **A mistake caught by the suite:** rewriting the grouping from an older reading of `loops.ts` dropped the other branch's `l.spline` in the test for a loop of one line (a closed spline is a face): five tests failed and it was put back. **Not changed, left:** the first of an edit's two derives still walks every line of a plane when its lines change; the constraint bubbles' layout (about 1.5 ms a frame); the page's graph and `consumed` for every step.

## Rationale

The scene is made of immutable parts and a change replaces a few of them; what is derived from the others is the same, and was being worked out again because each derive made every gear's parts again as new objects. Keeping the answers with the parts they read, and checking those parts are the same objects, can only be wrong if a part is changed in place, which the commands never do (and a test of a changed part guards).
