// Prototype (thrown away): can the kernel twist-extrude a gear outline? Run: node --test prototypes/helical-feasibility/try.test.ts (from app/)
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../../app/src/compiler/kernel/index.ts";
import { worldRef } from "../../app/src/shared/ref.ts";
import { createSession, run, scene } from "../../app/src/interaction/session.ts";
import { gearRefs } from "../../app/src/operation/gearscene.ts";
import { gearOutline } from "../../app/src/operation/gear.ts";
import { loopFaceRef } from "../../app/src/operation/loops.ts";
import { startOp } from "../../app/src/interaction/operations.ts";
import type { Op } from "../../app/src/interaction/operations.ts";
import { runOp } from "../../app/src/interaction/runop.ts";
import { normalize, cross } from "../../app/src/math/vec.ts";
import type { Vec3 } from "../../app/src/math/vec.ts";
import type { GearSpec } from "../../app/src/operation/gear.ts";
await kernel.init();
const ortho = (d: Vec3): [Vec3, Vec3] => { const u = normalize(cross(Math.abs(d[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0], d)); return [u, cross(d, u)]; };
const along = (op: Op, p: Vec3, d: Vec3): Op => { const [u, v] = ortho(d); return { ...op, pivot: p, frame: [d, u, v], axis: 0 }; };
const vol = (s: ReturnType<typeof createSession>) => Object.values(scene(s).parts).reduce((t, p) => t + (p.kind === "body" ? ((p as { volume?: number }).volume ?? 0) : 0), 0);
const area = (g: { points: [number, number][]; bulges: number[] }) => 0; // (the flat extrude gives the area)

for (const [z, m, bore, beta, W] of [[20, 2, 0, 15, 10], [20, 2, 8, 15, 10], [40, 1.5, 6, 30, 12], [12, 2, 0, 20, 10], [60, 1, 5, 20, 8]] as const) {
  test(`gear ${z} teeth module ${m} bore ${bore}, helix ${beta} deg, width ${W}`, () => {
    const spec: GearSpec = { teeth: z, module: m, ...(bore ? { bore } : {}) };
    let s = run(createSession(kernel), { type: "gear", id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], spec });
    const lines = gearRefs({ id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], spec }).lines;
    const face = loopFaceRef(lines);
    const flat = runOp(s, { ...(startOp(scene(s), [face as never], "extrude") as { op: Op }).op, value: W })!.session;
    const rp = (m * z) / 2;
    const twist = ((W * Math.tan((beta * Math.PI) / 180)) / rp) * (180 / Math.PI);
    const st = startOp(scene(s), [face as never], "revolve");
    assert.ok(st.ok, st.ok ? "" : st.why);
    const op = (st as { op: Op }).op;
    const t0 = Date.now();
    const made = runOp(s, { ...along(op, op.origin!, op.normal!), value: twist, advValue: W })!;
    const ms = Date.now() - t0;
    const errs = JSON.stringify(made.session.outcome.errors);
    console.log(`z=${z} m=${m} bore=${bore} twist=${twist.toFixed(2)}deg: ${ms} ms, message=${made.session.message}, errors=${errs}, volume ${vol(made.session).toFixed(2)} vs flat ${vol(flat).toFixed(2)}`);
    assert.equal(made.session.message, null);
    assert.ok(Math.abs(vol(made.session) - vol(flat)) < 0.01 * vol(flat), "a twist keeps the volume");
  });
}
