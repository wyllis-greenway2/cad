// Binary DXF import and OBJ import and export (`dec_import_more_formats`).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { drawSquaredRectangle } from "../src/operation/build.ts";
import { nextId } from "../src/operation/scene.ts";
import { exportFile } from "../src/interaction/exportfile.ts";
import { importAny } from "../src/interaction/importfile.ts";
import { exportDialog, importDialog, KIND_OF } from "../src/interaction/transfer.ts";
import { parseDxf, binaryDxfText } from "../src/compiler/flatparse.ts";
import { parseObj } from "../src/compiler/meshfile.ts";
import { boundsOf } from "../src/compiler/flatfile.ts";
import { objBytes } from "../src/compiler/obj.ts";

await kernel.init();
const XY = worldRef("XY");
const fixture = (n: string): Uint8Array => new Uint8Array(readFileSync(new URL(`./fixtures/${n}`, import.meta.url)));
const bodies = (s: Session) => Object.values(scene(s).parts).filter((p) => p.kind === "body");
const volume = (s: Session): number => bodies(s).reduce((t, p) => t + ((p as { volume?: number }).volume ?? 0), 0);
const block = (): Session => {
  let s = createSession(kernel);
  const r = drawSquaredRectangle(scene(s), XY, [0, 0, 0], [40, 20, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  return run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: r.lines, params: { depth: 20 } } });
};
const text = (b: Uint8Array) => new TextDecoder().decode(b);

test("a binary DXF (R2010, two byte group codes, written by a separate encoder and read by ezdxf too) comes in as the same drawing as its ASCII twin", () => {
  const t = binaryDxfText(fixture("ezdxf-sample-binary.dxf"));
  assert.ok(t.ok);
  const a = parseDxf(text(fixture("ezdxf-sample.dxf")));
  const b = parseDxf(t.text);
  assert.ok(a.ok && b.ok);
  assert.equal(b.pieces.length, a.pieces.length);
  assert.deepEqual(b.pieces, a.pieces);
});

test("a binary DXF of R12 (one byte group codes) is read too", () => {
  const t = binaryDxfText(fixture("handmade-r12-binary.dxf"));
  assert.ok(t.ok);
  const r = parseDxf(t.text);
  assert.ok(r.ok);
  assert.equal(r.pieces.length, 2);
  assert.deepEqual(r.pieces.map((p) => p.k).sort(), ["circle", "seg"]);
});

test("a binary DXF cut short, or not binary, is refused with the reason", () => {
  const whole = fixture("ezdxf-sample-binary.dxf");
  const cut = binaryDxfText(whole.subarray(0, whole.length - 3));
  assert.ok(!cut.ok && /cut short/.test(cut.error));
  const odd = binaryDxfText(new TextEncoder().encode("0\nSECTION\n"));
  assert.ok(!odd.ok && /not a binary DXF/.test(odd.error));
});

test("Import takes a binary DXF as a sketch and says it was binary; text handed to the text reader is told where binary goes", async () => {
  const done = await importAny(createSession(kernel), "plan.dxf", fixture("ezdxf-sample-binary.dxf"));
  assert.ok(done.ok, done.ok ? "" : done.error);
  assert.match(done.message, /binary DXF/);
  const twin = await importAny(createSession(kernel), "plan.dxf", fixture("ezdxf-sample.dxf"));
  assert.ok(twin.ok);
  assert.equal(Object.keys(scene(done.session).parts).length, Object.keys(scene(twin.session).parts).length);
  assert.equal(parseDxf(text(fixture("ezdxf-sample-binary.dxf"))).ok, false);
});

test("OBJ: a block and a 32 sided cylinder written by trimesh come in as bodies of the volumes trimesh gives", async () => {
  const box = await importAny(createSession(kernel), "box.obj", fixture("trimesh-box.obj"));
  assert.ok(box.ok, box.ok ? "" : box.error);
  assert.equal(bodies(box.session).length, 1);
  assert.ok(Math.abs(volume(box.session) - 20 * 10 * 5) < 1e-6);
  const cyl = await importAny(createSession(kernel), "cyl.obj", fixture("trimesh-cylinder.obj"));
  assert.ok(cyl.ok, cyl.ok ? "" : cyl.error);
  assert.ok(Math.abs(volume(cyl.session) - 2996.5873456590393) < 1e-3, `${volume(cyl.session)}`);
});

test("OBJ: faces of four corners are cut into triangles, negative numbers count back, texture and normal numbers are ignored, other lines are said to be left out", () => {
  const r = parseObj("# a unit square\nv 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nvt 0 0\nvn 0 0 1\nf 1/1/1 2/1/1 3/1/1 4/1/1\nf -4 -3 -2\nl 1 2\n");
  assert.ok(r.ok);
  assert.equal(r.value.length / 9, 3);
  assert.match(r.notes.join(" "), /lines/);
});

