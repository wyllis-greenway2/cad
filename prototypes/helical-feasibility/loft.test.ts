// Prototype (thrown away): a helical gear as a smooth loft through K turned copies of the outline, against the exact twist.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../../app/src/compiler/kernel/index.ts";
import { worldRef, drawnRef } from "../../app/src/shared/ref.ts";
import { createSession, run, scene } from "../../app/src/interaction/session.ts";
import type { Session } from "../../app/src/interaction/session.ts";
import { gearRefs } from "../../app/src/operation/gearscene.ts";
import { loopFaceRef } from "../../app/src/operation/loops.ts";
import { nextId } from "../../app/src/operation/scene.ts";
import { startOp } from "../../app/src/interaction/operations.ts";
import type { Op } from "../../app/src/interaction/operations.ts";
import { runOp } from "../../app/src/interaction/runop.ts";
import type { GearSpec } from "../../app/src/operation/gear.ts";
await kernel.init();
const vol = (s: Session) => Object.values(scene(s).parts).reduce((t, p) => t + (p.kind === "body" ? ((p as { volume?: number }).volume ?? 0) : 0), 0);
const [z, m, bore, W, twistDeg] = [Number(process.env.Z ?? 40), Number(process.env.M ?? 1.5), 6, 12, Number(process.env.TW ?? 13.23)];
const spec: GearSpec = { teeth: z, module: m, bore };
for (const K of [Number(process.env.K ?? 3)]) {
  test(`loft through ${K} sections`, () => {
    let s = createSession(kernel);
    const faces: string[] = [];
    for (let k = 0; k < K; k++) {
      const h = (W * k) / (K - 1);
      const pl = drawnRef(nextId(scene(s), "p"));
      s = run(s, { type: "addPart", part: { ref: pl, kind: "plane", origin: "drawn", plane: null, movable: true, at: [0, 0, h], u: [1, 0, 0], v: [0, 1, 0] } } as never);
      const id = `g_${k + 1}`.padStart(5, "0").replace("g_", "g_");
      const turn = ((twistDeg * k) / (K - 1)) * (Math.PI / 180);
      // (the middle section a little smaller, as a throated wheel's is: a profile shift that takes the tips in)
      const here: GearSpec = { ...spec, shift: -0.25 * Math.sin((Math.PI * k) / (K - 1)) };
      s = run(s, { type: "gear", id: `g_00${k + 1}`, plane: pl, at: [0, 0, h], spec: here, turn });
      assert.ok(!s.message, s.message ?? "");
      faces.push(loopFaceRef(gearRefs({ id: `g_00${k + 1}`, plane: pl, at: [0, 0, h], spec: here, turn }).lines));
    }
    const st = startOp(scene(s), faces as never, "loft");
    assert.ok(st.ok, st.ok ? "" : st.why);
    const t0 = Date.now();
    const made = runOp(s, (st as { op: Op }).op)!;
    console.log(`K=${K}: ${Date.now() - t0} ms, message=${made.session.message}, errors=${JSON.stringify(made.session.outcome.errors)}, volume ${vol(made.session).toFixed(1)} `);
  });
}
