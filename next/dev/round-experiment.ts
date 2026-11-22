// Where does the kernel's fillet/chamfer stop working? (a) the rim of a rod end, size up to and past the radius; (b) the saddle edge where a tilted rod meets a rod.
//   node --experimental-strip-types dev/round-experiment.ts
import { initKernel } from "../src/engine/kernel.ts";
import * as K from "../src/engine/kernel.ts";
await initKernel();
const run = (label: string, make: () => K.Solid, pick: (s: K.Solid) => K.EdgeH[], sizes: number[]) => {
  console.log(label);
  for (const mode of ["fillet", "chamfer"] as const) {
    const out: string[] = [];
    for (const size of sizes) {
      try { const s = make(), r = K.roundEdges(s, pick(s), size, mode), ok = K.valid(r.solid); out.push(`${size}:${ok ? K.volume(r.solid).toFixed(0) : "INVALID"}`); }
      catch (e) { out.push(`${size}:fail`); }
    }
    console.log("  ", mode.padEnd(8), out.join("  "));
  }
};
const cap = (s: K.Solid, up: boolean) => s.faces().find((f) => { const q = K.facts(f); return q.type === "PLANE" && q.ne[2] * (up ? 1 : -1) > 0.99; })!;
const rod = (r: number, h: number) => K.prism(K.profileFace({ kind: "circle", c: [0, 0, 0], r, normal: [0, 0, 1] }), [0, 0, h]).solid;
run("(a) rod r=10, h=30: round the top rim", () => rod(10, 30), (s) => K.faceEdges(cap(s, true)), [2, 5, 8, 9, 9.5, 9.9, 10, 10.1, 12]);
for (const deg of [90, 60, 30, 15]) {
  const make = () => { const a = rod(10, 40), b0 = K.prism(K.profileFace({ kind: "circle", c: [0, 0, 0], r: 6, normal: [0, 0, 1] }), [0, 0, 40]).solid; const b = K.turn(K.move(b0, [0, 0, -5]).solid, [1, 0, 0], 90 - deg, [0, 0, 0]).solid; return K.fuse(a, b).solid; };
  const pick = (s: K.Solid) => { const capEdges = new Set<K.EdgeH>(); const caps = s.faces().filter((f) => K.facts(f).type === "PLANE"); return s.edges().filter((e) => !caps.some((c) => K.faceEdges(c).some((x) => K.sameEdge(x, e)))); };
  run(`(b) rod r=10 crossed by a rod r=6 at ${deg} deg: round the junction edge(s)`, make, pick, [0.5, 1, 2, 3, 4, 5]);
}
