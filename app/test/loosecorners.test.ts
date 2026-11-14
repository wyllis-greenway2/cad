// Corners nothing is drawn on are not snapped to, lined up with or suggested to (`in_332`), and deleting a surface no longer leaves them behind. In the human's file three corners were left by deleting a surface cut by an arc:
// the pieces cut from its lines name the same corners, and were counted as something else standing on them, so the ends of the lines taken away were kept; they are not drawn, but the cursor lined up with them.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession, scene, undoLast, run } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { actionsFor } from "../src/interaction/actions.ts";
import { live } from "../src/operation/ownership.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import { projector } from "../src/interaction/camera.ts";
import { frameOf } from "../src/interaction/frame.ts";
import type { Part } from "../src/operation/part.ts";

await kernel.init();
const open = (): Session => (openSession(kernel, readFileSync(new URL("./fixtures/loose-corners-in_332.cad.json", import.meta.url), "utf8")) as unknown as { value: Session }).value;
const LOOSE = ["d/e_005.p0", "d/e_005.p1", "d/e_007.p1"];
const looseIn = (s: Session): string[] => {
  const stood = new Set<string>();
  for (const p of Object.values(scene(s).parts)) {
    if (p.kind === "line") { stood.add(p.a); stood.add(p.b); if (p.center) stood.add(p.center); } else if (p.kind === "circle") stood.add(p.center);
  }
  return (Object.values(scene(s).parts) as Part[]).filter((p) => p.kind === "corner" && p.origin === "drawn" && !p.derived && !stood.has(p.ref)).map((p) => p.ref);
};

test("deleting a surface cut by an arc takes the ends of its lines with it", () => {
  let s = open();
  for (let i = 0; i < 4; i++) s = undoLast(s); // (as it was before the surface was deleted)
  const face = Object.values(scene(s).parts).find((p) => p.kind === "face" && p.origin === "drawn" && !!p.pieces)!;
  const del = actionsFor(scene(s), [face.ref]).find((a) => a.id === "delete")!;
  assert.ok(del.enabled, del.why ?? "");
  const after = run(s, del.run());
  assert.equal(after.message, null);
  assert.deepEqual(looseIn(after), [], "no corner is left with nothing on it");
});

test("what such a deletion left behind in the human's file is not in the drawing as it is worked on", () => {
  const s = open();
  assert.deepEqual(looseIn(s).sort(), LOOSE, "the file has them");
  const work = live(scene(s));
  for (const c of LOOSE) assert.ok(!(c in work.parts), `${c} is not snapped to`);
  for (const c of ["d/e_001.p0", "d/e_001.p1", "d/e_002.p1", "d/e_013.p1", "d/e_001.c", "d/e_002.c", "d/e_013.c"]) assert.ok(c in work.parts, `${c} is drawn (an end or a middle) and still is`);
});

test("drawing a line from the end of the upper right arc: no guide runs to a corner nothing is drawn on", () => {
  const s = open();
  const env = { w: 1280, h: 687, now: 0 };
  const snap = { target: [49.1176, 31.4805, -9.1829], distance: 171.3142, azimuth: -1.9845, elevation: 1.5708, straight: false, mix: 1, eyeDistance: 171.3142, perspective: 1 };
  let st = createState(s);
  st = { ...st, cam: snap as never };
  const pj = (p: number[]) => projector(st.cam, env.w, env.h).project(p as never);
  const end = (scene(s).parts["d/e_013.p1" as never] as unknown as { at: number[] }).at;
  st = reduce(st, { type: "runAction", id: "tool:line" }, env);
  const [px, py] = pj(end);
  st = reduce(st, { type: "hover", x: px, y: py }, env);
  st = reduce(st, { type: "click", x: px, y: py, count: 1, shift: false }, env);
  st = reduce(st, { type: "hover", x: px + 60, y: py }, env); // (where the cursor used to take the height 41.9 of a corner that is not there)
  const f = frameOf(st, { w: env.w, h: env.h }, 0);
  const segs = f.preview?.segments ?? [];
  const loosePoints = LOOSE.map((c) => (scene(s).parts[c as never] as unknown as { at: number[] }).at);
  for (const [a, b] of segs) for (const q of loosePoints) assert.ok(Math.hypot(a[0] - q[0]!, a[1] - q[1]!) > 1e-3 && Math.hypot(b[0] - q[0]!, b[1] - q[1]!) > 1e-3, "a guide runs to a corner that is not drawn");
  assert.ok(Math.abs(st.tool!.cursor![1] - 41.9) > 0.05, "the cursor did not take the height of the corner that is not there");
});
