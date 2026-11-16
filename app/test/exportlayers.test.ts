// Layers in the SVG and DXF writers (`in_563`, `dec_export_flat`): when pieces say what they are for, a file carries the layers: SVG groups in the usual colours, a DXF layer table; with none it is the old one-layer file.
// (Until `in_603` the ring marked drawn lines; the modeler no longer knows what a line is for, `prin_manufacture_agnostic`, so the app's own exports have no layers: a route that writes such a file, or a file read with layers, has them.)
import test from "node:test";
import assert from "node:assert/strict";
import { svgText, dxfText, scaledPieces, movedPieces, hasLayers } from "../src/compiler/flatfile.ts";
import type { Piece } from "../src/compiler/flatfile.ts";
import { parseDxf, parseSvg } from "../src/compiler/flatparse.ts";

const text = (b: Uint8Array) => new TextDecoder().decode(b);

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
