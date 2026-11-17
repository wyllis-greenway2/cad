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

test("the sections of a wheel start where the slow scan had them and every tooth is the first turned, to a few thousandths of a millimetre", () => {
  for (const [name, spec] of Object.entries(SPECS)) {
    const r = wheelSections(spec);
    assert.ok(r.ok, name);
    const got = [r.value[0]!, r.value[2]!, r.value[4]!];
    GOLD[name]!.forEach((g, k) => {
      const s = got[k]!;
      const per = s.points.length / spec.teeth; // (the points of a tooth: the arcs of its gap and its top)
      assert.ok(Number.isInteger(per) && per >= 6, `${name} section ${k}: ${per} points a tooth`);
      assert.ok(Math.abs(s.h - g.h) < 1e-9);
      // the gap starts where the old scan had it (the arcs between are cut by their number: the start of each tooth, and of the first, are the contour's own points)
      assert.ok(Math.hypot(s.points[0]![0] - g.pts[0]![0]!, s.points[0]![1] - g.pts[0]![1]!) < 0.005, `${name} section ${k} first point`);
      // every tooth is the first one turned
      const turn = (2 * Math.PI) / spec.teeth;
      for (const t of [1, spec.teeth - 1]) {
        const [c, sn] = [Math.cos(t * turn), Math.sin(t * turn)];
        const [x, y] = [g.pts[0]![0]!, g.pts[0]![1]!];
        const p = s.points[t * per]!;
        assert.ok(Math.hypot(p[0] - (x * c - y * sn), p[1] - (x * sn + y * c)) < 0.005, `${name} section ${k} tooth ${t}`);
      }
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
    assert.ok(Math.abs(r.volumes[0]! - volume) < 5e-4 * volume, `${teeth} teeth: ${r.volumes[0]} mm3, expected about ${volume} (the arcs of the gap are 12 and not 18: a few hundredths of a per cent)`);
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

test("a wheel of many teeth has the coarser screen mesh (freeform faces by the hundred), and its names of faces and edges are the same kept and worked out from nothing", async () => {
  const { clearKernelCaches } = await import("../src/compiler/kernel/occt/interpreter.mjs");
  const { graphOf } = await import("../src/compiler/compile.ts");
  const s = run(createSession(kernel), { type: "gear", id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], spec: wheel(60) });
  const graph = { ...graphOf(scene(s)), names: true } as Parameters<typeof kernel.evaluate>[0];
  const kept = kernel.evaluate(graph, { tolerance: 0.05, angular: 0.3 });
  assert.ok(kept.mesh && kept.mesh.triangles.length / 3 < 120000, `${kept.mesh ? kept.mesh.triangles.length / 3 : 0} triangles (it was 200 thousand and more)`);
  assert.ok(kept.mesh!.triangles.length / 3 > 5000, "and it is still a wheel");
  clearKernelCaches();
  const fresh = kernel.evaluate(graph, { tolerance: 0.06, angular: 0.35 });
  assert.deepEqual(fresh.faceNames, kept.faceNames);
  assert.deepEqual(fresh.edgeNames, kept.edgeNames);
});

test("a wheel's loft is not checked for matching sections (`in_823`): the same volume as before to every digit, and a loft told it is matched when it is not still comes out right", () => {
  const v = bodyVolumes(wheel(60));
  assert.deepEqual(v.errors, []);
  assert.ok(Math.abs(v.volumes[0]! - 114392.87812056803) < 0.01, `60 teeth: ${v.volumes[0]}`); // (the volume with the checked loft)
  const sq = { id: "s_a", type: "sketch", shape: "polygon", points: [[-5, -5], [5, -5], [5, 5], [-5, 5]], plane: "XY", origin: 0 };
  const hex = { id: "s_b", type: "sketch", shape: "polygon", points: Array.from({ length: 6 }, (_, i) => [8 * Math.cos(i * Math.PI / 3), 8 * Math.sin(i * Math.PI / 3)]), plane: "XY", origin: 10 };
  for (const matched of [false, true]) {
    const r = kernel.evaluate({ params: {}, ops: [sq, hex, { id: "x_l", type: "loft", sections: [{ profile: "s_a", holes: [] }, { profile: "s_b", holes: [] }], smooth: true, matched }] } as never) as unknown as { ops: { id: string; error: string | null }[]; volume: number };
    assert.equal(r.ops.find((o) => o.id === "x_l")!.error, null, `matched ${matched}`);
    assert.ok(r.volume > 1000 && r.volume < 2000, `matched ${matched}: ${r.volume}`);
  }
});
