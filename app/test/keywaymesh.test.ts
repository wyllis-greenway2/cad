// Mesh for the keyway maker (`dec_keyway_maker`, `in_1298`): a keyed hole selected gets the shaft that fits it, a shaft the hub that fits it, from scratch or cut into the round geometry that is clicked.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, scene, run } from "../src/interaction/session.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import type { AppState } from "../src/interaction/controller.ts";
import { homeCamera } from "../src/interaction/camera.ts";
import { worldRef } from "../src/shared/ref.ts";
import { drawCircle } from "../src/operation/build.ts";
import { figureParams, nextId } from "../src/operation/scene.ts";
import type { Command } from "../src/operation/commands.ts";
import { modelFields } from "../src/operation/modelkinds.ts";
import { modelTyped, modelTarget } from "../src/interaction/modeltool.ts";
import { keywayOf, meshTool, meshConvert } from "../src/interaction/keywaymesh.ts";
import { cutFillOf } from "../src/operation/roundbody.ts";
import { splineOutline, iso14 } from "../src/operation/splines.ts";
import { flatten } from "../src/operation/arcs.ts";

await kernel.init();
const env = { w: 800, h: 600, now: 0 } as never;
const XY = worldRef("XY");
type B = { ref: string; id: string; volume: number };
const bodies = (st: { session: ReturnType<typeof createSession> }): B[] => Object.values(scene(st.session).parts).filter((p) => p.kind === "body") as unknown as B[];
const cylinder = (r: number, depth: number) => {
  let s = createSession(kernel);
  const c = drawCircle(scene(s), XY, [0, 0, 0], r); s = run(s, c.command);
  return run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: [c.circle], params: { depth, ...figureParams([{ outer: [c.circle], holes: [] }]) } } } as Command);
};
const state = (s: ReturnType<typeof createSession>): AppState => ({ ...createState(s), cam: homeCamera() });
const select = (st: AppState, ref: string): AppState => ({ ...st, session: { ...st.session, click: { ...st.session.click, selection: [ref as never] } } });
const typedAt = (st: AppState, kind: string, k: string, v: string): AppState => ({ ...st, tool: { ...st.tool!, model: modelTyped(st.tool!.model!, 1 + modelFields(kind as never).findIndex((f) => f.key === k), v) } });
const build = (st: AppState): AppState => { st = reduce(st, { type: "typed", key: "Enter", shift: false }, env); let n = 0; while (st.building && n++ < 14) st = reduce(st, { type: "buildNext" }, env); return st; };

/** a splined shaft, made with the keyed shaft tool: 6 x 23 x 28 medium, 30 long */
function splinedShaft() {
  let st = state(createSession(kernel));
  st = reduce(st, { type: "runAction", id: "model:keyshaft" }, env);
  st = { ...st, tool: { ...st.tool!, plane: XY, points: [[0, 0, 0]], cursor: [0, 0, 0] } };
  st = typedAt(st, "keyshaft", "kind", "2"); st = typedAt(st, "keyshaft", "size", "23");
  return build(st);
}

test("a keyed hole and a keyed shaft are remembered: the record names the body, the shape and where it stands", () => {
  const shaft = splinedShaft();
  assert.equal(bodies(shaft).length, 1);
  const rec = keywayOf(scene(shaft.session), bodies(shaft)[0]!.ref as never);
  assert.ok(rec, "the shaft's record");
  assert.equal(rec!.role, "shaft");
  assert.equal(rec!.nums.kind, 2); assert.equal(rec!.nums.size, 23); assert.equal(rec!.nums.series, 1);
  assert.deepEqual(rec!.span, [0, 30]);
  // a keyed hole in a body
  let st = select(state(cylinder(20, 15)), bodies({ session: cylinder(20, 15) })[0]!.ref);
  st = reduce(st, { type: "runAction", id: "model:keyhole" }, env);
  st = build(st);
  const hole = keywayOf(scene(st.session), bodies(st)[0]!.ref as never);
  assert.ok(hole && hole.role === "hole" && hole.nums.kind === 0, "the hole's record");
  assert.equal(hole!.nums.key, 3, "the key's width filled in: DIN 6885 for a bore of 10");
  assert.deepEqual(hole!.span, [-7.5, 7.5]);
  assert.equal(scene(st.session).keyways!.length, 1);
});

