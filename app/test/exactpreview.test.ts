// The picture of an operation while its size is dragged is the kernel's own result for that size, so it cannot disagree with what is made when the pointer is let go (`in_328`, `in_331`); the only other kind
// of picture is a matrix on a body moved, turned or scaled whole, which is exact too (a rigid motion, or a uniform scale: no guess in it).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession, scene, undoLast, run } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { startOp, opCommand } from "../src/interaction/operations.ts";
import { createState } from "../src/interaction/controller.ts";
import type { AppState } from "../src/interaction/controller.ts";
import { frameOf } from "../src/interaction/frame.ts";
import type { Part } from "../src/operation/part.ts";

await kernel.init();
const size = { w: 1280, h: 687 };
const load = (f: string): Session => (openSession(kernel, readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8")) as unknown as { value: Session }).value;
const blocks = (): Session => undoLast(load("two-blocks-in_319.cad.json"));
const holed = (): Session => load("hole-body-move-in_317.cad.json");
const dragging = (s: Session, ref: string, op: unknown): AppState => ({ ...createState(s), session: { ...s, click: { ...s.click, selection: [ref as never] } }, op: op as never, drag: { handle: { id: "h", dir: [1, 0, 0], kind: "pull" } } as never });
const volumeOf = (m: { vertices: Float32Array; triangles: Uint32Array } | null | undefined): number => {
  if (!m) return NaN;
  const [V, T] = [m.vertices, m.triangles];
  let v = 0;
  for (let t = 0; t + 2 < T.length; t += 3) { const [a, b, c] = [3 * T[t]!, 3 * T[t + 1]!, 3 * T[t + 2]!]; v += (V[a]! * (V[b + 1]! * V[c + 2]! - V[b + 2]! * V[c + 1]!) - V[a + 1]! * (V[b]! * V[c + 2]! - V[b + 2]! * V[c]!) + V[a + 2]! * (V[b]! * V[c + 1]! - V[b + 1]! * V[c]!)) / 6; }
  return v;
};
const parts = (s: Session) => Object.values(scene(s).parts) as Part[];

/** The picture at each size is the same solid as what the operation makes at that size. */
function agrees(s: Session, ref: string, kind: "pushpull" | "edge", values: number[], what: string) {
  const sc = scene(s);
  const st = startOp(sc, [ref as never], kind);
  assert.ok(st.ok, `${what}: the operation starts`);
  if (!st.ok) return;
  for (const value of values) {
    let f: ReturnType<typeof frameOf> | null = null;
    for (let i = 0; i < 3; i++) f = frameOf(dragging(s, ref, { ...st.op, value }), size, i * 200);
    const cmd = opCommand(sc, { ...st.op, value });
    assert.ok(cmd, `${what} ${value}: there is a step`);
    const made = run(s, cmd!);
    assert.deepEqual(made.outcome.errors, {}, `${what} ${value}: it can be made`);
    const [picture, result] = [volumeOf(f!.mesh), volumeOf(made.outcome.kernel!.mesh)];
    assert.ok(Math.abs(picture - result) < 1e-6 * Math.max(1, Math.abs(result)), `${what} ${value}: the picture is ${picture}, the result ${result}`);
  }
}

test("a fillet and a chamfer dragged: the picture is the result at each size", () => {
  const s = blocks();
  agrees(s, "b/body/e@29.78,10.89,0~29.78,10.89,12.4~29.78,10.89,6.2", "edge", [8, 3.1, 1.7, -2.2, -6], "fillet / chamfer");
});

test("a fillet that is there already, pulled in and out: the picture is the result", () => {
  const s = load("two-blocks-in_319.cad.json");
  const round = parts(s).find((p) => p.origin === "body" && p.kind === "plane" && /CYLINDRE/.test(p.ref) && p.of === "b/x_s_025/o")!;
  agrees(s, round.ref, "pushpull", [0.8, -1, -2.5], "pulled fillet");
});

test("the end of an extrusion pulled and pushed: the picture is the result", () => {
  const s = blocks();
  const top = parts(s).find((p) => p.origin === "body" && p.kind === "plane" && p.of === "b/x_s_025/o" && /^b\/body\/f@0,0,1,/.test(p.ref))!;
  agrees(s, top.ref, "pushpull", [3.7, 8, -4], "end of an extrusion");
});

test("a side of an extruded sketch pulled: the picture is the result", () => {
  const s = blocks();
  const side = parts(s).find((p) => p.origin === "body" && p.kind === "plane" && p.of === "b/x_s_025/o" && /^b\/body\/f@1,0,0,/.test(p.ref))!;
  agrees(s, side.ref, "pushpull", [2, -3], "side");
});

test("the wall of a hole made wider: the picture is the result", () => {
  const s = holed();
  const body = parts(s).find((p): p is Extract<Part, { kind: "body" }> => p.kind === "body" && p.id === "x_s_028")!;
  const wall = parts(s).find((p) => p.origin === "body" && "of" in p && p.of === body.ref && "curved" in p && !!p.curved)!;
  agrees(s, wall.ref, "pushpull", [0.2, 0.6], "hole wall");
});

test("a body moved whole is drawn by a matrix, with no step in the picture; a fillet is not", () => {
  const s = holed();
  const sc = scene(s);
  const body = parts(s).find((p) => p.kind === "body" && p.id === "x_s_028")!;
  const mv = startOp(sc, [body.ref], "move");
  assert.ok(mv.ok);
  if (!mv.ok) return;
  const f = frameOf(dragging(s, body.ref, { ...mv.op, axis: 1, value: 5 }), size, 0);
  assert.ok(f.bodyMatrix, "a matrix");
  assert.equal(f.scene.steps.length, sc.steps.length, "no step made for the picture");
  const t = blocks();
  const fil = startOp(scene(t), ["b/body/e@29.78,10.89,0~29.78,10.89,12.4~29.78,10.89,6.2" as never], "edge");
  assert.ok(fil.ok);
  if (!fil.ok) return;
  const g = frameOf(dragging(t, "b/body/e@29.78,10.89,0~29.78,10.89,12.4~29.78,10.89,6.2", { ...fil.op, value: 2 }), size, 0);
  assert.equal(g.bodyMatrix, null, "no matrix for a rounding");
  assert.equal(g.scene.steps.at(-1)?.type, "edgeMod", "the picture is the step made");
});
