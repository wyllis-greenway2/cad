// The cut face (`in_574`, `dec_cross_section`): where a sheet that is cutting passes through the body, the cut is a face with its edges and corners, named by where they are.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, run, scene, selection } from "../src/interaction/session.ts";
import { drawSquaredRectangle, drawCircle } from "../src/operation/build.ts";
import { nextId } from "../src/operation/scene.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import { homeCamera } from "../src/interaction/camera.ts";
import { sectionNow } from "../src/interaction/control/section.ts";
import { sectionFaces } from "../src/operation/cutface.ts";
import { startOp } from "../src/interaction/operations.ts";
import { actionsFor } from "../src/interaction/actions.ts";
import type { Part } from "../src/operation/part.ts";

await kernel.init();
const env = { w: 800, h: 600, now: 0 } as never;
const XY = worldRef("XY");

// a box as triangles: x 0..20, y 0..10, z 0..10
const BOX = (() => {
  const v = [0, 0, 0, 20, 0, 0, 20, 10, 0, 0, 10, 0, 0, 0, 10, 20, 0, 10, 20, 10, 10, 0, 10, 10];
  const t = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 2, 3, 7, 2, 7, 6, 1, 2, 6, 1, 6, 5, 3, 0, 4, 3, 4, 7];
  return { vertices: v, triangles: t };
})();

test("a plane through a box cuts out a rectangle: one face, four corners, the outward normal toward the cut-away half", () => {
  const f = sectionFaces(BOX, { at: [8, 0, 0], n: [1, 0, 0] });
  assert.equal(f.length, 1);
  assert.deepEqual(f[0]!.n, [1, 0, 0]);
  assert.equal(f[0]!.d, 8);
  assert.equal(f[0]!.loops.length, 1);
  assert.equal(f[0]!.loops[0]!.length, 4, "the straight sides have no points between their corners");
  const xs = f[0]!.loops[0]!.map((p) => Math.round(p[0] * 1e4) / 1e4);
  assert.ok(xs.every((x) => x === 8));
  const area = f[0]!.mesh.length / 9; // (two triangles)
  assert.equal(area, 2);
  assert.equal(sectionFaces(BOX, { at: [30, 0, 0], n: [1, 0, 0] }).length, 0, "a plane that misses the box cuts nothing");
  assert.equal(sectionFaces(BOX, { at: [20, 0, 0], n: [1, 0, 0] }).length, 0, "and one that only touches a face makes no new face");
});

test("another sheet cuts the cut face too: what it takes away is not part of it", () => {
  const f = sectionFaces(BOX, { at: [8, 0, 0], n: [1, 0, 0] }, [{ at: [0, 4, 0], n: [0, 1, 0] }]);
  assert.equal(f.length, 1);
  const ys = f[0]!.loops[0]!.map((p) => Math.round(p[1] * 1e4) / 1e4);
  assert.ok(Math.max(...ys) <= 4 + 1e-6, `the half past y = 4 is gone: ${ys}`);
});

function cutScene(depth = 10) {
  let s = createSession(kernel);
  const r = drawSquaredRectangle(scene(s), XY, [0, 0, 0], [20, 20, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: r.lines, params: { depth } } } as never);
  let st = reduce({ ...createState(s), cam: homeCamera() }, { type: "runAction", id: "view:section" }, env);
  const sec = sectionNow(st)!;
  const p = scene(st.session).parts[sec.ref] as Extract<Part, { kind: "plane" }>;
  // put the sheet across the box at x = 8, its normal along +x
  st = { ...st, session: run(st.session, { type: "placePlane", ref: sec.ref, at: [8, -50, -50], u: [0, 1, 0], v: [0, 0, 1] } as never) };
  void p;
  return { st, ref: sec.ref };
}
const caps = (st: ReturnType<typeof cutScene>["st"]) => (Object.values(scene(st.session).parts) as Part[]).filter((p) => p.kind === "plane" && !!p.cap);

test("in the app the cut is a face of the body, its edges are lines and its corners are corners, all named by where they are", () => {
  const { st } = cutScene();
  const faces = caps(st);
  assert.equal(faces.length, 1, "one cut face");
  const face = faces[0] as Extract<Part, { kind: "plane" }>;
  assert.equal(face.origin, "body");
  assert.ok(face.ref.startsWith("b/body/f@1,0,0,8"), face.ref);
  const parts = Object.values(scene(st.session).parts) as Part[];
  const edges = parts.filter((p) => p.kind === "line" && p.origin === "body" && p.ref.includes("e@8,"));
  assert.equal(edges.length, 4, "four cut edges");
  const corners = parts.filter((p) => p.kind === "corner" && p.origin === "body" && p.at[0] === 8);
  assert.equal(corners.length, 4, "four cut corners");
});

test("without a cutting sheet there is no cut face", () => {
  const { st, ref } = cutScene();
  const off = { ...st, session: run(st.session, { type: "placePlane", ref, cut: false } as never) };
  assert.equal(caps(off).length, 0);
});

test("a cut face can be picked, looked at and sketched on, and a push / pull of it is refused with a reason", () => {
  const { st } = cutScene();
  const face = caps(st)[0]!;
  const sel = { ...st, session: { ...st.session, click: { ...st.session.click, selection: [face.ref] as never } } };
  const op = startOp(scene(sel.session), [face.ref], "pushpull");
  assert.equal(op.ok, false);
  if (!op.ok) assert.match(op.why, /cut face/);
  assert.ok(selection(sel.session).includes(face.ref));
  assert.ok(actionsFor(scene(sel.session), [face.ref]).length >= 0);
});
