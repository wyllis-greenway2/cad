// A chamfer in the corner of a flat cut on a round body can go all the way across the floor (`in_1340`): the floor narrows to nothing at the ends, and the kernel's chamfer stopped a sliver of it short (4.45 mm
// of 4.5); the fill the region makes now follows the outline of the floor and the wall. The model is the user's (`chamfer-flat-cut.cad.json`).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession, scene, run } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import type { Part } from "../src/operation/part.ts";

await kernel.init();
const open = (): Session => (openSession(kernel, readFileSync(new URL("./fixtures/chamfer-flat-cut.cad.json", import.meta.url), "utf8")) as unknown as { value: Session }).value;
const volume = (s: Session): number[] => Object.values(scene(s).parts).filter((p): p is Extract<Part, { kind: "body" }> => p.kind === "body").map((b) => Math.round(b.volume ?? 0));

test("the chamfer of the floor's corner goes past the floor's width: one body, no error, and a bigger size fills more", () => {
  const out = [4.4, 4.6, 6, 8].map((v) => { const s = run(open(), { type: "setStepParams", id: "s_014", params: { value: v } }); return { v, s }; });
  for (const { v, s } of out) {
    assert.deepEqual(s.outcome.errors, {}, `${v} mm`);
    assert.equal(volume(s).length, 1, `${v} mm: one body`);
  }
  const vols = out.map(({ s }) => volume(s)[0]!);
  for (let i = 1; i < vols.length; i++) assert.ok(vols[i]! > vols[i - 1]!, `a bigger chamfer fills more: ${vols}`);
});
