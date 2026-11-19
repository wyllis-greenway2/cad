// A wheel as a model (`dec_hub_spoke`): a rim, spokes and a hub as ONE body, for a wheel, a pulley blank or any round part. The spokes are one of four styles: tapered (thick at the hub, thinner at the rim, with fillet flares into
// both, as a cast spoke is), flat taper (plain tapered bars), straight bars, or a solid web with round lightening holes. The wheel stands along z with its middle at z = 0. All proportions are rules of thumb, not a standard. Pure.
import { Builder, disc, outline } from "./modelparts.ts";
import type { Place, ModelBuild, Shape } from "./modelparts.ts";
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";

/** The numbers of a wheel (mm): `style` 0 tapered, 1 flat taper, 2 straight, 3 web (its `spokes` the number of holes) */
export interface WheelSpec { outer: number; width: number; rim: number; hub: number; hubLen: number; bore: number; style: number; spokes: number; spokeW: number; spokeT: number }
export const WHEEL_START: WheelSpec = { outer: 60, width: 12, rim: 4, hub: 20, hubLen: 14, bore: 6, style: 0, spokes: 5, spokeW: 6, spokeT: 6 };
export const WHEEL_STYLES = ["Tapered", "Flat taper", "Straight", "Web"] as const;
/** the least a printed part is thick (mm): the same one the other models use for a rib */
const THIN = 1.2;
/** how much narrower a tapered spoke is at the rim than at the hub */
const TAPER = 0.6;

/** The radii: the rim's inside, where a spoke starts (inside the hub, so it joins it) and ends (inside the rim) */
export function wheelGeometry(s: WheelSpec): { R: number; Rin: number; hubR: number; r0: number; r1: number } {
  const R = s.outer / 2, Rin = R - s.rim, hubR = s.hub / 2;
  return { R, Rin, hubR, r0: hubR - 1, r1: Rin + 1 };
}
/** the radius of the round lightening holes of a web, and the circle they stand on (0 radius: they do not fit) */
export function webHoles(s: WheelSpec): { at: number; r: number } {
  const g = wheelGeometry(s), at = (g.Rin + g.hubR) / 2, n = Math.max(1, Math.round(s.spokes));
  return { at, r: Math.min((g.Rin - g.hubR) / 2 - THIN, at * Math.sin(Math.PI / n) - THIN) };
}

/** Why the numbers make no wheel, or null */
export function wheelProblem(s: WheelSpec): string | null {
  const g = wheelGeometry(s), n = Math.round(s.spokes), web = Math.round(s.style) === 3;
  if (![0, 1, 2, 3].includes(Math.round(s.style))) return "the style is 0 (tapered), 1 (flat taper), 2 (straight) or 3 (web)";
  if (!(s.outer > 0) || !(s.width > 0) || !(s.rim > 0) || !(s.hub > 0) || !(s.hubLen > 0) || !(s.bore > 0) || !(s.spokeW > 0) || !(s.spokeT > 0)) return "every size must be more than 0";
  if (s.rim < THIN) return `the rim must be at least ${THIN} mm thick to print`;
  if (s.spokeT < THIN || (!web && s.spokeW < THIN)) return `a spoke must be at least ${THIN} mm thick and wide to print`;
  if (s.hub - s.bore < 4) return "the hub must be at least 2 mm thick all round the bore: make the bore smaller or the hub bigger";
  if (g.Rin - g.hubR < 3) return "the hub is too big for the rim: there is no room for spokes between them (smaller hub or thinner rim)";
  if (s.spokeT > s.width) return "the spokes cannot be thicker than the rim is wide";
  if (s.hubLen < s.spokeT) return "the hub must be at least as long as the spokes are thick";
  if (n < (web ? 3 : 2) || n > 16) return web ? "a web has 3 to 16 holes" : "2 to 16 spokes";
  if (web) { const h = webHoles(s); if (h.r < 1) return "the round holes of the web do not fit: fewer holes, or a bigger wheel"; }
  else if (halfWidth(s, g.hubR) > g.r0 * Math.sin(Math.PI / n) * 0.95) return "the spokes are too wide for their number: they would run into each other at the hub";
  return null;
}

