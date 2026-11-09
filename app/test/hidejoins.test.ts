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
