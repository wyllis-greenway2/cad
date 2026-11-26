// Which is right, the hole cut in one step (A) or the hole cut short and its end pushed (B)? An independent number: the volume taken out of the ring, integrated by hand.
//   node --experimental-strip-types dev/hole-reference.ts
import { initKernel } from "../src/engine/kernel.ts";
import * as K from "../src/engine/kernel.ts";
await initKernel();
const R = 20,
  r = 12,
  Hh = 30,
  a = 3,
  past = 1;
const ring = () =>
  K.prism(
    K.profileFace({ kind: "circle", c: [0, 0, 0], r: R, normal: [0, 0, 1] }, [
      { kind: "circle", c: [0, 0, 0], r, normal: [0, 0, 1] },
    ]),
    [0, 0, Hh],
  ).solid;
const hole = (y0: number, x0: number, len: number) =>
  K.prism(K.profileFace({ kind: "circle", c: [x0, y0, Hh / 2], r: a, normal: [1, 0, 0] }), [len, 0, 0]);
// volume taken out: the integral over y of (length of material along x, for x <= past) times the height of the hole's chord at that y
const reference = (y0: number): number => {
  const n = 400000,
    lo = y0 - a,
    hi = y0 + a;
  let v = 0;
  for (let i = 0; i < n; i++) {
    const y = lo + ((i + 0.5) / n) * (hi - lo),
      Xo = Math.sqrt(Math.max(0, R * R - y * y)),
      Xi = Math.abs(y) < r ? Math.sqrt(r * r - y * y) : 0;
    const len = Xo + Math.min(Xo, past) - (Xi + Math.min(Xi, past)),
      chord = 2 * Math.sqrt(Math.max(0, a * a - (y - y0) ** 2));
    v += len * chord * ((hi - lo) / n);
  }
  return v;
};
const full = K.volume(ring());
console.log(
  "eps       reference removed     A removed (one cut)   B removed (cut short, pushed)   A - ref     B - ref",
);
for (const eps of [0.3, 0.03, 0.003, 1e-4, 0]) {
  const y0 = r - eps + a,
    wall = -Math.sqrt(Math.max(0, r * r - (r - eps) ** 2)),
    stop = wall - 1;
  const A = K.cut(ring(), hole(y0, -30, past + 30).solid).solid;
  const t1 = hole(y0, -30, stop + 30),
    body = K.cut(ring(), t1.solid).solid;
  const end = body.faces().find((f) => {
    const q = K.facts(f);
    return q.type === "PLANE" && Math.abs(q.ne[0]) > 0.99 && Math.abs(q.ce[0] - stop) < 1e-6;
  })!;
  const B = K.cut(body, K.prism(end, [past - stop, 0, 0]).solid).solid;
  const ref = reference(y0),
    ra = full - K.volume(A),
    rb = full - K.volume(B);
  console.log(
    String(eps).padEnd(9),
    ref.toFixed(4).padStart(14),
    ra.toFixed(4).padStart(22),
    rb.toFixed(4).padStart(26),
    (ra - ref).toExponential(2).padStart(14),
    (rb - ref).toExponential(2).padStart(10),
  );
}
