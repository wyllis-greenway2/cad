// The tooth chamfer of a bevel, spiral or hypoid gear (`dec_bevel_chamfer`, `in_967`): the gear's body is a prism of its teeth cut by a revolved blank of the two back cones, so a facet on each tooth tip at the heel and at the toe is made by trimming the blank's
// two corners where a back cone meets the tip cone; nothing is added to the kernel's steps. All in the blank's section: x along the axis from the gear's apex, r the radius.
type XR = [number, number];

/** the tip cone in the blank's section: r = a x + b */
export interface TipLine { a: number; b: number }
const unit = (p: XR, q: XR): XR => { const d = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1; return [(q[0] - p[0]) / d, (q[1] - p[1]) / d]; };

/**
 * The facet at the corner of a back cone (the line from `low` to `high`, `low` the smaller radius) and the tip cone: it cuts `c` mm along the back cone (down from the corner) and `c` along the tip cone (towards the gear's middle: `towardsX` is -1 for the heel, whose gear is
 * at smaller x, and +1 for the toe), and goes on past the tip cone until it is `margin` above it (measured along r). Returns the point on the back cone where the facet starts and the point of the facet at `rTop`, or null if the corner does not make a facet (the cone does not meet the tip cone above `low`).
 */
export function facetOf(low: XR, high: XR, tip: TipLine, c: number, towardsX: 1 | -1, margin: number): { start: XR; top: XR; corner: XR } | null {
  // the corner: the back cone line low + t (high - low) meets r = a x + b
  const [dx, dr] = [high[0] - low[0], high[1] - low[1]];
  const den = dr - tip.a * dx;
  if (Math.abs(den) < 1e-9) return null;
  const t = (tip.a * low[0] + tip.b - low[1]) / den;
  if (!(t > 0)) return null;
  const T: XR = [low[0] + t * dx, low[1] + t * dr];
  const back = unit(T, low);
  const along = unit([0, 0], [towardsX, towardsX * tip.a]); // (down the tip cone towards the gear's middle)
  const P1: XR = [T[0] + c * back[0], T[1] + c * back[1]], P2: XR = [T[0] + c * along[0], T[1] + c * along[1]];
  if (!(P1[1] > low[1] + 1e-6)) return null;
  const d: XR = [P2[0] - P1[0], P2[1] - P1[1]];
  const gap = (q: XR) => q[1] - tip.a * q[0] - tip.b; // (how far above the tip cone, along r)
  const along1 = d[1] - tip.a * d[0]; // (the facet crosses the tip cone outwards: always, for a cone under 90 degrees)
  if (!(along1 > 1e-6)) return null;
  const s = (margin - gap(P1)) / along1;
  return { start: P1, top: [P1[0] + s * d[0], P1[1] + s * d[1]], corner: T };
}

/**
 * The blank (x, r points in order: the hub's axis end `p0`, the back cone at the heel from `heelLow` to `heelHigh`, the toe's from `toeHigh` to `toeLow`, the hub's other axis end `p5`) with the two corners faceted: the heel's `heelLow`, the facet's start and top,
 * then the toe's top and start, `toeLow`. With no chamfer (c = 0), or a corner that makes no facet, the points as they were. `margin` is how far above the tip cone the facets go (mm).
 */
export function chamferedBlank(p0: XR, heelLow: XR, heelHigh: XR, toeHigh: XR, toeLow: XR, p5: XR, tip: TipLine, c: number, margin: number): XR[] {
  const plain: XR[] = [p0, heelLow, heelHigh, toeHigh, toeLow, p5];
  if (!(c > 0)) return plain;
  const h = facetOf(heelLow, heelHigh, tip, c, -1, margin), t = facetOf(toeLow, toeHigh, tip, c, 1, margin);
  if (!h || !t) return plain;
  return [p0, heelLow, h.start, h.top, t.top, t.start, toeLow, p5];
}
