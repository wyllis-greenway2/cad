// The connecting rod maker (`dec_rod_maker`): the rod, its cap, and what a real rod has besides: a sleeve (bush) in the small end, two bearing shells in the big end, and two cap bolts. A model of its own (*Models > Connecting rod*, lying along +x with the big end at the
// origin, its thickness up) and the rod of the engine: `modelengine.ts` builds its rod by `buildRod` here, with the new parts off, so the two cannot differ. **Every proportion is ASSUMED** (no source gives them; `docs/sources/README.md` lists what the sources do
// say, and the fields say which number is which). Process features (draft, machining, how a bush is pressed in) are not here: they belong to manufacturing routes (`in_1311`). Lengths in mm. Pure: numbers in, steps out.
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";
import { Builder, disc, outline, box } from "./modelparts.ts";
import type { Place, ModelBuild, Shape } from "./modelparts.ts";
import { bulgeOf } from "./arcs.ts";

export interface RodSpec {
  /** which preset the numbers started from (0 your own) */ preset: number;
  /** the length between the centres of the big and the small bore, the piston pin's diameter and the crank pin's (mm) */ length: number; pin: number; crankPin: number;
  /** the rod's thickness at the big end and the beam, and at the small end (mm); 0 = auto (0.75 of the pin, at least 3; the small end's the same as the beam's) */ thick: number; smallThick: number;
  /** the room all round the pins (mm): the pin's running room in the small end, the crank pin's in the big end (half of it is also left between rod and cap) */ room: number;
  /** the beam's thickness (mm; 0 = 0.8 of the thinner of the two eyes: the eyes stand proud of the beam as a rim, to be machined flush with the pins' ends); the blend radius where the beam runs into each eye (mm; 0 = half the small end's outer radius) */ beamThick: number; blend: number;
  /** the beam's pockets: 0 none, 1 one long pocket in each face, 2 two (an I-beam; ASSUMED); the round at the pocket's floor (mm; 0 = 0.4 of the pocket's depth, at most 1.5; made as a second part) */ pockets: number; pocketRound: number;
  /** the oil passage: 0 none, 1 a hole drilled along the beam from the big bore to the small bore (through the shell and the sleeve); its diameter (mm; 0 = 0.1 of the pin, at most the web less 1) */ oil: number; oilDia: number;
  /** the small end's sleeve: 0 none (the pin runs on the bore), 1 a bush pressed in; its wall (mm; 0 = 0.06 of the pin, at least 1) */ bush: number; bushWall: number;
  /** the big end's bearing: 0 none (the crank pin runs on the bore), 1 two half shells; the shells' wall (mm; 0 = 0.029 of the crank pin: one worksheet, `dec_rod_maker`) */ shells: number; shellWall: number;
  /** the cap bolts: 0 holes only, 1 two bolts (a body each); the bolt's diameter (mm; 0 = 0.2 of the crank pin, at least 2) */ bolts: number; bolt: number;
}
export const ROD_START: RodSpec = { preset: 0, length: 84, pin: 18, crankPin: 30, thick: 0, smallThick: 0, room: 0.15, beamThick: 0, blend: 0, pockets: 1, pocketRound: 0, oil: 0, oilDia: 0, bush: 1, bushWall: 0, shells: 1, shellWall: 0, bolts: 1, bolt: 0 };
/** The Honda GX160's rod (the tech manual and the service manual, `docs/sources/README.md`): 83.8 to 84.4 mm between the bores, the pin 18 mm, the crank pin 29.98 (30 here), two bolts (12 N m). Honda's big end 30.02 on a 29.98 pin is the 0.04 oil clearance Honda gives, so the pin runs on the bare bore: **no shells and no bush** (my arithmetic). */
export const ROD_PRESETS: readonly { name: string; spec: RodSpec }[] = [
  { name: "Honda GX160", spec: { ...ROD_START, preset: 1, length: 84.1, pin: 18, crankPin: 30, shells: 0, bush: 0, bolts: 1 } },
];

