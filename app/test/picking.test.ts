import test from "node:test";
import assert from "node:assert/strict";
import { worldRef } from "../src/shared/ref.ts";
import type { Ref } from "../src/shared/ref.ts";
import type { Vec3 } from "../src/math/vec.ts";
import type { PointerView } from "../src/operation/part.ts";
import { depthOf } from "../src/operation/part.ts";
import { newHistory, exec } from "../src/operation/history.ts";
import type { History } from "../src/operation/history.ts";
import { drawRectangle, drawCircle } from "../src/operation/build.ts";
import { nextId, toJSON, withDerived, lookup } from "../src/operation/scene.ts";
import type { Scene } from "../src/operation/scene.ts";
import { candidatesAt, refsAt, hoverAt } from "../src/interaction/picking.ts";
import { click, initialClick } from "../src/interaction/selection.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { compile } from "../src/compiler/compile.ts";
import { projector, homeCamera } from "../src/interaction/camera.ts";

await kernel.init();
const XY = worldRef("XY");
const must = (r: ReturnType<typeof exec>): History => {
  assert.ok(r.ok, r.ok ? "" : r.error);
  return r.value;
};
/** Looking straight down the Z axis, 1 pixel = 1 mm, y up on the screen. */
const topRay = (px: number, py: number) => ({ o: [px, -py, 500] as Vec3, d: [0, 0, -1] as Vec3 });
const top = (x: number, y: number): PointerView => ({ x, y: -y, project: (p: Vec3) => [p[0], -p[1]], ray: { o: [x, y, 500], d: [0, 0, -1] }, rayAt: topRay });
/** Looking along +Y (a side view): screen x = world x, screen y = -z. */
const front = (x: number, z: number): PointerView => ({ x, y: -z, project: (p: Vec3) => [p[0], -p[2]], ray: { o: [x, -500, z], d: [0, 1, 0] }, rayAt: (px, py) => ({ o: [px, -500, -py] as Vec3, d: [0, 1, 0] as Vec3 }) });

function box(w = 40, d = 20) {
  const r = drawRectangle(newHistory().scene, XY, [-w / 2, -d / 2, 0], [w / 2, d / 2, 0], [1, 0, 0], [0, 1, 0]);
  let h = must(exec(newHistory(), r.command));
  h = must(exec(h, { type: "addStep", step: { id: nextId(h.scene, "s"), type: "extrude", parts: r.lines, params: { depth: 20 } } }));
  return { h, ...r, scene: compile(h.scene, kernel).scene };
}

test("a closed loop of lines is a face, a circle is a disk; faces are derived and never saved", () => {
  const r = drawRectangle(newHistory().scene, XY, [0, 0, 0], [10, 6, 0], [1, 0, 0], [0, 1, 0]);
  let h = must(exec(newHistory(), r.command));
  const c = drawCircle(h.scene, XY, [30, 0, 0], 4);
  h = must(exec(h, c.command));
  const s = withDerived(h.scene);
  const faces = Object.values(s.parts).filter((p) => p.kind === "face");
  assert.equal(faces.length, 2);
  assert.equal(toJSON(s).parts.filter((p) => p.kind === "face").length, 0);
  const open = drawRectangle(h.scene, XY, [50, 0, 0], [60, 5, 0], [1, 0, 0], [0, 1, 0]);
  const h2 = must(exec(h, { type: "batch", commands: [open.command, { type: "deletePart", ref: open.lines[3]! }] }));
  assert.equal(Object.values(withDerived(h2.scene).parts).filter((p) => p.kind === "face").length, 2, "an open chain is not a face");
});

test("order: corners, then lines, then faces and planes; nearest first within each", () => {
  const r = drawRectangle(newHistory().scene, XY, [-40, -30, 0], [40, 30, 0], [1, 0, 0], [0, 1, 0]);
  const scene = withDerived(must(exec(newHistory(), r.command)).scene);
  const at = (x: number, y: number) => candidatesAt(scene, top(x, y));
  assert.equal(at(-40, -30)[0]!.kind, "corner");
  assert.equal(at(-40, -30)[0]!.ref, r.corners[0]);
  const onLine = at(5, -30);
  const rank = { corner: 0, line: 1, face: 2, plane: 2 } as Record<string, number>;
  assert.deepEqual(onLine.map((c) => rank[c.kind]), [...onLine.map((c) => rank[c.kind])].sort(), "corners, lines, then surfaces");
  assert.equal(onLine[0]!.ref, r.lines[0]);
  assert.equal(at(15, 10)[0]!.kind, "face", "inside the shape: the face");
  assert.equal(at(15, 10).length, 1, "the infinite world plane under it is only the background: it is a candidate where nothing else is");
  assert.deepEqual(at(500, 500).map((c) => c.ref), [XY], "empty space on the plane: the plane, anywhere on it");
});

test("exactly overlapping corners are all candidates (those hidden behind the body are not), and repeated clicks cycle through them with 'i of n'", () => {
  let { h, scene } = box();
  const topFace = Object.values(scene.parts).find((p) => p.kind === "plane" && p.origin === "body" && p.at[2] === 20)!;
  h = must(exec(h, { type: "addPart", part: topFace }));
  const r = drawRectangle(h.scene, topFace.ref, [20, 10, 20], [10, 0, 20], [1, 0, 0], [0, 1, 0]);
  h = must(exec(h, r.command));
  scene = compile(h.scene, kernel).scene;
  const pr = projector(homeCamera(), 800, 600);
  const [x, y] = pr.project([20, 10, 20]);
  const c = candidatesAt(scene, pr.view(x, y)).filter((k) => k.kind === "corner").map((k) => k.ref);
  assert.equal(c.length, 2, "the drawn corner and the body corner under it; the bottom corner of the body is hidden behind it");
  let st = initialClick();
  const refs = refsAt(scene, pr.view(x, y));
  const seen: Ref[] = [];
  let msg = "";
  for (let i = 0; i < 3; i++) {
    const r2 = click(st, refs);
    st = r2.state;
    seen.push(st.selection[0]!);
    msg = r2.cycled ? `${r2.cycled.index} of ${r2.cycled.of}` : msg;
  }
  assert.equal(new Set(seen).size, 3);
  assert.match(msg, /3 of \d+/);
});

