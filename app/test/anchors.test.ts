// Anchors (`in_308`, `q_body_constraints`): a circular edge of a body is a read-only round that a drawn part can be held to, as to any circle: concentric, equal radius, tangent. The solver reads it and never moves it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession, scene, run, saveText } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { actionsFor } from "../src/interaction/actions.ts";
import { roundOf } from "../src/operation/part.ts";
import { lookup } from "../src/operation/scene.ts";
import type { Ref } from "../src/shared/ref.ts";

await kernel.init();
const open = (text = readFileSync(new URL("./fixtures/circle-on-body-face-in_305.cad.json", import.meta.url), "utf8")): Session => (openSession(kernel, text) as unknown as { value: Session }).value;
const setup = (s: Session) => {
  const sc = scene(s);
  const circle = Object.values(sc.parts).find((p) => p.kind === "circle" && p.plane === "d/p_030") as unknown as { ref: Ref; center: Ref; radius: number };
  const edge = Object.values(sc.parts).find((p) => p.origin === "body" && p.kind === "line" && (p.circle || p.mid) && Math.abs((sc.parts[p.a] as unknown as { at: number[] }).at[2]! - 13.5) < 1e-3 && !(p.circle && p.circle.radius < 5)) as unknown as { ref: Ref };
  const round = roundOf(lookup(sc), edge.ref)!;
  return { circle, edge, round };
};
const centreOf = (s: Session, ref: Ref) => (scene(s).parts[ref] as unknown as { at: number[] }).at;

test("a circular edge of the body is a circle that can be selected with a drawn one: Concentric, Equal radius and Tangent are offered (`in_308`)", () => {
  const s = open();
  const { circle, edge, round } = setup(s);
  assert.ok(round.anchor, "the edge is an anchor");
  const ids = actionsFor(scene(s), [circle.ref, edge.ref]).filter((a) => a.group === "relation").map((a) => a.id);
  assert.deepEqual(ids.sort(), ["concentric", "equalRadius", "tangent"]);
});

test("Concentric puts the drawn circle's centre exactly on the edge's centre and the body does not move (`in_308`)", () => {
  const s = open();
  const { circle, edge, round } = setup(s);
  const act = actionsFor(scene(s), [circle.ref, edge.ref]).find((a) => a.id === "concentric")!;
  assert.ok(act.enabled, `enabled: ${act.why}`);
  const after = run(s, act.run());
  assert.ok(!after.message, `solved: ${after.message}`);
  const c = centreOf(after, circle.center);
  assert.ok(Math.hypot(c[0]! - round.center[0], c[1]! - round.center[1]) < 1e-6, `centre ${c} on ${round.center}`);
  const r2 = roundOf(lookup(scene(after)), setup(after).edge.ref)!;
  assert.ok(Math.hypot(r2.center[0] - round.center[0], r2.center[1] - round.center[1]) < 1e-9 && Math.abs(r2.radius - round.radius) < 1e-9, "the edge stayed where it was");
});

test("Equal radius takes the edge's radius; Tangent holds the circle inside the edge's circle, touching it (`in_308`)", () => {
  const s = open();
  const { circle, edge, round } = setup(s);
  const eq = run(s, actionsFor(scene(s), [circle.ref, edge.ref]).find((a) => a.id === "equalRadius")!.run());
  assert.ok(!eq.message, `${eq.message}`);
  assert.ok(Math.abs((scene(eq).parts[circle.ref] as unknown as { radius: number }).radius - round.radius) < 1e-6, "the radius of the edge");
  const tg = run(s, actionsFor(scene(s), [circle.ref, edge.ref]).find((a) => a.id === "tangent")!.run());
  assert.ok(!tg.message, `${tg.message}`);
  const [c, r] = [centreOf(tg, circle.center), (scene(tg).parts[circle.ref] as unknown as { radius: number }).radius];
  const d = Math.hypot(c[0]! - round.center[0], c[1]! - round.center[1]);
  assert.ok(Math.abs(d - Math.abs(round.radius - r)) < 1e-4 || Math.abs(d - (round.radius + r)) < 1e-4, `touching: distance ${d}, radii ${round.radius} and ${r}`);
});

