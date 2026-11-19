// BREP export and import, and FreeCAD documents (`dec_exchange_gaps`).
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { drawSquaredRectangle, drawCircle } from "../src/operation/build.ts";
import { nextId } from "../src/operation/scene.ts";
import { exportFile } from "../src/interaction/exportfile.ts";
import { importAny } from "../src/interaction/importfile.ts";
import { exportDialog, importDialog, KIND_OF } from "../src/interaction/transfer.ts";
import { zipStored } from "../src/compiler/threemf.ts";
import { parseFcstd } from "../src/compiler/fcstd.ts";

await kernel.init();
const XY = worldRef("XY");
const enc = (t: string) => new TextEncoder().encode(t);
const bodies = (s: Session) => Object.values(scene(s).parts).filter((p) => p.kind === "body");
const volume = (s: Session): number => bodies(s).reduce((t, p) => t + ((p as { volume?: number }).volume ?? 0), 0);
const block = (): Session => {
  let s = createSession(kernel);
  const r = drawSquaredRectangle(scene(s), XY, [0, 0, 0], [40, 20, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  return run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: r.lines, params: { depth: 20 } } });
};
const post = (): Session => {
  let s = createSession(kernel);
  const c = drawCircle(scene(s), XY, [0, 0, 0], 10);
  s = run(s, c.command);
  return run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: [c.circle], params: { depth: 30 } } });
};
const brepOf = async (s: Session): Promise<Uint8Array> => { const r = await exportFile(s, kernel, "brep"); assert.ok(r.ok, r.ok ? "" : r.error); return (r as { bytes: Uint8Array }).bytes; };

test("BREP: a block exported as OpenCASCADE BREP text reads back as the same body, exactly (the volume of the exact solid)", async () => {
  const s = block();
  const r = await exportFile(s, kernel, "brep");
  assert.ok(r.ok, r.ok ? "" : r.error);
  assert.equal(r.name, "model.brep");
  assert.match(new TextDecoder().decode(r.bytes).slice(0, 40), /^\s*CASCADE Topology/);
  assert.match(r.message, /no unit/);
  const back = await importAny(createSession(kernel), "model.brep", r.bytes);
  assert.ok(back.ok, back.ok ? "" : back.error);
  assert.equal(bodies(back.session).length, 1);
  assert.ok(Math.abs(volume(back.session) - 16000) < 1e-6, `${volume(back.session)}`);
});

test("BREP: a curved body keeps its round faces (a post of 10 mm radius: the exact volume, not a mesh's), and a typed unit scales it", async () => {
  const b = await brepOf(post());
  const back = await importAny(createSession(kernel), "post.brep", b);
  assert.ok(back.ok);
  assert.ok(Math.abs(volume(back.session) - Math.PI * 100 * 30) < 1e-6);
  const inch = await importAny(createSession(kernel), "post.brep", b, { units: "in", scale: 1, place: "file", plane: "selected" });
  assert.ok(inch.ok);
  assert.ok(Math.abs(volume(inch.session) / (Math.PI * 100 * 30) - 25.4 ** 3) < 1e-3 * 25.4 ** 3);
});

test("BREP: two bodies come back as two bodies; text that is not BREP is refused with the reason and nothing changes", async () => {
  let s = block();
  const c = drawCircle(scene(s), XY, [100, 0, 0], 10);
  s = run(run(s, c.command), { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: [c.circle], params: { depth: 30 } } });
  const back = await importAny(createSession(kernel), "two.brep", await brepOf(s));
  assert.ok(back.ok, back.ok ? "" : back.error);
  assert.equal(bodies(back.session).length, 2);
  const bad = await importAny(createSession(kernel), "x.brep", enc("this is not a shape"));
  assert.ok(!bad.ok);
  assert.match(bad.error, /could not be read|no solid/);
});

