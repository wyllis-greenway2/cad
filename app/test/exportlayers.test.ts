// Layers in the SVG and DXF export (`in_563`, `dec_export_flat`, `dec_manufacturing_prep`): a drawn line or circle can be marked cut, score or engrave from the ring menu (one step to undo),
// and an exported file then carries the layers: SVG groups in the usual colours, a DXF layer table. A drawing with nothing marked exports exactly as before.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import { drawRectangle, drawCircle } from "../src/operation/build.ts";
import { loopFaceRef } from "../src/operation/loops.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import type { AppState } from "../src/interaction/controller.ts";
import { homeCamera } from "../src/interaction/camera.ts";
import { exportFlat, sketchPieces } from "../src/interaction/exportsketch.ts";
import { svgText, dxfText, scaledPieces, movedPieces, hasLayers } from "../src/compiler/flatfile.ts";
import type { Piece } from "../src/compiler/flatfile.ts";
import { parseDxf, parseSvg } from "../src/compiler/flatparse.ts";

await kernel.init();
const env = { w: 800, h: 600, now: 0 } as never;
const XY = worldRef("XY");
const text = (b: Uint8Array) => new TextDecoder().decode(b);

function drawing() {
  let s = createSession(kernel);
  const r = drawRectangle(scene(s), XY, [0, 0, 0], [40, 20, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  const c = drawCircle(scene(s), XY, [10, 10, 0], 4);
  s = run(s, c.command);
  const state = (refs: string[], from = s): AppState => ({ ...createState({ ...from, click: { ...from.click, selection: refs as never } }), cam: homeCamera() });
  return { s, r, c, state };
}

const layered: Piece[] = [
  { k: "seg", p: [0, 0], q: [40, 0], layer: "cut" }, { k: "seg", p: [40, 0], q: [40, 20], layer: "cut" }, { k: "seg", p: [40, 20], q: [0, 0], layer: "cut" },
  { k: "seg", p: [5, 5], q: [35, 5], layer: "score" }, { k: "circle", c: [10, 10], r: 2, layer: "engrave" },
];

test("SVG with layers: a group for each, in its colour, named for the layer; without layers the file is the old one-group file", () => {
  const svg = svgText(layered, "t");
  assert.match(svg, /<g id="cut"[^>]*stroke="#ff0000"/);
  assert.match(svg, /<g id="score"[^>]*stroke="#0000ff"/);
  assert.match(svg, /<g id="engrave"[^>]*stroke="#000000"/);
  assert.match(svg, /inkscape:groupmode="layer"/);
  assert.equal((svg.match(/<g /g) ?? []).length, 3);
  assert.ok(svg.indexOf('id="cut"') < svg.indexOf('id="score"') && svg.indexOf('id="score"') < svg.indexOf('id="engrave"'), "cut first, then score, then engrave");
  const plain = svgText(layered.map(({ layer: _l, ...p }) => p as Piece), "t");
  assert.equal((plain.match(/<g /g) ?? []).length, 1);
  assert.doesNotMatch(plain, /inkscape/);
  assert.equal(hasLayers(layered), true);
});

test("pieces that meet are joined only within their own layer", () => {
  const two: Piece[] = [{ k: "seg", p: [0, 0], q: [10, 0], layer: "cut" }, { k: "seg", p: [10, 0], q: [10, 10], layer: "score" }];
  const svg = svgText(two, "t");
  assert.equal((svg.match(/<path /g) ?? []).length, 2, "a cut and a score that touch are two paths, in two groups");
});

test("DXF with layers: a layer table with the colours, and each entity on its layer", () => {
  const dxf = dxfText(layered);
  assert.match(dxf, /^TABLES$/m);
  const names = [...dxf.matchAll(/^LAYER\n2\n(\w+)\n70\n0\n62\n(\d+)/gm)].map((m) => `${m[1]}:${m[2]}`);
  assert.deepEqual(names, ["CUT:1", "SCORE:5", "ENGRAVE:7"]);
  assert.match(dxf, /^LINE\n8\nCUT$/m);
  assert.match(dxf, /^LINE\n8\nSCORE$/m);
  assert.match(dxf, /^CIRCLE\n8\nENGRAVE$/m);
  assert.doesNotMatch(dxfText(layered.map(({ layer: _l, ...p }) => p as Piece)), /^TABLES$/m, "no layers, no table: the old file");
});

test("the layer stays when the pieces are scaled to inches or moved", () => {
  assert.deepEqual(scaledPieces(layered, 1 / 25.4).map((p) => p.layer), ["cut", "cut", "cut", "score", "engrave"]);
  assert.deepEqual(movedPieces(layered, [1, 1]).map((p) => p.layer), ["cut", "cut", "cut", "score", "engrave"]);
});

test("the ring offers Layer with Cut, Score and Engrave: dimmed with the reason with nothing drawn selected, live with a figure or a circle", () => {
  const { s, r, c, state } = drawing();
  const ring = (st: AppState) => reduce(st, { type: "menu", x: 400, y: 300, button: true }, env).menu!.items.find((i) => i.id === "layer")!;
  const none = ring(state([], s));
  assert.deepEqual(none.children!.map((i) => [i.id, i.label]), [["use:cut", "Cut"], ["use:score", "Score"], ["use:engrave", "Engrave"]]);
  const nothing = createState(createSession(kernel));
  assert.equal(ring({ ...nothing, cam: homeCamera() }).children!.every((i) => !i.enabled && i.why === "select a drawn figure, line or circle first"), true);
  assert.equal(ring(state([loopFaceRef(r.lines)])).children!.every((i) => i.enabled), true);
  assert.equal(ring(state([c.circle])).children!.every((i) => i.enabled), true);
});

test("marking a figure as score marks its lines and the hole in it in one step; undo takes it back; cut clears the mark", () => {
  const { r, c, state } = drawing();
  let st = state([loopFaceRef(r.lines)]);
  st = reduce(st, { type: "runAction", id: "use:score" }, env);
  assert.match(st.session.message ?? "", /5 lines marked score/);
  for (const l of [...r.lines, c.circle]) assert.equal((scene(st.session).parts[l] as { use?: string }).use, "score");
  const undone = reduce(st, { type: "runAction", id: "undo" }, env);
  for (const l of [...r.lines, c.circle]) assert.equal((scene(undone.session).parts[l] as { use?: string }).use, undefined);
  const back = reduce(st, { type: "runAction", id: "use:cut" }, env);
  for (const l of r.lines) assert.equal("use" in scene(back.session).parts[l]!, false, "cut is the usual and is stored as nothing");
});

test("an export with something marked carries the layers; with nothing marked it has none; unmarked pieces are cut", () => {
  const { r, c, state } = drawing();
  const plain = exportFlat(state([]).session, "svg");
  assert.ok(plain.ok);
  if (plain.ok) { assert.doesNotMatch(text(plain.bytes), /inkscape/); assert.doesNotMatch(plain.message, /layers/); }
  let st = state([c.circle]);
  st = reduce(st, { type: "runAction", id: "use:engrave" }, env);
  const out = exportFlat({ ...st.session, click: { ...st.session.click, selection: [] } }, "svg");
  assert.ok(out.ok);
  if (out.ok) {
    const svg = text(out.bytes);
    assert.match(svg, /<g id="cut"[^>]*>\n<path/);
    assert.match(svg, /<g id="engrave"[^>]*>\n<circle cx="10" cy="-10" r="4"\/>/);
    assert.match(out.message, /in layers/);
  }
  const got = sketchPieces(scene(st.session), []);
  assert.ok(got.ok);
  if (got.ok) assert.deepEqual(got.pieces.map((p) => p.layer).sort(), ["cut", "cut", "cut", "cut", "engrave"]);
  assert.equal(r.lines.length, 4);
});

test("a layer is not marked on something that is not drawn: a body's face or the world's plane says what to select", () => {
  const { s, state } = drawing();
  const st = reduce(state([XY], s), { type: "runAction", id: "use:score" }, env);
  assert.equal(st.session.message, "select a drawn figure, line or circle first");
});

test("our own importer reads a layered file back: the same pieces (the layers are not read back yet)", () => {
  const flat = layered.map(({ layer: _l, ...p }) => p as Piece);
  const total = (ps: readonly Piece[]) => ps.reduce((n, p) => n + (p.k === "circle" ? 2 * Math.PI * p.r : Math.hypot(p.q[0] - p.p[0], p.q[1] - p.p[1])), 0);
  const dxf = parseDxf(dxfText(layered));
  const svg = parseSvg(svgText(layered, "t"));
  assert.ok(dxf.ok && svg.ok);
  if (dxf.ok && svg.ok) {
    assert.equal(dxf.pieces.length, 5);
    assert.ok(Math.abs(total(dxf.pieces) - total(flat)) < 1e-3, "the DXF comes back as long as it went");
    assert.ok(Math.abs(total(svg.pieces) - total(flat)) < 1e-3, "the SVG comes back as long as it went");
  }
});
