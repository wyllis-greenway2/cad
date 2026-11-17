// The laser outline route and the shared 2D code under it (`in_569`, `dec_laser_outline_route`): a flat drawing becomes the path of a beam: kerf, tabs, inside before outside, layers, findings. The parts here are made by hand.
import test from "node:test";
import assert from "node:assert/strict";
import { createRegistry, runRoute, builtInRoutes, defaultSettings, CONTRACT_VERSION } from "../src/manufacturing/index.ts";
import type { PartSnapshot, FlatPiece, MachineDefinition, DialectDefinition, RouteContext, Move, Toolpath } from "../src/manufacturing/index.ts";
import { loopsOf, polygonOf, depthsOf, areaOf, sweepOf, lengthOf } from "../src/manufacturing/core/outline.ts";
import { offsetPolygon } from "../src/manufacturing/core/offset.ts";
import { orderPaths } from "../src/manufacturing/core/order.ts";
import { runsWithTabs } from "../src/manufacturing/routes/laser-outline/prepare.ts";
import type { Point2 } from "../src/manufacturing/index.ts";

const rect = (w: number, h: number, x = 0, y = 0, layer?: "cut" | "score" | "engrave"): FlatPiece[] => ([[[x, y], [x + w, y]], [[x + w, y], [x + w, y + h]], [[x + w, y + h], [x, y + h]], [[x, y + h], [x, y]]] as Point2[][]).map(([p, q]) => ({ kind: "line", p: p!, q: q!, ...(layer ? { layer } : {}) }));
const part = (pieces: FlatPiece[], kind: "flat" | "solid" = "flat"): PartSnapshot => ({ contract: CONTRACT_VERSION, id: "sk/1", name: "Plate", kind, units: "mm", outlines: [{ plane: { origin: [0, 0, 0], xDir: [1, 0, 0], normal: [0, 0, 1] }, pieces }], bbox: { min: [0, 0, 0], max: [40, 20, 0] } });
const machine = (w = 400, h = 400): MachineDefinition => ({ kind: "machine", id: "m", version: 1, name: "Test laser", provenance: { author: "t", date: "2026-11-16", licence: "CC0", origin: "user", trust: "user" }, process: "laser",
  envelope: { min: [0, 0, 0], max: [w, h, 10] }, origin: "front-left", kinematics: "cartesian", limits: { feed: 6000 }, capabilities: { axes: 2, rotary: false, arcs: true, toolChange: "none", coolant: false, probe: false }, dialect: "d", route: {} });
const dialect: DialectDefinition = { kind: "dialect", id: "d", version: 1, name: "D", provenance: { author: "t", date: "2026-11-16", licence: "CC0", origin: "user", trust: "user" }, extension: "nc", decimals: 3, comment: { open: "(", close: ")" }, lineNumbers: false,
  start: ["G21", "G90"], end: ["M2"], words: { rapid: "G0", linear: "G1", arcCw: "G2", arcCcw: "G3" }, power: { on: "M4 S{s}", off: "M5", max: 1000, offOnTravel: true } };
const route = builtInRoutes[0]!;
const ctx = (settings: Record<string, number | boolean | string> = {}, m = machine()): RouteContext => ({ machine: m, settings: { ...defaultSettings(route), ...settings } });
const plate = [...rect(40, 20), { kind: "circle", center: [10, 10], radius: 4 } as FlatPiece];
const cuts = (tp: Toolpath, layer = "cut"): Move[] => tp.operations.find((o) => o.id === layer)?.moves.filter((m) => m.op === "cut" || m.op === "arc") ?? [];
const ends = (m: Move[]): Point2[] => m.flatMap((x) => (x.op === "cut" || x.op === "arc" ? [[x.to[0], x.to[1]] as Point2] : []));

test("the route is built in, registers, and takes only flat parts", () => {
  const r = createRegistry();
  for (const x of builtInRoutes) assert.deepEqual(r.register(x), { ok: true });
  assert.deepEqual(r.forPart(part(plate)).map((o) => [o.route, o.fit.fits]), [["laser-outline", true]]);
  assert.deepEqual(r.forPart(part(plate, "solid")), [], "not offered for a solid");
});

