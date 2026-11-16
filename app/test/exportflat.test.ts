// SVG and DXF export of a flat drawing (`dec_export_flat`, `in_491`).
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { drawSquaredRectangle, drawCircle, drawArc } from "../src/operation/build.ts";
import { nextId } from "../src/operation/scene.ts";
import { exportFlat, sketchPieces, canExportFlat } from "../src/interaction/exportsketch.ts";
import { svgText, dxfText, runsOf, boundsOf, sweepOf } from "../src/compiler/flatfile.ts";
import type { Piece } from "../src/compiler/flatfile.ts";
import { startOp } from "../src/interaction/operations.ts";
import type { Op } from "../src/interaction/operations.ts";
import { runOp } from "../src/interaction/runop.ts";
import { loopFaceRef } from "../src/operation/loops.ts";
import { appRows } from "../src/interaction/appmenu.ts";

await kernel.init();
const [XY, XZ] = [worldRef("XY"), worldRef("XZ")];
const select = (s: Session, refs: string[]): Session => ({ ...s, click: { ...s.click, selection: refs as never } });
const text = (b: Uint8Array) => new TextDecoder().decode(b);
const rect: Piece[] = [{ k: "seg", p: [0, 0], q: [40, 0] }, { k: "seg", p: [40, 0], q: [40, 20] }, { k: "seg", p: [40, 20], q: [0, 20] }, { k: "seg", p: [0, 20], q: [0, 0] }];

test("pieces that meet end to end are one run, closed when it comes round, whichever way each was drawn", () => {
  const shuffled: Piece[] = [rect[2]!, { k: "seg", p: [0, 0], q: [0, 20] }, rect[0]!, { k: "seg", p: [40, 20], q: [40, 0] }];
  const runs = runsOf(shuffled);
  assert.equal(runs.length, 1);
  assert.equal(runs[0]!.closed, true);
  assert.equal(runs[0]!.items.length, 4);
  assert.equal(runsOf([rect[0]!, rect[1]!]).at(0)!.closed, false, "two sides of a rectangle are an open run");
  assert.equal(runsOf([...rect, { k: "seg", p: [100, 100], q: [110, 100] }]).length, 2, "a separate piece is its own run");
});

test("SVG: a rectangle is one closed path, in mm, with the picture the same way up (y turned over)", () => {
  const svg = svgText(rect, "r");
  assert.match(svg, /width="42mm" height="22mm" viewBox="-1 -21 42 22"/);
  assert.match(svg, /<path d="M 0 0 L 40 0 L 40 -20 L 0 -20 L 0 0 Z"\/>/);
});

test("arcs: a counter-clockwise quarter turn and a clockwise one get opposite sweep flags in SVG, and the DXF arc always runs counter-clockwise", () => {
  const ccw: Piece = { k: "arc", c: [0, 0], r: 10, p: [10, 0], q: [0, 10], ccw: true };
  const cw: Piece = { k: "arc", c: [0, 0], r: 10, p: [0, 10], q: [10, 0], ccw: false };
  assert.ok(Math.abs(sweepOf(ccw as never) - Math.PI / 2) < 1e-9);
  assert.ok(Math.abs(sweepOf(cw as never) + Math.PI / 2) < 1e-9);
  assert.match(svgText([ccw], "a"), /A 10 10 0 0 0 0 -10/);
  assert.match(svgText([cw], "a"), /A 10 10 0 0 1 10 0/);
  const d1 = dxfText([ccw]).split("\n"), d2 = dxfText([cw]).split("\n");
  const angles = (d: string[]) => [d[d.indexOf("50") + 1], d[d.indexOf("51") + 1]];
  assert.deepEqual(angles(d1), ["0", "90"]);
  assert.deepEqual(angles(d2), ["0", "90"], "the clockwise arc is the same arc, written from its other end");
  const b = boundsOf([ccw])!;
  assert.deepEqual([b.min, b.max].map((p) => p.map((v) => Math.round(v * 1e6) / 1e6)), [[0, 0], [10, 10]], "the box of a quarter arc is the quarter's box");
});

test("DXF: the old plain form with units in mm, a LINE for each side, a CIRCLE for a circle, and an end", () => {
  const d = dxfText([...rect, { k: "circle", c: [5, 5], r: 2 }]);
  assert.match(d, /\$ACADVER\n1\nAC1009/);
  assert.match(d, /\$INSUNITS\n70\n4/);
  assert.equal((d.match(/^LINE$/gm) ?? []).length, 4);
  assert.equal((d.match(/^CIRCLE$/gm) ?? []).length, 1);
  assert.ok(d.endsWith("0\nEOF\n"));
});

