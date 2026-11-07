// What the scene looks like: drawn lines, corners and circles in ink, translucent faces, and the body (a grey physical material with a thin outline where faces meet at a sharp angle).
import * as THREE from "three";
import type { Scene, Ref } from "../../interaction/api.ts";
import { outlineOf, lookup, settings, consumed } from "../../interaction/api.ts";
import { surfaceTriangles } from "../../interaction/surfaces.ts";
import type { Pen } from "./pen.ts";
import { clearGroup, trisMesh, ringOf, rgb } from "./pen.ts";
import { cornerEdges } from "./edges.ts";

/** How a face's points move (`in_217`, `in_218`): all by the same step, or out from (in towards) an axis by `dr`. */
export type Shift =
  | { by: [number, number, number] }
  | { center: readonly number[]; axis: readonly number[]; dr: number; r0: number }
  /** the points that stand over moved corners of a sketch (in a line along `axis` through the corner) move with them (`in_219`) */
  | { axis: readonly number[]; items: { at: readonly number[]; by: readonly number[] }[] }
  /** the points are scaled by `k` across a line (a fillet or chamfer of another size is the same cross-section, scaled about the sharp edge, `in_220`) */
  | { point: readonly number[]; dir: readonly number[]; k: number };

export interface BodyMesh { vertices: Float32Array; normals: Float32Array; triangles: Uint32Array }

/** Every straight line and circle of the scene, whatever its origin, as flat pairs of points: the one list that all the lines are drawn from. */
function linePairs(s: Scene, skip: Set<Ref>): number[] {
  const get = lookup(s);
  const out: number[] = [];
  for (const p of Object.values(s.parts)) {
    if (skip.has(p.ref) || p.origin === "world" || p.origin === "body") continue; // the world is drawn by ui/world.ts; the body's lines come from its mesh
    const o = outlineOf(get, p);
    if (o.shape === "segment") out.push(...o.a, ...o.b);
    else if (o.shape === "polyline") for (let i = 0; i + 1 < o.pts.length; i++) out.push(...o.pts[i]!, ...o.pts[i + 1]!); // a drawn arc: the same black line as the others
    else if (o.shape === "circle") {
      const ring = ringOf(o.center, o.radius, o.normal);
      for (let i = 0; i + 5 < ring.length; i += 3) out.push(ring[i]!, ring[i + 1]!, ring[i + 2]!, ring[i + 3]!, ring[i + 4]!, ring[i + 5]!);
    }
  }
  return out;
}

/**
 * One look for every line (`in_115`): drawn lines and the body's outline are the same thin charcoal line, from the same material. Corners are not dotted anywhere:
 * a corner shows as a ball when you point at it or pick it, whatever it belongs to.
 */
