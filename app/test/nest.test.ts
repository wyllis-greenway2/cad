// Nesting several parts on a sheet (`in_572`, `in_560`): the parts of a drawing, and copies of them, packed in rows by their bounding boxes (turned a quarter turn when allowed and when it helps); with nesting off the layout is the
// person's own, and the sheet's edge and the spacing are shown and checked. The drawings are made by hand.
import test from "node:test";
import assert from "node:assert/strict";
import { runRoute, builtInRoutes, defaultSettings, CONTRACT_VERSION } from "../src/manufacturing/index.ts";
import type { PartSnapshot, FlatPiece, MachineDefinition, RouteContext, Point2 } from "../src/manufacturing/index.ts";
import { packRects } from "../src/manufacturing/core/nest.ts";
import { groupParts, movedLoop } from "../src/manufacturing/core/nest.ts";
import { loopsOf, polygonOf, areaOf, sweepOf } from "../src/manufacturing/core/outline.ts";
import { viewOf } from "../src/interaction/toolpathview.ts";
import { laserDialog, laserDefaults } from "../src/interaction/manufacture.ts";

const route = builtInRoutes[0]!;
const plate = (x: number, y: number, w: number, h: number, hole = 0, layer?: "cut" | "score" | "engrave"): FlatPiece[] => [
  ...([[[x, y], [x + w, y]], [[x + w, y], [x + w, y + h]], [[x + w, y + h], [x, y + h]], [[x, y + h], [x, y]]] as Point2[][]).map(([p, q]): FlatPiece => ({ kind: "line", p: p!, q: q!, ...(layer ? { layer } : {}) })),
  ...(hole ? [{ kind: "circle", center: [x + w / 2, y + h / 2], radius: hole } as FlatPiece] : []),
];
const part = (pieces: FlatPiece[]): PartSnapshot => ({ contract: CONTRACT_VERSION, id: "sk/1", name: "Plates", kind: "flat", units: "mm", outlines: [{ plane: { origin: [0, 0, 0], xDir: [1, 0, 0], normal: [0, 0, 1] }, pieces }], bbox: { min: [0, 0, 0], max: [1, 1, 0] } });
const machine = (w: number, h: number): MachineDefinition => ({ kind: "machine", id: "m", version: 1, name: "Test laser", provenance: { author: "t", date: "2026-11-16", licence: "CC0", origin: "user", trust: "user" }, process: "laser",
  envelope: { min: [0, 0, 0], max: [w, h, 0] }, origin: "front-left", kinematics: "cartesian", limits: { feed: 6000 }, capabilities: { axes: 2, rotary: false, arcs: true, toolChange: "none", coolant: false, probe: false }, dialect: "d", route: {} });
const ctx = (s: Record<string, number | boolean | string>, w = 100, h = 60): RouteContext => ({ machine: machine(w, h), settings: { ...defaultSettings(route), kerf: 0, ...s } });
const cutPoints = (r: ReturnType<typeof runRoute>): Point2[] => (r.toolpath?.operations.find((o) => o.id === "cut")?.moves ?? []).flatMap((m) => (m.op === "cut" || m.op === "arc" ? [[m.to[0], m.to[1]] as Point2] : []));
const msgs = (r: ReturnType<typeof runRoute>): string[] => r.findings.map((f) => `${f.severity}: ${f.message}`);

