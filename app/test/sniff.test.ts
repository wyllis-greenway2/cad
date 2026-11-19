// What a file is by what is in it (`dec_exchange_gaps`).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sniffKind, nameFor } from "../src/interaction/sniff.ts";
import { KIND_OF } from "../src/interaction/transfer.ts";
import { zipStored } from "../src/compiler/threemf.ts";
import { stlBytes } from "../src/compiler/stl.ts";
import { objBytes } from "../src/compiler/obj.ts";

const fx = (n: string) => new Uint8Array(readFileSync(new URL(`./fixtures/${n}`, import.meta.url)));
const enc = (t: string) => new TextEncoder().encode(t);

test("each kind of file the app reads is known by its contents", async () => {
  assert.equal(await sniffKind(fx("trimesh-box.stl")), "stl");
  assert.equal(await sniffKind(fx("trimesh-three.3mf")), "3mf");
  assert.equal(await sniffKind(fx("trimesh-box.obj")), "obj");
  assert.equal(await sniffKind(fx("ezdxf-sample.dxf")), "dxf");
  assert.equal(await sniffKind(fx("ezdxf-sample-binary.dxf")), "dxf");
  assert.equal(await sniffKind(enc("ISO-10303-21;\nHEADER;\n")), "step");
  assert.equal(await sniffKind(enc("\n\nISO-10303-21;\n")), "step");
  assert.equal(await sniffKind(enc("\nCASCADE Topology V3, (c) Open Cascade\n")), "brep");
  assert.equal(await sniffKind(enc('<?xml version="1.0"?>\n<!-- made by x -->\n<svg xmlns="http://www.w3.org/2000/svg"></svg>')), "svg");
  assert.equal(await sniffKind(enc('<svg width="10"></svg>')), "svg");
  assert.equal(await sniffKind(zipStored([{ name: "Document.xml", data: enc("<Document/>") }])), "fcstd");
  assert.equal(await sniffKind(zipStored([{ name: "3D/3dmodel.model", data: enc("<model/>") }])), "3mf");
});

test("an ASCII STL, and a binary STL whose header begins with solid, are STLs; plain text and an unknown zip are nothing", async () => {
  assert.equal(await sniffKind(enc("solid a\n facet normal 0 0 1\n outer loop\n vertex 0 0 0\n vertex 1 0 0\n vertex 0 1 0\n endloop\n endfacet\nendsolid a\n")), "stl");
  const bin = stlBytes([0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 2], "t");
  new TextEncoder().encodeInto("solid starts like text", bin.subarray(0, 80));
  assert.equal(await sniffKind(bin), "stl");
  assert.equal(await sniffKind(enc("hello, this is just some text")), null);
  assert.equal(await sniffKind(zipStored([{ name: "readme.txt", data: enc("x") }])), null);
  assert.equal(await sniffKind(new Uint8Array(0)), null);
  assert.equal(await sniffKind(objBytes([0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 2], "t")), "obj");
});

test("a file with a wrong or no ending is read as what it is; a right ending, and a file that is nothing the app knows, keep their name", async () => {
  assert.equal(await nameFor("part.dat", fx("trimesh-box.stl"), KIND_OF), "part.stl");
  assert.equal(await nameFor("part", fx("trimesh-three.3mf"), KIND_OF), "part.3mf");
  assert.equal(await nameFor("drawing.txt", fx("ezdxf-sample.dxf"), KIND_OF), "drawing.dxf");
  assert.equal(await nameFor("a.b.c", fx("trimesh-box.obj"), KIND_OF), "a.b.obj");
  assert.equal(await nameFor("model.stl", fx("trimesh-box.stl"), KIND_OF), "model.stl");
  assert.equal(await nameFor("MODEL.STP", enc("ISO-10303-21;"), KIND_OF), "MODEL.STP");
  assert.equal(await nameFor("notes.txt", enc("hello"), KIND_OF), "notes.txt");
  assert.equal(await nameFor("body.stl", fx("trimesh-box.obj"), KIND_OF), "body.obj", "a name that says STL over an OBJ is read as an OBJ");
});
