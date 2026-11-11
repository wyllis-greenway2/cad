// Independent bodies in the app (`dec_independent_bodies`, `in_270`): separated pieces are separate body parts, each selected, moved and combined on its own.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { drawSquaredRectangle } from "../src/operation/build.ts";
import { nextId } from "../src/operation/scene.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import type { AppState } from "../src/interaction/controller.ts";
import { homeCamera } from "../src/interaction/camera.ts";
import { startOp, opCommand } from "../src/interaction/operations.ts";
import { objectOf } from "../src/interaction/objects.ts";
import { frameOf } from "../src/interaction/frame.ts";
import type { Part } from "../src/operation/part.ts";

await kernel.init();
const XY = worldRef("XY");
const env = { w: 800, h: 600, now: 0 };

function box(s: Session, x: number, y: number, w = 10, h = 10): Session {
  const r = drawSquaredRectangle(scene(s), XY, [x, y, 0], [x + w, y + w, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  return run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: r.lines, params: { depth: h } } });
}
const bodies = (s: Session) => Object.values(scene(s).parts).filter((p): p is Extract<Part, { kind: "body" }> => p.kind === "body");
const pick = (st: AppState, refs: string[]): AppState => ({ ...st, session: { ...st.session, click: { ...st.session.click, selection: refs as never } } });

test("two pieces that stand apart are two bodies in the Bodies list, and a face knows which one it is in", () => {
  const s = box(box(createSession(kernel), 0, 0), 40, 0);
  assert.equal(bodies(s).length, 2);
  assert.equal(scene(s).steps.length, 2);
  const faces = Object.values(scene(s).parts).filter((p) => p.kind === "plane" && p.origin === "body" && p.of);
  assert.ok(faces.length >= 10);
  const [a, b] = bodies(s);
  assert.ok(a!.bbox!.max[0] <= 10.01 && b!.bbox!.min[0] >= 39.99);
  const faceOfB = faces.find((f) => f.kind === "plane" && f.of === b!.ref)!;
  assert.equal(objectOf(scene(s), faceOfB.ref), b!.ref, "the third click on it takes b");
  const st = reduce(pick({ ...createState(s), cam: homeCamera() }, []), { type: "panel", name: "bodies" }, env);
  assert.deepEqual(frameOf(st, env).panel?.rows.map((r) => r.label), ["Body 1", "Body 2"]);
  // a single body keeps the one name it always had
  const one = box(createSession(kernel), 0, 0);
  assert.equal(bodies(one).length, 1);
  assert.equal(bodies(one)[0]!.ref, "b/body/o");
});

test("Move takes the selected body only; the other stays where it is", () => {
  const s = box(box(createSession(kernel), 0, 0), 40, 0);
  const [a, b] = bodies(s);
  const st = startOp(scene(s), [b!.ref], "move");
  assert.ok(st.ok);
  if (!st.ok) return;
  assert.deepEqual(st.op.parts, [b!.ref]);
  const moved = run(s, opCommand(scene(s), { ...st.op, axis: 1, value: 25 })!);
  assert.equal(moved.message, null);
  const after = bodies(moved);
  assert.equal(after.length, 2);
  const A = after.find((x) => x.id === a!.id)!, B = after.find((x) => x.id === b!.id)!;
  assert.ok(Math.abs(A.bbox!.min[1]) < 1e-6, "a stays");
  assert.ok(Math.abs(B.bbox!.min[1] - 25) < 1e-6, "b moved");
});

test("Add joins overlapping bodies into the first; Subtract takes the second out of the first; neither works with one body selected", () => {
  let s = box(box(createSession(kernel), 0, 0), 40, 0);
  const b = bodies(s)[1]!;
  const mv = startOp(scene(s), [b.ref], "move");
  if (!mv.ok) return assert.fail("no move");
  s = run(s, opCommand(scene(s), { ...mv.op, axis: 0, value: -35 })!); // b now overlaps a
  const [a2, b2] = bodies(s);
  let st: AppState = { ...createState(s), cam: homeCamera() };
  const menu = (x: AppState) => reduce(x, { type: "menu", x: 5, y: 5, button: true }, env).menu!.items.flatMap((i) => i.children ?? [i]);
  assert.equal(menu(pick(st, [a2!.ref])).find((i) => i.id === "combine:add")!.enabled, false);
  assert.equal(menu(pick(st, [a2!.ref, b2!.ref])).find((i) => i.id === "combine:add")!.enabled, true);
  const sub = reduce(pick(st, [a2!.ref, b2!.ref]), { type: "runAction", id: "combine:subtract" }, env);
  assert.equal(sub.session.message, "bodies subtracted");
  assert.equal(bodies(sub.session).length, 1);
  assert.ok(sub.session.outcome.kernel!.volume! < 2000 - 1, "b was taken out of a");
  st = reduce(pick(st, [a2!.ref, b2!.ref]), { type: "runAction", id: "combine:add" }, env);
  assert.equal(st.session.message, "bodies added together");
  assert.equal(bodies(st.session).length, 1);
  assert.ok(st.session.outcome.kernel!.volume! < 2000 && st.session.outcome.kernel!.volume! > 1000);
  // two that do not touch cannot be added: refused with the reason, nothing changes
  const apart = box(box(createSession(kernel), 0, 0), 40, 0);
  const [p, q] = bodies(apart);
  const no = reduce(pick({ ...createState(apart), cam: homeCamera() }, [p!.ref, q!.ref]), { type: "runAction", id: "combine:add" }, env);
  assert.match(no.session.message ?? "", /do not touch or overlap/);
  assert.equal(scene(no.session).steps.length, 2);
});

