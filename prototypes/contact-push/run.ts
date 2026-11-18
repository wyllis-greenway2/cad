// Contact-driven Geneva (a prototype): the crank and the locking disc are turned by the amount asked, and the wheel is moved by the smallest angle that clears it of the pin and the disc (the push rule of `dec_contact_push`), using only the app's
// existing mesh test (`operation/collide.ts`, as the hard bodies use it). No formula for the wheel: compared afterwards with `genevaTurn`. Run: `node prototypes/contact-push/run.ts` from the repository root.
import { worldRef } from "../../app/src/shared/ref.ts";
import { kernel } from "../../app/src/compiler/kernel/index.ts";
import { createSession, scene, run } from "../../app/src/interaction/session.ts";
import { genevaBodies, genevaTurn } from "../../app/src/operation/gearcouple.ts";
import { meshOf } from "../../app/src/interaction/hard.ts";
import { collidesMoving, buildTree } from "../../app/src/operation/collide.ts";
import type { Rigid } from "../../app/src/operation/frames.ts";

await kernel.init();
const N = Number(process.env.SLOTS ?? 5), A = Number(process.env.CRANK ?? 20), PIN = 5, CLEAR = Number(process.env.CLEAR ?? 0.3);
const spec = { kind: "geneva" as const, teeth: N, diameter: 40, crank: A, pin: PIN, clearance: CLEAR, hole: -1, lift: 0, layout: "model" as const, layer: 6, plate: 3 };
const s = run(createSession(kernel), { type: "gear", id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], spec: { teeth: 1, module: 1, cam: spec } });
if (s.message) throw new Error(s.message);
const sc = scene(s);
const b = genevaBodies(sc, sc.gears![0]!);
const [wheel, disc, crankAll] = [meshOf(sc, b.wheel!), meshOf(sc, b.disc!), meshOf(sc, b.crank!)];
if (!wheel || !disc || !crankAll) throw new Error("no meshes");
// the crank's plate lies under the wheel and touches it face to face (z = 0): a layer under, not in the way. The mesh test counts a face resting on a face as a hit (the nudge it uses to break ties goes one way), so only what stands in the wheel's layer is tested: the pin.
const pinTris: number[] = [];
for (let i = 0; i + 8 < crankAll.tris.length; i += 9) if (crankAll.tris[i + 2]! > 1e-3 || crankAll.tris[i + 5]! > 1e-3 || crankAll.tris[i + 8]! > 1e-3) pinTris.push(...Array.from(crankAll.tris).slice(i, i + 9));
const crank = { tris: pinTris, tree: buildTree(pinTris) };
console.log(`triangles: wheel ${wheel.tris.length / 9}, disc ${disc.tris.length / 9}, crank ${crank.tris.length / 9}`);

const rad = (d: number) => (d * Math.PI) / 180;
const c = A / Math.sin(Math.PI / N); // (the second shaft is at (c, 0))
/** the body turned `deg` about the z axis through (cx, 0), seen from the frame of a body turned `wdeg` about the origin: one rigid motion */
function relative(deg: number, cx: number, wdeg: number): Rigid {
  const [ca, sa] = [Math.cos(rad(deg - wdeg)), Math.sin(rad(deg - wdeg))];
  const [cw, sw] = [Math.cos(rad(-wdeg)), Math.sin(rad(-wdeg))];
  const [cp, sp] = [Math.cos(rad(deg)), Math.sin(rad(deg))];
  // p -> Rz(-w) (Rz(deg)(p - D) + D) ; shift is the image of the origin
  const inner: [number, number] = [-(cp * cx) + cx, -(sp * cx)];
  const shift: [number, number, number] = [cw * inner[0] - sw * inner[1], sw * inner[0] + cw * inner[1], 0];
  return { turn: [ca, -sa, 0, sa, ca, 0, 0, 0, 1], shift, k: 1 };
}
// the wheel is drawn half a step turned (a locking arc faces the disc); angles below are from that pose
let calls = 0;
const hits = (phi: number, w: number): boolean => {
  calls += 2;
  return collidesMoving(crank.tree, relative(phi, c, w), wheel.tree, 0) || collidesMoving(disc.tree, relative(phi, c, w), wheel.tree, 0);
};
if (process.env.DIAG2) {
  const zs = (m: { tris: ArrayLike<number> }) => { let lo = 1e9, hi = -1e9; for (let i = 2; i < m.tris.length; i += 3) { lo = Math.min(lo, m.tris[i]!); hi = Math.max(hi, m.tris[i]!); } return [lo, hi]; };
  console.log("z ranges wheel/disc/crank", zs(wheel), zs(disc), zs(crank));
  const xs = (m: { tris: ArrayLike<number> }) => { let lo = 1e9, hi = -1e9; for (let i = 0; i < m.tris.length; i += 3) { lo = Math.min(lo, m.tris[i]!); hi = Math.max(hi, m.tris[i]!); } return [lo, hi]; };
  console.log("x ranges", xs(wheel), xs(disc), xs(crank));
  process.exit(0);
}
if (process.env.DIAG) {
  for (let phi = 0; phi <= 360; phi += 6) {
    const rc = collidesMoving(crank.tree, relative(phi, c, 0), wheel.tree, 0), rd = collidesMoving(disc.tree, relative(phi, c, 0), wheel.tree, 0);
    console.log(phi, rc ? "crank" : "", rd ? "disc" : "");
  }
  process.exit(0);
}
if (hits(0, 0)) console.log("(note: the rest pose already overlaps)");

let w = 0, dir = -1, worst = 0, moved = 0, jam = 0, maxStep = 0;
const t0 = performance.now();
const trace: string[] = [];
const turns = Number(process.env.TURNS ?? 2);
for (let phi = 1; phi <= 360 * turns; phi++) {
  const ts = performance.now();
  if (hits(phi, w)) {
    // find a clear angle by doubling the distance (the way the wheel was going first), then narrow to the nearest by halving: a dozen tests, not hundreds
    let found: number | null = null;
    for (let d = 0.1; d <= 12.8 && found === null; d *= 2) for (const sgn of [dir, -dir]) {
      if (hits(phi, w + sgn * d)) continue;
      let [lo, hi] = [0, d];
      for (let k = 0; k < 9; k++) { const mid = (lo + hi) / 2; if (hits(phi, w + sgn * mid)) lo = mid; else hi = mid; }
      found = sgn * hi; break;
    }
    if (found === null) { jam++; trace.push(`${phi}: JAM`); continue; }
    w += found; if (found !== 0) dir = Math.sign(found);
  }
  moved = w;
  maxStep = Math.max(maxStep, performance.now() - ts);
  const want = genevaTurn(N, A, phi);
  worst = Math.max(worst, Math.abs(w - want));
  if (phi % 90 === 0) trace.push(`${phi}: wheel ${w.toFixed(2)} formula ${want.toFixed(2)}`);
}
const ms = performance.now() - t0;
if (process.env.TRACE) console.log(trace.join("\n"));
console.log(`${N} slots, clearance ${CLEAR} mm: ${360 * turns} steps in ${ms.toFixed(0)} ms (${(ms / (360 * turns)).toFixed(2)} ms a step, ${calls} collision tests, ${(calls / (360 * turns)).toFixed(1)} a step); worst gap to the formula ${worst.toFixed(2)} degrees; jams ${jam}; slowest step ${maxStep.toFixed(1)} ms; wheel ended at ${moved.toFixed(2)} (a slot is ${(360 / N).toFixed(1)})`);
