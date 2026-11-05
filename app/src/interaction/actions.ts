// The actions service (`dec_clean_engine_design` section 3): for the selected parts, every relation and operation that applies, each with a label,
// whether it is enabled (or why not), a measure when it has a number, and `run -> command`. The menu, the number chip, the keyboard and the touch
// long-press all ask this one function. Generalises the prototype's relations table (`relations.mjs`) from sketch parts to any parts.
// Geometry is read in 3D from the scene, so no plane or sketch is involved in measuring.
import type { Ref } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import { sub, dot, cross, length, dist, mid, normalize } from "../math/vec.ts";
import type { Scene, Relation } from "../operation/scene.ts";
import { lookup, nextId } from "../operation/scene.ts";
import type { Kind, Lookup } from "../operation/part.ts";
import { pointOf, segmentOf, circleOf, normalOfPlane, planeOfParts } from "../operation/part.ts";
import type { Command } from "../operation/commands.ts";
import { ordered } from "./selection.ts";

const PARALLEL_SIN = 0.02; // two lines count as parallel for a distance when the sine of the angle between them is below this (about 1 degree)

export interface Action {
  id: string;
  label: string;
  group: "relation" | "operation";
  dimensional: boolean;
  unit: "mm" | "deg" | null;
  /** The parts, mover first. */
  parts: Ref[];
  enabled: boolean;
  /** Why it cannot be done now (when not enabled). */
  why: string | null;
  /** The current value of a dimensional relation. */
  measure(): number | null;
  /** Where a chip for the number goes. */
  spot(): Vec3 | null;
  /** The command that does it; a dimensional relation takes a value (the measure if none). */
  run(value?: number): Command;
}

interface Ctx { scene: Scene; get: Lookup; parts: Ref[] }
interface Row {
  id: string;
  label: string;
  pair: Kind[];
  anyOrder?: boolean;
  unit?: "mm" | "deg";
  unavailable?: (c: Ctx, r: Ref[]) => string | null;
  measure?: (c: Ctx, r: Ref[]) => number | null;
  params?: (c: Ctx, r: Ref[]) => Record<string, number>;
  spot?: (c: Ctx, r: Ref[]) => Vec3 | null;
}

const segs = (c: Ctx, r: Ref[]): [Vec3, Vec3][] => r.map((x) => segmentOf(c.get, x)).filter((s): s is [Vec3, Vec3] => !!s);
const dir = (s: [Vec3, Vec3]): Vec3 => normalize(sub(s[1], s[0]));
const normalFor = (c: Ctx, r: Ref[]): Vec3 => {
  const pl = planeOfParts(c.get, r);
  return pl ? normalOfPlane(pl) : [0, 0, 1];
};
/** Perpendicular distance of q from the infinite line through s, signed by the plane normal (positive on the left of the line's direction). */
const signedFromLine = (s: [Vec3, Vec3], q: Vec3, n: Vec3): number => dot(n, cross(dir(s), sub(q, s[0])));
const sideOf = (v: number) => (v >= 0 ? 1 : -1);

