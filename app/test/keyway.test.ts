// The keyway maker (`dec_keyway_maker`, `in_1278`): a key, a flat or an ISO 14 spline cut into the hole of a round body, or made on a shaft.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, scene, run } from "../src/interaction/session.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import { homeCamera } from "../src/interaction/camera.ts";
import { worldRef } from "../src/shared/ref.ts";
import { drawCircle } from "../src/operation/build.ts";
import { figureParams, nextId } from "../src/operation/scene.ts";
import type { Command } from "../src/operation/commands.ts";
import { modelFields, MODEL_KINDS } from "../src/operation/modelkinds.ts";
import { modelEntry, modelTyped, modelTarget } from "../src/interaction/modeltool.ts";
import { keywayProblem, keywayResolve, keywayAbout, KEYWAY_START } from "../src/operation/modelkeyway.ts";
import type { KeywaySpec } from "../src/operation/modelkeyway.ts";
import { splineOutline, iso14 } from "../src/operation/splines.ts";
import { flatten } from "../src/operation/arcs.ts";

await kernel.init();
const env = { w: 800, h: 600, now: 0 } as never;
const XY = worldRef("XY");
const K = (o: Partial<KeywaySpec> = {}): KeywaySpec => ({ ...KEYWAY_START, ...o });
type B = { ref: string; volume: number };
const bodies = (st: { session: ReturnType<typeof createSession> }): B[] => Object.values(scene(st.session).parts).filter((p) => p.kind === "body") as unknown as B[];

/** a body 40 across and 15 thick, with a bore of 8 if asked */
function body(bore = 0) {
  let s = createSession(kernel);
  const outer = drawCircle(scene(s), XY, [0, 0, 0], 20); s = run(s, outer.command);
  const holes: string[][] = [];
  if (bore > 0) { const h = drawCircle(scene(s), XY, [0, 0, 0], bore / 2); s = run(s, h.command); holes.push([h.circle]); }
  return run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: [outer.circle], params: { depth: 15, ...figureParams([{ outer: [outer.circle], holes: holes as never }]) } } } as Command);
}
const keyed = (s0: ReturnType<typeof createSession>, typed: Record<string, string>) => {
  const b = bodies({ session: s0 })[0]!;
  let st: ReturnType<typeof createState> = { ...createState(s0), cam: homeCamera() };
  st = { ...st, session: { ...st.session, click: { ...st.session.click, selection: [b.ref as never] } } };
  st = reduce(st, { type: "runAction", id: "model:keyhole" }, env);
  assert.ok(st.tool?.fill?.cut, `armed on the body: ${st.session.message}`);
  const at = (k: string): number => 1 + modelFields("keyhole").findIndex((f) => f.key === k);
  for (const [k, v] of Object.entries(typed)) st = { ...st, tool: { ...st.tool!, model: modelTyped(st.tool!.model!, at(k), v) } };
  const fields = modelEntry(scene(st.session), st.tool!)!.fields, problem = modelTarget(scene(st.session), st.tool!)!.problem;
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  let n = 0; while (st.building && n++ < 12) st = reduce(st, { type: "buildNext" }, env);
  return { st, fields, problem, volume: bodies(st)[0]?.volume ?? 0, count: bodies(st).length };
};

test("a key, a flat and a spline are cut into the round hole of a solid body: one body each, the key takes metal, the flat leaves it, the spline cuts the most", () => {
  const whole = bodies({ session: body() })[0]!.volume;
  const round = keyed(body(), { kind: "0", key: "0.001" }); // (a key as thin as can be is the round hole)
  void round;
  const key = keyed(body(), { kind: "0" }), flat = keyed(body(), { kind: "1" }), spline = keyed(body(), { kind: "2", size: "23" });
  const plain = Math.PI * 25 * 15; // (the round hole of 10: the start)
  for (const r of [key, flat, spline]) { assert.equal(r.problem, null, r.problem ?? ""); assert.equal(r.count, 1, `one body: ${r.st.session.message}`); }
  assert.ok(key.volume < whole - plain - 40, `the bore and the key's slot: ${key.volume} of ${whole}`);
  assert.ok(flat.volume > whole - plain + 40 && flat.volume < whole - plain + 200, `the flat leaves metal in the bore: ${flat.volume} against ${whole - plain}`);
  assert.ok(spline.volume < whole - 5000, `the spline 6 x 23 x 28: ${spline.volume} of ${whole}`);
});

