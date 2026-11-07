// The hollow body that was turned several times (`in_207`): its fillets can be pulled, and a side that cannot move is refused with the constraints shown, not filled in with a prism.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession, scene } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { faceEdit, arcRadiusCommand } from "../src/interaction/faceedit.ts";
import { consumed } from "../src/operation/ownership.ts";
import { sketchOfEdge } from "../src/operation/edgesource.ts";
import { actionsFor } from "../src/interaction/actions.ts";
import { run } from "../src/interaction/session.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import { homeCamera, projector } from "../src/interaction/camera.ts";
import { pickOpts } from "../src/interaction/control/state.ts";
import { candidatesAt } from "../src/interaction/picking.ts";
import { snapOnPlane } from "../src/interaction/tools.ts";
import { annotationsFor } from "../src/interaction/annotations.ts";
import { frameOf } from "../src/interaction/frame.ts";
import { faceEdges } from "../src/interaction/offsetbody.ts";
import { startOp, valueOf } from "../src/interaction/operations.ts";
import { runOp } from "../src/interaction/runop.ts";
import type { Part } from "../src/operation/part.ts";

await kernel.init();
const open = () => (openSession(kernel, readFileSync(new URL("./fixtures/hollow-rotated.cad.json", import.meta.url), "utf8")) as unknown as { value: Session }).value;

test("the fillets of a body that has been turned still find their step (the face is measured where the step made it)", () => {
  const s = open();
  const sc = scene(s);
  const fillets = (Object.values(sc.parts) as Part[]).filter((p) => p.kind === "plane" && p.origin === "body" && p.rounded === "TORUS");
  assert.ok(fillets.length >= 3);
  for (const f of fillets) assert.equal(faceEdit(sc, f.ref)?.kind, "edgeSize", f.ref);
});

test("a side next to arcs: never a prism in its place (`in_208`); with no constraint holding it the sketch follows (the arcs' ends go with it, `in_229`), else it is refused and the constraints flash", () => {
  const s = open();
  const sc = scene(s);
  const outer = (Object.values(sc.parts) as Part[]).find((p) => p.kind === "plane" && p.origin === "body" && faceEdit(sc, p.ref)?.kind === "side" && (faceEdit(sc, p.ref) as { corners: string[] }).corners.some((c) => c.startsWith("d/e_013")))!;
  const st = startOp(sc, [outer.ref], "pushpull") as { ok: true; op: Parameters<typeof valueOf>[0] };
  const r = runOp(s, { ...st.op, value: 2 } as typeof st.op)!;
  assert.equal(scene(r.session).steps.length, sc.steps.length, "no prism step was added");
  if (r.session.message) { assert.ok(/cannot move/.test(r.session.message), String(r.session.message)); assert.ok((r.session.conflict?.culprits.length ?? 0) > 0, "the constraints are shown"); }
});

test("a selected curved face of the body is outlined by its own edges, a few, not by the sides of its triangles (`in_208`)", () => {
  const s = open();
  const sc = scene(s);
  const wall = (Object.values(sc.parts) as Part[]).find((p) => p.kind === "plane" && p.origin === "body" && p.rounded === "CYLINDRE" && (p.mesh?.length ?? 0) > 300)!;
  const edges = faceEdges(sc, wall as Extract<Part, { kind: "plane" }>);
  assert.ok(edges.length >= 3 && edges.length <= 12, `${edges.length} edges`);
});

test("the round walls of a turned body find their circle and can be pulled (the kernel says where the cylinder's axis points, `in_209`)", () => {
  const s = open();
  const sc = scene(s);
  const walls = (Object.values(sc.parts) as Part[]).filter((p) => p.kind === "plane" && p.origin === "body" && p.rounded === "CYLINDRE" && (p as { round?: unknown }).round);
  assert.ok(walls.length >= 4, `${walls.length} cylinders with an axis`);
  const edits = walls.map((w) => faceEdit(sc, w.ref)?.kind);
  assert.ok(edits.filter((k) => k === "radius").length >= 4, edits.join());
  const w = walls.find((x) => { const e = faceEdit(sc, x.ref); return e?.kind === "radius" && e.convex; })!;
  const st = startOp(sc, [w.ref], "pushpull") as unknown as { ok: boolean; op: Parameters<typeof valueOf>[0] };
  assert.ok(st.ok);
  const r = runOp(s, { ...st.op, value: 1 } as typeof st.op)!;
  assert.ok(!r.session.message || !/cannot/.test(r.session.message), String(r.session.message));
  assert.notEqual(Math.round(r.session.outcome.kernel!.volume!), Math.round(s.outcome.kernel!.volume!));
});

