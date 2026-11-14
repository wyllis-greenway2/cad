// The faces taken for the rounding of an edge (`roundingFaces`) are the strip along it, not a wall of a small body (`in_323`): a wall beside a fillet or chamfer of size R lies within 3R of the edge on a block less than
// about 3R wide, and was stretched with the rounding when the size was dragged back from a big one (the block shrank into a slanted slab in the preview).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession, scene, undoLast, run } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { sharpOfPoints, roundingFaces } from "../src/operation/roundings.ts";
import type { Part } from "../src/operation/part.ts";

await kernel.init();
const open = () => undoLast((openSession(kernel, readFileSync(new URL("./fixtures/two-blocks-in_319.cad.json", import.meta.url), "utf8")) as unknown as { value: Session }).value);
const EDGE = "b/body/e@29.78,10.89,0~29.78,10.89,12.4~29.78,10.89,6.2";

for (const mode of ["fillet", "chamfer"] as const) {
  for (const R of [1.5, 5, 8]) {
    test(`a ${mode} of ${R} on the corner of a 14 mm block: its rounding faces are the strip, not a wall`, () => {
      const s = open();
      const sc = scene(s);
      const e = sc.parts[EDGE as never] as Extract<Part, { kind: "line" }>;
      const [a, b] = [sc.parts[e.a], sc.parts[e.b]] as unknown as { at: [number, number, number] }[];
      const sharp = sharpOfPoints(a!.at, b!.at, null)!;
      const made = run(s, { type: "addStep", step: { id: "s_099", type: "edgeMod", parts: [EDGE as never], params: { mode, value: R } } });
      assert.deepEqual(made.outcome.errors, {});
      const faces = roundingFaces(scene(made), [sharp], 3 * R, (r) => r in sc.parts);
      assert.equal(faces.length, 1, `one face is the rounding: ${faces.map((f) => f.face).join(", ")}`);
      assert.ok(/CYLINDRE|CONE|f@/.test(faces[0]!.face));
      // and it is the new strip, not one of the block's walls renamed by the cut
      const part = scene(made).parts[faces[0]!.face] as unknown as { mesh: number[] };
      const xs = part.mesh.filter((_, i) => i % 3 === 0);
      assert.ok(Math.max(...xs) - Math.min(...xs) <= R * 1.2 + 1e-6, "no wider than the size");
    });
  }
}
