// A ring, a hole that nearly grazes the bore and stops short, then the hole's flat end pulled on until it breaks into the bore.
// NOTE (in_1493): the volume differences this prints are kernel noise, not a leftover sliver; see dev/hole-reference.ts and dev/pull-equivalence-check.ts. Compares: (A) the hole cut to full depth in one step (the original step edited), (B) the hole cut short, then its end face pushed (a later pull).
//   node --experimental-strip-types dev/tangent-hole-experiment.ts
import { initKernel } from "../src/engine/kernel.ts";
import * as K from "../src/engine/kernel.ts";
await initKernel();
const R = 20, r = 12, Hh = 30, a = 3;
const ring = () => { const f = K.profileFace({ kind: "circle", c: [0, 0, 0], r: R, normal: [0, 0, 1] }, [{ kind: "circle", c: [0, 0, 0], r, normal: [0, 0, 1] }]); return K.prism(f, [0, 0, Hh]).solid; };
const hole = (y0: number, x0: number, len: number) => K.prism(K.profileFace({ kind: "circle", c: [x0, y0, Hh / 2], r: a, normal: [1, 0, 0] }), [len, 0, 0]);
const stats = (s: K.Solid) => { const fs = s.faces().map((f) => K.facts(f)); return { valid: K.valid(s), vol: K.volume(s), faces: fs.length, tiny: fs.filter((q) => q.area < 0.05).length }; };
console.log("eps = how far the hole's edge reaches into the bore's width; the bore wall there is sqrt(2*r*eps) from the middle");
console.log("eps".padEnd(9), "A: valid  volume     faces tiny | B: valid  volume     faces tiny | volume diff");
for (const eps of [1, 0.3, 0.1, 0.03, 0.01, 0.003, 0.001, 1e-4, 1e-6, 0, -1e-4]) {
  const y0 = r - eps + a, wall = -Math.sqrt(Math.max(0, r * r - (r - eps) ** 2)), stop = wall - 1, past = 1;
  let A: ReturnType<typeof stats> | string, B: ReturnType<typeof stats> | string;
  try { const t = hole(y0, -30, past + 30); A = stats(K.cut(ring(), t.solid).solid); } catch (e) { A = String((e as Error).message ?? e); }
  try {
    const t1 = hole(y0, -30, stop + 30), body = K.cut(ring(), t1.solid).solid;
    const endFace = body.faces().find((f) => { const q = K.facts(f); return q.type === "PLANE" && Math.abs(q.ne[0]) > 0.99 && Math.abs(q.ce[0] - stop) < 1e-6; })!;
    const push = K.prism(endFace, [past - stop, 0, 0]);
    B = stats(K.cut(body, push.solid).solid);
  } catch (e) { B = String((e as Error).message ?? e); }
  const f = (s: typeof A) => typeof s === "string" ? s.slice(0, 30).padEnd(34) : `${String(s.valid).padEnd(6)} ${s.vol.toFixed(3).padStart(9)} ${String(s.faces).padStart(5)} ${String(s.tiny).padStart(4)}`;
  const diff = typeof A !== "string" && typeof B !== "string" ? (B.vol - A.vol).toFixed(5) : "-";
  console.log(String(eps).padEnd(9), f(A), "|", f(B), "|", diff);
}
