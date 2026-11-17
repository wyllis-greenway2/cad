// The worm wheel's speed changes (`dec_gear_speed`, `in_706`): the sections are worked out quickly and to the same shape, the smooth loft through them is no longer refused by the validity check, and the faces of a loft are named without the exact box of each.
import test from "node:test";
import assert from "node:assert/strict";
import { makeSphere } from "replicad";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import { worldRef } from "../src/shared/ref.ts";
import { wheelSections } from "../src/operation/wheelsections.ts";
import type { GearSpec } from "../src/operation/gear.ts";
import { surfacesOf } from "../src/compiler/kernel/occt/facenames.mjs";

await kernel.init();
const wheel = (teeth: number, starts = 1, bore?: number): GearSpec => ({ teeth, module: 2, ...(bore ? { bore } : {}), wheel: { diameter: 24, starts, width: 10 } });
const bodyVolumes = (spec: GearSpec) => {
  const s = run(createSession(kernel), { type: "gear", id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], spec });
  const errors = ((s.outcome as unknown as { kernel?: { ops?: { error: string | null }[] } }).kernel?.ops ?? []).map((o) => o.error).filter(Boolean);
  return { errors, volumes: Object.values(scene(s).parts).flatMap((p) => (p.kind === "body" ? [(p as { volume?: number }).volume ?? 0] : [])) };
};

// the numbers the sections had before they were made quicker (worked out by the old scan: 24 bisections a crossing, every node, 0.03 radian steps), taken at points of the first, middle and last section
const GOLD: Record<string, { h: number; n: number; pts: number[][]; bul: number[] }[]> = {
  m2s1z24: [{"h":-5,"n":456,"pts":[[-1.94061,-27.27079],[-0.85415,-25.705],[0.16588,-23.38383],[1.10362,-22.89667],[2.3442,-23.79741],[4.41246,-26.98132],[5.18371,-26.84382],[12.08929,-23.32352],[-2.72117,-27.20399]],"bul":[-0.00528,0.18903,-0.00346,-0.00358]},{"h":0,"n":456,"pts":[[-0.98591,-25.9813],[-0.18169,-24.45797],[0.41971,-22.24833],[1.43907,-21.95283],[2.66677,-22.65702],[4.36871,-25.63034],[5.77214,-25.35118],[12.12317,-21.84444],[-2.41377,-25.88771]],"bul":[-0.00579,0.21358,-0.00327,-0.00688]},{"h":5,"n":456,"pts":[[-0.85294,-27.32644],[0.10737,-25.68039],[0.9099,-23.27736],[1.89449,-22.84483],[3.15798,-23.78068],[5.48356,-26.78418],[6.24872,-26.61607],[12.96056,-22.82129],[-1.63554,-27.29078]],"bul":[-0.00542,0.30734,-0.00346,-0.00358]}],
  m2s2z30: [{"h":-5,"n":570,"pts":[[-7.53247,-32.47769],[-6.22978,-31.10291],[-4.80618,-29.02117],[-3.81695,-28.6703],[-2.74577,-29.73019],[-1.52729,-33.30475],[-0.61538,-33.33407],[6.77265,-31.55116],[-8.41836,-32.25942]],"bul":[-0.00454,0.12298,-0.00272,-0.00342]},{"h":0,"n":570,"pts":[[-5.93018,-31.44571],[-4.93513,-30.04509],[-3.9698,-27.97223],[-2.92632,-27.84662],[-1.84876,-28.75256],[-0.73734,-31.9915],[0.73734,-31.9915],[7.62331,-30.021],[-7.37264,-31.13911]],"bul":[-0.00491,0.22755,-0.00256,-0.00576]},{"h":5,"n":570,"pts":[[-5.43054,-32.8945],[-4.34498,-31.34272],[-3.29171,-29.05376],[-2.22721,-28.83738],[-1.14134,-29.98815],[0.61538,-33.33407],[1.52728,-33.30475],[8.68469,-31.02481],[-6.32861,-32.73358]],"bul":[-0.00478,0.34646,-0.00272,-0.00342]}],
};
const SPECS: Record<string, GearSpec> = { m2s1z24: wheel(24), m2s2z30: wheel(30, 2) };

test("the sections of a wheel are the same shape as the slow scan made them, to a few thousandths of a millimetre", () => {
  for (const [name, spec] of Object.entries(SPECS)) {
    const r = wheelSections(spec);
    assert.ok(r.ok, name);
    const got = [r.value[0]!, r.value[2]!, r.value[4]!];
    GOLD[name]!.forEach((g, k) => {
      const s = got[k]!;
      assert.equal(s.points.length, g.n, `${name} section ${k}: the same number of points`);
      assert.ok(Math.abs(s.h - g.h) < 1e-9);
      const idx = [0, 3, 7, 9, 12, 18, 19, 40, s.points.length - 1];
      idx.forEach((i, m) => assert.ok(Math.hypot(s.points[i]![0] - g.pts[m]![0]!, s.points[i]![1] - g.pts[m]![1]!) < 0.005, `${name} section ${k} point ${i}`));
      [0, 7, 9, 18].forEach((i, m) => assert.ok(Math.abs(s.bulges[i]! - g.bul[m]!) < 0.01, `${name} section ${k} bulge ${i}`));
    });
  }
});

test("the sections of a 40 tooth wheel take a second or so, not four (it was 3.4 s)", () => {
  const spec = wheel(40);
  wheelSections({ ...spec, module: 2.01 }); // (warm the code; another module, so the answer is not the kept one)
  const t = performance.now();
  assert.ok(wheelSections(spec).ok);
  const ms = performance.now() - t;
  assert.ok(ms < 2500, `${ms.toFixed(0)} ms`);
});

test("a wheel is made for tooth counts the validity check used to refuse (24, 32, 48 teeth), with the volume the loft has", () => {
  for (const [teeth, volume] of [[24, 18566.5], [32, 32819.0], [48, 73390.2]] as const) {
    const r = bodyVolumes(wheel(teeth));
    assert.deepEqual(r.errors, [], `${teeth} teeth`);
    assert.equal(r.volumes.length, 1, `${teeth} teeth: one body`);
    assert.ok(Math.abs(r.volumes[0]! - volume) < 2, `${teeth} teeth: ${r.volumes[0]} mm3, expected about ${volume}`);
  }
});

test("a bored wheel takes the bore's volume out of the loft's, exactly", () => {
  const [plain, bored] = [bodyVolumes(wheel(24)), bodyVolumes(wheel(24, 1, 8))];
  assert.deepEqual(bored.errors, []);
  assert.ok(Math.abs(plain.volumes[0]! - bored.volumes[0]! - Math.PI * 16 * 10) < 0.5, `${plain.volumes[0]} - ${bored.volumes[0]}`);
});

test("the quick box that names a freeform face contains the face (a sphere's box is its own, a little over); a body with few freeform faces keeps the exact box", () => {
  const faces = surfacesOf(makeSphere(5), 0).filter((f) => f.kind === "surf");
  assert.ok(faces.length >= 1);
  const exact = surfacesOf(makeSphere(5)).filter((f) => f.kind === "surf");
  assert.ok(exact.length >= 1 && exact.every((f) => f.hi.every((v) => Math.abs(v - 5) < 1e-6)), "the exact box of a sphere is its own");
  for (const f of faces) for (let k = 0; k < 3; k++) { assert.ok(f.lo[k]! <= -4.999 && f.lo[k]! > -5.5, `lo ${f.lo}`); assert.ok(f.hi[k]! >= 4.999 && f.hi[k]! < 5.5, `hi ${f.hi}`); }
});
