// The measure report (`dec_measure_report`, `in_546`, `in_567`): what the selection is, in numbers, as lines of text for a panel. Pure: the scene and the selection in, sections out. The tape measure's bubbles
// (`tape.ts`) stay; this says more and is not tied to faces. Nothing is guessed: a number the model does not have is left out.
import type { Ref } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import { sub, dot, cross, length, normalize } from "../math/vec.ts";
import type { Scene } from "../operation/scene.ts";
import { lookup } from "../operation/scene.ts";
import type { Part, Line } from "../operation/part.ts";
import { pointOf, curvePoints } from "../operation/part.ts";
import { readingsOf, readingsBetween } from "./tape.ts";
import { surfaceTriangles } from "./surfaces.ts";
import { settings } from "../shared/settings.ts";
import { clearanceBetween } from "./clearance.ts";
import type { Clearance } from "./clearance.ts";

export interface MeasureLine { label: string; value: string }
export interface MeasureSection { title: string; lines: MeasureLine[] }

const r2 = (x: number): string => String(Math.round(x * 100) / 100);
const mm = (x: number): string => `${r2(x)} mm`;
const deg = (rad: number): number => (rad * 180) / Math.PI;

/** The area of a part that has a mesh (a face: flat or round), mm². */
function areaOf(scene: Scene, p: Part): number {
  const tris = surfaceTriangles(lookup(scene), p);
  if (!tris) return 0;
  let a = 0;
  for (let i = 0; i + 8 < tris.length; i += 9) {
    const u: Vec3 = [tris[i + 3]! - tris[i]!, tris[i + 4]! - tris[i + 1]!, tris[i + 5]! - tris[i + 2]!];
    const v: Vec3 = [tris[i + 6]! - tris[i]!, tris[i + 7]! - tris[i + 1]!, tris[i + 8]! - tris[i + 2]!];
    a += length(cross(u, v)) / 2;
  }
  return a;
}
const bodies = (scene: Scene): Extract<Part, { kind: "body" }>[] => Object.values(scene.parts).filter((p): p is Extract<Part, { kind: "body" }> => p.kind === "body");
/** The faces, edges and corners of a body: with several bodies each says which it belongs to (`of`), with one they are all its. */
function partsOfBody(scene: Scene, ref: Ref): Part[] {
  const many = bodies(scene).length > 1;
  return Object.values(scene.parts).filter((p) => p.origin === "body" && (many ? (p as { of?: Ref }).of === ref : true));
}
/** The weight of a volume at the material's density (`settings.measure`), in grams. */
const grams = (volumeMm3: number): number => (volumeMm3 / 1000) * settings.measure.densityGramsPerCm3;

function bodySection(scene: Scene, body: Extract<Part, { kind: "body" }>, title: string): MeasureSection {
  const parts = partsOfBody(scene, body.ref);
  const faces = parts.filter((p) => p.kind === "plane" && !!p.mesh);
  const area = faces.reduce((s, p) => s + areaOf(scene, p), 0);
  const lines: MeasureLine[] = [];
  if (body.volume !== undefined && Number.isFinite(body.volume)) {
    lines.push({ label: "Volume", value: `${r2(body.volume)} mm³ (${r2(body.volume / 1000)} cm³)` });
    lines.push({ label: "Weight, solid", value: `${r2(grams(body.volume))} g at ${settings.measure.densityGramsPerCm3} g/cm³` });
  }
  if (area > 0) lines.push({ label: "Surface area", value: `${r2(area)} mm²` });
  if (body.bbox) {
    const { min, max } = body.bbox;
    lines.push({ label: "Size", value: `${r2(max[0] - min[0])} × ${r2(max[1] - min[1])} × ${r2(max[2] - min[2])} mm (X × Y × Z)` });
    lines.push({ label: "Lowest, highest", value: `Z ${r2(min[2])} to ${r2(max[2])} mm` });
    lines.push({ label: "Middle of its box", value: `${r2((min[0] + max[0]) / 2)}, ${r2((min[1] + max[1]) / 2)}, ${r2((min[2] + max[2]) / 2)} mm` });
  }
  const others = bodies(scene).filter((o) => o.ref !== body.ref);
  for (const o of others.slice(0, 5)) lines.push({ label: `To Body ${bodies(scene).findIndex((x) => x.ref === o.ref) + 1}`, value: clearanceWords(clearanceBetween(scene, body.ref, o.ref), scene) });
  lines.push({ label: "Made of", value: `${faces.length} faces, ${parts.filter((p) => p.kind === "line").length} edges, ${parts.filter((p) => p.kind === "corner").length} corners` });
  return { title, lines };
}

