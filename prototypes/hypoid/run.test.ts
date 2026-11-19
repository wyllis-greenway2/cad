// A hypoid pair in the kernel: the overlap at the meshing place, rolled a little, and half a pitch round. Set Z1, Z2, MN, BETA, E in the environment.
import test from "node:test";
import { kernel } from "../../app/src/compiler/kernel/index.ts";
import { hypoidPairOf } from "./hypoid.ts";
import { overlap } from "./bodies.ts";

test("hypoid pair overlap", async () => {
  await kernel.init();
  const [z1, z2, mn, beta, E] = [Number(process.env.Z1 ?? 20), Number(process.env.Z2 ?? 40), Number(process.env.MN ?? 3), Number(process.env.BETA ?? 35), Number(process.env.E ?? -20)];
  const r = hypoidPairOf(z1, z2, mn, beta, E);
  if (!r.ok) throw new Error(r.error);
  const pr = r.value;
  console.log(`PAIR ${z1}/${z2} m${mn} b${beta} E${E}: pinion cone ${(pr.pinion.gamma * 57.2958).toFixed(2)}, ring cone ${(pr.ring.gamma * 57.2958).toFixed(2)}`);
  for (const [name, tp, tr] of [["at the place", 0, 0], ["rolled by 0.05", 0.05, -pr.kk * 0.05], ["half a pitch round", 0, Math.PI / z2]] as const) {
    const o = overlap(pr, tp, tr);
    console.log(`ROW ${name}: ${o.none ? "nothing in common" : `${o.vol.toFixed(1)} mm3`} (bodies ${o.vols.join(", ")})`);
  }
});