test("loops: pieces that meet are joined whichever way they were drawn, a circle is two arcs, layers are never joined, an open line is open", () => {
  const shuffled: FlatPiece[] = [{ kind: "line", p: [10, 0], q: [10, 10] }, { kind: "line", p: [0, 10], q: [0, 0] }, { kind: "line", p: [0, 0], q: [10, 0] }, { kind: "line", p: [10, 10], q: [0, 10] }];
  const a = loopsOf(shuffled);
  assert.equal(a.length, 1); assert.equal(a[0]!.closed, true); assert.equal(a[0]!.items.length, 4);
  const c = loopsOf([{ kind: "circle", center: [0, 0], radius: 5 }]);
  assert.equal(c[0]!.items.length, 2); assert.equal(c[0]!.closed, true);
  assert.equal(loopsOf([{ kind: "line", p: [0, 0], q: [5, 0], layer: "cut" }, { kind: "line", p: [5, 0], q: [5, 5], layer: "score" }]).length, 2);
  assert.equal(loopsOf([{ kind: "line", p: [0, 0], q: [5, 0] }, { kind: "line", p: [5, 0], q: [5, 5] }])[0]!.closed, false);
});

test("a polygon follows its arcs to within the tolerance, areas and lengths are right, and holes are one deeper than what holds them", () => {
  const circle = loopsOf([{ kind: "circle", center: [0, 0], radius: 10 }])[0]!;
  const poly = polygonOf(circle, 0.01);
  assert.ok(Math.abs(areaOf(poly) - Math.PI * 100) < 0.5, "area of a circle of radius 10");
  assert.ok(poly.every((p) => Math.abs(Math.hypot(p[0], p[1]) - 10) < 1e-9), "its points are on the circle");
  const sagitta = 10 - Math.hypot(...([(poly[0]![0] + poly[1]![0]) / 2, (poly[0]![1] + poly[1]![1]) / 2] as [number, number]));
  assert.ok(sagitta <= 0.0101, `a step is at most 0.01 mm from the curve (${sagitta})`);
  assert.equal(sweepOf({ kind: "arc", center: [0, 0], radius: 5, p: [5, 0], q: [0, 5], ccw: true }).toFixed(4), (Math.PI / 2).toFixed(4));
  assert.equal(sweepOf({ kind: "arc", center: [0, 0], radius: 5, p: [5, 0], q: [0, 5], ccw: false }).toFixed(4), (-1.5 * Math.PI).toFixed(4));
  const loops = loopsOf(plate);
  const polys = loops.map((l) => polygonOf(l));
  assert.deepEqual(depthsOf(polys, loops.map((l) => l.closed)).sort(), [0, 1], "the rectangle is outside, the circle a hole in it");
  assert.deepEqual(depthsOf(polys, loops.map((l) => l.closed)), loops.map((l) => (l.items.length === 2 ? 1 : 0)));
  assert.ok(Math.abs(lengthOf([[0, 0], [3, 0], [3, 4]], false) - 7) < 1e-9);
});

test("offsetting: a square moves out and in by the distance and keeps its sharp corners; a shape that vanishes is refused; either way round", () => {
  const sq: Point2[] = [[0, 0], [10, 0], [10, 10], [0, 10]];
  const out = offsetPolygon(sq, 1)!;
  assert.ok(Math.abs(areaOf(out) - 144) < 1e-9, "12 x 12");
  assert.deepEqual(out.map((p) => p.map((v) => +v.toFixed(9))), [[-1, -1], [11, -1], [11, 11], [-1, 11]]);
  assert.ok(Math.abs(areaOf(offsetPolygon(sq, -1)!) - 64) < 1e-9, "8 x 8");
  assert.ok(Math.abs(areaOf(offsetPolygon([...sq].reverse(), 1)!) + 144) < 1e-9, "the other way round gives the other way round");
  assert.equal(offsetPolygon(sq, -6), null, "a square of 10 cannot go in by 6");
  assert.equal(offsetPolygon([[0, 0], [1, 0]], 1), null);
  const ell: Point2[] = [[0, 0], [10, 0], [10, 4], [4, 4], [4, 10], [0, 10]]; // an L: its inner corner is concave
  assert.ok(Math.abs(areaOf(offsetPolygon(ell, 0.5)!) - (areaOf(ell) + 0.5 * lengthOf(ell, true) + 0.25 * (5 - 1))) < 1e-6, "area of an L grown by 0.5: the edges, the five convex corners and the one concave");
});

