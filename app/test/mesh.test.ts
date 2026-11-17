// A gear that fits another (`dec_gear_tool`, `in_547`): the rack's outline, and where a meshing gear, ring partner or rack goes, checked by teeth that do not run into each other.
import test from "node:test";
import assert from "node:assert/strict";
import { gearOutline } from "../src/operation/gear.ts";
import type { GearSpec, GearOutline } from "../src/operation/gear.ts";
import { meshWith } from "../src/operation/mesh.ts";
import type { GearRecord } from "../src/operation/gearscene.ts";

const U = [1, 0, 0] as const, V = [0, 1, 0] as const;
const must = (spec: GearSpec): GearOutline => { const o = gearOutline(spec); assert.ok(o.ok, o.ok ? "" : o.error); return (o as { value: GearOutline }).value; };
type P = [number, number];
/** the outline of a record as a polygon in the plane, arcs as short chains */
function polygon(spec: GearSpec, at: readonly number[], turn: number): P[] {
  const o = must(spec);
  const [c, s] = [Math.cos(turn), Math.sin(turn)];
  const place = (q: P): P => [at[0]! + q[0] * c - q[1] * s, at[1]! + q[0] * s + q[1] * c];
  const out: P[] = [];
  o.points.forEach((a, i) => {
    const b = o.points[(i + 1) % o.points.length]!;
    const k = o.bulges[i]!;
    out.push(place([a[0], a[1]]));
    if (k) for (const f of [0.25, 0.5, 0.75]) { // (the arc through the middle: a quadratic stand-in is close for these short arcs)
      const m: P = [(a[0] + b[0]) / 2 - (b[1] - a[1]) * k, (a[1] + b[1]) / 2 + (b[0] - a[0]) * k];
      const t = f;
      out.push(place([(1 - t) * (1 - t) * a[0] + 2 * t * (1 - t) * (2 * m[0] - (a[0] + b[0]) / 2) + t * t * b[0], (1 - t) * (1 - t) * a[1] + 2 * t * (1 - t) * (2 * m[1] - (a[1] + b[1]) / 2) + t * t * b[1]]));
    }
  });
  return out;
}
const inside = (p: P, poly: P[]): boolean => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [a, b] = [poly[i]!, poly[j]!]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
const edgeDist = (p: P, poly: P[]): number => { let d = Infinity; for (let i = 0; i < poly.length; i++) { const [a, b] = [poly[i]!, poly[(i + 1) % poly.length]!]; const [dx, dy] = [b[0] - a[0], b[1] - a[1]]; const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1))); d = Math.min(d, Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)); } return d; };
/** how deep the corners of one outline go into the other, either way (mm) */
const penetration = (a: P[], b: P[]): number => Math.max(0, ...a.filter((p) => inside(p, b)).map((p) => edgeDist(p, b)), ...b.filter((p) => inside(p, a)).map((p) => edgeDist(p, a)));
const rec = (spec: GearSpec, at: readonly number[] = [0, 0, 0], turn = 0): GearRecord => ({ id: "g_001", plane: "w/XY" as never, at: [...at] as unknown as GearRecord["at"], spec, ...(turn ? { turn } : {}) });

test("a rack: straight sides, the pitch line through the middle of its length, n pi m long; the teeth are 90 degrees minus the pressure angle off upright", () => {
  const o = must({ teeth: 10, module: 2, rack: true });
  assert.ok(Math.abs(o.length! - 10 * Math.PI * 2) < 1e-9);
  assert.ok(o.bulges.every((b) => b === 0));
  const xs = o.points.map((p) => p[0]), ys = o.points.map((p) => p[1]);
  assert.ok(Math.abs(Math.min(...xs) + o.length! / 2) < 1e-9 && Math.abs(Math.max(...xs) - o.length! / 2) < 1e-9);
  assert.ok(Math.abs(Math.max(...ys) - 2) < 1e-9, "tip a module above the pitch line");
  assert.ok(Math.abs(Math.min(...ys) - (-2.5 - 4)) < 1e-9, "root a module and a quarter below, then two modules of bar");
  // one tooth: pi m / 2 thick on the pitch line (y = 0), its sides 20 degrees off the upright
  const one = must({ teeth: 1, module: 2, rack: true }).points.filter((p) => p[0] > -Math.PI * 2 / 2 * 2 + 1e-6 && p[0] < Math.PI * 2 / 2 * 2 - 1e-6 && p[1] > -2.5 - 1e-9 && p[1] <= 2 + 1e-9 && Math.abs(p[0]) < Math.PI * 2 / 2 - 1e-6).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const [foot, tipP] = [one.find((p) => Math.abs(p[1] + 2.5) < 1e-9 && p[0] > 0)!, one.find((p) => Math.abs(p[1] - 2) < 1e-9 && p[0] > 0)!];
  assert.ok(Math.abs(Math.atan2(foot[0] - tipP[0], 4.5) * 180 / Math.PI - 20) < 1e-9, `${Math.atan2(foot[0] - tipP[0], 4.5) * 180 / Math.PI}`);
  const halfAtPitch = tipP[0] + 2 * Math.tan(Math.PI / 9);
  assert.ok(Math.abs(2 * halfAtPitch - Math.PI * 2 / 2) < 1e-9, "pi m / 2 thick on the pitch line");
  assert.ok(!gearOutline({ teeth: 0, module: 2, rack: true }).ok);
});

