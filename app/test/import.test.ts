// Import (`dec_import`, `in_526`): STEP as a body with no history; SVG and DXF as sketches.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, run, scene, undoLast, saveText, openSession } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { drawSquaredRectangle, drawCircle, drawArc } from "../src/operation/build.ts";
import { nextId } from "../src/operation/scene.ts";
import { exportFile } from "../src/interaction/exportfile.ts";
import { exportFlat, sketchPieces } from "../src/interaction/exportsketch.ts";
import { importFile, importPlane, sketchCommand } from "../src/interaction/importfile.ts";
import { parseSvg, parseDxf } from "../src/compiler/flatparse.ts";
import { boundsOf, sweepOf, svgText } from "../src/compiler/flatfile.ts";
import type { Piece } from "../src/compiler/flatfile.ts";
import { startOp } from "../src/interaction/operations.ts";
import type { Op } from "../src/interaction/operations.ts";
import { runOp } from "../src/interaction/runop.ts";
import { panelOf } from "../src/interaction/panels.ts";
import { appRows } from "../src/interaction/appmenu.ts";
import { apply } from "../src/operation/commands.ts";

await kernel.init();
const [XY, XZ] = [worldRef("XY"), worldRef("XZ")];
const volume = (s: Session): number => Object.values(scene(s).parts).reduce((t, p) => t + (p.kind === "body" ? (p.volume ?? 0) : 0), 0);
const bodies = (s: Session): number => Object.values(scene(s).parts).filter((p) => p.kind === "body").length;
const block = (): Session => {
  let s = createSession(kernel);
  const r = drawSquaredRectangle(scene(s), XY, [0, 0, 0], [40, 20, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  return run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: r.lines, params: { depth: 20 } } });
};
const stepOf = async (s: Session): Promise<string> => { const f = await exportFile(s, kernel, "step"); assert.ok(f.ok); return new TextDecoder().decode((f as { bytes: Uint8Array }).bytes); };
const piecesOf = (s: Session) => { const r = sketchPieces(scene(s), []); assert.ok(r.ok, r.ok ? "" : r.error); return (r as { pieces: Piece[] }).pieces; };

test("a STEP file is a body with no history: a block exported as STEP comes back as one body of the same volume and six faces, and one undo takes it away", async () => {
  const step = await stepOf(block());
  const r = importFile(createSession(kernel), "block.step", step);
  assert.ok(r.ok, r.ok ? "" : r.error);
  if (!r.ok) return;
  assert.ok(Math.abs(volume(r.session) - 16000) < 1e-3, `volume ${volume(r.session)}`);
  assert.equal(bodies(r.session), 1);
  assert.equal(Object.values(scene(r.session).parts).filter((p) => p.kind === "plane" && p.origin === "body").length, 6);
  assert.match(r.message, /imported block\.step: a body with no history/);
  assert.equal(scene(r.session).steps.at(-1)!.type, "import");
  assert.ok(panelOf("history", scene(r.session), [], r.session.outcome.errors)!.rows.filter((r) => !r.child).at(-1)!.label.includes("Import block.step"), "the history says what was imported");
  assert.equal(bodies(undoLast(r.session)), 0, "one step to undo");
});

test("an imported body can be pushed and pulled like any other, and is saved and opened with the file's text inside the project", async () => {
  const r = importFile(createSession(kernel), "block.step", await stepOf(block()));
  assert.ok(r.ok);
  if (!r.ok) return;
  const top = Object.values(scene(r.session).parts).find((p) => p.kind === "plane" && p.origin === "body" && Math.abs(p.at[2] - 20) < 1e-6 && !p.curved)!;
  const op = startOp(scene(r.session), [top.ref], "pushpull");
  assert.ok(op.ok, op.ok ? "" : op.why);
  const pulled = runOp(r.session, { ...(op as { op: Op }).op, value: 5 })!;
  assert.equal(pulled.session.message, null);
  assert.ok(Math.abs(volume(pulled.session) - 40 * 20 * 25) < 1e-3, `volume ${volume(pulled.session)}`);
  const reopened = openSession(kernel, saveText(pulled.session));
  assert.ok(reopened.ok, reopened.ok ? "" : reopened.error);
  if (reopened.ok) assert.ok(Math.abs(volume(reopened.value) - 20000) < 1e-3, "the same after saving and opening");
});

