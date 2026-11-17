// The highlight (`in_073` to `in_075`): a thin ring on the surface under the pointer, the teal that spreads over a clicked surface from where it was clicked, teal lines and
// balls for picked lines and corners, amber for what a relation ties the selection to.
import * as THREE from "three";
import type { Scene, Ref, Vec3, Plane } from "../../interaction/api.ts";
import { outlineOf, lookup, settings, normalOfPlane, consumed, faceEdges, edgeCentre, sketchOfEdge, splineWorld } from "../../interaction/api.ts";
import type { Camera } from "../../interaction/camera.ts";
import { surfaceTriangles } from "../../interaction/surfaces.ts";
import { centreDots } from "../../interaction/centredots.ts";
import { hoverOrb, selectOrb, fullOrb, orbMaterial, selectedLook } from "../orb.ts";
import type { Pen } from "./pen.ts";
import { clearGroup, trisMesh, ringOf, sphereAt, spheresAt, rgb } from "./pen.ts";

export interface Highlight {
  /** the triangles of the bodies of several that are selected or pointed at (ranges of the index list of the mesh): the fill of a body is all of them, not only the faces that are parts (`in_812`) */
  bodyTris?: Record<string, [number, number][]>;
  hover: Ref | undefined;
  /** the point under the pointer on the hovered surface, for the ring */
  hoverPoint: Vec3 | null;
  selection: readonly Ref[];
  /** the parts a focused relation ties the selection to */
  amber?: readonly Ref[];
  /** what a refused change would have broken: mild red, fading */
  red?: { refs: readonly Ref[]; alpha: number };
  /** the copies a repeat that is open would make: they do not exist yet, so they pulse in a soft blue (`in_244`) */
  temp?: readonly Ref[];
  /** the last selected surface spreads its colour from where it was clicked */
  spread: { ref: Ref; point: Vec3; startMs: number } | null;
}
type Kind = "select" | "hover" | "amber" | "red" | "temp";

const AXIS_LEN = 30; // the world axes are lines too: pointing at one highlights it to that length
const AMBER = 0xf2c14e;
const RED = 0xe46a6a;
const TEMP = 0x4f8cf0;
const teal = settings.orb.color;
const ringRgb = selectedLook(teal, settings.orb.selectOpacity, [0.8, 0.8, 0.82]);
const tealHex = rgb(teal).getHex();
export const TEAL = tealHex;

/** The triangles a part is made of for a fill (a surface, or the whole body), or null for a line or a corner. */
function fillTriangles(s: Scene, ref: Ref, kind: Kind, body: { vertices: Float32Array; triangles: Uint32Array } | null, ranges?: [number, number][]): number[] | null {
  const p = s.parts[ref];
  if (!p) return null;
  if (p.origin === "world" && kind === "select") return null; // a world plane is never filled blue when picked (`in_116`); the hover ring still shows
  if (p.kind === "plane" && p.section && p.extent !== undefined) { // a sheet (`in_466`): the blue disc follows the pointer over it as on every surface; picked, it is not filled
    if (kind !== "hover") return null;
    const q = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([a, b]) => [p.at[0] + p.u[0] * a! * p.extent! + p.v[0] * b! * p.extent!, p.at[1] + p.u[1] * a! * p.extent! + p.v[1] * b! * p.extent!, p.at[2] + p.u[2] * a! * p.extent! + p.v[2] * b! * p.extent!]);
    return [...q[0]!, ...q[1]!, ...q[2]!, ...q[0]!, ...q[2]!, ...q[3]!];
  }
  if (p.kind === "body" && body && ranges) { // one body of several: all its triangles, from the kernel's faces of it
    const tris: number[] = [];
    for (const [start, count] of ranges) for (let k = start; k < start + count; k++) { const ix = body.triangles[k]!; tris.push(body.vertices[ix * 3]!, body.vertices[ix * 3 + 1]!, body.vertices[ix * 3 + 2]!); }
    if (tris.length) return tris;
  }
  if (p.kind === "body") {
    // one body of several: its own faces (`dec_independent_bodies`)
    const own = Object.values(s.parts).filter((q) => q.kind === "plane" && q.of === ref && q.mesh);
    if (own.length) return own.flatMap((q) => (q.kind === "plane" && q.mesh ? [...q.mesh] : []));
  }
  if (p.kind === "body" && body) {
    const tris: number[] = [];
    for (const ix of body.triangles) tris.push(body.vertices[ix * 3]!, body.vertices[ix * 3 + 1]!, body.vertices[ix * 3 + 2]!);
    return tris;
  }
  return surfaceTriangles(lookup(s), p);
}