test("a body with a bore of its own: the bore is its, locked; the key, flat and spline are cut into it; a spline smaller than the bore takes a bigger size by itself", () => {
  const key = keyed(body(8), { kind: "0" });
  const bore = key.fields.find((f) => f.label === "Bore diameter")!;
  assert.ok(bore.locked, "the body's bore is locked");
  assert.equal(key.count, 1);
  assert.ok(key.volume < bodies({ session: body(8) })[0]!.volume - 3, `a slot is cut in the wall: ${key.volume}`);
  const spline = keyed(body(8), { kind: "2" });
  assert.equal(spline.problem, null, spline.problem ?? "");
  assert.equal(spline.count, 1);
  assert.ok(keywayAbout(K({ kind: 2, bore: 8, boreOwned: 1, bodyR: 20 }), "hole").includes("ISO 14"), "named by the standard");
});

test("the numbers that make no keyway say why, and never fail where a number can be put in: a key needs only the diameter, a bore too big for the spline or a spline too big for the body is refused with the reason", () => {
  assert.equal(keywayProblem(K({ kind: 0, key: 0, keyDepth: 0, bore: 10 }), "hole"), null, "a key alone: the standard's width and depth");
  assert.equal(keywayProblem(K({ kind: 0, key: 3, bore: 5 }), "hole"), null, "a bore outside the table: a depth is put in");
  assert.equal(keywayProblem(K({ kind: 1, bore: 10 }), "hole"), null, "a flat of no depth: a usual one");
  assert.match(keywayProblem(K({ kind: 0, bore: 0 }), "hole") ?? "", /needs a bore/);
  assert.match(keywayProblem(K({ kind: 0, bore: 10, key: 10 }), "hole") ?? "", /as wide as the bore/);
  assert.match(keywayProblem(K({ kind: 2, bore: 30, boreOwned: 1, size: 11, bodyR: 40 }), "hole") ?? "", /bigger than the spline's minor diameter/);
  assert.match(keywayProblem(K({ kind: 2, size: 112, bodyR: 20 }), "hole") ?? "", /choose a smaller size/);
  assert.match(keywayProblem(K({ kind: 0, bore: 10, keyDepth: 30, bodyR: 20 }), "hole") ?? "", /reach the body's wall/);
  const std = keywayResolve(K({ kind: 0, bore: 10 }), "hole");
  assert.ok(std.ok && std.value.kind === 0 && std.value.w === 3 && std.value.depth === 1.4, "DIN 6885: 3 x 1.4 for a bore of 10");
});

test("a shaft: a keyway, a flat or an ISO 14 spline on a round shaft, one body each, the volume the profile says", () => {
  const make = (typed: Record<string, string>) => {
    let st: ReturnType<typeof createState> = { ...createState(createSession(kernel)), cam: homeCamera() };
    st = reduce(st, { type: "runAction", id: "model:keyshaft" }, env);
    const at = (k: string): number => 1 + modelFields("keyshaft").findIndex((f) => f.key === k);
    st = { ...st, tool: { ...st.tool!, plane: XY, points: [[0, 0, 0]], cursor: [0, 0, 0], model: { ...st.tool!.model!, typed: st.tool!.model!.typed.map((x, i) => (i === 0 ? "30" : x)) } } };
    for (const [k, v] of Object.entries(typed)) st = { ...st, tool: { ...st.tool!, model: modelTyped(st.tool!.model!, at(k), v) } };
    st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
    let n = 0; while (st.building && n++ < 12) st = reduce(st, { type: "buildNext" }, env);
    assert.equal(bodies(st).length, 1, `one body: ${st.session.message}`);
    return bodies(st)[0]!.volume;
  };
  const round = Math.PI * 36 * 30;
  const key = make({ kind: "0" }), flat = make({ kind: "1" });
  assert.ok(key < round - 20 && key > round - 400, `a keyway in the shaft: ${key} of ${round}`);
  assert.ok(flat < round - 50 && flat > round - 400, `a flat: ${flat} of ${round}`);
  const row = iso14("6 x 23 x 28")!, o = splineOutline(row)!, f = flatten(o.points, o.bulges, 64);
  const area = Math.abs(f.reduce((s, p, i) => s + p[0] * f[(i + 1) % f.length]![1] - f[(i + 1) % f.length]![0] * p[1], 0)) / 2;
  const spline = make({ kind: "2", size: "23" });
  assert.ok(Math.abs(spline - area * 30) < 0.004 * area * 30, `the spline shaft: ${spline} against ${area * 30}`);
});

test("the box: the shape is a choice; a key shows its width and depth, a flat its depth, a spline its series and size; the menu has the two tools", () => {
  const fields = (kind: string) => keyed(body(), { kind }).fields.map((f) => f.label);
  assert.ok(fields("0").includes("Key width") && fields("0").includes("Key depth") && !fields("0").includes("Flat depth"));
  assert.ok(fields("1").includes("Flat depth") && !fields("1").includes("Key width"));
  assert.ok(fields("2").includes("Series") && fields("2").includes("Spline size") && !fields("2").includes("Flat depth"));
  assert.ok(MODEL_KINDS.includes("keyhole") && MODEL_KINDS.includes("keyshaft"));
  const st: ReturnType<typeof createState> = { ...createState(createSession(kernel)), cam: homeCamera() };
  const items = (reduce(st, { type: "menu", x: 400, y: 300, button: true }, env).menu!.items as { id: string; children?: unknown[] }[]).flatMap(function walk(i: any): string[] { return [i.id, ...(i.children ?? i.items ?? []).flatMap(walk)]; });
  assert.ok(items.includes("model:keyhole") && items.includes("model:keyshaft"), "both are in the menu");
});

test("Keyed shaft with a round shaft selected (its surface or the whole rod) keys that shaft where it stands, as the keyed fit: no surface to click (`in_1283`)", () => {
  let s = createSession(kernel);
  const c = drawCircle(scene(s), XY, [0, 0, 0], 6); s = run(s, c.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: [c.circle], params: { depth: 40, ...figureParams([{ outer: [c.circle], holes: [] }]) } } } as Command);
  const rod = bodies({ session: s })[0]!;
  for (const pick of [rod.ref, `${rod.ref}/f@0,0,1,40`]) {
    let st: ReturnType<typeof createState> = { ...createState(s), cam: homeCamera() };
    st = { ...st, session: { ...st.session, click: { ...st.session.click, selection: [pick as never] } } };
    st = reduce(st, { type: "runAction", id: "model:keyshaft" }, env);
    assert.equal(st.tool?.model?.kind, "keyfit", `${pick}: ${st.session.message}`);
    assert.ok(!st.session.message, "nothing to select");
    st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
    let n = 0; while (st.building && n++ < 12) st = reduce(st, { type: "buildNext" }, env);
    assert.equal(bodies(st).length, 1, st.session.message ?? "");
    assert.ok(bodies(st)[0]!.volume < rod.volume - 30, `the keyway is cut into the rod: ${bodies(st)[0]!.volume} of ${rod.volume}`);
  }
  // with nothing selected the tool still waits for a surface
  const none = reduce({ ...createState(s), cam: homeCamera() }, { type: "runAction", id: "model:keyshaft" }, env);
  assert.equal(none.tool?.model?.kind, "keyshaft");
});

