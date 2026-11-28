// The facts of a sketch (`q_lean_ui`, `in_1562`, `dec_marks_on_things`): what a constraint or a number is, where it stands (`whereOf`: literally, on the point or the touching place), what a selection takes in (`scopeOf`: going down, never up),
// and the numbers as they are shown (a circle by its diameter, an angle inside its corner). A fact is a constraint (its icon) or a dimension (its number); `marks.ts` says which show and in what state, `markdraw.ts` draws them.
// Pure: the solver's system and the selection in, descriptions out.
import {
  RANGEABLE,
  RELATIONS,
  kindOf,
  type Constraint,
  type Relation,
  type Solution,
  type System,
} from "../engine/solver.ts";
import { offersFor, type Offer } from "./suggest.ts";

export type BubbleTone = "rest" | "refused" | "applied" | "offer";
export interface Bubble {
  /** the constraint's id */ id: string;
  kind: "constraint" | "dimension";
  relation: Relation;
  /** the icon (`icons.ts`) */ icon: string;
  /** where it belongs, in the sketch's own axes (mm) */ at: [number, number];
  /** a dimension's number as it is read, with what the number is of (`R`, `°`) */ text?: string;
  symbol?: string;
  unit?: "mm" | "deg";
  value?: number;
  tone: BubbleTone;
  /** the words (a tooltip): what it is and what it ties the selection to */ title: string;
  parts: string[];
  /** how a typed number becomes the solver's value (a circle is shown by its diameter: the value is half of it; an angle is shown inside the corner: `mul` and `add` turn it into the directed angle the solver reads): value = mul * typed + add */ input?: {
    mul: number;
    add: number;
  };
  /** a number of a figure being drawn: it takes digits from the keys and nothing else (no click), and the one digits go to is `active` */ readonly?: boolean;
  active?: boolean;
  /** a dimension: locked (the constraint exists, a closed padlock) or only measured (no constraint, an open padlock: `dec_dimensions_measure_then_lock`) */ locked?: boolean;
}
/** A refusal while it flashes: the constraints that held the change back; and the ones that held already. */
export interface Flash {
  refused?: readonly string[];
  applied?: readonly string[];
}
/** a constraint is shown when one of its parts is selected, and while it flashes (a refusal shows what holds it back, wherever it is) */

const ICON: Partial<Record<Relation, string>> = {
  on: "onLine",
  length: "dimension",
  distance: "dimension",
  pointLineDistance: "dimension",
  horizontalDistance: "dimension",
  verticalDistance: "dimension",
  radius: "radius",
  angle: "angle",
  fixed: "lock",
};
export const iconOf = (r: Relation): string => ICON[r] ?? r;

/** a number as a person reads it: no more than three decimals, no trailing zeros */
export const numberText = (v: number): string => String(Math.round(v * 1000) / 1000);
const rangeText = (c: Constraint, k = 1): string =>
  `${c.min !== undefined ? numberText(c.min * k) : ""}–${c.max !== undefined ? numberText(c.max * k) : ""}`;