/** Every length the rod is made from (mm) */
export interface RodGeo {
  /** length between the bores, the pin's diameter, the room, the thickness of the beam and the big end, and of the small end */ l: number; pin: number; rm: number; w: number; ws: number;
  /** the big end's outer radius and its bore, the small end's outer radius and its bore (each less than the bore's wall: the sleeve and the shells are inside the bores) */ rb: number; ri: number; rs: number; eye: number;
  /** the I-beam's web and flange, the bolt's diameter, the lugs' length either side of the split and the bolt's distance from the middle line */ web: number; flange: number; bolt: number; lug: number; boltY: number;
  /** the beam's thickness, the blend radius into the eyes, the round at the pockets' floor (0 none), the oil passage (1) and its diameter */ wb: number; rf: number; round: number; oil: number; oilD: number;
  /** the pockets (0 to 2); the sleeve's wall and the shells' wall (0 = none); two bolts as bodies (1) or holes only (0); the crank pin's radius */ pockets: number; bush: number; shell: number; bolts: number; cpR: number;
}
const r1 = (v: number): number => Math.round(v * 10) / 10, r2 = (v: number): number => Math.round(v * 100) / 100;
export function rodGeometry(s: RodSpec): RodGeo {
  const tb = s.bush === 1 ? (s.bushWall > 0 ? s.bushWall : Math.max(1, r1(0.06 * s.pin))) : 0, st = s.shells === 1 ? (s.shellWall > 0 ? s.shellWall : Math.max(0.5, r2(0.029 * s.crankPin))) : 0;
  const w = s.thick > 0 ? s.thick : Math.max(3, r1(0.75 * s.pin)), ws = s.smallThick > 0 ? s.smallThick : w, cpR = s.crankPin / 2;
  const rb = cpR + 2.5 + st, rs = s.pin / 2 + 1.5 + tb, bolt = s.bolt > 0 ? s.bolt : Math.max(2, r1(0.2 * s.crankPin));
  const wb = s.beamThick > 0 ? s.beamThick : r1(0.8 * Math.min(w, ws)), web = Math.max(1.6, r1(0.3 * wb)), deep = (wb - web) / 2;
  const round = Math.round(s.pockets) > 0 ? (s.pocketRound > 0 ? s.pocketRound : Math.min(1.5, r1(0.4 * deep))) : 0;
  const oilD = s.oilDia > 0 ? s.oilDia : Math.max(1, Math.min(r1(0.1 * s.pin), r1(web - 1)));
  return { l: s.length, pin: s.pin, rm: s.room, w, ws, rb, ri: cpR + s.room + st, rs, eye: s.pin / 2 + s.room + tb, web, flange: Math.max(0.8, 0.3 * 0.6 * rs), bolt, lug: 1.5 * bolt, boltY: rb + bolt / 2 + 0.3, wb, rf: s.blend > 0 ? s.blend : r1(0.5 * rs), round, oil: Math.round(s.oil), oilD, pockets: Math.round(s.pockets), bush: tb, shell: st, bolts: Math.round(s.bolts), cpR };
}