import { exportStl, selectedBodies } from "../src/interaction/exportstl.ts";
test("the export has all bodies unless it is told which (`in_271`): all by default, one body when asked, and the choice is one argument", async () => {
  const s = box(box(createSession(kernel), 0, 0), 40, 0);
  const all = await exportStl(s, kernel);
  assert.ok(all.ok);
  if (all.ok) assert.equal(all.triangles, 24, "two boxes of twelve");
  const [a, b] = bodies(s);
  const picked = pick({ ...createState(s) }, [b!.ref]);
  assert.deepEqual(selectedBodies(picked.session), [b!.id]);
  const one = await exportStl(s, kernel, "b.stl", selectedBodies(picked.session));
  assert.ok(one.ok);
  if (one.ok) { assert.equal(one.triangles, 12); assert.ok(one.size[0] === 10); }
  assert.deepEqual(selectedBodies(pick({ ...createState(createSession(kernel)) }, []).session), undefined);
  void a;
  const gone = await exportStl(s, kernel, "x.stl", ["nope"]);
  assert.ok(!gone.ok);
});

test("Copy and the repeats take the selected body only: the copies are bodies of their own and the other body is left alone (`in_271`)", () => {
  const s = box(box(createSession(kernel), 0, 0), 60, 0);
  const [a] = bodies(s);
  let st: AppState = pick({ ...createState(s), cam: homeCamera() }, [a!.ref]);
  st = reduce(st, { type: "runAction", id: "op:linear" }, env);
  assert.deepEqual(st.repeat?.op.parts, [a!.ref]);
  st = reduce(st, { type: "entry", field: 0, text: "3" }, env);
  st = reduce(st, { type: "repeatApply" }, env);
  assert.equal(st.session.message, null);
  const step = scene(st.session).steps.find((x) => x.type === "pattern")!;
  assert.equal(step.params.body, a!.id);
  const after = bodies(st.session);
  assert.equal(after.length, 4, "a and its two copies (spaced apart), and the other body");
  const far = after.find((b) => b.bbox!.min[0] > 55)!;
  assert.ok(Math.abs(far.bbox!.max[0] - 70) < 1e-6, "the other body did not move or copy");
});

import { figureRefs } from "../src/operation/scene.ts";
test("the sketches of a body that is moved alone go with it, and the other body's sketches stay (`in_271`)", () => {
  const s = box(box(createSession(kernel), 0, 0), 40, 0);
  const [a, b] = bodies(s);
  const steps = scene(s).steps;
  const cornerOf = (sc: ReturnType<typeof scene>, st: (typeof steps)[number]) => { const l = sc.parts[figureRefs(st)[0]!]; const c = l?.kind === "line" ? sc.parts[l.a] : undefined; return c?.kind === "corner" ? c.at : null; };
  const before = [cornerOf(scene(s), steps[0]!)!, cornerOf(scene(s), steps[1]!)!];
  const st = startOp(scene(s), [b!.ref], "move");
  if (!st.ok) return assert.fail("no move");
  const moved = run(s, opCommand(scene(s), { ...st.op, axis: 1, value: 25 })!);
  assert.equal(moved.message, null);
  const after = [cornerOf(scene(moved), scene(moved).steps[0]!)!, cornerOf(scene(moved), scene(moved).steps[1]!)!];
  assert.deepEqual(after[0], before[0], "a's sketch stays");
  assert.ok(Math.abs(after[1]![1] - before[1]![1] - 25) < 1e-6, `b's sketch went with b: ${before[1]} to ${after[1]}`);
  assert.equal(bodies(moved).find((x) => x.id === b!.id)!.bbox!.min[1], 25);
  void a;
});