export function buildContent(content: THREE.Group, s: Scene, mesh: BodyMesh | null, pen: Pen, envMap: THREE.Texture): { material: THREE.MeshPhysicalMaterial; body: THREE.Group; shift: (keys: Set<string> | null, how: Shift) => void } | null {
  clearGroup(content);
  pen.reset();
  const get = lookup(s);
  const used = consumed(s);
  const edge = new THREE.LineBasicMaterial({ color: settings.theme.bodyEdge });
  const pairs = linePairs(s, used);
  if (pairs.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pairs, 3));
    content.add(new THREE.LineSegments(g, edge));
  }
  for (const p of Object.values(s.parts)) {
    if (p.kind !== "face" || p.origin !== "drawn" || used.has(p.ref)) continue;
    const tris = surfaceTriangles(get, p);
    if (tris) {
      // a closed sketch has no thickness: it is not a grey surface like a body's face, only a faint see-through tint that lights up teal when the pointer is over it (`in_194`)
      const m = trisMesh(tris, new THREE.MeshBasicMaterial({ color: rgb(settings.theme.sheet), transparent: true, opacity: settings.theme.sketchFillOpacity, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
      content.add(m);
    }
  }
  if (!mesh) return null;
  const body = new THREE.Group(); // (the body on its own, so a matrix can move it on the graphics card, `in_216`)
  body.matrixAutoUpdate = false;
  content.add(body);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(mesh.vertices, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(mesh.normals, 3));
  g.setIndex(new THREE.BufferAttribute(mesh.triangles, 1));
  const corners = cornerEdges(mesh.vertices, mesh.normals, mesh.triangles, settings.extrude.edgeAngleDeg); // where the surface turns by more than 30 degrees
  let edgePos: THREE.BufferAttribute | null = null;
  const edgeOrig = Float32Array.from(corners);
  if (corners.length) {
    const eg = new THREE.BufferGeometry();
    edgePos = new THREE.Float32BufferAttribute(Float32Array.from(corners), 3);
    eg.setAttribute("position", edgePos);
    body.add(new THREE.LineSegments(eg, edge));
  }
  const material = new THREE.MeshPhysicalMaterial({ color: settings.theme.bodyColor, roughness: settings.light.roughness, metalness: 0, clearcoat: settings.light.sheen, clearcoatRoughness: settings.light.sheenRoughness, envMap, envMapIntensity: settings.light.reflect, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  body.add(new THREE.Mesh(g, material));
  // A face pulled or pushed along its normal, drawn at once without the kernel (`in_217`): every point of the surface (and of its outline) that lies where the face's points are moves by `by`; the walls beside it
  // stretch, as a prism's do. With `keys` null everything goes back. The mesh the kernel gave is not changed: the moved points live in a copy.
  const orig = mesh.vertices;
  let live: THREE.BufferAttribute | null = null;
  const at = (a: ArrayLike<number>, i: number) => `${Math.round(a[i]! * 1e3)},${Math.round(a[i + 1]! * 1e3)},${Math.round(a[i + 2]! * 1e3)}`;
  let seen: Set<string> | null = null;
  let vertexHits: Uint8Array = new Uint8Array(0);
  let edgeHits: Uint8Array = new Uint8Array(0);
  const hitsOf = (keys: Set<string>, from: ArrayLike<number>): Uint8Array => { const h = new Uint8Array(from.length / 3); for (let i = 0; i < h.length; i++) h[i] = keys.has(at(from, 3 * i)) ? 1 : 0; return h; };
  const shift = (keys: Set<string> | null, how: Shift) => {
    if (!live) { if (!keys) return; live = new THREE.BufferAttribute(Float32Array.from(orig), 3); g.setAttribute("position", live); }
    if (keys && keys !== seen) { seen = keys; vertexHits = hitsOf(keys, orig); edgeHits = hitsOf(keys, edgeOrig); } // (found once for the face, not on every move)
    const move = (target: Float32Array, from: ArrayLike<number>, hits: Uint8Array) => {
      for (let i = 0; i < hits.length; i++) {
        let [dx, dy, dz] = [0, 0, 0];
        if (keys && "items" in how) {
          const [ax, ay, az] = [how.axis[0]!, how.axis[1]!, how.axis[2]!];
          const [x, y, z] = [from[3 * i]!, from[3 * i + 1]!, from[3 * i + 2]!];
          const k = x * ax + y * ay + z * az;
          for (const it of how.items) {
            const k0 = it.at[0]! * ax + it.at[1]! * ay + it.at[2]! * az;
            if (Math.hypot(x - k * ax - (it.at[0]! - k0 * ax), y - k * ay - (it.at[1]! - k0 * ay), z - k * az - (it.at[2]! - k0 * az)) < 2e-3) { [dx, dy, dz] = [it.by[0]!, it.by[1]!, it.by[2]!]; break; }
          }
        } else if (keys && hits[i]) {
          if ("by" in how) [dx, dy, dz] = how.by;
          else if ("k" in how) {
            const [px, py, pz] = [from[3 * i]! - how.point[0]!, from[3 * i + 1]! - how.point[1]!, from[3 * i + 2]! - how.point[2]!];
            const along = px * how.dir[0]! + py * how.dir[1]! + pz * how.dir[2]!;
            [dx, dy, dz] = [(how.k - 1) * (px - along * how.dir[0]!), (how.k - 1) * (py - along * how.dir[1]!), (how.k - 1) * (pz - along * how.dir[2]!)];
          }
          else if ("center" in how) {
            // out from the axis (a round wall made wider): the way from the axis to the point, across it
            const [px, py, pz] = [from[3 * i]! - how.center[0]!, from[3 * i + 1]! - how.center[1]!, from[3 * i + 2]! - how.center[2]!];
            const along = px * how.axis[0]! + py * how.axis[1]! + pz * how.axis[2]!;
            const [rx, ry, rz] = [px - along * how.axis[0]!, py - along * how.axis[1]!, pz - along * how.axis[2]!];
            const len = Math.hypot(rx, ry, rz) || 1;
            [dx, dy, dz] = [(rx / len) * how.dr, (ry / len) * how.dr, (rz / len) * how.dr];
          }
        }
        target[3 * i] = from[3 * i]! + dx; target[3 * i + 1] = from[3 * i + 1]! + dy; target[3 * i + 2] = from[3 * i + 2]! + dz;
      }
    };
    if (!keys) { vertexHits = new Uint8Array(orig.length / 3); edgeHits = new Uint8Array(edgeOrig.length / 3); seen = null; }
    move(live.array as Float32Array, orig, vertexHits);
    live.needsUpdate = true;
    if (edgePos) { move(edgePos.array as Float32Array, edgeOrig, edgeHits); edgePos.needsUpdate = true; }
  };
  return { material, body, shift };
}
