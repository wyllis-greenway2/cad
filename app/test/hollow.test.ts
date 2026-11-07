// The hollow body that was turned several times (`in_207`): its fillets can be pulled, and a side that cannot move is refused with the constraints shown, not filled in with a prism.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession, scene } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { faceEdit } from "../src/interaction/faceedit.ts";
import { sketchOfEdge } from "../src/operation/edgesource.ts";
import { actionsFor } from "../src/interaction/actions.ts";
import { run } from "../src/interaction/session.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import { homeCamera } from "../src/interaction/camera.ts";
import { annotationsFor } from "../src/interaction/annotations.ts";
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

test("a side whose neighbours are tangent circles cannot move: nothing is added (`in_208`), the constraints holding the side flash", () => {
  const s = open();
  const sc = scene(s);
  const outer = (Object.values(sc.parts) as Part[]).find((p) => p.kind === "plane" && p.origin === "body" && faceEdit(sc, p.ref)?.kind === "side" && (faceEdit(sc, p.ref) as { corners: string[] }).corners.some((c) => c.startsWith("d/e_013")))!;
  const st = startOp(sc, [outer.ref], "pushpull") as { ok: true; op: Parameters<typeof valueOf>[0] };
  const r = runOp(s, { ...st.op, value: 2 } as typeof st.op)!;
  assert.equal(scene(r.session).steps.length, sc.steps.length, "no prism step was added");
  assert.ok(r.session.message?.includes("cannot move"), String(r.session.message));
  assert.ok((r.session.conflict?.culprits.length ?? 0) > 0, "the constraints are shown");
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
});

test("an arc edge of the body offers its radius as the number to type over (not the chord's length)", () => {
  const s = open();
  const sc = scene(s);
  const e = (Object.values(sc.parts) as Part[]).find((p) => p.kind === "line" && p.origin === "body" && p.mid && sketchOfEdge(sc, p.ref)?.ref === "d/e_015.s0")!;
  const m = annotationsFor(sc, [e.ref], null).find((a) => a.id === "measure");
  assert.equal(m?.kind, "radius");
  assert.equal(m?.editable, true);
});