test("packing: every box goes in, inside the sheet, none over another, a gap apart; the tallest first; a box too big is left out", () => {
  const rects = [{ id: 0, w: 30, h: 20 }, { id: 1, w: 10, h: 10 }, { id: 2, w: 25, h: 15 }, { id: 3, w: 40, h: 12 }, { id: 4, w: 8, h: 8 }];
  const { placed, unplaced } = packRects(rects, { w: 100, h: 60 }, 2, false);
  assert.equal(placed.length, 5); assert.deepEqual(unplaced, []);
  const box = (p: (typeof placed)[number]) => { const r = rects[p.id]!; return { x0: p.x, y0: p.y, x1: p.x + (p.rotated ? r.h : r.w), y1: p.y + (p.rotated ? r.w : r.h) }; };
  for (const p of placed) { const b = box(p); assert.ok(b.x0 >= 0 && b.y0 >= 0 && b.x1 <= 100 + 1e-9 && b.y1 <= 60 + 1e-9, "inside the sheet"); }
  for (const a of placed) for (const b of placed) if (a.id < b.id) { const [p, q] = [box(a), box(b)]; assert.ok(p.x1 + 2 <= q.x0 + 1e-9 || q.x1 + 2 <= p.x0 + 1e-9 || p.y1 + 2 <= q.y0 + 1e-9 || q.y1 + 2 <= p.y0 + 1e-9, `boxes ${a.id} and ${b.id} are a gap apart`); }
  assert.equal(placed[0]!.id, 3, "the longest first");
  assert.deepEqual(packRects([{ id: 0, w: 120, h: 10 }, { id: 1, w: 10, h: 10 }], { w: 100, h: 60 }, 2, false), { placed: [{ id: 1, x: 0, y: 0, rotated: false }], unplaced: [0] });
});

test("turning a box a quarter turn is used only when allowed, and only when it is what lets the box in", () => {
  const long = [{ id: 0, w: 90, h: 10 }];
  assert.deepEqual(packRects(long, { w: 20, h: 100 }, 0, false).unplaced, [0]);
  const r = packRects(long, { w: 20, h: 100 }, 0, true);
  assert.deepEqual(r.unplaced, []); assert.equal(r.placed[0]!.rotated, true);
  assert.equal(packRects([{ id: 0, w: 10, h: 10 }], { w: 50, h: 50 }, 0, true).placed[0]!.rotated, false, "a square is never turned");
});

test("parts: a closed outline with the holes in it and the lines drawn inside is one part; another outline apart from it, and an island in a hole, are parts of their own", () => {
  const pieces = [...plate(0, 0, 40, 40, 5), ...plate(10, 10, 4, 4, 0, "engrave"), ...plate(60, 0, 20, 20), ...plate(30, 30, 4, 4)]; // (the last: a square inside the big plate, outside the round hole: a second hole in it)
  const loops = loopsOf(pieces);
  const groups = groupParts(loops, loops.map((l) => polygonOf(l)));
  assert.equal(groups.length, 2, "the big plate (its hole, its engraving, the small square inside) and the second plate");
  assert.deepEqual(groups.map((g) => g.length).sort(), [1, 4]);
  const island = loopsOf([...plate(0, 0, 40, 40), ...plate(5, 5, 30, 30), ...plate(10, 10, 20, 20)]); // a plate, a hole in it, and a plate inside the hole
  assert.deepEqual(groupParts(island, island.map((l) => polygonOf(l))).map((g) => g.length).sort(), [1, 2], "the island is a part of its own");
});

test("a loop moved: a quarter turn then a shift; the shape's area and the arcs' way round stay", () => {
  const circle = loopsOf([{ kind: "circle", center: [10, 0], radius: 3 }])[0]!;
  const m = movedLoop(circle, true, 100, 50);
  assert.deepEqual(m.items[0]!.kind === "arc" ? m.items[0]!.center.map((v) => +v.toFixed(9)) : null, [100, 60], "(10, 0) turns to (0, 10), then moves");
  assert.ok(m.items.every((it) => it.kind === "arc" && it.ccw === true && Math.abs(sweepOf(it) - Math.PI) < 1e-9));
  const sq = loopsOf(plate(0, 0, 30, 10))[0]!;
  assert.ok(Math.abs(areaOf(polygonOf(movedLoop(sq, true, 5, 5))) - areaOf(polygonOf(sq))) < 1e-9);
});

