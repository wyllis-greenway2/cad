// The highlight (`in_073` to `in_075`): a thin ring on the surface under the pointer, the teal that spreads over a clicked surface from where it was clicked, teal lines and
// balls for picked lines and corners, amber for what a relation ties the selection to.
import * as THREE from "three";
import type { Scene, Ref, Vec3 } from "../../interaction/api.ts";
import { outlineOf, lookup, settings, normalOfPlane } from "../../interaction/api.ts";
import type { Camera } from "../../interaction/camera.ts";
import { surfaceTriangles } from "../../interaction/surfaces.ts";
import { hoverOrb, selectOrb, fullOrb, orbMaterial, selectedLook } from "../orb.ts";
import type { Pen } from "./pen.ts";
import { clearGroup, trisMesh, ringOf, sphereAt, rgb } from "./pen.ts";

export interface Highlight {
  hover: Ref | undefined;
  /** the point under the pointer on the hovered surface, for the ring */
  hoverPoint: Vec3 | null;
  selection: readonly Ref[];
  /** the parts a focused relation ties the selection to */
  amber?: readonly Ref[];
  /** what a refused change would have broken: mild red, fading */
  red?: { refs: readonly Ref[]; alpha: number };
  /** the last selected surface spreads its colour from where it was clicked */
  spread: { ref: Ref; point: Vec3; startMs: number } | null;
}
type Kind = "select" | "hover" | "amber" | "red";

const AXIS_LEN = 30; // the world axes are lines too: pointing at one highlights it to that length
const AMBER = 0xf2c14e;
const RED = 0xe46a6a;
const teal = settings.orb.color;
const ringRgb = selectedLook(teal, settings.orb.selectOpacity, [0.8, 0.8, 0.82]);
const tealHex = rgb(teal).getHex();
export const TEAL = tealHex;

/** The triangles a part is made of for a fill (a surface, or the whole body), or null for a line or a corner. */
function fillTriangles(s: Scene, ref: Ref, kind: Kind, body: { vertices: Float32Array; triangles: Uint32Array } | null): number[] | null {
  const p = s.parts[ref];
  if (!p) return null;
  if (p.origin === "world" && kind === "select") return null; // a world plane is never filled blue when picked (`in_116`); the hover ring still shows
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
    hoverOrb.uOrbRingA.value = settings.orb.ringOpacity;
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

/** Rebuild the highlight group: amber first, then the selection, then what the pointer is over (unless it is selected). */
export function buildHighlight(overlay: THREE.Group, s: Scene | null, body: { vertices: Float32Array; triangles: Uint32Array } | null, h: Highlight, cam: Camera, pen: Pen, nowMs: number) {
  clearGroup(overlay);
  if (!s) return;
  const get = lookup(s);
  const unit = cam.distance;
  const mark = (ref: Ref, kind: Kind) => {
    const p = get(ref);
    if (!p) return;
    if (kind === "hover" && p.kind === "plane" && p.origin === "world") {
      // an infinite world plane has nothing to fill: the ring alone, drawn as a plain thin circle so it cannot smear over a plane seen at a shallow angle
      if (h.hoverPoint) overlay.add(pen.line(ringOf(h.hoverPoint, settings.orb.radius * unit, normalOfPlane(p)), rgb(ringRgb).getHex(), settings.orb.ringPx + 0.6, false));
      return;
    }
    const tris = kind === "amber" || kind === "red" ? null : fillTriangles(s, ref, kind, body);
    if (!tris && p.origin === "world" && p.kind === "plane") return; // nothing to draw for a picked world plane
    if (tris) return void overlay.add(surfaceOrb(kind, ref, tris, h, unit, nowMs));
    const o = outlineOf(get, p);
    const w = kind === "select" ? settings.pick.edgeWidthPx : settings.pick.edgeHoverWidthPx;
    const col = kind === "amber" ? AMBER : kind === "red" ? RED : tealHex;
    const alpha = kind === "red" ? h.red?.alpha ?? 1 : 1;
    const fade = <T extends THREE.Object3D>(m: T): T => { if (alpha < 1) m.traverse((c) => { const mat = (c as THREE.Mesh).material as THREE.Material | undefined; if (mat) { mat.transparent = true; mat.opacity = alpha; } }); return m; };
    if (o.shape === "point") overlay.add(fade(sphereAt(o.at, unit * settings.pick.vertexScale * (kind === "select" ? settings.pick.vertexSelectScale : 1), col, true)));
    else if (o.shape === "polyline") overlay.add(fade(pen.line(o.pts.flat(), col, kind === "red" ? 3.4 : w, true)));
    else if (o.shape === "segment") overlay.add(fade(pen.line([...o.a, ...o.b], col, kind === "red" ? 3.4 : w, true)));
    else if (o.shape === "circle") overlay.add(fade(pen.line(ringOf(o.center, o.radius, o.normal), col, kind === "red" ? 3.4 : w, true)));
    else if (p.kind === "axis") overlay.add(pen.line([...p.at, ...[0, 1, 2].map((i) => p.at[i]! + p.dir[i]! * AXIS_LEN)], col, w, false));
  };
  for (const r of h.amber ?? []) mark(r, "amber");
  for (const r of h.red?.refs ?? []) mark(r, "red");
  for (const r of h.selection) mark(r, "select");
  if (h.hover && !h.selection.includes(h.hover)) mark(h.hover, "hover");
}
