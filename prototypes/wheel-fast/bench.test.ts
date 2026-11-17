// Compares the prototype's sections with the app's: time, and the largest distance between corresponding points.
import test from "node:test";
import { wheelSections as app } from "../../app/src/operation/wheelsections.ts";
import { wheelSections as fast } from "./sections.ts";
const W = JSON.parse(process.env.W ?? '{"module":2,"diameter":24,"starts":1,"width":10}');
const spec = (z: number): any => ({ teeth: z, module: W.module, wheel: { diameter: W.diameter, starts: W.starts, width: W.width } });
test("sections", () => {
  for (const z of (process.env.ZS ?? "20,40,80").split(",").map(Number)) {
    (globalThis as any).__mc = 0; (globalThis as any).__cr = 0; let t = performance.now(); const a: any = app(spec(z)); const ta = performance.now() - t;
    const appCalls = (globalThis as any).__mc; (globalThis as any).__mc = 0; (globalThis as any).__cr = 0; t = performance.now(); const b: any = fast(spec(z)); console.log('prototype material calls', (globalThis as any).__mc, 'crossings', (globalThis as any).__cr); const tb = performance.now() - t;
    let worst = 0, n = 0, bulge = 0;
    if (a.ok && b.ok) for (let k = 0; k < a.value.length; k++) { const [p, q] = [a.value[k], b.value[k]]; if (p.points.length !== q.points.length) { worst = NaN; break; } p.points.forEach((pt: number[], i: number) => { worst = Math.max(worst, Math.hypot(pt[0]! - q.points[i][0], pt[1]! - q.points[i][1])); bulge = Math.max(bulge, Math.abs(p.bulges[i] - q.bulges[i])); n++; }); }
    console.log(`Z ${z}: app ${ta.toFixed(0)} ms, prototype ${tb.toFixed(0)} ms (${(ta / tb).toFixed(1)}x), points ${n}, worst point gap ${worst.toExponential(2)} mm, worst bulge gap ${bulge.toExponential(2)}`);
  }
});