export function rodProblem(s: RodSpec): string | null {
  if (!Object.values(s).every(Number.isFinite)) return "every number must be a number";
  if (![s.length, s.pin, s.crankPin].every((v) => v > 0)) return "the length, the pin and the crank pin must be more than 0";
  if (![s.thick, s.smallThick, s.bushWall, s.shellWall, s.bolt, s.beamThick, s.blend, s.pocketRound, s.oilDia].every((v) => v >= 0) || !(s.room >= 0)) return "the thicknesses, walls and the room are 0 or more";
  if (![0, 1, 2].includes(Math.round(s.pockets)) || ![0, 1].includes(Math.round(s.bush)) || ![0, 1].includes(Math.round(s.shells)) || ![0, 1].includes(Math.round(s.bolts))) return "a choice is out of its list";
  const g = rodGeometry(s);
  if (g.w < 3 || g.ws < 2) return "the rod must be 3 mm thick (2 mm at the small end) or more";
  if (g.shell > 0.15 * s.crankPin) return "the shells' wall is more than 0.15 of the crank pin";
  if (g.bush > 0.3 * s.pin) return "the sleeve's wall is more than 0.3 of the pin";
  if (g.l < g.rb + g.rs + 12) return `the rod is too short between its bores: ${(g.rb + g.rs + 12).toFixed(1)} mm or more for these eyes`;
  if (g.bolt > 0.4 * s.crankPin) return "the bolts are more than 0.4 of the crank pin across";
  if (![0, 1].includes(Math.round(s.oil))) return "a choice is out of its list";
  if (g.wb > Math.min(g.w, g.ws) + 1e-9) return "the beam is thicker than an eye: the eyes stand proud of the beam";
  if (g.wb < 2) return "the beam must be 2 mm thick or more";
  if (g.oil === 1 && g.web - g.oilD < 0.9) return `the web (${g.web.toFixed(1)} mm) is too thin for a ${g.oilD.toFixed(1)} mm oil passage: a smaller hole or a thicker beam`;
  const pr = rodProfile(g, 0);
  if (!pr) return "the blend radius does not fit between the eyes: a smaller blend or a longer rod";
  if (g.pockets > 0 && pr.q2x - pr.q1x < 8) return "the beam is too short for pockets";
  return null;
}

type P2 = [number, number];
/**
 * The rod's outline in its plane, one smooth loop (the big end's half ring on the piston side of the split, a concave blend into the beam, the beam's two straight sides, a concave blend into the small end, the small end's far side round, and back): the beam's half width runs
 * from 0.6 of the big end's outer radius to 0.6 of the small end's (ASSUMED), and each blend is a circle of radius `rf` that touches the beam's side and the eye's outer circle. Null if the blends do not fit. `cx` is the big end's centre.
 */
