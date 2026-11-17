// The maths of `planetary.ts`, and the geometry: the gears made by the app's own gear outline and `meshWith`, the planets placed round the sun, and the outlines checked for teeth that run into each other.
import test from "node:test";
import assert from "node:assert/strict";
import { gearOutline } from "../../app/src/operation/gear.ts";
import type { GearSpec, GearOutline } from "../../app/src/operation/gear.ts";
import { meshWith } from "../../app/src/operation/mesh.ts";
import type { GearRecord } from "../../app/src/operation/gearscene.ts";
import { ratios, check, fromTeeth, fromRatio, planetCentres } from "./planetary.ts";
import type { PlanetarySet } from "./planetary.ts";

test("ratios: sun 12, ring 48 (planet 18): ring held 5, carrier held -4, sun held 1.25", () => {
  const r = ratios(fromTeeth(12, 18, 3));
  assert.equal(r.ring, 5); assert.equal(r.carrier, -4); assert.equal(r.sun, 1.25);
});

test("the checks: ring = sun + 2 planets, (sun + ring) / planets whole, planets apart, undercut warned", () => {
  assert.deepEqual(check(fromTeeth(16, 12, 4)).filter((p) => p.fatal), []); // 16 + 40 = 56, 56 / 4 = 14
  assert.ok(check({ sun: 16, planet: 12, ring: 41, planets: 4 }).some((p) => p.fatal && /sun \+ 2 planets/.test(p.text)));
  assert.ok(check(fromTeeth(16, 12, 3)).some((p) => p.fatal && /not whole/.test(p.text))); // 56 / 3
  assert.ok(check(fromTeeth(12, 30, 6)).some((p) => p.fatal && /touch/.test(p.text))); // planets as big as the circle they stand on
  assert.ok(check(fromTeeth(12, 18, 3)).some((p) => !p.fatal && /undercut/.test(p.text)));
  assert.ok(check(fromTeeth(24, 18, 3)).every((p) => p.fatal === false));
});

test("from a ratio: every answer passes the checks and is the nearest; 5 with the ring held and 3 planets", () => {
  const a = fromRatio(5, "ring", 3);
  assert.ok(a.length > 0);
  assert.ok(a[0]!.error < 1e-9, "an exact 5 exists (ring = 4 sun)");
  for (const x of a.slice(0, 50)) assert.deepEqual(check(x.set).filter((p) => p.fatal), []);
  const b = fromRatio(7.3, "ring", 3); // no exact one with whole teeth is needed: the nearest is within a percent
  assert.ok(b[0]!.error < 0.01, String(b[0]!.error));
  const c = fromRatio(7.3, "ring", 4); // four planets cannot stand clear of each other at this ratio: the best is about 6.4 (the tool must say so, not pretend)
  assert.ok(c[0]!.ratio < 7 && c[0]!.error > 0.05, JSON.stringify(c[0]));
});

// --- the geometry ---
type P = [number, number];
const U = [1, 0, 0] as const, V = [0, 1, 0] as const;
const must = (spec: GearSpec): GearOutline => { const o = gearOutline(spec); assert.ok(o.ok, o.ok ? "" : o.error); return (o as { value: GearOutline }).value; };
function polygon(spec: GearSpec, at: readonly number[], turn: number): P[] {
  const o = must(spec);
  const [c, s] = [Math.cos(turn), Math.sin(turn)];
  const place = (q: P): P => [at[0]! + q[0] * c - q[1] * s, at[1]! + q[0] * s + q[1] * c];
  const out: P[] = [];
  o.points.forEach((a, i) => {
    const b = o.points[(i + 1) % o.points.length]!;
    const k = o.bulges[i]!;
    out.push(place([a[0], a[1]]));
    if (k) { const m: P = [(a[0] + b[0]) / 2 - (b[1] - a[1]) * k, (a[1] + b[1]) / 2 + (b[0] - a[0]) * k]; out.push(place([m[0], m[1]])); }
  });
  return out;
}
const inside = (p: P, poly: P[]): boolean => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [a, b] = [poly[i]!, poly[j]!]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
const edgeDist = (p: P, poly: P[]): number => { let d = Infinity; for (let i = 0; i < poly.length; i++) { const [a, b] = [poly[i]!, poly[(i + 1) % poly.length]!]; const [dx, dy] = [b[0] - a[0], b[1] - a[1]]; const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy))); d = Math.min(d, Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)); } return d; };
const penetration = (a: P[], b: P[]): number => Math.max(0, ...a.filter((p) => inside(p, b)).map((p) => edgeDist(p, b)), ...b.filter((p) => inside(p, a)).map((p) => edgeDist(p, a)));
const rec = (spec: GearSpec, at: readonly number[], turn = 0): GearRecord => ({ id: "g_001", plane: "w/XY" as never, at: [...at] as unknown as GearRecord["at"], spec, ...(turn ? { turn } : {}) });

