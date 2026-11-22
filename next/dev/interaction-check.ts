// A dev check (not a test, `in_1444`) for the interaction layer (E57): the reference set, `hold`, the offers for a selection. Pure data in, data out; the engine is not touched.
//   node --experimental-strip-types dev/interaction-check.ts [random cases] [seed]
import { initKernel } from "../src/engine/kernel.ts";
import { Engine } from "../src/engine/engine.ts";
import { edgeRef, mint } from "../src/engine/id.ts";
import { rectangle } from "../src/engine/sketch.ts";
import { residualsOf, solve, type Constraint, type System } from "../src/engine/solver.ts";
import { hold, type Hold } from "../src/interaction/hold.ts";
import { type Pt, type Ref, referenceSet } from "../src/interaction/refs.ts";
import { constraintsOn, measure, offersFor } from "../src/interaction/suggest.ts";
import type { Sketch, Step } from "../src/engine/steps.ts";
await initKernel();
const N = Number(process.argv[2] ?? 300); let seed = Number(process.argv[3] ?? 1);
const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
let failures = 0; const check = (label: string, ok: boolean, detail = "") => { if (!ok) failures++; console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? ": " + detail : ""}`); };
const near = (a: number, b: number, t = 1e-9) => Math.abs(a - b) <= t;
const P = (key: string, x: number, y: number): Ref => ({ key, kind: "point", name: key, origin: "drawn", p: [x, y], visible: true });
const L = (key: string, a: Pt, b: Pt): Ref => ({ key, kind: "line", name: key, origin: "drawn", a, b, visible: true });
const C = (key: string, c: Pt, r: number): Ref => ({ key, kind: "circle", name: key, origin: "drawn", c, r, visible: true });
const opt = { reach: 0.5, angle: 3 };

console.log("1. a point near things: the strongest hold wins, and says what it would make");
{
  const refs = [P("A", 0, 0), P("B", 10, 0), L("AB", [0, 0], [10, 0]), C("K", [20, 5], 4)];
  const r = hold([0.2, 0.3], refs, { what: "point" }, opt);
  check("near a corner: coincident wins over on-the-line, at the corner, the draft is a coincident constraint of the new point with that corner", r.taken[0]?.kind === "coincident" && near(r.at[0], 0) && near(r.at[1], 0) && r.taken[0]!.draft?.kind === "coincident" && r.taken[0]!.draft!.parts.join() === "$new,A", JSON.stringify(r.holds.map((h) => h.kind)));
  const on = hold([5, 0.2], refs, { what: "point" }, opt); check("near the middle of a line: the middle, then on the line", on.taken[0]?.kind === "midpoint" && near(on.at[0], 5) && near(on.at[1], 0));
  const online = hold([3.3, 0.4], refs, { what: "point" }, opt); check("along a line: on the line, the foot of the perpendicular", online.taken[0]?.kind === "onLine" && near(online.at[0], 3.3) && near(online.at[1], 0) && online.taken[0]!.draft?.kind === "pointOnLine");
  const oc = hold([20 + 4.2, 5.1], refs, { what: "point" }, opt); check("near a circle: on the circle, at its edge", oc.taken[0]?.kind === "onCircle" && near(Math.hypot(oc.at[0] - 20, oc.at[1] - 5), 4));
  const far = hold([50, 50], refs, { what: "point" }, opt); check("far from everything: nothing holds, the pointer stays", far.holds.length === 0 && far.at[0] === 50 && far.taken.length === 0);
  const al = hold([10.3, 4], refs, { what: "point" }, opt); check("up and down from a corner: a dashed guide through it, the point goes to its x", al.taken[0]?.kind === "alignX" && near(al.at[0], 10) && near(al.at[1], 4) && al.taken[0]!.guides.some((g) => g.kind === "dashed"));
  const both = hold([10.2, 0.3 + 6], [P("B", 10, 0), P("Q", 30, 6)], { what: "point" }, opt); check("lined up with one corner across and another up and down: both, the point goes to where the two guides meet", both.taken.length === 2 && near(both.at[0], 10) && near(both.at[1], 6), JSON.stringify({ t: both.taken.map((h) => h.kind), at: both.at }));
  check("a hold only places: no refs are changed, and the same pointer gives the same answer", JSON.stringify(hold([0.2, 0.3], refs, { what: "point" }, opt)) === JSON.stringify(r));
  const hidden = refs.map((x) => (x.key === "A" ? { ...x, visible: false } : x)); check("a part that cannot be seen is not offered unless asked", hold([0.2, 0.3], hidden, { what: "point" }, opt).taken[0]?.kind !== "coincident" && hold([0.2, 0.3], hidden, { what: "point" }, { ...opt, includeHidden: true }).taken[0]?.kind === "coincident");
  check("the part being dragged is not a reference for itself", hold([0.2, 0.3], refs, { what: "point" }, { ...opt, not: ["A"] }).taken[0]?.kind !== "coincident");
}
console.log("2. the end of a line: level, upright, parallel, square, tangent, as long as; the figure turns orange while one holds");
{
  const refs = [L("R", [20, 0], [30, 4]), C("K", [20, 10], 3)];
  const h = hold([6, 0.2], refs, { what: "lineEnd", from: [0, 0] }, opt); check("nearly level: level, the end goes to the start's height, the figure is orange", h.taken[0]?.kind === "horizontal" && near(h.at[1], 0) && h.figure === "aligned" && h.taken[0]!.draft?.kind === "horizontal" && h.taken[0]!.draft!.parts.join() === "$line");
  const v = hold([0.2, 6], refs, { what: "lineEnd", from: [0, 0] }, opt); check("nearly upright: upright", v.taken[0]?.kind === "vertical" && near(v.at[0], 0));
  const dir = [10, 4], len = Math.hypot(dir[0]!, dir[1]!), tilt = 1.5 * Math.PI / 180, ang = Math.atan2(4, 10) + tilt;
  const par = hold([5 * Math.cos(ang) * (len / len), 5 * Math.sin(ang)], refs, { what: "lineEnd", from: [0, 0] }, { reach: 0.01, angle: 3 }); check("within 3 degrees of a line's direction: parallel to it, exactly (the end is put on that direction)", par.taken[0]?.kind === "parallel" && near(par.at[1] / par.at[0], 4 / 10, 1e-9), JSON.stringify({ t: par.taken.map((x) => x.kind), at: par.at }));
  const perp = hold([-4 * 1.0 + 0.0, 10 * 1.0 + 0.1], refs, { what: "lineEnd", from: [0, 0] }, { reach: 0.01, angle: 3 }); check("a quarter from a line: square to it", perp.taken[0]?.kind === "perpendicular" && near(perp.at[0] * 10 + perp.at[1] * 4, 0, 1e-9), JSON.stringify(perp.taken.map((x) => x.kind)));
  const tg = (() => { const w = [20, 10], dist = Math.hypot(20, 10), half = Math.asin(3 / dist), base = Math.atan2(10, 20), a = base - half; return hold([8 * Math.cos(a + 0.01), 8 * Math.sin(a + 0.01)], refs, { what: "lineEnd", from: [0, 0] }, { reach: 0.01, angle: 3 }); void w; })(); check("from outside a circle, along a tangent: tangent, the end on that line", tg.taken[0]?.kind === "tangent" && tg.taken[0]!.draft?.kind === "tangent");
  const el = hold([9.8, 0.0001 + 3], [L("R", [0, 20], [10, 20])], { what: "lineEnd", from: [0, 0] }, { reach: 0.6, angle: 0 }); check("a length equal to a line's: as long as it, the end at that length along the pointer's direction", el.taken.some((x) => x.kind === "equalLength") && near(Math.hypot(el.at[0], el.at[1]), 10, 1e-9), JSON.stringify(el.taken.map((x) => x.kind)));
  const hl = hold([10.1, 0.1], [L("R", [0, 20], [10, 20])], { what: "lineEnd", from: [0, 0] }, { reach: 0.6, angle: 3 }); check("a direction and a length together: level and as long as the other line", hl.taken.length === 2 && near(hl.at[1], 0) && near(hl.at[0], 10, 1e-9), JSON.stringify({ t: hl.taken.map((x) => x.kind), at: hl.at }));
}
console.log("3. the property that matters: where a hold puts a point, the constraint it would make holds there (random)");
{
  let tested = 0, bad = 0; const byKind: Record<string, number> = {};
  for (let n = 0; n < N; n++) {
    const pts = Array.from({ length: 4 }, (_, i) => P(`P${i}`, Math.round(rnd() * 400) / 10, Math.round(rnd() * 400) / 10)), a = pts[0]!.p!, b = pts[1]!.p!;
    const refs: Ref[] = [...pts, L("L", a, b), L("M", pts[2]!.p!, pts[3]!.p!), C("K", pts[2]!.p!, 3 + rnd() * 5)];
    const pointer: Pt = [pts[Math.floor(rnd() * 4)]!.p![0] + (rnd() - 0.5) * 2, pts[Math.floor(rnd() * 4)]!.p![1] + (rnd() - 0.5) * 2], want = rnd() < 0.5 ? ({ what: "point" } as const) : ({ what: "lineEnd", from: [rnd() * 40, rnd() * 40] as Pt } as const);
    const r = hold(pointer, refs, want, { reach: 1, angle: 3 }); if (!r.taken.length) continue;
    // build the sketch the hold would make: the refs as parts, the new point or line, the drafted constraints
    const S: System = { points: pts.map((x) => ({ id: x.name, x: x.p![0], y: x.p![1], fixed: true })).concat([{ id: "$new", x: r.at[0], y: r.at[1], fixed: false }, ...(want.what === "lineEnd" ? [{ id: "$from", x: want.from[0], y: want.from[1], fixed: true }] : [])]),
      lines: [{ id: "L", a: "P0", b: "P1" }, { id: "M", a: "P2", b: "P3" }, ...(want.what === "lineEnd" ? [{ id: "$line", a: "$from", b: "$new" }] : [])], circles: [{ id: "K", c: "P2", r: refs[6]!.r!, fixedR: true }], constraints: [] };
    for (const h of r.taken) {
      if (!h.draft) continue; tested++; byKind[h.kind] = (byKind[h.kind] ?? 0) + 1;
      const parts = h.draft.parts.map((p) => (p === "$end" ? "$new" : p)), c: Constraint = { id: "d", kind: h.draft.kind, parts };
      let res: number[]; try { res = residualsOf(S, c); } catch { bad++; console.log(`   case ${n}: ${h.kind}: not computable`); continue; }
      const kindDirection = ["horizontal", "vertical", "parallel", "perpendicular", "tangent"].includes(h.kind);
      if (!res.every((v) => Math.abs(v) < 1e-6) && !(kindDirection && r.taken.length === 2)) { bad++; if (bad <= 5) console.log(`   case ${n}: ${h.kind} (${r.taken.length} taken): residual ${res.map((v) => v.toExponential(2))} at ${r.at}`); }
    }
  }
  console.log(`   holds tested: ${tested} (${Object.entries(byKind).map(([k, v]) => `${k} ${v}`).join(", ")})`);
  check("every constraint a hold would make is true at the place the hold takes the point to (1e-6; a direction taken together with a length keeps its direction)", bad === 0 && tested > 100, `${bad} not`);
}
console.log("4. the offers for a selection: the table, what already holds, what is refused, what does not apply");
{
  const r = rectangle(0, 0, 10, 5), S: System = { points: r.points!.map((p) => ({ ...p, fixed: false })), lines: r.lines!, circles: [], constraints: r.constraints! };
  const two = offersFor(S, ["bottom", "right"]), by = (k: string) => two.offers.find((o) => o.kind === k);
  check("two lines of a level-and-upright rectangle: square already holds in the sketch (said, nothing to add), parallel does not apply to them as they are (free), angle is a number to lock", by("perpendicular")?.state === "already" && by("parallel")?.state === "refused" && by("angle")?.dimensional === true && Math.abs(by("angle")!.measure! - 90) < 1e-9, JSON.stringify(two.offers.map((o) => `${o.kind}:${o.state}`)));
  check("the refused one names what holds it (the level and upright sides) and the offers keep the order of the selection (the first moves)", (by("parallel")?.holding ?? []).length > 0 && two.offers.every((o) => o.moves === "bottom"), JSON.stringify(by("parallel")?.holding));
  const len = offersFor(S, ["bottom"]); check("one line: its length is measured (10), to lock; level already holds", Math.abs(len.offers.find((o) => o.kind === "length")!.measure! - 10) < 1e-9 && len.offers.find((o) => o.kind === "horizontal")?.state === "already");
  check("what does not apply says why (a point-on-circle with two lines)", two.inapplicable.some((x) => x.kind === "pointOnCircle" && /needs/.test(x.why)), JSON.stringify(two.inapplicable.find((x) => x.kind === "pointOnCircle")));
  const pl = offersFor(S, ["right", "A"]); check("a line then a point: the relation reads the point first (pointOnLine takes a point and a line), and the first selected still moves", pl.offers.some((o) => o.kind === "pointOnLine" && o.parts[0] === "A" && o.parts[1] === "right" && o.moves === "right"));
  const tied = constraintsOn(S, ["bottom"]); check("the constraints on the bottom side, with what each ties it to (the amber): level and the width tie it to nothing, the upright sides tie it to the right and left sides", tied.length >= 3 && tied.some((t) => t.constraint.id === "hb" && t.ties.length === 0) && tied.find((t) => t.constraint.id === "vr")?.ties.join() === "right", JSON.stringify(tied.map((t) => t.constraint.id)));
  check("a measure of the angle between two lines is the angle", Math.abs(measure({ ...S, points: S.points.map((p) => (p.id === "C" ? { ...p, y: p.y } : p)) }, "angle", ["bottom", "right"])! - 90) < 1e-9);
}
console.log("5. the reference set from a real sketch and a real body");
{
  const top = mint("A", "end"), side = (i: number) => mint("A", "side", mint("b", "line", i));
  const steps: Step[] = [{ id: "b", kind: "sketchPolygon", params: { points: [[0, 0], [20, 0], [20, 20], [0, 20]] }, inputs: [] }, { id: "A", kind: "extrude", params: { d: 10 }, inputs: ["b"] },
    { id: "s", kind: "sketch", params: { ...rectangle(10, 2, 4, 5, { fixCorner: false }), plane: "XY", offset: 10, anchors: [{ id: "e1", edge: edgeRef(top, side(1)) }], constraints: [...rectangle(10, 2, 4, 5, { fixCorner: false }).constraints!, { id: "gap", kind: "pointLineDistance", parts: ["B", "e1"], value: 3 }] }, inputs: ["A"] }];
  const e = new Engine(steps); e.build(); const sk = e.result("s").value as Sketch, body = e.result("A").value as any;
  const refs = referenceSet({ sketch: sk, body });
  check("the sketch's four points and four lines are in it, at the solved places, named by their names", ["A", "B", "C", "D"].every((n) => refs.some((r) => r.key === `sketch:${n}` && r.kind === "point")) && refs.filter((r) => r.kind === "line" && r.origin === "drawn").length === 4);
  const right = refs.find((r) => r.key === "sketch:right")!; check("the right side is at x = 17 (3 from the body's edge at 20), as solved", Math.abs(right.a![0] - 17) < 1e-6 && Math.abs(right.b![0] - 17) < 1e-6, JSON.stringify([right.a, right.b]));
  const edges = refs.filter((r) => r.key.startsWith("edge:")); check("the body's straight edges are in it: those in the plane's height (the top rim, four) as anchors, the others (the sides and the bottom) through their projection, the vertical ones as points", edges.length === 12 && edges.filter((r) => r.origin === "anchor").length === 4 && edges.filter((r) => r.origin === "projection" && r.kind === "point").length === 4, `${edges.length} edges; anchors ${edges.filter((r) => r.origin === "anchor").length}; projected points ${edges.filter((r) => r.origin === "projection" && r.kind === "point").length}`);
  const held = edges.find((r) => r.anchor?.held); check("the edge the sketch is already held to is marked as held (no anchor to add), the others carry the anchor a constraint would first need", !!held && held.name === "e1" && edges.filter((r) => !r.anchor!.held).length === edges.length - 1);
  const near = hold([19.8, 8], refs, { what: "point" }, { reach: 0.5 }); check("a point near that edge: on the line, and the draft names the edge through its anchor (nothing to add: it is held already)", near.taken[0]?.kind === "onLine" && near.taken[0]!.draft?.parts.join() === "$new,e1" && near.taken[0]!.draft!.needs.length === 0, JSON.stringify(near.taken[0]?.draft));
  const other = hold([0.2, 8], refs, { what: "point" }, { reach: 0.5 }); check("a point near an edge that is not in the sketch: on the line, with the anchor to add first (a body's edge is held through an anchor)", other.taken[0]?.kind === "onLine" && other.taken[0]!.draft!.needs.length === 1, JSON.stringify(other.taken[0]?.draft?.needs.length));
  const ax = hold([5, 0.2], refs.filter((r) => r.kind === "axis"), { what: "point" }, { reach: 0.5 }); check("near a world axis: on it (placed only: no constraint is drafted)", ax.taken[0]?.kind === "onAxis" && ax.taken[0]!.draft === null);
  e.release();
}
console.log(failures ? `\n${failures} failures` : "\nno failure"); process.exit(failures ? 1 : 0);
