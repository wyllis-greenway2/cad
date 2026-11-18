import { hypoidPairOf, pinionPoint, ringPoint } from "./hypoid.ts";
const deg = (r: number) => (r * 180) / Math.PI;
for (const E of [0, 10, 20, 30, -20]) {
  const r = hypoidPairOf(20, 40, 3, 35, E);
  if (!r.ok) { console.log(E, r.error); continue; }
  const p = r.value;
  console.log(`E ${E}: g1 ${deg(p.pinion.gamma).toFixed(2)} (spiral value ${deg(Math.atan(20 / 40)).toFixed(2)}), ring cone ${deg(p.ring.gamma).toFixed(2)}, RM ${p.RM.toFixed(1)}, rho2 ${p.ring.rho.toFixed(1)}`);
}
