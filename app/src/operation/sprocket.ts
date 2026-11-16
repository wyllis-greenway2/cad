// Roller chain sprockets (`dec_gear_tool`, `in_552`): the outline of a sprocket with the ANSI B29.1 tooth form, as points and bulges like a gear's (`gear.ts`).
//
// The tooth form (ANSI B29.1 as the American Chain Association works it, written out by TNB Positioners' generator, checked here: with these numbers the topping curve's centre is exactly 1.4 Dr from the roller's
// centre, and for a #40 chain of 18 teeth they give the working radius 0.4079 in and topping radius 0.2582 in of the commercial part it was laid over). From the chain's pitch P and roller diameter Dr and the tooth
// count N: the pitch diameter P / sin(180/N), with the rollers' centres on it; the gap is a chain of four arcs and a straight: the seating curve, radius R = 0.5025 Dr + 0.0015 in about the roller's centre, A = 35 + 60/N
// degrees either side of the bottom; the working curve, radius E = 1.3025 Dr + 0.0015 in, about a point 0.8 Dr from the roller's centre on the other side, B = 18 - 56/N degrees, touching the seating curve on the
// inside where it ends; a flat tangent to the working curve of length Dr (1.4 sin C - 0.8 sin B), C = 17 - 64/N degrees; the topping curve, radius F = Dr (0.8 cos B + 1.4 cos C - 1.3025) - 0.0015 in, tangent to the
// flat, which rounds the tooth tip. The tips are cut off at the blank's outside diameter P (0.6 + cot(180/N)), as a real sprocket is turned.
//
// The chains are the ANSI numbers with the pitch and roller diameter of Martin Sprocket's catalogue (`q_timing_pulleys` has the sources of the belts; the chains' are in `dec_gear_tool`). Not made: the sprocket's
// width (it is the thickness you extrude it to: the sprocket tooth width of the chain, t, is in the table for the person to use), and the chordal rise and the ISO 606 variants.
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";
import type { GearSpec, GearOutline } from "./gear.ts";
import { CHAINS, IN, chainOf } from "./chains.ts";
import { isoSprocketOutline } from "./iso606.ts";
import type { P } from "./arcs.ts";
import { polar, bulgeOf, arcMid } from "./arcs.ts";

