// What a push / pull of a flat face does, three ways (`in_386`, `q_edits_saturate` option A), and the hole that is moved by its wall: nothing valid is refused for being valid.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession, scene } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { startOp } from "../src/interaction/operations.ts";
import { figureBehindFace } from "../src/interaction/faceedit.ts";
import { runOp } from "../src/interaction/runop.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import { frameOf } from "../src/interaction/frame.ts";
import type { Part } from "../src/operation/part.ts";

await kernel.init();
const open = (f: string) => (openSession(kernel, readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8")) as unknown as { value: Session }).value;
const block = () => open("chamfered-block-in_386.cad.json");
const topOf = (s: Session) => (Object.values(scene(s).parts) as Part[]).find((p) => p.kind === "plane" && p.origin === "body" && p.ref.includes("f@0,0,1,17.9"))!;
const push = (s: Session, kind: "move" | "extrude" | "extend", value: number) => {
  const st = startOp(scene(s), [topOf(s).ref], "pushpull");
  assert.ok(st.ok);
  return runOp(s, { ...st.op, faceKind: kind, value })!.session;
};
const vol = (s: Session) => s.outcome.kernel!.volume!;
const zmax = (s: Session) => s.outcome.kernel!.bbox!.max[2];
// the top of the block is 9.11 x 8.74 after its 2.2 mm chamfers, and the chamfer faces slope at 45 degrees
const [W, H] = [13.51 - 4.4, 13.14 - 4.4];
const frustum = (h: number) => { let v = 0; const n = 2000; for (let i = 0; i < n; i++) { const t = ((i + 0.5) * h) / n; v += Math.max(0, W - 2 * t) * Math.max(0, H - 2 * t) * (h / n); } return v; };

test("extend: the top is pulled up and the chamfer faces go on with it, so the block grows as a frustum", () => {
  const s = block();
  const done = push(s, "extend", 3);
  assert.equal(done.message, null);
  assert.ok(Math.abs(vol(done) - vol(s) - frustum(3)) < 0.5, `added ${(vol(done) - vol(s)).toFixed(2)}, a frustum of ${frustum(3).toFixed(2)}`);
  assert.ok(Math.abs(zmax(done) - 20.9) < 1e-6);
});

test("extend past the top of the chamfers: nothing more is added and nothing fails", () => {
  const s = block();
  const a = push(s, "extend", 4.6);
  const b = push(s, "extend", 20);
  assert.equal(a.message, null);
  assert.equal(b.message, null);
  assert.deepEqual(b.outcome.errors, {});
  assert.ok(Math.abs(vol(a) - vol(b)) < 1e-6, "the same body: it stopped where the chamfers meet");
  assert.ok(Math.abs(vol(b) - vol(s) - frustum(H / 2)) < 0.5, "a roof, as the block is not square");
});

test("extend inward: the chamfers go on down and the top is cut flat; all of it is refused only when nothing would be left", () => {
  const s = block();
  const done = push(s, "extend", -3);
  assert.equal(done.message, null);
  assert.ok(vol(done) < vol(s));
  assert.ok(Math.abs(zmax(done) - 14.9) < 1e-6);
  const gone = push(s, "extend", -17.9);
  assert.match(gone.message ?? "", /nothing of the body would be left/);
});

test("extrude adds a prism of the face's outline, and move grows what is attached, as before", () => {
  const s = block();
  const e = push(s, "extrude", 3);
  assert.ok(Math.abs(vol(e) - vol(s) - W * H * 3) < 0.5, "the top face's area times 3");
  const m = push(s, "move", 3);
  assert.ok(vol(m) - vol(s) > vol(e) - vol(s) + 100, "the whole footprint is lifted");
  assert.ok(Math.abs(zmax(m) - 20.9) < 1e-6);
});

test("the three kinds are offered while a flat face is pushed or pulled, and the choice is made the step", () => {
  const s = block();
  let st = createState({ ...s, click: { ...s.click, selection: [topOf(s).ref] as never } });
  st = reduce(st, { type: "begin", name: "pushpull" }, { w: 800, h: 600, now: 0 } as never);
  const f0 = frameOf(st, { w: 800, h: 600 });
  assert.deepEqual(f0.faceKinds?.map((k) => k.id), ["move", "extrude", "extend"]);
  assert.equal(f0.faceKinds?.find((k) => k.on)?.id, "move");
  st = reduce(st, { type: "faceKind", kind: "extend" }, { w: 800, h: 600, now: 0 } as never);
  assert.equal(frameOf(st, { w: 800, h: 600 }).faceKinds?.find((k) => k.on)?.id, "extend");
  st = reduce({ ...st, op: { ...st.op!, value: 3 } }, { type: "typed", key: "Enter", shift: false }, { w: 800, h: 600, now: 0 } as never);
  const step = scene(st.session).steps.at(-1)!;
  assert.equal(step.type, "pushPull");
  assert.equal(step.params.extend, 1);
  assert.equal(st.session.message, null);
});

test("the wall of a hole is moved by moving its circle: the hole is pushed through the skin in front of it", () => {
  const s = open("hole-skin-in_386.cad.json");
  const sc = scene(s);
  const wall = (Object.values(sc.parts) as Part[]).find((p): p is Extract<Part, { kind: "plane" }> => p.kind === "plane" && p.origin === "body" && !!p.curved && p.curved.radius < 3)!;
  assert.ok(wall.curved!.lo > -1e-6, "the hole starts inside the front of the body");
  const st = startOp(sc, [wall.ref], "move");
  assert.ok(st.ok);
  assert.deepEqual(st.op.parts, ["d/e_033.k", "d/e_033.c"]);
  assert.equal(st.op.axis, 1, "the Move starts along the hole's own axis");
  const moved = runOp(s, { ...st.op, axis: 1, value: -1 })!.session;
  assert.equal(moved.message, null);
  assert.deepEqual(moved.outcome.errors, {});
  const wall2 = (Object.values(scene(moved).parts) as Part[]).find((p): p is Extract<Part, { kind: "plane" }> => p.kind === "plane" && p.origin === "body" && !!p.curved && p.curved.radius < 3)!;
  assert.ok(Math.abs(wall2.curved!.lo - moved.outcome.kernel!.bbox!.min[1]) < 1e-3, "the hole now runs from the front of the body");
  assert.ok(vol(moved) < vol(s), "the skin is cut away");
  // and it can be tilted
  assert.ok(startOp(sc, [wall.ref], "rotate").ok);
});

test("a flat end of an extrusion is not taken for the figure behind a hole's wall", () => {
  const s = block();
  assert.equal(figureBehindFace(scene(s), [topOf(s).ref]), null);
});

// ---- Extend with round neighbours and holes (`in_391`) ----
import { createSession, run } from "../src/interaction/session.ts";
import { worldRef } from "../src/shared/ref.ts";
import { drawChain, drawCircle } from "../src/operation/build.ts";
import { nextId } from "../src/operation/scene.ts";

const XY = worldRef("XY");
const extrude = (s: Session, parts: string[], depth: number, mode?: string) => run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: parts as never, params: { depth, ...(mode ? { mode } : {}) } } });
const topPlane = (s: Session, z: number, name: string) => run(s, { type: "addPart", part: { ref: name, kind: "plane", origin: "drawn", plane: null, movable: false, at: [0, 0, z], u: [1, 0, 0], v: [0, 1, 0], onBody: true } as never });
const faceAt = (s: Session, z: number) => (Object.values(scene(s).parts) as Part[]).filter((p) => p.kind === "plane" && p.origin === "body" && p.ref.includes(`f@0,0,1,${z}`)).sort((a, b) => ((b as { mesh?: number[] }).mesh?.length ?? 0) - ((a as { mesh?: number[] }).mesh?.length ?? 0))[0]!;
const extend = (s: Session, ref: string, value: number) => {
  const st = startOp(scene(s), [ref as never], "pushpull");
  assert.ok(st.ok);
  return runOp(s, { ...st.op, faceKind: "extend", value })!.session;
};