/** the half width of a spoke at `r` (the plan of one spoke): constant, linear taper, or taper with fillet flares into the hub and the rim */
function halfWidth(s: WheelSpec, r: number): number {
  const g = wheelGeometry(s), style = Math.round(s.style), span = g.Rin - g.hubR, t = Math.min(1, Math.max(0, (r - g.hubR) / span));
  const base = (s.spokeW / 2) * (style === 2 ? 1 : 1 - (1 - TAPER) * t);
  if (style !== 0) return base;
  const flare = (s.spokeW / 2) * 0.4, L = span * 0.3; // (cast spokes meet the hub and the rim in a fillet: it carries more metal there)
  const e = (x: number): number => (x < 1 ? (1 - x) * (1 - x) : 0);
  return base + flare * (e((r - g.hubR) / L) + e((g.Rin - r) / L));
}
/** one spoke's outline in the plan, pointing along angle `a` */
function spokeOutline(s: WheelSpec, a: number): [number, number][] {
  const g = wheelGeometry(s), N = Math.round(s.style) === 0 ? 16 : 1, [c, d] = [Math.cos(a), Math.sin(a)];
  const rs = Array.from({ length: N + 1 }, (_, i) => g.r0 + ((g.r1 - g.r0) * i) / N);
  const side = (sign: number): [number, number][] => rs.map((r) => { const h = halfWidth(s, Math.min(Math.max(r, g.hubR), g.Rin)) * sign; return [r * c - h * d, r * d + h * c]; });
  return [...side(1), ...side(-1).reverse()];
}

/** The picture of the wheel in plan: rim, hub, bore and the spokes (or the holes of a web) */
export function wheelLines(s: WheelSpec): [number, number][][] {
  const g = wheelGeometry(s), n = Math.round(s.spokes), ring = (r: number, k = 48): [number, number][] => Array.from({ length: k + 1 }, (_, i) => [r * Math.cos((2 * Math.PI * i) / k), r * Math.sin((2 * Math.PI * i) / k)]);
  const lines = [ring(g.R, 64), ring(g.Rin, 64), ring(g.hubR), ring(s.bore / 2, 24)];
  if (Math.round(s.style) === 3) { const h = webHoles(s); if (h.r > 0) for (let k = 0; k < n; k++) lines.push(Array.from({ length: 17 }, (_, i) => [h.at * Math.cos((2 * Math.PI * k) / n) + h.r * Math.cos((2 * Math.PI * i) / 16), h.at * Math.sin((2 * Math.PI * k) / n) + h.r * Math.sin((2 * Math.PI * i) / 16)] as [number, number])); }
  else for (let k = 0; k < n; k++) { const o = spokeOutline(s, (2 * Math.PI * k) / n); lines.push([...o, o[0]!]); }
  return lines;
}

/** The wheel as steps of one part: the rim first, then the spokes (or the web), then the hub, each joined to the one before */
export function wheelSteps(s: WheelSpec, place: Place): Result<ModelBuild> {
  const bad = wheelProblem(s);
  if (bad) return err(bad);
  const g = wheelGeometry(s), n = Math.round(s.spokes), b = new Builder(place);
  b.part("Wheel");
  b.extrude(b.plane(-s.width / 2), disc(0, 0, g.R), [disc(0, 0, g.Rin)], s.width);
  const mid = b.plane(-s.spokeT / 2);
  if (Math.round(s.style) === 3) {
    const h = webHoles(s), holes: Shape[] = Array.from({ length: n }, (_, k) => disc(h.at * Math.cos((2 * Math.PI * k) / n), h.at * Math.sin((2 * Math.PI * k) / n), h.r));
    b.extrude(mid, disc(0, 0, g.r1), [disc(0, 0, g.r0), ...holes], s.spokeT, { mode: "add" });
  } else {
    const spokes = Array.from({ length: n }, (_, k) => spokeOutline(s, (2 * Math.PI * k) / n));
    b.extrude(mid, outline(spokes[0]!), [], s.spokeT, { mode: "add", also: spokes.slice(1).map((o) => ({ outer: outline(o), depth: s.spokeT })) });
  }
  b.extrude(b.plane(-s.hubLen / 2), disc(0, 0, g.hubR), [disc(0, 0, s.bore / 2)], s.hubLen, { mode: "add" });
  return ok(b.build());
}
