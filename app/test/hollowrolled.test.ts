// A cylinder whose top edge is rolled with a radius nearly its own (a dome, the torus crossing its own axis) can be made hollow, in and out (`in_418`): the boolean of the body and its offset failed or gave the wrong body
// (the outward offset came back turned inside out), so the wall is checked against the volumes and made of two shells when it does not fit.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession, scene } from "../src/interaction/session.ts";
import { startOp } from "../src/interaction/operations.ts";
import { runOp } from "../src/interaction/runop.ts";

await kernel.init();
const open = () => (openSession(kernel, readFileSync(new URL("./fixtures/rolled-cylinder-hollow-in_418.cad.json", import.meta.url), "utf8")) as unknown as { value: any }).value;

for (const [wall, volume] of [[2.3, 2475.6], [1, 1245.9], [4, 3525.1], [-2.3, 4038.5], [-1, 1541.4]] as const) {
  test(`the whole rolled cylinder made hollow with a wall of ${wall} has the volume of the wall, no more`, () => {
    const s = open();
    const body = Object.values(scene(s).parts).find((p: any) => p.kind === "body") as any;
    const st = startOp(scene(s), [body.ref], "hollow") as any;
    assert.ok(st.ok);
    const r = runOp(s, { ...st.op, value: wall }) as any;
    assert.equal(r.session.message, null);
    assert.deepEqual(r.session.outcome.errors, {});
    assert.ok(Math.abs(r.session.outcome.kernel.volume - volume) < 0.5, `volume ${r.session.outcome.kernel.volume}, wanted ${volume}`);
  });
}