test("extend the top of a round post: the wall goes on up as a cylinder", () => {
  let s = createSession(kernel);
  const c = drawCircle(scene(s), XY, [0, 0, 0], 10);
  s = run(s, c.command);
  s = extrude(s, [c.circle], 20);
  const done = extend(s, faceAt(s, 20).ref, 5);
  assert.equal(done.message, null);
  assert.ok(Math.abs(vol(done) - vol(s) - Math.PI * 100 * 5) < 0.5, `${(vol(done) - vol(s)).toFixed(2)} of ${(Math.PI * 500).toFixed(2)}`);
  const back = extend(s, faceAt(s, 20).ref, -5);
  assert.ok(Math.abs(vol(s) - vol(back) - Math.PI * 100 * 5) < 0.5, "and the same pushed in");
});

test("extend the top of a block with a round hole: the hole goes on through the new material", () => {
  let s = createSession(kernel);
  const r = drawChain(scene(s), XY, [[-15, -15, 0], [15, -15, 0], [15, 15, 0], [-15, 15, 0]], true);
  s = run(s, r.command);
  s = extrude(s, r.lines as string[], 10);
  s = topPlane(s, 10, "d/p_top");
  const hole = drawCircle(scene(s), "d/p_top" as never, [0, 0, 10], 4);
  s = run(s, hole.command);
  s = extrude(s, [hole.circle], -10, "cut");
  assert.ok(Math.abs(vol(s) - (900 - Math.PI * 16) * 10) < 0.5, "a block with a hole");
  const done = extend(s, faceAt(s, 10).ref, 4);
  assert.equal(done.message, null);
  assert.ok(Math.abs(vol(done) - vol(s) - (900 - Math.PI * 16) * 4) < 0.5, `${(vol(done) - vol(s)).toFixed(2)} of ${((900 - Math.PI * 16) * 4).toFixed(2)}`);
});