test("a gear meshes with a gear: at m (z1 + z2) / 2, the teeth of one in the gaps of the other, for every direction and any turn of the first; half a pitch out they run into each other", () => {
  for (const [z1, z2, turn1] of [[20, 20, 0], [20, 31, 0.3], [24, 12, 1.1], [17, 50, -0.7]] as const) {
    for (const phi of [0, 0.7, 2.1, -1.9]) {
      const a = rec({ teeth: z1, module: 2 }, [5, -3, 0], turn1);
      const r = meshWith(a, U, V, { teeth: z2 }, phi);
      assert.ok(r.ok, r.ok ? "" : r.error);
      if (!r.ok) return;
      const [pa, pb] = [polygon(a.spec, a.at, turn1), polygon(r.value.spec, r.value.at, r.value.turn)];
      assert.ok(Math.abs(Math.hypot(r.value.at[0] - 5, r.value.at[1] + 3) - 2 * (z1 + z2) / 2) < 1e-9, "centre distance");
      assert.ok(penetration(pa, pb) < 0.02, `${z1}/${z2} at ${phi}: ${penetration(pa, pb)}`);
      const out = polygon(r.value.spec, r.value.at, r.value.turn + Math.PI / z2); // (half a pitch of the partner)
      assert.ok(penetration(pa, out) > 0.5, `out of step ${penetration(pa, out)}`);
    }
  }
});

test("a gear in a ring: the centre is (zr - z) m / 2 from the ring's, the teeth fit, and the gear needs fewer teeth than the ring", () => {
  for (const [zr, z, turn1] of [[40, 16, 0], [48, 20, 0.5]] as const) {
    for (const phi of [0, 1.3, -2.4]) {
      const ring = rec({ teeth: zr, module: 2, internal: true }, [0, 0, 0], turn1);
      const r = meshWith(ring, U, V, { teeth: z }, phi);
      assert.ok(r.ok, r.ok ? "" : r.error);
      if (!r.ok) return;
      assert.ok(Math.abs(Math.hypot(r.value.at[0], r.value.at[1]) - (zr - z)) < 1e-9);
      // the gear's corners must not go into the ring's material: the ring's hole outline has its teeth pointing in, so the gear is inside the hole polygon (and clear of it)
      const [hole, gear] = [polygon(ring.spec, ring.at, turn1), polygon(r.value.spec, r.value.at, r.value.turn)];
      const deep = Math.max(0, ...gear.filter((p) => !inside(p, hole)).map((p) => edgeDist(p, hole)));
      assert.ok(deep < 0.02, `${zr}/${z} at ${phi}: ${deep}`);
      const out = polygon(r.value.spec, r.value.at, r.value.turn + Math.PI / z);
      assert.ok(Math.max(0, ...out.filter((p) => !inside(p, hole)).map((p) => edgeDist(p, hole))) > 0.3, "half a pitch out, it runs into the ring");
    }
  }
  assert.ok(!meshWith(rec({ teeth: 30, module: 2, internal: true }), U, V, { teeth: 30 }, 0).ok);
});

