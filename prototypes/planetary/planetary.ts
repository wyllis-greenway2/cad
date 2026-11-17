// Planetary set maths (a prototype, `in_736`, `in_761`): tooth counts from a ratio or a ratio from tooth counts, the assembly and clearance checks, the ratio for each held part, and where each planet stands.
export type Hold = "ring" | "carrier" | "sun";
export interface PlanetarySet { sun: number; planet: number; ring: number; planets: number }
export interface Problem { fatal: boolean; text: string }

/** the speed ratio input / output of the usual arrangement for each held part (Willis: (ns - nc) / (nr - nc) = -zr / zs). ring held: sun in, carrier out; carrier held: sun in, ring out (reverses); sun held: ring in, carrier out */
export function ratios(s: PlanetarySet): Record<Hold, number> {
  return { ring: 1 + s.ring / s.sun, carrier: -s.ring / s.sun, sun: 1 + s.sun / s.ring };
}

/** the problems of a set: the ring must be the sun and two planets (fatal), the planets must fit evenly (fatal) and not touch each other (fatal); few teeth undercut (a warning) */
export function check(s: PlanetarySet, pressure = 20): Problem[] {
  const out: Problem[] = [];
  const whole = (n: number) => Number.isInteger(n) && n > 0;
  if (![s.sun, s.planet, s.ring, s.planets].every(whole)) return [{ fatal: true, text: "tooth counts and the number of planets are whole numbers" }];
  if (s.planets < 1) out.push({ fatal: true, text: "at least one planet" });
  if (s.ring !== s.sun + 2 * s.planet) out.push({ fatal: true, text: `the ring has ${s.ring} teeth; sun + 2 planets is ${s.sun + 2 * s.planet}` });
  if ((s.sun + s.ring) % s.planets !== 0) out.push({ fatal: true, text: `(sun + ring) / planets = ${(s.sun + s.ring) / s.planets} is not whole: the planets cannot be spaced evenly and all mesh` });
  if (s.planets > 1) { // (neighbouring planets: centres 2 R sin(pi / N) apart, R = (zs + zp) / 2 modules; their tips reach zp + 2 modules across)
    const apart = (s.sun + s.planet) * Math.sin(Math.PI / s.planets);
    if (apart <= s.planet + 2) out.push({ fatal: true, text: `neighbouring planets touch: ${apart.toFixed(2)} modules apart, their tips need ${s.planet + 2}` });
  }
  const undercutBelow = Math.ceil(2 / Math.sin((pressure * Math.PI) / 180) ** 2);
  for (const [n, z] of [["sun", s.sun], ["planet", s.planet]] as const) if (z < undercutBelow) out.push({ fatal: false, text: `the ${n} has ${z} teeth: under ${undercutBelow} undercuts at ${pressure} degrees` });
  return out;
}

/** a set from the tooth counts of the sun and planets (the ring follows) */
export const fromTeeth = (sun: number, planet: number, planets: number): PlanetarySet => ({ sun, planet, ring: sun + 2 * planet, planets });

/**
 * sets from a wanted ratio (for the held part `hold`), best first: every sun and planet count in range that passes `check` without a fatal problem, ordered by how far the ratio is off, then by the fewer total teeth.
 * A ratio of 5 with the ring held needs ring / sun = 4.
 */
export function fromRatio(ratio: number, hold: Hold, planets: number, opt: { minSun?: number; maxTeeth?: number; pressure?: number } = {}): { set: PlanetarySet; ratio: number; error: number; warnings: Problem[] }[] {
  const [minSun, maxTeeth, pressure] = [opt.minSun ?? 12, opt.maxTeeth ?? 200, opt.pressure ?? 20];
  const found = [];
  for (let sun = minSun; sun <= maxTeeth; sun++) for (let planet = 6; sun + 2 * planet <= maxTeeth; planet++) {
    const set = fromTeeth(sun, planet, planets);
    const problems = check(set, pressure);
    if (problems.some((p) => p.fatal)) continue;
    const r = ratios(set)[hold];
    found.push({ set, ratio: r, error: Math.abs(r - ratio) / Math.abs(ratio), warnings: problems });
  }
  return found.sort((a, b) => a.error - b.error || a.warnings.length - b.warnings.length || a.set.ring - b.set.ring);
}

/** where each planet's centre stands: on the circle of radius m (zs + zp) / 2, N of them 360 / N apart, the first at `first` radians */
export function planetCentres(s: PlanetarySet, module: number, first = 0): { angle: number; at: [number, number] }[] {
  const r = (module * (s.sun + s.planet)) / 2;
  return Array.from({ length: s.planets }, (_, k) => { const a = first + (2 * Math.PI * k) / s.planets; return { angle: a, at: [r * Math.cos(a), r * Math.sin(a)] }; });
}