/** The orb on a surface: a ring that follows the pointer, a fill that spreads from the click, or a fill all over. */
function surfaceOrb(kind: Kind, ref: Ref, tris: number[], h: Highlight, unit: number, nowMs: number): THREE.Mesh {
  const spread = h.spread?.ref === ref && kind === "select";
  const orb = kind === "hover" ? hoverOrb : spread ? selectOrb : fullOrb;
  if (kind === "hover") {
    hoverOrb.uOrbC.value.set(...(h.hoverPoint ?? [0, 0, 0]));
    hoverOrb.uOrbR.value = settings.orb.radius * unit;
    hoverOrb.uOrbA.value = 0;
    hoverOrb.uOrbRingA.value = 0; // (a solid disc and no ring: a ring looked like a circle that a click would place, `in_300`)
    hoverOrb.uOrbDisc.value = settings.orb.hoverOpacity;
    hoverOrb.uOrbFill.value = 0;
    hoverOrb.uRingPx.value = settings.orb.ringPx;
  } else if (spread && h.spread) {
    const k = Math.min(1, (nowMs - h.spread.startMs) / settings.orb.fillMs);
    let reach = 0;
    for (let i = 0; i < tris.length; i += 3) reach = Math.max(reach, Math.hypot(tris[i]! - h.spread.point[0], tris[i + 1]! - h.spread.point[1], tris[i + 2]! - h.spread.point[2]));
    selectOrb.uOrbC.value.set(...h.spread.point);
    selectOrb.uOrbR.value = Math.max(1e-6, k * reach * settings.orb.reachFactor);
    selectOrb.uOrbA.value = settings.orb.selectOpacity;
    selectOrb.uOrbRingA.value = k < 1 ? 1 : 0;
    selectOrb.uOrbSoft.value = settings.orb.softFactor;
    selectOrb.uOrbFill.value = k;
    selectOrb.uRingPx.value = settings.orb.ringPx;
  } else {
    fullOrb.uOrbA.value = settings.orb.selectOpacity;
    fullOrb.uOrbRingA.value = 0;
    fullOrb.uOrbFill.value = 1;
  }
  return trisMesh(tris, orbMaterial(teal, ringRgb, orb, { offset: -2 }));
}

/** A flat run of xyz as points. */
const chunk3 = (flat: readonly number[]): number[][] => { const out: number[][] = []; for (let i = 0; i + 2 < flat.length; i += 3) out.push([flat[i]!, flat[i + 1]!, flat[i + 2]!]); return out; };
const ringPairs = (o: { center: Vec3; radius: number; normal: Vec3 }): number[] => { const pts = ringOf(o.center, o.radius, o.normal); const out: number[] = []; for (let i = 0; i + 5 < pts.length; i += 3) out.push(pts[i]!, pts[i + 1]!, pts[i + 2]!, pts[i + 3]!, pts[i + 4]!, pts[i + 5]!); return out; };