test("a rack meshes with a gear (the rack goes under it, tangent to its pitch circle) and a gear with a rack (it goes on the rack where it is asked); nothing runs into anything", () => {
  for (const [z, turn1, phi] of [[20, 0, -Math.PI / 2], [18, 0.4, -0.3], [25, -1, 2.2]] as const) {
    const g = rec({ teeth: z, module: 2 }, [1, 2, 0], turn1);
    const r = meshWith(g, U, V, { teeth: 12, rack: true }, phi);
    assert.ok(r.ok, r.ok ? "" : r.error);
    if (!r.ok) return;
    const [pg, pr] = [polygon(g.spec, g.at, turn1), polygon(r.value.spec, r.value.at, r.value.turn)];
    assert.ok(penetration(pg, pr) < 0.02, `${z} at ${phi}: ${penetration(pg, pr)}`);
    // the pitch line is z m / 2 from the gear's centre
    const rr = r.value.at;
    const d = Math.abs((rr[0] - 1) * Math.cos(phi) + (rr[1] - 2) * Math.sin(phi));
    assert.ok(Math.abs(d - z) < 1e-9, `distance to the pitch line ${d}`);
    // and the other way: a gear on that rack, at a place along it
    const rack = rec(r.value.spec, r.value.at, r.value.turn);
    for (const o of [0, 7.3, -11]) {
      const back = meshWith(rack, U, V, { teeth: 16 }, o);
      assert.ok(back.ok, back.ok ? "" : back.error);
      if (!back.ok) return;
      const pa: P[] = polygon(rack.spec, rack.at, r.value.turn), pb: P[] = polygon(back.value.spec, back.value.at, back.value.turn);
      assert.ok(penetration(pa, pb) < 0.02, `gear on the rack at ${o}: ${penetration(pa, pb)}`);
      const out = polygon(back.value.spec, back.value.at, back.value.turn + Math.PI / 16);
      assert.ok(penetration(pa, out) > 0.5, "half a pitch out");
    }
  }
});

test("what cannot mesh is refused with the reason: a shifted gear, a gear as big as its ring, a rack on a rack or a ring", () => {
  const shifted = meshWith(rec({ teeth: 20, module: 2, shift: 0.3 }), U, V, { teeth: 20 }, 0);
  assert.ok(!shifted.ok && /profile shift/.test(shifted.error));
  const big = meshWith(rec({ teeth: 30, module: 2, internal: true }), U, V, { teeth: 30 }, 0);
  assert.ok(!big.ok && /fewer teeth/.test(big.error));
  assert.ok(!meshWith(rec({ teeth: 10, module: 2, rack: true }), U, V, { teeth: 5, rack: true }, 0).ok);
  assert.ok(!meshWith(rec({ teeth: 30, module: 2, internal: true }), U, V, { teeth: 5, rack: true }, 0).ok);
});

test("a ring round a gear (`in_593`): the ring's middle is (zr - z) m / 2 from the gear's in the direction asked, the gear's teeth fit the ring's, and half a pitch out they run into it", () => {
  for (const [z, zr, turn1] of [[16, 40, 0], [20, 48, 0.5]] as const) {
    for (const phi of [0, 1.3, -2.4]) {
      const gear = rec({ teeth: z, module: 2 }, [3, -2, 0], turn1);
      const r = meshWith(gear, U, V, { teeth: zr, ring: true }, phi);
      assert.ok(r.ok, r.ok ? "" : r.error);
      if (!r.ok) return;
      assert.equal(r.value.spec.internal, true, "it is a ring");
      assert.ok(Math.abs(Math.hypot(r.value.at[0] - 3, r.value.at[1] + 2) - (zr - z)) < 1e-9, "centre distance");
      assert.ok(Math.abs(Math.atan2(r.value.at[1] + 2, r.value.at[0] - 3) - phi) < 1e-9 || Math.abs(Math.abs(Math.atan2(r.value.at[1] + 2, r.value.at[0] - 3) - phi) - 2 * Math.PI) < 1e-9, "in the direction asked");
      const [hole, g] = [polygon(r.value.spec, r.value.at, r.value.turn), polygon(gear.spec, gear.at, turn1)];
      const deep = Math.max(0, ...g.filter((p) => !inside(p, hole)).map((p) => edgeDist(p, hole)));
      assert.ok(deep < 0.02, `${z}/${zr} at ${phi}: ${deep}`);
      const out = polygon(r.value.spec, r.value.at, r.value.turn + Math.PI / zr);
      assert.ok(Math.max(0, ...g.filter((p) => !inside(p, out)).map((p) => edgeDist(p, out))) > 0.3, "half a pitch out, the gear runs into the ring");
    }
  }
  assert.ok(!meshWith(rec({ teeth: 30, module: 2 }), U, V, { teeth: 30, ring: true }, 0).ok, "a ring needs more teeth than the gear");
  assert.ok(!meshWith(rec({ teeth: 30, module: 2, internal: true }), U, V, { teeth: 40, ring: true }, 0).ok, "no ring round a ring");
  assert.ok(!meshWith(rec({ teeth: 20, module: 2, rack: true }), U, V, { teeth: 40, ring: true }, 0).ok, "no ring round a rack");
});
