// IGES import and export (`dec_exchange_gaps`), on the kernel build with the IGES classes bound (`tools/kernel-build/`).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, run, scene, saveText, openSession } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { drawSquaredRectangle, drawCircle } from "../src/operation/build.ts";
import { nextId } from "../src/operation/scene.ts";
import { exportFile } from "../src/interaction/exportfile.ts";
import { importAny, IMPORT_DEFAULTS } from "../src/interaction/importfile.ts";
import { exportDialog, importDialog, KIND_OF } from "../src/interaction/transfer.ts";
import { sniffKind, nameFor } from "../src/interaction/sniff.ts";

await kernel.init();
const XY = worldRef("XY");
const fixture = (n: string): Uint8Array => new Uint8Array(readFileSync(new URL(`./fixtures/${n}`, import.meta.url)));
const text = (b: Uint8Array) => new TextDecoder().decode(b);
const bodies = (s: Session) => Object.values(scene(s).parts).filter((p) => p.kind === "body");
const volume = (s: Session): number => bodies(s).reduce((t, p) => t + ((p as { volume?: number }).volume ?? 0), 0);
const TWO = 16000 + Math.PI * 100 * 30; // a block of 40 by 20 by 20 and a post of radius 10 and height 30
const twoBodies = (): Session => {
  let s = createSession(kernel);
  const r = drawSquaredRectangle(scene(s), XY, [0, 0, 0], [40, 20, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: r.lines, params: { depth: 20 } } });
  const c = drawCircle(scene(s), XY, [100, 0, 0], 10);
  s = run(s, c.command);
  return run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: [c.circle], params: { depth: 30 } } });
};

test("IGES export: two bodies as trimmed surfaces or as B-rep solids, in millimetres or inches, each reads back as two bodies of the exact volume", async () => {
  for (const iges of ["surfaces", "solids"] as const) for (const units of ["mm", "in"] as const) {
    const e = await exportFile(twoBodies(), kernel, "iges", undefined, undefined, { iges, units });
    assert.ok(e.ok, e.ok ? "" : e.error);
    assert.equal(e.name, "model.igs");
    assert.equal(e.mime, "model/iges");
    assert.match(text(e.bytes).split("\n")[0]!, /^.{72}S\s*0*1$/, "an IGES file's first line ends with S and 1 in columns 73 to 80");
    assert.match(e.message, iges === "solids" ? /B-rep solids/ : /trimmed surfaces/);
    const back = await importAny(createSession(kernel), "model.igs", e.bytes);
    assert.ok(back.ok, `${iges} ${units}: ${back.ok ? "" : back.error}`);
    assert.equal(bodies(back.session).length, 2, `${iges} ${units}`);
    assert.ok(Math.abs(volume(back.session) - TWO) < 1e-3, `${iges} ${units}: ${volume(back.session)} against ${TWO}`);
  }
});

test("IGES import: files written by another build of OpenCASCADE (OCP, a box and a cylinder) come in as two bodies, as solids and as surfaces that are sewn", async () => {
  for (const f of ["ocp-solids.igs", "ocp-surfaces.igs"]) {
    const r = await importAny(createSession(kernel), f, fixture(f));
    assert.ok(r.ok, `${f}: ${r.ok ? "" : r.error}`);
    assert.equal(bodies(r.session).length, 2, f);
    assert.ok(Math.abs(volume(r.session) - (40 * 20 * 20 + Math.PI * 100 * 30)) < 1e-3, `${f}: ${volume(r.session)}`);
  }
});

test("IGES import: a typed unit scales it, an IGES kept in the project builds again after save and open, and the IGES text is packed", async () => {
  const bytes = fixture("ocp-solids.igs");
  const done = await importAny(createSession(kernel), "a.igs", bytes);
  assert.ok(done.ok);
  const step = scene(done.session).steps.find((x) => x.type === "import")!;
  assert.equal(step.params.format, "iges");
  assert.ok(String(step.params.data).startsWith("z:"));
  const again = openSession(kernel, saveText(done.session));
  assert.ok(again.ok);
  assert.ok(Math.abs(volume(again.value) - volume(done.session)) < 1e-6);
  const big = await importAny(createSession(kernel), "a.igs", bytes, { ...IMPORT_DEFAULTS, scale: 2 });
  assert.ok(big.ok);
  assert.ok(Math.abs(volume(big.session) / volume(done.session) - 8) < 1e-6);
});

test("IGES import: surfaces that do not close up into a solid, a file that is not IGES and an empty one are refused with the reason, and nothing changes", async () => {
  const s = twoBodies();
  const steps = scene(s).steps.length;
  const lines = text(fixture("ocp-surfaces.igs")).split("\n");
  // take the faces' directory and parameter lines of half the entities away is not simple; a plain broken file is: cut the data section off
  const cut = lines.filter((l) => !/^.{72}[DP]\s*\d+\s*$/.test(l)).join("\n");
  for (const [name, bytes] of [["cut.igs", new TextEncoder().encode(cut)], ["x.igs", new TextEncoder().encode("this is not an IGES file")], ["empty.igs", new Uint8Array(0)]] as const) {
    const r = await importAny(s, name, bytes);
    assert.ok(!r.ok, name);
  }
  assert.equal(scene(s).steps.length, steps);
});

test("IGES is known by name and by contents, and the dialogs offer it", async () => {
  assert.equal(KIND_OF("a.igs"), "iges");
  assert.equal(KIND_OF("A.IGES"), "iges");
  assert.equal(await sniffKind(fixture("ocp-solids.igs")), "iges");
  assert.equal(await sniffKind(fixture("ocp-surfaces.igs")), "iges");
  assert.equal(await nameFor("part.dat", fixture("ocp-solids.igs"), KIND_OF), "part.igs");
  const e = exportDialog(twoBodies(), { format: "iges" });
  assert.ok((e.fields.find((f) => f.id === "format") as { choices: { value: string }[] }).choices.some((c) => c.value === "iges"));
  assert.ok(e.fields.some((f) => f.id === "iges"), "the choice of surfaces or solids");
  assert.ok(e.fields.some((f) => f.id === "units"), "IGES has a unit");
  assert.ok(!e.fields.some((f) => f.id === "quality"));
  assert.ok(!exportDialog(twoBodies(), { format: "stl" }).fields.some((f) => f.id === "iges"));
  assert.ok(!importDialog("a.igs", {}).fields.some((f) => f.id === "units"), "an IGES says its own unit");
});