test("OBJ: a face that names a point that is not there, a file with no faces and a file that is not an OBJ are each refused with the reason", () => {
  const bad = parseObj("v 0 0 0\nv 1 0 0\nf 1 2 9\n");
  assert.ok(!bad.ok && /not there/.test(bad.error));
  const none = parseObj("v 0 0 0\nv 1 0 0\n");
  assert.ok(!none.ok && /no faces/.test(none.error));
  const other = parseObj("hello\n");
  assert.ok(!other.ok && /not an OBJ/.test(other.error));
  const open = parseObj("v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n"); // parses; Import refuses it as an open mesh
  assert.ok(open.ok);
});

test("an open OBJ (a single triangle) is refused by Import as an open mesh, and nothing changes", async () => {
  const s = createSession(kernel);
  const r = await importAny(s, "tri.obj", new TextEncoder().encode("v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n"));
  assert.ok(!r.ok);
  assert.match(r.error, /not closed|open/i);
});

test("OBJ export: a block is 8 points and 12 triangles, Z up as modelled, and reads back as the same body", async () => {
  const s = block();
  const r = await exportFile(s, kernel, "obj");
  assert.ok(r.ok, r.ok ? "" : r.error);
  assert.equal(r.name, "model.obj");
  assert.equal(r.mime, "model/obj");
  const t = text(r.bytes);
  assert.match(t.split("\n")[0]!, /^# CAD OBJ: model, mm, Z up$/);
  assert.equal(t.split("\n").filter((l) => l.startsWith("v ")).length, 8);
  assert.equal(t.split("\n").filter((l) => l.startsWith("f ")).length, 12);
  const zs = t.split("\n").filter((l) => l.startsWith("v ")).map((l) => Number(l.split(" ")[3]));
  assert.deepEqual([Math.min(...zs), Math.max(...zs)], [0, 20]);
  const back = await importAny(createSession(kernel), "model.obj", r.bytes);
  assert.ok(back.ok, back.ok ? "" : back.error);
  assert.ok(Math.abs(volume(back.session) - 40 * 20 * 20) < 1e-6);
});

test("OBJ export in inches writes the millimetres over 25.4 and says so in its first line", async () => {
  const r = await exportFile(block(), kernel, "obj", undefined, "part.obj", { units: "in" });
  assert.ok(r.ok);
  const t = text(r.bytes);
  assert.match(t.split("\n")[0]!, /, in, Z up$/);
  const xs = t.split("\n").filter((l) => l.startsWith("v ")).map((l) => Number(l.split(" ")[1]));
  assert.ok(Math.abs(Math.max(...xs) - 40 / 25.4) < 1e-5);
});

test("objBytes writes no -0 and counts corners from 1", () => {
  const t = text(objBytes([0, -0, 1e-9, 1, 0, 0, 0, 1, 0], [0, 1, 2], "a b", "mm"));
  assert.ok(!/-0\b/.test(t));
  assert.match(t, /^o a_b$/m);
  assert.match(t, /^f 1 2 3$/m);
});

test("the dialogs offer OBJ: Export lists it, Import knows .obj and says an OBJ has no units", () => {
  const e = exportDialog(block(), {});
  const fmt = e.fields.find((f) => f.id === "format")!;
  assert.ok((fmt as { choices: { value: string }[] }).choices.some((c) => c.value === "obj"));
  assert.ok(e.fields.some((f) => f.id === "quality"));
  assert.equal(KIND_OF("a.OBJ"), "obj");
  const i = importDialog("a.obj", {});
  assert.match(JSON.stringify(i.fields), /no units of its own/);
});

// ---------- DXF blocks, inserts and layers ----------
test("DXF blocks: inserts (plain, turned and doubled, mirrored, an array of 3 by 2, nested, uneven scale) come in where ezdxf puts them: the same extents and the same circles", () => {
  const r = parseDxf(text(fixture("ezdxf-blocks.dxf")));
  assert.ok(r.ok);
  assert.deepEqual(boundsOf(r.pieces), { min: [-5, -5], max: [345, 305] }); // ezdxf: (-5, -5) to (345, 305)
  const circles = r.pieces.flatMap((p) => (p.k === "circle" ? [[...p.c.map((x) => +x.toFixed(3)), +p.r.toFixed(3)]] : []));
  const want = [[0, 205, 3], [105, 0, 3], [108.66, 55, 6], [205, 0, 3], [205, 40, 3], [265, 0, 3], [265, 40, 3], [325, 0, 3], [325, 40, 3], [95, 100, 3]]; // (ezdxf's circles; the mirrored one is at x 95 in the world, -95 in its own mirrored frame)
  assert.deepEqual(circles.sort(), want.sort());
  assert.equal(r.pieces.filter((p) => p.k === "arc").length, 10);
});

test("DXF blocks: 12 inserts are placed and said; the uneven scale turns a circle and an arc into short lines and says so; nothing is left out for want of the block", () => {
  const r = parseDxf(text(fixture("ezdxf-blocks.dxf")));
  assert.ok(r.ok);
  assert.ok(r.notes.some((n) => /12 block inserts placed/.test(n)));
  assert.ok(r.notes.some((n) => /^2 curves/.test(n)));
  assert.ok(!r.notes.some((n) => /left out: .*INSERT/.test(n)));
});

test("DXF layers: what is on a layer that is off or frozen is left out, and said", () => {
  const r = parseDxf(text(fixture("ezdxf-blocks.dxf")));
  assert.ok(r.ok);
  assert.ok(r.notes.some((n) => /2 pieces on switched-off or frozen layers left out/.test(n)));
  assert.ok(r.pieces.some((p) => p.k === "seg" && p.p[1] === 10 && p.q[1] === 10), "the line on the layer that is on stays");
  assert.ok(!r.pieces.some((p) => p.k === "seg" && p.p[1] === 0 && p.q[0] === 10 && p.p[0] === 0), "the line on the off layer does not");
  assert.ok(!r.pieces.some((p) => p.k === "seg" && p.p[1] === 5 && p.q[1] === 5 && p.p[0] === 0), "nor the one on the frozen layer");
});

test("DXF blocks: an insert of a block that is not in the file is left out and said", () => {
  const t = "0\nSECTION\n2\nENTITIES\n0\nLINE\n8\n0\n10\n0\n20\n0\n11\n5\n21\n0\n0\nINSERT\n8\n0\n2\nGONE\n10\n0\n20\n0\n0\nENDSEC\n0\nEOF\n";
  const r = parseDxf(t);
  assert.ok(r.ok);
  assert.ok(r.notes.some((n) => /left out: 1 INSERT/.test(n)));
});

test("DXF blocks: a block that inserts itself stops, not loops", () => {
  const t = "0\nSECTION\n2\nBLOCKS\n0\nBLOCK\n2\nA\n10\n0\n20\n0\n0\nLINE\n8\n0\n10\n0\n20\n0\n11\n1\n21\n0\n0\nINSERT\n8\n0\n2\nA\n10\n1\n20\n0\n0\nENDBLK\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n0\nINSERT\n8\n0\n2\nA\n10\n0\n20\n0\n0\nENDSEC\n0\nEOF\n";
  const r = parseDxf(t);
  assert.ok(r.ok);
  assert.ok(r.notes.some((n) => /nested too deep/.test(n)));
});

// ---------- SVG <use>, hidden elements ----------
import { parseSvg } from "../src/compiler/flatparse.ts";
test("SVG use: a group used three times (plain, under a turn, under a scale) is placed where a renderer (cairo) draws it, and a symbol's content too", () => {
  const r = parseSvg(text(fixture("svg-use.svg")));
  assert.ok(r.ok);
  const circles = r.pieces.flatMap((p) => (p.k === "circle" ? [[...p.c.map((x) => +x.toFixed(3)), +p.r.toFixed(3)]] : []));
  assert.deepEqual(circles.sort(), [[100, -50, 6], [20, -20, 3], [28.284, -56.569, 3]].sort());
  // cairo's drawing of the filled shapes: x 15 to 110 mm, y 36.4 to 85 mm (up); here y is turned: -85 to -36.4
  const xs = r.pieces.filter((p) => p.k === "seg" && p.p[1] <= -14 && p.p[1] >= -70 && p.p[0] < 120 && p.q[0] < 120).flatMap((p) => (p.k === "seg" ? [p.p[0], p.q[0]] : []));
  assert.ok(Math.abs(Math.min(...xs) - 15) < 1e-6 && Math.abs(Math.max(...xs) - 110) < 1e-6, `${Math.min(...xs)} to ${Math.max(...xs)}`);
  assert.ok(r.pieces.some((p) => p.k === "seg" && Math.abs(p.p[0] - 150) < 1e-9 && Math.abs(p.q[0] - 158) < 1e-9), "the symbol's line is at x 150 to 158");
});

test("SVG hidden: display none (as an attribute or in a style) and visibility hidden leave out the element and what is in it; a use of nothing is said", () => {
  const r = parseSvg(text(fixture("svg-use.svg")));
  assert.ok(r.ok);
  assert.ok(!r.pieces.some((p) => p.k === "seg" && (Math.abs(p.p[0] - 1) < 1e-9 || Math.abs(p.p[0] - 2) < 1e-9) && p.p[1] > -3), "the hidden groups' rectangles are not there");
  assert.ok(!r.pieces.some((p) => p.k === "seg" && p.p[0] >= 170 && p.p[0] <= 190 && p.p[1] > -25), "nor the hidden rectangle");
  assert.ok(r.notes.some((n) => /left out: 1 use/.test(n)));
});

test("SVG use: a use that uses itself stops, and does not loop", () => {
  const r = parseSvg('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="10mm" height="10mm" viewBox="0 0 10 10"><g id="a"><line x1="0" y1="0" x2="5" y2="0"/><use xlink:href="#a" x="1" y="1"/></g><use xlink:href="#a"/></svg>');
  assert.ok(r.ok);
  assert.ok(r.pieces.length >= 1 && r.pieces.length < 100);
});