test("nesting on: parts drawn far apart (one beyond the sheet) are packed onto it, each with its holes; the sheet is the toolpath's stock; no complaints", () => {
  const pieces = [...plate(0, 0, 40, 25, 5), ...plate(500, 300, 30, 20, 3), ...plate(-200, 9, 20, 20)];
  const r = runRoute(route, part(pieces), ctx({ nest: "pack", gap: 3, rotate: true }));
  assert.deepEqual(msgs(r), []);
  const pts = cutPoints(r);
  assert.ok(pts.every((p) => p[0] >= -1e-9 && p[1] >= -1e-9 && p[0] <= 100 + 1e-9 && p[1] <= 60 + 1e-9), "everything is on the 100 x 60 sheet");
  const ops = r.toolpath!.operations.find((o) => o.id === "cut")!.moves;
  assert.equal(ops.filter((m) => m.op === "travel").length, 5, "three outlines and two holes");
  assert.deepEqual(r.toolpath!.stock, { min: [0, 0, 0], max: [100, 60, 0] });
  assert.deepEqual(r.toolpath!.frame!.origin, [-200, 0, 0], "the sheet lies at the drawing's lower left corner");
});

test("a hole stays in its part: after packing, turned or not, every hole is still at the middle of the plate it was drawn in", () => {
  const r = runRoute(route, part([...plate(0, 0, 80, 20, 4), ...plate(300, 0, 80, 20, 4), ...plate(-100, 40, 30, 30, 6)]), ctx({ nest: "pack", gap: 2, rotate: true }, 120, 90));
  assert.deepEqual(msgs(r), []);
  const paths: { op: string; to: Point2; center?: Point2 }[][] = [];
  for (const m of r.toolpath!.operations[0]!.moves) {
    if (m.op === "travel") paths.push([]);
    else if (m.op === "cut" || m.op === "arc") paths[paths.length - 1]!.push({ op: m.op, to: [m.to[0], m.to[1]], ...(m.op === "arc" ? { center: [m.center[0], m.center[1]] as Point2 } : {}) });
  }
  const plates = paths.filter((p) => p.every((m) => m.op === "cut")), holes = paths.filter((p) => p.every((m) => m.op === "arc"));
  assert.equal(plates.length, 3); assert.equal(holes.length, 3);
  const middle = (p: typeof plates[number]): Point2 => { const xs = p.map((m) => m.to[0]), ys = p.map((m) => m.to[1]); return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]; };
  for (const h of holes) {
    const c = h[0]!.center!;
    assert.equal(plates.filter((p) => Math.hypot(middle(p)[0] - c[0], middle(p)[1] - c[1]) < 1e-6).length, 1, `the hole at ${c.map((v) => v.toFixed(2))} is in the middle of one plate`);
  }
});

test("copies: each part is made as many times as asked, only when nesting is on; what does not fit is left out and said", () => {
  const one = part(plate(0, 0, 20, 10, 2));
  const six = runRoute(route, one, ctx({ nest: "pack", copies: 6 }));
  assert.equal(six.toolpath!.operations[0]!.moves.filter((m) => m.op === "travel").length, 12, "six plates and six holes");
  assert.deepEqual(msgs(six), []);
  const many = runRoute(route, one, ctx({ nest: "pack", copies: 40, gap: 2 }));
  assert.ok(msgs(many).some((m) => /^warning: \d+ parts? did not fit on the 100 × 60 mm sheet and (was|were) left out/.test(m)), msgs(many).join("|"));
  assert.ok(many.toolpath!.operations[0]!.moves.filter((m) => m.op === "travel").length < 80, "fewer than forty plates and holes");
  const off = runRoute(route, one, ctx({ nest: "off", copies: 3 }));
  assert.ok(msgs(off).includes("caution: Copies are made only when nesting is on: one of each part is cut"));
  assert.equal(off.toolpath!.operations[0]!.moves.filter((m) => m.op === "travel").length, 2, "one of each");
});

