// Constraints that only join the outline of a body's sketch are not shown (`in_238`, `in_239`, `dec_hide_structural_constraints`).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession, scene, run } from "../src/interaction/session.ts";
import { structuralRelations } from "../src/operation/ownership.ts";
import { annotationsFor } from "../src/interaction/annotations.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import { frameOf } from "../src/interaction/frame.ts";
import { appRows } from "../src/interaction/appmenu.ts";

await kernel.init();
const open = () => (openSession(kernel, readFileSync(new URL("./fixtures/three-circles.cad.json", import.meta.url), "utf8")) as unknown as { value: import("../src/interaction/session.ts").Session }).value;

test("in a body made from three circles and their tangent lines, the 15 joins are hidden and the 6 tangents stay", () => {
  const s = open();
  const sc = scene(s);
  const hidden = structuralRelations(sc);
  const kinds = (ids: Iterable<string>) => { const m: Record<string, number> = {}; for (const id of ids) { const k = sc.relations.find((r) => r.id === id)!.kind; m[k] = (m[k] ?? 0) + 1; } return m; };
  assert.deepEqual(kinds(hidden), { arcEnds: 3, onLine: 6, onCircle: 6 });
  const shown = sc.relations.filter((r) => !hidden.has(r.id));
  assert.deepEqual(shown.map((r) => r.kind), ["tangent", "tangent", "tangent", "tangent", "tangent", "tangent"]);
  // selecting a straight side of the sketch: only its tangents are offered
  const line = Object.values(sc.parts).find((p) => p.kind === "line" && p.origin === "drawn" && p.ref === "d/e_025.s0")!;
  const notes = annotationsFor(sc, [line.ref], null);
  assert.ok(notes.some((a) => a.kind === "tangent") && notes.every((a) => a.kind === "tangent" || a.kind === "length"), `${notes.map((a) => a.kind).join()}: its tangents and its length, no joins`);
  assert.ok(annotationsFor(sc, [line.ref], null, true).length > notes.length, "all of them when asked for");
});

test("a relation the human puts on the sketch after the extrusion shows, and so does one that ties it to something outside; with no extrusion everything shows", () => {
  const sc0 = scene(open());
  // (the scene is changed directly: only what is hidden is asked)
  const extra = [
    { id: "r_900", kind: "coincident", parts: ["d/e_025.p0", "d/e_025.p0"] },
    { id: "r_901", kind: "onLine", parts: ["d/e_025.p0", "w/X"] },
    { id: "r_020", kind: "coincident", parts: ["d/e_025.p0", "d/e_025.p0"] },
  ] as unknown as typeof sc0.relations;
  const sc = { ...sc0, relations: [...sc0.relations, ...extra] };
  const hidden = structuralRelations(sc);
  assert.ok(!hidden.has("r_900"), "put there on purpose after the extrusion");
  assert.ok(!hidden.has("r_901"), "ties it to a world axis");
  assert.ok(hidden.has("r_020"), "made while the outline was drawn (before the extrusion's number)");
  assert.equal(structuralRelations({ ...sc0, steps: [] }).size, 0, "before the step: everything shows");
});

test("the switch in the ⋯ list shows all constraints, and the History sketch button does too", () => {
  const s = open();
  let st = createState(s);
  const rows = appRows("auto", "", undefined, st.showAllConstraints);
  assert.match(rows.find((r) => r.id === "constraints")!.label, /only the ones/);
  st = reduce(st, { type: "runAction", id: "constraints" }, { w: 800, h: 600, now: 0 });
  assert.equal(st.showAllConstraints, true);
  assert.match(appRows("auto", "", undefined, st.showAllConstraints).find((r) => r.id === "constraints")!.label, /all shown/);
  const line = "d/e_025.s0" as never;
  const withSel = (x: typeof st) => ({ ...x, session: { ...x.session, click: { ...x.session.click, selection: [line] } } });
  const few = frameOf(withSel({ ...st, showAllConstraints: false }), { w: 800, h: 600 }).annotations.length;
  const many = frameOf(withSel(st), { w: 800, h: 600 }).annotations.length;
  assert.ok(many > few, `${few} -> ${many}`);
});

// The drop-and-move test (`in_241`): drop a tangent, move one of the two a little, and see whether the outline stays joined at that touch. A tangent that is the only join lets the line come off.
import type { Scene } from "../src/operation/scene.ts";
import type { Part } from "../src/operation/part.ts";
import type { Ref } from "../src/shared/ref.ts";
import { pointOf } from "../src/operation/part.ts";