/** The outline of a filled surface: the sides of its triangles that only one triangle has (so the edges of a selected face are blue too, as the rest of what is selected, `in_206`). Flat pairs of points. */
function outlineOfTriangles(tris: number[]): number[] {
  const key = (i: number) => `${Math.round(tris[i]! * 1e3)},${Math.round(tris[i + 1]! * 1e3)},${Math.round(tris[i + 2]! * 1e3)}`;
  const seen = new Map<string, { n: number; seg: number[] }>();
  for (let i = 0; i + 8 < tris.length; i += 9) {
    for (const [a, b] of [[0, 3], [3, 6], [6, 0]] as const) {
      const [ka, kb] = [key(i + a), key(i + b)];
      const k = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      const e = seen.get(k) ?? { n: 0, seg: [tris[i + a]!, tris[i + a + 1]!, tris[i + a + 2]!, tris[i + b]!, tris[i + b + 1]!, tris[i + b + 2]!] };
      e.n++;
      seen.set(k, e);
    }
  }
  return [...seen.values()].filter((e) => e.n === 1).flatMap((e) => e.seg);
}

/** Rebuild the highlight group: amber first, then the selection, then what the pointer is over (unless it is selected). */
export function buildHighlight(overlay: THREE.Group, marks: THREE.Group, s: Scene | null, body: { vertices: Float32Array; triangles: Uint32Array } | null, h: Highlight, cam: Camera, pen: Pen, nowMs: number) {
  clearGroup(overlay);
  clearGroup(marks);
  pen.build("highlight", () => buildParts(overlay, marks, s, body, h, cam, pen, nowMs)); // (the lines it made before are let go)
}

/**
 * What the highlight is made from, as one string, or null when it is moving and must be made again for every frame (a refused change flashing, the copies of a repeat breathing, the colour spreading over a face): while the string is the
 * same the highlight that was built is still right, so turning the view (which changes none of it) does not build it again. `stamp` is what the view says of its own scene, picture and sections; `unit` the distance of the camera, which sizes the balls.
 */
export function highlightKey(h: Highlight, nowMs: number, unit: number, stamp: string): string | null {
  if (h.temp?.length || h.red?.refs.length) return null;
  const spreading = !!h.spread && nowMs - h.spread.startMs < settings.orb.fillMs + 50;
  if (spreading) return null;
  return JSON.stringify([stamp, unit, h.hover ?? null, h.hoverPoint, h.selection, h.amber ?? [], h.spread ? [h.spread.ref, h.spread.point] : null]);
}

/** What a part is drawn as, kept to be drawn together: the lines of one look are one object, and so are the balls (a selected gear is 800 parts, and was 800 objects built again for every frame). */
interface Batch { kind: Kind; col: number; width: number; depth: boolean; alpha: number; segs: number[]; balls: { at: Vec3; radius: number }[] }