import { bodyMotion } from "../src/interaction/operations.ts";
test("a drag of one body of several is moved on the graphics card alone: the frame says which triangles and which box are its, and the two bodies' triangles are all of the mesh (`in_273`)", () => {
  const two = box(box(createSession(kernel), 0, 0), 40, 0);
  const [a, b] = bodies(two);
  let st: AppState = pick({ ...createState(two), cam: homeCamera() }, [b!.ref]);
  st = reduce(st, { type: "runAction", id: "op:move" }, env);
  st = reduce(st, { type: "entry", field: 0, text: "5" }, env);
  const f = frameOf(st, env);
  assert.ok(f.bodyMatrix, "drawn by a matrix");
  assert.ok(f.bodySplit, "of one body");
  assert.deepEqual(f.bodySplit!.box.min, b!.bbox!.min);
  const count = f.bodySplit!.tris.reduce((n, [, c]) => n + c, 0);
  const all = two.outcome.kernel!.mesh!.triangles.length;
  assert.equal(count, all / 2, "b is half of the mesh (two boxes of the same size)");
  const starts = f.bodySplit!.tris.map(([s0]) => s0);
  assert.ok(starts.every((x) => x >= 0 && x < all));
  // a single body is moved whole
  const one = box(createSession(kernel), 0, 0);
  let st1: AppState = pick({ ...createState(one), cam: homeCamera() }, [bodies(one)[0]!.ref]);
  st1 = reduce(st1, { type: "runAction", id: "op:move" }, env);
  st1 = reduce(st1, { type: "entry", field: 0, text: "5" }, env);
  const f1 = frameOf(st1, env);
  assert.ok(f1.bodyMatrix);
  assert.equal(f1.bodySplit, null);
  void a;
});

import { cornerEdges } from "../src/ui/view/edges.ts";
import { ownSegments } from "../src/ui/view/split.ts";
import { settings } from "../src/shared/settings.ts";
test("with two overlapping bodies, the outline of the dragged one moves and the other body's edges stay, even those that lie inside the dragged body's box (`in_275`)", () => {
  let s = box(box(createSession(kernel), 0, 0), 40, 0);
  const b = bodies(s)[1]!;
  const mv = startOp(scene(s), [b.ref], "move");
  if (!mv.ok) return assert.fail("no move");
  s = run(s, opCommand(scene(s), { ...mv.op, axis: 0, value: -35 })!); // b overlaps a by 5 mm
  const k = s.outcome.kernel!;
  const [a2, b2] = bodies(s);
  const index = k.bodies!.findIndex((x) => x.id === b2!.id);
  const mine: number[] = [];
  const rest: number[] = [];
  const total = k.mesh!.triangles;
  const moving = new Uint8Array(total.length / 3);
  for (const f of k.faces!) if (f.body === index) for (let t = Math.floor(f.start / 3); t < Math.ceil((f.start + f.count) / 3); t++) moving[t] = 1;
  moving.forEach((m, t) => (m ? mine : rest).push(total[3 * t]!, total[3 * t + 1]!, total[3 * t + 2]!));
  const edges = Float32Array.from(cornerEdges(k.mesh!.vertices, k.mesh!.normals, total, settings.extrude.edgeAngleDeg));
  const { go, stay } = ownSegments(edges, k.mesh!.vertices, mine, rest);
  const inside = (arr: number[], pred: (x: number) => boolean) => { for (let i = 0; i < arr.length; i += 3) if (!pred(arr[i]!)) return false; return true; };
  // the dragged body is x 5 to 15, the other 0 to 10: the other body's edges at x = 10 (inside the dragged box) stay
  const stayAt10 = [];
  for (let i = 0; i + 5 < stay.length; i += 6) if (Math.abs(stay[i]! - 10) < 1e-3 && Math.abs(stay[i + 3]! - 10) < 1e-3) stayAt10.push(i);
  assert.ok(stayAt10.length >= 4, `the other body's edges at x = 10 stay (${stayAt10.length})`);
  const goAt10 = [];
  for (let i = 0; i + 5 < go.length; i += 6) if (Math.abs(go[i]! - 10) < 1e-3 && Math.abs(go[i + 3]! - 10) < 1e-3) goAt10.push(i);
  assert.equal(goAt10.length, 0, "none of them moves with the dragged body");
  assert.ok(go.length >= 6 * 8, "the dragged body's own outline moves");
  assert.ok(inside(go, (x) => x >= 5 - 1e-3 && x <= 15 + 1e-3));
  void a2;
});
