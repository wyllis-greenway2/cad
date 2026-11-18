import test from "node:test";
import { example, overlap } from "./facebody.ts";
import { kernel } from "../../app/src/compiler/kernel/index.ts";
test("the face gear and its spur pinion in the kernel", async () => {
  await kernel.init();
  const pr = example({ ...(process.env.Z1 ? { z1: Number(process.env.Z1) } : {}), ...(process.env.Z2 ? { z2: Number(process.env.Z2) } : {}), ...(process.env.M ? { m: Number(process.env.M) } : {}), ...(process.env.RIN ? { rIn: Number(process.env.RIN) } : {}), ...(process.env.ROUT ? { rOut: Number(process.env.ROUT) } : {}) });
  const k = pr.spec.z1 / pr.spec.z2;
  const rows: string[] = [];
  for (const [name, tp, tf] of [["at the place", 0, 0], ["rolled by 0.05", 0.05, k * 0.05], ["pinion half a pitch round", Math.PI / pr.spec.z1, 0]] as const) {
    const o = overlap(pr, tp, tf);
    rows.push(`${name}: ${o.none ? "nothing in common" : `${o.vol.toFixed(1)} mm3`} (bodies ${o.vols.join(", ")})`);
  }
  console.log("ROWS\n" + rows.join("\n"));
});