export function rodProfile(g: RodGeo, cx: number): { pts: P2[]; bulges: number[]; q1x: number; q2x: number } | null {
  const xp0 = cx + g.l, e = g.rm / 2, xs = cx + e, rBore = g.ri + 0.3, yo = Math.sqrt(g.rb * g.rb - e * e), yi = Math.sqrt(rBore * rBore - e * e);
  const hb = 0.6 * g.rb, hs = 0.6 * g.rs, m = (hs - hb) / g.l, sq = Math.sqrt(1 + m * m), at = (x: number): number => hb + m * (x - cx), rf = g.rf;
  const root = (f: (x: number) => number, lo: number, hi: number, up: boolean): number => { for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if ((f(mid) > 0) === up) hi = mid; else lo = mid; } return (lo + hi) / 2; };
  const pbx = root((x) => (x - cx) ** 2 + (at(x) + rf * sq) ** 2 - (g.rb + rf) ** 2, cx, cx + g.rb + rf, true);
  const psx = root((x) => (x - xp0) ** 2 + (at(x) + rf * sq) ** 2 - (g.rs + rf) ** 2, xp0 - g.rs - rf, xp0, false);
  const Pb: P2 = [pbx, at(pbx) + rf * sq], Ps: P2 = [psx, at(psx) + rf * sq], n: P2 = [-m / sq, 1 / sq];
  const Tb: P2 = [cx + ((Pb[0] - cx) * g.rb) / (g.rb + rf), (Pb[1] * g.rb) / (g.rb + rf)], Ts: P2 = [xp0 + ((Ps[0] - xp0) * g.rs) / (g.rs + rf), (Ps[1] * g.rs) / (g.rs + rf)];
  const Qb: P2 = [Pb[0] - n[0] * rf, Pb[1] - n[1] * rf], Qs: P2 = [Ps[0] - n[0] * rf, Ps[1] - n[1] * rf];
  if (!(Qb[0] + 1 < Qs[0]) || Tb[1] < 0.2 * g.rb || !Number.isFinite(Qb[0] + Qs[0] + Tb[0] + Ts[0])) return null;
  const mid = (P: P2, A: P2, B: P2): P2 => { const u: P2 = [A[0] - P[0] + B[0] - P[0], A[1] - P[1] + B[1] - P[1]], l = Math.hypot(u[0], u[1]); return [P[0] + (u[0] / l) * rf, P[1] + (u[1] / l) * rf]; };
  const flip = (p: P2): P2 => [p[0], -p[1]];
  const S0: P2 = [xs, yo], S1: P2 = [xs, -yo], C: P2 = [xs, yi], D: P2 = [xs, -yi];
  const a0 = Math.atan2(yo, xs - cx), a1 = Math.atan2(Tb[1], Tb[0] - cx), am = (a0 + a1) / 2, bigTop: P2 = [cx + g.rb * Math.cos(am), g.rb * Math.sin(am)];
  const far: P2 = [xp0 + g.rs, 0], at0 = Math.atan2(Ts[1], Ts[0] - xp0), farTop: P2 = [xp0 + g.rs * Math.cos(at0 / 2), g.rs * Math.sin(at0 / 2)], farBot: P2 = [farTop[0], -farTop[1]]; // (the small end's far side is two arcs, and the big bore two: an arc of more than 180 degrees, or a half cylinder, made the kernel flaky)
  const Mb: P2 = [cx + rBore, 0], aD = Math.atan2(-yi, xs - cx), qd: P2 = [cx + rBore * Math.cos(aD / 2), rBore * Math.sin(aD / 2)], qc: P2 = [qd[0], -qd[1]];
  const pts: P2[] = [S0, Tb, Qb, Qs, Ts, far, flip(Ts), flip(Qs), flip(Qb), flip(Tb), S1, D, Mb, C];
  const bulges = [bulgeOf(S0, bigTop, Tb), bulgeOf(Tb, mid(Pb, Tb, Qb), Qb), 0, bulgeOf(Qs, mid(Ps, Qs, Ts), Ts), bulgeOf(Ts, farTop, far), bulgeOf(far, farBot, flip(Ts)), bulgeOf(flip(Ts), flip(mid(Ps, Qs, Ts)), flip(Qs)), 0,
    bulgeOf(flip(Qb), flip(mid(Pb, Tb, Qb)), flip(Tb)), bulgeOf(flip(Tb), flip(bigTop), S1), 0, bulgeOf(D, qd, Mb), bulgeOf(Mb, qc, C), 0];
  return { pts, bulges, q1x: Qb[0], q2x: Qs[0] };
}

/**
 * The rod and what goes with it as parts of `b`: the big end's centre at (`cx`, 0), the small end's at (`cx + l`, 0), the middle plane of the rod at height `zc`. The rod is one smooth outline (`rodProfile`) extruded as the beam's thickness, with the two eyes and the lugs standing
 * proud of it as rims (to be machined flush with the pins' ends and the bearings), the beam's web left between pockets cut in both faces, and an oil passage drilled along the beam if asked; the cap is the lower half of the split, a body of its own: the two stand half
 * the room either side of the crank pin's middle, so that they share no face (the kernel does not take two bodies that do). The sleeve, the shells and the bolts are bodies of their own, each a hair clear of what it sits in (0.02 mm radially, 0.05 mm along the bolt): no body shares a
 * face with another. **Not modelled:** the shells' crush, tabs and oil grooves, the bolts' threads and heads' hex, the nuts, a round where the rims meet the beam and where the lugs meet the big end.
 */