test("an edge of the body that lies where a sketch part was shows its radius and the constraints that part carries (`in_207`, `in_209`)", () => {
  const s = open();
  const sc = scene(s);
  const arcs = (Object.values(sc.parts) as Part[]).filter((p) => p.kind === "line" && p.origin === "body" && (p.mid || p.circle));
  const found = arcs.map((e) => ({ e, src: sketchOfEdge(sc, e.ref) })).filter((x) => x.src);
  assert.ok(found.length >= 4, `${found.length} curved edges with a sketch behind them`);
  const outer = found.find((x) => x.src!.ref === "d/e_015.s0")!;
  const notes = annotationsFor(sc, [outer.e.ref], null);
  assert.ok(notes.some((a) => a.symbol === "R" || a.symbol === "Ø" || a.kind === "radius"), notes.map((a) => a.kind).join());
  assert.ok(notes.some((a) => a.relationId === "r_016" || a.relationId === "r_017"), "the points on lines it carries");
  const straight = (Object.values(sc.parts) as Part[]).filter((p) => p.kind === "line" && p.origin === "body" && !p.mid && !p.circle && sketchOfEdge(sc, p.ref));
  assert.ok(straight.length >= 2, `${straight.length} straight edges with a sketch behind them`);
});

test("the sketch behind a body edge stays a regular sketch (`in_210`): its radius can be set through the edge, a size the steps cannot take is refused and the holding constraints flash, and a sketch tool starts on its plane", () => {
  const s = open();
  const sc = scene(s);
  const edge = (src: string) => (Object.values(sc.parts) as Part[]).find((p) => p.kind === "line" && p.origin === "body" && p.mid && sketchOfEdge(sc, p.ref)?.ref === src)!;
  const outer = edge("d/e_015.s0");
  const radius = actionsFor(sc, [outer.ref]).find((a) => a.id === "radius")!;
  assert.ok(radius.enabled, "the radius of the sketch's arc can be set from the body's edge");
  const bigger = run(s, radius.run(radius.measure()! + 1), { watchAll: true });
  assert.ok(!bigger.message, String(bigger.message));
  assert.ok((bigger.outcome.kernel?.volume ?? 0) > (s.outcome.kernel?.volume ?? 0), "the body grew");
  const smaller = run(s, radius.run(radius.measure()! - 1), { watchAll: true });
  assert.ok(smaller.message, "the lines tangent to the arc cannot follow a smaller radius: refused");
  assert.deepEqual(smaller.conflict?.culprits.sort(), ["r_016", "r_017"], "the constraints that hold the arc flash");
  assert.equal(scene(smaller).parts["d/e_015.s0"]?.kind, "line");
  // a sketch tool, with that edge selected, starts on the sketch's own plane
  const st = { ...createState({ ...s, click: { ...s.click, selection: [outer.ref] as never } }), cam: homeCamera() };
  const t = reduce(st, { type: "begin", name: "line" }, { w: 800, h: 600, now: 0 });
  const plane = (scene(s).parts["d/e_015.s0"] as { plane: string }).plane;
  assert.equal(t.tool?.plane, plane);
  // the hidden sketch of that plane is shown and can be picked and snapped to while the tool is on (`in_211`), and hidden again when it is put away
  assert.equal(t.session.reveal, plane);
  const shown = scene(t.session);
  assert.ok(!consumed(shown).has("d/e_015.s0" as never) && !consumed(shown).has("d/e_015.p0" as never), "the arc and its ends are not hidden");
  assert.ok(consumed(scene(s)).has("d/e_015.s0" as never), "but still hidden otherwise");
  // snapping: near the end of the hidden arc, the pointer takes its place
  const pl = shown.parts[plane as never] as never;
  const end = (shown.parts["d/e_015.p0" as never] as unknown as { at: [number, number, number] }).at;
  const pj = projector(t.cam, 800, 600);
  const q = pj.project(end);
  const snapped = q ? snapOnPlane(shown, pj.view(q[0] + 2, q[1] + 1), pl) : null;
  assert.ok(snapped && Math.hypot(snapped[0] - end[0], snapped[1] - end[1], snapped[2] - end[2]) < 1e-6, `snapped to ${JSON.stringify(snapped)}`);
  const centre = "d/e_001.c" as never;
  assert.ok(!consumed(shown).has(centre), "the centre of the arc can be picked");
});

test("an arc edge of the body offers its radius as the number to type over (not the chord's length)", () => {
  const s = open();
  const sc = scene(s);
  const e = (Object.values(sc.parts) as Part[]).find((p) => p.kind === "line" && p.origin === "body" && p.mid && sketchOfEdge(sc, p.ref)?.ref === "d/e_015.s0")!;
  const m = annotationsFor(sc, [e.ref], null).find((a) => a.id === "measure");
  assert.equal(m?.kind, "radius");
  assert.equal(m?.editable, true);
});

test("the middle point drawn on a selected curved edge of the body can be picked: it is the sketch's middle point (`in_214`)", () => {
  const s = open();
  const sc = scene(s);
  const e = (Object.values(sc.parts) as Part[]).find((p) => p.kind === "line" && p.origin === "body" && p.mid && sketchOfEdge(sc, p.ref)?.ref === "d/e_015.s0")!;
  const st = { ...createState({ ...s, click: { ...s.click, selection: [e.ref] as never } }), cam: homeCamera() };
  const src = sketchOfEdge(sc, e.ref)!;
  const pj = projector(st.cam, 800, 600);
  const q = pj.project(src.centre!);
  const opts = pickOpts(st);
  assert.equal(opts.centres?.length, 1);
  const found = candidatesAt(sc, pj.view(q[0] + 3, q[1] - 2), opts);
  assert.equal(found[0]?.ref, src.centreRef, "the middle point is under the pointer");
  assert.equal(candidatesAt(sc, pj.view(q[0] + 3, q[1] - 2), { ...opts, centres: [] }).some((c) => c.ref === src.centreRef), false, "and only while its edge is selected");
});

