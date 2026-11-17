// Roller chain sprockets with the ISO 606 tooth form (`dec_gear_tool`, `in_588`): the outline of a sprocket as points and bulges like a gear's (`gear.ts`).
//
// The standard gives limits, not one curve: ISO 606:1994 (as the patent US 7128673 prints its expressions) for the roller chain's pitch p, roller diameter d1 and the tooth count z: the pitch diameter d = p / sin(180/z),
// the root diameter df = d - d1; the roller seating radius ri from 0.505 d1 to 0.505 d1 + 0.069 d1^(1/3); the tooth flank radius re between 0.12 d1 (z + 2) and 0.008 d1 (z^2 + 180) (the patent's text names the two the other
// way round, which cannot be: for 20 teeth of a 7.92 mm roller the first is 21 mm and the second 37 mm); the roller seating angle from 120 - 90/z to 140 - 90/z degrees (a calculator page gives 115.5 to 135.5 at 20
// teeth, as these do). A tooth gap inside the limits is an ISO sprocket. The form made here: the seating arc of radius ri about the roller's centre, alpha degrees in all, and from its ends the flank arcs of radius re,
// touching the seating arc on the inside (the centre of each is (re - ri) from the roller's, on the other side), going out to the blank's outside circle; `fit` from 0 to 1 puts ri, re and alpha that far from their
// lower limits to their upper (0.5 if none). The outside diameter is the ANSI one, P (0.6 + cot(180/z)) (read from TNB's page; ISO's own limits for it, which the AI remembers as d + 1.25 p - d1 above and
// d + p (1 - 1.6/z) - d1 below, were not found in a source, and this value is between them for the chains tried). Where the flanks of two gaps meet before that circle the tooth is a point.
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";
import type { GearSpec, GearOutline } from "./gear.ts";
import { CHAINS, ISO_B, chainOf } from "./chains.ts";
import type { P } from "./arcs.ts";
import { polar, bulgeOf, arcMid } from "./arcs.ts";