test("Mesh on a splined shaft makes the hub that fits it, from scratch: a disc with the spline's bore, the same shape, 0.1 of play", () => {
  const shaft = splinedShaft();
  let st = select(shaft, bodies(shaft)[0]!.ref);
  st = reduce(st, { type: "runAction", id: "keyway:mesh" }, env);
  assert.equal(st.tool?.model?.kind, "keyhub", st.session.message ?? "");
  const g = modelTarget(scene(st.session), st.tool!)!;
  assert.equal(g.problem, null, g.problem ?? "");
  assert.equal(g.nums.kind, 2); assert.equal(g.nums.size, 23); assert.equal(g.nums.play, 0.1);
  st = build(st);

  assert.equal(bodies(st).length, 2, `the shaft and the hub: ${st.session.message}`);
  const hub = bodies(st).find((b) => b.id !== bodies(shaft)[0]!.id)!;
  const row = iso14("6 x 23 x 28")!, o = splineOutline({ ...row, d: row.d + 0.1, D: row.D + 0.1, B: row.B + 0.1 })!, f = flatten(o.points, o.bulges, 64);
  const area = Math.abs(f.reduce((s, p, i) => s + p[0] * f[(i + 1) % f.length]![1] - f[(i + 1) % f.length]![0] * p[1], 0)) / 2;
  const T = g.nums.thick!, R = g.nums.outer! / 2;
  assert.ok(Math.abs(hub.volume - (Math.PI * R * R - area) * T) < 0.01 * Math.PI * R * R * T, `the hub: ${hub.volume} against ${(Math.PI * R * R - area) * T}`);
  assert.ok(!st.tool || st.tool.model?.made, "the box stays open on what is made");
});

test("Mesh on a keyed hole makes the shaft that fits it, from scratch: the same key, 0.1 narrower, through the hub", () => {
  const base = cylinder(20, 15);
  let st = select(state(base), bodies({ session: base })[0]!.ref);
  st = reduce(st, { type: "runAction", id: "model:keyhole" }, env);
  st = build(st);
  st = select({ ...st, tool: null }, bodies(st)[0]!.ref);
  st = reduce(st, { type: "runAction", id: "keyway:mesh" }, env);
  assert.equal(st.tool?.model?.kind, "keyshaft", st.session.message ?? "");
  const g = modelTarget(scene(st.session), st.tool!)!;
  assert.equal(g.problem, null, g.problem ?? "");
  assert.equal(g.nums.bore, 10); assert.equal(g.nums.key, 3); assert.ok(g.nums.len! >= 30 && g.nums.off! < 0, "it reaches out of the hub each side");
  st = build(st);
  assert.equal(bodies(st).length, 2, `the hub and the shaft: ${st.session.message}`);
  const shaft = bodies(st).find((b) => b.volume < 3000)!;
  assert.ok(shaft.volume > 0.9 * Math.PI * 4.95 * 4.95 * g.nums.len! - 400 && shaft.volume < Math.PI * 25 * g.nums.len!, `a shaft of 9.9 with a keyway: ${shaft.volume}`);
});

