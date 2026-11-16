// Timing pulleys with the GT2 tooth (`dec_gear_tool`, `in_551`): the outline of a pulley as points and bulges, like a gear's (`gear.ts`), from the belt tooth's published numbers.
//
// The numbers (a Misumi table of the Gates belts, read from a page the human sent, `q_timing_pulleys`): pitch P, the radii R1 (where the tooth meets the belt's flat), R2 (the sides) and R3 (the tip), `b` (how far the
// centre of R2 stands off the tooth's middle along the pitch line), the tooth height h, and the pitch line differential PLD (the pulley's outside radius is the pitch radius less PLD). The tooth of 2GT is made of three
// arcs: R3 about a point on the tooth's middle, h - R3 below the flat; the sides R2 about points on the flat, b either side of the middle (2GT: the distance between that point and R3's is exactly R2 - R3, so the
// arcs touch smoothly); R1 rounding the corner where each side meets the flat. The pulley's groove is that tooth, made a `clearance` (mm) bigger all round. On the pulley the flat is the outside circle, so the centre
// of R2 is found to make R2 and R3 touch exactly there (it agrees with `b` to a few thousandths).
//
// Not the pulley makers' own groove drawings (the standards, ISO 13050): the pulley groove is the belt tooth. That is the part to be checked against a real belt (`q_timing_pulleys`).
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";
import type { GearSpec, GearOutline } from "./gear.ts";
import type { P } from "./arcs.ts";
import { polar, bulgeOf as bulge, arcMid } from "./arcs.ts";

export const GT_TOOTH = {
  "2GT": { pitch: 2, R1: 0.15, R2: 1.0, R3: 0.555, b: 0.4, h: 0.75, pld: 0.254, minTeeth: 12 },
  "3GT": { pitch: 3, R1: 0.25, R2: 1.52, R3: 0.85, b: 0.61, h: 1.14, pld: 0.381, minTeeth: 12 },
} as const;

/**
 * The HTD 5 mm belt (`in_555`): the belt tooth of Gates' drawing as SDP/SI, Chief Delphi and Capolight give it (pitch 5, tooth height 2.06 to 2.08, belt 3.80 to 3.81 thick, tooth radius R1 = 1.49, root radius R2 = 0.43;
 * the pitch line differential 0.572 is from Pfeifer's charts, the 13 grooves of the least from the same). The tooth is the arc of R1 about a point h - R1 below the flat, straight sides tangent to it, and R2 rounding the
 * corner where each side meets the flat. The groove is that tooth made `clearance` mm bigger all round; the default 0.07 mm is the difference between the 1.56 mm groove radius a machinist's forum gives for this belt and
 * the belt's 1.49, which was not read at its source, and HTD is cut with a good deal of clearance (SDP/SI says so). Not the pulley makers' own groove drawing, and the 3.05 mm tooth width and 0.74 mm flat that some of those
 * pages give do not fit a tooth drawn from the radii (`q_timing_pulleys`): to be checked against a real belt.
 */
export const HTD_TOOTH = { "HTD5M": { pitch: 5, R1: 1.49, R2: 0.43, h: 2.06, pld: 0.572, minTeeth: 13, clearance: 0.07 } } as const;

function htdOutline(spec: GearSpec): Result<GearOutline> {
  const t = HTD_TOOTH.HTD5M;
  const z = Math.round(spec.teeth);
  if (!Number.isFinite(z) || z < t.minTeeth || z > 400) return err(`an HTD 5M pulley needs ${t.minTeeth} to 400 teeth`);
  const c = spec.clearance ?? t.clearance;
  if (!(c >= 0 && c < t.R2 - 0.02)) return err(`the clearance must be from 0 to ${(t.R2 - 0.02).toFixed(2)} mm`);
  const Ro = (z * t.pitch) / (2 * Math.PI) - t.pld;
  const [R1, R2] = [t.R1 + c, t.R2 - c]; // (the tip circle and the corner, made bigger all round: the corner's circle is the same one, smaller)
  const r3 = Ro - (t.h - t.R1); // (the tip circle is centred this far from the middle of the pulley)
  const xf = t.R1 + t.R2; // (the corner's circle is this far across from the groove's middle: R1 + c of side and R2 - c of corner)
  const rf = Ro - R2;
  if (!(rf > xf)) return err("the pulley is too small for the tooth: more teeth are needed");
  const uf = Math.sqrt(rf * rf - xf * xf); // (and this far along the groove from the middle of the pulley, so it touches the outside circle on the inside)
  if (!(uf > r3 + 1e-6)) return err("the sides of the groove would have no length: more teeth are needed");
  const gamma = Math.atan2(xf, uf);
  const pitch = (2 * Math.PI) / z;
  if (2 * gamma >= pitch - 1e-3) return err("the grooves meet at the outside: more teeth are needed");
  const tipDepth = r3 - R1;
  const bore = spec.bore ?? 0;
  if (bore < 0 || bore >= 2 * tipDepth * 0.95) return err("the bore must be smaller than the pulley's root circle");
  const points: P[] = [], bulges: number[] = [];
  for (let k = 0; k < z; k++) {
    const phi = k * pitch;
    const [rh, th]: [P, P] = [[Math.cos(phi), Math.sin(phi)], [-Math.sin(phi), Math.cos(phi)]];
    const at = (u: number, v: number): P => [u * rh[0] + v * th[0], u * rh[1] + v * th[1]];
    const [P1, P2, P3, P4, P5, P6] = [polar(Ro, phi - gamma), at(uf, -R1), at(r3, -R1), at(r3, R1), at(uf, R1), polar(Ro, phi + gamma)];
    const next = polar(Ro, (k + 1) * pitch - gamma);
    points.push(P1); bulges.push(bulge(P1, arcMid(at(uf, -xf), R2, P1, P2), P2)); // the corner
    points.push(P2); bulges.push(0); // the straight side
    points.push(P3); bulges.push(bulge(P3, at(r3 - R1, 0), P4)); // the tip, round
    points.push(P4); bulges.push(0);
    points.push(P5); bulges.push(bulge(P5, arcMid(at(uf, xf), R2, P5, P6), P6));
    points.push(P6); bulges.push(bulge(P6, polar(Ro, phi + pitch / 2), next)); // the outside circle to the next groove
  }
  return ok({ points, bulges, pitchRadius: Ro + t.pld, baseRadius: 0, tipRadius: Ro, rootRadius: tipDepth, warnings: [] });
}