test("order: deepest first, then the nearest; a closed loop starts at its vertex nearest the head and an open one from its nearer end", () => {
  const v = orderPaths([
    { points: [[0, 0], [40, 0], [40, 20], [0, 20]], closed: true, depth: 0 },
    { points: [[30, 10], [32, 10], [32, 12]], closed: true, depth: 1 },
    { points: [[8, 8], [12, 8], [12, 12]], closed: true, depth: 1 },
  ], [0, 0]);
  assert.deepEqual(v.map((x) => x.index), [2, 1, 0], "holes first, nearest hole first, the outside last");
  assert.equal(v[0]!.start, 0);
  const open = orderPaths([{ points: [[0, 0], [10, 0]], closed: false, depth: 0 }], [11, 0]);
  assert.equal(open[0]!.reversed, true, "taken from the end the head is nearer");
});

test("tabs: the runs between tabs of the right width, evenly round, leave the right length uncut", () => {
  const sq: Point2[] = [[0, 0], [20, 0], [20, 20], [0, 20]];
  const runs = runsWithTabs(sq, 4, 2)!;
  assert.equal(runs.length, 4);
  const cut = runs.reduce((n, r) => n + lengthOf(r, false), 0);
  assert.ok(Math.abs(cut - (80 - 4 * 2)) < 1e-9, "the perimeter 80 less four tabs of 2");
  assert.equal(runsWithTabs(sq, 4, 11), null, "tabs that would take more than half the edge do not fit");
  assert.equal(runsWithTabs(sq, 0, 2), null);
});

test("kerf 0 and no tabs: lines and arcs stay lines and arcs, the hole is cut before the outside, the part is moved to the corner, the file has the arcs", () => {
  const moved = part(plate.map((p) => (p.kind === "circle" ? { ...p, center: [110, 60] as Point2 } : { ...p, ...(p.kind === "line" ? { p: [p.p[0] + 100, p.p[1] + 50] as Point2, q: [p.q[0] + 100, p.q[1] + 50] as Point2 } : {}) })));
  const run = runRoute(route, moved, ctx({ kerf: 0 }), dialect);
  const tp = run.toolpath!;
  const cs = cuts(tp);
  assert.equal(cs.filter((m) => m.op === "arc").length, 2, "the hole is its two half arcs");
  assert.equal(cs.filter((m) => m.op === "cut").length, 4, "the four sides");
  assert.equal(cs[0]!.op, "arc", "the hole is cut first");
  const xs = ends(cs).map((p) => p[0]), ys = ends(cs).map((p) => p[1]);
  assert.ok(Math.min(...xs) >= 0 && Math.min(...ys) >= 0 && Math.max(...xs) <= 40 + 1e-9 && Math.max(...ys) <= 20 + 1e-9, "inside the part's own 40 x 20 from the corner");
  assert.ok(xs.includes(0) || ys.includes(0));
  const file = new TextDecoder().decode(run.files[0]!.bytes);
  assert.match(file, /G3 X.* I.* J.* F600/);
  assert.match(file, /M4 S1000/);
  assert.ok(tp.seconds! > 0);
  assert.deepEqual(run.findings, []);
});

test("kerf: the outside is cut half a kerf out and the hole half a kerf in, so the part comes out as drawn", () => {
  const tp = runRoute(route, part(plate), ctx({ kerf: 0.2 })).toolpath!;
  const cs = cuts(tp);
  assert.equal(cs.filter((m) => m.op === "arc").length, 0, "with a kerf the paths are polylines");
  const pts = ends(cs);
  const hole = pts.filter((p) => Math.hypot(p[0] - 10, p[1] - 10) < 6), outer = pts.filter((p) => Math.hypot(p[0] - 10, p[1] - 10) >= 6);
  assert.ok(hole.length > 20 && hole.every((p) => Math.abs(Math.hypot(p[0] - 10, p[1] - 10) - 3.9) < 0.002), "the hole's path is 0.1 mm inside its edge: radius 3.9");
  const [x0, x1] = [Math.min(...outer.map((p) => p[0])), Math.max(...outer.map((p) => p[0]))];
  assert.ok(Math.abs(x1 - x0 - 40.2) < 1e-9, "the outside's path is 40.2 wide: 0.1 mm out each side");
  assert.ok(Math.abs(x0 + 0.1) < 1e-9 || Math.abs(x0 - 0) < 1e-9, "(moved to the corner as a whole)");
});

