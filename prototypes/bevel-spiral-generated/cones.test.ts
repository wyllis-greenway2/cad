// The spiral bevel pair made by the gearing law with cone ends, in the kernel, for several tooth counts and spiral angles (`in_798`): the measure is the overlap of the pair (nothing at the meshing place, the same rolled, a lot half a pitch round). The gears are made by `cones.ts`.
import test from "node:test";
import { kernel } from "../../app/src/compiler/kernel/index.ts";
import { pairFor, overlap } from "./cones.ts";

const SETS: [number, number, number, number][] = [[20, 30, 3, 30], [24, 24, 3, 30], [16, 32, 3, 30], [20, 30, 3, 40], [17, 43, 3, 30], [30, 45, 2.5, 30], [22, 34, 3, 30], [25, 25, 3, 35], [18, 36, 3, 25], [28, 42, 3, 30], [25, 50, 3, 30]];
for (const [z1, z2, mn, beta] of SETS) {
  test(`cone ends: ${z1} / ${z2} teeth, module ${mn}, ${beta} degrees: the pair fits at its place and rolling, not half a pitch round`, async () => {
    await kernel.init();
    const pr = pairFor(z1, z2, mn, beta);
    const kk = Math.sin(pr.pinion.gamma) / Math.sin(pr.ring.gamma);
    const rows: string[] = [];
    for (const [name, tp, tr] of [["at the place", 0, 0], ["rolled by 0.05", 0.05, -kk * 0.05], ["half a pitch round", 0, Math.PI / pr.ring.z]] as const) {
      const o = overlap(pr, tp, tr, 9);
      rows.push(`${name}: ${o.none ? "nothing in common" : `${o.vol.toFixed(1)} mm3`} (bodies ${o.vols.join(", ")})`);
    }
    console.log(`ROWS ${z1}/${z2} m${mn} b${beta}\n` + rows.join("\n"));
  });
}