export function buildRod(b: Builder, g: RodGeo, cx: number, zc: number): void {
  const xp0 = cx + g.l, rm = g.rm, e = rm / 2, ri = g.ri, lugY0 = ri + 0.3, lugY1 = g.rb + g.bolt + 0.6;
  const pr = rodProfile(g, cx)!, hb = 0.6 * g.rb, hs = 0.6 * g.rs, at = (x: number): number => hb + ((hs - hb) * (x - cx)) / g.l;
  const half = (sign: 1 | -1, rOut: number, rIn: number): Shape => { // (a half ring on one side of the split, `sign` toward the piston: its flat face at the parting face, its arcs about the crank pin)
    const xs = cx + sign * e, yo = Math.sqrt(rOut * rOut - e * e), yi = Math.sqrt(rIn * rIn - e * e);
    const A: [number, number] = [xs, -yo], B: [number, number] = [xs, yo], C: [number, number] = [xs, yi], D: [number, number] = [xs, -yi];
    return outline([A, B, C, D], [bulgeOf(A, [cx + sign * rOut, 0], B), 0, bulgeOf(C, [cx + sign * rIn, 0], D), 0]);
  };
  const lug = (sign: 1 | -1, side: 1 | -1): Shape => { const xs = cx + sign * e, xe = cx + sign * g.lug, y0 = side * lugY0, y1 = side * lugY1; return box(Math.min(xs, xe), Math.min(y0, y1), Math.max(xs, xe), Math.max(y0, y1)); };
  b.part("Connecting rod");
  b.extrude(b.plane(zc - g.wb / 2), outline(pr.pts, pr.bulges), [disc(xp0, 0, g.eye + 0.3)], g.wb); // (the beam and the eyes' webs, one smooth loop with the small bore in it, 0.3 mm wider than the collar's)
  const rimB = ri + 0.6 * (g.rb - ri), rimS = g.eye + 0.6 * (g.rs - g.eye); // (a collar round each bore, 0.6 of the eye's wall wide, ASSUMED: the bearing's seat, machined flush with the pin or the crank's web)
  b.extrude(b.plane(zc - g.w / 2), half(1, rimB, ri), [], g.w, { mode: "add", also: [{ outer: lug(1, 1), depth: g.w }, { outer: lug(1, -1), depth: g.w }] }); // (the big end's collar and its lugs)
  b.extrude(b.plane(zc - g.ws / 2), disc(xp0, 0, rimS), [disc(xp0, 0, g.eye)], g.ws, { mode: "add" }); // (the small end's collar)
  if (g.pockets > 0) {
    const x0 = pr.q1x + 1, x1 = pr.q2x - 1, deep = (g.wb - g.web) / 2, rib = Math.max(2, 0.12 * (x1 - x0)), xm = (x0 + x1) / 2;
    const slot = (a: number, c: number): Shape => { // (a tapered obround: straight sides, round ends)
      const ya = at(a) - g.flange, yc = at(c) - g.flange, xa = a + ya, xc = c - yc;
      const A: P2 = [xa, -ya], B: P2 = [xc, -yc], Cc: P2 = [xc, yc], Dd: P2 = [xa, ya];
      return outline([A, B, Cc, Dd], [0, bulgeOf(B, [xc + yc, 0], Cc), 0, bulgeOf(Dd, [xa - ya, 0], A)]);
    };
    const cut = (z: number, d: number): void => {
      if (g.pockets === 1) b.extrude(b.plane(z), slot(x0, x1), [], d, { mode: "cut" });
      else b.extrude(b.plane(z), slot(x0, xm - rib / 2), [], d, { mode: "cut", also: [{ outer: slot(xm + rib / 2, x1), depth: d }] });
    };
    cut(zc + g.wb / 2, -deep);
    cut(zc - g.wb / 2, deep);
  }
  if (g.oil === 1) b.extrude(b.frame([cx + g.cpR + rm - 1, 0, zc], [0, 1, 0], [0, 0, 1]), disc(0, 0, g.oilD / 2), [], g.l - g.cpR - rm - g.pin / 2 - rm + 2, { mode: "cut" }); // (drilled from the big bore to the small bore along the web's middle)
  b.part("Rod cap");
  b.extrude(b.plane(zc - g.w / 2), half(-1, g.rb, ri), [], g.w, { also: [{ outer: lug(-1, 1), depth: g.w }, { outer: lug(-1, -1), depth: g.w }] });
  for (const side of [1, -1]) b.extrude(b.frame([cx - g.lug - 1, 0, zc], [0, 1, 0], [0, 0, 1]), disc(side * g.boltY, 0, g.bolt / 2), [], 2 * g.lug + 2, { mode: "cut" });
  if (g.bush > 0) {
    b.part("Small end bush");
    b.extrude(b.plane(zc - g.ws / 2), disc(xp0, 0, g.eye - 0.02), [disc(xp0, 0, g.pin / 2 + rm)], g.ws);
  }
  if (g.shell > 0) {
    const sw = g.w - 0.6, rin = g.cpR + rm; // (the shells are a little narrower than the rod)
    b.part("Bearing shell 1");
    b.extrude(b.plane(zc - sw / 2), half(1, ri - 0.02, rin), [], sw);
    b.part("Bearing shell 2");
    b.extrude(b.plane(zc - sw / 2), half(-1, ri - 0.02, rin), [], sw);
  }
  if (g.bolts === 1) {
    const hr = 0.75 * g.bolt, hh = g.bolt, xh = cx - g.lug - 0.05; // (a round socket head under which the cap's lug lies, and the shank through both lugs)
    [1, -1].forEach((side, i) => {
      b.part(`Cap bolt ${i + 1}`);
      b.extrude(b.frame([xh - hh, 0, zc], [0, 1, 0], [0, 0, 1]), disc(side * g.boltY, 0, hr), [], hh);
      b.extrude(b.frame([xh, 0, zc], [0, 1, 0], [0, 0, 1]), disc(side * g.boltY, 0, g.bolt / 2 - 0.05), [], 2 * g.lug - 0.25, { mode: "add" });
    });
  }
  if (g.round > 0 && g.pockets > 0) { // (a round where each pocket's floor meets its wall: a second part, made once the kernel has the rod: its edges are the ones standing at the web's two faces, between the eyes)
    const t = g.web / 2, x0 = cx + g.rb - 1, x1 = xp0 - g.rs + 1;
    b.part("Pocket rounds");
    b.roundEdges((sc, toModel, edgeAt) => Object.values(sc.parts).flatMap((p) => {
      if (p.kind !== "line" || p.origin !== "body") return [];
      const ed = edgeAt(p.ref);
      if (!ed) return [];
      return [ed.a, ed.b, ed.mid].map(toModel).every((q) => Math.abs(Math.abs(q[2] - zc) - t) < 0.02 && q[0] > x0 && q[0] < x1) ? [p.ref] : [];
    }), "fillet", g.round);
  }
}

