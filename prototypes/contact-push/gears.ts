// Contact push on a gear pair (a prototype, `in_897`): gear 1 is turned, gear 2 yields by contact alone (the app's `contact.ts`), and its angle is compared with the ratio of the teeth. Run: `node prototypes/contact-push/gears.ts` from the repository root;
// `Z1`, `Z2`, `MODULE`, `BACKLASH`, `TURNS` set the pair.
import { worldRef } from "../../app/src/shared/ref.ts";
import { kernel } from "../../app/src/compiler/kernel/index.ts";
import { createSession, scene, run } from "../../app/src/interaction/session.ts";
import { startOp } from "../../app/src/interaction/operations.ts";
import { runOp } from "../../app/src/interaction/runop.ts";
import { gearRefs } from "../../app/src/operation/gearscene.ts";
import { loopFaceRef, diskFaceRef } from "../../app/src/operation/loops.ts";
import { meshWith } from "../../app/src/operation/mesh.ts";
import { bodyOfGear, gearAxis } from "../../app/src/operation/gearcouple.ts";
import { startMotion } from "../../app/src/interaction/motion.ts";
import { startContact, solveContact } from "../../app/src/interaction/contact.ts";
import type { GearSpec } from "../../app/src/operation/gear.ts";
import type { GearRecord } from "../../app/src/operation/gearscene.ts";

await kernel.init();
const XY = worldRef("XY");
const [z1, z2, module, backlash, turns] = [Number(process.env.Z1 ?? 20), Number(process.env.Z2 ?? 30), Number(process.env.MODULE ?? 2), Number(process.env.BACKLASH ?? 0.15), Number(process.env.TURNS ?? 1)];
const g1: GearRecord = { id: "g_001", plane: XY, at: [0, 0, 0], spec: { teeth: z1, module, backlash } as GearSpec };
const p = meshWith(g1, [1, 0, 0], [0, 1, 0], { teeth: z2 }, 0);
if (!p.ok) throw new Error(p.error);
let s: any = createSession(kernel);
for (const [r, withId] of [[g1, undefined], [{ id: "g_002", plane: XY, at: p.value.at, spec: p.value.spec, turn: p.value.turn } as GearRecord, "g_001"]] as const) {
  s = run(s, { type: "gear", id: r.id, plane: XY, at: r.at, spec: r.spec, ...(r.turn ? { turn: r.turn } : {}), ...(withId ? { meshWith: withId } : {}) });
  if (s.message) throw new Error(s.message);
  const refs = gearRefs(r);
  const op: any = startOp(scene(s), [(refs.wall ? diskFaceRef(refs.wall) : loopFaceRef(refs.lines)) as never], "extrude");
  s = runOp(s, { ...op.op, value: 5 })!.session;
}
const sc = scene(s);
const [a, b] = sc.gears!;
const [bodyA, bodyB] = [bodyOfGear(sc, a!)!, bodyOfGear(sc, b!)!];
s = run(s, { type: "setHard", body: (scene(s).parts[bodyA] as any).id, on: true });
const r: any = startMotion(scene(s), bodyA); // (with its formula follower: removed below, so gear 2 has only contact to go by)
const ax = gearAxis(scene(s), scene(s).gears![1]!)!;
const stripped = { ...r.motion, follows: [] };
const contact = startContact(scene(s), stripped, [{ body: bodyB, point: ax.point, dir: ax.dir }], s.outcome);
if (!contact) throw new Error("nothing hard");
if (process.env.SHOW) console.log("ignored pairs at the start:", JSON.stringify(contact.ignore));
let m = { ...stripped, contact };
const ratio = -z1 / z2;
let worst = 0, jam = "", firstJam = 0;
const times: number[] = [];
for (let deg = 1; deg <= 360 * turns; deg++) {
  const t = performance.now();
  m = solveContact(scene(s), { ...m, amount: deg, playing: true }, s.outcome);
  times.push(performance.now() - t);
  if (m.contact!.jam) { jam = m.contact!.jam; firstJam = deg; break; }
  worst = Math.max(worst, Math.abs(m.yields![0]!.value - ratio * deg));
}
times.sort((x, y) => x - y);
const n = times.length;
console.log(`${z1} and ${z2} teeth, module ${module}, backlash ${backlash}: ${jam ? `JAM at ${firstJam} degrees (${jam})` : "no jam"}; the driven gear is within ${worst.toFixed(2)} degrees of the ratio (${(360 / z2).toFixed(1)} degrees is one tooth of it); ms a degree: median ${times[Math.floor(n / 2)]!.toFixed(2)}, p95 ${times[Math.floor(n * 0.95)]!.toFixed(2)}, max ${times[n - 1]!.toFixed(1)}`);