export function pulleyOutline(spec: GearSpec): Result<GearOutline> {
  if (spec.pulley === "HTD5M") return htdOutline(spec);
  const t = spec.pulley ? GT_TOOTH[spec.pulley] : undefined;
  if (!t) return err("no such belt");
  const z = Math.round(spec.teeth);
  if (!Number.isFinite(z) || z < t.minTeeth || z > 400) return err(`a ${spec.pulley} pulley needs ${t.minTeeth} to 400 teeth`);
  const c = spec.clearance ?? 0;
  if (!(c >= 0 && c < t.R1 - 0.02)) return err(`the clearance must be from 0 to ${(t.R1 - 0.02).toFixed(2)} mm`);
  const Ro = (z * t.pitch) / (2 * Math.PI) - t.pld; // (the outside radius: the pitch radius less the pitch line differential)
  const [R1, R2, R3] = [t.R1 - c, t.R2 + c, t.R3 + c];
  const r3 = Ro - (t.h - t.R3); // (the radius at which the tip circle is centred: it does not move with the clearance)
  const d = t.R2 - t.R3; // (the centres of R2 and R3 are this far apart: R3 touches R2 on the inside)
  const beta = Math.acos((r3 * r3 + Ro * Ro - d * d) / (2 * r3 * Ro)); // (R2's centre is this far round from the tooth's middle)
  const rf = Ro - R1; // (the corner's circle is centred this far from the middle of the pulley, so it touches the outside circle on the inside)
  const s = R2 + R1;
  const gamma = Math.acos((rf * rf + Ro * Ro - s * s) / (2 * rf * Ro)); // (and this far round from R2's centre, so it touches R2 on the outside)
  const tipDepth = Ro - t.h - c;
  const bore = spec.bore ?? 0;
  if (bore < 0 || bore >= 2 * tipDepth * 0.95) return err("the bore must be smaller than the pulley's root circle");
  const pitch = (2 * Math.PI) / z;
  if (2 * (gamma - beta) >= pitch - 1e-3) return err("the grooves meet at the outside: more teeth are needed");
  const points: P[] = [], bulges: number[] = [];
  const add = (a: P, m: P, b: P) => { points.push(a); bulges.push(bulge(a, m, b)); };
  for (let k = 0; k < z; k++) {
    const phi = k * pitch;
    const C3 = polar(r3, phi);
    const [C2L, C2R] = [polar(Ro, phi + beta), polar(Ro, phi - beta)]; // (the left side of the groove is made about a point to the right of it, and the other way round)
    const [C1L, C1R] = [polar(rf, phi + beta - gamma), polar(rf, phi - beta + gamma)];
    const tangent = (a: P, b: P, ra: number): P => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]); return [a[0] + ((b[0] - a[0]) / l) * ra, a[1] + ((b[1] - a[1]) / l) * ra]; };
    const T1L = polar(Ro, phi + beta - gamma), T1R = polar(Ro, phi - beta + gamma);
    const T12L = tangent(C2L, C1L, R2), T12R = tangent(C2R, C1R, R2); // (the corner's circle against R2)
    const T3L = tangent(C2L, C3, R2), T3R = tangent(C2R, C3, R2); // (R2 against the tip)
    const next = polar(Ro, (k + 1) * pitch + beta - gamma); // (where the next groove's corner begins: the outside circle runs from T1R to it)
    add(T1L, arcMid(C1L, R1, T1L, T12L), T12L);
    add(T12L, arcMid(C2L, R2, T12L, T3L), T3L);
    add(T3L, arcMid(C3, R3, T3L, T3R), T3R);
    add(T3R, arcMid(C2R, R2, T3R, T12R), T12R);
    add(T12R, arcMid(C1R, R1, T12R, T1R), T1R);
    add(T1R, polar(Ro, phi - beta + gamma + (pitch - 2 * (gamma - beta)) / 2), next);
  }
  return ok({ points, bulges, pitchRadius: Ro + t.pld, baseRadius: 0, tipRadius: Ro, rootRadius: tipDepth, warnings: z < 14 ? ["few teeth: the belt wraps badly"] : [] });
}