/** the sun at the origin, each planet meshed with it where it stands, the ring turned to mesh the first planet; the worst penetration between neighbouring parts (mm) */
function worst(s: PlanetarySet, m: number): { sunPlanet: number; planetRing: number; planetPlanet: number } {
  const sunSpec: GearSpec = { teeth: s.sun, module: m }, planetSpec: GearSpec = { teeth: s.planet, module: m }, ringSpec: GearSpec = { teeth: s.ring, module: m, internal: true };
  const sun = rec(sunSpec, [0, 0, 0]);
  const placed = planetCentres(s, m).map((c) => { const r = meshWith(sun, U, V, { teeth: s.planet }, c.angle); assert.ok(r.ok, r.ok ? "" : r.error); return (r as { value: { at: number[]; turn: number } }).value; });
  const sunP = polygon(sunSpec, [0, 0, 0], 0);
  const planets = placed.map((p) => polygon(planetSpec, p.at, p.turn));
  // the ring: the gear-in-a-ring phase from the first planet's own frame (a ring round that planet, then its turn)
  const around = meshWith(rec(planetSpec, placed[0]!.at, placed[0]!.turn), U, V, { teeth: s.ring, ring: true }, Math.atan2(-placed[0]!.at[1]!, -placed[0]!.at[0]!));
  assert.ok(around.ok, around.ok ? "" : around.error);
  const ring = (around as { value: { at: number[]; turn: number } }).value;
  assert.ok(Math.hypot(ring.at[0]!, ring.at[1]!) < 1e-6, "the ring is round the sun's centre");
  const ringP = polygon(ringSpec, [0, 0, 0], ring.turn);
  // a ring's outline is the hole: the planet's points must stay inside it, and the ring's tooth points not inside the planet
  const sunPlanet = Math.max(...planets.map((p) => penetration(sunP, p)));
  const planetRing = Math.max(...planets.map((p) => Math.max(0, ...p.filter((q) => !inside(q, ringP)).map((q) => edgeDist(q, ringP)))));
  let planetPlanet = 0;
  for (let i = 0; i < planets.length; i++) for (let j = i + 1; j < planets.length; j++) planetPlanet = Math.max(planetPlanet, penetration(planets[i]!, planets[j]!));
  return { sunPlanet, planetRing, planetPlanet };
}

test("geometry: a set that passes the check meshes at every planet, sun and ring, with the planets clear of each other", () => {
  for (const s of [fromTeeth(16, 12, 4), fromTeeth(24, 18, 3), fromTeeth(18, 18, 3), fromTeeth(21, 15, 3)]) {
    assert.deepEqual(check(s).filter((p) => p.fatal), [], JSON.stringify(s));
    const w = worst(s, 2);
    console.log(JSON.stringify(s), JSON.stringify(w));
    assert.ok(w.sunPlanet < 0.01 && w.planetRing < 0.01 && w.planetPlanet === 0, JSON.stringify([s, w]));
  }
});

test("geometry: a set whose (sun + ring) / planets is not whole does not mesh at every planet (so the check is needed)", () => {
  const s = fromTeeth(16, 12, 3); // 56 / 3
  assert.ok(worst(s, 2).planetRing > 0.2 || worst(s, 2).sunPlanet > 0.2);
});