test("a drawn rectangle and a circle export as they were drawn; the menu items follow what there is", () => {
  let s = createSession(kernel);
  assert.equal(canExportFlat(s), false);
  assert.deepEqual(exportFlat(s, "svg"), { ok: false, error: "nothing to export yet: draw something, or select a sketch or a flat face of a body" });
  s = run(s, drawSquaredRectangle(scene(s), XY, [0, 0, 0], [40, 20, 0], [1, 0, 0], [0, 1, 0]).command);
  s = run(s, drawCircle(scene(s), XY, [10, 10, 0], 4).command);
  assert.equal(canExportFlat(s), true);
  const svg = exportFlat(s, "svg");
  assert.ok(svg.ok);
  if (!svg.ok) return;
  assert.equal(svg.name, "sketch.svg");
  assert.equal(svg.mime, "image/svg+xml");
  assert.match(text(svg.bytes), /<circle cx="10" cy="-10" r="4"\/>/);
  assert.equal((text(svg.bytes).match(/<path /g) ?? []).length, 1, "the four sides are one path");
  assert.match(svg.message, /5 pieces, 40 × 20 mm/);
  const dxf = exportFlat(s, "dxf");
  assert.ok(dxf.ok);
  if (dxf.ok) { assert.equal((text(dxf.bytes).match(/^LINE$/gm) ?? []).length, 4); assert.equal((text(dxf.bytes).match(/^CIRCLE$/gm) ?? []).length, 1); }
  const rows = (can: boolean) => appRows("pan" as never, "", { undo: false, redo: false, export: can }, false, false, 1, true, 0).filter((r) => r.id === "export").map((r) => r.enabled);
  assert.deepEqual(rows(true), [true]);
  assert.deepEqual(rows(false), [false]);
});

test("a sketch on a plane that is not XY is exported in the plane's own x and y", () => {
  let s = createSession(kernel);
  s = run(s, drawSquaredRectangle(scene(s), XZ, [5, 0, 3], [25, 0, 13], [1, 0, 0], [0, 0, 1]).command);
  const r = sketchPieces(scene(s), []);
  assert.ok(r.ok);
  if (!r.ok) return;
  const b = boundsOf(r.pieces)!;
  const size = [b.max[0] - b.min[0], b.max[1] - b.min[1]].map((v) => Math.round(v * 1e6) / 1e6);
  assert.deepEqual(size, [20, 10]);
});

test("only what is selected is exported; sketches on two planes without a selection are refused, with the reason", () => {
  let s = createSession(kernel);
  const a = drawSquaredRectangle(scene(s), XY, [0, 0, 0], [40, 20, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, a.command);
  const c = drawCircle(scene(s), XY, [60, 10, 0], 5);
  s = run(s, c.command);
  const only = sketchPieces(scene(s), [c.circle]);
  assert.ok(only.ok && only.pieces.length === 1 && only.pieces[0]!.k === "circle", "the circle alone");
  const sides = sketchPieces(scene(s), a.lines);
  assert.ok(sides.ok && sides.pieces.length === 4, "the four sides alone");
  s = run(s, drawSquaredRectangle(scene(s), XZ, [0, 0, 0], [10, 0, 10], [1, 0, 0], [0, 0, 1]).command);
  const both = sketchPieces(scene(s), []);
  assert.ok(!both.ok && /2 planes/.test(both.error), both.ok ? "" : both.error);
});

test("an arc drawn by three points is exported as an arc with the right radius", () => {
  let s = createSession(kernel);
  const arc = drawArc(scene(s), XY, [10, 0, 0], [0, 10, 0], [-10, 0, 0], [0, 0, 1])!;
  s = run(s, arc.command);
  const r = sketchPieces(scene(s), []);
  assert.ok(r.ok);
  if (!r.ok) return;
  const a = r.pieces[0]!;
  assert.equal(a.k, "arc");
  if (a.k === "arc") { assert.ok(Math.abs(a.r - 10) < 1e-6); assert.ok(Math.abs(Math.abs(sweepOf(a)) - Math.PI) < 1e-6, "half a circle"); }
});

test("a flat face of a body is exported as its outline: the top of a block with a round hole is a rectangle and the hole", () => {
  let s = createSession(kernel);
  const r = drawSquaredRectangle(scene(s), XY, [0, 0, 0], [40, 20, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  const c = drawCircle(scene(s), XY, [20, 10, 0], 4);
  s = run(s, c.command);
  const op = startOp(scene(s), [loopFaceRef(r.lines)], "extrude");
  assert.ok(op.ok);
  s = runOp(s, { ...(op as { op: Op }).op, value: 10 })!.session; // (the circle inside is a hole in the figure)
  const top = Object.values(scene(s).parts).find((p) => p.kind === "plane" && p.origin === "body" && !p.curved && Math.abs(p.at[2] - 10) < 1e-6)!;
  const out = sketchPieces(scene(s), [top.ref]);
  assert.ok(out.ok, out.ok ? "" : out.error);
  if (!out.ok) return;
  assert.equal(out.pieces.filter((p) => p.k === "seg").length, 4, "the four sides");
  assert.ok(out.pieces.some((p) => p.k === "arc"), "and the hole's arcs");
  const b = boundsOf(out.pieces)!;
  assert.deepEqual([b.max[0] - b.min[0], b.max[1] - b.min[1]].map((v) => Math.round(v * 1e6) / 1e6), [40, 20]);
  assert.ok(!sketchPieces(scene(s), [top.ref, c.circle]).ok, "a face and a sketch together are refused");
});

test("a body selected whole has no flat drawing: it says what to select", () => {
  let s = createSession(kernel);
  const r = drawSquaredRectangle(scene(s), XY, [0, 0, 0], [40, 20, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: r.lines, params: { depth: 10 } } });
  const body = Object.values(scene(s).parts).find((p) => p.kind === "body")!;
  const out = sketchPieces(scene(s), [body.ref]);
  assert.ok(!out.ok && /select a sketch or a flat face/.test(out.error));
});
