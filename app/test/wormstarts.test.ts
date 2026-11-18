// A worm of three starts was an invalid solid (`in_923`): the cone that cuts the thread's run-out started exactly on the core's own surface, which the kernel could not cut for three starts. It starts 0.002 mm inside it now.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import { worldRef } from "../src/shared/ref.ts";

await kernel.init();
test("worms of one to four starts, with the default run-out, a long one, and with a journal are each one valid body", () => {
  for (const [starts, m, dia, length, extra] of [[1, 2, 20, 50, {}], [2, 1.5, 16, 45, {}], [3, 2, 20, 50, {}], [3, 2, 20, 80, { journal: 3 }], [4, 2, 24, 110, {}]] as [number, number, number, number, object][]) {
    const s = run(createSession(kernel), { type: "gear", id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], spec: { teeth: starts, module: m, worm: { diameter: dia, length, ...extra } } });
    assert.ok(!s.message, `${starts} starts: ${s.message}`);
    assert.deepEqual(s.outcome.errors, {}, `${starts} starts`);
    const b = Object.values(scene(s).parts).filter((p) => p.kind === "body");
    assert.equal(b.length, 1, `${starts} starts: one body`);
    assert.ok((b[0] as unknown as { volume: number }).volume > 0.5 * Math.PI * (dia / 2 - m) ** 2 * length, `${starts} starts: more than its core`);
  }
});