/** The rod as the steps of a model: lying along +x, the big end at the origin, resting on the ground plane */
export function rodSteps(s: RodSpec, place?: Place): Result<ModelBuild> {
  const bad = rodProblem(s);
  if (bad) return err(bad);
  const g = rodGeometry(s), b = new Builder(place);
  buildRod(b, g, 0, Math.max(g.w, g.ws) / 2);
  return ok(b.build());
}
/** the longest way across the rod, from its two ends' outsides */
export const rodExtent = (s: RodSpec): number => { const g = rodGeometry(s); return g.l + g.rb + g.rs; };
export function rodAbout(s: RodSpec): string {
  const bad = rodProblem(s);
  if (bad) return bad;
  const g = rodGeometry(s), p = ROD_PRESETS[Math.round(s.preset) - 1];
  return `${p ? p.name + ": " : ""}${g.l.toFixed(1)} mm between the bores, ${g.w.toFixed(1)} mm thick, big bore ${(2 * g.ri).toFixed(2)} mm, small bore ${(2 * g.eye).toFixed(2)} mm; ${g.shell > 0 ? `two shells ${g.shell.toFixed(2)} mm thick` : "no shells (the crank pin runs on the bore)"}, ${g.bush > 0 ? `a sleeve ${g.bush.toFixed(1)} mm thick` : "no sleeve (the pin runs on the bore)"}, ${g.bolts ? `bolts ${g.bolt.toFixed(1)} mm` : "bolt holes only"}; every proportion is assumed, the field says which`;
}