export function sprocketOutline(spec: GearSpec): Result<GearOutline> {
  if (spec.sprocket?.iso) return isoSprocketOutline(spec);
  const ch = spec.sprocket ? chainOf(spec.sprocket) : null;
  if (!ch) return err(spec.sprocket?.chain !== undefined && !CHAINS[spec.sprocket.chain] ? `no chain numbered ${spec.sprocket.chain}: ${Object.keys(CHAINS).join(", ")}` : "the pitch and the roller diameter must be above zero");
  const N = Math.round(spec.teeth);
  if (!Number.isFinite(N) || N < 7 || N > 400) return err("a sprocket needs 7 to 400 teeth");
  const { pitch: P, roller: Dr } = ch;
  if (Dr >= P * 0.95) return err("the roller is as wide as the pitch");
  const d = (deg: number) => (deg * Math.PI) / 180;
  const k = 0.0015 * IN; // (the 0.0015 in of the standard)
  const [A, B, C] = [35 + 60 / N, 18 - 56 / N, 17 - 64 / N];
  const R = 0.5025 * Dr + k, E = 1.3025 * Dr + k;
  const F = Dr * (0.8 * Math.cos(d(B)) + 1.4 * Math.cos(d(C)) - 1.3025) - k;
  const flat = Dr * (1.4 * Math.sin(d(C)) - 0.8 * Math.sin(d(B)));
  if (!(F > 0) || !(flat > 0)) return err("the tooth form does not close for this chain and tooth count");
  const PD = P / Math.sin(d(180 / N));
  const OD = P * (0.6 + 1 / Math.tan(d(180 / N)));
  const root = PD / 2 - R;
  const bore = spec.bore ?? 0;
  if (bore < 0 || bore >= 2 * root * 0.95) return err("the bore must be smaller than the sprocket's root circle");
  // one side of the gap, the one toward +t (t across the gap, r outward), about the roller's centre at the origin; the other side is its mirror
  const u: P = [-Math.cos(d(A)), Math.sin(d(A))];
  const Ts: P = [R * u[0], R * u[1]];
  const M: P = [(R - E) * u[0], (R - E) * u[1]];
  const th = d(180 - A - B);
  const y: P = [M[0] + E * Math.cos(th), M[1] + E * Math.sin(th)];
  const dir: P = [Math.sin(d(A + B)), Math.cos(d(A + B))];
  const z: P = [y[0] + flat * dir[0], y[1] + flat * dir[1]];
  const n: P = [-Math.cos(d(A + B)), Math.sin(d(A + B))];
  const Q: P = [z[0] + F * n[0], z[1] + F * n[1]];
  // the tip: the topping arc turns counter-clockwise about Q from z until it meets the blank's outside circle (about the sprocket's centre, at (-PD/2, 0) here) or, if that comes first, the middle line of
  // the tooth (the arc of the next gap meets it there: the tooth is pointed, as the pure construction has it, and the outside circle cuts nothing)
  const O: P = [-PD / 2, 0];
  const angQ = (p: P) => { const w = Math.atan2(p[1] - Q[1], p[0] - Q[0]) - Math.atan2(z[1] - Q[1], z[0] - Q[0]); return ((w % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI); };
  const circleMeets = (c: P, rc: number): P[] => {
    const dq = Math.hypot(Q[0] - c[0], Q[1] - c[1]);
    if (!(dq < rc + F && dq > Math.abs(rc - F))) return [];
    const aa = (rc * rc - F * F + dq * dq) / (2 * dq);
    const hh = Math.sqrt(Math.max(0, rc * rc - aa * aa));
    const bp: P = [c[0] + (aa * (Q[0] - c[0])) / dq, c[1] + (aa * (Q[1] - c[1])) / dq];
    return [[bp[0] + (hh * (Q[1] - c[1])) / dq, bp[1] - (hh * (Q[0] - c[0])) / dq], [bp[0] - (hh * (Q[1] - c[1])) / dq, bp[1] + (hh * (Q[0] - c[0])) / dq]];
  };
  const first = (ps: P[]): P | undefined => ps.sort((p, q) => angQ(p) - angQ(q))[0];
  const cut = first(circleMeets(O, OD / 2));
  // the middle line of the tooth: from O at the angle of half a pitch (toward +t); where it meets the topping circle
  const [ax, ay] = [Math.cos(Math.PI / N), Math.sin(Math.PI / N)];
  const lineMeets = (): P[] => {
    const [wx, wy] = [O[0] - Q[0], O[1] - Q[1]];
    const bq = wx * ax + wy * ay, cq = wx * wx + wy * wy - F * F;
    const disc = bq * bq - cq;
    if (disc < 0) return [];
    return [-bq - Math.sqrt(disc), -bq + Math.sqrt(disc)].filter((v) => v > 0).map((v): P => [O[0] + v * ax, O[1] + v * ay]);
  };
  const apex = first(lineMeets());
  if (!cut && !apex) return err("the tips are cut off below the tooth form: more teeth are needed");
  const pointed = !!apex && (!cut || angQ(apex) <= angQ(cut));
  const X = (pointed ? apex : cut)!;
  if (angQ(X) > Math.PI) return err("the tips are cut off below the tooth form: more teeth are needed");
  const pitch = (2 * Math.PI) / N;
  const points: P[] = [], bulges: number[] = [];
  const mirror = (p: P): P => [p[0], -p[1]];
  const place = (p: P, phi: number): P => { const c = polar(PD / 2, phi); const [cr, sr] = [Math.cos(phi), Math.sin(phi)]; return [c[0] + p[0] * cr - p[1] * sr, c[1] + p[0] * sr + p[1] * cr]; };
  const mid = (c: P, r: number, p1: P, p2: P, phi: number): P => place(arcMid(c, r, p1, p2), phi);
  const origin: P = [0, 0];
  for (let i = 0; i < N; i++) {
    const phi = i * pitch;
    const pl = (p: P) => place(p, phi);
    const [Xm, zm, ym, Tm] = [mirror(X), mirror(z), mirror(y), mirror(Ts)];
    const [Qm, Mm] = [mirror(Q), mirror(M)];
    const next = place(Xm, (i + 1) * pitch);
    const add = (p: P, m: P, q: P) => { points.push(p); bulges.push(bulgeOf(p, m, q)); };
    add(pl(Xm), mid(Qm, F, Xm, zm, phi), pl(zm)); // the topping curve down from the tip (a pointed tooth: from the corner the last gap ended at)
    points.push(pl(zm)); bulges.push(0); // the flat (a straight side)
    add(pl(ym), mid(Mm, E, ym, Tm, phi), pl(Tm)); // the working curve
    add(pl(Tm), mid(origin, R, Tm, Ts, phi), pl(Ts)); // the seat, round the bottom
    add(pl(Ts), mid(M, E, Ts, y, phi), pl(y));
    points.push(pl(y)); bulges.push(0);
    add(pl(z), mid(Q, F, z, X, phi), pl(X));
    if (pointed) continue; // (the tooth's point is the next gap's first corner)
    const [sx, sy] = [pl(X)[0] + next[0], pl(X)[1] + next[1]];
    const mo: P = [(sx / Math.hypot(sx, sy)) * (OD / 2), (sy / Math.hypot(sx, sy)) * (OD / 2)];
    add(pl(X), mo, next); // the tip's top: the blank's own circle
  }
  return ok({ points, bulges, pitchRadius: PD / 2, baseRadius: 0, tipRadius: OD / 2, rootRadius: root, warnings: N < 9 ? ["few teeth: the chain runs roughly"] : [] });
}