test("a body face is hit through its triangles: the nearer face wins, and the hole of a face is not hit", () => {
  const { scene } = box();
  const hit = candidatesAt(scene, top(0, 0)).filter((c) => c.kind === "plane");
  const topFace = Object.values(scene.parts).find((p) => p.kind === "plane" && p.origin === "body" && p.at[2] === 20)!;
  assert.equal(hit[0]!.ref, topFace.ref, "seen from above, the top face is nearer than the bottom face");
  assert.equal(hit.length, 1, "only the nearest face counts: the bottom face and the world pane are hidden behind it");
  assert.equal(candidatesAt(scene, top(60, 0)).filter((c) => scene.parts[c.ref]!.origin !== "world").length, 0, "outside the body nothing but the world pane is hit");
  const side = candidatesAt(scene, front(0, 10)).filter((c) => c.kind === "plane");
  assert.equal(side[0]!.ref.includes("f@"), true);
});

test("drawn parts on a body face are picked as easily as the body's own", () => {
  let { h, scene } = box(80, 60);
  const topFace = Object.values(scene.parts).find((p) => p.kind === "plane" && p.origin === "body" && p.at[2] === 20)!;
  h = must(exec(h, { type: "addPart", part: topFace })); // a drawn part names the plane it lies on
  const r = drawRectangle(h.scene, topFace.ref, [-30, -20, 20], [30, 20, 20], [1, 0, 0], [0, 1, 0]);
  h = must(exec(h, r.command));
  scene = compile(h.scene, kernel).scene;
  assert.equal(hoverAt(scene, top(-30, -20)), r.corners[0], "the small corner, not the face or the body under it");
  assert.equal(hoverAt(scene, top(-7, -20)), r.lines[0]);
  const inside = refsAt(scene, top(12, 0));
  assert.equal(scene.parts[inside[0]!]!.kind, "face");
  assert.equal(scene.parts[inside[0]!]!.origin, "drawn", "the small shape's face is ahead of the big top face under it");
});

test("a circle: its ring is a line-class candidate, its inside is a disk", () => {
  const c = drawCircle(newHistory().scene, XY, [0, 0, 0], 25);
  const scene = withDerived(must(exec(newHistory(), c.command)).scene);
  assert.equal(hoverAt(scene, top(25, 0)), c.circle);
  assert.equal(hoverAt(scene, top(0, 0)), c.centre, "the centre is a corner");
  assert.equal(scene.parts[hoverAt(scene, top(10, 8))!]!.kind, "face");
});

test("a click on nothing lets go of everything", () => {
  const { scene } = box();
  let r = click(initialClick(), refsAt(scene, top(20, -10)));
  assert.ok(r.state.selection.length === 1);
  r = click(r.state, refsAt(scene, top(300, 300)).filter((q) => scene.parts[q]!.origin !== "world")); // (the controller never selects a world pane)
  assert.deepEqual(r.state.selection, []);
});

test("the pane of a world plane can be hit from either side", () => {
  const scene: Scene = withDerived(newHistory().scene);
  const above = candidatesAt(scene, top(15, 15));
  assert.equal(above[0]!.ref, XY);
  const below = candidatesAt(scene, { x: 15, y: -15, project: (p) => [p[0], -p[1]], ray: { o: [15, 15, -500], d: [0, 0, 1] } });
  assert.equal(below[0]!.ref, XY);
});

test("a world plane between the eye and a model is only the background: the model under the pointer is picked", () => {
  const { scene } = box();
  // from the side, low: the XY world plane passes between the eye and the near side of the box, but the pointer is on the box
  const pr = projector({ ...homeCamera(), elevation: 0.15, target: [0, 0, 10] }, 800, 600);
  const [x, y] = pr.project([20, 0, 10]); // the middle of the +x side face
  const c = candidatesAt(scene, pr.view(x, y)).filter((q) => q.kind === "plane");
  assert.equal(scene.parts[c[0]!.ref]!.origin, "body", "the model, not a world plane");
});

test("a world plane that is on is there to point at everywhere, from either side; the ones that are off are not found at all (`in_190`)", () => {
  const sc = withDerived(newHistory().scene);
  const xy = sc.parts[worldRef("XY")]!;
  const ray = (x: number, y: number) => ({ o: [x, y, 50] as Vec3, d: [0, 0, -1] as Vec3 });
  const pv = (x: number, y: number, straight: boolean) => ({ x: 0, y: 0, project: () => [0, 0] as [number, number], ray: ray(x, y), straight });
  for (const [x, y] of [[20, 15], [-20, 15], [20, -15], [-20, -15]] as const) assert.notEqual(depthOf(lookup(sc), xy, pv(x, y, false)), null, `${x},${y}`);
  const found = (world: string) => candidatesAt(sc, { ...pv(5, 5, false), project: () => [999, 999] as [number, number] }, { pointTol: 10, lineTol: 8, world: worldRef(world as "XY") }).filter((c) => c.kind === "plane").map((c) => c.ref);
  assert.deepEqual(found("XY"), [worldRef("XY")]);
  assert.deepEqual(found("XZ"), [], "the ray from above meets the XZ plane only at a line, and it is off: nothing is found");
});