/** Rows in the order of the table (the prototype's order). */
export const ROWS: Row[] = [
  { id: "horizontal", label: "Horizontal", pair: ["line"] },
  { id: "vertical", label: "Vertical", pair: ["line"] },
  {
    // the length of a line (the distance between its two corners)
    id: "length", label: "Length", pair: ["line"], unit: "mm",
    measure: (c, r) => {
      const [s] = segs(c, r);
      return s ? dist(s[0], s[1]) : null;
    },
    spot: (c, r) => {
      const [s] = segs(c, r);
      return s ? mid(s[0], s[1]) : null;
    },
  },
  { id: "fixed", label: "Fix in place", pair: ["corner"] },
  {
    // the diameter of a circle
    id: "diameter", label: "Diameter", pair: ["circle"], unit: "mm",
    measure: (c, r) => {
      const k = circleOf(c.get, r[0]!);
      return k ? k.radius * 2 : null;
    },
    spot: (c, r) => circleOf(c.get, r[0]!)?.center ?? null,
  },

  { id: "coincident", label: "Coincident", pair: ["corner", "corner"] },
  { id: "sameHeight", label: "Same height", pair: ["corner", "corner"] },
  { id: "sameAcross", label: "Same position across", pair: ["corner", "corner"] },
  {
    id: "distance", label: "Distance", pair: ["corner", "corner"], unit: "mm",
    measure: (c, r) => {
      const [a, b] = [pointOf(c.get, r[0]!), pointOf(c.get, r[1]!)];
      return a && b ? dist(a, b) : null;
    },
    spot: (c, r) => {
      const [a, b] = [pointOf(c.get, r[0]!), pointOf(c.get, r[1]!)];
      return a && b ? mid(a, b) : null;
    },
  },

  { id: "equalLength", label: "Equal length", pair: ["line", "line"] },
  { id: "parallel", label: "Parallel", pair: ["line", "line"] },
  { id: "perpendicular", label: "Perpendicular", pair: ["line", "line"] },
  {
    // the perpendicular gap between two parallel lines (between the infinite lines they lie on); the lines must be parallel already, so they are made parallel first
    id: "distance", label: "Distance", pair: ["line", "line"], unit: "mm",
    unavailable: (c, r) => {
      const [s1, s2] = segs(c, r);
      if (!s1 || !s2) return "a line is missing";
      return Math.abs(length(cross(dir(s1), dir(s2)))) > PARALLEL_SIN ? "the lines are not parallel: make them parallel first" : null;
    },
    measure: (c, r) => {
      const [s1, s2] = segs(c, r);
      if (!s1 || !s2) return null;
      return Math.abs(signedFromLine(s1, mid(s2[0], s2[1]), normalFor(c, r)));
    },
    params: (c, r) => {
      const [s1, s2] = segs(c, r);
      return s1 && s2 ? { side: sideOf(signedFromLine(s1, mid(s2[0], s2[1]), normalFor(c, r))) } : ({} as Record<string, number>);
    },
    spot: (c, r) => {
      const [s1, s2] = segs(c, r);
      return s1 && s2 ? mid(mid(s1[0], s1[1]), mid(s2[0], s2[1])) : null;
    },
  },
  {
    // the angle between two lines that share a corner, both measured away from it
    id: "angle", label: "Angle", pair: ["line", "line"], unit: "deg",
    unavailable: (c, r) => (shared(c, r) ? null : "the lines do not share a corner"),
    measure: (c, r) => {
      const sh = shared(c, r);
      if (!sh) return null;
      return Math.abs(signedAngle(sh, normalFor(c, r)));
    },
    params: (c, r) => {
      const sh = shared(c, r);
      return sh ? { side: sideOf(signedAngle(sh, normalFor(c, r))) } : ({} as Record<string, number>);
    },
    spot: (c, r) => {
      const sh = shared(c, r);
      return sh ? sh.v : null;
    },
  },

  { id: "equalRadius", label: "Equal radius", pair: ["circle", "circle"] },

  {
    // the perpendicular distance from a corner to the infinite line a segment lies on
    id: "distance", label: "Distance", pair: ["corner", "line"], anyOrder: true, unit: "mm",
    measure: (c, r) => {
      const [p, s] = pointAndLine(c, r);
      return p && s ? Math.abs(signedFromLine(s, p, normalFor(c, r))) : null;
    },
    params: (c, r) => {
      const [p, s] = pointAndLine(c, r);
      return p && s ? { side: sideOf(signedFromLine(s, p, normalFor(c, r))) } : ({} as Record<string, number>);
    },
    spot: (c, r) => {
      const [p, s] = pointAndLine(c, r);
      if (!p || !s) return null;
      const f = dot(dir(s), sub(p, s[0]));
      const foot: Vec3 = [s[0][0] + dir(s)[0] * f, s[0][1] + dir(s)[1] * f, s[0][2] + dir(s)[2] * f];
      return mid(p, foot);
    },
  },
];