test("a second STEP stands beside the first as a body of its own", async () => {
  const step = await stepOf(block());
  const a = importFile(createSession(kernel), "a.step", step);
  assert.ok(a.ok);
  if (!a.ok) return;
  const b = importFile(a.session, "b.step", step);
  assert.ok(b.ok, b.ok ? "" : b.error);
  if (b.ok) { assert.equal(bodies(b.session), 2); assert.match(b.message, /a body with no history/); }
});

test("a file that is not STEP, a damaged STEP and a file of another kind are refused with the reason and change nothing", async () => {
  const s = block();
  const steps = scene(s).steps.length;
  for (const [name, text, why] of [["x.step", "hello", /not a STEP file/], ["x.step", "ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\n#1=GARBAGE;\nENDSEC;\nEND-ISO-10303-21;\n", /.+/], ["x.stl", "solid x", /imports STEP.*SVG and DXF/]] as const) {
    const r = importFile(s, name, text);
    assert.ok(!r.ok, name);
    if (!r.ok) assert.match(r.error, why);
  }
  assert.equal(scene(s).steps.length, steps);
});

test("STEP: the menu has Import…", () => {
  assert.ok(appRows("pan" as never, "", {}, false, 1, true, 0).some((r) => r.id === "import" && r.enabled));
});

// ---------- SVG ----------
test("SVG made by the app comes back as it was: a rectangle and a circle in the same places, the same sizes", () => {
  let s = createSession(kernel);
  s = run(s, drawSquaredRectangle(scene(s), XY, [5, 3, 0], [45, 23, 0], [1, 0, 0], [0, 1, 0]).command);
  s = run(s, drawCircle(scene(s), XY, [20, 10, 0], 4).command);
  const out = exportFlat(s, "svg");
  assert.ok(out.ok);
  if (!out.ok) return;
  const back = importFile(createSession(kernel), "sketch.svg", new TextDecoder().decode(out.bytes));
  assert.ok(back.ok, back.ok ? "" : back.error);
  if (!back.ok) return;
  const [a, b] = [piecesOf(s), piecesOf(back.session)];
  assert.equal(b.length, a.length);
  const [ba, bb] = [boundsOf(a)!, boundsOf(b)!];
  for (const k of [0, 1] as const) { assert.ok(Math.abs(ba.min[k] - bb.min[k]) < 1e-4 && Math.abs(ba.max[k] - bb.max[k]) < 1e-4, "the same box"); }
  assert.equal(b.filter((p) => p.k === "circle").length, 1);
  assert.equal(Object.values(scene(back.session).parts).filter((p) => p.kind === "face" && p.origin === "drawn").length, 2, "the rectangle closes into a figure, and the circle is a figure");
});

test("SVG arcs made by the app keep their radius, their direction and their ends", () => {
  let s = createSession(kernel);
  s = run(s, drawArc(scene(s), XY, [10, 0, 0], [0, 10, 0], [-10, 0, 0], [0, 0, 1])!.command);
  const out = exportFlat(s, "svg");
  assert.ok(out.ok);
  if (!out.ok) return;
  const back = importFile(createSession(kernel), "a.svg", new TextDecoder().decode(out.bytes));
  assert.ok(back.ok);
  if (!back.ok) return;
  const a = piecesOf(back.session)[0]!;
  assert.equal(a.k, "arc");
  if (a.k === "arc") { assert.ok(Math.abs(a.r - 10) < 1e-4); assert.ok(Math.abs(sweepOf(a) - Math.PI) < 1e-4, `a half turn counter-clockwise: ${sweepOf(a)}`); }
});

