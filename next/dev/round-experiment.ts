// Where does the kernel's fillet/chamfer stop working? The rim of a rod end, size up to and past the radius.
//   node --experimental-strip-types dev/round-experiment.ts
import { initKernel } from "../src/engine/kernel.ts";
import * as K from "../src/engine/kernel.ts";
await initKernel();
const run = (label: string, make: () => K.Solid, pick: (s: K.Solid) => K.EdgeH[], sizes: number[]) => {
  console.log(label);
  for (const mode of ["fillet", "chamfer"] as const) {
    const out: string[] = [];
    for (const size of sizes) {
      try {
        const s = make(),
          r = K.roundEdges(s, pick(s), size, mode),
          ok = K.valid(r.solid);
        out.push(`${size}:${ok ? K.volume(r.solid).toFixed(0) : "INVALID"}`);
      } catch (e) {
        out.push(`${size}:fail`);
      }
    }
    console.log("  ", mode.padEnd(8), out.join("  "));
  }
};
const cap = (s: K.Solid, up: boolean) =>
  s.faces().find((f) => {
    const q = K.facts(f);
    return q.type === "PLANE" && q.ne[2] * (up ? 1 : -1) > 0.99;
  })!;
const rod = (r: number, h: number) =>
  K.prism(K.profileFace({ kind: "circle", c: [0, 0, 0], r, normal: [0, 0, 1] }), [0, 0, h]).solid;
run(
  "(a) rod r=10, h=30: round the top rim",
  () => rod(10, 30),
  (s) => K.faceEdges(cap(s, true)),
  [2, 5, 8, 9, 9.5, 9.9, 10, 10.1, 12],
);
// (b) the crossed rods were removed from here: this file picked the wrong edges (cap edges, a coaxial "90"), so its results were wrong. See prototypes/round-limits (spike_b.mjs) for the corrected test.