const shape = (sc: Scene, tangent: { parts: Ref[] }) => {
  const [p, q] = tangent.parts.map((r) => sc.parts[r]!) as [Part, Part];
  const isArc = (x: Part) => x.kind === "circle" || (x.kind === "line" && !!x.center);
  const [line, curve] = isArc(p) ? [q, p] : [p, q];
  assert.ok(line.kind === "line" && !line.center, "a straight side");
  const centreRef = curve.kind === "circle" ? curve.center : curve.kind === "line" ? curve.center! : (null as never);
  return { line, curve, centreRef };
};
/** How far the end of the straight side that touches the curve is from it: 0 while it still touches there. `end` says which end (the one that touched before). */
const gapOf = (sc: Scene, tangent: { parts: Ref[] }, end: Ref): number => {
  const { curve, centreRef } = shape(sc, tangent);
  const get = (r: Ref) => sc.parts[r];
  const c = pointOf(get, centreRef)!;
  const dist = (e: Ref) => { const q = pointOf(get, e)!; return Math.hypot(q[0] - c[0], q[1] - c[1], q[2] - c[2]); };
  const r = curve.kind === "circle" ? curve.radius : dist((curve as { a: Ref }).a);
  return Math.abs(dist(end) - r);
};
/** The end of the straight side that lies on the curve (the nearer one). */
const touching = (sc: Scene, tangent: { parts: Ref[] }): Ref => {
  const { line } = shape(sc, tangent);
  const ends = [(line as { a: Ref }).a, (line as { b: Ref }).b];
  return ends.reduce((x, y) => (gapOf(sc, tangent, x) <= gapOf(sc, tangent, y) ? x : y));
};
/** Drop the tangent, then drag the end of the line that touches a little way off; the scene afterwards. */
const dropAndMove = (s: ReturnType<typeof open>, id: string) => {
  const sc = scene(s);
  const tangent = sc.relations.find((r) => r.id === id)!;
  const end = touching(sc, tangent);
  const at = pointOf((r) => sc.parts[r], end)!;
  const t = run(s, { type: "batch", commands: [{ type: "removeRelation", id }, { type: "movePart", ref: end, to: [at[0] + 1.5, at[1] + 1, at[2]] }] });
  return { t, tangent, end };
};

test("drop and move: in the body's sketch every tangent leaves the outline joined (its touch is held by corners on the curves), so none is hidden", () => {
  const s = open();
  const tangents = scene(s).relations.filter((r) => r.kind === "tangent");
  assert.equal(tangents.length, 6);
  for (const tg of tangents) {
    const { t, tangent, end } = dropAndMove(s, tg.id);
    assert.equal(t.message, null, `${tg.id} moves`);
    assert.ok(gapOf(scene(t), tangent, end) < 1e-6, `${tg.id}: still touching after the move (${gapOf(scene(t), tangent, end)})`);
  }
  assert.ok(!structuralRelations(scene(s)).has(tangents[0]!.id));
});

test("drop and move: where the corner joins of a line and its circle are taken away, the tangent is the only join, the line comes off when it is dropped, and it counts as structural", () => {
  const s = open();
  const sc = scene(s);
  const tg = sc.relations.find((r) => r.kind === "tangent")!;
  const { line, curve } = shape(sc, tg);
  const ends = new Set<Ref>([(line as { a: Ref }).a, (line as { b: Ref }).b]);
  // the joins between this pair: a corner of the line on the curve (the curve's own relation names the circle or the arc)
  const joins = sc.relations.filter((r) => (r.kind === "onCircle" || r.kind === "onLine") && r.parts.length === 2 && ((ends.has(r.parts[0]!) && r.parts[1] === curve.ref) || (r.parts[1] === line.ref && !ends.has(r.parts[0]!))));
  const bare = { ...sc, relations: sc.relations.filter((r) => !joins.includes(r)) };
  assert.ok(structuralRelations(bare).has(tg.id), `the tangent ${tg.id} is the only join (${joins.length} others taken away)`);
  assert.ok(!structuralRelations(sc).has(tg.id), "with its joins it is intent");
  // and the real thing: with those joins gone, dropping the tangent and moving the circle takes the line off it; with them, it stays on
  const bareSession = { ...s, history: { ...s.history, scene: bare } } as typeof s;
  const { t, tangent, end } = dropAndMove(bareSession, tg.id);
  assert.equal(t.message, null);
  assert.ok(gapOf(scene(t), tangent, end) > 0.1, `the line came off (${gapOf(scene(t), tangent, end)})`);
});