test("an SVG from another program: the viewBox and the units set the size, groups move and scale it, y is turned up, a rounded rectangle keeps its corners as arcs, a path has its arcs and a curve is made of lines (and said)", () => {
  const svg = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm" viewBox="0 0 200 100">
  <title>x</title><defs><rect id="gone" width="5" height="5"/></defs>
  <g transform="translate(20 10) scale(2)">
    <rect x="0" y="0" width="10" height="5"/>
  </g>
  <rect x="100" y="10" width="40" height="20" rx="4"/>
  <path d="M 10 90 L 30 90 A 10 10 0 0 1 50 90 Z"/>
  <path d="M 150 90 C 150 70 170 70 170 90"/>
  <text x="1" y="1">hi</text>
</svg>`;
  const r = parseSvg(svg);
  assert.ok(r.ok, r.ok ? "" : r.error);
  if (!r.ok) return;
  // 100 mm over 200 units: half a millimetre a unit; the first rectangle is at (10, -5) mm, 10 mm by 5 mm (y up: down in the picture is below zero)
  const sides = r.pieces.filter((p) => p.k === "seg");
  const box = boundsOf(r.pieces.slice(0, 4))!;
  assert.deepEqual([box.min, box.max].map((p) => p.map((v) => Math.round(v * 1e6) / 1e6)), [[10, -10], [20, -5]]);
  assert.equal(r.pieces.filter((p) => p.k === "arc").length, 4 + 1, "four rounded corners and the path's arc");
  const pathArc = r.pieces.filter((p) => p.k === "arc").at(-1)! as Extract<Piece, { k: "arc" }>;
  assert.ok(Math.abs(pathArc.r - 5) < 1e-9 && pathArc.ccw === false, "a radius of 10 units is 5 mm; sweep 1 is clockwise in the picture");
  assert.ok(sides.length > 8, "the curve is lines");
  assert.ok(r.notes.some((n) => /1 curve .*turned into short lines/.test(n)), r.notes.join("|"));
  assert.ok(r.notes.some((n) => /left out: 1 text/.test(n)), r.notes.join("|"));
});

test("an SVG with no size says pixels: 96 of them are an inch", () => {
  const r = parseSvg(`<svg xmlns="http://www.w3.org/2000/svg"><rect width="96" height="96"/></svg>`);
  assert.ok(r.ok);
  if (r.ok) { const b = boundsOf(r.pieces)!; assert.ok(Math.abs(b.max[0] - b.min[0] - 25.4) < 1e-9); }
});

test("an ellipse is lines (said), a circle under a uniform turn stays a circle, a circle under an uneven scale is lines", () => {
  const r = parseSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="10mm" height="10mm" viewBox="0 0 10 10"><ellipse cx="5" cy="5" rx="4" ry="2"/><circle cx="2" cy="2" r="1" transform="rotate(30) scale(2)"/><circle cx="2" cy="2" r="1" transform="scale(2 1)"/></svg>`);
  assert.ok(r.ok);
  if (!r.ok) return;
  const circles = r.pieces.filter((p) => p.k === "circle") as Extract<Piece, { k: "circle" }>[];
  assert.equal(circles.length, 1);
  assert.ok(Math.abs(circles[0]!.r - 2) < 1e-9, "scaled by two");
  assert.ok(r.notes.some((n) => /2 curves/.test(n)), r.notes.join("|"));
});

test("not an SVG, and an SVG with nothing to draw, are refused", () => {
  assert.ok(!parseSvg("hello").ok);
  const empty = parseSvg(`<svg xmlns="http://www.w3.org/2000/svg"><text>hi</text></svg>`);
  assert.ok(!empty.ok && /no lines, arcs or circles/.test(empty.error) && /1 text/.test(empty.error));
});

// ---------- DXF ----------
test("DXF made by the app comes back: lines, an arc and a circle with the same lengths", () => {
  let s = createSession(kernel);
  s = run(s, drawSquaredRectangle(scene(s), XY, [0, 0, 0], [40, 20, 0], [1, 0, 0], [0, 1, 0]).command);
  s = run(s, drawArc(scene(s), XY, [60, 0, 0], [70, 10, 0], [60, 20, 0], [0, 0, 1])!.command);
  s = run(s, drawCircle(scene(s), XY, [20, 10, 0], 4).command);
  const out = exportFlat(s, "dxf");
  assert.ok(out.ok);
  if (!out.ok) return;
  const back = importFile(createSession(kernel), "sketch.dxf", new TextDecoder().decode(out.bytes));
  assert.ok(back.ok, back.ok ? "" : back.error);
  if (!back.ok) return;
  const [a, b] = [piecesOf(s), piecesOf(back.session)];
  assert.equal(b.length, a.length);
  const len = (ps: Piece[]) => ps.reduce((t, p) => t + (p.k === "seg" ? Math.hypot(p.p[0] - p.q[0], p.p[1] - p.q[1]) : p.k === "circle" ? 2 * Math.PI * p.r : Math.abs(sweepOf(p)) * p.r), 0);
  assert.ok(Math.abs(len(a) - len(b)) < 1e-4, `${len(a)} and ${len(b)}`);
});

