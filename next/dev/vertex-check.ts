// A dev check (not a test, `in_1444`) for vertices as ids (E6, `in_1518`): a vertex is named by the faces that meet there, found again after an edit, held as a sketch anchor.
//   node --experimental-strip-types dev/vertex-check.ts
import { initKernel } from "../src/engine/kernel.ts";
import { Engine } from "../src/engine/engine.ts";
import { Body } from "../src/engine/lineage.ts";
import { idKey, mint, vertexRef, vertexKey } from "../src/engine/id.ts";
import { rectangle } from "../src/engine/sketch.ts";
import type { Sketch, Step } from "../src/engine/steps.ts";
await initKernel();
import { check, fail, failureCount } from "./lib.ts";
const st = (e: Engine, id: string) => e.result(id).status as { kind: string; why?: string };
const body = (e: Engine, id: string) => e.result(id).value as Body;
const box = (w: number): Step[] => [{ id: "s", kind: "sketchPolygon", params: { points: [[0, 0], [w, 0], [w, 20], [0, 20]] }, inputs: [] }, { id: "A", kind: "extrude", params: { d: 10 }, inputs: ["s"] }];
const side = (i: number) => mint("A", "side", mint("s", "line", i)), top = mint("A", "end");

console.log("1. the vertices of a box, by the faces that meet at each");
{
  const e = new Engine(box(30)); e.build(); const b = body(e, "A"), vs = b.vertices();
  check("eight vertices, each on three faces, each with a name", vs.length === 8 && vs.every((v) => v.faces.length === 3 && v.ref), `${vs.length}`);
  check("all eight names are different", new Set(vs.map((v) => vertexKey(v.ref!))).size === 8);
  const corner = vertexRef([top, side(0), side(1)]), found = b.findVertices(corner);
  check("the top corner where the top, the first and the second side meet is found, and it is at (30, 0, 10)", found.length === 1 && found[0]!.p.map((x) => Math.round(x * 1e6) / 1e6).join() === "30,0,10", found[0]?.p.join());
  check("the name is the same whichever face is named first", vertexKey(vertexRef([side(1), top, side(0)])) === vertexKey(corner));
  e.edit("s", { points: [[0, 0], [50, 0], [50, 20], [0, 20]] }); const moved = body(e, "A").findVertices(corner);
  check("after the box is made wider the same name finds the same corner, moved to (50, 0, 10)", moved.length === 1 && Math.abs(moved[0]!.p[0] - 50) < 1e-9, moved[0]?.p.join());
  let said = ""; try { body(e, "A").findVertices(vertexRef([top, side(0), mint("A", "side", "nope")])); } catch (x) { said = (x as Error).message; } check("a vertex that is not there is lost in words (the step that names it is orphaned)", /vertex where/.test(said), said);
  e.release();
}
console.log("2. a cylinder has seam vertices with no name; a round adds vertices that have");
{
  const e = new Engine([{ id: "c", kind: "sketchCircle", params: { r: 5 }, inputs: [] }, { id: "A", kind: "extrude", params: { d: 8 }, inputs: ["c"] }]); e.build(); const vs = body(e, "A").vertices();
  check("a cylinder's two seam vertices are on two faces: unnamed, and said so by the count", vs.length === 2 && vs.every((v) => v.ref === null), `${vs.length} vertices, ${vs.filter((v) => v.ref).length} named`); e.release();
}
console.log("3. a vertex as a sketch anchor: held where it is, followed when the body changes");
{
  const corner = vertexRef([top, side(0), side(1)]);
  const sk: Step = { id: "k", kind: "sketch", params: { ...rectangle(0, 0, 4, 4, { fixCorner: false }), plane: "XY", offset: 10, anchors: [{ id: "pin", vertex: corner }], constraints: [...rectangle(0, 0, 4, 4, { fixCorner: false }).constraints!, { id: "at", kind: "coincident", parts: ["A", "pin"] }] }, inputs: ["A"] };
  const e = new Engine([...box(30), sk]); e.build(); const s = e.result("k").value as Sketch, a = s.lines.find((l) => l.id.of[0] === "bottom")!;
  check("the rectangle's corner A is at the vertex (30, 0)", st(e, "k").kind === "ok" && Math.abs(a.a[0] - 30) < 1e-9 && Math.abs(a.a[1]) < 1e-9, `${st(e, "k").kind} ${st(e, "k").why ?? a.a.join()}`);
  e.edit("s", { points: [[0, 0], [50, 0], [50, 20], [0, 20]] }); const m = (e.result("k").value as Sketch).lines.find((l) => l.id.of[0] === "bottom")!; check("the body made wider: the corner follows to (50, 0)", Math.abs(m.a[0] - 50) < 1e-9, m.a.join());
  const gone = new Engine([...box(30), { ...sk, params: { ...sk.params, anchors: [{ id: "pin", vertex: vertexRef([top, side(0), mint("A", "side", "nope")]) }] } }]); gone.build();
  check("an anchor on a vertex that is gone orphans the sketch, in words", st(gone, "k").kind === "orphaned" && /vertex/.test(st(gone, "k").why ?? ""), st(gone, "k").why); gone.release(); e.release();
}
console.log(failureCount() ? `\n${failureCount()} failure(s)` : "\nno failure");
process.exit(failureCount() ? 1 : 0);
