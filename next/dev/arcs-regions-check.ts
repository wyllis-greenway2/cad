// A dev check (not a test, `in_1444`) for arcs, several loops in one sketch, holes and regions (E62 to E64): sketches to solids with the volumes the shapes must have.
//   node --experimental-strip-types dev/arcs-regions-check.ts
import { initKernel } from "../src/engine/kernel.ts";
import * as K from "../src/engine/kernel.ts";
import { Engine } from "../src/engine/engine.ts";
import { Body } from "../src/engine/lineage.ts";
import { idKey, mint } from "../src/engine/id.ts";
import { rectangle } from "../src/engine/sketch.ts";
import { referenceSet } from "../src/interaction/refs.ts";
import type { Sketch, Step } from "../src/engine/steps.ts";
await initKernel();
import { check, fail, failureCount } from "./lib.ts";
const near = (a: number, b: number, t = 1e-4) => Math.abs(a - b) <= t * Math.max(1, Math.abs(b));
const build = (steps: Step[]) => { const e = new Engine(steps); e.build(); return e; };
const vol = (e: Engine, id: string) => K.volume((e.result(id).value as Body).solid);
const sk = (id: string, p: Record<string, any>): Step => ({ id, kind: "sketch", params: p, inputs: [] });
const ext = (id: string, from: string, d: number): Step => ({ id, kind: "extrude", params: { d }, inputs: [from] });
const st = (e: Engine, id: string) => e.result(id).status as { kind: string; why?: string };
const names = (e: Engine, id: string) => (e.result(id).value as Body).faces.map((f) => idKey(f.id));
const P = (id: string, x: number, y: number) => ({ id, x, y });