/** a FreeCAD document the way FreeCAD writes it (as far as its documented layout): two shapes, `Box` a finished one shown, `Sketch` hidden and used by `Pad`; and a hidden intermediate that the finished one is made from */
const fcstd = async (opts: { gui?: boolean } = {}): Promise<Uint8Array> => {
  const box = await brepOf(block());
  const cyl = await brepOf(post());
  const doc = `<?xml version='1.0' encoding='utf-8'?>
<Document SchemaVersion="4" ProgramVersion="1.0.0" FileVersion="1">
  <Properties Count="1"><Property name="Label" type="App::PropertyString"><String value="Test"/></Property></Properties>
  <Objects Count="3" Dependencies="1">
    <ObjectDeps Name="Cylinder" Count="1"><Dep Name="Base"/></ObjectDeps>
    <ObjectDeps Name="Base" Count="0"/>
    <ObjectDeps Name="Box" Count="0"/>
    <Object type="Part::Box" name="Box" id="1"/>
    <Object type="Part::Cylinder" name="Base" id="2"/>
    <Object type="Part::Feature" name="Cylinder" id="3"/>
  </Objects>
  <ObjectData Count="3">
    <Object name="Box"><Properties Count="2"><Property name="Label" type="App::PropertyString"><String value="Bracket"/></Property><Property name="Shape" type="Part::PropertyPartShape"><Part file="PartShape.brp"/></Property></Properties></Object>
    <Object name="Base"><Properties Count="1"><Property name="Shape" type="Part::PropertyPartShape"><Part file="PartShape1.brp"/></Property></Properties></Object>
    <Object name="Cylinder"><Properties Count="1"><Property name="Shape" type="Part::PropertyPartShape"><Part file="PartShape2.brp"/></Property></Properties></Object>
  </ObjectData>
</Document>`;
  const gui = `<?xml version='1.0' encoding='utf-8'?>
<Document SchemaVersion="1"><ViewProviderData Count="3">
  <ViewProvider name="Box"><Properties Count="1"><Property name="Visibility" type="App::PropertyBool"><Bool value="true"/></Property></Properties></ViewProvider>
  <ViewProvider name="Base"><Properties Count="1"><Property name="Visibility" type="App::PropertyBool"><Bool value="false"/></Property></Properties></ViewProvider>
  <ViewProvider name="Cylinder"><Properties Count="1"><Property name="Visibility" type="App::PropertyBool"><Bool value="true"/></Property></Properties></ViewProvider>
</ViewProviderData></Document>`;
  return zipStored([
    { name: "Document.xml", data: enc(doc) },
    ...(opts.gui === false ? [] : [{ name: "GuiDocument.xml", data: enc(gui) }]),
    { name: "PartShape.brp", data: box }, { name: "PartShape1.brp", data: box }, { name: "PartShape2.brp", data: cyl },
  ]);
};

test("FreeCAD: the shapes that are shown come in as bodies, and the hidden step they were made from does not", async () => {
  const p = await parseFcstd(await fcstd());
  assert.ok(p.ok);
  assert.deepEqual(p.value.map((x) => x.name), ["Box", "Cylinder"]);
  assert.equal(p.value[0]!.label, "Bracket");
  const back = await importAny(createSession(kernel), "part.FCStd", await fcstd());
  assert.ok(back.ok, back.ok ? "" : back.error);
  assert.equal(bodies(back.session).length, 2);
  assert.ok(Math.abs(volume(back.session) - (16000 + Math.PI * 100 * 30)) < 1e-6);
  assert.match(back.message, /2 shapes of 3/);
});

test("FreeCAD: with no GuiDocument.xml the finished shapes (that no other object is made from) are taken", async () => {
  const p = await parseFcstd(await fcstd({ gui: false }));
  assert.ok(p.ok);
  assert.deepEqual(p.value.map((x) => x.name).sort(), ["Box", "Cylinder"]);
});

test("FreeCAD: a zip with no Document.xml, and a file that is not a zip, are refused with the reason", async () => {
  const none = await parseFcstd(zipStored([{ name: "a.txt", data: enc("x") }]));
  assert.ok(!none.ok && /no Document\.xml/.test(none.error));
  const junk = await parseFcstd(enc("not a zip at all, but long enough to look at"));
  assert.ok(!junk.ok && /not an FCStd/.test(junk.error));
  const empty = await parseFcstd(zipStored([{ name: "Document.xml", data: enc("<Document></Document>") }]));
  assert.ok(!empty.ok && /no shapes/.test(empty.error));
});

test("the dialogs offer BREP and know .brep, .brp and .FCStd", () => {
  const e = exportDialog(block(), { format: "brep" });
  assert.ok((e.fields.find((f) => f.id === "format") as { choices: { value: string }[] }).choices.some((c) => c.value === "brep"));
  assert.ok(!e.fields.some((f) => f.id === "units"), "a BREP has no unit");
  assert.ok(!e.fields.some((f) => f.id === "quality"));
  assert.equal(KIND_OF("a.brep"), "brep");
  assert.equal(KIND_OF("a.BRP"), "brep");
  assert.equal(KIND_OF("a.FCStd"), "fcstd");
  assert.match(JSON.stringify(importDialog("a.FCStd", {}).fields), /FreeCAD keeps millimetres/);
});