test("a DXF written by another program (ezdxf): lines, an arc, a circle, a polyline with a bulge, an ellipse and a spline come in; text and the rest are said to be left out", () => {
  const r = parseDxf(readFileSync(new URL("./fixtures/ezdxf-sample.dxf", import.meta.url), "utf8"));
  assert.ok(r.ok, r.ok ? "" : r.error);
  if (!r.ok) return;
  const kinds = (k: string) => r.pieces.filter((p) => p.k === k).length;
  assert.equal(kinds("circle"), 1);
  const arcs = r.pieces.filter((p) => p.k === "arc") as Extract<Piece, { k: "arc" }>[];
  assert.ok(arcs.some((a) => Math.abs(a.r - 20) < 1e-9 && a.ccw && Math.abs(sweepOf(a) - Math.PI) < 1e-9), "the half circle of radius 20");
  assert.ok(arcs.some((a) => Math.abs(a.r - 5) < 1e-9 && Math.abs(Math.abs(sweepOf(a)) - Math.PI) < 1e-9), "the bulge of 1 on a side of 10 is a half circle of radius 5");
  assert.ok(r.pieces.length > 40, "the ellipse and the spline are many short lines");
  assert.ok(r.notes.some((n) => /3 curves .*ellipses, splines/.test(n)), r.notes.join("|"));
  const has = (x: number, y: number) => r.pieces.some((p) => p.k === "seg" && ([p.p, p.q].some((q) => Math.abs(q[0] - x) < 1e-6 && Math.abs(q[1] - y) < 1e-6)));
  assert.ok(has(0, 70) && has(40, 70), "a spline with control points starts and ends where its control polygon does (checked against ezdxf's own curve to 0.01 mm outside the tests)");
  assert.ok(has(10, 50) && has(20, 40), "a spline fitted through points passes through them (and is smooth between: straight lines would cut the curve)");
  assert.ok(r.notes.some((n) => /left out: 1 TEXT/.test(n)), r.notes.join("|"));
  const b = boundsOf(r.pieces.filter((p) => p.k !== "circle"))!;
  assert.ok(b.min[0] <= 0.001 && b.max[0] >= 109, "from the block at the left to the ellipse");
});

test("DXF units are converted: a line one inch long is 25.4 mm; a binary or empty DXF is refused", () => {
  const dxf = (units: number) => `0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n${units}\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n0\nLINE\n8\n0\n10\n0\n20\n0\n11\n1\n21\n0\n0\nENDSEC\n0\nEOF\n`;
  const inch = parseDxf(dxf(1));
  assert.ok(inch.ok && Math.abs((inch.pieces[0] as Extract<Piece, { k: "seg" }>).q[0] - 25.4) < 1e-9 && inch.notes.some((n) => /converted to millimetres/.test(n)));
  const mm = parseDxf(dxf(4));
  assert.ok(mm.ok && (mm.pieces[0] as Extract<Piece, { k: "seg" }>).q[0] === 1);
  assert.ok(!parseDxf("AutoCAD Binary DXF\r\n\x1a\x00").ok);
  assert.ok(!parseDxf("hello\nworld\n").ok);
  const none = parseDxf(`0\nSECTION\n2\nENTITIES\n0\nTEXT\n8\n0\n0\nENDSEC\n0\nEOF\n`);
  assert.ok(!none.ok && /no lines, arcs or circles.*1 TEXT/.test(none.error));
});