/** The length of an edge, mm: a straight one by its ends, a curved one along its curve (found from the points it is drawn through, so a hair short). */
function edgeLength(scene: Scene, p: Line): number | null {
  const get = lookup(scene);
  const curve = curvePoints(get, p);
  if (curve && curve.length > 1) { let s = 0; for (let i = 1; i < curve.length; i++) s += length(sub(curve[i]!, curve[i - 1]!)); return s; }
  const [a, b] = [pointOf(get, p.a), pointOf(get, p.b)];
  return a && b ? length(sub(a, b)) : null;
}
const edgeDir = (scene: Scene, p: Line): Vec3 | null => {
  const get = lookup(scene);
  const [a, b] = [pointOf(get, p.a), pointOf(get, p.b)];
  return a && b && length(sub(a, b)) > 1e-9 ? normalize(sub(b, a)) : null;
};
const edgeSection = (scene: Scene, p: Line, title: string): MeasureSection => {
  const lines: MeasureLine[] = [];
  const len = edgeLength(scene, p);
  if (len !== null) lines.push({ label: p.circle || p.center ? "Length along it" : "Length", value: mm(len) });
  const get = lookup(scene);
  const radius = p.circle?.radius ?? (p.center ? (() => { const [c, a] = [pointOf(get, p.center!), pointOf(get, p.a)]; return c && a ? length(sub(a, c)) : null; })() : null);
  if (radius) { lines.push({ label: "Radius", value: mm(radius) }); lines.push({ label: "Diameter", value: mm(2 * radius) }); }
  const d = edgeDir(scene, p);
  if (d && !p.circle && !p.center && !p.mid) lines.push({ label: "Tilt from level", value: `${r2(Math.asin(Math.min(1, Math.abs(d[2]))) * 180 / Math.PI)}°` });
  return { title, lines };
};

