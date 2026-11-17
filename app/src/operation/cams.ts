// Cams (`dec_spline_and_cams`): the shapes of an eccentric cam and a snail (drop) cam, as the drawing is made of them. Pure maths in the plane's own x and y, the shaft's axis at the origin, the rise starting along +x.
// An eccentric cam is a disc turned about a point that is not its middle: the follower rises and falls by twice the offset, smoothly (simple harmonic motion). A snail cam rises at a steady rate over one turn (a spiral of
// Archimedes) and drops back at once: the cam of a ratchet-like lift, a striking clock, a lever that is let go. Neither has a standard tooth: the numbers are the diameter, the lift, and the shaft's hole.
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";

export type CamKind = "eccentric" | "snail";
export interface CamSpec {
  kind: CamKind;
  /** mm: an eccentric's disc; a snail's smallest (base) circle */
  diameter: number;
  /** mm: an eccentric's offset of the disc's middle from the shaft (the follower moves twice this); a snail's rise over one turn */
  lift: number;
  /** mm: the shaft's hole, 0 for none */
  hole: number;
}
export type V2 = [number, number];
export interface CamShapes {
  /** round parts: the disc of an eccentric, and the shaft's hole */
  circles: { c: V2; r: number; hole?: true }[];
  /** a snail's spiral, from its base circle at the start of the turn to the top of the rise at the end of it; the sides that close the shape are a straight line from the end back to the start */
  spiral: V2[] | null;
}
const SPIRAL_POINTS = 25;
export function camProblem(s: CamSpec): string | null {
  if (!(s.diameter > 0)) return "the cam needs a diameter";
  if (!(s.lift > 0)) return s.kind === "eccentric" ? "the cam needs an offset (how far the shaft is from the middle of the disc)" : "the cam needs a lift (how far it rises over one turn)";
  if (s.hole < 0) return "the shaft's hole cannot be less than nothing";
  const r = s.diameter / 2;
  if (s.kind === "eccentric" && s.hole / 2 + s.lift >= r - 1e-9) return "the shaft's hole would break through the edge of the disc: make the offset or the hole smaller, or the disc bigger";
  if (s.kind === "snail" && s.hole / 2 >= r - 1e-9) return "the shaft's hole is as wide as the cam's base circle: make the hole smaller";
  return null;
}
export function camShapes(s: CamSpec): Result<CamShapes> {
  const why = camProblem(s);
  if (why) return err(why);
  const r = s.diameter / 2;
  const hole: CamShapes["circles"] = s.hole > 0 ? [{ c: [0, 0], r: s.hole / 2, hole: true }] : [];
  if (s.kind === "eccentric") return ok({ circles: [{ c: [s.lift, 0], r }, ...hole], spiral: null });
  const spiral: V2[] = Array.from({ length: SPIRAL_POINTS }, (_, i) => { const t = (i / (SPIRAL_POINTS - 1)) * 2 * Math.PI; const rr = r + (s.lift * t) / (2 * Math.PI); return [rr * Math.cos(t), rr * Math.sin(t)]; });
  spiral[spiral.length - 1] = [r + s.lift, 0]; // (the turn ends exactly on the axis of the start, not a rounding off it)
  return ok({ circles: hole, spiral });
}
