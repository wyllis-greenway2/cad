// The tools leave no two corners at one spot without a relation between them (`in_240`, `in_243`; the audit of what makes corners).
import test from "node:test";
import assert from "node:assert/strict";
import { worldRef } from "../src/shared/ref.ts";
import type { Vec3 } from "../src/math/vec.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, scene } from "../src/interaction/session.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import type { AppState } from "../src/interaction/controller.ts";
import { projector, lookStraight, homeCamera } from "../src/interaction/camera.ts";
import { pointOf } from "../src/operation/part.ts";

await kernel.init();
const env = { w: 800, h: 600, now: 0 };
const top = (): AppState => ({ ...createState(createSession(kernel)), cam: { ...lookStraight(homeCamera(), [0, 0, 1], [1, 0, 0]), target: [20, 15, 0] } });
const click = (st: AppState, p: Vec3) => { const [x, y] = projector(st.cam, env.w, env.h).project(p); return reduce(reduce(st, { type: "hover", x, y }, env), { type: "click", x, y, count: 1, shift: false }, env); };
const begin = (st: AppState, name: "rect" | "circle" | "line" | "arc") => reduce(st, { type: "begin", name }, env);
const off = (st: AppState) => reduce(st, { type: "menu", x: 5, y: 5, button: false }, env);

/** Pairs of drawn corners on one spot with no coincident relation between them (circle centres on one spot are the concentric case, left to that). */
const unjoined = (st: AppState): string[] => {
  const sc = scene(st.session);
  const cs = Object.values(sc.parts).filter((p) => p.kind === "corner" && p.origin === "drawn" && !p.derived);
  const centre = new Set(Object.values(sc.parts).filter((p) => p.kind === "circle").map((p) => (p as { center: string }).center));
  const out: string[] = [];
  for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
    const [a, b] = [pointOf((x) => sc.parts[x], cs[i]!.ref)!, pointOf((x) => sc.parts[x], cs[j]!.ref)!];
    if (Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) > 1e-6) continue;
    if (centre.has(cs[i]!.ref) && centre.has(cs[j]!.ref)) continue;
    if (!sc.relations.some((r) => r.kind === "coincident" && r.parts.includes(cs[i]!.ref) && r.parts.includes(cs[j]!.ref))) out.push(`${cs[i]!.ref}~${cs[j]!.ref}`);
  }
  return out;
};

const rect = (st: AppState, a: Vec3, b: Vec3) => off(click(click(begin(st, "rect"), a), b));
test("audit: a rectangle drawn from the corner of another", () => {
  let st = rect(top(), [5, 5, 0], [25, 15, 0]);
  st = rect(st, [25, 15, 0], [35, 25, 0]);
  assert.deepEqual(unjoined(st), []);
});
test("audit: a circle centred on a corner", () => {
  let st = rect(top(), [5, 5, 0], [25, 15, 0]);
  st = off(click(click(begin(st, "circle"), [25, 15, 0]), [31, 15, 0]));
  assert.deepEqual(unjoined(st), []);
});
test("audit: lines drawn from corner to corner", () => {
  let st = rect(top(), [5, 5, 0], [25, 15, 0]);
  st = off(click(click(begin(st, "line"), [25, 15, 0]), [35, 30, 0]));
  assert.deepEqual(unjoined(st), []);
});
test("audit: an arc from a corner, with its centre on another corner", () => {
  let st = rect(top(), [5, 5, 0], [25, 15, 0]);
  st = off(click(click(click(begin(st, "arc"), [25, 15, 0]), [30, 22, 0]), [25, 5, 0]));
  assert.deepEqual(unjoined(st), []);
});
test("audit: an arc about a corner", () => {
  let st = rect(top(), [5, 5, 0], [25, 15, 0]);
  st = off(click(click(click(begin(st, "arc"), [30, 15, 0]), [25, 20, 0]), [20, 15, 0])); // its centre is the rectangle's corner (25, 15)
  assert.deepEqual(unjoined(st), []);
});
test("audit: a line ended close to the end of an arc, and an arc ended close to the end of a line", () => {
  let st = top();
  st = off(click(click(click(begin(st, "arc"), [10, 5, 0]), [20, 12, 0]), [30, 5, 0]));
  st = off(click(click(begin(st, "line"), [30.15, 5.1, 0]), [40, 20, 0])); // starts near the arc's end
  st = off(click(click(begin(st, "line"), [5, 30, 0]), [9.9, 5.1, 0])); // ends near the arc's other end
  const sc = scene(st.session);
  const kinds = sc.relations.map((r) => r.kind);
  console.log("relations", kinds.join(), "unjoined", unjoined(st).join());
  assert.deepEqual(unjoined(st), []);
});