test("extend the top of a plate with a post standing on it: the new material goes round the post", () => {
  let s = createSession(kernel);
  const r = drawChain(scene(s), XY, [[-15, -15, 0], [15, -15, 0], [15, 15, 0], [-15, 15, 0]], true);
  s = run(s, r.command);
  s = extrude(s, r.lines as string[], 2);
  s = topPlane(s, 2, "d/p_top");
  const post = drawCircle(scene(s), "d/p_top" as never, [0, 0, 2], 5);
  s = run(s, post.command);
  s = extrude(s, [post.circle], 10);
  const done = extend(s, faceAt(s, 2).ref, 3);
  assert.equal(done.message, null);
  assert.ok(Math.abs(vol(done) - vol(s) - (900 - Math.PI * 25) * 3) < 0.5, `${(vol(done) - vol(s)).toFixed(2)} of ${((900 - Math.PI * 25) * 3).toFixed(2)}`);
});

test("several faces pushed together: the kinds are Extrude and Extend, and Extend extends each with its neighbours", () => {
  const s = block();
  // the top and the bottom of the chamfered block: the top goes up along its normal, the bottom down along its
  const bottom = (Object.values(scene(s).parts) as Part[]).find((p) => p.kind === "plane" && p.origin === "body" && p.ref.includes("f@0,0,-1,0"))!;
  let st = createState({ ...s, click: { ...s.click, selection: [topOf(s).ref, bottom.ref] as never } });
  st = reduce(st, { type: "begin", name: "pushpull" }, { w: 800, h: 600, now: 0 } as never);
  assert.deepEqual(frameOf(st, { w: 800, h: 600 }).faceKinds?.map((k) => [k.id, k.on]), [["extrude", true], ["extend", false]]);
  st = reduce(st, { type: "faceKind", kind: "extend" }, { w: 800, h: 600 } as never);
  st = reduce({ ...st, op: { ...st.op!, value: 2 } }, { type: "typed", key: "Enter", shift: false }, { w: 800, h: 600, now: 0 } as never);
  assert.equal(st.session.message, null);
  const steps = scene(st.session).steps.filter((x) => x.type === "pushPull");
  assert.equal(steps.length, 2);
  assert.ok(steps.every((x) => x.params.extend === 1));
  assert.ok(Math.abs(st.session.outcome.kernel!.bbox!.max[2] - 19.9) < 1e-6 && Math.abs(st.session.outcome.kernel!.bbox!.min[2] + 2) < 1e-6, "up at the top, down at the bottom");
});