test("turning to fit: a long thin part fits a narrow sheet only turned, and only when turning is allowed", () => {
  const long = part(plate(0, 0, 90, 10));
  const narrow = (rotate: boolean) => runRoute(route, long, ctx({ nest: "pack", rotate }, 20, 100));
  assert.ok(msgs(narrow(false)).some((m) => /did not fit/.test(m)));
  assert.deepEqual(msgs(narrow(true)), []);
  const xs = cutPoints(narrow(true)).map((p) => p[0]), ys = cutPoints(narrow(true)).map((p) => p[1]);
  assert.ok(Math.max(...xs) - Math.min(...xs) <= 10 + 1e-9 && Math.max(...ys) - Math.min(...ys) >= 90 - 1e-9, "stood up: 10 wide and 90 high");
});

test("manual layout (nesting off): parts that overlap, parts closer than the gap and a part outside the sheet are told, with the sheet at the machine's zero when the drawing is not moved to the corner", () => {
  const f = (pieces: FlatPiece[], s: Record<string, number | boolean | string> = {}) => msgs(runRoute(route, part(pieces), ctx({ toCorner: false, gap: 2, ...s })));
  assert.deepEqual(f([...plate(0, 0, 20, 20), ...plate(30, 0, 20, 20)]), [], "apart and on the sheet");
  assert.ok(f([...plate(0, 0, 20, 20), ...plate(10, 10, 20, 20)]).includes("warning: Two parts overlap: both would be cut where they cross"));
  assert.ok(f([...plate(0, 0, 20, 20), ...plate(21, 0, 20, 20)]).some((m) => /^caution: Two parts are 1\.00 mm apart, closer than the 2 mm gap/.test(m)));
  assert.ok(f([...plate(0, 0, 20, 20), ...plate(95, 0, 20, 20)]).includes("warning: A part reaches outside the 100 × 60 mm sheet"));
  assert.ok(f(plate(-5, 0, 20, 20)).includes("warning: A part reaches outside the 100 × 60 mm sheet"), "below the zero too");
  assert.deepEqual(f(plate(300, 200, 20, 20), { toCorner: true }), [], "moved to the corner, so on the sheet");
  assert.deepEqual(f([...plate(0, 0, 20, 20), ...plate(5, 5, 4, 4)]), [], "a plate inside a plate is a hole in it, not an overlap");
  assert.deepEqual(f(plate(0, 0, 20, 20), { sheetWidth: 15, sheetHeight: 30 }), ["warning: A part reaches outside the 15 × 30 mm sheet"], "a sheet smaller than the machine's area");
  assert.equal(runRoute(route, part(plate(0, 0, 150, 20)), ctx({ nest: "pack", sheetWidth: 200, sheetHeight: 50 })).toolpath!.stock!.max[0], 200, "and its size is the stock");
});

test("the preview shows the sheet's edge: four sides in the world, from the toolpath's zero", () => {
  const r = runRoute(route, part([...plate(40, 30, 20, 10)]), ctx({ nest: "off", toCorner: true }));
  const v = viewOf(r.toolpath!, 1);
  assert.equal(v.stock.length, 24, "four sides of two points of three numbers");
  const xs = v.stock.filter((_, i) => i % 3 === 0), ys = v.stock.filter((_, i) => i % 3 === 1);
  assert.deepEqual([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)], [40, 140, 30, 90], "100 x 60 from the part's corner");
});

test("the dialog has the layout settings, made from the route's schema", () => {
  const d = laserDialog(laserDefaults());
  for (const id of ["nest", "copies", "gap", "margin", "rotate", "sheetWidth", "sheetHeight"]) assert.ok(d.fields.some((f) => f.id === id), id);
  assert.equal(d.fields.find((f) => f.id === "nest")!.type, "choice");
  assert.deepEqual(d.fields.find((f) => f.id === "nest")!.choices!.map((c) => c.value), ["off", "pack"]);
  assert.equal(d.fields.find((f) => f.id === "rotate")!.type, "check");
});