export function isoSprocketOutline(spec: GearSpec): Result<GearOutline> {
  const sp = spec.sprocket;
  const ch = sp ? chainOf(sp) : null;
  if (!sp || !ch) return err(sp?.chain !== undefined && !ISO_B[sp.chain] && !CHAINS[sp.chain] ? `no chain numbered ${sp.chain}: the B series ${Object.keys(ISO_B).join(", ")}, or the A series as ${Object.keys(CHAINS).filter((k) => Number(k) >= 40).join(", ")}` : "the pitch and the roller diameter must be above zero");
  const N = Math.round(spec.teeth);
  if (!Number.isFinite(N) || N < 9 || N > 400) return err("an ISO sprocket needs 9 to 400 teeth");
  const f = sp.fit ?? 0.5;
  if (!(f >= 0 && f <= 1)) return err("the fit is from 0 (tight) to 1 (loose)");
  const { pitch: P0, roller: d1 } = ch;
  if (d1 >= P0 * 0.95) return err("the roller is as wide as the pitch");
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const PD = P0 / Math.sin(Math.PI / N);
  const ri = 0.505 * d1 + f * 0.069 * Math.cbrt(d1);
  const alpha = rad(120 + 20 * f - 90 / N);
  const [r1, r2] = [0.12 * d1 * (N + 2), 0.008 * d1 * (N * N + 180)];
  const re = Math.min(r1, r2) + f * Math.abs(r2 - r1);
  const OD = P0 * (0.6 + 1 / Math.tan(Math.PI / N));
  const root = PD / 2 - ri;
  const bore = spec.bore ?? 0;
  if (bore < 0 || bore >= 2 * root * 0.95) return err("the bore must be smaller than the sprocket's root circle");
  // one side of the gap, toward +t (t across the gap, r outward), about the roller's centre at the origin; the other is its mirror
  const u: P = [-Math.cos(alpha / 2), Math.sin(alpha / 2)];
  const Ts: P = [ri * u[0], ri * u[1]];
  const M: P = [(ri - re) * u[0], (ri - re) * u[1]];
  const psi0 = Math.atan2(u[1], u[0]);
  const O: P = [-PD / 2, 0];
  // the flank turns the way the angle about M decreases; the angle gone from the seat's end to a point of the circle
  const gone = (p: P) => { const w = psi0 - Math.atan2(p[1] - M[1], p[0] - M[0]); return ((w % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI); };
  const circleMeets = (c: P, rc: number): P[] => {
    const dq = Math.hypot(M[0] - c[0], M[1] - c[1]);
    if (!(dq < rc + re && dq > Math.abs(rc - re))) return [];
    const aa = (rc * rc - re * re + dq * dq) / (2 * dq);
    const hh = Math.sqrt(Math.max(0, rc * rc - aa * aa));
    const bp: P = [c[0] + (aa * (M[0] - c[0])) / dq, c[1] + (aa * (M[1] - c[1])) / dq];
    return [[bp[0] + (hh * (M[1] - c[1])) / dq, bp[1] - (hh * (M[0] - c[0])) / dq], [bp[0] - (hh * (M[1] - c[1])) / dq, bp[1] + (hh * (M[0] - c[0])) / dq]];
  };
  const first = (ps: P[]): P | undefined => ps.filter((p) => gone(p) > 1e-9).sort((p, q) => gone(p) - gone(q))[0];
  const cut = first(circleMeets(O, OD / 2));
  const [ax, ay] = [Math.cos(Math.PI / N), Math.sin(Math.PI / N)]; // (the middle line of the tooth, from the sprocket's centre)
  const lineMeets = (): P[] => {
    const [wx, wy] = [O[0] - M[0], O[1] - M[1]];
    const bq = wx * ax + wy * ay, cq = wx * wx + wy * wy - re * re;
    const disc = bq * bq - cq;
    if (disc < 0) return [];
    return [-bq - Math.sqrt(disc), -bq + Math.sqrt(disc)].filter((v) => v > 0).map((v): P => [O[0] + v * ax, O[1] + v * ay]);
  };
  const apex = first(lineMeets());
  if (!cut && !apex) return err("the flanks do not reach the tips: more teeth are needed");
  const pointed = !!apex && (!cut || gone(apex) <= gone(cut));
  const X = (pointed ? apex : cut)!;
  if (gone(X) > Math.PI) return err("the flanks do not reach the tips: more teeth are needed");
  const pitchAngle = (2 * Math.PI) / N;
  const points: P[] = [], bulges: number[] = [];
  const mirror = (p: P): P => [p[0], -p[1]];
  const place = (p: P, phi: number): P => { const c = polar(PD / 2, phi); const [cr, sr] = [Math.cos(phi), Math.sin(phi)]; return [c[0] + p[0] * cr - p[1] * sr, c[1] + p[0] * sr + p[1] * cr]; };
  const mid = (c: P, r: number, p1: P, p2: P, phi: number): P => place(arcMid(c, r, p1, p2), phi);
  const add = (p: P, m: P, q: P) => { points.push(p); bulges.push(bulgeOf(p, m, q)); };
  const origin: P = [0, 0];
  const [Xm, Tm, Mm] = [mirror(X), mirror(Ts), mirror(M)];
  for (let i = 0; i < N; i++) {
    const phi = i * pitchAngle;
    const pl = (p: P) => place(p, phi);
    add(pl(Xm), mid(Mm, re, Xm, Tm, phi), pl(Tm)); // the flank down to the seat
    add(pl(Tm), mid(origin, ri, Tm, Ts, phi), pl(Ts)); // the seat, round the bottom
    add(pl(Ts), mid(M, re, Ts, X, phi), pl(X)); // and the flank up
    if (pointed) continue; // (the tooth's point is the next gap's first corner)
    const next = place(Xm, (i + 1) * pitchAngle);
    const [sx, sy] = [pl(X)[0] + next[0], pl(X)[1] + next[1]];
    const mo: P = [(sx / Math.hypot(sx, sy)) * (OD / 2), (sy / Math.hypot(sx, sy)) * (OD / 2)];
    add(pl(X), mo, next); // the tip's top: the blank's own circle
  }
  return ok({ points, bulges, pitchRadius: PD / 2, baseRadius: 0, tipRadius: OD / 2, rootRadius: root, warnings: N < 12 ? ["few teeth: the chain runs roughly"] : [] });
}
