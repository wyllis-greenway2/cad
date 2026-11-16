// Prototype benchmark (`in_565`): the time of making a twisted gear, by stage, as the kernel reports it. Run from app/: node --test ../prototypes/helical-feasibility/bench.test.ts
import test from "node:test";
import { kernel } from "../../app/src/compiler/kernel/index.ts";
import { worldRef } from "../../app/src/shared/ref.ts";
import { createSession, run, scene } from "../../app/src/interaction/session.ts";
import { gearRefs } from "../../app/src/operation/gearscene.ts";
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
const [z, m, bore, beta, W] = [Number(process.env.Z ?? 40), Number(process.env.M ?? 1.5), Number(process.env.BORE ?? 6), 30, 12];
test(`twisted gear ${z} teeth module ${m} bore ${bore}`, () => {
  const spec: GearSpec = { teeth: z, module: m, ...(bore ? { bore } : {}), ...(process.env.DETAIL ? { detail: Number(process.env.DETAIL) } : {}) };
  const s = run(createSession(kernel), { type: "gear", id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], spec });
  const face = loopFaceRef(gearRefs({ id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], spec }).lines);
  const twist = ((W * Math.tan((beta * Math.PI) / 180)) / ((m * z) / 2)) * (180 / Math.PI);
  const flat = process.env.OP === "extrude";
  const op = (startOp(scene(s), [face as never], flat ? "extrude" : "revolve") as { op: Op }).op;
  if (process.env.DRAFT) { kernel.draft = true; kernel.lite = true; }
  const t0 = Date.now();
  const made = (flat ? runOp(s, { ...op, value: W }) : runOp(s, { ...along(op, op.origin!, op.normal!), value: twist, advValue: W }))!;
  const wall = Date.now() - t0;
  const k = made.session.outcome.kernel as { totalMs?: number; ops?: { type: string; ms: number; markMs?: number; checkMs?: number }[]; volume?: number } | null;
  const opsMs = (k?.ops ?? []).reduce((t, o) => t + o.ms, 0);
  console.log(`BENCH wall ${wall} ms; kernel total ${Math.round(k?.totalMs ?? 0)}; ops ${Math.round(opsMs)} (${(k?.ops ?? []).map((o) => `${o.type} ${Math.round(o.ms)} mark ${o.markMs ?? 0} check ${o.checkMs ?? 0}`).join("; ")}); mesh etc ${Math.round((k?.totalMs ?? 0) - opsMs)}; describe ${JSON.stringify((k as any)?.describe)}; volume ${k?.volume?.toFixed(2)}; message ${made.session.message}`);
});