const clearanceWords = (c: Clearance | null, scene: Scene): string => {
  if (!c) return "not known";
  if (c.kind === "overlap") return "they go into each other";
  if (c.kind === "touching") return "touching (nearer than 0.01 mm)";
  const need = scene.clearance;
  return `${mm(c.mm)}${need ? (c.mm >= need ? `, at least the ${r2(need)} mm clearance set` : `, less than the ${r2(need)} mm clearance set`) : ""}`;
};
/** What the selection is, in numbers: sections of lines. With nothing selected, the whole model. */
export function measureReport(scene: Scene, selection: readonly Ref[]): MeasureSection[] {
  const sel = selection.filter((r) => r in scene.parts);
  const all = bodies(scene);
  if (!sel.length) {
    if (!all.length) return [{ title: "Nothing to measure yet", lines: [{ label: "", value: "Make a body, or select something, to see its numbers." }] }];
    const vol = all.reduce((s, b) => s + (b.volume ?? 0), 0);
    const boxes = all.flatMap((b) => (b.bbox ? [b.bbox] : []));
    const lines: MeasureLine[] = [{ label: "Bodies", value: String(all.length) }, { label: "Volume", value: `${r2(vol)} mm³ (${r2(vol / 1000)} cm³)` }, { label: "Weight, solid", value: `${r2(grams(vol))} g at ${settings.measure.densityGramsPerCm3} g/cm³` }];
    if (boxes.length) {
      const lo = [0, 1, 2].map((k) => Math.min(...boxes.map((b) => b.min[k]!))), hi = [0, 1, 2].map((k) => Math.max(...boxes.map((b) => b.max[k]!)));
      lines.push({ label: "Size, all together", value: `${r2(hi[0]! - lo[0]!)} × ${r2(hi[1]! - lo[1]!)} × ${r2(hi[2]! - lo[2]!)} mm (X × Y × Z)` });
    }
    return [{ title: "The model", lines }, ...(all.length > 1 ? all.map((b, i) => bodySection(scene, b, `Body ${i + 1}`)) : [bodySection(scene, all[0]!, "Body 1")])];
  }
  const out: MeasureSection[] = [];
  const get = lookup(scene);
  const kindOf = (r: Ref): string => scene.parts[r]!.kind;
  const picked = (k: string) => sel.filter((r) => kindOf(r) === k && !(scene.parts[r]!.origin === "world"));
  const bodyRefs = picked("body");
  const faces = sel.filter((r) => scene.parts[r]!.kind === "plane" && scene.parts[r]!.origin === "body");
  const edges = picked("line");
  const corners = picked("corner").filter((r) => !(scene.parts[r] as { derived?: boolean }).derived);
  if (bodyRefs.length === 2) { const c = clearanceBetween(scene, bodyRefs[0]!, bodyRefs[1]!); out.push({ title: "Between the two bodies", lines: [{ label: c?.kind === "overlap" ? "Overlap" : "Nearest", value: clearanceWords(c, scene) }, ...(c?.kind === "distance" ? [{ label: "Measured on", value: "the surfaces as drawn (the true surface of a round face is a few hundredths of a millimetre nearer than its mesh)" }] : [])] }); }
  bodyRefs.slice(0, 4).forEach((r) => out.push(bodySection(scene, scene.parts[r] as Extract<Part, { kind: "body" }>, `Body ${all.findIndex((b) => b.ref === r) + 1}`)));
  if (faces.length === 1 || faces.length === 2) {
    faces.forEach((r, i) => {
      const p = scene.parts[r] as Extract<Part, { kind: "plane" }>;
      const lines: MeasureLine[] = readingsOf(scene, r).map((x) => ({ label: x.tag[0]!.toUpperCase() + x.tag.slice(1), value: `${r2(x.value)} ${x.unit === "deg" ? "°" : x.unit}` }));
      const rad = p.curved?.radius ?? p.radius;
      if (rad && !lines.some((l) => l.label === "Radius")) lines.push({ label: "Radius", value: mm(rad) }, { label: "Diameter", value: mm(2 * rad) });
      if (!p.curved && !p.rounded && !p.round && p.u && p.v) { const n = normalize(cross(p.u, p.v)); lines.push({ label: "Tilt from level", value: `${r2(deg(Math.acos(Math.max(-1, Math.min(1, Math.abs(n[2]))))))}°` }); }
      out.push({ title: faces.length === 2 ? `Face ${i + 1}` : "Face", lines });
    });
    if (faces.length === 2) {
      let between: MeasureLine[] = readingsBetween(scene, faces[0]!, faces[1]!).map((x) => ({ label: x.tag[0]!.toUpperCase() + x.tag.slice(1), value: `${r2(x.value)} ${x.unit === "deg" ? "°" : x.unit}` }));
      if (!between.length) { // (two flat faces of one body: the tape's readings are for the faces of two bodies, so they are worked out here from the faces' planes)
        const [p, q] = [scene.parts[faces[0]!], scene.parts[faces[1]!]] as Extract<Part, { kind: "plane" }>[];
        if (p && q && p.u && p.v && q.u && q.v && !p.curved && !q.curved && !p.rounded && !q.rounded && !p.round && !q.round) {
          const [n, m] = [normalize(cross(p.u, p.v)), normalize(cross(q.u, q.v))];
          const angle = deg(Math.acos(Math.min(1, Math.abs(dot(n, m)))));
          between = [{ label: "Angle", value: `${r2(angle)}°` }];
          if (angle < 1e-3) between.push({ label: "Distance", value: mm(Math.abs(dot(sub(p.at, q.at), m))) });
        }
      }
      out.push({ title: "Between the two faces", lines: between });
    }
  } else if (faces.length > 2) {
    const area = faces.reduce((s, r) => s + areaOf(scene, scene.parts[r]!), 0);
    out.push({ title: `${faces.length} faces`, lines: [{ label: "Area together", value: `${r2(area)} mm²` }] });
  }
  if (edges.length > 0 && edges.length <= 2) edges.forEach((r, i) => out.push(edgeSection(scene, scene.parts[r] as Line, edges.length === 2 ? `Edge ${i + 1}` : "Edge")));
  if (edges.length === 2) {
    const [a, b] = [scene.parts[edges[0]!] as Line, scene.parts[edges[1]!] as Line];
    const [da, db, ma, mb] = [edgeDir(scene, a), edgeDir(scene, b), midOf(scene, a), midOf(scene, b)];
    const lines: MeasureLine[] = [];
    if (da && db && !a.circle && !b.circle && !a.center && !b.center) lines.push({ label: "Angle between them", value: `${r2(deg(Math.acos(Math.min(1, Math.abs(dot(da, db))))))}°` });
    if (ma && mb) lines.push({ label: "Middle to middle", value: mm(length(sub(ma, mb))) });
    if (lines.length) out.push({ title: "Between the two edges", lines });
  } else if (edges.length > 2) {
    const total = edges.reduce((s, r) => s + (edgeLength(scene, scene.parts[r] as Line) ?? 0), 0);
    out.push({ title: `${edges.length} edges`, lines: [{ label: "Length together", value: mm(total) }] });
  }
  const pts = corners.flatMap((r) => { const q = pointOf(get, r); return q ? [q] : []; });
  if (pts.length === 1) out.push({ title: "Corner", lines: [{ label: "Position", value: `${r2(pts[0]![0])}, ${r2(pts[0]![1])}, ${r2(pts[0]![2])} mm` }] });
  if (pts.length === 2) {
    const d = sub(pts[1]!, pts[0]!);
    out.push({ title: "Between the two corners", lines: [{ label: "Distance", value: mm(length(d)) }, { label: "Along X, Y, Z", value: `${r2(Math.abs(d[0]))}, ${r2(Math.abs(d[1]))}, ${r2(Math.abs(d[2]))} mm` }] });
  }
  if (pts.length > 2) out.push({ title: `${pts.length} corners`, lines: [{ label: "Farthest apart", value: mm(Math.max(...pts.flatMap((p, i) => pts.slice(i + 1).map((q) => length(sub(p, q)))))) }] });
  return out.length ? out : [{ title: "Selected", lines: [{ label: "", value: "Select a body, a face, an edge or a corner (two to see how they relate)." }] }];
}
const midOf = (scene: Scene, p: Line): Vec3 | null => { const get = lookup(scene); const [a, b] = [pointOf(get, p.a), pointOf(get, p.b)]; return a && b ? ([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2] as Vec3) : null; };