test("tabs: an outside edge is cut in runs with gaps (the beam travels over a tab with the power off); a hole is not tabbed; a tab that does not fit is a finding", () => {
  const run = runRoute(route, part(plate), ctx({ kerf: 0, tabs: 2, tabWidth: 3 }), dialect);
  const op = run.toolpath!.operations.find((o) => o.id === "cut")!;
  assert.equal(op.moves.filter((m) => m.op === "travel").length, 1 + 2, "one travel to the hole, and one to each of the two runs of the outside");
  const file = new TextDecoder().decode(run.files[0]!.bytes);
  assert.equal((file.match(/M5/g) ?? []).length >= 3, true, "the power goes off between the runs");
  const tooBig = runRoute(route, part(plate), ctx({ kerf: 0, tabs: 20, tabWidth: 10 }));
  assert.ok(tooBig.findings.some((f) => /tabs? of 10 mm do not fit/.test(f.message)));
  assert.ok(runRoute(route, part(rect(20, 20, 0, 0, "score")), ctx({ tabs: 3 })).findings.some((f) => /Nothing is marked to cut/.test(f.message)));
  assert.ok(runRoute(route, part([{ kind: "line", p: [0, 0], q: [10, 0] }]), ctx({ tabs: 3 })).findings.some((f) => /no closed outside edge/.test(f.message)));
});

test("layers: score and engrave are followed on the line, once, at their own power and speed; cut passes repeat the cut", () => {
  const p = part([...rect(40, 20), ...rect(10, 5, 5, 5, "score"), { kind: "line", p: [20, 2], q: [30, 2], layer: "engrave" }]);
  const tp = runRoute(route, p, ctx({ kerf: 0, cutPasses: 2, cutPower: 90, scorePower: 30, scoreSpeed: 900, engravePower: 5 })).toolpath!;
  assert.deepEqual(tp.operations.map((o) => o.id), ["cut", "score", "engrave"]);
  const cut = cuts(tp), score = cuts(tp, "score"), eng = cuts(tp, "engrave");
  assert.equal(cut.length, 8, "four sides twice");
  assert.ok(cut.every((m) => m.op === "cut" && m.power === 0.9 && m.feed === 600));
  assert.ok(score.length === 4 && score.every((m) => m.op === "cut" && m.power === 0.3 && m.feed === 900), "the score rectangle once");
  assert.ok(eng.length === 1 && (eng[0] as { power: number }).power === 0.05);
});

test("findings: an open line to cut, a feature too small for the kerf, a wall thinner than the kerf, nothing to cut, a part bigger than the machine", () => {
  const f = (pieces: FlatPiece[], s = {}, m = machine()) => runRoute(route, part(pieces), ctx({ kerf: 0.3, ...s }, m)).findings.map((x) => `${x.severity}: ${x.message}`);
  assert.ok(f([...rect(40, 20).slice(0, 3)]).some((x) => /^warning: A line to cut does not close/.test(x)));
  assert.ok(f([...rect(40, 20), { kind: "circle", center: [20, 10], radius: 0.1 }]).some((x) => /^warning: A feature is too small for a 0.3 mm kerf/.test(x)));
  assert.ok(f([...rect(40, 20), { kind: "circle", center: [20, 10], radius: 9.9 }]).some((x) => /^warning: A wall of 0\.1\d mm .* thinner than the 0\.3 mm kerf/.test(x)));
  assert.deepEqual(f([...rect(40, 20, 0, 0, "score")]), ["info: Nothing is marked to cut: every line is score or engrave"]);
  const big = runRoute(route, part(plate), ctx({}, machine(30, 400)));
  assert.equal(big.fit.fits, false);
  assert.match(big.fit.reasons[0]!, /40.0 × 20.0 mm and the machine's area is 30 × 400 mm/);
  assert.ok(big.toolpath, "and it still plans: advice, not a block");
  assert.equal(runRoute(route, part([]), ctx()).fit.fits, false, "an empty drawing does not fit");
});