function pointAndLine(c: Ctx, r: Ref[]): [Vec3 | null, [Vec3, Vec3] | null] {
  const corner = r.find((x) => c.get(x)?.kind === "corner");
  const line = r.find((x) => c.get(x)?.kind === "line");
  return [corner ? pointOf(c.get, corner) : null, line ? segmentOf(c.get, line) : null];
}
/** Two lines that share a corner: the shared corner and the far ends. */
function shared(c: Ctx, r: Ref[]): { v: Vec3; p: Vec3; q: Vec3 } | null {
  const [la, lb] = r.map((x) => c.get(x));
  if (!la || !lb || la.kind !== "line" || lb.kind !== "line" || la.ref === lb.ref) return null;
  for (const [i, ca] of [la.a, la.b].entries()) {
    for (const [j, cb] of [lb.a, lb.b].entries()) {
      if (ca !== cb) continue;
      const [v, p, q] = [pointOf(c.get, ca), pointOf(c.get, i === 0 ? la.b : la.a), pointOf(c.get, j === 0 ? lb.b : lb.a)];
      return v && p && q ? { v, p, q } : null;
    }
  }
  return null;
}
const signedAngle = (sh: { v: Vec3; p: Vec3; q: Vec3 }, n: Vec3): number => {
  const u = sub(sh.p, sh.v);
  const w = sub(sh.q, sh.v);
  return (Math.atan2(dot(n, cross(u, w)), dot(u, w)) * 180) / Math.PI;
};

const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((k, i) => k === b[i]);

/** Every relation and operation that applies to the selection, relations first, in the order of the table. */
export function actionsFor(scene: Scene, selection: readonly Ref[]): Action[] {
  const get = lookup(scene);
  const sel = ordered(selection, get).filter((r) => get(r));
  if (!sel.length) return [];
  const kinds = sel.map((r) => get(r)!.kind);
  const ctx: Ctx = { scene, get, parts: sel };
  const out: Action[] = [];
  const movable = sel.some((r) => get(r)?.movable);

  for (const row of ROWS) {
    if (row.pair.length !== sel.length) continue;
    if (!(same(row.pair, kinds) || (row.anyOrder && same(row.pair, [...kinds].reverse())))) continue;
    const why = !movable ? "all of these are references: nothing here can move" : (row.unavailable?.(ctx, sel) ?? null);
    const dimensional = !!row.measure;
    out.push({
      id: row.id,
      label: row.label,
      group: "relation",
      dimensional,
      unit: row.unit ?? null,
      parts: sel,
      enabled: why === null,
      why,
      measure: () => row.measure?.(ctx, sel) ?? null,
      spot: () => row.spot?.(ctx, sel) ?? null,
      run: (value) => {
        const v = value ?? row.measure?.(ctx, sel) ?? undefined;
        const rel: Relation = {
          id: nextId(scene, "r"),
          kind: row.id,
          parts: sel,
          ...(dimensional ? { value: v, locked: true } : {}),
          ...(row.params ? { params: row.params(ctx, sel) } : {}),
        };
        return { type: "addRelation", relation: rel };
      },
    });
  }

  // delete: drawn parts (a closed figure goes with its corners, so nothing is left behind), or the whole body (one step, so it undoes)
  const whole = sel.filter((r) => get(r)?.kind === "body");
  if (whole.length) {
    out.push({
      id: "delete", label: "Delete", group: "operation", dimensional: false, unit: null, parts: whole,
      enabled: true, why: null, measure: () => null, spot: () => null,
      run: () => ({ type: "addStep", step: { id: nextId(scene, "s"), type: "delete", parts: whole, params: {} } }),
    });
  } else {
    const drawn = sel.filter((r) => get(r)?.movable);
    const targets = drawn.flatMap((r): Ref[] => {
      const p = get(r);
      return p?.kind === "face" ? p.corners : [r]; // a face's corners (a disk's centre): everything built on them goes too
    });
    if (targets.length) {
      out.push({
        id: "delete", label: "Delete", group: "operation", dimensional: false, unit: null, parts: drawn,
        enabled: true, why: null, measure: () => null, spot: () => null,
        run: (): Command => ({ type: "deleteParts", refs: targets }),
      });
    }
  }
  return out;
}

export const dimensionalFor = (scene: Scene, selection: readonly Ref[]): Action | null => actionsFor(scene, selection).find((a) => a.dimensional) ?? null;
