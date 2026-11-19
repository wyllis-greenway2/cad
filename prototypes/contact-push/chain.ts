// A train of gears all driven by contact (a prototype, `in_937`): gear 1 is turned and hard, every other gear yields to the one before it. How long a chain the push rule settles, and what it costs. Run: `node prototypes/contact-push/chain.ts`; `N` gears, `TURNS`.
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
import type { GearRecord } from "../../app/src/operation/gearscene.ts";

await kernel.init();
const XY = worldRef("XY");
const N = Number(process.env.N ?? 4), TURNS = Number(process.env.TURNS ?? 0.5);
const teeth = [20, 30, 24, 36, 20, 30, 24, 36];
let prev: GearRecord = { id: "g_001", plane: XY, at: [0, 0, 0], spec: { teeth: teeth[0]!, module: 2, backlash: 0.15 } };
const recs: GearRecord[] = [prev];
for (let i = 1; i < N; i++) {
  const p = meshWith(prev, [1, 0, 0], [0, 1, 0], { teeth: teeth[i]! }, 0);
  if (!p.ok) throw new Error(p.error);
  prev = { id: `g_00${i + 1}`, plane: XY, at: p.value.at, spec: p.value.spec, turn: p.value.turn };
  recs.push(prev);
}
let s: any = createSession(kernel);
for (const r of recs) {
  s = run(s, { type: "gear", id: r.id, plane: XY, at: r.at, spec: r.spec, ...(r.turn ? { turn: r.turn } : {}) });
  if (s.message) throw new Error(s.message);
  const refs = gearRefs(r);
  const op: any = startOp(scene(s), [(refs.wall ? diskFaceRef(refs.wall) : loopFaceRef(refs.lines)) as never], "extrude");
  s = runOp(s, { ...op.op, value: 5 })!.session;
}
const sc = scene(s);
const bodies = sc.gears!.map((g) => bodyOfGear(sc, g)!);
console.log(`${N} gears, ${new Set(bodies).size} bodies (a train that touches can be made one body by the kernel)`);
for (const k of (process.env.HARD ?? "1").split(",").map(Number)) s = run(s, { type: "setHard", body: (scene(s).parts[bodies[k - 1]!] as any).id, on: true }); // (the gears marked hard: `HARD=1,4`; the first by default)
const r: any = startMotion(scene(s), bodies[0]!, "turn", s.outcome);
const stripped = { ...r.motion, follows: [] };
const contact = startContact(scene(s), stripped, scene(s).gears!.slice(1).map((g, i) => { const ax = gearAxis(scene(s), g)!; return { body: bodies[i + 1]!, point: ax.point, dir: ax.dir }; }), s.outcome)!;
let m = { ...stripped, contact };
// the ratios, gear by gear: each turns the opposite way by the teeth of the one before
const ratio = [1]; for (let i = 1; i < N; i++) ratio.push(ratio[i - 1]! * -teeth[i - 1]! / teeth[i]!);
const times: number[] = []; let worst = new Array(N).fill(0), jam = "", at = 0;
for (let deg = 1; deg <= 360 * TURNS; deg++) {
  const t = performance.now();
  m = solveContact(scene(s), { ...m, amount: deg, playing: true }, s.outcome);
  times.push(performance.now() - t);
  if (m.contact!.jam) { jam = m.contact!.jam; at = deg; break; }
  m.yields!.forEach((y: any, i: number) => { worst[i + 1] = Math.max(worst[i + 1], Math.abs(y.value - ratio[i + 1]! * deg)); });
}
times.sort((a, b) => a - b); const n = times.length;
console.log(`${jam ? `JAM at ${at} degrees (${jam}); ` : "no jam; "}${m.contact!.note ? `NOTE: ${m.contact!.note}; ` : ""}the gears are within ${worst.slice(1).map((w) => w.toFixed(1)).join(", ")} degrees of their ratios; ms a degree: median ${times[Math.floor(n / 2)]!.toFixed(1)}, p95 ${times[Math.floor(n * 0.95)]!.toFixed(1)}, max ${times[n - 1]!.toFixed(0)} (${n} steps)`);