// ---------- where a sketch goes ----------
test("a drawing goes on the XY plane, or on the selected plane, or on a flat face of a body (a plane of its own that goes with the body)", () => {
  const svg = svgText([{ k: "seg", p: [0, 0], q: [10, 0] }, { k: "seg", p: [10, 0], q: [10, 5] }, { k: "seg", p: [10, 5], q: [0, 0] }], "t");
  const cornerZ = (s: Session) => Object.values(scene(s).parts).filter((p) => p.kind === "corner" && p.origin === "drawn").map((p) => (p as unknown as { at: number[] }).at);
  const onXY = importFile(createSession(kernel), "t.svg", svg);
  assert.ok(onXY.ok);
  if (onXY.ok) { assert.ok(cornerZ(onXY.session).every((p) => p[2] === 0)); assert.equal(Object.values(scene(onXY.session).parts).filter((p) => p.kind === "face" && p.origin === "drawn").length, 1, "a closed triangle is a figure"); }
  const sel = (s: Session, refs: string[]): Session => ({ ...s, click: { ...s.click, selection: refs as never } });
  const onXZ = importFile(sel(createSession(kernel), [XZ]), "t.svg", svg);
  assert.ok(onXZ.ok);
  if (onXZ.ok) assert.ok(cornerZ(onXZ.session).every((p) => p[1] === 0) && cornerZ(onXZ.session).some((p) => p[0] === 10 && p[2] === 5), "x along X and y along Z on the XZ plane");
  const b = block();
  const top = Object.values(scene(b).parts).find((p) => p.kind === "plane" && p.origin === "body" && Math.abs(p.at[2] - 20) < 1e-6 && !p.curved)!;
  assert.equal(importPlane(scene(b), [top.ref]), top.ref);
  const onTop = importFile(sel(b, [top.ref]), "t.svg", svg);
  assert.ok(onTop.ok, onTop.ok ? "" : onTop.error);
  if (onTop.ok) { const zs = cornerZ(onTop.session).filter((p) => p[2] === 20); assert.equal(zs.length, 3, "on the face, 20 up"); assert.ok(Object.values(scene(onTop.session).parts).some((p) => p.kind === "plane" && p.origin === "drawn" && p.onBody), "the plane goes with the body"); }
  void sketchCommand;
});

test("a drawing of two thousand pieces is imported in about a second (a batch of added parts was quadratic: it took six)", () => {
  const pieces: Piece[] = [];
  for (let i = 0; i < 2000; i++) { const x = (i % 50) * 3, y = Math.floor(i / 50) * 3; pieces.push({ k: "seg", p: [x, y], q: [x + 2, y] }); }
  const t0 = performance.now();
  const r = importFile(createSession(kernel), "big.svg", svgText(pieces, "big"));
  const ms = performance.now() - t0;
  assert.ok(r.ok, r.ok ? "" : r.error);
  assert.ok(ms < 5000, `took ${ms.toFixed(0)} ms`);
});

test("a batch of added parts is the same as the parts added one after another (the run of them is added to one copy), with the same refusals", () => {
  const s0 = scene(block());
  const pl = Object.values(s0.parts).find((p) => p.kind === "plane" && p.origin === "world")!.ref;
  const base = { origin: "drawn" as const, plane: pl, movable: true };
  const cmds: import("../src/operation/commands.ts").Command[] = [];
  for (let i = 0; i < 40; i++) cmds.push({ type: "addPart", part: { ...base, ref: `d/q_${900 + i}.p`, kind: "corner", at: [i, 0, 0] } as never });
  cmds.push({ type: "addPart", part: { ...base, ref: "d/q_950.s", kind: "line", a: "d/q_900.p", b: "d/q_901.p" } as never });
  cmds.push({ type: "addRelation", relation: { id: "r_77", kind: "arcEnds", parts: ["d/q_950.s", "d/q_900.p"] } } as never);
  cmds.push({ type: "addPart", part: { ...base, ref: "d/q_951.s", kind: "line", a: "d/q_902.p", b: "d/q_903.p" } as never });
  const one = cmds.reduce<ReturnType<typeof apply>>((acc, c) => (acc.ok ? apply(acc.value, c) : acc), { ok: true, value: s0 } as never);
  const all = apply(s0, { type: "batch", commands: cmds });
  assert.ok(one.ok && all.ok);
  if (one.ok && all.ok) assert.deepEqual(all.value, one.value);
  // refusals: a name already there, a point that is not there, a plane that is not there; the scene is unchanged (all or nothing)
  const bad = (part: object) => apply(s0, { type: "batch", commands: [cmds[0]!, { type: "addPart", part } as never] });
  assert.ok(!bad({ ...base, ref: "d/q_900.p", kind: "corner", at: [0, 0, 0] }).ok, "the name is taken (by the first of the batch)");
  assert.ok(!bad({ ...base, ref: "d/q_960.s", kind: "line", a: "d/q_900.p", b: "d/q_999.p" }).ok, "a corner that is not there");
  assert.ok(!bad({ ...base, plane: "p_nowhere", ref: "d/q_961.p", kind: "corner", at: [0, 0, 0] }).ok, "a plane that is not there");
  assert.equal(Object.keys(s0.parts).includes("d/q_900.p"), false, "the scene it started from is untouched");
});