test("a shaft can be keyed at an end only: the far end, the near end or both; round and as wide as the spline elsewhere (`in_1284`)", () => {
  const make = (typed: Record<string, string>) => {
    let st: ReturnType<typeof createState> = { ...createState(createSession(kernel)), cam: homeCamera() };
    st = reduce(st, { type: "runAction", id: "model:keyshaft" }, env);
    const at = (k: string): number => 1 + modelFields("keyshaft").findIndex((f) => f.key === k);
    st = { ...st, tool: { ...st.tool!, plane: XY, points: [[0, 0, 0]], cursor: [0, 0, 0], model: { ...st.tool!.model!, typed: st.tool!.model!.typed.map((x, i) => (i === 0 ? "60" : x)) } } };
    for (const [k, v] of Object.entries(typed)) st = { ...st, tool: { ...st.tool!, model: modelTyped(st.tool!.model!, at(k), v) } };
    st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
    let n = 0; while (st.building && n++ < 14) st = reduce(st, { type: "buildNext" }, env);
    assert.equal(bodies(st).length, 1, `one body: ${st.session.message}`);
    return { volume: bodies(st)[0]!.volume, st };
  };
  const round = (d: number, l: number) => Math.PI * (d / 2) ** 2 * l;
  const whole = make({ kind: "2", size: "23", bore: "28" });
  const far = make({ kind: "2", size: "23", bore: "28", part: "1", span: "20" });
  const both = make({ kind: "2", size: "23", bore: "28", part: "3", span: "20" });
  assert.ok(far.volume > whole.volume + 3000, `an end only: ${far.volume} against all of it ${whole.volume}`);
  assert.ok(far.volume < round(28, 60) - 100, "less than the round shaft: the end is splined");
  assert.ok(both.volume < far.volume - 100 && both.volume > whole.volume, `both ends: ${both.volume}`);
  // a keyseat under a hub only: the key's slot cut over 20 mm at the far end
  const seat = make({ kind: "0", bore: "12", part: "1", span: "20" }), full = make({ kind: "0", bore: "12" });
  assert.ok(seat.volume > full.volume + 100 && seat.volume < round(12, 60), `${seat.volume} against ${full.volume}`);
  const rec = scene(far.st.session).keyways![0]!;
  assert.deepEqual(rec.span, [40, 60], "the record keeps the keyed end, where a hub goes");
});