console.log("1. a D: a line and a half circle (an arc with its ends)");
{
  const e = build([sk("s", { points: [P("A", -2, 0), P("B", 2, 0), P("C", 0, 0)], lines: [{ id: "base", a: "A", b: "B" }], arcs: [{ id: "arc", c: "C", a: "B", b: "A" }], constraints: [{ id: "f", kind: "fixed", parts: ["A"], at: [-2, 0] }, { id: "r", kind: "radius", parts: ["arc"], value: 2 }, { id: "m", kind: "midpoint", parts: ["C", "base"] }, { id: "h", kind: "horizontal", parts: ["base"] }] }), ext("E", "s", 3)]);
  check("a half disc of radius 2, 3 deep: 6 pi", st(e, "E").kind === "ok" && near(vol(e, "E"), 6 * Math.PI), st(e, "E").why ?? String(vol(e, "E")));
  check("the arc's side is named from the arc", names(e, "E").includes(idKey(mint("E", "side", mint("s", "line", "arc")))), names(e, "E").join(" "));
  const s = e.result("s").value as Sketch; check("the sketch says it is fully constrained", s.solve?.freedom === 0, JSON.stringify(s.solve)); e.release();
}
console.log("2. a slot: two lines and two arcs, the arcs tangent to the lines, one radius");
{
  const slot = { points: [P("A", 0, -1), P("B", 6, -1), P("C", 6, 1), P("D", 0, 1), P("M", 6, 0), P("N", 0, 0)], lines: [{ id: "bot", a: "A", b: "B" }, { id: "top", a: "C", b: "D" }], arcs: [{ id: "right", c: "M", a: "B", b: "C" }, { id: "left", c: "N", a: "D", b: "A" }],
    constraints: [{ id: "h1", kind: "horizontal", parts: ["bot"] }, { id: "t1", kind: "tangent", parts: ["bot", "right"] }, { id: "t2", kind: "tangent", parts: ["top", "right"] }, { id: "t3", kind: "tangent", parts: ["bot", "left"] }, { id: "t4", kind: "tangent", parts: ["top", "left"] }, { id: "er", kind: "equalRadius", parts: ["left", "right"] }, { id: "r", kind: "radius", parts: ["right"], value: 1 }, { id: "len", kind: "horizontalDistance", parts: ["N", "M"], value: 6 }, { id: "f", kind: "fixed", parts: ["N"], at: [0, 0] }] };
  const e = build([sk("s", slot), ext("E", "s", 2)]);
  check("a slot 6 between centres, radius 1, 2 deep: (6 x 2 + pi) x 2", st(e, "E").kind === "ok" && near(vol(e, "E"), (12 + Math.PI) * 2), st(e, "E").why ?? String(vol(e, "E")));
  const s = e.result("s").value as Sketch; check("four sides, in the order drawn, two with a mid point", s.lines.length === 4 && s.lines.filter((l) => l.mid).length === 2, String(s.lines.length));
  e.edit("s", { ...slot, constraints: slot.constraints.map((c) => (c.id === "r" ? { ...c, value: 1.5 } : c.id === "len" ? { ...c, value: 8 } : c)) });
  check("radius 1.5 and length 8: (8 x 3 + 2.25 pi) x 2", st(e, "E").kind === "ok" && near(vol(e, "E"), (24 + 2.25 * Math.PI) * 2), String(vol(e, "E"))); e.release();
}
console.log("3. a plate with a hole, in one sketch");
{
  const p = { ...rectangle(0, 0, 10, 8), circles: [{ id: "hole", c: "H", r: 2 }] as any[] }; p.points.push(P("H", 5, 4)); p.constraints!.push({ id: "hr", kind: "radius", parts: ["hole"], value: 1.5 }, { id: "hc", kind: "fixed", parts: ["H"], at: [5, 4] });
  const e = build([sk("s", p), ext("E", "s", 3)]);
  check("10 x 8 with a hole of radius 1.5, 3 deep", st(e, "E").kind === "ok" && near(vol(e, "E"), (80 - Math.PI * 2.25) * 3), st(e, "E").why ?? String(vol(e, "E")));
  check("the hole's wall is a face named from the circle", names(e, "E").some((n) => n.includes("hole")), names(e, "E").join(" | "));
  e.edit("s", { ...p, constraints: p.constraints!.map((c) => (c.id === "hr" ? { ...c, value: 2.5 } : c)) });
  check("a bigger hole: radius 2.5", st(e, "E").kind === "ok" && near(vol(e, "E"), (80 - Math.PI * 6.25) * 3), String(vol(e, "E")));
  const fresh = build([sk("s", e.step("s").params), ext("E", "s", 3)]); check("and the edit equals a fresh build", e.result("E").fingerprint === fresh.result("E").fingerprint); fresh.release(); e.release();
}
console.log("4. a circle across the rectangle's edge: the profile by the even-odd rule, and by a pick");
{
  const p = { ...rectangle(0, 0, 10, 10), circles: [{ id: "c", c: "H", r: 3, fixedR: true }] as any[] }; p.points.push({ id: "H", x: 10, y: 5, fixed: true } as any);
  const e = build([sk("s", p), ext("E", "s", 2)]);
  check("by default (even-odd): the two crescents are two shapes, refused in words", st(e, "s").kind === "flagged" && /2 separate shapes/.test(st(e, "s").why ?? ""), st(e, "s").why);
  const lens = build([sk("s", { ...p, pick: [[9, 5]] }), ext("E", "s", 2)]), lensArea = 2 * 9 * Math.acos(0) - 0; void lensArea;
  // the lens: the part of the disc inside the rectangle: a half disc of radius 3 (the circle is centred on the edge): pi 9 / 2
  check("the lens picked: half of a disc of radius 3, 2 deep", st(lens, "E").kind === "ok" && near(vol(lens, "E"), (Math.PI * 9 / 2) * 2, 2e-3), st(lens, "E").why ?? String(vol(lens, "E")));
  const rest = build([sk("s", { ...p, pick: [[2, 5]] }), ext("E", "s", 2)]); check("the rectangle with the half disc taken out, picked by a point in it", st(rest, "E").kind === "ok" && near(vol(rest, "E"), (100 - Math.PI * 9 / 2) * 2, 2e-3), st(rest, "E").why ?? String(vol(rest, "E")));
  lens.release(); rest.release(); e.release();
}
console.log("5. a line across a rectangle: the halves");
{
  const p = { ...rectangle(0, 0, 10, 10), points: [...rectangle(0, 0, 10, 10).points, P("P", 0, 4), P("Q", 10, 4)], lines: [...rectangle(0, 0, 10, 10).lines!, { id: "cut", a: "P", b: "Q" }] };
  const low = build([sk("s", { ...p, pick: [[5, 2]] }), ext("E", "s", 1)]), both = build([sk("s", { ...p, pick: [[5, 2], [5, 8]] }), ext("E", "s", 1)]);
  check("the lower half: 40", st(low, "E").kind === "ok" && near(vol(low, "E"), 40), st(low, "E").why ?? String(vol(low, "E")));
  check("both halves picked: the whole, 100", st(both, "E").kind === "ok" && near(vol(both, "E"), 100), st(both, "E").why ?? String(vol(both, "E")));
  check("the lower half has a side named from the cut", names(low, "E").some((n) => n.includes("cut")), "");
  low.release(); both.release();
}
console.log("6. two separate shapes: refused with their number; one picked: made");
{
  const a = rectangle(0, 0, 2, 2), b = rectangle(5, 0, 2, 2);
  const p = { points: [...a.points!, ...b.points!.map((q) => ({ ...q, id: q.id + "2" }))], lines: [...a.lines!, ...b.lines!.map((l) => ({ id: l.id + "2", a: l.a + "2", b: l.b + "2" }))], constraints: [] as any[] };
  const e = build([sk("s", p), ext("E", "s", 1)]);
  check("refused in words that say how many", st(e, "s").kind === "flagged" && /2 separate shapes/.test(st(e, "s").why ?? ""), st(e, "s").why);
  const one = build([sk("s", { ...p, pick: [[1, 1]] }), ext("E", "s", 1)]); check("one picked: 4", st(one, "E").kind === "ok" && near(vol(one, "E"), 4), st(one, "E").why); one.release(); e.release();
}
console.log("7. an arc with nothing between its ends is refused, a clockwise arc is the other way round");
{
  const same = build([sk("s", { points: [P("A", 0, 0), P("B", 0, 0), P("C", 1, 0)], arcs: [{ id: "arc", c: "C", a: "A", b: "B" }], constraints: [] })]);
  check("the same start and end: a refusal naming the arc", st(same, "s").kind === "flagged" && /arc/.test(st(same, "s").why ?? ""), st(same, "s").why); same.release();
  const mk = (cw: boolean) => build([sk("s", { points: [P("A", 2, 0), P("B", -2, 0), P("C", 0, 0)], lines: [{ id: "base", a: "B", b: "A" }], arcs: [{ id: "arc", c: "C", a: "A", b: "B", cw }], constraints: [] }), ext("E", "s", 1)]);
  const up = mk(false), down = mk(true), ua = (up.result("s").value as Sketch).lines.find((l) => l.mid)!.mid!, da = (down.result("s").value as Sketch).lines.find((l) => l.mid)!.mid!;
  check("counter-clockwise from the right to the left goes over the top, clockwise under", ua[1] > 1.9 && da[1] < -1.9, `${ua[1].toFixed(3)} ${da[1].toFixed(3)}`);
  check("either way a half disc", near(vol(up, "E"), 2 * Math.PI) && near(vol(down, "E"), 2 * Math.PI)); up.release(); down.release();
}
console.log("9. a copy of a sketch with arcs: mirrored, the arcs still go the right way round; the pick goes with it")
{
  const slot = { points: [P("A", 0, -1), P("B", 6, -1), P("C", 6, 1), P("D", 0, 1), P("M", 6, 0), P("N", 0, 0)], lines: [{ id: "bot", a: "A", b: "B" }, { id: "top", a: "C", b: "D" }], arcs: [{ id: "right", c: "M", a: "B", b: "C" }, { id: "left", c: "N", a: "D", b: "A" }],
    constraints: [{ id: "t1", kind: "tangent", parts: ["bot", "right"] }, { id: "t2", kind: "tangent", parts: ["top", "right"] }, { id: "t3", kind: "tangent", parts: ["bot", "left"] }, { id: "t4", kind: "tangent", parts: ["top", "left"] }, { id: "r", kind: "radius", parts: ["right"], value: 1 }, { id: "er", kind: "equalRadius", parts: ["left", "right"] }], pick: [[3, 0]] };
  const e = build([sk("s", slot), { id: "c", kind: "sketchCopy", params: { mirror: 0, by: [0, 5] }, inputs: ["s"] }, ext("E", "c", 2)]);
  const a = (e.result("s").value as Sketch).lines.find((l) => l.id.of[0] === "right")!, b = (e.result("c").value as Sketch).lines.find((l) => l.id.of[0] === "right")!;
  check("the mirrored slot is a slot of the same size", st(e, "E").kind === "ok" && near(vol(e, "E"), (12 + Math.PI) * 2 * 1, 5e-3) || near(vol(e, "E"), (6 * 2 + Math.PI) * 2, 5e-3), st(e, "E").why ?? String(vol(e, "E")));
  check("the right arc's middle is where the mirror puts it (the centre line is y = 0, the arc bulges to x = 7)", Math.abs(b.mid![0] - 7) < 1e-6 && Math.abs(b.mid![1] - 5) < 1e-6 && Math.abs(a.mid![0] - 7) < 1e-6, `${b.mid} ${a.mid}`); e.release();
}
console.log("10. a body's circular edge as an anchor (E65): concentric with a rim, seen edge-on as a line, refused at an angle")
{
  const body = (cx: number, cy: number): Step[] => [{ id: "c0", kind: "sketchCircle", params: { r: 5, center: [cx, cy] }, inputs: [] }, ext("A", "c0", 4)];
  const faces = (e: Engine) => (e.result("A").value as Body).faces.map((f) => f.id), rim = (e: Engine) => ({ a: faces(e).find((i) => idKey(i).includes('"end"'))!, b: faces(e).find((i) => idKey(i).includes('"side"'))! });
  const probe = build(body(3, 2)), R = rim(probe), edge = { a: R.a, b: R.b }; probe.release();
  const on = (cx: number, cy: number, extra: Record<string, any> = {}): Step[] => [...body(cx, cy), { id: "s", kind: "sketch", params: { plane: "XY", offset: 4, points: [P("H", 0, 0)], circles: [{ id: "ring", c: "H", r: 1 }], anchors: [{ id: "rim", edge }], constraints: [{ id: "co", kind: "concentric", parts: ["ring", "rim"] }, { id: "rr", kind: "radius", parts: ["ring"], value: 2 }], ...extra }, inputs: ["A"] }, ext("B", "s", 1)];
  const e = build(on(3, 2)), s = e.result("s").value as Sketch;
  check("a circle made concentric with the rim, radius 2: at the rim's centre, a cylinder of volume pi 4 x 1", st(e, "s").kind === "ok" && !!s.circle && near(s.circle.c[0], 3) && near(s.circle.c[1], 2) && near(s.circle.c[2], 4) && near(s.circle.r, 2) && near(vol(e, "B"), 4 * Math.PI), st(e, "s").why ?? JSON.stringify(s.circle));
  check("it says it is fully constrained", s.solve?.freedom === 0, JSON.stringify(s.solve));
  e.edit("c0", { r: 5, center: [6, 1] }); const m = e.result("s").value as Sketch;
  check("the body's circle moves: the sketch follows (concentric still)", st(e, "s").kind === "ok" && near(m.circle!.c[0], 6) && near(m.circle!.c[1], 1), JSON.stringify(m.circle?.c));
  const refs = referenceSet({ body: e.result("A").value as Body, plane: { plane: "XY", offset: 4 } }), rc = refs.find((r) => r.kind === "circle" && r.origin === "anchor"), low = refs.find((r) => r.kind === "circle" && r.origin === "projection");
  check("the reference set offers the rim as a circle that can be held (the top rim in the plane is an anchor, the bottom one is seen through its projection)", !!rc && !!low && near(low.offset!, -4) && rc.origin === "anchor" && near(rc.r!, 5) && !!rc.anchor && !rc.anchor.held, JSON.stringify(rc && { o: rc.origin, r: rc.r }));
  const edgeOn = build([...body(3, 2), { id: "s", kind: "sketch", params: { plane: "XZ", offset: 0, points: [P("A", 0, 0), P("B", 1, 1)], lines: [{ id: "l", a: "A", b: "B" }], anchors: [{ id: "rim", edge }], constraints: [{ id: "on", kind: "pointOnLine", parts: ["A", "rim"] }] }, inputs: ["A"] }]), es = edgeOn.result("s").value as Sketch;
  const rl = es.reference?.[0]; const ends = rl ? [rl.a, rl.b].map((p) => p.map((x) => Math.round(x * 1e6) / 1e6).join()).sort() : [];
  check("seen edge-on (the XZ plane): a line between the circle's extremes, (-2, 2, 4) to (8, 2, 4)", st(edgeOn, "s").kind === "ok" && ends.join("|") === ["-2,2,4", "8,2,4"].sort().join("|"), st(edgeOn, "s").why ?? ends.join("|"));
  const tilted = build([...body(3, 2), { id: "s", kind: "sketch", params: { frame: { origin: [0, 0, 4], xDir: [1, 0, 0], normal: [0, Math.SQRT1_2, Math.SQRT1_2] }, points: [P("A", 0, 0)], anchors: [{ id: "rim", edge }], constraints: [] }, inputs: ["A"] }]);
  check("seen at an angle: refused in words (an ellipse)", st(tilted, "s").kind !== "ok" && /ellipse/.test(st(tilted, "s").why ?? ""), st(tilted, "s").why);
  e.release(); edgeOn.release(); tilted.release();
}
console.log("8. random: plates with holes, slots and picks: the volume is the area, an edit equals a fresh build");
{
  let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296; let n = 0, good = 0;
  for (let k = 0; k < 25; k++) {
    const w = 8 + rnd() * 10, h = 6 + rnd() * 8, holes = 1 + Math.floor(rnd() * 3), d = 1 + rnd() * 4, r = [] as number[];
    const base = rectangle(0, 0, w, h), p: any = { ...base, circles: [] as any[] }; let hole = 0;
    for (let i = 0; i < holes; i++) { const rr = 0.4 + rnd() * 0.8, cx = (w / (holes + 1)) * (i + 1), cy = h / 2 + (rnd() - 0.5) * 1.5; if (cx - rr < 0.2 || cx + rr > w - 0.2) continue; p.points.push({ id: `H${i}`, x: cx, y: cy }); p.circles.push({ id: `c${i}`, c: `H${i}`, r: rr, fixedR: true }); p.constraints.push({ id: `p${i}`, kind: "fixed", parts: [`H${i}`], at: [cx, cy] }); hole += Math.PI * rr * rr; r.push(rr); }
    const e = build([sk("s", p), ext("E", "s", d)]); n++;
    const ok = st(e, "E").kind === "ok" && near(vol(e, "E"), (w * h - hole) * d, 5e-4); if (ok) good++; else console.log("   case", k, st(e, "E").why ?? vol(e, "E"), (w * h - hole) * d);
    e.release();
  }
  check(`${good} of ${n} plates have the volume of their area`, good === n);
}
console.log(failureCount() ? `\n${failureCount()} failure(s)` : "\nno failure");
process.exit(failureCount() ? 1 : 0);