test("Mesh then a click on round geometry cuts the matching keyway into it: a splined shaft's hub into a body, a hole's key into a round shaft", () => {
  // the shaft's meshing, converted by a click on a plain disc: the spline hole is cut into the disc
  const shaft = splinedShaft(), rec = keywayOf(scene(shaft.session), bodies(shaft)[0]!.ref as never)!;
  const hubTool = meshTool(rec);
  assert.equal(hubTool.model!.kind, "keyhub");
  const disc = cylinder(20, 15), db = bodies({ session: disc })[0]!;
  const fill = cutFillOf(scene(disc), db.ref as never);
  assert.ok(typeof fill !== "string", String(fill));
  if (typeof fill === "string") return;
  const conv = meshConvert(hubTool, rec, fill)!;
  assert.equal(conv.model!.kind, "keyhole");
  let st: AppState = { ...state(disc), tool: conv };
  const g = modelTarget(scene(st.session), st.tool!)!;
  assert.equal(g.problem, null, g.problem ?? "");
  assert.equal(g.nums.kind, 2); assert.equal(g.nums.size, 23);
  const before = db.volume;
  st = build(st);
  assert.equal(bodies(st).length, 1, st.session.message ?? "");
  assert.ok(bodies(st)[0]!.volume < before - 5000, `the spline hole is cut: ${bodies(st)[0]!.volume} of ${before}`);
  // a keyed hole's meshing, converted by a click on a plain round shaft: the key's slot is cut into the shaft
  let h = select(state(cylinder(20, 15)), bodies({ session: cylinder(20, 15) })[0]!.ref);
  h = reduce(h, { type: "runAction", id: "model:keyhole" }, env); h = build(h);
  const holeRec = keywayOf(scene(h.session), bodies(h)[0]!.ref as never)!;
  const rod = cylinder(5, 30), rb = bodies({ session: rod })[0]!, rf = cutFillOf(scene(rod), rb.ref as never);
  assert.ok(typeof rf !== "string");
  if (typeof rf === "string") return;
  const fit = meshConvert(meshTool(holeRec), holeRec, rf)!;
  assert.equal(fit.model!.kind, "keyfit");
  let r: AppState = { ...state(rod), tool: fit };
  const gr = modelTarget(scene(r.session), r.tool!)!;
  assert.equal(gr.problem, null, gr.problem ?? "");
  assert.equal(gr.nums.bore, 10, "the shaft's diameter is the body's");
  r = build(r);
  assert.equal(bodies(r).length, 1, r.session.message ?? "");
  assert.ok(bodies(r)[0]!.volume < rb.volume - 30 && bodies(r)[0]!.volume > rb.volume - 400, `the keyway is cut into the rod: ${bodies(r)[0]!.volume} of ${rb.volume}`);
});

test("without a keyed hole or shaft selected Mesh says so, and the menu item is dimmed", () => {
  let st = state(cylinder(20, 15));
  st = select(st, bodies({ session: cylinder(20, 15) })[0]!.ref);
  const out = reduce(st, { type: "runAction", id: "keyway:mesh" }, env);
  assert.match(out.session.message ?? "", /keyway maker/);
  assert.equal(out.tool, null);
});

test("a keyed hole is remembered in the command that made it (one undo takes both), the chip offers Mesh on a selected keyed body, and Mesh with a round shaft selected too cuts the keyway into it at once (`in_1287`)", async () => {
  const base = cylinder(20, 15);
  let st = select(state(base), bodies({ session: base })[0]!.ref);
  st = reduce(st, { type: "runAction", id: "model:keyhole" }, env);
  st = build(st);
  const n = st.session.history.commands.length;
  const undone = reduce(st, { type: "undo" }, env);
  assert.ok(!(scene(undone.session).keyways ?? []).length, "one undo takes the cut and its record");
  assert.ok(undone.session.history.commands.length === n && undone.session.history.cursor === n - 1, "one command was undone");
  // the chip of a keyed body
  const { frameOf } = await import("../src/interaction/frame.ts");
  const keyed = select({ ...st, tool: null }, bodies(st)[0]!.ref);
  const chip = frameOf(keyed, { w: 800, h: 600 }).gearChip;
  assert.ok(chip && chip.items.some((i) => i.id === "keyway:mesh"), "the icon offers Mesh");
  // a rod next to the keyed body: both selected, Mesh cuts the key into the rod
  let both = st.session;
  const c = drawCircle(scene(both), XY, [100, 0, 0], 5); both = run(both, c.command);
  both = run(both, { type: "addStep", step: { id: nextId(scene(both), "s"), type: "extrude", parts: [c.circle], params: { depth: 30, mode: "new", ...figureParams([{ outer: [c.circle], holes: [] }]) } } } as Command);
  const [hub, rod] = [bodies({ session: both }).find((b) => b.id === scene(both).keyways![0]!.host)!, bodies({ session: both }).find((b) => b.id !== scene(both).keyways![0]!.host)!];
  let m: AppState = { ...state(both), session: { ...both, click: { ...both.click, selection: [hub.ref as never, rod.ref as never] } } };
  m = reduce(m, { type: "runAction", id: "keyway:mesh" }, env);
  assert.equal(m.tool?.model?.kind, "keyfit", m.session.message ?? "");
  const before = rod.volume;
  m = build(m);
  assert.ok(bodies(m).find((b) => b.id === rod.id)!.volume < before - 20, "the keyway is cut into the rod");
});