test("the thin-wall body (`in_229`): a side of a trimmed sketch can be pulled out (the arcs' ends sit on the corners and go with them); a size that breaks a step is not shown as a collapsed body, it says why, and the first undo puts the open operation away instead of undoing the step before it", () => {
  const r = openSession(kernel, readFileSync(new URL("./fixtures/thin-wall.cad.json", import.meta.url), "utf8")) as unknown as { value: Session };
  const s = r.value;
  const sc = scene(s);
  const side = "b/body/f@0.5264,-0.838,0.1437,4.5712" as never;
  const begin = () => reduce({ ...createState({ ...s, click: { ...s.click, selection: [side] as never } }), cam: homeCamera() }, { type: "begin", name: "pushpull" }, { w: 800, h: 600, now: 0 });
  // out: works
  let st = begin();
  st = { ...st, op: { ...st.op!, value: 3 } };
  const out = reduce(st, { type: "typed", key: "Enter", shift: false }, { w: 800, h: 600, now: 0 });
  assert.equal(out.session.message, null);
  assert.ok((out.session.outcome.kernel!.volume ?? 0) > (s.outcome.kernel!.volume ?? 0) + 100, "the body grew");
  assert.equal(scene(out.session).steps.length, sc.steps.length, "no step added");
  // in too far: the pending size is not drawn as a broken body
  st = begin();
  st = { ...st, op: { ...st.op!, value: -6 } };
  const f = frameOf(st, { w: 800, h: 600 });
  assert.equal(f.mesh, s.outcome.kernel!.mesh, "the body as it was, not a collapsed one");
  assert.ok(/cannot be made/.test(f.message), f.message);
  // the first undo puts the open operation away; the steps stay
  const undone = reduce(st, { type: "undo" } as never, { w: 800, h: 600, now: 0 });
  assert.equal(undone.op, null);
  assert.equal(scene(undone.session).steps.length, sc.steps.length, "no step was undone");
});

test("an arc's radius changed while lines are tangent to it: the lines turn to stay tangent and the other arc changes size, as when a tangent line is moved (`in_229`)", () => {
  const r = openSession(kernel, readFileSync(new URL("./fixtures/tangent-trimmed.cad.json", import.meta.url), "utf8")) as unknown as { value: Session };
  let s = r.value;
  // the trimmed sketch lost its tangents (trim used to drop them): put them back as they were drawn
  for (const [i, parts] of [["r_t1", ["d/e_012.s0", "d/e_013.s0"]], ["r_t2", ["d/e_012.s0", "d/e_016.s0"]], ["r_t3", ["d/e_011.s0", "d/e_013.s0"]], ["r_t4", ["d/e_011.s0", "d/e_016.s0"]]] as const) s = run(s, { type: "addRelation", relation: { id: i, kind: "tangent", parts: [...parts] as never } });
  const sc = scene(s);
  const dist = (sc2: ReturnType<typeof scene>, line: string, arc: string): [number, number] => {
    const L = sc2.parts[line] as { a: string; b: string }; const A = sc2.parts[arc] as { a: string; center: string };
    const at = (q: string) => (sc2.parts[q] as unknown as { at: [number, number, number] }).at;
    const [p, q, c, e] = [at(L.a), at(L.b), at(A.center), at(A.a)];
    const d = [q[0] - p[0], q[1] - p[1]]; const len = Math.hypot(d[0]!, d[1]!);
    return [Math.abs((c[0] - p[0]) * d[1]! - (c[1] - p[1]) * d[0]!) / len, Math.hypot(e[0] - c[0], e[1] - c[1])];
  };
  const before = dist(sc, "d/e_012.s0", "d/e_013.s0");
  assert.ok(Math.abs(before[0] - before[1]) < 0.05, `tangent to start with (${before})`);
  const cmd = arcRadiusCommand(sc, "d/e_013.s0" as never, before[1] + 1.5)!;
  assert.ok(cmd, "a command");
  const t = run(s, cmd);
  const sc2 = scene(t);
  for (const [line, arc] of [["d/e_012.s0", "d/e_013.s0"], ["d/e_012.s0", "d/e_016.s0"], ["d/e_011.s0", "d/e_013.s0"], ["d/e_011.s0", "d/e_016.s0"]] as const) { const d = dist(sc2, line, arc); assert.ok(Math.abs(d[0] - d[1]) < 0.05, `${line} stays tangent to ${arc} (${d})`); }
  assert.ok(Math.abs(dist(sc2, "d/e_012.s0", "d/e_013.s0")[1] - (before[1] + 1.5)) < 0.05, "the arc has the radius asked for");
});