test("the constraint to a body edge survives saving and opening (`in_308`)", () => {
  const s = open();
  const { circle, edge, round } = setup(s);
  const done = run(s, actionsFor(scene(s), [circle.ref, edge.ref]).find((a) => a.id === "concentric")!.run());
  const again = open(saveText(done));
  const c = centreOf(again, circle.center);
  assert.ok(Math.hypot(c[0]! - round.center[0], c[1]! - round.center[1]) < 1e-6);
  assert.equal(scene(again).relations.filter((r) => r.kind === "concentric").length, 1);
});

import { createState, reduce } from "../src/interaction/controller.ts";
import type { AppState } from "../src/interaction/controller.ts";
import { projector, homeCamera } from "../src/interaction/camera.ts";
import { suggestionsFor, nearCommand } from "../src/interaction/suggest.ts";
import { anchorRounds } from "../src/operation/anchors.ts";

test("a circle drawn on the face with its centre near the centre of the body's edge goes there and is made concentric with it (`in_308`)", () => {
  const s = open();
  const { edge, round } = setup(s);
  const pl = scene(s).parts["d/p_030"] as never;
  assert.ok(anchorRounds(scene(s), pl).some((a) => a.ref === edge.ref), "the edge is an anchor of the face's plane");
  const env = { w: 900, h: 700, now: 0 };
  let st: AppState = { ...createState(s), cam: { ...homeCamera(), straight: true, azimuth: 0, elevation: Math.PI / 2, target: [round.center[0], round.center[1], 13.5], distance: 60 } };
  const px = (p: number[]) => projector(st.cam, env.w, env.h).project(p as never);
  st = reduce(st, { type: "begin", name: "circle" }, env);
  const near = px([round.center[0] + 0.15, round.center[1] - 0.1, 13.5]);
  st = reduce(st, { type: "hover", x: near[0], y: near[1] }, env);
  st = reduce(st, { type: "click", x: near[0], y: near[1], count: 1, shift: false }, env);
  assert.ok(st.tool, "the circle's centre is set");
  const c = st.tool!.points[0]!;
  assert.ok(Math.hypot(c[0] - round.center[0], c[1] - round.center[1]) < 1e-9, `the centre was taken to the edge's centre: ${c}`);
  const r = px([round.center[0] + 2, round.center[1], 13.5]);
  st = reduce(st, { type: "hover", x: r[0], y: r[1] }, env);
  st = reduce(st, { type: "click", x: r[0], y: r[1], count: 1, shift: false }, env);
  assert.ok(scene(st.session).relations.some((x) => x.kind === "concentric" && x.parts.includes(edge.ref)), "made concentric with the body's edge");
});

test("a selected circle whose centre is near the centre of the body's edge is offered Concentric, and one that nearly touches it Tangent (`in_308`)", () => {
  const s = open();
  const { circle, edge, round } = setup(s);
  // the circle is 0.6 mm from the edge's centre (nearFrac of its radius is about 0.3 mm: not near enough yet), so move it close first
  const near = run(s, { type: "movePart", ref: circle.center, to: [round.center[0] + 0.2, round.center[1], 13.5] });
  const items = suggestionsFor(scene(near), [circle.ref])?.items.map((i) => i.id) ?? [];
  assert.ok(items.includes(`near:concentric:${edge.ref}`), `concentric offered: ${items}`);
  const cmd = nearCommand(scene(near), [circle.ref], `near:concentric:${edge.ref}`)!;
  const after = run(near, cmd);
  assert.ok(!after.message);
  const c = centreOf(after, circle.center);
  assert.ok(Math.hypot(c[0]! - round.center[0], c[1]! - round.center[1]) < 1e-6, "the centres are one");
});