/** The place of a part in the sketch: a point is itself, a line its middle, a circle the top right of its edge. */
function placeOf(S: System, id: string, radii: Record<string, number>): [number, number] {
  const k = kindOf(id, S),
    pt = (q: string) => {
      const p = S.points.find((x) => x.id === q)!;
      return [p.x, p.y] as [number, number];
    };
  if (k === "point") return pt(id);
  if (k === "line") {
    const l = S.lines.find((x) => x.id === id)!,
      a = pt(l.a),
      b = pt(l.b);
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  }
  const c = S.circles.find((x) => x.id === id)!,
    m = pt(c.c),
    r = radii[id] ?? c.r;
  return [m[0] + r * Math.SQRT1_2, m[1] + r * Math.SQRT1_2];
}
/** Where a constraint (or a selection) is, literally (`in_1620`): on the point when it names a point; at the touching place of a line and a circle (the foot of the circle's centre on the line) or of two circles (on the first, towards the other); else on the first part (a line's middle, a circle's top right). One rule for every relation: nothing says where it goes but what it ties. */
export function whereOf(S: System, parts: readonly string[]): [number, number] {
  const radii = Object.fromEntries(S.circles.map((q) => [q.id, q.r])),
    kinds = parts.map((id) => kindOf(id, S)),
    pt = (q: string) => {
      const p = S.points.find((x) => x.id === q)!;
      return [p.x, p.y] as [number, number];
    };
  const ip = kinds.indexOf("point");
  if (ip >= 0) return pt(parts[ip]!);
  const ic = kinds.indexOf("circle");
  if (ic < 0 || parts.length < 2) return placeOf(S, parts[0]!, radii);
  const k = S.circles.find((x) => x.id === parts[ic])!,
    m = pt(k.c),
    other = parts.find((_, i) => i !== ic)!;
  if (kindOf(other, S) === "line") {
    const l = S.lines.find((x) => x.id === other)!,
      a = pt(l.a),
      b = pt(l.b),
      dx = b[0] - a[0],
      dy = b[1] - a[1],
      t = Math.max(0, Math.min(1, ((m[0] - a[0]) * dx + (m[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    return [a[0] + dx * t, a[1] + dy * t];
  }
  const o = S.circles.find((x) => x.id === other);
  if (!o) return placeOf(S, parts[0]!, radii);
  const om = pt(o.c),
    d = Math.hypot(om[0] - m[0], om[1] - m[1]) || 1;
  return [m[0] + (k.r * (om[0] - m[0])) / d, m[1] + (k.r * (om[1] - m[1])) / d];
}
/** where a selection is */
export const selectionAnchor = (S: System, ids: string[]): [number, number] | null =>
  ids.length ? whereOf(S, ids) : null;
/** where a constraint belongs: a number between two things stands between them; every other relation where `whereOf` says */
export function anchorOf(S: System, c: Constraint): [number, number] {
  if (!(RANGEABLE.has(c.kind) && c.parts.length > 1)) return whereOf(S, c.parts);
  const radii = Object.fromEntries(S.circles.map((q) => [q.id, q.r])),
    ps = c.parts.map((id) => placeOf(S, id, radii));
  return [ps.reduce((a, p) => a + p[0], 0) / ps.length, ps.reduce((a, p) => a + p[1], 0) / ps.length];
}
/** What a selection takes in, going down and never up (`in_1620`): a line its two ends, a circle its centre, an arc its centre and ends; a point nothing. The selection and its parts, once each. */
export function scopeOf(S: System, ids: readonly string[]): string[] {
  const out = new Set(ids);
  for (const id of ids) {
    const l = S.lines.find((x) => x.id === id);
    if (l) {
      out.add(l.a);
      out.add(l.b);
    }
    const c = S.circles.find((x) => x.id === id);
    if (c) {
      out.add(c.c);
      for (const e of c.ends ?? []) out.add(e);
    }
  }
  return [...out];
}

/** how a number is shown (`dec_dimensions_measure_then_lock`, as the old app shows them): a circle by its diameter, an arc by its radius, an angle as the angle inside the corner of the two sides (where the arc is drawn); `text` is the number as shown, `input` how a number typed over it becomes the solver's value */
function display(
  S: System,
  kind: Relation,
  parts: readonly string[],
  value: number,
): { text: string; symbol?: string; word?: string; input?: { mul: number; add: number } } {
  if (kind === "radius") {
    const d = parts.length === 1 && S.circles.some((c) => c.id === parts[0] && !c.arc);
    return d
      ? { text: numberText(value * 2), symbol: "Ø", word: "diameter", input: { mul: 0.5, add: 0 } }
      : { text: numberText(value), symbol: "R" };
  }
  if (kind === "angle") {
    const m = angleMark(S, parts);
    return m
      ? {
          text: numberText((Math.abs(m.sweep) * 180) / Math.PI),
          symbol: "°",
          input: { mul: m.sweep >= 0 ? 1 : -1, add: m.offset },
        }
      : { text: numberText(value), symbol: "°" };
  }
  return { text: numberText(value) };
}
const sameParts = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join();
/** The number a selection has of its own (`dec_typing_standard`): a side its length, a circle its radius, two sides their angle, two corners their distance, a corner and a side its distance to it; none for anything else. */
export function ownMeasure(S: System, selection: string[]): Offer | null {
  return selection.length
    ? (offersFor(S, selection).offers.find((o) => o.dimensional && o.measure !== null) ?? null)
    : null;
}
/** the id of a measured number (no constraint yet) */
export const MEASURE_ID = "measure";

/** The bubbles of what is selected (none selected: none): the constraints, in their order, and the number the selection measures if no locked one says it. `S` is the system at the places it is solved to. */
export function bubblesOn(
  S: System,
  selection: string[],
  flash: Flash = {},
  scope: readonly string[] = selection,
): Bubble[] {
  // a constraint is shown when one of its parts is in the scope of the selection (what is selected and what it is made of, `scopeOf`), and while it flashes
  const own = measuredBubble(S, selection),
    locked = (c: Constraint) =>
      c.parts.some((p) => scope.includes(p)) || flash.refused?.includes(c.id) || flash.applied?.includes(c.id);
  const shown = S.constraints.filter(locked).map((c) => {
    const ties = c.parts.filter((p) => !selection.includes(p));
    const row = RELATIONS[c.kind],
      dim = RANGEABLE.has(c.kind) && (c.value !== undefined || c.min !== undefined || c.max !== undefined),
      shown = c.value !== undefined ? display(S, c.kind, c.parts, c.value) : null,
      word = shown?.word ?? row.label;
    const tone: BubbleTone = flash.refused?.includes(c.id)
      ? "refused"
      : flash.applied?.includes(c.id)
        ? "applied"
        : "rest";
    const b: Bubble = {
      id: c.id,
      kind: dim ? "dimension" : "constraint",
      relation: c.kind,
      icon: iconOf(c.kind),
      at: anchorOf(S, c),
      tone,
      parts: c.parts,
      title: `${word}${dim ? ` ${shown ? shown.text : rangeText(c)}${c.kind === "angle" ? "°" : ""}` : ""}${ties.length ? ` (with ${ties.join(", ")})` : ""}`,
    };
    if (dim) {
      b.locked = true;
      b.text =
        shown && !(c.min !== undefined && c.max !== undefined && c.min !== c.max)
          ? shown.text
          : rangeText(c, c.kind === "radius" && shown?.input ? 2 : 1);
      b.unit = c.kind === "angle" ? "deg" : "mm";
      if (c.value !== undefined) b.value = c.value;
      if (shown?.input) b.input = shown.input;
      if (shown?.symbol) b.symbol = shown.symbol;
    }
    return b;
  });
  return own ? [...shown, own] : shown;
}
/** the measured number of a selection, as a bubble with an open padlock; none once a locked one of the same kind on the same parts exists */
function measuredBubble(S: System, selection: string[]): Bubble | null {
  const o = ownMeasure(S, selection);
  if (!o || o.measure === null) return null;
  if (
    S.constraints.some(
      (c) =>
        c.kind === o.kind &&
        sameParts(c.parts, o.parts) &&
        RANGEABLE.has(c.kind) &&
        (c.value !== undefined || c.min !== undefined || c.max !== undefined),
    )
  )
    return null;
  const at = anchorOf(S, { id: MEASURE_ID, kind: o.kind, parts: o.parts }),
    shown = display(S, o.kind, o.parts, o.measure),
    word = shown.word ?? o.label;
  return {
    id: MEASURE_ID,
    kind: "dimension",
    relation: o.kind,
    icon: iconOf(o.kind),
    at,
    tone: "rest",
    locked: false,
    parts: o.parts,
    text: shown.text,
    value: o.measure,
    unit: o.kind === "angle" ? "deg" : "mm",
    ...(shown.input ? { input: shown.input } : {}),
    ...(shown.symbol ? { symbol: shown.symbol } : {}),
    title: `${word} ${shown.text}${o.kind === "angle" ? "°" : ""} (measured): type a number, or click the padlock to lock it`,
  };
}

/** a dimension drawn as the people who draw have always drawn it (`in_1650`): a thin dashed line with an arrow tip at each end, the number on it. `a`, `b`: its ends; `ext`: the thin lines from the measured parts to it (the sketch's axes, mm) */
export interface DimLine {
  a: [number, number];
  b: [number, number];
  ext: [[number, number], [number, number]][];
}
/** the line a measured number is drawn on, `off` mm away from what it measures where it stands off (null: none, as an angle, which has its arc): a circle's size a radial line from the centre in the direction with most room, a length or distance a line beside the two ends, an across or up-and-down distance level or upright, a distance to a line square to it */
export function dimLine(S: System, kind: string, parts: readonly string[], off: number): DimLine | null {
  const pt = (id: string) => {
    const q = S.points.find((x) => x.id === id);
    return q ? ([q.x, q.y] as [number, number]) : null;
  };
  const beside = (p: [number, number], q: [number, number]): DimLine => {
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1,
      n: [number, number] = [-(q[1] - p[1]) / d, (q[0] - p[0]) / d],
      a: [number, number] = [p[0] + n[0] * off, p[1] + n[1] * off],
      b: [number, number] = [q[0] + n[0] * off, q[1] + n[1] * off];
    return {
      a,
      b,
      ext: [
        [p, a],
        [q, b],
      ],
    };
  };
  if (kind === "radius") {
    const k = S.circles.find((x) => x.id === parts[0]),
      c = k && pt(k.c);
    if (!k || !c) return null;
    // the direction whose radius has most room from the lines, lower right when nothing says otherwise
    let best: { s: number; u: [number, number] } | null = null;
    for (let t = 0; t < 360; t += 15) {
      const u: [number, number] = [Math.cos((t * Math.PI) / 180), Math.sin((t * Math.PI) / 180)];
      let room = 1e9;
      for (const l of S.lines) {
        const a = pt(l.a),
          b = pt(l.b);
        if (!a || !b) continue;
        for (const f of [0.35, 0.7, 1]) {
          const x = c[0] + u[0] * k.r * f,
            y = c[1] + u[1] * k.r * f,
            ab: [number, number] = [b[0] - a[0], b[1] - a[1]],
            tt = Math.max(
              0,
              Math.min(1, ((x - a[0]) * ab[0] + (y - a[1]) * ab[1]) / (ab[0] * ab[0] + ab[1] * ab[1] || 1)),
            );
          room = Math.min(room, Math.hypot(x - (a[0] + ab[0] * tt), y - (a[1] + ab[1] * tt)));
        }
      }
      const score = Math.min(room, k.r) + (u[0] > 0 && u[1] < 0 ? k.r * 0.05 : 0);
      if (!best || score > best.s) best = { s: score, u };
    }
    return { a: c, b: [c[0] + best!.u[0] * k.r, c[1] + best!.u[1] * k.r], ext: [] };
  }
  if (kind === "length") {
    const l = S.lines.find((x) => x.id === parts[0]),
      p = l && pt(l.a),
      q = l && pt(l.b);
    return p && q ? beside(p, q) : null;
  }
  if (kind === "distance") {
    const p = pt(parts[0]!),
      q = pt(parts[1]!);
    return p && q ? beside(p, q) : null;
  }
  if (kind === "horizontalDistance" || kind === "verticalDistance") {
    const p = pt(parts[0]!),
      q = pt(parts[1]!);
    if (!p || !q) return null;
    if (kind === "horizontalDistance") {
      const y = Math.max(p[1], q[1]) + off,
        a: [number, number] = [p[0], y],
        b: [number, number] = [q[0], y];
      return {
        a,
        b,
        ext: [
          [p, a],
          [q, b],
        ],
      };
    }
    const x = Math.max(p[0], q[0]) + off,
      a: [number, number] = [x, p[1]],
      b: [number, number] = [x, q[1]];
    return {
      a,
      b,
      ext: [
        [p, a],
        [q, b],
      ],
    };
  }
  if (kind === "pointLineDistance") {
    const p = pt(parts[0]!),
      l = S.lines.find((x) => x.id === parts[1]),
      a = l && pt(l.a),
      b = l && pt(l.b);
    if (!p || !a || !b) return null;
    const ab: [number, number] = [b[0] - a[0], b[1] - a[1]],
      t = ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / (ab[0] * ab[0] + ab[1] * ab[1] || 1);
    return { a: p, b: [a[0] + ab[0] * t, a[1] + ab[1] * t], ext: [] };
  }
  return null;
}

/** what an alignment ties together, as a dashed line (`in_1668`): level or upright between two points a line through both, a little beyond each; parallel between two lines a line between their middles; none for the rest (`ext`: how far past the points it goes, mm) */
export function alignLine(
  S: System,
  kind: string,
  parts: readonly string[],
  ext: number,
): { a: [number, number]; b: [number, number] } | null {
  const pt = (id: string): [number, number] | null => {
    const q = S.points.find((x) => x.id === id);
    return q ? [q.x, q.y] : null;
  };
  if ((kind === "horizontal" || kind === "vertical") && parts.length === 2) {
    const p = pt(parts[0]!),
      q = pt(parts[1]!);
    if (!p || !q) return null;
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (d < 1e-9) return null;
    const u: [number, number] = [(q[0] - p[0]) / d, (q[1] - p[1]) / d];
    return { a: [p[0] - u[0] * ext, p[1] - u[1] * ext], b: [q[0] + u[0] * ext, q[1] + u[1] * ext] };
  }
  if (kind === "parallel" && parts.length === 2) {
    const mid = (id: string): [number, number] | null => {
      const l = S.lines.find((x) => x.id === id),
        a = l && pt(l.a),
        b = l && pt(l.b);
      return a && b ? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] : null;
    };
    const m = mid(parts[0]!),
      n = mid(parts[1]!);
    return m && n ? { a: m, b: n } : null;
  }
  return null;
}
/** an angle's mark stands in its corner (`in_1650`, `in_1667`): the arc of an angle (the number on it), or the small square of a right angle; `from`, `sweep`: where the arc starts and how far round it goes (radians); `r`: its radius (mm); `square`: a right angle drawn as a small square */
export interface Corner {
  centre: [number, number];
  from: number;
  sweep: number;
  r: number;
  square: boolean;
}
/** where an angle or a square stands: at the corner of the two lines, in the middle of the angle; `mmPx`: how long a pixel is in mm (the sizes are in pixels) */
export function cornerOf(
  S: System,
  kind: string,
  parts: readonly string[],
  mmPx: number,
): { corner: Corner; at: [number, number] } | null {
  if ((kind !== "angle" && kind !== "perpendicular") || parts.length !== 2) return null;
  const m = angleMark(S, parts);
  if (!m) return null;
  const square = kind === "perpendicular",
    r = square ? 12 * mmPx : Math.min(34 * mmPx, m.reach * 0.8),
    mid = m.from + m.sweep / 2,
    rr = square ? r * 3.2 : r + 26 * mmPx; // (the bubble stands just beyond its square or arc, so that can be seen)
  return {
    corner: {
      centre: m.centre,
      from: m.from,
      sweep: square ? Math.sign(m.sweep || 1) * (Math.PI / 2) : m.sweep,
      r,
      square,
    },
    at: [m.centre[0] + rr * Math.cos(mid), m.centre[1] + rr * Math.sin(mid)],
  };
}

/** The angle between two lines as the old app draws it and shows it: the angle inside the corner, between the two rays that run from where the lines cross toward the longer part of each (a thin arc at the corner, the number on it). `from`, `sweep`: where the arc starts and how far round it goes (radians, the shorter way); `offset`: 180 when the rays are not both the lines' own directions (a corner where one line ends and the next begins), which turns what is shown into the directed angle the solver reads. None for lines that never cross. */
export function angleMark(
  S: System,
  parts: readonly string[],
): { centre: [number, number]; from: number; sweep: number; reach: number; offset: 0 | 180 } | null {
  if (parts.length !== 2) return null;
  const line = (id: string) => {
    const l = S.lines.find((x) => x.id === id);
    if (!l) return null;
    const a = S.points.find((p) => p.id === l.a),
      b = S.points.find((p) => p.id === l.b);
    return a && b ? { a: [a.x, a.y] as [number, number], b: [b.x, b.y] as [number, number] } : null;
  };
  const u = line(parts[0]!),
    w = line(parts[1]!);
  if (!u || !w) return null;
  const du: [number, number] = [u.b[0] - u.a[0], u.b[1] - u.a[1]],
    dw: [number, number] = [w.b[0] - w.a[0], w.b[1] - w.a[1]],
    den = du[0] * dw[1] - du[1] * dw[0];
  if (Math.abs(den) < 1e-12) return null;
  const t = ((w.a[0] - u.a[0]) * dw[1] - (w.a[1] - u.a[1]) * dw[0]) / den,
    centre: [number, number] = [u.a[0] + du[0] * t, u.a[1] + du[1] * t];
  const dist = (p: [number, number]) => Math.hypot(p[0] - centre[0], p[1] - centre[1]),
    far = (l: { a: [number, number]; b: [number, number] }) => Math.max(dist(l.a), dist(l.b));
  const side = (l: { a: [number, number]; b: [number, number] }): 1 | -1 => (dist(l.b) >= dist(l.a) ? 1 : -1); // (+1: the longer part is toward the line's end)
  const su = side(u),
    sw = side(w),
    ru: [number, number] = [su * du[0], su * du[1]],
    rw: [number, number] = [sw * dw[0], sw * dw[1]];
  return {
    centre,
    from: Math.atan2(ru[1], ru[0]),
    sweep: Math.atan2(ru[0] * rw[1] - ru[1] * rw[0], ru[0] * rw[0] + ru[1] * rw[1]),
    reach: Math.min(far(u), far(w)),
    offset: su === sw ? 0 : 180,
  };
}

/** the system with its parts at the places a solution says */
export const placed = (S: System, sol: Solution): System => ({
  ...S,
  points: S.points.map((p) => (sol.points[p.id] ? { ...p, x: sol.points[p.id]![0], y: sol.points[p.id]![1] } : p)),
  circles: S.circles.map((q) => ({ ...q, r: sol.circles[q.id] ?? q.r })),
});
