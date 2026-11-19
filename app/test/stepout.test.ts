// The STEP file's colour, names and schema (`dec_export_more`).
import test from "node:test";
import assert from "node:assert/strict";
import { setOC, importSTEP, measureVolume } from "replicad";
import { loadOC } from "../src/compiler/kernel/occt/oc.mjs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { drawSquaredRectangle, drawCircle } from "../src/operation/build.ts";
import { nextId } from "../src/operation/scene.ts";
import { exportFile } from "../src/interaction/exportfile.ts";
import { exportDialog } from "../src/interaction/transfer.ts";

await kernel.init();
setOC((await loadOC()) as never);
const XY = worldRef("XY");
const text = (b: Uint8Array) => new TextDecoder().decode(b);
const block = (): Session => {
  let s = createSession(kernel);
  const r = drawSquaredRectangle(scene(s), XY, [0, 0, 0], [40, 20, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  return run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: r.lines, params: { depth: 20 } } });
};
const twoBodies = (): Session => {
  const s = block();
  const c = drawCircle(scene(s), XY, [100, 0, 0], 10);
  return run(run(s, c.command), { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: [c.circle], params: { depth: 30 } } });
};
const ids = (s: Session) => Object.values(scene(s).parts).flatMap((p) => (p.kind === "body" && p.id ? [p.id] : []));

test("STEP: a part carries no colour (it was red in other programs), and its schema is the one asked for", async () => {
  const r = await exportFile(block(), kernel, "step");
  assert.ok(r.ok, r.ok ? "" : r.error);
  const t = text(r.bytes);
  assert.ok(!/STYLED_ITEM|COLOUR/.test(t), "no colour in the file");
  assert.match(t, /FILE_SCHEMA\(\(\s*'AUTOMOTIVE_DESIGN/); // AP214 by default
  assert.match(r.message, /AP214/);
  const ap203 = await exportFile(block(), kernel, "step", undefined, undefined, { schema: "ap203" });
  assert.ok(ap203.ok);
  assert.match(text(ap203.bytes), /FILE_SCHEMA\(\(\s*'CONFIG_CONTROL_DESIGN'/);
  const ap242 = await exportFile(block(), kernel, "step", undefined, undefined, { schema: "ap242" });
  assert.ok(ap242.ok);
  assert.match(text(ap242.bytes), /FILE_SCHEMA\(\(\s*'AP242/);
});

test("STEP of two bodies: a product for each, named for its body, in the schema asked; read back it is two solids of the right volume", async () => {
  const s = twoBodies();
  const r = await exportFile(s, kernel, "step");
  assert.ok(r.ok, r.ok ? "" : r.error);
  const t = text(r.bytes);
  for (const id of ids(s)) assert.match(t, new RegExp(`PRODUCT\\('${id}'`), `a product named ${id}`);
  const shape = await importSTEP(new Blob([r.bytes as BlobPart]));
  const vol = measureVolume(shape as never);
  assert.ok(Math.abs(vol - (40 * 20 * 20 + Math.PI * 100 * 30)) / vol < 0.001, `${vol}`);
});

test("STEP of one chosen body is that body, named; the dialog offers the schema for STEP only", async () => {
  const s = twoBodies();
  const only = ids(s)[0]!;
  const r = await exportFile(s, kernel, "step", [only]);
  assert.ok(r.ok);
  assert.match(text(r.bytes), new RegExp(`PRODUCT\\('${only}'`));
  assert.ok(exportDialog(s, { format: "step" }).fields.some((f) => f.id === "schema"));
  assert.ok(!exportDialog(s, { format: "stl" }).fields.some((f) => f.id === "schema"));
});
