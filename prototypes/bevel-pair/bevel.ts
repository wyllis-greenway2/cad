// A straight bevel gear pair, the shape of its teeth worked out (a prototype, `dec_gear_tool`, `in_719`; nothing in `app/src` imports it).
// The tooth is the Tredgold back cone tooth: an involute spur tooth of the equivalent gear (z / cos delta teeth, the module, the pressure angle) developed on the back cone, carried round the axis (angle / cos delta) and projected
// through the pitch cone's apex onto a plane across the axis; the small end of the tooth is the same outline scaled toward the apex, so the faces of the tooth are ruled by lines through the apex (as those of a real straight bevel tooth are).
// Proportions: Boston Gear's stock straight bevel formulas (https://documents.mrosupply.com/product_documents/SH/SH82-P/1930-bg_engineering-info-miter-and-bevel-gears.pdf, a maker's catalogue, read 2026-11-17): 20 degrees, a = 1/P,
// hT = 2.188/P + 0.002 in, b = hT - a, circular tooth thickness 1.5708/P (so, with a module m: a = m, hT = 2.188 m + 0.0508 mm), the pitch angle tan^-1(Np/NG) for 90 degree shafts. Not read from the standards (AGMA 2005, ISO 23509): UNVERIFIED as the standard's.
export interface BevelSpec { z: number; mate: number; module: number; pressure?: number; /** the angle between the shafts, degrees */ shaft?: number; /** face width as a fraction of the cone distance */ face?: number }
export interface Bevel { delta: number; coneDistance: number; face: number; pitchRadius: number; tipRadius: number; rootRadius: number }
const inv = (a: number) => Math.tan(a) - a;

/** The pitch angle of the gear `z` meshing with `mate`, the shafts `shaft` degrees apart (90 for the usual pair): tan delta = sin sigma / (mate / z + cos sigma). */
export const pitchAngle = (z: number, mate: number, shaftDeg = 90): number => { const s = (shaftDeg * Math.PI) / 180; return Math.atan2(Math.sin(s), mate / z + Math.cos(s)); };

export function bevelOf(sp: BevelSpec): Bevel {
  const delta = pitchAngle(sp.z, sp.mate, sp.shaft ?? 90);
  const R = (sp.module * sp.z) / (2 * Math.sin(delta));
  return { delta, coneDistance: R, face: R * (sp.face ?? 1 / 3), pitchRadius: R * Math.sin(delta), tipRadius: R * Math.sin(delta) + sp.module * Math.cos(delta), rootRadius: R * Math.sin(delta) - (1.188 * sp.module + 0.0508) * Math.cos(delta) };
}

/** The outline of the big end of the tooth, in a plane across the axis at the distance `R cos delta` from the apex: polar points (radius, angle), counter-clockwise, the first tooth centred on angle 0 (`turn`: turned by this much, radians). */
export function bevelSection(sp: BevelSpec, perFlank = 10, turn = 0): [number, number][] {
  const m = sp.module, alpha = ((sp.pressure ?? 20) * Math.PI) / 180;
  const b = bevelOf(sp);
  const { delta, coneDistance: R } = b;
  const [cd, z] = [Math.cos(delta), sp.z];
  const zv = z / cd; // (the teeth of the equivalent spur gear on the back cone)
  const Rb = (m * zv) / 2; // (its pitch radius)
  const tipV = Rb + m, rootV = Rb - (1.188 * m + 0.0508);
  const baseV = Rb * Math.cos(alpha);
  const half0 = Math.PI / (2 * zv); // (half the tooth thickness on the pitch circle, as an angle: pi m / 4 over the pitch radius)
  const halfAt = (rho: number) => half0 + inv(alpha) - inv(Math.acos(Math.min(1, baseV / rho)));
  const pitchV = 2 * Math.PI / zv;
  // developed point (rho, phi) -> the plane's polar point
  const to = (rho: number, phi: number): [number, number] => { const x = R / cd - rho * Math.sin(delta); const r = rho * cd; return [(r * R * cd) / x, phi / cd]; };
  const pts: [number, number][] = [];
  const lo = Math.max(baseV, rootV);
  for (let k = 0; k < z; k++) {
    const c = k * pitchV;
    const flank = (side: 1 | -1) => Array.from({ length: perFlank + 1 }, (_, i) => { const rho = lo + ((tipV - lo) * i) / perFlank; return to(rho, c + side * halfAt(rho)); });
    const right = flank(-1), left = flank(1); // (the clockwise flank from the root to the tip, then the anticlockwise one from the tip back down)
    if (rootV < baseV) pts.push(to(rootV, c - halfAt(baseV)));
    pts.push(...right, ...left.reverse());
    if (rootV < baseV) pts.push(to(rootV, c + halfAt(baseV)));
    // the root between this tooth and the next: a point on the root circle half way
    pts.push(to(rootV, c + pitchV / 2));
  }
  return pts.map(([r, th]) => [r, th + turn]);
}
