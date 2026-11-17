// A straight bevel gear pair, the shape of its teeth worked out (a prototype, `dec_gear_tool`, `in_719`; nothing in `app/src` imports it).
// The tooth is the Tredgold back cone tooth: an involute spur tooth of the equivalent gear (z / cos delta teeth, the module, the pressure angle) developed on the back cone, carried round the axis (angle / cos delta) and projected
// through the pitch cone's apex onto a plane across the axis; the small end of the tooth is the same outline scaled toward the apex, so the faces of the tooth are ruled by lines through the apex (as those of a real straight bevel tooth are).
// Proportions by default: KHK-USA, Gear Solutions, July 2019, "Standards in terminology for bevel gearing" (a PDF the human sent, `in_723`): addendum of the wheel ha = 0.54 m + 0.46 m / uv (uv: the equivalent teeth of the wheel over the pinion's, (z2 cos d1) / (z1 cos d2)), of the
// pinion 2 m less that, dedendum 2.188 m less the addendum (the long and short addendum of the AGMA straight bevel system), tip diameter d + 2 ha cos d, face width at most R / 3 (and at least 10 m), the shaft angle other than 90: tan d1 = sin S / (z2/z1 + cos S).
// Other formulas: Autodesk Inventor 2022 Help, "Basic Geometric Calculation for Bevel Gears" (a PDF of the page the human sent, `in_722`; CC BY-NC-SA 3.0): pitch angle tan delta = sin(sigma) / (u + cos(sigma)), outer cone distance R = d / (2 sin delta),
// equivalent teeth z / cos(delta), dedendum reduction k = 0.02 (17 - zv) (when positive), addendum h_a = m (ha* + x - k), dedendum h_f = m (ha* + c* - x), outside diameter d + 2 h_a cos(delta), face angle delta + atan(h_a / R), root angle delta - atan(h_f / R),
// tooth thickness s = m (pi/2 + 2 x tan(alpha) + xt). The page does not give the defaults of ha*, c* (used here: 1 and 0.2, UNVERIFIED), the unit correction x (the long and short addendum: 0 here) or the face width (its own pages, not sent). Boston Gear's stock
// formulas (a maker's catalogue) agree to within 0.012 m of the dedendum: a = 1/P, hT = 2.188/P + 0.002 in. The standards (AGMA 2005, ISO 23509) were not read: previews only (contents and scope).
export interface BevelSpec { z: number; mate: number; module: number; pressure?: number; /** the angle between the shafts, degrees */ shaft?: number; /** face width as a fraction of the cone distance */ face?: number; /** unit addendum ha* and clearance c* (1 and 0.2), the unit correction x (the long and short addendum, 0), the change of tooth thickness xt (0) */ ha?: number; c?: number; x?: number; xt?: number }
export interface Bevel { delta: number; coneDistance: number; face: number; pitchRadius: number; tipRadius: number; rootRadius: number; /** addendum and dedendum at the big end, mm */ addendum: number; dedendum: number }
const inv = (a: number) => Math.tan(a) - a;

/** The pitch angle of the gear `z` meshing with `mate`, the shafts `shaft` degrees apart (90 for the usual pair): tan delta = sin sigma / (mate / z + cos sigma). */
export const pitchAngle = (z: number, mate: number, shaftDeg = 90): number => { const s = (shaftDeg * Math.PI) / 180; return Math.atan2(Math.sin(s), mate / z + Math.cos(s)); };

export function bevelOf(sp: BevelSpec): Bevel {
  const delta = pitchAngle(sp.z, sp.mate, sp.shaft ?? 90);
  const R = (sp.module * sp.z) / (2 * Math.sin(delta));
  const zv = sp.z / Math.cos(delta);
  let addendum: number, dedendum: number;
  if (sp.ha !== undefined || sp.x !== undefined || sp.c !== undefined) { // (the Autodesk page's form: unit addendum, clearance and correction)
    const k = Math.max(0, 0.02 * (17 - zv)); // (the dedendum reduction of a gear with few equivalent teeth)
    const [ha, c, x] = [sp.ha ?? 1, sp.c ?? 0.2, sp.x ?? 0];
    [addendum, dedendum] = [sp.module * (ha + x - k), sp.module * (ha + c - x)];
  } else { // (KHK-USA, Gear Solutions July 2019, "Standards in terminology for bevel gearing": the wheel (the gear with more teeth) has ha = 0.54 m + 0.46 m / uv, uv = (z cos delta mate) / (mate z cos delta) = the ratio of the equivalent teeth; the pinion has 2 m less that; whole depth 2.188 m)
    const zvm = sp.mate / Math.cos((((sp.shaft ?? 90) * Math.PI) / 180) - delta);
    const wheel = sp.z >= sp.mate;
    const uv = wheel ? zv / zvm : zvm / zv; // (the equivalent teeth of the wheel over the pinion's, at least 1)
    const haWheel = 0.54 * sp.module + (0.46 * sp.module) / uv;
    addendum = wheel ? haWheel : 2 * sp.module - haWheel;
    dedendum = 2.188 * sp.module - addendum;
  }
  return { delta, coneDistance: R, face: R * (sp.face ?? 1 / 3), pitchRadius: R * Math.sin(delta), tipRadius: R * Math.sin(delta) + addendum * Math.cos(delta), rootRadius: R * Math.sin(delta) - dedendum * Math.cos(delta), addendum, dedendum };
}

/** The outline of the big end of the tooth, in a plane across the axis at the distance `R cos delta` from the apex: polar points (radius, angle), counter-clockwise, the first tooth centred on angle 0 (`turn`: turned by this much, radians). */
export function bevelSection(sp: BevelSpec, perFlank = 10, turn = 0): [number, number][] {
  const m = sp.module, alpha = ((sp.pressure ?? 20) * Math.PI) / 180;
  const b = bevelOf(sp);
  const { delta, coneDistance: R } = b;
  const [cd, z] = [Math.cos(delta), sp.z];
  const zv = z / cd; // (the teeth of the equivalent spur gear on the back cone)
  const Rb = (m * zv) / 2; // (its pitch radius)
  const tipV = Rb + b.addendum, rootV = Rb - b.dedendum;
  const baseV = Rb * Math.cos(alpha);
  const half0 = (m * (Math.PI / 2 + 2 * (sp.x ?? 0) * Math.tan(alpha) + (sp.xt ?? 0)) / 2) / Rb; // (half the tooth thickness on the pitch circle, as an angle: s / 2 over the pitch radius, s = m (pi/2 + 2 x tan alpha + xt))
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