function buildParts(overlay: THREE.Group, marks: THREE.Group, s: Scene | null, body: { vertices: Float32Array; triangles: Uint32Array } | null, h: Highlight, cam: Camera, pen: Pen, nowMs: number) {
  if (!s) return;
  const batches = new Map<string, Batch>();
  const batchFor = (kind: Kind, col: number, width: number, depth: boolean, alpha: number): Batch => {
    const key = `${kind}|${col}|${width}|${depth}|${alpha}`;
    let b = batches.get(key);
    if (!b) { b = { kind, col, width, depth, alpha, segs: [], balls: [] }; batches.set(key, b); }
    return b;
  };
  const pairsOf = (pts: readonly (readonly number[])[]): number[] => { const out: number[] = []; for (let i = 0; i + 1 < pts.length; i++) out.push(...pts[i]!, ...pts[i + 1]!); return out; };
  const flushBatches = () => {
    for (const b of batches.values()) {
      const fade = <T extends THREE.Object3D>(m: T): T => { if (b.kind === "amber") m.traverse((c) => { c.renderOrder = 8; }); /* (the hint's orange is drawn over the blue of a selected circle or face it is about, `in_301`) */ if (b.alpha < 1) m.traverse((c) => { const mat = (c as THREE.Mesh).material as THREE.Material | undefined; if (mat) { mat.transparent = true; mat.opacity = b.alpha; } }); return m; };
      if (b.segs.length) overlay.add(fade(pen.segments(b.segs, b.col, b.width, b.depth)));
      if (b.balls.length) overlay.add(fade(spheresAt(b.balls, b.col, b.depth)));
    }
  };
  const get = lookup(s);
  const unit = cam.distance;
  // the middle point of a selected curved edge of the body is drawn on the edge: pointed at, it lights there (`in_214`)
  const centreAt = new Map<Ref, Vec3>();
  for (const r of h.selection) { const e = sketchOfEdge(s, r); if (e?.centre && e.centreRef) centreAt.set(e.centreRef, e.centre); }
  const mark = (ref: Ref, kind: Kind) => {
    const p = get(ref);
    if (!p) return;
    const onEdge = centreAt.get(ref);
    if (onEdge && kind === "hover" && p.kind === "corner") { overlay.add(sphereAt(onEdge, unit * settings.pick.vertexScale * 1.0, tealHex, false)); return; }
    if (kind === "hover" && p.kind === "plane" && p.origin === "world") {
      // an infinite world plane has nothing to fill: the ring alone, drawn as a plain thin circle so it cannot smear over a plane seen at a shallow angle
      if (h.hoverPoint) { // (a flat disc, as on any other surface, `in_300`)
        const ring = ringOf(h.hoverPoint, settings.orb.radius * unit, normalOfPlane(p));
        const tris: number[] = [];
        for (let i = 0; i + 5 < ring.length; i += 3) tris.push(...h.hoverPoint, ring[i]!, ring[i + 1]!, ring[i + 2]!, ring[i + 3]!, ring[i + 4]!, ring[i + 5]!);
        overlay.add(trisMesh(tris, new THREE.MeshBasicMaterial({ color: tealHex, transparent: true, opacity: settings.orb.hoverOpacity, side: THREE.DoubleSide, depthWrite: false })));
      }
      return;
    }
    if (kind === "red" && (p.kind === "face" || p.kind === "body" || (p.kind === "plane" && p.origin !== "world"))) {
      // a surface a refused change would have broken flashes red all over, as an edge does, with its constraint's bubble (`in_434`)
      const ft = fillTriangles(s, ref, "select", body, h.bodyTris?.[ref]);
      if (ft && ft.length) {
        const a = h.red?.alpha ?? 1;
        overlay.add(trisMesh(ft, new THREE.MeshBasicMaterial({ color: RED, transparent: true, opacity: 0.5 * a, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })));
        return;
      }
    }
    const tris = kind === "amber" || kind === "red" || kind === "temp" ? null : fillTriangles(s, ref, kind, body, h.bodyTris?.[ref]);
    if (!tris && p.origin === "world" && p.kind === "plane") return; // nothing to draw for a picked world plane (its tint is the pulse below)
    if (tris && kind === "hover" && p.kind === "face" && p.origin === "drawn") {
      // a closed sketch under the pointer fills with teal all over: it is closed and can be extruded (`in_194`); the ring still follows the pointer on it
      const fill = trisMesh(tris, new THREE.MeshBasicMaterial({ color: tealHex, transparent: true, opacity: settings.theme.sketchHoverOpacity, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      overlay.add(fill, surfaceOrb(kind, ref, tris, h, unit, nowMs));
      return;
    }
    if (tris && kind === "select" && (p.kind === "face" || (p.kind === "plane" && p.origin !== "world"))) {
      // a selected face has its edges in the selected blue too
      // (a body's face: its own edges, since the triangles of a curved face can be split unevenly and their sides would show all over it)
      const edge = p.kind === "plane" && p.origin === "body" ? faceEdges(s, p).flatMap((r) => { const l = get(r); const o = l ? outlineOf(get, l) : null; return o?.shape === "polyline" ? o.pts.slice(1).flatMap((q, i) => [...o.pts[i]!, ...q]) : o?.shape === "segment" ? [...o.a, ...o.b] : o?.shape === "circle" ? ringPairs(o) : []; }) : outlineOfTriangles(tris);
      if (edge.length) { const line = pen.segments(edge, tealHex, settings.pick.edgeWidthPx, true); line.renderOrder = 5; overlay.add(line); }
    }
    if (tris) return void overlay.add(surfaceOrb(kind, ref, tris, h, unit, nowMs));
    const o = outlineOf(get, p);
    const w = kind === "select" ? settings.pick.edgeWidthPx : settings.pick.edgeHoverWidthPx;
    const col = kind === "amber" ? AMBER : kind === "red" ? RED : kind === "temp" ? TEMP : tealHex;
    const alpha = kind === "red" ? h.red?.alpha ?? 1 : kind === "temp" ? 0.5 + 0.4 * Math.sin(nowMs / 280) : 1; // (the copies breathe: they are not there yet)
    const wide = kind === "red" || kind === "temp" ? 3.4 : w;
    const b = batchFor(kind, col, wide, true, alpha);
    if (o.shape === "point") batchFor(kind, col, 0, true, alpha).balls.push({ at: o.at, radius: unit * settings.pick.vertexScale * (kind === "select" ? settings.pick.vertexSelectScale : 1) });
    else if (o.shape === "polyline") b.segs.push(...pairsOf(o.pts));
    else if (o.shape === "segment") b.segs.push(...o.a, ...o.b);
    else if (o.shape === "circle") b.segs.push(...pairsOf(chunk3(ringOf(o.center, o.radius, o.normal))));
    else if (p.kind === "axis") overlay.add(pen.line([...p.at, ...[0, 1, 2].map((i) => p.at[i]! + p.dir[i]! * AXIS_LEN)], col, w, false));
  };
  // the middle of a circle or an arc is always shown: a small dot, so it can be picked to line the curve up with other things (`in_159`). It is in `marks`, not in `overlay`: a body dragged on the graphics card moves the overlay (its highlight) by the body's matrix, and a dot of a sketch that is not the body's must not go with it (what is the body's is already carried in the scene shown)
  const dots = centreDots(s);
  if (dots.length) marks.add(spheresAt(dots.map((at) => ({ at, radius: unit * settings.pick.vertexScale * 0.7 })), 0x2b2b2d, true));
  for (const r of h.amber ?? []) mark(r, "amber");
  for (const r of h.red?.refs ?? []) mark(r, "red");
  for (const r of h.temp ?? []) mark(r, "temp");
  for (const r of h.selection) mark(r, "select");
  // a selected arc or circle shows its centre vertex too, so it can be picked to line the curve up with other things (`in_143`)
  for (const r of h.selection) { const p = get(r); if (p && (p.kind === "circle" || (p.kind === "line" && p.center)) && p.center && !h.selection.includes(p.center)) mark(p.center, "hover"); }
  // a selected curved edge of the body shows its middle too, as the curve of a sketch does (`in_209`)
  for (const r of h.selection) { const p = get(r); const c = p && p.kind === "line" && p.origin === "body" ? edgeCentre(s, p) : null; if (c) overlay.add(sphereAt(c, unit * settings.pick.vertexScale * 0.7, 0x2b2b2d, false)); }
  // a selected spline shows the points it passes through, to take hold of and move (`dec_spline_and_cams`)
  for (const r of h.selection) { const p = get(r); const w = p && p.kind === "line" && p.spline && p.movable ? splineWorld(get, p) : null; if (w) for (const q of w.slice(1, -1)) overlay.add(sphereAt(q, unit * settings.pick.vertexScale * 0.9, tealHex, false)); }
  // (a part a hint is about stays in the hint's amber: the hover blue would be drawn over it, and the circle or arc the line is tangent to would not look lit, `in_230`)
  if (h.hover && !h.selection.includes(h.hover) && !(h.amber ?? []).includes(h.hover)) {
    mark(h.hover, "hover");
    const hp = get(h.hover);
    if (hp && hp.kind === "line" && hp.twin && !h.selection.includes(hp.twin)) mark(hp.twin, "hover"); // (the other half of a rim)
  }
  flushBatches();
}
